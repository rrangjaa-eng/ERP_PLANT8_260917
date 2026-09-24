import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { notificationLog } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { runTick } from "@/domain/notify/tick";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { verifySchedulerToken } from "@/lib/oidc";
import { handleNotifyTick, type NotifyTickHandlerDeps } from "@/app/internal/notify-tick/handle";
import { createTestConditionKind, createTestSigner, testCandidate } from "@/test/support/notify-tick";

const AUDIENCE = "https://notify.test.invalid";
const SCHEDULER_SA = "scheduler@test.invalid";

async function createUser(prefix: string): Promise<string> {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const { userId } = await createAccount(SYSTEM_VIEWER, { email, name: prefix });
  return userId;
}

async function rowsFor(recipientId: string) {
  return db.select().from(notificationLog).where(eq(notificationLog.recipientId, recipientId));
}

function tickRequest(token: string | null): Request {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request("http://127.0.0.1:3000/internal/notify-tick", { method: "POST", headers });
}

// 트레이서: 스케줄러 호출 → OIDC 검증 → advisory lock tick → notification_log 행.
describe("notify-tick 트레이서", () => {
  it("검증된 호출 한 번이 A의 알림 한 건을 남기고, 재호출은 sent 0, 기대 이메일이 없으면 401", async () => {
    const userA = await createUser("notify-a");
    const userB = await createUser("notify-b");
    const signer = createTestSigner();
    const kind = createTestConditionKind([
      testCandidate({ recipientId: userA, entityId: "T-0001", referenceDate: "2026-10-07" }),
    ]);
    const deps: Partial<NotifyTickHandlerDeps> = {
      config: { audience: AUDIENCE, schedulerSa: SCHEDULER_SA, oidcDisabled: false },
      verify: (authorization, expected) =>
        verifySchedulerToken(authorization, expected, { getCerts: signer.getCerts }),
      // KST 수요일 09:00
      runTick: () => runTick({ conditionKinds: [kind], now: () => new Date("2026-10-07T00:00:00Z") }),
    };
    const token = signer.sign({ aud: AUDIENCE, email: SCHEDULER_SA });

    const first = await handleNotifyTick(tickRequest(token), deps);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ sent: 1, skipped: 0, remaining: 0 });

    const aRows = await rowsFor(userA);
    expect(aRows).toHaveLength(1);
    expect(aRows[0]?.message).toBe("테스트 알림 · T-0001");
    // 이메일 단계가 없는 이 시점의 값 — 04.2-10이 skipped_no_smtp로 바꾼다.
    expect(aRows[0]?.emailStatus).toBe("pending");
    expect(await rowsFor(userB)).toHaveLength(0);

    const second = await handleNotifyTick(tickRequest(token), deps);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ sent: 0, skipped: 1, remaining: 0 });
    expect(await rowsFor(userA)).toHaveLength(1);

    const closed = await handleNotifyTick(tickRequest(token), {
      ...deps,
      config: { audience: AUDIENCE, schedulerSa: null, oidcDisabled: false },
    });
    expect(closed.status).toBe(401);
    expect(await closed.json()).toEqual({ error: "unauthorized" });
    expect(await db.select().from(notificationLog)).toHaveLength(1);
  });
});
