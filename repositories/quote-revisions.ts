import { and, desc, eq, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db/client";
import { quoteLines, quoteRevisions } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import type { DbOrTx } from "@/repositories/document-counters";

export type QuoteRevisionRow = InferSelectModel<typeof quoteRevisions>;

export type QuoteRevisionInsertInput = {
  projectId: string;
  seq: number;
  source?: string;
};

// **프로젝트 INSERT와 같은 트랜잭션 안에서 불린다**(D-53 "빈 차수는 만들지
// 않는다" — 등록과 동시에 1차가 생긴다).
export async function insertQuoteRevision(
  viewer: Viewer,
  input: QuoteRevisionInsertInput,
  tx: DbOrTx = db,
): Promise<QuoteRevisionRow> {
  void viewer;
  const [row] = await tx
    .insert(quoteRevisions)
    .values({ projectId: input.projectId, seq: input.seq, source: input.source ?? "demo" })
    .returning();
  if (!row) throw new Error("quote_revisions insert가 행을 반환하지 않았습니다.");
  return row;
}

export async function listQuoteRevisionsByProject(viewer: Viewer, projectId: string): Promise<QuoteRevisionRow[]> {
  void viewer;
  return db
    .select()
    .from(quoteRevisions)
    .where(eq(quoteRevisions.projectId, projectId))
    .orderBy(desc(quoteRevisions.seq));
}

// D-54: 최신 차수만 '현재 차수'. seq가 가장 큰 행.
// 04-14 — 잠근 트랜잭션 안(새 차수·승인)에서는 tx로 부른다.
export async function findLatestQuoteRevision(viewer: Viewer, projectId: string, tx: DbOrTx = db): Promise<QuoteRevisionRow | null> {
  void viewer;
  const [row] = await tx
    .select()
    .from(quoteRevisions)
    .where(eq(quoteRevisions.projectId, projectId))
    .orderBy(desc(quoteRevisions.seq))
    .limit(1);
  return row ?? null;
}

export async function findQuoteRevisionById(viewer: Viewer, id: string, tx: DbOrTx = db): Promise<QuoteRevisionRow | null> {
  void viewer;
  const [row] = await tx.select().from(quoteRevisions).where(eq(quoteRevisions.id, id)).limit(1);
  return row ?? null;
}

export async function findQuoteRevisionByProjectAndSeq(
  viewer: Viewer,
  projectId: string,
  seq: number,
): Promise<QuoteRevisionRow | null> {
  void viewer;
  const [row] = await db
    .select()
    .from(quoteRevisions)
    .where(and(eq(quoteRevisions.projectId, projectId), eq(quoteRevisions.seq, seq)))
    .limit(1);
  return row ?? null;
}

// 04-14(D-53) — 새 차수 행. `(project_id, seq)` 유일 제약 위반(23505 · quote_revisions_project_seq_key)은 호출자가 잡는다.
export async function insertRevision(
  viewer: Viewer,
  input: { projectId: string; seq: number },
  tx: DbOrTx,
): Promise<QuoteRevisionRow> {
  void viewer;
  const [row] = await tx.insert(quoteRevisions).values({ projectId: input.projectId, seq: input.seq }).returning();
  if (!row) throw new Error("quote_revisions insert가 행을 반환하지 않았습니다.");
  return row;
}

// 04-14(ENG-D9 · Codex #2) — 승인 기준값의 내용 토큰: 견적 줄·견적 외 비용(보관 포함)의 (id · version · 보관 여부)를
// id 순으로 이은 문자열의 md5. 줄 추가·수정·보관·복원이 모두 바꾸고 조정 줄은 들어가지 않는다(줄 0개면 빈 문자열의
// md5). approvalBasis와 summarizeRevisions가 이 한 조각을 쓴다 — 두 쿼리의 식이 갈라지지 않는다.
const APPROVABLE_KIND = sql`${quoteLines.lineKind} IN ('quote', 'out_of_quote')`;
const APPROVABLE_ACTIVE = sql`${APPROVABLE_KIND} AND ${quoteLines.archivedAt} IS NULL`;
const CONTENT_TOKEN = sql<string>`md5(coalesce(string_agg(${quoteLines.id}::text || ':' || ${quoteLines.version}::text || ':' || (${quoteLines.archivedAt} IS NULL)::text, ',' ORDER BY ${quoteLines.id}) FILTER (WHERE ${APPROVABLE_KIND}), ''))`;
const APPROVABLE_TOTAL = sql<number>`coalesce(sum(${quoteLines.quoteAmountKrw}) FILTER (WHERE ${APPROVABLE_ACTIVE}), 0)::bigint`;
const APPROVABLE_COUNT = sql<number>`(count(*) FILTER (WHERE ${APPROVABLE_ACTIVE}))::int`;

export type ApprovalBasis = { totalKrw: number; contentToken: string; approvableLineCount: number };

// 04-14(ENG-D4 · ENG-D9) — 승인 표시가 잠금 뒤 같은 tx로 다시 계산하는 기준값(합계 · 내용 토큰 · 승인 가능 줄 수). 한 쿼리.
export async function approvalBasis(viewer: Viewer, revisionId: string, tx: DbOrTx = db): Promise<ApprovalBasis> {
  void viewer;
  const [row] = await tx
    .select({
      totalKrw: APPROVABLE_TOTAL.mapWith(Number),
      contentToken: CONTENT_TOKEN,
      approvableLineCount: APPROVABLE_COUNT,
    })
    .from(quoteLines)
    .where(eq(quoteLines.revisionId, revisionId));
  if (!row) throw new Error("approvalBasis 집계가 행을 반환하지 않았습니다.");
  return row;
}

// 04-14(D-56) — 고객 승인 표시 켜기(승인 순간·승인자) · 끄기(둘 다 null).
export async function setRevisionApproval(
  viewer: Viewer,
  revisionId: string,
  input: { customerApprovedAt: Date | null; customerApprovedBy: string | null },
  tx: DbOrTx,
): Promise<void> {
  void viewer;
  await tx
    .update(quoteRevisions)
    .set({ customerApprovedAt: input.customerApprovedAt, customerApprovedBy: input.customerApprovedBy, updatedAt: new Date() })
    .where(eq(quoteRevisions.id, revisionId));
}
