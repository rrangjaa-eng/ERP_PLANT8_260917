import { and, desc, eq, gte, lt, or, type SQL } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { projects, purchaseRequests, quoteLines, quoteRevisions, users, vendors } from "@/db/schema";
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
  projectName: string | null;
  lineItemName: string | null;
  lineRevisionId: string | null;
};

function scopeCondition(scope: PurchaseRequestScope): SQL | undefined {
  if (scope.kind === "all") return undefined;
  return or(eq(purchaseRequests.requestedBy, scope.userId), eq(projects.pmUserId, scope.userId));
}

// 최근 요청이 첫 줄(created_at 내림차순).
export async function listPurchaseRequestRows(
  viewer: Viewer,
  input: { scope: PurchaseRequestScope; filter: PurchaseRequestFilter },
  tx: DbOrTx = db,
): Promise<PurchaseRequestListRow[]> {
  void viewer;
  const { filter } = input;
  const conditions: (SQL | undefined)[] = [scopeCondition(input.scope)];
  if (filter.status) conditions.push(eq(purchaseRequests.status, filter.status));
  if (filter.from) conditions.push(gte(purchaseRequests.createdAt, filter.from));
  if (filter.to) conditions.push(lt(purchaseRequests.createdAt, filter.to));

  const rows = await tx
    .select({
      request: purchaseRequests,
      requestedByName: users.name,
      projectName: projects.name,
      lineItemName: quoteLines.itemName,
      lineRevisionId: quoteLines.revisionId,
    })
    .from(purchaseRequests)
    .innerJoin(users, eq(users.id, purchaseRequests.requestedBy))
    .leftJoin(projects, eq(projects.id, purchaseRequests.projectId))
    .leftJoin(quoteLines, eq(quoteLines.id, purchaseRequests.quoteLineId))
    .where(and(...conditions))
    .orderBy(desc(purchaseRequests.createdAt), desc(purchaseRequests.id));

  return rows.map((row) => ({
    ...row.request,
    requestedByName: row.requestedByName,
    projectName: row.projectName,
    lineItemName: row.lineItemName,
    lineRevisionId: row.lineRevisionId,
  }));
}
