import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Viewer } from "@/domain/viewer";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { signatureMatches } from "@/domain/evidence/upload-checks";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { withTransaction } from "@/lib/db-transaction";
import { log } from "@/lib/log";
import { getObjectStorage, type ObjectStorage } from "@/lib/gcp/storage";
import { findFileById, insertFile, listActiveByOwner, markRemoved, markRestored, type FileRow } from "@/repositories/files";
import { completeIntentIfOpen, findIntentById, insertIntent } from "@/repositories/upload-intents";

// 07.2-10 Task 3 (PU3 · D-7225 · DC-6) — 회사 로고. 설정 「회사 정보」 묶음에서 관리자가 올리고, 고객 견적서 머리 logo 자리에 찍힌다.
// 증빙 올리기(domain/evidence)는 쓰지 않는다 — 그쪽은 주인 종류 표(OWNER_RULES · 복구 가능 종류)와 증빙 검사 문구 · 한도를 전제로 한다. 여기는
// 형식 · 크기 검사와 오류 문구(S9)를 직접 갖고, 저장소 서명 · 파일 행 · 업로드 의도 같은 하위 부품만 같은 것을 쓴다. domain/evidence/**는 고치지 않는다.

export const COMPANY_LOGO_OWNER_KIND = "company_logo";
// files.owner_id는 NOT NULL uuid인데 회사 로고는 회사에 하나뿐이라 주인 행이 없다 — 고정 키로 「회사 로고」 한 자리를 가리킨다(외래 키 없음, 07.2 files 주석).
export const COMPANY_LOGO_OWNER_ID = "00000000-0000-4000-8000-0000000c1090";

const MB = 1024 * 1024;
const MAX_BYTES = 2 * MB;
const ALLOWED_TYPES = ["image/png", "image/jpeg"] as const;
const SIGNED_PUT_EXPIRES_SEC = 900;
// 의도는 서명 PUT보다 오래 산다(느린 업로드가 끝난 뒤에도 완료 통보가 열려 있다 — 증빙 올리기와 같은 값).
const INTENT_TTL_MS = (SIGNED_PUT_EXPIRES_SEC + 15 * 60) * 1000;
const VIEW_URL_EXPIRES_SEC = 900;
const SIGNATURE_HEAD_BYTES = 16;
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SETTINGS_MENU = "admin.settings";

export const COMPANY_LOGO_WRONG_TYPE = "형식 오류 · PNG·JPG로 다시";
export const COMPANY_LOGO_UPLOAD_FAILED = "올리지 못함 · 다시 올리기";
export const COMPANY_LOGO_NOT_FOUND = "로고 없음";
export const COMPANY_LOGO_RESTORE_FAILED = "되돌리지 못함 · 다시 올리기";
export const companyLogoTooLarge = (size: number) => `${(size / MB).toFixed(1)}MB · 2MB 초과 · 줄여 다시`;

// 완료 통보 거부: complete = 옮기기만 실패(완료 통보만 다시) · restart = 선언부터 다시.
export class CompanyLogoUploadRefusedError extends UserFacingError {
  constructor(readonly retry: "complete" | "restart") {
    super(COMPANY_LOGO_UPLOAD_FAILED);
  }
}

export type CompanyLogoDeps = { storage?: ObjectStorage; now?: Date };

export type CompanyLogoFile = { id: string; name: string; sizeBytes: number; createdAt: string };
export type CompanyLogoIntent = { intentId: string; url: string; method: "PUT"; headers: Record<string, string>; expiresAt: Date };

const storageOf = (deps?: CompanyLogoDeps): ObjectStorage => deps?.storage ?? getObjectStorage();

const requestSchema = z
  .object({
    size: z.number().int(),
    contentType: z.string().min(1).max(100),
    sha256: z.string().max(64),
    name: z.string().trim().min(1).max(255),
  })
  .strict();

export type CompanyLogoUploadRequest = z.input<typeof requestSchema>;

async function assertWritable(viewer: Viewer): Promise<void> {
  if (!(await can(viewer, SETTINGS_MENU, "write"))) throw new ForbiddenError("회사 정보 설정 쓰기 권한 없음");
}

function toFile(row: FileRow): CompanyLogoFile {
  return { id: row.id, name: row.originalName, sizeBytes: row.sizeBytes, createdAt: row.createdAt.toISOString() };
}

