// 07.4-01 D-7412: 지출결의서 합계 행의 한글 금액 「금 일천삼백육십사만 원정」. 숫자에서 파생하는 순수 함수 — Money 산술이 아니다(number 입력).
// 음수 · 비정수 · 안전 정수 밖이면 던지지 않고 null을 돌려준다 — 비정상 저장값 하나로 서버 렌더 전체가 오류 경계로 가지 않게, 호출부는 그 줄만 그리지 않는다.
const DIGITS = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"] as const;
const SMALL_UNITS = ["", "십", "백", "천"] as const;
const BIG_UNITS = ["", "만", "억", "조"] as const;

// 네 자리 묶음 하나 — 천 · 백 · 십 앞의 1도 「일」을 쓴다.
function groupText(group: number): string {
  let text = "";
  for (let position = 3; position >= 0; position -= 1) {
    const digit = Math.floor(group / 10 ** position) % 10;
    if (digit !== 0) text += `${DIGITS[digit]}${SMALL_UNITS[position]}`;
  }
  return text;
}

export function koreanAmountText(krw: number): string | null {
  if (!Number.isSafeInteger(krw) || krw < 0) return null;
  if (krw === 0) return "금 영 원정";
  let rest = krw;
  let text = "";
  for (let unit = 0; rest > 0; unit += 1) {
    const group = rest % 10_000;
    rest = Math.floor(rest / 10_000);
    // 만 단위 묶음이 0이면 그 단위 글자도 없다.
    if (group !== 0) text = `${groupText(group)}${BIG_UNITS[unit]}${text}`;
  }
  return `금 ${text} 원정`;
}
