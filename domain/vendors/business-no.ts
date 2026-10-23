// 07-20 V5: 사업자 번호 모양 · 검증 숫자 — import 없는 순수 모듈(domain/vendors/index.ts에서 옮김). 패널 blur(클라이언트)와 서버 저장 판정이 같은 함수를 쓴다.

const BUSINESS_NO_PROBLEM_MESSAGE = "사업자 번호 확인 · 다시 입력";

// 숫자만 뽑은 사업자번호 — SQL `regexp_replace(…, '[^0-9]', '', 'g')`와 같은 결과. 숫자가 없으면 null.
export function businessNoDigits(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits === "" ? null : digits;
}

// 사업자번호 모양 · 검증 숫자 — 비어 있으면 통과(번호는 필수가 아니다). 국세청 규칙(260907 server/src/vendors.ts:252-259 bizNumberChecksumOk와 같다):
// 앞 아홉 자리 가중합 + 아홉째×5의 십의 자리. 문구는 UI-SPEC SC-17 하나(260907은 「열 자리」 · 「검증 숫자」 둘로 갈랐다 — :270-271).
export function businessNoProblem(raw: string | null | undefined): string | null {
  if ((raw ?? "").trim() === "") return null;
  const digits = businessNoDigits(raw);
  if (digits === null || digits.length !== 10) return BUSINESS_NO_PROBLEM_MESSAGE;
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const sum = weights.reduce((acc, weight, i) => acc + Number(digits[i]) * weight, 0) + Math.floor((Number(digits[8]) * 5) / 10);
  return (10 - (sum % 10)) % 10 === Number(digits[9]) ? null : BUSINESS_NO_PROBLEM_MESSAGE;
}
