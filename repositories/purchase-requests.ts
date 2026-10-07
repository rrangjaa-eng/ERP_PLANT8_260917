import { and, desc, eq, gte, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { corpCardUsages, projects, purchaseRequests, quoteLines, quoteRevisions, users, vendors } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 06-08(EXP-10): 구매 요청 쓰기 · 목록. 범위는 목록 쿼리의 조건에서 갈린다(리포지토리가 거른다 — domain이 거르지 않는다).
// 트랜잭션 안에서 부르는 함수는 전부 `tx: DbOrTx`를 받는다(06-03 tx 규약 · CROSS E-2).

export type PurchaseRequestRow = InferSelectModel<typeof purchaseRequests>;
export type PurchaseRequestInsert = Omit<
  InferInsertModel<typeof purchaseRequests>,
  | "id"
  | "version"
  | "source"
  | "createdAt"
  | "completedBy"
  | "completedAt"
  | "cancelledBy"
  | "cancelledAt"
  | "cancelReason"
  | "status"
>;

export async function insertPurchaseRequest(viewer: Viewer, values: PurchaseRequestInsert, tx: DbOrTx): Promise<PurchaseRequestRow> {
  void viewer;
  const [row] = await tx.insert(purchaseRequests).values({ ...values, status: "requested" }).returning();
  if (!row) throw new Error("구매 요청 INSERT 결과 없음");
  return row;
}

export type LockedLineFacts = { projectNumber: string; vendorName: string | null };

// 잠근 줄의 프로젝트 번호 · 거래처 이름 — 번호 매기기와 문 판정이 잠근 뒤 같은 tx로 읽는다.
export async function readLockedLineFacts(viewer: Viewer, lineId: string, tx: DbOrTx): Promise<LockedLineFacts | null> {
  void viewer;
  const [row] = await tx
    .select({ projectNumber: projects.number, vendorName: vendors.name })
    .from(quoteLines)
    .innerJoin(quoteRevisions, eq(quoteRevisions.id, quoteLines.revisionId))
    .innerJoin(projects, eq(projects.id, quoteRevisions.projectId))
    .leftJoin(vendors, eq(vendors.id, quoteLines.vendorId))
    .where(eq(quoteLines.id, lineId));
  return row ?? null;
}

/** 목록 범위 — 전부(구매 권한자 · 전사 범위) 또는 요청자 본인 + 자기가 담당 PM인 프로젝트 줄의 요청. */
export type PurchaseRequestScope = { kind: "all" } | { kind: "own"; userId: string };

export type PurchaseRequestFilter = {
  status?: "requested" | "purchased" | "cancelled";
  /** 요청일 범위 — 서울 월 첫날 0시(포함) · 다음 달 첫날 0시(제외). */
  from?: Date;
  to?: Date;
};

export type PurchaseRequestListRow = PurchaseRequestRow & {
  requestedByName: string;
  /** 06-14 취소한 사람 이름 — 취소 행 2행 `취소 {MM-DD} · {사람}`. 취소 아니면 null. */
  cancelledByName: string | null;
  projectName: string | null;
  lineItemName: string | null;
  lineRevisionId: string | null;
  /** 06-12 구매 완료 건의 카드 사용(사용일 · 결제 합계) — 구매 완료 행 2행. 아니면 null. */
  usageUsedOn: string | null;
  usageTotalKrw: number | null;
};

function scopeCondition(scope: PurchaseRequestScope): SQL | undefined {
  if (scope.kind === "all") return undefined;
  return or(eq(purchaseRequests.requestedBy, scope.userId), eq(projects.pmUserId, scope.userId));
}

// 최근 요청이 첫 줄(created_at 내림차순).
export async function listPurchaseRequestRows(
  viewer: Viewer,
  input: { scope: PurchaseRequestScope; filter: PurchaseRequestFilter; keepId?: string | null },
  tx: DbOrTx = db,
): Promise<PurchaseRequestListRow[]> {
  void viewer;
  const { filter } = input;
  const conditions: (SQL | undefined)[] = [scopeCondition(input.scope)];
  if (filter.status) conditions.push(eq(purchaseRequests.status, filter.status));
  if (filter.from) conditions.push(gte(purchaseRequests.createdAt, filter.from));
  if (filter.to) conditions.push(lt(purchaseRequests.createdAt, filter.to));
  // 06-12: 방금 구매 완료한 요청은 상태 보기와 무관하게 제자리에 남긴다(제자리 결과 — S13 성공 뒤).
  // 조건이 하나도 없으면(전사 범위 `전체` 보기) 이미 전부 나온다 — `or(undefined, …)`가 그 한 행으로 줄이지 않게 갈래를 타지 않는다(검토 I-1).
  const base = and(...conditions);
  const where = input.keepId && base ? or(base, and(scopeCondition(input.scope), eq(purchaseRequests.id, input.keepId))) : base;

  const cancellers = alias(users, "cancellers");
  const rows = await tx
    .select({
      request: purchaseRequests,
      requestedByName: users.name,
      cancelledByName: cancellers.name,
      projectName: projects.name,
      lineItemName: quoteLines.itemName,
      lineRevisionId: quoteLines.revisionId,
      usageUsedOn: corpCardUsages.usedOn,
      usageTotalKrw: corpCardUsages.totalAmountKrw,
    })
    .from(purchaseRequests)
    .innerJoin(users, eq(users.id, purchaseRequests.requestedBy))
    .leftJoin(cancellers, eq(cancellers.id, purchaseRequests.cancelledBy))
    .leftJoin(projects, eq(projects.id, purchaseRequests.projectId))
    .leftJoin(quoteLines, eq(quoteLines.id, purchaseRequests.quoteLineId))
    .leftJoin(corpCardUsages, and(eq(corpCardUsages.purchaseRequestId, purchaseRequests.id), isNull(corpCardUsages.archivedAt)))
    .where(where)
    .orderBy(desc(purchaseRequests.createdAt), desc(purchaseRequests.id));

  return rows.map((row) => ({
    ...row.request,
    requestedByName: row.requestedByName,
    cancelledByName: row.cancelledByName,
    projectName: row.projectName,
    lineItemName: row.lineItemName,
    lineRevisionId: row.lineRevisionId,
    usageUsedOn: row.usageUsedOn,
    usageTotalKrw: row.usageTotalKrw,
  }));
}

// ── 06-12 구매 완료 ──────────────────────────────────────────────────────────

/** 요청 한 건(잠금 없음) — 구매 완료 사전 조회 · 패널 로드. 트랜잭션 밖에서만. */
export async function findPurchaseRequestById(viewer: Viewer, id: string): Promise<PurchaseRequestRow | null> {
  void viewer;
  const [row] = await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, id)).limit(1);
  return row ?? null;
}

