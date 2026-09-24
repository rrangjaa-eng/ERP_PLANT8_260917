import { describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { notificationLog, notifyTickRuns } from "@/db/schema";
import { log } from "@/lib/log";
import { createAccount } from "@/domain/auth/accounts";
import { runTick } from "@/domain/notify/tick";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { verifySchedulerToken } from "@/lib/oidc";
import { handleNotifyTick } from "@/app/internal/notify-tick/handle";
import { createTestConditionKind, createTestSigner, testCandidate } from "@/test/support/notify-tick";

const AUDIENCE = "https://notify.test.invalid";
const SCHEDULER_SA = "scheduler@test.invalid";
// KST 수요일 09:00
const NOW = () => new Date("2026-10-07T00:00:00Z");

async function createUser(prefix: string): Promise<string> {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const { userId } = await createAccount(SYSTEM_VIEWER, { email, name: prefix });
  return userId;
}

function tickRequest(token: string | null): Request {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request("http://127.0.0.1:3000/internal/notify-tick", { method: "POST", headers });
}

async function tickRowCounts() {
  return {
    log: (await db.select().from(notificationLog)).length,
    runs: (await db.select().from(notifyTickRuns)).length,
  };
}

// Codex #10: 주입한 설정에서만 안전한 상태를 잡는다 — config를 주입하지 않은 기본
// 핸들러는 테스트 환경(NOTIFY_TICK_SCHEDULER_SA 없음) 그대로의 설정을 쓴다.
describe("notify-tick 기본 설정(주입 없음)", () => {
  it("기대 호출자 이메일이 없으면 올바르게 서명된 토큰에도 not_configured 401이고 tick은 돌지 않는다", async () => {
    const user = await createUser("auth-default");
    const signer = createTestSigner();
    const kind = createTestConditionKind([
      testCandidate({ recipientId: user, entityId: "T-0001", referenceDate: "2026-10-07" }),
    ]);
    const token = signer.sign({ aud: "http://127.0.0.1:3000", email: SCHEDULER_SA });
    const warn = vi.spyOn(log, "warn");
    try {
      const response = await handleNotifyTick(tickRequest(token), {
        verify: (authorization, expected) =>
          verifySchedulerToken(authorization, expected, { getCerts: signer.getCerts }),
        runTick: () => runTick({ conditionKinds: [kind], now: NOW }),
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized" });
      expect(warn.mock.calls.filter(([event]) => event === "notify.tick_unauthorized")).toEqual([
        ["notify.tick_unauthorized", { reason: "not_configured" }],
      ]);
      expect(kind.evaluations()).toBe(0);
      expect(await tickRowCounts()).toEqual({ log: 0, runs: 0 });
    } finally {
      warn.mockRestore();
    }
  });
});

// 로컬 전용 우회(env가 APP_ENV=local일 때만 허용) — 검증을 건너뛰고 경고 한 줄.
describe("notify-tick 검증 끄기(oidcDisabled)", () => {
  it("oidcDisabled면 토큰 없이도 tick이 돌고 notify.tick_oidc_disabled 경고를 남긴다", async () => {
    const user = await createUser("auth-disabled");
    const kind = createTestConditionKind([
      testCandidate({ recipientId: user, entityId: "T-0001", referenceDate: "2026-10-07" }),
    ]);
    const verify = vi.fn(verifySchedulerToken);
    const warn = vi.spyOn(log, "warn");
    try {
      const response = await handleNotifyTick(tickRequest(null), {
        config: { audience: null, schedulerSa: null, oidcDisabled: true },
        verify,
        runTick: () => runTick({ conditionKinds: [kind], now: NOW }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ sent: 1, skipped: 0, remaining: 0 });
      expect(verify).not.toHaveBeenCalled();
      expect(warn.mock.calls.filter(([event]) => event === "notify.tick_oidc_disabled")).toHaveLength(1);
    } finally {
      warn.mockRestore();
    }
  });
});
