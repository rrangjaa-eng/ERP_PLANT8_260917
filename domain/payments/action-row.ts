import type { GateDecision } from "@/domain/rules/gate";

// 06-03(D-604 · UI-SPEC 「지출결의 상태 → 1차」) — 순수 함수 둘. 화면 1차와 서버 게이트(`payment.approval-required`)가 같은 판정을 읽는다.
// 잎 모듈: domain/expenses를 값으로 import하지 않는다(06-23 evidence-signals가 이 파일을 값 import한다).
// 이 플랜은 P0 · P4 · P6만 — P1(예정일 저장) · P2(증빙 확인) · P3(증빙 없음) · P5는 06-04 · 06-06이 더한다.

// 결재 통과 = approved(자기 승인도 approved로 끝난다 — UA-607).
export const APPROVAL_PASSED = "approved";

const IN_PROGRESS: readonly string[] = ["submitted", "in_review"];

export type ApprovalGateInput = { approvalState: string | null; stepName: string | null };

export function approvalGateDecision(input: ApprovalGateInput): GateDecision {
  if (input.approvalState === APPROVAL_PASSED) return { allowed: true };
  if (input.approvalState !== null && IN_PROGRESS.includes(input.approvalState)) {
    return { allowed: false, reason: input.stepName ? `결재 통과 전 · ${input.stepName} 결재 중` : "결재 통과 전 · 결재 중" };
  }
  if (input.approvalState === "rejected") return { allowed: false, reason: "결재 통과 전 · 반려" };
  if (input.approvalState === "withdrawn") return { allowed: false, reason: "결재 통과 전 · 회수" };
  return { allowed: false, reason: "결재 통과 전 · 제출 전" };
}

export const PAYMENT_OWNER_NOTE = "지급은 경영관리";

// 06-04(D-605 · UI-SPEC 「Error — 차이 사유 칸」) — 서버 거부 문구와 화면 칸 오류 자리가 같은 상수를 읽는다(잎 모듈이라 화면이 값 import).
export const DIFF_REASON_REQUIRED = "차이 사유 없음 · 사유 적기";

// 「Error — 이체액 칸」(UI-SPEC S1 · S5) — 액션 입력 검증과 화면 칸 오류가 같은 문구를 읽는다.
export const TRANSFER_NOT_NUMBER = "숫자 아님 · 13,640,000처럼";
export const TRANSFER_NOT_POSITIVE = "이체액 0 이하 · 금액 고치기";
export const TRANSFER_FRACTION = "원화 소수점 · 소수점 없이";

export type ExpenseActionBar = {
  row: "P0" | "P4" | "P6";
  // 지급 권한자에게만 선다(D-601) — 권한 없는 사람은 비활성으로도 렌더하지 않는다.
  primary: "pay" | null;
  // 권한 밖의 다음 한 수 — 지급 전에만 담당 표기(UI-SPEC S5 「그 밖의 사람」).
  ownerNote: typeof PAYMENT_OWNER_NOTE | null;
};

export function resolveExpenseActionRow(state: { approvalState: string | null; paid: boolean }, perms: { canPay: boolean }): ExpenseActionBar {
  if (state.approvalState !== APPROVAL_PASSED) return { row: "P0", primary: null, ownerNote: null };
  if (state.paid) return { row: "P6", primary: null, ownerNote: null };
  return perms.canPay ? { row: "P4", primary: "pay", ownerNote: null } : { row: "P4", primary: null, ownerNote: PAYMENT_OWNER_NOTE };
}
