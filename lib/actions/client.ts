import { createSafeActionClient } from "next-safe-action";
import { ZodError } from "zod";
import { getSession } from "@/lib/viewer";
import { koreanZodErrorMessage } from "@/lib/actions/zod-error-message";

// Issue 2: 이 파일이 이후 모든 페이즈의 유일한 Server Action 진입점이다
// ("use server" 파일은 이 이름으로만 감싼다 — 01-04 린트가 강제한다).
//
// domain의 registry.ts 등이 던지는 ZodError(예: setSettingValue의
// def.schema.parse)는 그대로 두면 e.message가 JSON.stringify된 issue
// 배열이라 화면에 원본 스키마 구조가 샌다(재현: /admin/settings에서
// tax.rounding.min_withholding에 음수 입력). ZodError만 사람이 읽는
// 한국어 한 줄로 가공하고, 그 외 Error는 기존대로 message를 쓴다.
export const actionClient = createSafeActionClient({
  handleServerError(e) {
    if (e instanceof ZodError) return koreanZodErrorMessage(e);
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
