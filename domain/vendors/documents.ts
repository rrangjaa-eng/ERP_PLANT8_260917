import type { Viewer } from "@/domain/viewer";
import type { DbOrTx } from "@/repositories/document-counters";
import { can } from "@/domain/permissions/can";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { denyWrite } from "@/domain/rules/deny-write";
import { getSettingValue } from "@/domain/settings/registry";
import { EVIDENCE_MAX_SIZE_MB } from "@/domain/settings/keys";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { findVendorById, findVendorByIdForUpdate, type VendorRow } from "@/repositories/vendors";
import { findVendorDocumentById, listVendorDocumentFiles, replaceOtherVendorDocuments, type VendorDocumentKind, type VendorDocumentRow } from "@/repositories/vendor-details";

// ── 거래처 서류 주인(07-23 · V8 · AQ-34) ──────────────────────────────────────────────────────────────────
// 05 domain/evidence의 주인 표 `vendor_document` 줄이 부른다(이 파일은 evidence 도메인을 import하지 않는다 — 순환 · 07-22 프로젝트 서류와 같은 꼴).
// 파일 하나 = 서류 행 하나(files.owner_id = vendor_documents.id). 사업자등록증 · 통장 사본 각 한 자리 — 새 파일을 넣기 직전(beforeAdd) 같은
// 거래처 · 같은 종류의 이전 서류 행과 그 파일을 같은 트랜잭션에서 뗀다. 보기 · 붙이기 = `vendors.account` 쓰기(통장 사본에 계좌 전체 — D-739 「계좌 · 서류 수정」),
// 그 밖의 거래처 보기 권한자는 개수만. 260907 vendor_documents 표(db/schema/010_tables.sql:5314-5345 — 사업자등록증 · 통장사본 · 신분증, 알맹이는 저장소)와 같은 뜻에
// 종류는 둘(신분증은 이 플랜 범위 밖), 알맹이는 05 증빙 파일 한 벌로 둔다.

export const VENDOR_DOCUMENT_KIND = "vendor_document";
export const VENDOR_DOCUMENT_KINDS = ["registration", "bankbook"] as const satisfies readonly VendorDocumentKind[];

const ACCOUNT_MENU = "vendors.account";
const VENDORS_MENU = "admin.vendors";
const VENDOR_NOT_FOUND = "보관됐거나 존재하지 않는 거래처";
const FORBIDDEN_RULE = "vendor.document.forbidden";
const FORBIDDEN_MESSAGE = "거래처 서류 권한 없음";
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type VendorDocumentOwner = {
  id: string;
  drafterId: "";
  number: null;
  status: "open" | "closed";
  updatedAt: Date;
  version: number;
  projectId: null;
  instance: null;
  closed: false;
  projectCompleted: false;
  vendorId: string;
  kind: VendorDocumentKind;
};

function toOwner(doc: VendorDocumentRow, vendor: VendorRow): VendorDocumentOwner {
  return {
    id: doc.id,
    drafterId: "",
    number: null,
    status: doc.removedAt === null && vendor.archivedAt === null ? "open" : "closed",
    updatedAt: doc.createdAt,
    version: 0,
    projectId: null,
    instance: null,
    closed: false,
    projectCompleted: false,
    vendorId: vendor.id,
    kind: doc.kind,
  };
}

// tx가 없으면 풀 읽기, 있으면 서류 행 → 거래처 행 잠금(같은 거래처의 교체 둘이 차례로 — 종류마다 살아 있는 서류 하나).
export async function vendorDocumentOwner(viewer: Viewer, documentId: string, tx?: DbOrTx): Promise<VendorDocumentOwner | null> {
  if (!UUID_SHAPE.test(documentId)) return null;
  const doc = await findVendorDocumentById(viewer, documentId, tx);
  if (!doc) return null;
  const vendor = tx ? await findVendorByIdForUpdate(viewer, doc.vendorId, tx) : await findVendorById(viewer, doc.vendorId);
  return vendor ? toOwner(doc, vendor) : null;
}

async function canHandleDocuments(viewer: Viewer): Promise<boolean> {
  return can(viewer, ACCOUNT_MENU, "write");
}

export async function vendorDocumentRights(viewer: Viewer, owner: VendorDocumentOwner): Promise<{ read: boolean; write: boolean }> {
  const read = await canHandleDocuments(viewer);
  return { read, write: read && vendorDocumentWriteOpen(owner) };
}

