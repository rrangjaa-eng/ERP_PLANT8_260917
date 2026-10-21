import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { notificationLog } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { countMyUnread, listMyNotifications, openMyInbox } from "@/domain/notify/inbox";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// 접힌 todo SC5b — 알림함 액션 3개(open · refreshUnreadCount · loadMore)는 D-4208 본인 범위라 등록하지 않고
// (ACTIONS_WITHOUT_REGISTRY 그대로) 이 시험이 대신한다(AQ-07). 액션 파일은 server-only라 import하지 않고,
// 액션이 ctx.viewer로 부르는 도메인 함수를 같은 입력으로 부른다(leak-scan.test.ts 머리 주석과 같은 이유).
// 위협 T-07-03-02: 남의 알림 열람 · 읽음 처리.

async function createUser(prefix: string): Promise<string> {
  const email = `${prefix}-${randomUUID()}@example.test`;
  const { userId } = await createAccount(SYSTEM_VIEWER, { email, name: prefix });
  return userId;
}

async function seedNotifications(recipientId: string, count: number, tag: string): Promise<void> {
  await db.insert(notificationLog).values(
    Array.from({ length: count }, (_, i) => ({
      conditionKind: "test",
      entity: "test",
      entityId: `${tag}-${randomUUID()}-${i}`,
      recipientId,
      round: 1,
      referenceDate: "2026-01-01",
      message: `본인 범위 시험 · ${tag}-${i}`,
    })),
  );
}

async function rowsOf(recipientId: string) {
  return db.select().from(notificationLog).where(eq(notificationLog.recipientId, recipientId));
}

describe("알림함 본인 범위 (SC5b · D-4208 · T-07-03-02)", () => {
  it("A의 목록 · 안 읽은 수에 B의 행이 없다", async () => {
    const a = { id: await createUser("own-a"), roleId: null };
    const b = { id: await createUser("own-b"), roleId: null };
    await seedNotifications(a.id, 2, "a");
    await seedNotifications(b.id, 3, "b");

    const bIds = new Set((await rowsOf(b.id)).map((row) => String(row.id)));
    const list = await listMyNotifications(a, { limit: 50 });
    expect(list.rows).toHaveLength(2);
    expect(list.rows.some((row) => bIds.has(row.id))).toBe(false);
    expect(await countMyUnread(a)).toBe(2);
  });

  it("A가 알림함을 열어도 B의 안 읽은 수와 read_at은 그대로다(열기는 id를 받지 않는다 — C-P3-1)", async () => {
    const a = { id: await createUser("open-a"), roleId: null };
    const b = { id: await createUser("open-b"), roleId: null };
    await seedNotifications(a.id, 2, "a");
    await seedNotifications(b.id, 3, "b");

    const opened = await openMyInbox(a);
    expect(opened.rows).toHaveLength(2);
    expect(await countMyUnread(a)).toBe(0);

    expect(await countMyUnread(b)).toBe(3);
    const bRows = await rowsOf(b.id);
    expect(bRows).toHaveLength(3);
    expect(bRows.every((row) => row.readAt === null)).toBe(true);
  });

  it("B 행의 {createdAt, id}로 만든 커서를 A의 loadMore에 줘도 A 행만 나온다", async () => {
    const a = { id: await createUser("cursor-a"), roleId: null };
    const b = { id: await createUser("cursor-b"), roleId: null };
    await seedNotifications(a.id, 2, "a");
    await seedNotifications(b.id, 2, "b");
    await seedNotifications(a.id, 1, "a-late");

    const bFirst = (await listMyNotifications(b, { limit: 1 })).rows[0]!;
    const aIds = new Set((await rowsOf(a.id)).map((row) => String(row.id)));
    const bIds = new Set((await rowsOf(b.id)).map((row) => String(row.id)));

    const page = await listMyNotifications(a, { limit: 50, cursor: { createdAt: bFirst.createdAt, id: bFirst.id } });
    expect(page.rows.every((row) => aIds.has(row.id))).toBe(true);
    expect(page.rows.some((row) => bIds.has(row.id))).toBe(false);
  });
});
