import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Viewer } from "@/domain/viewer";
import type { DbOrTx } from "@/repositories/document-counters";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { withTransaction } from "@/lib/db-transaction";
import { log } from "@/lib/log";
import { getObjectStorage, type ObjectStorage } from "@/lib/gcp/storage";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { project, projectMany } from "@/domain/permissions/project";
import { getSettingValue } from "@/domain/settings/registry";
import { EVIDENCE_MAX_SIZE_MB } from "@/domain/settings/keys";
import { loadActionLogGate, recordActionInTx } from "@/domain/approvals/tx-log";
import { canSeeExpense, EXPENSE_DOCUMENT_KIND, ExpenseConflictError, ExpenseNotFoundError } from "@/domain/expenses";
import { EVIDENCE_FILE_DTO_SPEC, type EvidenceFileDto } from "@/domain/evidence/dto";
import { checkEvidenceUpload, EVIDENCE_UPLOAD_FAILED, type EvidenceDuplicate } from "@/domain/evidence/upload-checks";
import { findExpenseApprovalStatus, findExpenseById, lockExpenseForUpdate } from "@/repositories/expenses";
import { findActiveBySha, findFileById, insertFile, listActiveByOwner, markRemoved, type FileRow } from "@/repositories/files";
import { completeIntentIfOpen, findIntentById, insertIntent } from "@/repositories/upload-intents";

export type { EvidenceFileDto } from "@/domain/evidence/dto";

// 05-04(EVID-01): 증빙 업로드 경로 — 선언(requestEvidenceUpload) → 브라우저가 서명된 PUT 주소로 저장소에 직접 올림 →
// 완료 통보(completeEvidenceUpload)가 메타데이터를 다시 확인하고 `incoming/{의도 id}` → `evidence/{파일 id}`로 옮긴 뒤에만
// 파일 행을 만든다. 객체 키는 이 파일만 만든다. 저장소 호출(메타데이터 · 옮기기 · 보존 표식 · 삭제)은 트랜잭션 밖에서만 한다.
// 잠금 순서: 증빙 추가 · 삭제는 지출결의 행(lockExpenseForUpdate)만 잡는다 — 제출(프로젝트 → 지출결의 → 카운터)과 같은
// 쌍을 거꾸로 잡는 경로가 없다. 05-09가 이 잠금 아래에 제출 뒤 규칙(마지막이 아닌 파일 삭제 · bumpInstanceVersion)을 더한다.

const MB = 1024 * 1024;
const INTENT_TTL_MS = 15 * 60 * 1000;
const SIGNED_PUT_EXPIRES_SEC = 900;
const VIEW_URL_EXPIRES_SEC = 300;
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// PC 브라우저가 그리지 못할 수 있는 형식은 내려받기로(리뷰 Round 1 P3-6).
const DOWNLOAD_ONLY_TYPES = new Set(["image/heic", "image/heif"]);

// 선언 단계 검사 실패(크기 · 형식 · 중복) — 문구는 upload-checks 상수 그대로.
export class EvidenceCheckError extends UserFacingError {}

// 완료 통보 거부는 전부 같은 문구 하나 + 서버가 정한 다시 하기 갈래(design-review D3):
// complete = 의도가 열려 있고 메타데이터가 맞았는데 옮기기만 실패(원본이 incoming/에 남음 — 완료 통보만 다시),
// restart = 그 밖 전부(선언부터 다시).
export class EvidenceUploadRefusedError extends UserFacingError {
  constructor(readonly retry: "complete" | "restart") {
    super(EVIDENCE_UPLOAD_FAILED);
  }
}

export type EvidenceDeps = {
  storage?: ObjectStorage;
  now?: Date;
  // 경합 사례용 — 트랜잭션 첫 잠금 직후(lock-race.ts 관례).
  afterLock?: () => Promise<void>;
};

// ── 주인 종류별 판정 ─────────────────────────────────────────────────
// 지금 주인은 지출결의 하나다. Phase 6이 종류를 더할 때 이 표에 한 줄을 더한다.

type OwnerState = { id: string; drafterId: string; number: string | null; status: string | null; updatedAt: Date };

