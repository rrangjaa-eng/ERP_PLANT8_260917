// 07-20 C-35(D-713): 거래처 계좌번호 자릿수 — import 없는 순수 모듈. 서버 판정(createVendor · updateVendor)과 패널 계좌번호 칸 blur가 같은 함수를 쓴다.
// 260907은 계좌번호를 글자 그대로(최대 40자) 담았다(server/src/vendors.ts:305 bankAccount nullableText(40)) — 우리는 숫자만 10~16자리로 막는다(D-713 「더한 것」).

export const ACCOUNT_DIGITS_MESSAGE = "숫자 10~16자리 · 다시 입력";

// 하이픈 · 공백을 지운 숫자. 빈 값은 빈 값(필수 판정은 계좌 칸 판정 몫), 그 밖에 숫자가 아닌 글자가 있거나 10~16자리 밖이면 오류.
export function normalizeAccountDigits(raw: string): { value: string; error: string | null } {
  const value = raw.replace(/[\s-]/g, "");
  if (value === "") return { value, error: null };
  return { value, error: /^[0-9]{10,16}$/.test(value) ? null : ACCOUNT_DIGITS_MESSAGE };
}

// F6(07-11 넘김): 마스킹 · 계좌 변경 기록의 뒤 4자리 — 숫자만 뽑은 끝 4자리. 숫자가 4자리 미만이면 null
// (계좌 변경 기록 CHECK `^[0-9]{4}$` 또는 NULL — 옛 짧은 번호는 「뒤 4자리 없음」으로 남긴다).
export function accountNumberLast4(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/[^0-9]/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}
