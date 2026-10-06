import type { GateDecision } from "@/domain/rules/gate";
import { isMethodEvidencePairAllowed, type MethodEvidencePair } from "@/domain/payments/method-evidence-pairs";

// 06-03(D-604 · UI-SPEC 「지출결의 상태 → 1차」) — 순수 함수 둘. 화면 1차와 서버 게이트(`payment.approval-required`)가 같은 판정을 읽는다.
// 잎 모듈: domain/expenses를 값으로 import하지 않는다(06-23 evidence-signals가 이 파일을 값 import한다).
// 06-03은 P0 · P4 · P6, 06-04가 P1(예정일 저장) · P3(증빙 없음) · 짝 막힘 · 3차 자리 `waive`를 더했다. 06-06이 P2 · P5(증빙 확인)를 더했다.

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

// 「Error — 사유 근거 칸」(UI-SPEC) — 지급 취소 사유가 비거나 공백. 서버 거부와 모달 1차 막힘이 같은 글자.
export const CANCEL_REASON_REQUIRED = "사유 없음 · 사유 적기";

// 06-04(D-605 · UI-SPEC 「Error — 차이 사유 칸」) — 서버 거부 문구와 화면 칸 오류 자리가 같은 상수를 읽는다(잎 모듈이라 화면이 값 import).
export const DIFF_REASON_REQUIRED = "차이 사유 없음 · 사유 적기";

// 「Error — 이체액 칸」(UI-SPEC S1 · S5) — 액션 입력 검증과 화면 칸 오류가 같은 문구를 읽는다.
export const TRANSFER_NOT_NUMBER = "숫자 아님 · 13,640,000처럼";
export const TRANSFER_NOT_POSITIVE = "이체액 0 이하 · 금액 고치기";
export const TRANSFER_FRACTION = "원화 소수점 · 소수점 없이";

// 06-06 「Error — 증빙 금액 칸」(UI-SPEC S4) — 액션 입력 검증 · 화면 칸 오류 · F2 막힘이 같은 문구를 읽는다(잎 모듈이라 화면이 값 import).
export const EVIDENCE_AMOUNT_NOT_NUMBER = "숫자 아님 · 12,400,000처럼";
export const EVIDENCE_AMOUNT_NOT_POSITIVE = "증빙 금액 0 이하 · 금액 고치기";
export const EVIDENCE_AMOUNT_FRACTION = "원화 소수점 · 소수점 없이";
export const EVIDENCE_AMOUNT_REQUIRED = "증빙 금액 없음";

// 06-04(06-03 독립 검토 P3-4) — 지급 권한자가 지급 총액(정보 항목 expense.amount)을 못 보면 화면이 비교값을 보낼 수 없다.
export const AMOUNT_HIDDEN = "지급 총액 볼 권한 없음 · 노출 설정은 관리자";

// ── 증빙 필수 게이트(EVID-02 · D-603) ─────────────────────────────────────
// 증빙 필수 on · 증빙 0(hasEvidence 거짓 — 무효 파일 제외) · 선결제 아님 · 면제 아님이면 막는다. 이유의 이름은 지출결의 기안자(P3).
// 06-06(O-2): 증빙 있음 · 면제 아님 · 확인 기록 없음(「확인 전」)이면 증빙 필수 설정과 관계없이 먼저 막는다 — 확인 기록 = confirmation.
export type EvidenceConfirmation = { reviewedAt: Date };

// O-2 답이 바뀌면 이 상수와 P2 갈래만 고친다.
export const EVIDENCE_CONFIRMATION_GATES_PAYMENT = true;

// 「거부 — 일괄 지급 건별 결과」 · P2 S1 선택 칸 이유(UI-SPEC) — 확인 전 증빙.
export const EVIDENCE_UNCONFIRMED = "증빙 확인 전 · 증빙 확인";

// 확인 전 증빙이 지급을 막는가 — 정책은 EVIDENCE_CONFIRMATION_GATES_PAYMENT 하나(gates는 테스트 주입 자리).
export function confirmationBlocksPayment(
  input: { hasEvidence: boolean; waived: boolean; confirmation: EvidenceConfirmation | null },
  gates: boolean = EVIDENCE_CONFIRMATION_GATES_PAYMENT,
): boolean {
  return gates && input.hasEvidence && !input.waived && input.confirmation === null;
}

export type EvidenceGateInput = {
  evidenceRequired: boolean;
  hasEvidence: boolean;
  prepaid: boolean;
  waived: boolean;
  confirmation: EvidenceConfirmation | null;
  drafterName: string;
};

export function evidenceGateDecision(ctx: EvidenceGateInput, gates: boolean = EVIDENCE_CONFIRMATION_GATES_PAYMENT): GateDecision {
  if (confirmationBlocksPayment(ctx, gates)) return { allowed: false, reason: EVIDENCE_UNCONFIRMED };
  if (!ctx.evidenceRequired || ctx.hasEvidence || ctx.prepaid || ctx.waived) return { allowed: true };
  return { allowed: false, reason: `증빙 없음 · 기안자 ${ctx.drafterName}` };
}

// ── 지급 방식 ↔ 증빙 종류 짝 게이트(Q4 · K-6) ─────────────────────────────
// 판정 몸통은 06-02 isMethodEvidencePairAllowed 하나 — 여기서는 증빙 종류가 빈 갈래(면제 · 선결제로 종류가 비어도 지급 방식만으로 막지 않는다)와
// 이유 문자열만 더한다. 이름은 호출자가 코드표에서 읽어 넘긴다(없으면 코드 값).
export type PairGateInput = {
  pairs: readonly MethodEvidencePair[];
  paymentMethod: string | null;
  evidenceType: string | null;
  paymentMethodName: string | null;
  evidenceTypeName: string | null;
};