type OwnerRule = {
  load(viewer: Viewer, ownerId: string): Promise<OwnerState | null>;
  lock(viewer: Viewer, ownerId: string, tx: DbOrTx): Promise<OwnerState | null>;
  canSee(viewer: Viewer, owner: OwnerState): Promise<boolean>;
  // 증빙 추가 · 삭제가 열리는 상태 — 이 플랜은 작성 중 · 반려 · 회수(제출 뒤 규칙은 05-09).
  editable(owner: OwnerState): boolean;
  notFound(): UserFacingError;
};

const EXPENSE_EDITABLE_STATUSES = new Set(["rejected", "withdrawn"]);

async function expenseState(viewer: Viewer, ownerId: string, tx?: DbOrTx): Promise<OwnerState | null> {
  const row = tx ? await lockExpenseForUpdate(viewer, ownerId, tx) : await findExpenseById(viewer, ownerId);
  if (!row) return null;
  const status = row.number === null ? null : await findExpenseApprovalStatus(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, documentId: row.id }, tx);
  return { id: row.id, drafterId: row.drafterId, number: row.number, status, updatedAt: row.updatedAt };
}

const OWNER_RULES: Record<string, OwnerRule> = {
  expense: {
    load: (viewer, ownerId) => expenseState(viewer, ownerId),
    lock: (viewer, ownerId, tx) => expenseState(viewer, ownerId, tx),
    canSee: (viewer, owner) => canSeeExpense(viewer, owner),
    editable: (owner) => (owner.number === null && owner.status === null) || (owner.status !== null && EXPENSE_EDITABLE_STATUSES.has(owner.status)),
    notFound: () => new ExpenseNotFoundError(),
  },
};

const OWNER_KINDS = Object.keys(OWNER_RULES) as [string, ...string[]];

function ruleFor(ownerKind: string): OwnerRule | null {
  return Object.hasOwn(OWNER_RULES, ownerKind) ? (OWNER_RULES[ownerKind] ?? null) : null;
}

function storageOf(deps?: EvidenceDeps): ObjectStorage {
  return deps?.storage ?? getObjectStorage();
}

function toDtoSource(row: FileRow): EvidenceFileDto {
  return {
    id: row.id,
    ownerKind: row.ownerKind,
    ownerId: row.ownerId,
    originalName: row.originalName,
    sizeBytes: row.sizeBytes,
    contentType: row.contentType,
    createdAt: row.createdAt,
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
  };
}

// ── 선언 ──────────────────────────────────────────────────────────────

const requestSchema = z
  .object({
    ownerKind: z.enum(OWNER_KINDS),
    ownerId: z.string().uuid(),
    size: z.number().int(),
    contentType: z.string().min(1).max(100),
    sha256: z.string().max(64),
    name: z.string().trim().min(1).max(255),
  })
  .strict();

export type EvidenceUploadRequest = z.input<typeof requestSchema>;

export type EvidenceUploadIntent = { intentId: string; url: string; method: "PUT"; headers: Record<string, string>; expiresAt: Date };

// 트랜잭션 없이: 주인 · 보임 · 기안자 · 상태 → 한도 설정 → 중복(다른 주인이면 그 문서를 볼 수 있을 때만 번호) → 검사 →
// 의도 행(키 incoming/{id} · 만료 15분) → 서명 PUT.
export async function requestEvidenceUpload(viewer: Viewer, raw: EvidenceUploadRequest, deps?: EvidenceDeps): Promise<EvidenceUploadIntent> {
  const input = requestSchema.parse(raw);
  const rule = ruleFor(input.ownerKind);
  const owner = rule ? await rule.load(viewer, input.ownerId) : null;
  if (!rule || !owner || owner.drafterId !== viewer.id || !(await rule.canSee(viewer, owner))) throw rule?.notFound() ?? new ExpenseNotFoundError();
  if (!(await can(viewer, "expenses", "write"))) throw new ForbiddenError("지출결의 작성 권한 없음");
  if (!rule.editable(owner)) throw new ExpenseConflictError(owner.updatedAt);

  const maxBytes = (await getSettingValue(EVIDENCE_MAX_SIZE_MB)) * MB;
  const duplicates: EvidenceDuplicate[] = [];
  for (const file of await findActiveBySha(viewer, input.sha256, [input.ownerKind])) {
    if (file.ownerId === owner.id) {
      duplicates.push({ sameOwner: true, visibleNumber: null });
      continue;
    }
    const other = await rule.load(viewer, file.ownerId);
    const visible = other !== null && other.number !== null && (await rule.canSee(viewer, other));
    duplicates.push({ sameOwner: false, visibleNumber: visible ? other.number : null });
  }
  const check = checkEvidenceUpload(input, { maxBytes, duplicates });
  if (!check.ok) throw new EvidenceCheckError(check.reason);

  const storage = storageOf(deps);
  const now = deps?.now ?? new Date();
  const intentId = randomUUID();
  const objectKey = `incoming/${intentId}`;
  const expiresAt = new Date(now.getTime() + INTENT_TTL_MS);
  await insertIntent(viewer, {
    id: intentId,
    ownerKind: input.ownerKind,
    ownerId: owner.id,
    objectKey,
    declaredSize: input.size,
    declaredContentType: input.contentType,
    declaredSha256: input.sha256,
    originalName: input.name,
    createdBy: viewer.id,
    expiresAt,
  });
  const signed = await storage.createSignedPut(objectKey, {
    contentType: input.contentType,
    maxBytes,
    sha256: input.sha256,
    expiresSec: SIGNED_PUT_EXPIRES_SEC,
  });
  return { intentId, url: signed.url, method: signed.method, headers: signed.headers, expiresAt };
}

