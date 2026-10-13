import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { projects, revenueEntries, revenueIssueRequests, users } from "@/db/schema";
import type { RowScope } from "@/domain/permissions/scope-for";
import type { Viewer } from "@/domain/viewer";
import { rowScopeCondition } from "@/repositories/row-scope";

// 06-18(D-610): 발행 요청 표. 잠그고 쓰는 함수는 전부 `tx: DbOrTx`를 필수로 받는다(06-03 tx 규약 — 풀 기본값 없음).

export type IssueRequestRow = InferSelectModel<typeof revenueIssueRequests>;
export type IssueRequestInsert = Omit<
  InferInsertModel<typeof revenueIssueRequests>,
  "version" | "source" | "createdAt" | "status" | "issuedEntryId" | "cancelledBy" | "cancelledAt"
>;

/** 표 읽기 행 — 이어진 발행 줄의 날짜 · 금액을 함께 싣는다(상태 2행 `발행 {MM-DD} · {금액}`). */
export type IssueRequestListRow = IssueRequestRow & { issuedEntryDate: string | null; issuedAmountKrw: number | null };

/** 희망 발행일 오름차순, 같은 날은 만든 순. */
export async function listIssueRequestRowsByProject(viewer: Viewer, projectId: string, tx: DbOrTx = db): Promise<IssueRequestListRow[]> {
  void viewer;
  const rows = await tx
    .select({
      request: revenueIssueRequests,
      issuedEntryDate: revenueEntries.entryDate,
      issuedAmountKrw: revenueEntries.amountAmountKrw,
    })
    .from(revenueIssueRequests)
    .leftJoin(revenueEntries, eq(revenueEntries.id, revenueIssueRequests.issuedEntryId))
    .where(eq(revenueIssueRequests.projectId, projectId))
    .orderBy(asc(revenueIssueRequests.desiredIssueDate), asc(revenueIssueRequests.createdAt), asc(revenueIssueRequests.id));
  return rows.map((row) => ({ ...row.request, issuedEntryDate: row.issuedEntryDate, issuedAmountKrw: row.issuedAmountKrw }));
}

/** 화면 uuid로 멱등 삽입 — 이미 있으면 넣지 않고 null. */
export async function insertIssueRequest(viewer: Viewer, values: IssueRequestInsert, tx: DbOrTx): Promise<IssueRequestRow | null> {
  void viewer;
  const [row] = await tx.insert(revenueIssueRequests).values({ ...values, status: "requested" }).onConflictDoNothing({ target: revenueIssueRequests.id }).returning();
  return row ?? null;
}

export async function findIssueRequestById(viewer: Viewer, id: string, tx: DbOrTx): Promise<IssueRequestRow | null> {
  void viewer;
  const [row] = await tx.select().from(revenueIssueRequests).where(eq(revenueIssueRequests.id, id)).limit(1);
  return row ?? null;
}

export type IssueRequestPatch = Pick<
  InferInsertModel<typeof revenueIssueRequests>,
  "desiredIssueDate" | "amountCurrency" | "amountForeignAmount" | "amountFxRate" | "amountAmountKrw" | "memo"
>;

/** 낙관적 잠금 — `신청됨`이고 아직 발행 줄에 이어지지 않은 이 프로젝트의 줄만 고친다. 0행이면 null. */
export async function updateIssueRequestIfVersionMatches(
  viewer: Viewer,
  id: string,
  expectedVersion: number,
  owner: { projectId: string },
  patch: IssueRequestPatch,
  tx: DbOrTx,
): Promise<IssueRequestRow | null> {
  void viewer;
  const [row] = await tx
    .update(revenueIssueRequests)
    .set({ ...patch, version: sql`${revenueIssueRequests.version} + 1` })
    .where(
      and(
        eq(revenueIssueRequests.id, id),
        eq(revenueIssueRequests.version, expectedVersion),
        eq(revenueIssueRequests.projectId, owner.projectId),
        eq(revenueIssueRequests.status, "requested"),
        isNull(revenueIssueRequests.issuedEntryId),
      ),
    )
    .returning();
  return row ?? null;
}

/** 요청 행 잠금 — 잠근 뒤 상태 · 이어짐을 판정한다. `tx` 필수. 그 프로젝트의 행만 잠근다(남의 프로젝트 행을 잡으면 그 프로젝트 저장과 교착할 수 있다 — 06-21 검토). */
export async function lockIssueRequest(viewer: Viewer, id: string, projectId: string, tx: DbOrTx): Promise<IssueRequestRow | null> {
  void viewer;
  const [row] = await tx
    .select()
    .from(revenueIssueRequests)
    .where(and(eq(revenueIssueRequests.id, id), eq(revenueIssueRequests.projectId, projectId)))
    .for("update");
  return row ?? null;
}

