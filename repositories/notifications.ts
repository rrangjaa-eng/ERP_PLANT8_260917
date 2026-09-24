import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationLog, notifyTickRuns } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// tick 잠금 키 — 저장소 안 다른 advisory lock과 겹치지 않는 값(이 리포에 다른
// advisory lock은 아직 없다). 04.2-10의 이메일 선점이 같은 키를 기다리는 형으로 잡는다.
export const NOTIFY_TICK_LOCK_KEY = 420_401;

// db.transaction 콜백 인자 — 공용 DbOrTx는 execute가 없어 넓히지 않고 지역 타입을 쓴다.
export type NotifyTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type DedupKey = {
  conditionKind: string;
  entity: string;
  entityId: string;
  recipientId: string;
  round: number;
};

export type NotificationInsert = DedupKey & { referenceDate: string; message: string };

// tick 전체(평가·삽입·실행 기록)를 시도형 advisory lock을 잡은 한 트랜잭션에서
// 돌린다. 잠금은 트랜잭션 종료로 저절로 풀린다. 문장 대기 한도 5s(문장 다섯
// 이하 × 5초 — 04.2-10 실행 예산의 tick 잠금 몫).
export async function withNotifyTickLock<T>(
  viewer: Viewer,
  fn: (tx: NotifyTx) => Promise<T>,
): Promise<{ acquired: false } | { acquired: true; value: T }> {
  void viewer;
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
    await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
    const result = await tx.execute<{ ok: boolean }>(
      sql`select pg_try_advisory_xact_lock(${NOTIFY_TICK_LOCK_KEY}) as ok`,
    );
    if (!result.rows[0]?.ok) return { acquired: false };
    return { acquired: true, value: await fn(tx) };
  });
}

// 다섯 칸을 칸별 배열 인자 다섯 개로 넘긴다 — 바인드 인자 수가 후보 수와
// 무관하다(sql 템플릿에 배열을 그대로 끼우면 원소마다 인자가 된다).
export async function findExistingDedupKeys(
  viewer: Viewer,
  keys: readonly DedupKey[],
  tx: NotifyTx,
): Promise<DedupKey[]> {
  void viewer;
  if (keys.length === 0) return [];
  const result = await tx.execute<{
    condition_kind: string;
    entity: string;
    entity_id: string;
    recipient_id: string;
    round: number;
  }>(sql`
    select condition_kind, entity, entity_id, recipient_id, round
    from notification_log
    where (condition_kind, entity, entity_id, recipient_id, round) in (
      select * from unnest(
        ${sql.param(keys.map((k) => k.conditionKind))}::text[],
        ${sql.param(keys.map((k) => k.entity))}::text[],
        ${sql.param(keys.map((k) => k.entityId))}::text[],
        ${sql.param(keys.map((k) => k.recipientId))}::text[],
        ${sql.param(keys.map((k) => k.round))}::int[]
      )
    )
  `);
  return result.rows.map((row) => ({
    conditionKind: row.condition_kind,
    entity: row.entity,
    entityId: row.entity_id,
    recipientId: row.recipient_id,
    round: row.round,
  }));
}

// 중복 키는 조용히 건너뛴다(INSERT … ON CONFLICT DO NOTHING) — 돌려준 id 수가 실제 삽입 수다.
export async function insertNotifications(
  viewer: Viewer,
  rows: readonly NotificationInsert[],
  tx: NotifyTx,
): Promise<number[]> {
  void viewer;
  if (rows.length === 0) return [];
  const inserted = await tx
    .insert(notificationLog)
    .values([...rows])
    .onConflictDoNothing({
      target: [
        notificationLog.conditionKind,
        notificationLog.entity,
        notificationLog.entityId,
        notificationLog.recipientId,
        notificationLog.round,
      ],
    })
    .returning({ id: notificationLog.id });
  return inserted.map((row) => row.id);
}

export async function insertTickRun(
  viewer: Viewer,
  run: {
    startedAt: Date;
    finishedAt: Date;
    kstDate: string;
    businessDay: boolean;
    sent: number;
    skipped: number;
    remaining: number;
    incompleteRecipientIds: string[];
    evaluationFailed: boolean;
  },
  tx: NotifyTx,
): Promise<number> {
  void viewer;
  const [row] = await tx.insert(notifyTickRuns).values(run).returning({ id: notifyTickRuns.id });
  if (!row) throw new Error("notify_tick_runs insert가 행을 반환하지 않았습니다.");
  return row.id;
}
