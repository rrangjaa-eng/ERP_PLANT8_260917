import { createAuthMiddleware, APIError, getSessionFromCtx } from "better-auth/api";
import { log } from "@/lib/log";
import { CLIENT_IP_HEADER } from "@/lib/client-ip";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { recordAttempt, resolveOpenFailures } from "@/repositories/login-attempts";
import { reserveLoginAttempt, settleLoginFailure } from "@/domain/auth/lockout";
import { lockedMessage } from "@/domain/auth/locked-message";
import { findUserByEmail, setFirstLoginAtIfUnset } from "@/repositories/users";
import { recordAction } from "@/domain/action-log/record";
import type { Viewer } from "@/domain/viewer";
import { toKstDate } from "@/domain/holidays/business-day";

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

// 07.1-10 D-7121: 퇴사일이 오늘(KST)보다 앞이거나 보관됐으면 참 — 로그인 갈래와 세션 갈래가 같은 규칙을 쓴다.
export function retiredOrArchived(
  user: { archivedAt?: Date | null; resignationDate?: string | null },
  today: string,
): boolean {
  return Boolean(user.archivedAt) || Boolean(user.resignationDate && user.resignationDate < today);
}

// D-E6(사용자 결정 2026-10-27): 퇴사 · 보관된 사람의 남은 쿠키로도 열어 두는 better-auth 경로 — 로그인 · 로그아웃 ·
// 비밀번호 재설정만. 1.7.5 실물 경로 틀(ctx.path는 엔드포인트 경로 틀 그대로다). 이 밖은 전부 판정한다(거부 기본).
export const RETIRED_SESSION_ALLOWED_PATHS: ReadonlySet<string> = new Set([
  "/sign-in/email",
  "/sign-in/social",
  "/callback/:id",
  "/sign-out",
  "/request-password-reset",
  "/reset-password",
  "/reset-password/:token",
]);

