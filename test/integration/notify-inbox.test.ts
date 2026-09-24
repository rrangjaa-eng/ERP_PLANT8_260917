import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { notificationLog } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { countMyUnread, listMyNotifications, openMyInbox } from "@/domain/notify/inbox";
import { SYSTEM_VIEWER } from "@/domain/viewer";

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