// 요청 행 `FOR UPDATE` — 구매 완료 몸통이 프로젝트 행 · 견적 줄 다음에 잡는다(N-3).
export async function lockPurchaseRequestForUpdate(viewer: Viewer, id: string, tx: DbOrTx): Promise<PurchaseRequestRow | null> {
  void viewer;
  const [row] = await tx.select().from(purchaseRequests).where(eq(purchaseRequests.id, id)).for("update");
  return row ?? null;
}

// 구매 완료 UPDATE — `신청됨` · version 일치일 때만(06-27 `_completed_check`). 바뀌면 새 version, 아니면 null.
export async function markPurchaseRequestPurchased(
  viewer: Viewer,
  input: { id: string; version: number; completedBy: string },
  tx: DbOrTx,
): Promise<number | null> {
  void viewer;
  const [row] = await tx
    .update(purchaseRequests)
    .set({ status: "purchased", completedBy: input.completedBy, completedAt: new Date(), version: sql`${purchaseRequests.version} + 1` })
    .where(and(eq(purchaseRequests.id, input.id), eq(purchaseRequests.version, input.version), eq(purchaseRequests.status, "requested")))
    .returning({ version: purchaseRequests.version });
  return row?.version ?? null;
}

// ── 06-14 취소 · 되돌리기 ────────────────────────────────────────────────────

// 취소 UPDATE — `신청됨` · version 일치일 때만(06-27 `_cancelled_check` — 취소한 사람 · 시각이 함께 선다). 바뀌면 새 version, 아니면 null.
export async function markPurchaseRequestCancelled(
  viewer: Viewer,
  input: { id: string; version: number; cancelledBy: string; reason: string | null },
  tx: DbOrTx,
): Promise<number | null> {
  void viewer;
  const [row] = await tx
    .update(purchaseRequests)
    .set({ status: "cancelled", cancelledBy: input.cancelledBy, cancelledAt: new Date(), cancelReason: input.reason, version: sql`${purchaseRequests.version} + 1` })
    .where(and(eq(purchaseRequests.id, input.id), eq(purchaseRequests.version, input.version), eq(purchaseRequests.status, "requested")))
    .returning({ version: purchaseRequests.version });
  return row?.version ?? null;
}

// 되돌리기 UPDATE — `취소` · version 일치일 때만 `신청됨`으로(취소 칸 셋을 비운다 — `_cancelled_check`). 번호는 그대로.
export async function markPurchaseRequestRequested(viewer: Viewer, input: { id: string; version: number }, tx: DbOrTx): Promise<number | null> {
  void viewer;
  const [row] = await tx
    .update(purchaseRequests)
    .set({ status: "requested", cancelledBy: null, cancelledAt: null, cancelReason: null, version: sql`${purchaseRequests.version} + 1` })
    .where(and(eq(purchaseRequests.id, input.id), eq(purchaseRequests.version, input.version), eq(purchaseRequests.status, "cancelled")))
    .returning({ version: purchaseRequests.version });
  return row?.version ?? null;
}
