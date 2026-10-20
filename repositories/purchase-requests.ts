import { and, desc, eq, gte, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
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

// 06.5 D-6509: 중복 방지 키로 찾기 — 취소 행 포함(유일 색인이 모든 행을 덮는다). 같은 행위자인지는 domain이 가른다.
export async function findPurchaseRequestByIdempotencyKey(viewer: Viewer, key: string, tx: DbOrTx = db): Promise<PurchaseRequestRow | null> {
  void viewer;
  const [row] = await tx.select().from(purchaseRequests).where(eq(purchaseRequests.idempotencyKey, key)).limit(1);
  return row ?? null;
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
  /** U1-1 — 완료 프로젝트 줄 요청은 `요청 취소`를 내놓지 않는다. 팀 비용이면 null. */
  projectStatus: string | null;
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

function filterConditions(scope: PurchaseRequestScope, filter: PurchaseRequestFilter): (SQL | undefined)[] {
  const conditions: (SQL | undefined)[] = [scopeCondition(scope)];
  if (filter.status) conditions.push(eq(purchaseRequests.status, filter.status));
  if (filter.from) conditions.push(gte(purchaseRequests.createdAt, filter.from));
  if (filter.to) conditions.push(lt(purchaseRequests.createdAt, filter.to));
  return conditions;
}

// 최근 요청이 첫 줄(created_at 내림차순).
export async function listPurchaseRequestRows(
  viewer: Viewer,
  input: { scope: PurchaseRequestScope; filter: PurchaseRequestFilter; keepId?: string | null },
  tx: DbOrTx = db,
): Promise<PurchaseRequestListRow[]> {
  void viewer;
  const conditions = filterConditions(input.scope, input.filter);
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
      projectStatus: projects.status,
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
    projectStatus: row.projectStatus,
    lineItemName: row.lineItemName,
    lineRevisionId: row.lineRevisionId,
    usageUsedOn: row.usageUsedOn,
    usageTotalKrw: row.usageTotalKrw,
  }));
}

