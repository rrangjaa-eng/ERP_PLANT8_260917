import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { revenueEntries, revenueIssueRequests } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

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

/** 요청 행 잠금 — 잠근 뒤 상태 · 이어짐을 판정한다. `tx` 필수. */
export async function lockIssueRequest(viewer: Viewer, id: string, tx: DbOrTx): Promise<IssueRequestRow | null> {
  void viewer;
  const [row] = await tx.select().from(revenueIssueRequests).where(eq(revenueIssueRequests.id, id)).for("update");
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
