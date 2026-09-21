import { ZodError } from "zod";
import { log } from "@/lib/log";
import { koreanZodErrorMessage } from "@/lib/actions/zod-error-message";
import { UserFacingError } from "@/lib/actions/user-facing-error";

// defect 1(운영 DOM 감사): 법인카드 중복 등록 시 drizzle의 DrizzleQueryError.message가
// "Failed query: insert into ... returning ...\nparams: ..., <내부 user id>, ..."를
// 그대로 담고 있었고, 예전 handleServerError(e instanceof Error ? e.message : ...)가
// 그걸 그대로 client의 result.serverError로 내보냈다. ZodError 하나만 가공하는
// 이전 수정(zod-error-message.ts)은 그 사례 하나만 막았을 뿐 구조는 그대로였다
// (denylist — 분류되지 않은 모든 Error가 새는 기본값).
//
// 이 파일이 그 구조를 뒤집는다(allowlist): domain·repositories가 사용자에게
// 보여줄 의도로 던지는 오류만 UserFacingError(lib/actions/user-facing-error.ts)
// 또는 그 하위 클래스(예: domain/permissions/matrix.ts의 ForbiddenError)로 던지고,
// 그 외 모든 Error는 message를 화면에 내보내지 않는다 — 원본은 log.error로
// 서버에만 남겨 디버깅 가능성을 유지한다. lib/actions/client.ts에서 함수를
// 분리해 둔 이유는 zod-error-message.ts와 같다 — DB·세션 없이 단위 테스트가
// 돌아야 한다("use server" 파일도 아니고 getSession 의존도 없다).
const GENERIC_ERROR_MESSAGE = "처리 중 오류가 발생했습니다 · 잠시 후 다시 시도해 주세요";

export function handleServerError(e: Error): string {
  if (e instanceof ZodError) return koreanZodErrorMessage(e);
  if (e instanceof UserFacingError) return e.message;

  log.error("action.unhandled_error", {
    name: e instanceof Error ? e.name : typeof e,
    message: e instanceof Error ? e.message : String(e),
  });

  return GENERIC_ERROR_MESSAGE;
}
