import type { Viewer } from "@/domain/viewer";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";

// 06.5-06(결정 맥락 8 · DM-4): 이체 파일 고정 게이트 — 지급 쓰기 ∧ 계좌 해제 항목 ∧ 금액 보임. 행 내용과 무관하다.
// 파일 칸 명세(bank-transfer.ts BANK_TRANSFER_ROW_DTO_SPEC)의 예금주 vendor.value · 비고/key expense.value도 본다 — 행이 projectMany를
// 지나지 않으므로 칸 항목은 이 게이트가 막는다(Codex P2).
// 화면 버튼 · 내보내기 · 지급 대상 담김 줄이 같은 판정을 쓴다. 따로 둔 까닭: domain/payments/targets.ts가 부르는데
// domain/payments/bank-transfer.ts는 targets.ts를 부르므로 그쪽에 두면 import가 돈다.
export async function canExportBankTransferFile(viewer: Viewer): Promise<boolean> {
  const [payments, unmasked, amount, vendorValue, expenseValue] = await Promise.all([
    can(viewer, "expenses.payments", "write"),
    visible(viewer, "vendor.account_number_unmasked"),
    visible(viewer, "expense.amount"),
    visible(viewer, "vendor.value"),
    visible(viewer, "expense.value"),
  ]);
  return payments && unmasked && amount && vendorValue && expenseValue;
}