// ── 완료 통보 ─────────────────────────────────────────────────────────

type MetadataMismatch = "size" | "content_type" | "sha256";

export async function completeEvidenceUpload(
  viewer: Viewer,
  input: { intentId: string },
  deps?: EvidenceDeps,
): Promise<Partial<EvidenceFileDto> & { id: string }> {
  const storage = storageOf(deps);
  const now = deps?.now ?? new Date();

  // 트랜잭션 전: 의도 · 메타데이터 재확인 · 옮기기 · 로그 켜짐 판정.
  const intent = UUID_SHAPE.test(input.intentId) ? await findIntentById(viewer, input.intentId) : null;
  const rule = intent ? ruleFor(intent.ownerKind) : null;
  if (!intent || !rule || intent.createdBy !== viewer.id || intent.completedAt !== null || intent.expiresAt.getTime() <= now.getTime()) {
    throw new EvidenceUploadRefusedError("restart");
  }
  const metadata = await storage.getMetadata(intent.objectKey);
  if (!metadata) throw new EvidenceUploadRefusedError("restart");
  const mismatch: MetadataMismatch | null =
    metadata.size !== intent.declaredSize
      ? "size"
      : metadata.contentType !== intent.declaredContentType
        ? "content_type"
        : metadata.sha256 !== intent.declaredSha256
          ? "sha256"
          : null;
  if (mismatch) {
    log.warn("evidence.upload_metadata_mismatch", { intentId: intent.id, ownerKind: intent.ownerKind, ownerId: intent.ownerId, reason: mismatch });
    await storage.delete(intent.objectKey);
    throw new EvidenceUploadRefusedError("restart");
  }

  // 파일 id가 호출마다 새것이라 같은 의도를 두 번 완료해도 아래 보상 삭제가 먼저 붙은 객체를 지우지 않는다.
  const fileId = randomUUID();
  const objectKey = `evidence/${fileId}`;
  try {
    await storage.move(intent.objectKey, objectKey);
  } catch {
    throw new EvidenceUploadRefusedError("complete");
  }
  const gate = await loadActionLogGate();

  let row: FileRow;
  try {
    row = await withTransaction(async (tx) => {
      const owner = await rule.lock(viewer, intent.ownerId, tx);
      await deps?.afterLock?.();
      if (!owner || !rule.editable(owner)) throw new EvidenceUploadRefusedError("restart");
      const completed = await completeIntentIfOpen(viewer, { id: intent.id, createdBy: viewer.id, now }, tx);
      if (!completed) throw new EvidenceUploadRefusedError("restart");
      const inserted = await insertFile(
        viewer,
        {
          id: fileId,
          ownerKind: intent.ownerKind,
          ownerId: intent.ownerId,
          objectKey,
          sha256: intent.declaredSha256,
          sizeBytes: intent.declaredSize,
          contentType: intent.declaredContentType,
          originalName: intent.originalName,
          uploadedBy: viewer.id,
        },
        tx,
      );
      await recordActionInTx(
        viewer,
        { actionType: "document_update", entity: "file", entityId: fileId, documentId: intent.ownerId, detail: { change: "evidence_add", fileId } },
        tx,
        gate,
      );
      return inserted;
    });
  } catch (error) {
    // 옮긴 객체를 지운 뒤 원래 거부를 올린다 — 이 삭제가 실패하면 남은 객체는 Phase 6 F8 고아 정리 대상.
    await storage.delete(objectKey).catch(() => undefined);
    throw error;
  }

  try {
    await storage.retain(objectKey);
  } catch (error) {
    log.warn("evidence.retain_failed", { fileId, reason: error instanceof Error ? error.name : "unknown" });
  }
  return { ...(await project(viewer, toDtoSource(row), EVIDENCE_FILE_DTO_SPEC)), id: row.id };
}

