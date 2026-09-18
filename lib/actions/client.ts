import { createSafeActionClient } from "next-safe-action";
import { getSession } from "@/lib/viewer";

// Issue 2: 이 파일이 이후 모든 페이즈의 유일한 Server Action 진입점이다
// ("use server" 파일은 이 이름으로만 감싼다 — 01-04 린트가 강제한다).
export const actionClient = createSafeActionClient({
  handleServerError(e) {
    return e instanceof Error ? e.message : "서버 오류가 발생했습니다.";
  },
});

export const authedActionClient = actionClient.use(async ({ next }) => {
  const session = await getSession();
  if (!session) {
    throw new Error("로그인이 필요합니다.");
  }
  // viewer 투영: repositories가 scopeFor(viewer)로 쓸 최소 정보만 ctx에 싣는다.
  return next({ ctx: { viewer: session.viewer, user: session.user } });
});