// 잠근 뒤 다시 보는 순수 판정 — 서류 · 거래처가 살아 있다.
export function vendorDocumentWriteOpen(owner: VendorDocumentOwner): boolean {
  return owner.status === "open";
}

export function vendorDocumentNotFound(): UserFacingError {
  return new UserFacingError(VENDOR_NOT_FOUND);
}

export function denyVendorDocumentWrite(viewer: Viewer, vendorId: string): never {
  // 거래처 id는 로그 칸 clientIds(vendors 표 id)에 싣는다 — deny-write가 고른 칸만 남긴다.
  return denyWrite(viewer, FORBIDDEN_RULE, { clientIds: [vendorId] }, new UserFacingError(FORBIDDEN_MESSAGE));
}

// 한 자리 교체 — 잠근 서류의 거래처 · 종류에서 이 서류 밖의 살아 있는 서류와 그 파일을 새 파일을 넣기 직전에 뗀다(지운 사람 = 올린 사람).
export async function replaceVendorDocument(viewer: Viewer, owner: VendorDocumentOwner, tx: DbOrTx): Promise<void> {
  await replaceOtherVendorDocuments(viewer, { keepId: owner.id, vendorId: owner.vendorId, kind: owner.kind, at: new Date() }, tx);
}

// 붙이기 시작 전 판정(document-upload.ts) — 거래처를 못 보거나 보관이면 없는 거래처, 보지만 계좌 · 서류 권한이 없으면 거부.
export async function assertVendorDocumentWritable(viewer: Viewer, vendorId: string): Promise<VendorRow> {
  const vendor = UUID_SHAPE.test(vendorId) && (await can(viewer, VENDORS_MENU, "view")) ? await findVendorById(viewer, vendorId) : null;
  if (!vendor || vendor.archivedAt !== null) throw vendorDocumentNotFound();
  if (!(await canHandleDocuments(viewer))) denyVendorDocumentWrite(viewer, vendor.id);
  return vendor;
}

// ── 목록(수정 패널 `서류`) ─────────────────────────────────────────────

export type VendorDocumentFileDto = { fileId: string; name: string; sizeBytes: number; createdAt: string };

const VENDOR_DOCUMENT_FILE_DTO_SPEC: DtoSpec<VendorDocumentFileDto, VendorDocumentFileDto> = {
  fields: [
    { key: "fileId", from: "fileId", infoItem: "vendor.value" },
    { key: "name", from: "name", infoItem: "vendor.value" },
    { key: "sizeBytes", from: "sizeBytes", infoItem: "vendor.value" },
    { key: "createdAt", from: "createdAt", infoItem: "vendor.value" },
  ],
};

registerDto({ name: "VendorDocumentFileDto", fields: VENDOR_DOCUMENT_FILE_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });

export type VendorDocumentSlot = { kind: VendorDocumentKind; file: Partial<VendorDocumentFileDto> | null };

// 권한자: 두 자리(사업자등록증 · 통장 사본 차례)와 붙이기 한도. 그 밖의 거래처 보기 권한자: 살아 있는 서류 개수만(AQ-34). 거래처를 못 보면 null.
export type VendorDocumentList = { canWrite: true; maxMb: number; slots: VendorDocumentSlot[] } | { canWrite: false; count: number };

export async function listVendorDocuments(viewer: Viewer, vendorId: string): Promise<VendorDocumentList | null> {
  if (!UUID_SHAPE.test(vendorId) || !(await can(viewer, VENDORS_MENU, "view"))) return null;
  const rows = await listVendorDocumentFiles(viewer, vendorId);
  // 같은 종류가 둘 남는 일은 없지만(교체) 있으면 마지막 것이 그 자리 — 개수도 자리 수로 센다.
  const lastByKind = new Map(rows.map((row) => [row.kind, row]));
  if (!(await canHandleDocuments(viewer))) return { canWrite: false, count: lastByKind.size };
  const slots = await Promise.all(
    VENDOR_DOCUMENT_KINDS.map(async (kind): Promise<VendorDocumentSlot> => {
      const row = lastByKind.get(kind);
      if (!row) return { kind, file: null };
      const [file] = await projectMany(
        viewer,
        [{ fileId: row.fileId, name: row.name, sizeBytes: row.sizeBytes, createdAt: row.createdAt.toISOString() }],
        VENDOR_DOCUMENT_FILE_DTO_SPEC,
      );
      return { kind, file: file ?? null };
    }),
  );
  return { canWrite: true, maxMb: await getSettingValue(EVIDENCE_MAX_SIZE_MB), slots };
}