// 06-14 합계 줄 · 열린 건수 — 목록과 같은 범위 · 필터 조건에서 예상 금액(원화 환산)만 읽는다(쪽 · keepId와 무관).
export async function listPurchaseRequestEstimates(
  viewer: Viewer,
  input: { scope: PurchaseRequestScope; filter: PurchaseRequestFilter },
  tx: DbOrTx = db,
): Promise<number[]> {
  void viewer;
  const rows = await tx
    .select({ estimateKrw: purchaseRequests.estimateAmountKrw })
    .from(purchaseRequests)
    .leftJoin(projects, eq(projects.id, purchaseRequests.projectId))
    .where(and(...filterConditions(input.scope, input.filter)));
  return rows.map((row) => row.estimateKrw);
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

// ── 06.1-06 증빙 기록 붙이기 후보 · 보임(RP-5) ─────────────────────────────────────────────

/** 후보 한 질의의 상한 — 21째 행은 넘침 판정에만(지출결의 후보와 같은 값). */
export const PURCHASE_REQUEST_CANDIDATE_LIMIT = 20;

export type PurchaseRequestAttachCandidateRow = {
  id: string;
  number: string;
  itemName: string;
  requestedByName: string;
  status: string;
  estimateAmountKrw: number;
  /** 요청일(서울 날짜). */
  requestedOn: string;
  score: number;
};

// 06 목록과 같은 범위(scopeCondition — listAccess의 scope) ∧ 취소 아님 ∧ 검색어(요청 번호 · 품목 · 요청자 — 바인딩). 종류 · 사업자번호 칸이
// 없어 점수는 기록 합계 ↔ 견적 원화 1뿐이다(PA-CAND). 순서: 점수 내림 → 요청일과 기록 날짜 차 오름 → id.
export async function listPurchaseRequestAttachCandidates(
  viewer: Viewer,
  input: { scope: PurchaseRequestScope; record: { totalKrw: number; issuedOn: string }; query: string | null },
  tx: DbOrTx = db,
): Promise<PurchaseRequestAttachCandidateRow[]> {
  void viewer;
  const requestedOn = sql<string>`to_char((${purchaseRequests.createdAt} at time zone 'UTC') at time zone 'Asia/Seoul', 'YYYY-MM-DD')`;
  const score = sql<number>`(case when ${purchaseRequests.estimateAmountKrw} = ${input.record.totalKrw} then 1 else 0 end)`;
  const conditions: (SQL | undefined)[] = [scopeCondition(input.scope), sql`${purchaseRequests.status} <> 'cancelled'`];
  if (input.query) {
    const like = `%${input.query.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(sql`(${purchaseRequests.number} ilike ${like} or ${purchaseRequests.itemName} ilike ${like} or ${users.name} ilike ${like})`);
  }
  const rows = await tx
    .select({
      id: purchaseRequests.id,
      number: purchaseRequests.number,
      itemName: purchaseRequests.itemName,
      requestedByName: users.name,
      status: purchaseRequests.status,
      estimateAmountKrw: purchaseRequests.estimateAmountKrw,
      requestedOn,
      score,
    })
    .from(purchaseRequests)
    .innerJoin(users, eq(users.id, purchaseRequests.requestedBy))
    .leftJoin(projects, eq(projects.id, purchaseRequests.projectId))
    .where(and(...conditions))
    .orderBy(sql`${score} desc`, sql`abs(((${purchaseRequests.createdAt} at time zone 'UTC') at time zone 'Asia/Seoul')::date - ${input.record.issuedOn}::date) asc`, sql`${purchaseRequests.id} asc`)
    .limit(PURCHASE_REQUEST_CANDIDATE_LIMIT + 1);
  return rows.map((row) => ({ ...row, score: Number(row.score) }));
}

// 요청 하나가 그 사람의 읽기 범위(06 목록 scope) 안인가 — 문서 「증빙」 섹션 · 붙이기 · 떼기의 보임 판정.
export async function isPurchaseRequestInScope(viewer: Viewer, input: { id: string; scope: PurchaseRequestScope }, tx: DbOrTx = db): Promise<boolean> {
  void viewer;
  const [row] = await tx
    .select({ id: purchaseRequests.id })
    .from(purchaseRequests)
    .leftJoin(projects, eq(projects.id, purchaseRequests.projectId))
    .where(and(eq(purchaseRequests.id, input.id), scopeCondition(input.scope)))
    .limit(1);
  return row !== undefined;
}

// 06.1-08(PA-PRLINE): 쪽의 구매 요청 id 가운데 그 범위 안인 것만 — 질의 하나(목록 쪽마다 한 번). 범위 판정은 목록과 같은 scopeCondition.
export async function filterPurchaseRequestIdsInScope(viewer: Viewer, input: { ids: readonly string[]; scope: PurchaseRequestScope }, tx: DbOrTx = db): Promise<string[]> {
  void viewer;
  if (input.ids.length === 0) return [];
  const rows = await tx
    .select({ id: purchaseRequests.id })
    .from(purchaseRequests)
    .leftJoin(projects, eq(projects.id, purchaseRequests.projectId))
    .where(and(inArray(purchaseRequests.id, [...input.ids]), scopeCondition(input.scope)));
  return rows.map((row) => row.id);
}

// 쪽 단위 존재 조회 — 범위 안 취소 아닌 요청이 하나라도 있나.
export async function hasPurchaseRequestAttachTarget(viewer: Viewer, input: { scope: PurchaseRequestScope }): Promise<boolean> {
  void viewer;
  const [row] = await db
    .select({ id: purchaseRequests.id })
    .from(purchaseRequests)
    .leftJoin(projects, eq(projects.id, purchaseRequests.projectId))
    .where(and(scopeCondition(input.scope), sql`${purchaseRequests.status} <> 'cancelled'`))
    .limit(1);
  return row !== undefined;
}
