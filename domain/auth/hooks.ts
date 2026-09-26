import { createAuthMiddleware, APIError } from "better-auth/api";
import { log } from "@/lib/log";
import { CLIENT_IP_HEADER } from "@/lib/client-ip";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { countOpenFailures, recordAttempt, resolveOpenFailures } from "@/repositories/login-attempts";
import { isLocked, lockoutConfig, recordLoginFailure, windowStart, LOCKED_MESSAGE } from "@/domain/auth/lockout";
import { findUserByEmail } from "@/repositories/users";
import { recordAction } from "@/domain/action-log/record";
import type { Viewer } from "@/domain/viewer";

// AUTH-01·Eng Issue 5: better-auth에는 계정 잠금이 없다(rateLimit은 IP 단위일 뿐).
// before가 로그인 시도 전에 login_attempts를 확인해 거부하고, after가 결과를
// 기록·초기화한다. 사용자 존재 여부와 무관하게 동일하게 동작한다.

// better-auth의 ctx.body는 any다 — 훅 경로 전체에 걸친 공용 타입이라 요청마다
// 모양이 다르기 때문. email 필드만 안전하게 꺼낸다(no-unsafe-member-access).
function getBodyEmail(body: unknown): string {
  if (body !== null && typeof body === "object" && "email" in body) {
    const value = (body as { email?: unknown }).email;
    if (typeof value === "string") return value.toLowerCase();
  }
  return "";
}

// 03-07: read_first의 sign-in.mjs 315-335행 — better-auth 1.7.5 핸들러가
// 사용자 부재 경로에서 쓰는 오류 구성의 거울(mirror)이다. 정본은
// @better-auth/core(직접 의존성 아님 — pnpm 엄격 해석에서 import 불가,
// node_modules/.pnpm/@better-auth+core@1.7.5*/node_modules/@better-auth/core/
// dist/error/codes.mjs 11행이 실물)이고, `auth.$ERROR_CODES`는 lib/auth.ts가
// 이 파일을 import해 순환이 된다. 문구가 어긋나면 test/integration/
// archive.test.ts의 깊은 비교(better-auth의 실제 잘못된 비밀번호 응답과
// 대조)가 잡는다.
const INVALID_EMAIL_OR_PASSWORD = { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" };

function getBodyPassword(body: unknown): string {
  if (body !== null && typeof body === "object" && "password" in body) {
    const value = (body as { password?: unknown }).password;
    if (typeof value === "string") return value;
  }
  return "";
}

export const before = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/sign-in/email") return;

  // fail-closed: proxy.ts를 지나지 않은 로그인 요청(x-client-ip 없음)은 IP null로
  // 공용 rateLimit 버킷에 조용히 흘러가는 대신 500으로 멈춘다(better-auth Eng OV-2).
  if (!ctx.headers?.get(CLIENT_IP_HEADER)) {
    log.error("auth.client_ip_missing", { path: ctx.path });
    throw new APIError("INTERNAL_SERVER_ERROR", { message: "요청 정보가 올바르지 않습니다." });
  }

  const email = getBodyEmail(ctx.body);

  // ADMN-12(03-07): 보관된 사용자의 로그인을 거부한다. 사용자 존재 여부와
  // 무관하게 동일하게 동작한다는 10행 원칙을 상태·본문·응답 시간 셋에서
  // 지킨다 — 거부 직전에 핸들러의 사용자 부재 경로와 같은 더미 해시를
  // 수행해 해시 비교 전에 짧게 끊는 시간 측면 채널을 막는다.
  const user = await findUserByEmail(SYSTEM_VIEWER, email);
  if (user?.archivedAt) {
    await ctx.context.password.hash(getBodyPassword(ctx.body));
    throw APIError.from("UNAUTHORIZED", INVALID_EMAIL_OR_PASSWORD);
  }

  const { threshold, windowMinutes } = await lockoutConfig();
  const count = await countOpenFailures(SYSTEM_VIEWER, email, windowStart(new Date(), windowMinutes));
  if (isLocked(count, threshold)) {
    throw new APIError("FORBIDDEN", { message: LOCKED_MESSAGE });
  }
});

// better-auth의 ctx.context.newSession도 any다 — getBodyEmail과 같은 결로
// 필요한 필드만 안전하게 꺼낸다. roleId는 lib/auth.ts가 input:false로 등록한
// 추가 필드라 세션 사용자에 실려 온다.
function getSessionActor(newSession: unknown): Viewer | null {
  if (newSession === null || typeof newSession !== "object" || !("user" in newSession)) return null;
  const user = (newSession as { user?: unknown }).user;
  if (user === null || typeof user !== "object") return null;
  const id = (user as { id?: unknown }).id;
  if (typeof id !== "string") return null;
  const roleId = (user as { roleId?: unknown }).roleId;
  return { id, roleId: typeof roleId === "string" ? roleId : null };
}

export const after = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/sign-in/email") return;

  const email = getBodyEmail(ctx.body);
  const success = Boolean(ctx.context.newSession);
  // 원본 포워딩 헤더를 직접 읽지 않는다 — 그 헤더의 첫 항목은 클라이언트가
  // 위조할 수 있고, IP 규칙은 lib/client-ip.ts 한 곳에만 둔다.
  const ip = ctx.headers?.get(CLIENT_IP_HEADER) ?? null;

  if (success) {
    await recordAttempt(SYSTEM_VIEWER, { email, success, ip, attemptedAt: new Date() });
    await resolveOpenFailures(SYSTEM_VIEWER, email, "success");

    // OPS-05가 핵심 행동으로 명시한 「로그인」의 유일한 기록 지점이다.
    // 성공한 로그인만 남긴다 — 실패 시도는 login_attempts가 잠금 목적으로
    // 이미 기록하고, 행동 로그는 "누가 무엇을 했는가"의 감사 기록이라
    // 실패까지 섞으면 잡음이 된다(같은 파일 머리 주석의 역할 분담).
    // recordAttempt와 마찬가지로 감싸지 않고 await한다 — 둘 다 같은 DB에
    // 쓰므로, 여기서 실패할 상황이면 바로 위 recordAttempt에서 이미 실패한다.
    const actor = getSessionActor(ctx.context.newSession);
    if (actor) await recordAction(actor, { actionType: "login" });
    return;
  }

  // 같은 이메일의 실패는 이메일 키 잠금으로 줄을 서 잠금 기록이 정확히 1회 남는다.
  // 잠긴 뒤에는 before 훅이 거부해 after가 돌지 않는다.
  await recordLoginFailure(email, ip);
});
