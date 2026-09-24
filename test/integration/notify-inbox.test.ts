import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { db, pool } from "@/db/client";
import { notificationLog } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { countMyUnread, listMyNotifications, openMyInbox } from "@/domain/notify/inbox";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { env } from "@/lib/env";

async function createUser(prefix: string): Promise<string> {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const { userId } = await createAccount(SYSTEM_VIEWER, { email, name: prefix });
  return userId;
}

// 테스트 알림 행을 직접 넣는다(tick을 거치지 않는다 — 이 스위트는 알림함 읽기 도메인만 본다).
async function seedNotifications(
  recipientId: string,
  count: number,
  opts?: { entityPrefix?: string },
): Promise<void> {
  const prefix = opts?.entityPrefix ?? "seed";
  const rows = Array.from({ length: count }, (_, i) => ({
    conditionKind: "test",
    entity: "test",
    entityId: `${prefix}-${randomUUID()}-${i}`,
    recipientId,
    round: 1,
    referenceDate: "2026-01-01",
    message: `테스트 알림 · ${prefix}-${i}`,
  }));
  await db.insert(notificationLog).values(rows);
}

describe("알림함 트레이서 (D-4218)", () => {
  it("A에게 알림 3건 → 세어 보고, 열어서 전부 읽음 처리하고, B의 행·목록은 바뀌지 않는다", async () => {
    const userA = await createUser("inbox-a");
    const userB = await createUser("inbox-b");

    await seedNotifications(userA, 3);
    await seedNotifications(userB, 2);

    expect(await countMyUnread({ id: userA, roleId: null })).toBe(3);

    const opened = await openMyInbox({ id: userA, roleId: null });
    expect(opened.rows).toHaveLength(3);
    expect(opened.openedAt).toBeTruthy();
    for (const row of opened.rows) {
      expect(row.readAt).toBe(opened.openedAt);
    }

    expect(await countMyUnread({ id: userA, roleId: null })).toBe(0);

    // B는 A의 열기로 바뀌지 않는다.
    expect(await countMyUnread({ id: userB, roleId: null })).toBe(2);
    const bList = await listMyNotifications({ id: userB, roleId: null }, { limit: 50 });
    expect(bList.rows).toHaveLength(2);
    expect(bList.rows.every((row) => row.readAt === null)).toBe(true);
    // A의 행이 B의 목록에 없다.
    const aList = await listMyNotifications({ id: userA, roleId: null }, { limit: 50 });
    expect(bList.rows.some((row) => aList.rows.some((aRow) => aRow.id === row.id))).toBe(false);
  });
});

// `app/(app)/notifications/actions.ts`는 "server-only"를 (lib/viewer.ts 경유로)
// 옮겨 들여와 vitest에서 직접 import할 수 없다(이 저장소 통합 테스트 전부의
// 관례 — 도메인 함수를 직접 부른다). loadMoreInboxAction의 zod 스키마를 그대로
// 옮겨 커서 검증·직렬화 경로를 증명한다 — 스키마 리터럴은 actions.ts에도 그대로
// 남아야 `grep -n "precision: 3"` 승인 기준을 만족한다(Codex 2차 #11).
const loadMoreCursorSchema = z.object({
  cursor: z.object({
    createdAt: z.string().datetime({ precision: 3 }),
    id: z.string().regex(/^\d+$/),
  }),
});