export function pairGateDecision(input: PairGateInput): GateDecision {
  if (!input.evidenceType || !input.paymentMethod) return { allowed: true };
  if (isMethodEvidencePairAllowed(input.pairs, { method: input.paymentMethod, evidenceType: input.evidenceType })) return { allowed: true };
  return {
    allowed: false,
    reason: `${input.paymentMethodName ?? input.paymentMethod} · ${input.evidenceTypeName ?? input.evidenceType} 짝 아님 · 짝 설정은 관리자`,
  };
}

// ── 「지출결의 상태 → 1차」 ───────────────────────────────────────────────
export type ExpenseActionBar = {
  row: "P0" | "P1" | "P2" | "P3" | "P4" | "P5" | "P6";
  // 지급 권한자에게만 선다(D-601) — 권한 없는 사람은 비활성으로도 렌더하지 않는다. saveSchedule = P1 `예정일 저장`, confirm = P2 · P5 `증빙 확인`.
  primary: "pay" | "saveSchedule" | "confirm" | null;
  // 1차 비활성 이유(`block`) — 증빙 없음(P3) · 짝 아님 · 지급 총액 볼 권한 없음. 있으면 1차는 비활성이다.
  blockReason: string | null;
  // 2차 `지급 취소`(D-606) — 지급 뒤(P5 · P6) 지급 권한자에게만.
  secondary: "cancel" | null;
  // 증빙 섹션 3차 — `증빙 면제`의 자리(결재 통과 · 증빙 0 · 면제 아님 — P3 · P4 · P6, 행동을 붙이는 06-10이 렌더한다) ·
  // `바꾸기`(증빙 금액 — P2 · P5, 06-06 EvidenceReviewBlock).
  tertiary: "waive" | "change" | null;
  // 권한 밖의 다음 한 수 — 지급 전에만 담당 표기(UI-SPEC S5 「그 밖의 사람」).
  ownerNote: typeof PAYMENT_OWNER_NOTE | null;
};

export type ExpenseActionState = {
  approvalState: string | null;
  paid: boolean;
  hasEvidence: boolean;
  waived: boolean;
  evidence: GateDecision;
  pair: GateDecision;
  // 지급 예정일 칸이 dirty(화면에서만 안다 — SP-3 ②).
  scheduleDirty?: boolean;
  // 06-06 — 증빙 확인 기록(확인 기록 표의 confirmed 줄). 없으면(undefined) 확인 갈래를 보지 않는다 — 06-03 · 06-04 호출 모양 그대로.
  confirmation?: EvidenceConfirmation | null;
};

// P1 — 지급 예정일 칸이 dirty인 동안 지급 권한자의 지급 전 1차는 `예정일 저장`(막힌 업무 1차와 관계없이 — 예정일은 따로 저장된다).
export function scheduleDirtyBar(bar: ExpenseActionBar): ExpenseActionBar {
  if (bar.primary === null || bar.row === "P0" || bar.row === "P5" || bar.row === "P6") return bar;
  return { ...bar, row: "P1", primary: "saveSchedule", blockReason: null };
}

// 증빙 있음 · 면제 아님 · 확인 기록 없음 = 「확인 전」(06-06). confirmation이 undefined면(06-03 · 06-04 호출 모양) 보지 않는다.
function unconfirmed(state: ExpenseActionState): boolean {
  return state.confirmation === null && state.hasEvidence && !state.waived;
}

export function resolveExpenseActionRow(state: ExpenseActionState, perms: { canPay: boolean; amountVisible?: boolean }): ExpenseActionBar {
  const none = { primary: null, blockReason: null, secondary: null, tertiary: null, ownerNote: null } as const;
  if (state.approvalState !== APPROVAL_PASSED) return { row: "P0", ...none };
  const waiveSlot = perms.canPay && !state.hasEvidence && !state.waived ? "waive" : null;
  if (state.paid) {
    // P5 — 지급 뒤 들어오거나 바뀐 증빙(확인만 기록 — 지급 칸 · 지급 행동은 다시 서지 않는다).
    if (perms.canPay && unconfirmed(state)) return { row: "P5", primary: "confirm", blockReason: null, secondary: "cancel", tertiary: "change", ownerNote: null };
    return { row: "P6", ...none, secondary: perms.canPay ? "cancel" : null, tertiary: waiveSlot };
  }
  if (!perms.canPay) return { row: "P4", ...none, ownerNote: PAYMENT_OWNER_NOTE };
  let bar: ExpenseActionBar;
  if (unconfirmed(state) && EVIDENCE_CONFIRMATION_GATES_PAYMENT) bar = { row: "P2", primary: "confirm", blockReason: null, secondary: null, tertiary: "change", ownerNote: null };
  else if (!state.evidence.allowed) bar = { row: "P3", primary: "pay", blockReason: state.evidence.reason, secondary: null, tertiary: waiveSlot, ownerNote: null };
  else if (!state.pair.allowed) bar = { row: "P4", primary: "pay", blockReason: state.pair.reason, secondary: null, tertiary: waiveSlot, ownerNote: null };
  else if (perms.amountVisible === false) bar = { row: "P4", primary: "pay", blockReason: AMOUNT_HIDDEN, secondary: null, tertiary: waiveSlot, ownerNote: null };
  else bar = { row: "P4", primary: "pay", blockReason: null, secondary: null, tertiary: waiveSlot, ownerNote: null };
  return state.scheduleDirty ? scheduleDirtyBar(bar) : bar;
}
