import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { verifySchedulerToken, type SchedulerTokenResult } from "@/lib/oidc";
import { runTick as defaultRunTick, type TickResult } from "@/domain/notify/tick";

export type NotifyTickHandlerDeps = {
  config: { audience: string | null; schedulerSa: string | null; oidcDisabled: boolean };
  verify: (
    authorization: string | null,
    expected: { audience: string | null; email: string | null },
  ) => Promise<SchedulerTokenResult>;
  runTick: () => Promise<TickResult>;
};

// 기대 호출자 이메일(NOTIFY_TICK_SCHEDULER_SA)과 oidcDisabled 연결은 04.2-05 —
// 그 전까지 schedulerSa가 null이라 검증기가 not_configured로 닫는다.
const defaultConfig: NotifyTickHandlerDeps["config"] = {
  audience: env.BETTER_AUTH_URL ?? null,
  schedulerSa: null,
  oidcDisabled: false,
};

// Cloud Scheduler가 부르는 tick 한 번 — 검증 → tick → 응답 코드. 로그에는 사유·
// 건수·예외 메시지만 싣는다(토큰·이메일·알림 내용 없음).
export async function handleNotifyTick(
  request: Request,
  deps?: Partial<NotifyTickHandlerDeps>,
): Promise<Response> {
  const config = deps?.config ?? defaultConfig;
  const verify = deps?.verify ?? verifySchedulerToken;
  const runTick = deps?.runTick ?? defaultRunTick;

  try {
    const verdict = await verify(request.headers.get("authorization"), {
      audience: config.audience,
      email: config.schedulerSa,
    });
    if (!verdict.ok) {
      log.warn("notify.tick_unauthorized", { reason: verdict.reason });
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const result = await runTick();
    if (result.status === "locked") {
      log.warn("notify.tick_locked");
      return Response.json({ sent: 0, skipped: 0, remaining: 0, locked: true }, { status: 409 });
    }
    return Response.json({ sent: result.sent, skipped: result.skipped, remaining: result.remaining });
  } catch (error) {
    log.error("notify.tick", { ok: false, message: error instanceof Error ? error.message : String(error) });
    return Response.json({ error: "tick_failed" }, { status: 500 });
  }
}
