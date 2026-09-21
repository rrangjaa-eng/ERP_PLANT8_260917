import type { ZodError, core } from "zod";

// lib/actions/client.ts의 handleServerError가 Error.message를 그대로
// serverError로 내보내는 지점 — ZodError.message는 JSON.stringify된 issue
// 배열이고(zod 4 실측), domain의 registry.ts(setSettingValue 등)가 던지는
// ZodError가 여기까지 가공 없이 올라온다. 화면(예:
// app/(app)/admin/settings/settings-form-client.tsx의 errorMessageOf)은
// serverError를 그대로 붙이기만 하므로, 사람이 읽을 문장으로 바꾸는 지점은
// 이 함수 하나로 둔다 — 화면마다 zod 내부 구조를 다시 파싱하지 않는다.
//
// docs/design/SYSTEM.md §8 카피 규칙 3: 오류는 「원인 · 다음 행동」 한
// 줄(가운뎃점). 제약값(예: 최소 0)은 운영자에게 의미가 있으므로 완전히
// 버리지 않되, 원본 zod 내부 키(code·origin 등)는 절대 새지 않는다.
function describeIssue(issue: core.$ZodIssue): string {
  switch (issue.code) {
    case "too_small": {
      const bound = issue.inclusive ? "이상" : "초과";
      return `${issue.minimum} ${bound}이어야 합니다 · 값을 확인해 주세요`;
    }
    case "too_big": {
      const bound = issue.inclusive ? "이하" : "미만";
      return `${issue.maximum} ${bound}이어야 합니다 · 값을 확인해 주세요`;
    }
    case "invalid_type":
      return "형식이 올바르지 않습니다 · 값을 확인해 주세요";
    case "invalid_value": {
      const options = issue.values.map((value) => String(value)).join(", ");
      return `허용되지 않은 값입니다 · ${options} 중에서 선택해 주세요`;
    }
    case "not_multiple_of":
      return `${issue.divisor}의 배수여야 합니다 · 값을 확인해 주세요`;
    case "invalid_format":
      return "형식이 올바르지 않습니다 · 값을 확인해 주세요";
    default:
      return "입력값이 올바르지 않습니다 · 값을 확인해 주세요";
  }
}

// ZodError 하나를 §8 카피 규칙을 따르는 한국어 한 줄로 접는다. 이슈가
// 여럿이어도 화면 오류 자리는 한 줄이라 첫 이슈만 쓴다(§7-2: 입력 아래
// 오류는 한 줄).
export function koreanZodErrorMessage(error: ZodError): string {
  const [firstIssue] = error.issues;
  if (!firstIssue) return "입력값이 올바르지 않습니다 · 값을 확인해 주세요";
  return describeIssue(firstIssue);
}
