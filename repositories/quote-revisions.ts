import { and, desc, eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db/client";
import { quoteRevisions } from "@/db/schema";
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
export async function findLatestQuoteRevision(viewer: Viewer, projectId: string): Promise<QuoteRevisionRow | null> {
  void viewer;
  const [row] = await db
    .select()
    .from(quoteRevisions)
    .where(eq(quoteRevisions.projectId, projectId))
    .orderBy(desc(quoteRevisions.seq))
    .limit(1);
  return row ?? null;
}

export async function findQuoteRevisionById(viewer: Viewer, id: string): Promise<QuoteRevisionRow | null> {
  void viewer;
  const [row] = await db.select().from(quoteRevisions).where(eq(quoteRevisions.id, id)).limit(1);
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
