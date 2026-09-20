import { and, eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db/client";
import { documentCounters } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

export type DocumentCounterRow = InferSelectModel<typeof documentCounters>;

// 읽기와 upsert만 둔다 — 실제 번호 부여(원자적 증가)와 행 잠금은 Phase 4다.
export async function findDocumentCounter(
  viewer: Viewer,
  counterKey: string,
  period: string,
): Promise<DocumentCounterRow | null> {
  const [row] = await db
    .select()
    .from(documentCounters)
    .where(and(eq(documentCounters.counterKey, counterKey), eq(documentCounters.period, period)))
    .limit(1);
  return row ?? null;
}

export async function upsertDocumentCounter(
  viewer: Viewer,
  input: { counterKey: string; period: string; value: number },
): Promise<void> {
  await db
    .insert(documentCounters)
    .values({ counterKey: input.counterKey, period: input.period, value: input.value })
    .onConflictDoUpdate({
      target: [documentCounters.counterKey, documentCounters.period],
      set: { value: input.value, updatedAt: new Date() },
    });
}