/** `신청됨 → 발행됨` — 잠근 행에만 부른다. */
export async function markIssueRequestIssued(viewer: Viewer, id: string, entryId: string, tx: DbOrTx): Promise<IssueRequestRow | null> {
  void viewer;
  const [row] = await tx
    .update(revenueIssueRequests)
    .set({ status: "issued", issuedEntryId: entryId, version: sql`${revenueIssueRequests.version} + 1` })
    .where(and(eq(revenueIssueRequests.id, id), eq(revenueIssueRequests.status, "requested")))
    .returning();
  return row ?? null;
}

/** `신청됨 → 취소` — 잠근 행에만 부른다(06-21). 취소한 사람 · 시각을 남기고 줄은 지우지 않는다. */
export async function markIssueRequestCancelled(viewer: Viewer, id: string, tx: DbOrTx): Promise<IssueRequestRow | null> {
  const [row] = await tx
    .update(revenueIssueRequests)
    .set({ status: "cancelled", cancelledBy: viewer.id, cancelledAt: sql`now()`, version: sql`${revenueIssueRequests.version} + 1` })
    .where(and(eq(revenueIssueRequests.id, id), eq(revenueIssueRequests.status, "requested")))
    .returning();
  return row ?? null;
}

// 06-21(S17) — 발행 요청 목록. 프로젝트 행 범위(rowScopeCondition)와 보관 프로젝트 제외(범위가 보관을 덮지 않으면)는 이 질의가 거른다.
export type IssueRequestBoardStatus = "requested" | "issued" | "cancelled";

/** 목록 행 — 표 읽기 행(발행 줄 날짜 · 금액)에 프로젝트 번호 · 이름 · 요청자 이름을 더한다. */
export type IssueRequestBoardRow = IssueRequestListRow & { projectNumber: string; projectName: string; requesterName: string | null };

/** 희망 발행일 오름차순(같은 날은 만든 순) — 그룹 순서(희망일 지남 → 이번 주 → 다음 주 → 그 뒤)와 같다. */
export async function listIssueRequestRows(
  viewer: Viewer,
  scope: RowScope,
  filter: { status: IssueRequestBoardStatus | null; limit: number; offset: number },
): Promise<IssueRequestBoardRow[]> {
  const rows = await db
    .select({
      request: revenueIssueRequests,
      issuedEntryDate: revenueEntries.entryDate,
      issuedAmountKrw: revenueEntries.amountAmountKrw,
      projectNumber: projects.number,
      projectName: projects.name,
      requesterName: users.name,
    })
    .from(revenueIssueRequests)
    .innerJoin(projects, eq(projects.id, revenueIssueRequests.projectId))
    .leftJoin(revenueEntries, eq(revenueEntries.id, revenueIssueRequests.issuedEntryId))
    .leftJoin(users, eq(users.id, revenueIssueRequests.requestedBy))
    .where(
      and(
        rowScopeCondition(viewer, scope, { projectId: projects.id, teamId: projects.teamId, pmUserId: projects.pmUserId }),
        scope.includeArchived ? undefined : isNull(projects.archivedAt),
        filter.status ? eq(revenueIssueRequests.status, filter.status) : undefined,
      ),
    )
    .orderBy(asc(revenueIssueRequests.desiredIssueDate), asc(revenueIssueRequests.createdAt), asc(revenueIssueRequests.id))
    .limit(filter.limit)
    .offset(filter.offset);
  return rows.map((row) => ({
    ...row.request,
    issuedEntryDate: row.issuedEntryDate,
    issuedAmountKrw: row.issuedAmountKrw,
    projectNumber: row.projectNumber,
    projectName: row.projectName,
    requesterName: row.requesterName,
  }));
}

/** 목록과 같은 범위 · 필터의 금액 · 희망 발행일(희망일 오름차순) — 합계 줄 · 열린 요청 요약이 쓴다. */
export async function listIssueRequestAmounts(
  viewer: Viewer,
  scope: RowScope,
  filter: { status: IssueRequestBoardStatus | null },
): Promise<Array<{ amountKrw: number; desiredIssueDate: string }>> {
  return db
    .select({ amountKrw: revenueIssueRequests.amountAmountKrw, desiredIssueDate: revenueIssueRequests.desiredIssueDate })
    .from(revenueIssueRequests)
    .innerJoin(projects, eq(projects.id, revenueIssueRequests.projectId))
    .where(
      and(
        rowScopeCondition(viewer, scope, { projectId: projects.id, teamId: projects.teamId, pmUserId: projects.pmUserId }),
        scope.includeArchived ? undefined : isNull(projects.archivedAt),
        filter.status ? eq(revenueIssueRequests.status, filter.status) : undefined,
      ),
    )
    .orderBy(asc(revenueIssueRequests.desiredIssueDate), asc(revenueIssueRequests.id));
}
