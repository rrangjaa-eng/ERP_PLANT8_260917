import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { restoreRehearsals } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// viewer는 Phase 3의 scopeFor(viewer) 자리 — 지금은 받기만 한다(4계층 규칙).

export type RestoreRehearsalRow = typeof restoreRehearsals.$inferSelect;
export type NewRestoreRehearsalRow = Omit<typeof restoreRehearsals.$inferInsert, "seq">;
export type StoredRestoreRehearsalOutcome = { succeeded: boolean; failedStage: string | null };

// 같은 run_key가 이미 있으면 아무것도 쓰지 않고(ON CONFLICT DO NOTHING) 저장된 행의
// 결과를 다시 읽어 돌려준다 — 재시도한 기록이 저장된 결과와 다른 요약을 내지 않게.
export async function insertRestoreRehearsal(
  viewer: Viewer,
  values: NewRestoreRehearsalRow,
): Promise<{ inserted: boolean; stored: StoredRestoreRehearsalOutcome }> {
  void viewer;
  const insertedRows = await db
    .insert(restoreRehearsals)
    .values(values)
    .onConflictDoNothing({ target: restoreRehearsals.runKey })
    .returning({ succeeded: restoreRehearsals.succeeded, failedStage: restoreRehearsals.failedStage });
  const inserted = insertedRows[0];
  if (inserted) return { inserted: true, stored: inserted };

  const [existing] = await db
    .select({ succeeded: restoreRehearsals.succeeded, failedStage: restoreRehearsals.failedStage })
    .from(restoreRehearsals)
    .where(eq(restoreRehearsals.runKey, values.runKey));
  if (!existing) throw new Error(`restore_rehearsals: run_key ${values.runKey} 충돌 뒤 행을 찾지 못했습니다`);
  return { inserted: false, stored: existing };
}

// 종료 시각 내림차순 최신 1건, 같은 시각이면 나중에 넣은(seq가 큰) 행.
export async function findLatestRestoreRehearsal(viewer: Viewer): Promise<RestoreRehearsalRow | null> {
  void viewer;
  const [row] = await db
    .select()
    .from(restoreRehearsals)
    .orderBy(desc(restoreRehearsals.finishedAt), desc(restoreRehearsals.seq))
    .limit(1);
  return row ?? null;
}
