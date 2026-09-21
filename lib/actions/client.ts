import { createSafeActionClient } from "next-safe-action";
import { getSession } from "@/lib/viewer";
import { handleServerError } from "@/lib/actions/handle-server-error";
import { UserFacingError } from "@/lib/actions/user-facing-error";

// Issue 2: 이 파일이 이후 모든 페이즈의 유일한 Server Action 진입점이다
// ("use server" 파일은 이 이름으로만 감싼다 — 01-04 린트가 강제한다).
//
// handleServerError 자체(ZodError 가공 + UserFacingError 화이트리스트 +
// 그 외 Error 차단·로그)는 lib/actions/handle-server-error.ts로 뺐다 —
// defect 1(원시 SQL·내부 id 유출) 수정, 그 파일의 head 주석 참고.
export const actionClient = createSafeActionClient({ handleServerError });

export const authedActionClient = actionClient.use(async ({ next }) => {
  const session = await getSession();
  if (!session) {
    throw new UserFacingError("로그인이 필요합니다.");
  }
  // viewer 투영: repositories가 scopeFor(viewer)로 쓸 최소 정보만 ctx에 싣는다.
  return next({ ctx: { viewer: session.viewer, user: session.user } });
});