describe("알림함 경계 (D-4218)", () => {
  it("키셋: 55건 → 첫 페이지 50 → 그사이 3건 삽입 → 다음 페이지는 남은 5건(중복·누락 없음)", async () => {
    const user = await createUser("inbox-keyset");
    await seedNotifications(user, 55, { entityPrefix: "page1" });

    const page1 = await listMyNotifications({ id: user, roleId: null }, { limit: 50 });
    expect(page1.rows).toHaveLength(50);
    expect(page1.hasMore).toBe(true);

    await seedNotifications(user, 3, { entityPrefix: "inserted-between" });

    const last = page1.rows[page1.rows.length - 1]!;
    const page2 = await listMyNotifications(
      { id: user, roleId: null },
      { limit: 50, cursor: { createdAt: last.createdAt, id: last.id } },
    );
    expect(page2.rows).toHaveLength(5);
    expect(page2.hasMore).toBe(false);

    const page1Ids = new Set(page1.rows.map((row) => row.id));
    const page2Ids = new Set(page2.rows.map((row) => row.id));
    for (const id of page2Ids) expect(page1Ids.has(id)).toBe(false);
    expect(page1Ids.size + page2Ids.size).toBe(55);
  });

  it("열기를 가로지르는 tick: 커밋 전 삽입은 openMyInbox에 보이지 않고 읽음 처리되지 않는다", async () => {
    // 풀 최대가 2 미만이면 두 번째 연결을 못 잡는다 — 그 조건을 먼저 스스로 확인한다.
    expect(env.DB_POOL_MAX).toBeGreaterThanOrEqual(2);

    const user = await createUser("inbox-cross-tick");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query<{ id: number }>(
        `insert into notification_log (condition_kind, entity, entity_id, recipient_id, round, reference_date, message)
         values ('test', 'test', $1, $2, 1, '2026-01-01', '테스트 알림 · cross-tick')
         returning id`,
        [`cross-tick-${randomUUID()}`, user],
      );
      expect(inserted.rows).toHaveLength(1);

      // 커밋 전 — openMyInbox의 별도 연결에는 아직 보이지 않는다.
      const opened = await openMyInbox({ id: user, roleId: null });
      expect(opened.rows).toHaveLength(0);

      await client.query("COMMIT");
    } finally {
      client.release();
    }

    expect(await countMyUnread({ id: user, roleId: null })).toBe(1);
    const raw = await db
      .select({ readAt: notificationLog.readAt })
      .from(notificationLog)
      .where(eq(notificationLog.recipientId, user));
    expect(raw).toHaveLength(1);
    expect(raw[0]!.readAt).toBeNull();
  });

  it("같은 created_at 두 행은 두 줄이고 id 내림차순이다", async () => {
    const user = await createUser("inbox-tie");
    await db.insert(notificationLog).values([
      {
        conditionKind: "test",
        entity: "test",
        entityId: `tie-${randomUUID()}-1`,
        recipientId: user,
        round: 1,
        referenceDate: "2026-01-01",
        message: "테스트 알림 · tie-1",
        createdAt: sql`'2026-09-24 00:00:00.123'::timestamp`,
      },
      {
        conditionKind: "test",
        entity: "test",
        entityId: `tie-${randomUUID()}-2`,
        recipientId: user,
        round: 1,
        referenceDate: "2026-01-01",
        message: "테스트 알림 · tie-2",
        createdAt: sql`'2026-09-24 00:00:00.123'::timestamp`,
      },
    ]);

    const list = await listMyNotifications({ id: user, roleId: null }, { limit: 50 });
    expect(list.rows).toHaveLength(2);
    expect(list.rows[0]!.createdAt).toBe(list.rows[1]!.createdAt);
    expect(Number(list.rows[0]!.id)).toBeGreaterThan(Number(list.rows[1]!.id));
  });

  it("같은 시각 55행(마이크로초 있음) → 밀리초로 저장 → 액션 직렬화 경로로 커서를 넘겨도 다음 페이지가 맞다(Codex 2차 #11)", async () => {
    const user = await createUser("inbox-same-instant");
    const rows = Array.from({ length: 55 }, (_, i) => ({
      conditionKind: "test",
      entity: "test",
      entityId: `same-instant-${randomUUID()}-${i}`,
      recipientId: user,
      round: 1,
      referenceDate: "2026-01-01",
      message: `테스트 알림 · same-instant-${i}`,
      createdAt: sql`'2026-09-24 00:00:00.123456'::timestamp`,
    }));
    await db.insert(notificationLog).values(rows);

    const stored = await db.execute<{ created_at: string }>(
      sql`select created_at::text as created_at from notification_log where recipient_id = ${user} limit 1`,
    );
    expect(stored.rows[0]?.created_at.endsWith(".123")).toBe(true);

    const page1 = await listMyNotifications({ id: user, roleId: null }, { limit: 50 });
    expect(page1.rows).toHaveLength(50);
    expect(page1.hasMore).toBe(true);

    const last = page1.rows[page1.rows.length - 1]!;
    // 액션 경계를 흉내낸다: DTO를 JSON으로 왕복해 loadMoreInboxAction이 받는
    // 형태(문자열 커서)로 만들고, 그 스키마로 검증한 뒤 도메인 함수를 부른다.
    const roundTripped = JSON.parse(
      JSON.stringify({ createdAt: last.createdAt, id: last.id }),
    ) as unknown;
    const parsedInput = loadMoreCursorSchema.safeParse({ cursor: roundTripped });
    expect(parsedInput.success).toBe(true);
    if (!parsedInput.success) throw new Error("unreachable — 위 단언이 먼저 실패한다");

    const page2 = await listMyNotifications(
      { id: user, roleId: null },
      { limit: 50, cursor: parsedInput.data.cursor },
    );
    expect(page2.rows).toHaveLength(5);
    expect(page2.hasMore).toBe(false);

    const unionIds = new Set([...page1.rows.map((row) => row.id), ...page2.rows.map((row) => row.id)]);
    expect(unionIds.size).toBe(55);
  });

  it("재열기: 두 번째 openMyInbox는 행을 고치지 않고 read_at이 첫 열기 그대로다", async () => {
    const user = await createUser("inbox-reopen");
    await seedNotifications(user, 3);

    const first = await openMyInbox({ id: user, roleId: null });
    expect(first.rows).toHaveLength(3);
    const firstReadAts = new Map(first.rows.map((row) => [row.id, row.readAt]));

    const second = await openMyInbox({ id: user, roleId: null });
    expect(second.openedAt).not.toBe(first.openedAt);
    expect(second.rows).toHaveLength(3);
    for (const row of second.rows) {
      expect(row.readAt).toBe(firstReadAts.get(row.id));
      expect(row.readAt).not.toBe(second.openedAt);
    }
    expect(await countMyUnread({ id: user, roleId: null })).toBe(0);
  });

  it("동시 열기: 둘 다 성공하고 각 행의 read_at은 한 값이다", async () => {
    const user = await createUser("inbox-concurrent");
    await seedNotifications(user, 3);

    const [r1, r2] = await Promise.all([
      openMyInbox({ id: user, roleId: null }),
      openMyInbox({ id: user, roleId: null }),
    ]);
    expect(r1.rows).toHaveLength(3);
    expect(r2.rows).toHaveLength(3);

    const raw = await db
      .select({ readAt: notificationLog.readAt })
      .from(notificationLog)
      .where(eq(notificationLog.recipientId, user));
    expect(raw).toHaveLength(3);
    const readAtValues = new Set(raw.map((row) => row.readAt?.toISOString()));
    expect(readAtValues.size).toBe(1);
    const [singleValue] = [...readAtValues];
    expect([r1.openedAt, r2.openedAt]).toContain(singleValue);
  });

  it("91일 전 행은 목록·안 읽은 수·열기에서 빠지고 열기가 그 행을 읽음 처리하지 않는다", async () => {
    const user = await createUser("inbox-retention");
    const staleCreatedAt = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    await db.insert(notificationLog).values({
      conditionKind: "test",
      entity: "test",
      entityId: `stale-${randomUUID()}`,
      recipientId: user,
      round: 1,
      referenceDate: "2026-01-01",
      message: "테스트 알림 · stale",
      createdAt: staleCreatedAt,
    });

    expect(await countMyUnread({ id: user, roleId: null })).toBe(0);
    const list = await listMyNotifications({ id: user, roleId: null }, { limit: 50 });
    expect(list.rows).toHaveLength(0);

    const opened = await openMyInbox({ id: user, roleId: null });
    expect(opened.rows).toHaveLength(0);

    const raw = await db
      .select({ readAt: notificationLog.readAt })
      .from(notificationLog)
      .where(eq(notificationLog.recipientId, user));
    expect(raw).toHaveLength(1);
    expect(raw[0]!.readAt).toBeNull();
  });

  it("액션 입력: 숫자가 아닌 id나 날짜가 아닌 createdAt은 검증 오류로 걸러진다(쿼리 안 함)", () => {
    const badId = loadMoreCursorSchema.safeParse({
      cursor: { createdAt: "2026-09-24T00:00:00.123Z", id: "not-a-number" },
    });
    expect(badId.success).toBe(false);

    const badDate = loadMoreCursorSchema.safeParse({
      cursor: { createdAt: "not-a-date", id: "42" },
    });
    expect(badDate.success).toBe(false);

    const ok = loadMoreCursorSchema.safeParse({
      cursor: { createdAt: "2026-09-24T00:00:00.123Z", id: "42" },
    });
    expect(ok.success).toBe(true);
  });
});
