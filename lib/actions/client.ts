import { createSafeActionClient } from "next-safe-action";
import { getSession } from "@/lib/viewer";
import { handleServerError } from "@/lib/actions/handle-server-error";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { checkPayloadSize } from "@/lib/actions/payload-size";

// Issue 2: 이 파일이 이후 모든 페이즈의 유일한 Server Action 진입점이다
// ("use server" 파일은 이 이름으로만 감싼다 — 01-04 린트가 강제한다).
//
// handleServerError 자체(ZodError 가공 + UserFacingError 화이트리스트 +
// 그 외 Error 차단·로그)는 lib/actions/handle-server-error.ts로 뺐다 —
// defect 1(원시 SQL·내부 id 유출) 수정, 그 파일의 head 주석 참고.
export const actionClient = createSafeActionClient({ handleServerError });

// 04-04 Task 2 ③ — 요청 본문 크기 한도. next.config.ts의
// serverActions.bodySizeLimit(프레임워크 전송 계층)과 이 미들웨어 둘 중
// 하나만 둔다(어느 쪽이 먼저 걸리는지 모호해지지 않게). 프레임워크 한도는
// 우리 코드가 실행되기 전에 걸려 "이유 문자열과 함께 거부"를 만들 수
// 없고(자체 에러 페이지/네트워크 오류일 뿐이다), 통합 테스트가 직접
// 호출할 수 있는 지점도 아니다(HTTP 전송 계층 자체를 흉내내야 한다) —
// 그래서 이 미들웨어를 "실제로 동작하는 자리"로 택했다: getSession()보다
// 먼저 걸려 세션 없이도(로그인 전에도) 즉시 거부되고, UserFacingError로
// 던지므로 이유 문자열이 화면까지 그대로 간다. 판정 로직 자체는
// lib/actions/payload-size.ts(순수 함수)에 있다 — server-only 가드 없는
// 파일이라 통합 테스트가 직접 부를 수 있다.
export const authedActionClient = actionClient.use(async ({ next, clientInput }) => {
  const sizeCheck = checkPayloadSize(clientInput);
  if (!sizeCheck.ok) {
    throw new UserFacingError(sizeCheck.reason);
  }

  const session = await getSession();
  if (!session) {
    throw new UserFacingError("로그인 필요 · 다시 로그인");
  }
  // viewer 투영: repositories가 scopeFor(viewer)로 쓸 최소 정보만 ctx에 싣는다.
  return next({ ctx: { viewer: session.viewer, user: session.user } });
});

// 04.3-02 Task 2 ⑫ — 확인증 공개 액션 전용. 세션을 읽지 않는다(ctx 없음) —
// `app/c/**`만 이 클라이언트를 쓰고, 범위는 domain이 토큰 해시·행사 id로
// 좁힌다. 본문 크기 한도만 authedActionClient와 같은 미들웨어를 쓴다.
export const publicActionClient = actionClient.use(async ({ next, clientInput }) => {
  const sizeCheck = checkPayloadSize(clientInput);
  if (!sizeCheck.ok) {
    throw new UserFacingError(sizeCheck.reason);
  }
  return next({ ctx: {} });
});
