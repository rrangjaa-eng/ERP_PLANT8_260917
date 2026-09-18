import { createAuthMiddleware, APIError } from "better-auth/api";
import { log } from "@/lib/log";
import { CLIENT_IP_HEADER } from "@/lib/client-ip";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { countOpenFailures, recordAttempt, resolveOpenFailures } from "@/repositories/login-attempts";
import { isLocked, lockoutConfig, windowStart, LOCKED_MESSAGE } from "@/domain/auth/lockout";

// AUTH-01·Eng Issue 5: better-auth에는 계정 잠금이 없다(rateLimit은 IP 단위일 뿐).
// before가 로그인 시도 전에 login_attempts를 확인해 거부하고, after가 결과를
// 기록·초기화한다. 사용자 존재 여부와 무관하게 동일하게 동작한다.

export const before = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/sign-in/email") return;

  // fail-closed: proxy.ts를 지나지 않은 로그인 요청(x-client-ip 없음)은 IP null로
  // 공용 rateLimit 버킷에 조용히 흘러가는 대신 500으로 멈춘다(better-auth Eng OV-2).
  if (!ctx.headers?.get(CLIENT_IP_HEADER)) {
    log.error("auth.client_ip_missing", { path: ctx.path });
    throw new APIError("INTERNAL_SERVER_ERROR", { message: "요청 정보가 올바르지 않습니다." });
  }

  const email = String(ctx.body?.email ?? "").toLowerCase();
  const { threshold, windowMinutes } = lockoutConfig();
  const count = await countOpenFailures(SYSTEM_VIEWER, email, windowStart(new Date(), windowMinutes));
  if (isLocked(count, threshold)) {
    throw new APIError("FORBIDDEN", { message: LOCKED_MESSAGE });
  }
});

export const after = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/sign-in/email") return;

  const email = String(ctx.body?.email ?? "").toLowerCase();
  const success = Boolean(ctx.context.newSession);
  // 원본 포워딩 헤더를 직접 읽지 않는다 — 그 헤더의 첫 항목은 클라이언트가
  // 위조할 수 있고, IP 규칙은 lib/client-ip.ts 한 곳에만 둔다.
  const ip = ctx.headers?.get(CLIENT_IP_HEADER) ?? null;

  await recordAttempt(SYSTEM_VIEWER, { email, success, ip, attemptedAt: new Date() });

  if (success) {
    await resolveOpenFailures(SYSTEM_VIEWER, email, "success");
    return;
  }

  // at-least-once: 동시 실패 둘이 4→6으로 건너뛰어도 이벤트가 누락되지 않는다.
  // 잠긴 뒤에는 before 훅이 거부해 after가 돌지 않으므로 순차 실행에서는
  // 정확히 1회, 동시 실행에서만 드물게 2회 남는다.
  const { threshold, windowMinutes } = lockoutConfig();
  const count = await countOpenFailures(SYSTEM_VIEWER, email, windowStart(new Date(), windowMinutes));
  if (isLocked(count, threshold)) {
    log.info("auth.lockout", { email, threshold, windowMinutes });
  }
});