// 올리기 선언 — 크기 → 형식 순(사람은 줄이기 하나만 보면 된다). 선언은 클라이언트 입력이라 완료 통보가 저장소 메타데이터 · 머리 바이트로 다시 본다.
export async function requestCompanyLogoUpload(viewer: Viewer, raw: CompanyLogoUploadRequest, deps?: CompanyLogoDeps): Promise<CompanyLogoIntent> {
  await assertWritable(viewer);
  const input = requestSchema.parse(raw);
  if (input.size < 1 || !/^[0-9a-f]{64}$/.test(input.sha256)) throw new UserFacingError(COMPANY_LOGO_UPLOAD_FAILED);
  if (input.size > MAX_BYTES) throw new UserFacingError(companyLogoTooLarge(input.size));
  if (!(ALLOWED_TYPES as readonly string[]).includes(input.contentType)) throw new UserFacingError(COMPANY_LOGO_WRONG_TYPE);

  const now = deps?.now ?? new Date();
  const intentId = randomUUID();
  const objectKey = `incoming/${intentId}`;
  const expiresAt = new Date(now.getTime() + INTENT_TTL_MS);
  await insertIntent(viewer, {
    id: intentId,
    ownerKind: COMPANY_LOGO_OWNER_KIND,
    ownerId: COMPANY_LOGO_OWNER_ID,
    objectKey,
    declaredSize: input.size,
    declaredContentType: input.contentType,
    declaredSha256: input.sha256,
    originalName: input.name,
    createdBy: viewer.id,
    expiresAt,
  });
  const signed = await storageOf(deps).createSignedPut(objectKey, {
    contentType: input.contentType,
    maxBytes: MAX_BYTES,
    sha256: input.sha256,
    expiresSec: SIGNED_PUT_EXPIRES_SEC,
  });
  return { intentId, url: signed.url, method: signed.method, headers: signed.headers, expiresAt };
}

// 현재 로고를 모두 보관으로 돌린다(바꾸기 · 되돌리기가 같은 tx 안에서 부른다) — 회사 로고는 한 번에 하나만 살아 있다.
async function retireActive(viewer: Viewer, tx: Parameters<typeof markRemoved>[2]): Promise<void> {
  for (const row of await listActiveByOwner(viewer, COMPANY_LOGO_OWNER_KIND, COMPANY_LOGO_OWNER_ID)) {
    await markRemoved(viewer, { id: row.id, removedBy: viewer.id }, tx);
  }
}

// 두 관리자가 동시에 바꾸거나 되돌려도 살아 있는 로고가 둘이 되지 않게 한 자리를 직렬화한다.
const lockLogo = (tx: Parameters<typeof markRemoved>[2]) => tx.execute(sql`select pg_advisory_xact_lock(hashtext('company_logo'))`);

export async function confirmCompanyLogoUpload(viewer: Viewer, input: { intentId: string }, deps?: CompanyLogoDeps): Promise<CompanyLogoFile> {
  await assertWritable(viewer);
  const storage = storageOf(deps);
  const now = deps?.now ?? new Date();

  const intent = UUID_SHAPE.test(input.intentId) ? await findIntentById(viewer, input.intentId) : null;
  if (!intent || intent.ownerKind !== COMPANY_LOGO_OWNER_KIND || intent.createdBy !== viewer.id || intent.completedAt !== null || intent.expiresAt.getTime() <= now.getTime()) {
    throw new CompanyLogoUploadRefusedError("restart");
  }
  const metadata = await storage.getMetadata(intent.objectKey);
  if (!metadata) throw new CompanyLogoUploadRefusedError("restart");
  if (metadata.size !== intent.declaredSize || metadata.contentType !== intent.declaredContentType || metadata.sha256 !== intent.declaredSha256) {
    log.warn("company_logo.upload_metadata_mismatch", { intentId: intent.id });
    await storage.delete(intent.objectKey);
    throw new CompanyLogoUploadRefusedError("restart");
  }
  // 메타데이터가 맞아도 내용이 선언 형식이 아니면(실행 파일을 PNG로) 옮기기 전에 지운다 — 읽은 세대로 고정해 대조한 객체와 옮기는 객체를 같게 한다.
  const pinned = metadata.generation === undefined ? undefined : { generation: metadata.generation };
  if (!signatureMatches(await storage.readHead(intent.objectKey, SIGNATURE_HEAD_BYTES, pinned), intent.declaredContentType)) {
    log.warn("company_logo.upload_signature_mismatch", { intentId: intent.id });
    await storage.delete(intent.objectKey);
    throw new CompanyLogoUploadRefusedError("restart");
  }

  const fileId = randomUUID();
  const objectKey = `evidence/${fileId}`;
  try {
    await storage.move(intent.objectKey, objectKey, pinned ? { ifSourceGeneration: pinned.generation } : undefined);
  } catch {
    throw new CompanyLogoUploadRefusedError("complete");
  }

  let row: FileRow;
  try {
    row = await withTransaction(async (tx) => {
      await lockLogo(tx);
      const completed = await completeIntentIfOpen(viewer, { id: intent.id, createdBy: viewer.id, now }, tx);
      if (!completed) throw new CompanyLogoUploadRefusedError("restart");
      await retireActive(viewer, tx);
      return insertFile(
        viewer,
        {
          id: fileId,
          ownerKind: COMPANY_LOGO_OWNER_KIND,
          ownerId: COMPANY_LOGO_OWNER_ID,
          objectKey,
          sha256: intent.declaredSha256,
          sizeBytes: intent.declaredSize,
          contentType: intent.declaredContentType,
          originalName: intent.originalName,
          uploadedBy: viewer.id,
          privateToOwner: false,
        },
        tx,
      );
    });
  } catch (error) {
    await storage.delete(objectKey).catch(() => undefined);
    throw error;
  }
  try {
    await storage.retain(objectKey);
  } catch (error) {
    log.warn("company_logo.retain_failed", { fileId, reason: error instanceof Error ? error.name : "unknown" });
  }
  return toFile(row);
}

