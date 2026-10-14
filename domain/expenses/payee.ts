// 06.5 결정 맥락 15(EP1-2) · D-6507(G21) · D-6517: 돈 갈 곳은 문서의 지급처 칸 하나(거래처 또는 직원) — 제출 게이트와 이체 파일(06.5-06)이
// 이 함수를 같이 쓴다. 견적 줄의 거래처는 줄을 고를 때 이 칸의 기본값일 뿐이다(옛도 문서 칸 O: server/src/payments.ts:323).
// 계좌 있음 = 은행 ∧ 번호(UI-SPEC V4) — 옛은 번호만 봤다(O: server/src/expenses.ts:2351-2356); 이체 파일이 은행 코드를 요구해 은행을 더했다(ND-5).

export type ExpensePayee = { kind: "vendor"; id: string } | { kind: "user"; id: string } | null;

export const BANK_TRANSFER_PAYMENT_METHOD = "bank_transfer";
export const PAYEE_ACCOUNT_MISSING = "지급처 계좌 없음 · 계좌 등록은 경영관리";
// 고칠 수 있는 사람에게 — 꼬리 `계좌 등록`은 화면이 새 탭 링크로 그린다(UI-SPEC V4).
export const PAYEE_ACCOUNT_MISSING_FIXABLE = "지급처 계좌 없음 · 계좌 등록";

export function documentPayee(row: { vendorId: string | null; payeeUserId: string | null }): ExpensePayee {
  if (row.vendorId) return { kind: "vendor", id: row.vendorId };
  if (row.payeeUserId) return { kind: "user", id: row.payeeUserId };
  return null;
}

export function hasUsableAccount(account: { bank: string | null; hasNumber: boolean }): boolean {
  return Boolean(account.bank?.trim()) && account.hasNumber;
}