export const before = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/sign-in/email") {
    // 07.1-10 D-7121: better-auth 자체 엔드포인트는 lib/viewer.ts의 판정을 지나지 않아, 퇴사 · 보관된 사람의 쿠키로
    // 만료일까지 비밀번호 변경 · 세션 목록 읽기가 됐다. HTTP 요청만 판정한다 — 서버 내부 auth.api 호출(ctx.request 없음)은
    // 앱 경로라 lib/viewer.ts가 null로 로그인 이동시킨다(E-P1-09). 세션은 getSessionFromCtx로 읽는다 — 엔드포인트를
    // 함수로 직접 불러 훅을 다시 타지 않는다(E-P2-30). 읽은 값은 ctx.context에 캐시되므로 되돌린다 — 그대로 두면
    // 엔드포인트의 sessionMiddleware가 갱신 없이 읽은 세션을 재사용해 재직자의 세션 연장이 빠진다.
    if (!ctx.request || RETIRED_SESSION_ALLOWED_PATHS.has(ctx.path)) return;
    const cached = ctx.context.session;
    const session = await getSessionFromCtx(ctx, { disableRefresh: true });
    ctx.context.session = cached;
    if (!session || !retiredOrArchived(session.user as { archivedAt?: Date | null; resignationDate?: string | null }, toKstDate(new Date()))) {
      return;
    }
    try {
      await ctx.context.internalAdapter.deleteUserSessions(session.user.id);
    } catch (e) {
      log.error("auth.retired_session_delete_failed", { userId: session.user.id, name: e instanceof Error ? e.name : typeof e });
    }
    // better-auth sessionMiddleware 거부와 같은 모양 — 퇴직 여부를 문구로 드러내지 않는다(SC-14). 삭제가 실패해도 거부(fail-closed).
    throw APIError.from("UNAUTHORIZED", { message: "Unauthorized", code: "UNAUTHORIZED" });
  }

  // fail-closed: proxy.ts를 지나지 않은 로그인 요청(x-client-ip 없음)은 IP null로
  // 공용 rateLimit 버킷에 조용히 흘러가는 대신 500으로 멈춘다(better-auth Eng OV-2).
  if (!ctx.headers?.get(CLIENT_IP_HEADER)) {
    log.error("auth.client_ip_missing", { path: ctx.path });
    throw new APIError("INTERNAL_SERVER_ERROR", { message: "요청 정보 오류" });
  }

  const email = getBodyEmail(ctx.body);

  // ADMN-12(03-07): 보관된 사용자의 로그인을 거부한다. 사용자 존재 여부와
  // 무관하게 동일하게 동작한다는 10행 원칙을 상태·본문·응답 시간 셋에서
  // 지킨다 — 거부 직전에 핸들러의 사용자 부재 경로와 같은 더미 해시를
  // 수행해 해시 비교 전에 짧게 끊는 시간 측면 채널을 막는다.
  // 07-09 D-743: 퇴직일이 오늘(KST)보다 앞이면 보관과 같은 거부 — 당일까지는 로그인된다.
  // 퇴직 여부를 문구로 드러내지 않는다(SC-14). 사용자 결정 2026-10-22: 퇴직 · 보관 거부도 같은 잠금 계수를 지난다 —
  // 미리 기록 → 더미 해시 → 다시 세기가 재직자의 before → 핸들러 → after와 같은 순서라, 잠기는 횟수 · 상태 · 문구로도
  // 계정 상태가 드러나지 않는다.
  const user = await findUserByEmail(SYSTEM_VIEWER, email);
  const blocked = user ? retiredOrArchived(user, toKstDate(new Date())) : false;

  // 07-09 FA-1(/cso F1): 잠금 확인과 실패 행 미리 기록이 이메일 잠금 아래 한 트랜잭션 — 동시 시도도 임계를 넘어 검사되지 않는다.
  const ip = ctx.headers?.get(CLIENT_IP_HEADER) ?? null;
  const { locked, windowMinutes } = await reserveLoginAttempt(email, ip);
  if (locked) {
    throw new APIError("FORBIDDEN", { message: lockedMessage(windowMinutes) });
  }

  if (blocked) {
    await ctx.context.password.hash(getBodyPassword(ctx.body));
    const settled = await settleLoginFailure(email);
    if (settled.locked) throw new APIError("FORBIDDEN", { message: lockedMessage(settled.windowMinutes) });
    throw APIError.from("UNAUTHORIZED", INVALID_EMAIL_OR_PASSWORD);
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

  // 07-09 FA-1: 실패 행은 before가 미리 남겼다 — 여기서는 다시 세어 임계에 닿았으면 잠금 기록을 확인한다.
  // 잠긴 뒤에는 before 훅이 거부해 after가 돌지 않는다.
  // /qa ISSUE-002(사용자 결정 2026-10-22): 임계에 닿은 N번째 실패부터 403 잠금 문구 — 로그인 전 훅의 잠금 403과 같은
  // 본문. after가 던진 APIError는 HTTP 경로에서 상태가 핸들러의 401로 남으므로, 요청형 문맥에서는 훅 반환 계약대로
  // Response를 돌려준다(응답을 갈아 끼운다). 요청 없는 auth.api 직접 호출은 값으로 Response가 새지 않게 던진다.
  const { locked, windowMinutes } = await settleLoginFailure(email);
  if (!locked) return;
  const error = new APIError("FORBIDDEN", { message: lockedMessage(windowMinutes) });
  if (!ctx.request) throw error;
  return new Response(JSON.stringify(error.body), {
    status: error.statusCode,
    headers: { "content-type": "application/json" },
  });
});

// D8-07: better-auth databaseHooks.session.create.after의 처리 함수(lib/auth.ts가 등록). 로그인 방식·경로·
// 로그인 로그 설정과 무관하게 세션이 만들어질 때마다 한 번 돌고, first_login_at이 NULL일 때만 채운다.
// 기록 실패는 잡아 에러 로그만 남긴다(CEO-2) — 배지용 칼럼이 로그인을 막지 않고, 값이 NULL로 남아
// 다음 로그인에서 다시 시도된다. 로그에는 userId와 오류 이름만(메시지는 값을 담을 수 있다).
export async function recordFirstLogin(
  session: { userId: string },
  context: unknown,
  deps?: { setFirstLoginAtIfUnset?: typeof setFirstLoginAtIfUnset },
): Promise<void> {
  void context;
  try {
    await (deps?.setFirstLoginAtIfUnset ?? setFirstLoginAtIfUnset)(SYSTEM_VIEWER, session.userId, new Date());
  } catch (e) {
    log.error("auth.first_login_record_failed", { userId: session.userId, name: e instanceof Error ? e.name : typeof e });
  }
}
