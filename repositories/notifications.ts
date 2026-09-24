import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { withDeadlineTransaction, type DeadlineTx } from "@/db/deadline-transaction";
import { notificationLog, notifyTickRuns } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// tick 잠금 키 — 저장소 안 다른 advisory lock과 겹치지 않는 값(이 리포에 다른
// advisory lock은 아직 없다). 04.2-10의 이메일 선점이 같은 키를 기다리는 형으로 잡는다.
export const NOTIFY_TICK_LOCK_KEY = 420_401;

// tick 잠금 트랜잭션의 클라이언트 마감 — 풀 대기 5 + 25 = 04.2-10 예산의 tick 잠금 몫 30초.
export const NOTIFY_TX_DEADLINE_MS = 25_000;

// 마감 트랜잭션 콜백 인자 — 공용 DbOrTx는 execute가 없어 넓히지 않고 지역 타입을 쓴다.
export type NotifyTx = DeadlineTx;

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
// 이하 × 5초 — 04.2-10 실행 예산의 tick 잠금 몫). BEGIN~COMMIT·ROLLBACK 전체는
// 클라이언트 마감 안에서 돈다 — 응답이 멈추면 연결을 파기하고 DbDeadlineError.
export async function withNotifyTickLock<T>(
  viewer: Viewer,
  fn: (tx: NotifyTx) => Promise<T>,
  opts?: { deadlineMs?: number },
): Promise<{ acquired: false } | { acquired: true; value: T }> {
  void viewer;
  return withDeadlineTransaction(opts?.deadlineMs ?? NOTIFY_TX_DEADLINE_MS, async (tx) => {
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

// ── 알림함 읽기 (04.2-07, D-4218) ──────────────────────────────────────

export type InboxCursor = { createdAt: string; id: string };

export type InboxRow = {
  id: number;
  message: string;
  createdAt: Date;
  readAt: Date | null;
  emailStatus: string;
};

// (created_at, id) 키셋 — 페이지 사이 삽입에도 중복·누락이 없다(D-4218 · Codex #20).
// 정렬은 항상 created_at DESC, id DESC. viewer는 다른 저장소 함수와 같은 자리를
// 지키려는 인자다(여기서는 쓰지 않는다) — 받는 사람은 opts.recipientId로만 정해진다.
export async function listInbox(
  viewer: Viewer,
  opts: { recipientId: string; retentionFrom: Date; limit: number; cursor?: InboxCursor },
): Promise<InboxRow[]> {
  void viewer;
  const conditions = [
    eq(notificationLog.recipientId, opts.recipientId),
    gte(notificationLog.createdAt, opts.retentionFrom),
  ];
  if (opts.cursor) {
    conditions.push(
      sql`(${notificationLog.createdAt}, ${notificationLog.id}) < (${opts.cursor.createdAt}::timestamp, ${Number(opts.cursor.id)}::bigint)`,
    );
  }
  return db
    .select({
      id: notificationLog.id,
      message: notificationLog.message,
      createdAt: notificationLog.createdAt,
      readAt: notificationLog.readAt,
      emailStatus: notificationLog.emailStatus,
    })
    .from(notificationLog)
    .where(and(...conditions))
    .orderBy(desc(notificationLog.createdAt), desc(notificationLog.id))
    .limit(opts.limit);
}

export async function countUnread(
  viewer: Viewer,
  opts: { recipientId: string; retentionFrom: Date },
): Promise<number> {
  void viewer;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.recipientId, opts.recipientId),
        gte(notificationLog.createdAt, opts.retentionFrom),
        isNull(notificationLog.readAt),
      ),
    );
  return row?.count ?? 0;
}

export type OpenInboxResult = {
  openedAt: Date;
  rows: Array<InboxRow & { wasMarked: boolean }>;
};

// db.execute(원시 SQL)는 drizzle의 스키마 매핑을 거치지 않아 pg 드라이버가 준
// 문자열을 그대로 돌려준다(select() 빌더 경로만 컬럼 타입으로 Date 변환한다,
// 실측). 이 칸들은 DB 세션이 UTC라(now()가 '+00') 리터럴을 그대로 UTC로 읽으면
// 된다(04.2-01 D-4218이 이미 전제하는 것과 같은 가정).
function parsePgTimestamp(value: string): Date {
  const iso = value.replace(" ", "T");
  return new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`);
}

// 한 문장 열기(D-4218 · Codex #20): WITH opened AS (SELECT now()), marked AS
// (UPDATE … RETURNING id) 뒤에 첫 페이지를 SELECT한다 — UPDATE와 SELECT가 같은
// 스냅샷을 본다(READ COMMITTED에서도 한 문장 안의 CTE는 한 스냅샷을 공유한다).
// opened를 notification_log와 LEFT JOIN해서, 이 받는 사람에게 알림이 하나도
// 없어도(page가 0행) opened_at 행 하나는 항상 돌려준다.
export async function openInbox(
  viewer: Viewer,
  opts: { recipientId: string; retentionFrom: Date; limit: number },
): Promise<OpenInboxResult> {
  void viewer;
  const result = await db.execute<{
    opened_at: string;
    id: number | null;
    message: string | null;
    created_at: string | null;
    read_at: string | null;
    email_status: string | null;
    was_marked: boolean | null;
  }>(sql`
    WITH opened AS (SELECT now() AS at),
         marked AS (
           UPDATE notification_log
           SET read_at = opened.at
           FROM opened
           WHERE notification_log.recipient_id = ${opts.recipientId}
             AND notification_log.read_at IS NULL
             AND notification_log.created_at >= ${opts.retentionFrom.toISOString()}::timestamp
           RETURNING notification_log.id
         ),
         page AS (
           SELECT id, message, created_at, read_at, email_status,
                  (id IN (SELECT id FROM marked)) AS was_marked
           FROM notification_log
           WHERE recipient_id = ${opts.recipientId}
             AND created_at >= ${opts.retentionFrom.toISOString()}::timestamp
           ORDER BY created_at DESC, id DESC
           LIMIT ${opts.limit}
         )
    SELECT (opened.at AT TIME ZONE 'UTC') AS opened_at, page.*
    FROM opened
    LEFT JOIN page ON true
    ORDER BY page.created_at DESC NULLS LAST, page.id DESC
  `);

  const openedAtRaw = result.rows[0]?.opened_at;
  if (!openedAtRaw) throw new Error("openInbox: opened.at 행이 없습니다(항상 1행이어야 한다).");
  const openedAt = parsePgTimestamp(openedAtRaw);

  const rows = result.rows
    .filter(
      (row): row is typeof row & { id: number; message: string; created_at: string; email_status: string } =>
        row.id !== null,
    )
    .map((row) => ({
      id: row.id,
      message: row.message,
      createdAt: parsePgTimestamp(row.created_at),
      readAt: row.read_at ? parsePgTimestamp(row.read_at) : null,
      emailStatus: row.email_status,
      wasMarked: row.was_marked === true,
    }));

  return { openedAt, rows };
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
