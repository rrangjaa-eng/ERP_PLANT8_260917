// 04.1-06 코드 검토 L4: 조정 일수 칸 글자 → 숫자. 십진수(정수 세 자리 · 소수 두 자리까지, 부호는 `-`만)만 읽고 나머지는
// NaN — `0x10` · `1e3`이 0.25 단위 검사를 통과하거나 큰 수가 integer 칸을 넘치지 않게. NaN은 도메인 checkLeaveAdjustment가
// `일수는 0.25 단위 · 0.5처럼`으로 거부한다(문구는 도메인 한 곳).
const DECIMAL_DAYS = /^-?\d{1,3}(\.\d{1,2})?$/;

export function parseAdjustmentDays(raw: string): number {
  const text = raw.trim();
  return DECIMAL_DAYS.test(text) ? Number(text) : Number.NaN;
}