// ── 삭제 ──────────────────────────────────────────────────────────────

// 같은 파일을 두 탭에서 지우면 결과가 같으므로 둘째는 쓰기 · 로그 없이 성공으로 끝난다. 저장소 객체는 지우지 않는다
// (고아 정리는 Phase 6 F8 — removed_at이 그 쿼리의 재료).
export async function removeEvidence(viewer: Viewer, input: { fileId: string }, deps?: EvidenceDeps): Promise<void> {
  const file = UUID_SHAPE.test(input.fileId) ? await findFileById(viewer, input.fileId) : null;
  const rule = file ? ruleFor(file.ownerKind) : null;
  const owner = file && rule ? await rule.load(viewer, file.ownerId) : null;
  if (!file || !rule || !owner || owner.drafterId !== viewer.id) throw rule?.notFound() ?? new ExpenseNotFoundError();
  if (!(await can(viewer, "expenses", "write"))) throw new ForbiddenError("지출결의 작성 권한 없음");
  if (file.removedAt !== null) return;
  if (!rule.editable(owner)) throw new ExpenseConflictError(owner.updatedAt);
  const gate = await loadActionLogGate();

  await withTransaction(async (tx) => {
    const locked = await rule.lock(viewer, file.ownerId, tx);
    await deps?.afterLock?.();
    if (!locked) throw rule.notFound();
    if (!rule.editable(locked)) throw new ExpenseConflictError(locked.updatedAt);
    const current = await findFileById(viewer, file.id, tx);
    if (!current || current.removedAt !== null) return;
    await markRemoved(viewer, { id: file.id, removedBy: viewer.id }, tx);
    await recordActionInTx(
      viewer,
      { actionType: "document_update", entity: "file", entityId: file.id, documentId: file.ownerId, detail: { change: "evidence_remove", fileId: file.id } },
      tx,
      gate,
    );
  });
}

// ── 읽기 ──────────────────────────────────────────────────────────────

// 보기 주소(서명 GET, 5분) — 주인 문서를 볼 수 없으면 null(→ 404). 주소는 저장하지 않는다.
export async function createEvidenceViewUrl(viewer: Viewer, input: { fileId: string }, deps?: EvidenceDeps): Promise<{ url: string } | null> {
  const file = UUID_SHAPE.test(input.fileId) ? await findFileById(viewer, input.fileId) : null;
  const rule = file ? ruleFor(file.ownerKind) : null;
  if (!file || !rule || file.removedAt !== null) return null;
  const owner = await rule.load(viewer, file.ownerId);
  if (!owner || !(await rule.canSee(viewer, owner))) return null;
  return storageOf(deps).createSignedGet(file.objectKey, {
    expiresSec: VIEW_URL_EXPIRES_SEC,
    filename: file.originalName,
    disposition: DOWNLOAD_ONLY_TYPES.has(file.contentType) ? "attachment" : "inline",
  });
}

// 주인 문서를 볼 수 있는 사람에게만 — 삭제되지 않은 파일(무효 포함) 올린 순.
export async function listEvidence(viewer: Viewer, input: { ownerKind: string; ownerId: string }): Promise<Partial<EvidenceFileDto>[]> {
  const rule = ruleFor(input.ownerKind);
  if (!rule || !UUID_SHAPE.test(input.ownerId)) return [];
  const owner = await rule.load(viewer, input.ownerId);
  if (!owner || !(await rule.canSee(viewer, owner))) return [];
  const rows = await listActiveByOwner(viewer, input.ownerKind, input.ownerId);
  return projectMany(viewer, rows.map(toDtoSource), EVIDENCE_FILE_DTO_SPEC);
}
