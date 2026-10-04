// 04.3-15 Task 1 ④ — 경품 가액 판정(순수). 서버 · 내부 화면 클라이언트가 함께 import한다 — 수령자
// 화면(app/c/)은 import하지 않는다(가액 판정이 수령자 쪽으로 가지 않는다, 5905714131).

// 소득세법 제84조제3호 과세최저한 — 경품 가액을 기타소득금액으로 보는 가정(필요경비 0). 5만~10만원
// 구간의 주민등록번호 수집 · 상금/추첨 구분 · gross-up 기준은 세무 확인 항목이다(04.3-15 SUMMARY 열린 질문).
// 설정 키로 만들지 않는다(사용자가 5만원으로 정했다).
export const CERT_RRN_EXEMPT_PRIZE_VALUE_KRW = 50_000;

/** 수령자 목록에 오르는가(= 제출할 수 있는가) — 1개 가액 × 1 > 50,000. */
export function certPrizeListed(unitValueKrw: number): boolean {
  return unitValueKrw > CERT_RRN_EXEMPT_PRIZE_VALUE_KRW;
}

/** 그 제출의 주민등록번호가 파기 대상인가 — 가액 × 수량 ≤ 50,000. 곱하지 않고 정수 나눗셈으로 비교한다. */
export function certRrnPurgeTarget(unitValueKrw: number, quantity: number): boolean {
  return unitValueKrw <= Math.floor(CERT_RRN_EXEMPT_PRIZE_VALUE_KRW / quantity);
}
