import { and, asc, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db/client";
import { revenueEntries } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import type { DbOrTx } from "@/repositories/document-counters";

export type RevenueEntryRow = InferSelectModel<typeof revenueEntries>;

// 04-02 Task 2 ② — repositories/vendors.ts 형태를 복제한다(viewer 첫 인자,
// 보관 조건부 UPDATE, InferSelectModel 행 타입 export). 프로젝트별 목록은
// kind·entry_date 순으로 정렬한다.
export async function listRevenueEntriesByProject(viewer: Viewer, projectId: string): Promise<RevenueEntryRow[]> {
  void viewer;
  return db
    .select()
    .from(revenueEntries)
    .where(and(eq(revenueEntries.projectId, projectId)))
    .orderBy(asc(revenueEntries.kind), asc(revenueEntries.entryDate));
}

export async function findRevenueEntryById(viewer: Viewer, id: string): Promise<RevenueEntryRow | null> {
  void viewer;
  const [row] = await db.select().from(revenueEntries).where(eq(revenueEntries.id, id)).limit(1);
  return row ?? null;
}

export type RevenueEntryInsertInput = {
  projectId: string;
  kind: string;
  entryDate: string;
  amountCurrency: string;
  amountForeignAmount: string | null;
  amountFxRate: string;
  amountAmountKrw: number;
  note?: string | null;
  source?: string;
  customFields?: Record<string, unknown>;
};

export async function insertRevenueEntry(
  viewer: Viewer,
  input: RevenueEntryInsertInput,
  tx: DbOrTx = db,
): Promise<RevenueEntryRow> {
  void viewer;
  const [row] = await tx
    .insert(revenueEntries)
    .values({
      projectId: input.projectId,
      kind: input.kind,
      entryDate: input.entryDate,
      amountCurrency: input.amountCurrency,
      amountForeignAmount: input.amountForeignAmount,
      amountFxRate: input.amountFxRate,
      amountAmountKrw: input.amountAmountKrw,
      note: input.note ?? null,
      source: input.source ?? "demo",
      customFields: input.customFields ?? {},
    })
    .returning();
  if (!row) throw new Error("revenue_entries insert가 행을 반환하지 않았습니다.");
  return row;
}

export type RevenueEntryUpdateInput = Omit<RevenueEntryInsertInput, "projectId" | "kind" | "source">;

// 견적 줄과 같은 낙관적 잠금 — WHERE version = expectedVersion. 0행이면
// 충돌 또는 존재하지 않음(null).
export async function updateRevenueEntryIfVersionMatches(
  viewer: Viewer,
  id: string,
  expectedVersion: number,
  owner: { projectId: string; kind: RevenueEntryRow["kind"] },
  input: RevenueEntryUpdateInput,
  tx: DbOrTx = db,
): Promise<RevenueEntryRow | null> {
  void viewer;
  const [row] = await tx
    .update(revenueEntries)
    .set({
      entryDate: input.entryDate,
      amountCurrency: input.amountCurrency,
      amountForeignAmount: input.amountForeignAmount,
      amountFxRate: input.amountFxRate,
      amountAmountKrw: input.amountAmountKrw,
      note: input.note ?? null,
      version: sql`${revenueEntries.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(revenueEntries.id, id),
        eq(revenueEntries.version, expectedVersion),
        eq(revenueEntries.projectId, owner.projectId),
        eq(revenueEntries.kind, owner.kind),
      ),
    )
    .returning();
  return row ?? null;
}
