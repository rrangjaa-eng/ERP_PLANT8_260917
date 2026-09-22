// Phase 4 Task 2 ⑤ — 통화 목록과 최근 환율 설정 키 이름의 얇은 자리.
// D-71: 통화는 KRW · USD 둘. 통화별 최근 환율 설정 키는 단일값·통화별
// 키(`fx.recent_rate.USD`)이고, 금액을 적는 모든 저장이 그 키를 자동
// 갱신한다 — **실제 설정 레지스트리 등록과 자동 갱신 구현은 04-02**다.
// 이 플랜은 이름 조립 함수 하나만 둔다(호출자가 아직 없어도 계약을 고정).
export const CURRENCIES = ["KRW", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export function isCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value);
}

// fx.recent_rate.<통화> — 04-02가 domain/settings/keys.ts에 실제
// SettingDef로 등록한다. 여기서는 문자열 조립만 고정한다.
export function recentFxRateSettingKey(currency: Currency): string {
  return `fx.recent_rate.${currency}`;
}
