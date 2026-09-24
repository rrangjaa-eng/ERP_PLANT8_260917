import { describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { notificationLog, notifyTickRuns } from "@/db/schema";
import { log } from "@/lib/log";
import { createAccount } from "@/domain/auth/accounts";
import { runTick } from "@/domain/notify/tick";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { verifySchedulerToken } from "@/lib/oidc";
import { handleNotifyTick, type NotifyTickHandlerDeps } from "@/app/internal/notify-tick/handle";
import { createTestConditionKind, createTestSigner, testCandidate } from "@/test/support/notify-tick";
import type { NotificationCandidate } from "@/domain/notify/condition-kinds";

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

const OTHER_CALLER = "other-caller@test.invalid";

// 로그 비노출 단언용 — warn·info·error 인자 전부를 JSON 문자열 하나로 모은다.
function spyLogs() {
  const spies = [vi.spyOn(log, "warn"), vi.spyOn(log, "info"), vi.spyOn(log, "error")] as const;
  return {
    warn: spies[0],
    text: () => JSON.stringify(spies.map((spy) => spy.mock.calls)),
    restore: () => spies.forEach((spy) => spy.mockRestore()),
  };
}

function expectNoCallerInfo(logText: string, tokens: readonly string[]): void {
  for (const token of tokens) expect(logText).not.toContain(token);
  expect(logText).not.toContain("scheduler@test.invalid");
  expect(logText).not.toContain(OTHER_CALLER);
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

// T-4.2-111·T-4.2-114: 거부된 호출은 tick을 돌리지 않고, 로그에는 사유만 남는다.
describe("notify-tick 거부 경로(설정 주입)", () => {
  function setup(signer: ReturnType<typeof createTestSigner>, recipientId: string) {
    const kind = createTestConditionKind([
      testCandidate({ recipientId, entityId: "T-0001", referenceDate: "2026-10-07" }),
    ]);
    const deps: Partial<NotifyTickHandlerDeps> = {
      config: { audience: AUDIENCE, schedulerSa: SCHEDULER_SA, oidcDisabled: false },
      verify: (authorization, expected) =>
        verifySchedulerToken(authorization, expected, { getCerts: signer.getCerts }),
      runTick: () => runTick({ conditionKinds: [kind], now: NOW }),
    };
    return { kind, deps };
  }

  it("토큰 없음 → 401 · missing_token 경고 1회 · tick 행 0", async () => {
    const user = await createUser("auth-missing");
    const { kind, deps } = setup(createTestSigner(), user);
    const logs = spyLogs();
    try {
      const response = await handleNotifyTick(tickRequest(null), deps);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized" });
      expect(logs.warn.mock.calls.filter(([event]) => event === "notify.tick_unauthorized")).toEqual([
        ["notify.tick_unauthorized", { reason: "missing_token" }],
      ]);
      expect(kind.evaluations()).toBe(0);
      expect(await tickRowCounts()).toEqual({ log: 0, runs: 0 });
      expectNoCallerInfo(logs.text(), []);
    } finally {
      logs.restore();
    }
  });

  it("다른 호출자 이메일 토큰 → 401 · unexpected_caller · tick 행 0 · 토큰·이메일이 로그에 없다", async () => {
    const user = await createUser("auth-other");
    const signer = createTestSigner();
    const { kind, deps } = setup(signer, user);
    const token = signer.sign({ aud: AUDIENCE, email: OTHER_CALLER });
    const logs = spyLogs();
    try {
      const response = await handleNotifyTick(tickRequest(token), deps);
      expect(response.status).toBe(401);
      expect(logs.warn.mock.calls.filter(([event]) => event === "notify.tick_unauthorized")).toEqual([
        ["notify.tick_unauthorized", { reason: "unexpected_caller" }],
      ]);
      expect(kind.evaluations()).toBe(0);
      expect(await tickRowCounts()).toEqual({ log: 0, runs: 0 });
      expectNoCallerInfo(logs.text(), [token]);
    } finally {
      logs.restore();
    }
  });
});

// T-4.2-112(Codex #11): 보장은 「인증된 호출 + 발생 단위 멱등」 — 유효 기간 안의 같은
// 토큰 재생은 정상 tick과 같게 동작하고, 원장 키가 같은 발생을 두 번 넣지 못한다.
// 요청 단위 재생 거부(jti 원장 등)는 요구 밖이라 만들지 않았다.
describe("notify-tick 재생(같은 토큰)", () => {
  it("후보 그대로면 sent 0, 새 발생이 생기면 그 발생만 처리된다", async () => {
    const user = await createUser("auth-replay");
    const signer = createTestSigner();
    const occurrences: NotificationCandidate[] = [
      testCandidate({ recipientId: user, entityId: "T-0001", referenceDate: "2026-10-06" }),
    ];
    const kind = createTestConditionKind(() => occurrences);
    const deps: Partial<NotifyTickHandlerDeps> = {
      config: { audience: AUDIENCE, schedulerSa: SCHEDULER_SA, oidcDisabled: false },
      verify: (authorization, expected) =>
        verifySchedulerToken(authorization, expected, { getCerts: signer.getCerts }),
      runTick: () => runTick({ conditionKinds: [kind], now: NOW }),
    };
    const token = signer.sign({ aud: AUDIENCE, email: SCHEDULER_SA });
    const logs = spyLogs();
    try {
      const first = await handleNotifyTick(tickRequest(token), deps);
      expect(await first.json()).toEqual({ sent: 1, skipped: 0, remaining: 0 });

      const replay = await handleNotifyTick(tickRequest(token), deps);
      expect(replay.status).toBe(200);
      expect(await replay.json()).toEqual({ sent: 0, skipped: 1, remaining: 0 });

      occurrences.push(testCandidate({ recipientId: user, entityId: "T-0002", referenceDate: "2026-10-07" }));
      const afterNew = await handleNotifyTick(tickRequest(token), deps);
      expect(afterNew.status).toBe(200);
      expect(await afterNew.json()).toEqual({ sent: 1, skipped: 1, remaining: 0 });

      const rows = await db.select().from(notificationLog);
      expect(rows.map((row) => row.message).sort()).toEqual(["테스트 알림 · T-0001", "테스트 알림 · T-0002"]);
      expectNoCallerInfo(logs.text(), [token]);
    } finally {
      logs.restore();
    }
  });
});
