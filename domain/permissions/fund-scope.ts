// 07.3-01(D-7312): 자금 기능 키의 한 곳 목록 — can.ts · keys.ts가 함께 읽는 잎이라 아무것도 import하지 않는다(순환 방지).
// 메뉴 단위 판정이라 그 메뉴의 보기 · 쓰기 · 승인 칸 모두에 본부 조건이 걸린다. 카드 대리 등록(cards.proxy)은 D-7308로 뺀다.
export const FUND_SCOPED_MENUS = [
  "evidence.intake",
  "expenses.evidence_void",
  "expenses.evidence_attach",
  "projects.adjustment",
  "expenses.payments",
  "cards.purchases",
  "projects.budget",
  "projects.revenue",
] as const;

export type FundScopedMenu = (typeof FUND_SCOPED_MENUS)[number];

export function isFundScopedMenu(menu: string): menu is FundScopedMenu {
  return (FUND_SCOPED_MENUS as readonly string[]).includes(menu);
}

export const FUND_DIVISION_SETTING_KEY = "permissions.fund.division_org_unit";
