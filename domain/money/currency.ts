// Phase 4 Task 1 ③ — 통화 목록과 통화별 최근 환율 설정 키 읽기·갱신.
// D-71: 통화는 KRW · USD 둘. KRW는 예외 경로가 아니라 환율 1인 Money다 —
// 설정 키를 만들지 않고 항상 1을 돌려준다.
import { getSettingValue as defaultGetSettingValue } from "@/domain/settings/registry";
import { upsertSimpleValue as defaultUpsertSimpleValue } from "@/repositories/settings";
import { FX_RECENT_RATE_USD } from "@/domain/settings/keys";
import { SYSTEM_VIEWER } from "@/domain/viewer";

export const CURRENCIES = ["KRW", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export function isCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value);
}

// fx.recent_rate.<통화> — 문자열 조립(설정 화면·테스트가 키 이름을 계산할 때 쓴다).
export function recentFxRateSettingKey(currency: Currency): string {
  return `fx.recent_rate.${currency}`;
}

export type CurrencyDeps = {
  getSettingValue: typeof defaultGetSettingValue;
  upsertSimpleValue: typeof defaultUpsertSimpleValue;
};

// 새 외화 줄의 환율 칸 기본값. **자리표시자가 아니라 설정에 저장된 실제
// 값**이다(견적 줄·매출 화면이 이 값으로 칸을 채운다). KRW는 설정을 읽지
// 않고 항상 1이다.
export async function recentFxRate(currency: Currency, deps?: Partial<CurrencyDeps>): Promise<number> {
  if (currency === "KRW") return 1;
  const getValue = deps?.getSettingValue ?? defaultGetSettingValue;
  return getValue(FX_RECENT_RATE_USD, {});
}

// 환율 칸이 실제로 바뀐 저장에서만 호출한다(호출자의 책임 — T-04-11).
// `setSettingValue`(admin.settings write 게이트)를 거치지 않는다 — 이
// 갱신은 "설정 화면에서 설정을 바꾸는 것"이 아니라 견적 줄·매출 저장의
// 부수 효과이고, 그 저장은 이미 자신의 쓰기 권한(projects write 등)을
// 통과했다. KRW는 갱신 대상이 아니다(환율 1 고정).
export async function rememberFxRate(currency: Currency, rate: number, deps?: Partial<CurrencyDeps>): Promise<void> {
  if (currency === "KRW") return;
  const upsert = deps?.upsertSimpleValue ?? defaultUpsertSimpleValue;
  await upsert(SYSTEM_VIEWER, FX_RECENT_RATE_USD.key, rate, SYSTEM_VIEWER.id);
}
