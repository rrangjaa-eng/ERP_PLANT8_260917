import type { Viewer } from "@/domain/viewer";
import type { DbOrTx } from "@/repositories/document-counters";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { denyWrite } from "@/domain/rules/deny-write";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { ForbiddenError } from "@/domain/revenue";
import { projectRowScope } from "@/domain/projects/visibility";
import { findProjectInScope } from "@/repositories/projects";
import { findRevenueEntryById, listLiveIssueEntryIds, lockRevenueEntryForUpdate, type RevenueEntryRow } from "@/repositories/revenue-entries";
import { listAliveByOwners, markOwnerFilesRemoved } from "@/repositories/files";

// ── 매출 발행 줄 계산서 파일 주인(07-22 · W7 · SC-20) ──────────────────────────────────────────────────────────
// 05 domain/evidence의 주인 표 `revenue_entry` 줄이 부른다(이 파일은 evidence 도메인을 import하지 않는다 — 순환). 읽기 = 매출 줄 보기
// (프로젝트 행 범위 ∧ revenue.issued_amount) ∧ 발행 줄, 쓰기 = 읽기 ∧ projects.revenue 쓰기 ∧ 줄 보관 아님. 한 자리 — 붙이면 이전 살아 있는
// 파일을 같은 트랜잭션에서 지운다(beforeAdd).

export const REVENUE_INVOICE_KIND = "revenue_entry";

const REVENUE_MENU = "projects.revenue";
const ISSUED_ITEM = "revenue.issued_amount";
const FORBIDDEN_RULE = "revenue.invoice_file.forbidden";
const ENTRY_NOT_FOUND = "줄을 찾을 수 없음 · 새로 고침";
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type InvoiceFileOwner = {
  id: string;
  drafterId: "";
  number: null;
  status: "open" | "closed";
  updatedAt: Date;
  version: number;
  projectId: string;
  instance: null;
  closed: false;
  projectCompleted: false;
  kind: RevenueEntryRow["kind"];
};

function toOwner(row: RevenueEntryRow): InvoiceFileOwner {
  return {
    id: row.id,
    drafterId: "",
    number: null,
    status: row.archivedAt === null ? "open" : "closed",
    updatedAt: row.updatedAt,
    version: 0,
    projectId: row.projectId,
    instance: null,
    closed: false,
    projectCompleted: false,
    kind: row.kind,
  };
}

// tx가 없으면 풀 읽기, 있으면 매출 줄 한 행을 잠근다(같은 줄의 교체 두 건이 차례로 — 살아 있는 파일 하나).
export async function invoiceFileOwner(viewer: Viewer, entryId: string, tx?: DbOrTx): Promise<InvoiceFileOwner | null> {
  if (!UUID_SHAPE.test(entryId)) return null;
  const row = tx ? await lockRevenueEntryForUpdate(viewer, entryId, tx) : await findRevenueEntryById(viewer, entryId);
  return row ? toOwner(row) : null;
}

// 읽기 사실(트랜잭션 밖 풀 읽기) — 프로젝트 행 범위 · 발행 금액 보임.
async function canReadProjectInvoices(viewer: Viewer, projectId: string): Promise<boolean> {
  const [scope, issuedVisible] = await Promise.all([projectRowScope(viewer), visible(viewer, ISSUED_ITEM)]);
  if (!issuedVisible || scope.rows === "none") return false;
  const project = await findProjectInScope(viewer, scope, projectId);
  return project !== null && (project.archivedAt === null || scope.includeArchived);
}

export async function invoiceFileRights(viewer: Viewer, owner: InvoiceFileOwner): Promise<{ read: boolean; write: boolean }> {
  if (owner.kind !== "issue") return { read: false, write: false };
  const [read, canWrite] = await Promise.all([canReadProjectInvoices(viewer, owner.projectId), can(viewer, REVENUE_MENU, "write")]);
  return { read, write: read && canWrite && invoiceFileWriteOpen(owner) };
}

export function invoiceFileWriteOpen(owner: InvoiceFileOwner): boolean {
  return owner.kind === "issue" && owner.status === "open";
}

export function invoiceFileNotFound(): UserFacingError {
  return new UserFacingError(ENTRY_NOT_FOUND);
}

export function denyInvoiceFileWrite(viewer: Viewer, owner: InvoiceFileOwner): never {
  return denyWrite(viewer, FORBIDDEN_RULE, { projectId: owner.projectId, entryIds: [owner.id] }, new ForbiddenError("발행·입금 줄 저장 권한 없음"));
}

// 한 자리 교체 — 잠근 줄의 살아 있는 파일을 새 파일을 넣기 직전에 지운다(같은 트랜잭션 · 지운 사람 = 올린 사람).
export async function replaceInvoiceFile(viewer: Viewer, owner: InvoiceFileOwner, tx: DbOrTx): Promise<void> {
  await markOwnerFilesRemoved(viewer, { ownerKind: REVENUE_INVOICE_KIND, ownerId: owner.id, removedBy: viewer.id, at: new Date() }, tx);
}

export type InvoiceFileLink = { fileId: string; name: string };

// 매출 면 발행 줄의 `계산서 1` 링크 재료 — 줄 id → 살아 있는 파일. 발행 줄을 볼 수 없으면 빈 객체.
export async function listInvoiceFiles(viewer: Viewer, projectId: string): Promise<Record<string, InvoiceFileLink>> {
  if (!UUID_SHAPE.test(projectId) || !(await canReadProjectInvoices(viewer, projectId))) return {};
  const entryIds = await listLiveIssueEntryIds(viewer, projectId);
  const links: Record<string, InvoiceFileLink> = {};
  // 올린 순 — 같은 줄에 둘이 남는 일은 없지만(교체) 있으면 마지막 것.
  for (const file of await listAliveByOwners(viewer, { ownerKind: REVENUE_INVOICE_KIND, ownerIds: entryIds })) {
    links[file.ownerId] = { fileId: file.id, name: file.originalName };
  }
  return links;
}
