import { env, type Env } from "@/lib/env";
import { log } from "@/lib/log";
import { verifySchedulerToken, type SchedulerTokenResult } from "@/lib/oidc";
import { runTick as defaultRunTick, type TickResult } from "@/domain/notify/tick";

export type NotifyTickHandlerDeps = {
  config: { audience: string | null; schedulerSa: string | null; oidcDisabled: boolean };
  verify: (
    authorization: string | null,
    expected: { audience: string | null; email: string | null },
  ) => Promise<SchedulerTokenResult>;
  runTick: (opts: { requestStartedAtMs: number }) => Promise<TickResult>;
  // 요청 예산의 기준 시계(04.2-10) — 기본 performance.now.
  monotonicNow: () => number;
  oidcDeadlineMs: number;
};

// 토큰 검증(인증서 조회 — 부작용 없는 GET) 한도. 넘으면 500 tick_failed(04.2-10 실행 예산).
export const OIDC_VERIFY_DEADLINE_MS = 10_000;

async function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`토큰 검증이 ${ms}ms 안에 끝나지 않았습니다.`)), ms);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

// 서비스 환경 변수 → 검증 설정. 빈 문자열은 null로 쳐서 검증기가 not_configured로
// 닫게 한다. 검증 끄기는 로컬에서 정확히 "1"일 때만 — 로컬 밖이면 lib/env.ts가
// 파싱을 실패시키고 deploy.sh도 exit 2로 막는다.
export function schedulerConfigFromEnv(
  source: Pick<Env, "APP_ENV" | "BETTER_AUTH_URL" | "NOTIFY_TICK_SCHEDULER_SA" | "NOTIFY_TICK_OIDC_DISABLED">,
): NotifyTickHandlerDeps["config"] {
  return {
    audience: source.BETTER_AUTH_URL || null,
    schedulerSa: source.NOTIFY_TICK_SCHEDULER_SA || null,
    oidcDisabled: source.APP_ENV === "local" && source.NOTIFY_TICK_OIDC_DISABLED === "1",
  };
}

const defaultConfig = schedulerConfigFromEnv(env);

// Cloud Scheduler가 부르는 tick 한 번 — 검증 → tick → 응답 코드. 로그에는 사유·
// 건수·예외 메시지만 싣는다(토큰·이메일·알림 내용 없음).
export async function handleNotifyTick(
  request: Request,
  deps?: Partial<NotifyTickHandlerDeps>,
): Promise<Response> {
  const requestStartedAtMs = (deps?.monotonicNow ?? (() => performance.now()))();
  const config = deps?.config ?? defaultConfig;
  const verify = deps?.verify ?? verifySchedulerToken;
  const runTick = deps?.runTick ?? defaultRunTick;
  const oidcDeadlineMs = deps?.oidcDeadlineMs ?? OIDC_VERIFY_DEADLINE_MS;

  try {
    if (config.oidcDisabled) {
      log.warn("notify.tick_oidc_disabled");
    } else {
      const verdict = await withDeadline(
        verify(request.headers.get("authorization"), {
          audience: config.audience,
          email: config.schedulerSa,
        }),
        oidcDeadlineMs,
      );
      if (!verdict.ok) {
        log.warn("notify.tick_unauthorized", { reason: verdict.reason });
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
    }

    const result = await runTick({ requestStartedAtMs });
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