async function loadLogoFile(viewer: Viewer, fileId: string): Promise<FileRow> {
  const file = UUID_SHAPE.test(fileId) ? await findFileById(viewer, fileId) : null;
  if (!file || file.ownerKind !== COMPANY_LOGO_OWNER_KIND) throw new UserFacingError(COMPANY_LOGO_NOT_FOUND);
  return file;
}

// 삭제는 보관일 뿐이다(저장소 객체는 그대로 — 되돌리기가 같은 행을 살린다). 이미 보관된 행은 성공으로 끝난다.
export async function deleteCompanyLogo(viewer: Viewer, input: { fileId: string }): Promise<void> {
  await assertWritable(viewer);
  const file = await loadLogoFile(viewer, input.fileId);
  await withTransaction(async (tx) => {
    await lockLogo(tx);
    await markRemoved(viewer, { id: file.id, removedBy: viewer.id }, tx);
  });
}

// 되돌리기: 지금 로고가 있으면 보관으로 돌리고 그 행을 살린다(마지막으로 지운 로고가 돌아온다). 되살릴 수 없으면 다시 올리기를 안내한다.
export async function restoreCompanyLogo(viewer: Viewer, input: { fileId: string }): Promise<CompanyLogoFile> {
  await assertWritable(viewer);
  const file = await loadLogoFile(viewer, input.fileId);
  return withTransaction(async (tx) => {
    await lockLogo(tx);
    await retireActive(viewer, tx);
    if (!(await markRestored(viewer, { id: file.id, scopeKinds: [COMPANY_LOGO_OWNER_KIND] }, tx))) throw new UserFacingError(COMPANY_LOGO_RESTORE_FAILED);
    return toFile({ ...file, removedAt: null, removedBy: null });
  });
}

async function currentLogo(viewer: Viewer, deps?: CompanyLogoDeps): Promise<{ file: FileRow; url: string } | null> {
  const rows = await listActiveByOwner(viewer, COMPANY_LOGO_OWNER_KIND, COMPANY_LOGO_OWNER_ID);
  const file = rows.at(-1);
  if (!file) return null;
  const signed = await storageOf(deps).createSignedGet(file.objectKey, { expiresSec: VIEW_URL_EXPIRES_SEC, filename: file.originalName, disposition: "inline" });
  return { file, url: signed.url };
}

// 설정 화면: 지금 로고 파일 행 + 미리보기 읽기 주소. 설정 보기 권리가 있어야 한다.
export async function getCompanyLogo(viewer: Viewer, deps?: CompanyLogoDeps): Promise<{ file: CompanyLogoFile | null; url: string | null }> {
  if (!(await can(viewer, SETTINGS_MENU, "view"))) throw new ForbiddenError("회사 정보 설정 보기 권한 없음");
  const current = await currentLogo(viewer, deps);
  return current ? { file: toFile(current.file), url: current.url } : { file: null, url: null };
}

// 고객 견적서 머리 logo 자리 — 호출한 인쇄 화면이 이미 견적서 읽기 권리를 판정했다. 서명이 안 되면(저장소 미설정 등) 로고 없음으로 본다: 인쇄는 회사명 글자로 대신한다.
export async function getCompanyLogoUrl(deps?: CompanyLogoDeps): Promise<string | null> {
  try {
    return (await currentLogo(SYSTEM_VIEWER, deps))?.url ?? null;
  } catch (error) {
    log.warn("company_logo.url_failed", { reason: error instanceof Error ? error.name : "unknown" });
    return null;
  }
}
