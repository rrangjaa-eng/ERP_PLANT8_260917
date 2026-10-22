import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog } from "@/db/schema";

// 시험 전용 — 운영 코드(app · domain · lib · repositories · scripts)는 이 파일을 import하지 않는다.
// 07-13 action_log 불변 트리거는 occurred_at UPDATE를 거부한다 — 시험의 시각 당기기만 replica 트랜잭션 안에서 트리거를 건너뛴다.
// SET LOCAL이라 트랜잭션이 끝나면 원래대로 돌아온다(같은 연결의 다음 문장은 다시 트리거를 탄다).
export async function backdateActionLog(seq: number, occurredAt: Date): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL session_replication_role = replica`);
    await tx.update(actionLog).set({ occurredAt }).where(eq(actionLog.seq, seq));
  });
}
