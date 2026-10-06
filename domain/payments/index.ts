import type { Viewer } from "@/domain/viewer";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { recordAction } from "@/domain/action-log/record";
import { gate, GateBlockedError } from "@/domain/rules/gate";
import "@/domain/rules/register";
import { applyTaxRule, loadTaxRates as defaultLoadTaxRates, taxRatesReader, type TaxIncomeType, type TaxRates } from "@/domain/money/tax";
import { diffKrw, grossFromTotal, type RoundingUnit } from "@/domain/money";
import { taxRuleSchema, type TaxRule } from "@/domain/code-tables/tax-rule";
import { getSettingValue as defaultGetSettingValue } from "@/domain/settings/registry";
import { EVIDENCE_REQUIRED, PAYMENT_METHOD_EVIDENCE_PAIRS, TAX_BASIS_DATE_VAT, TAX_BASIS_DATE_WITHHOLDING, type TaxBasisDate } from "@/domain/settings/keys";
import { getApprovalView } from "@/domain/approvals";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses/access";
import { incomeTypeFor, pickTaxDates, type PickedTaxDates } from "@/domain/expenses/tax";
import { TAX_UNAVAILABLE } from "@/domain/expenses/gate";
import { hasEvidence } from "@/domain/evidence/has-evidence";
import {
  CANCEL_REASON_REQUIRED,
  DIFF_REASON_REQUIRED,
  resolveExpenseActionRow,
  TRANSFER_FRACTION,
  TRANSFER_NOT_NUMBER,
  TRANSFER_NOT_POSITIVE,
  type EvidenceGateInput,
  type ExpenseActionBar,
  type PairGateInput,
} from "@/domain/payments/action-row";
import type { MethodEvidencePair } from "@/domain/payments/method-evidence-pairs";
import { visible } from "@/domain/permissions/visible";
import { listCodeItems as defaultListCodeItems } from "@/repositories/code-tables";
import { findUserNamesByIds } from "@/repositories/users";
import { findExpenseApprovalInstance, findExpenseById, lockExpenseForUpdate, type ExpenseRow } from "@/repositories/expenses";
import { bumpExpenseVersion, findLivePayment, insertPayment, markPaymentCancelled, updateScheduledPaymentDate } from "@/repositories/expense-payments";
import { withTransaction } from "@/lib/db-transaction";
import { seoulDateToUtcDate, seoulToday } from "@/lib/dates";
import { isUniqueViolation } from "@/lib/pg-errors";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { formatKstTime } from "@/domain/holidays/business-day";

// 06-03(EXP-06 · EXP-09 · OPS-09) — 결재 통과 지출결의 한 건의 지급 완료(트레이서). 증빙 게이트 · 짝 게이트 · 지급 칸 · 취소는 06-04,
// 증빙 확인은 06-06이 더한다.
//
// 06-03 tx 규약: 트랜잭션 안에서는 tx를 받는 리포지토리와 DB 없는 순수 함수만 부른다. 권한(can) · 설정 · 세율(loadTaxRates) ·
// 코드표 · 결재 단계 이름처럼 전역 풀을 읽는 것은 트랜잭션을 열기 전에 읽어 인자로 넘긴다. 행동 로그는 트랜잭션 안에서
// 같은 tx로 남긴다(recordAction(…, { tx })). 근거: PR #75(풀 고갈 교착) · ARCHITECTURE §4-8.

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PaymentNotFoundError extends UserFacingError {
  constructor() {
    super("없는 지출결의 · 새로 고침");
  }
}

// 「거부 — 문서 화면 동시성」(UI-SPEC Copywriting).
export class PaymentConflictError extends UserFacingError {}

const ALREADY_PAID = "이미 지급 완료 · 새로 고침";
const ALREADY_CANCELLED = "이미 지급 취소됨 · 새로 고침";

// 06-04 — 같은 문서를 이미 누가 지급했다(「동시 두 지급 완료」의 뒤 요청). version 차이보다 구체적인 이유라 version 비교 앞에서 가린다.
// 사람 이름은 트랜잭션 밖에서 붙인다(06-03 tx 규약 — 트랜잭션 안에서는 사용자 표를 풀로 읽지 않는다).
export class PaymentAlreadyDoneError extends UserFacingError {
  constructor(processedByName: string, processedAt: Date) {
    // 조사 없는 명사형 — 받침 없는 이름 뒤 「이」가 틀린다(06-04 검토 P3-5 · 사용자 결정 2026-10-06 18:30:31 KST 「조사 없애기」).
    super(`이미 지급됨 · ${processedByName} · ${formatKstTime(processedAt)} · 새로 고침`);
  }
}

// 트랜잭션 안 신호 — 바깥에서 이름을 읽어 PaymentAlreadyDoneError로 바꾼다.
class AlreadyPaidSignal extends Error {
  constructor(
    readonly processedBy: string,
    readonly processedAt: Date,
  ) {
    super(ALREADY_PAID);
  }
}

async function alreadyDone(viewer: Viewer, live: { processedBy: string; processedAt: Date }): Promise<PaymentAlreadyDoneError> {
  const name = (await findUserNamesByIds(viewer, [live.processedBy])).get(live.processedBy) ?? "다른 사람";
  return new PaymentAlreadyDoneError(name, live.processedAt);
}
const PAYMENT_METHOD_MISSING = "지급 방식 없음 · 지출결의 확인";

// 06-04(D-605) — 이체액 ≠ 지급 총액인데 차이 사유가 없음. 화면은 이 문구로 차이 사유 칸 아래에 둔다(「Error — 차이 사유 칸」).
export { CANCEL_REASON_REQUIRED, DIFF_REASON_REQUIRED } from "@/domain/payments/action-row";

export class DiffReasonRequiredError extends UserFacingError {
  constructor() {
    super(DIFF_REASON_REQUIRED);
  }
}

// 서버가 다시 계산한 지급 총액이 화면이 본 값과 다르거나, 사전 조회와 잠금 사이에 기준(기준일 · 증빙 종류 · 금액 원천)이 바뀜 —
// 처리하지 않고 새 지급 총액을 싣는다(사람이 이체액을 다시 본다 · 다시 시도하지 않는다).
export class PayableChangedError extends UserFacingError {
  constructor(
    readonly payableKrw: number,
    payDate: string,
  ) {
    super(`지급일 ${payDate.slice(5)} 기준 지급 총액 바뀜 · 이체액 확인`);
  }
}

// ── 금액 원천(R-4 · E-7) ────────────────────────────────────────────────
// 살아 있는 증빙 파일이 있고 증빙 금액이 있을 때만 증빙 금액, 그 밖은 공급가액(06-11 원가 기준과 같은 규칙). 파일 없이 적힌
// 증빙 금액(아무도 확인하지 않은 기안자 숫자)은 지급 총액을 정하지 않는다.
export type PaymentAmount = { source: "evidence" | "supply"; amountKrw: number };

export function pickPaymentAmount(input: { hasLiveEvidence: boolean; evidenceAmountKrw: number | null; supplyAmountKrw: number }): PaymentAmount {
  if (input.hasLiveEvidence && input.evidenceAmountKrw !== null) return { source: "evidence", amountKrw: input.evidenceAmountKrw };
  return { source: "supply", amountKrw: input.supplyAmountKrw };
}

// ── 지급 총액(DB 없음) ──────────────────────────────────────────────────
export type PayableInput = {
  amount: PaymentAmount;
  taxRule: TaxRule;
  applyOpts: PickedTaxDates["applyOpts"];
  incomeType: TaxIncomeType;
  /** 실제 이체액 — 없으면 지급 총액. */
  transferKrw?: number;
};

export type PayableDecision = {
  vatKrw: number;
  withholdingKrw: number;
  companyBorneKrw: number;
  payableKrw: number;
  transferKrw: number;
  diffKrw: number;
  // 부가세 규칙만 — 이체액에서 역산한 공급가(표시 · 기록용, D-605). 원천징수 · 회사 대납 · 규칙 없음은 null(UA-619 · R-9).
  grossSupplyKrw: number | null;
};

// 세율은 rates(트랜잭션 전 사전 조회)만 읽는다. 역산은 기준일의 부가세율 · 부가세 절사 단위 · "round" 고정(R-5 · E-8 —
// 05 매출 computeGrossFromPayment 전례) — 코드표 규칙의 절사 방식은 역산에 넣지 않는다.
export async function decidePayable(input: PayableInput, rates: TaxRates): Promise<PayableDecision> {
  const amounts = await applyTaxRule(
    input.amount.amountKrw,
    input.taxRule,
    {
      paymentDate: seoulDateToUtcDate(input.applyOpts.paymentDate),
      evidenceDate: seoulDateToUtcDate(input.applyOpts.evidenceDate),
      incomeType: input.incomeType,
    },
    { getSettingValue: taxRatesReader(rates) },
  );
  const transferKrw = input.transferKrw ?? amounts.payableKrw;
  const grossSupplyKrw = input.taxRule.ruleKind === "vat_surcharge" ? grossFromTotal(transferKrw, rates.vatRate, rates.vatUnit as RoundingUnit, "round") : null;
  return { ...amounts, transferKrw, diffKrw: diffKrw(transferKrw, amounts.payableKrw), grossSupplyKrw };
}

// ── 사전 조회(트랜잭션 밖) ──────────────────────────────────────────────
// E-34: 문서와 무관한 읽기 — 코드표의 증빙 종류 → 세금 규칙 · 기준일 설정 둘 · 날짜별 세율 캐시. 일괄 지급(06-15)이 요청마다 한 번
// 만들어 행마다 넘긴다. 전역 풀을 읽으므로 트랜잭션 밖에서만 만들고, ratesFor도 트랜잭션 밖에서만 부른다(캐시에 없으면 풀을 읽는다).
export type PaymentShared = {
  taxRuleOf: (evidenceType: string | null) => TaxRule | null;
  basisWithholding: TaxBasisDate;
  basisVat: TaxBasisDate;
  ratesFor: (asOf: string) => Promise<TaxRates>;
  // 06-04 — 증빙 필수 설정 · 지급 방식 × 증빙 종류 짝 목록 · 두 코드표의 이름(막힘 이유 글자).
  evidenceRequired: boolean;
  pairs: readonly MethodEvidencePair[];
  paymentMethodName: (code: string | null) => string | null;
  evidenceTypeName: (code: string | null) => string | null;
};

export type PaymentSharedDeps = {
  loadTaxRates: typeof defaultLoadTaxRates;
  listCodeItems: typeof defaultListCodeItems;
  getSettingValue: typeof defaultGetSettingValue;
};

export async function loadPaymentShared(viewer: Viewer, deps?: Partial<PaymentSharedDeps>): Promise<PaymentShared> {
  const items = await (deps?.listCodeItems ?? defaultListCodeItems)(viewer, {
    tableKey: "evidence_type",
    scope: { rows: "all", includeArchived: true },
    includeInactive: true,
  });
  const rules = new Map<string, TaxRule>();
  const evidenceNames = new Map<string, string>();
  for (const item of items) {
    evidenceNames.set(item.value, item.label);
    const parsed = taxRuleSchema.safeParse(item.taxRule);
    if (parsed.success) rules.set(item.value, parsed.data);
  }
  const methods = await (deps?.listCodeItems ?? defaultListCodeItems)(viewer, {
    tableKey: "payment_method",
    scope: { rows: "all", includeArchived: true },
    includeInactive: true,
  });
  const methodNames = new Map(methods.map((item) => [item.value, item.label]));
  const getValue = deps?.getSettingValue ?? defaultGetSettingValue;
  const basisWithholding = await getValue(TAX_BASIS_DATE_WITHHOLDING);
  const basisVat = await getValue(TAX_BASIS_DATE_VAT);
  // 06-04 — 증빙 · 짝 게이트 입력(문서와 무관 — 트랜잭션 전 한 번, E-34). 저장된 짝은 보관된 코드 값이 들어 있어도 그대로 판정한다.
  const evidenceRequired = await getValue(EVIDENCE_REQUIRED);
  const pairs = await getValue(PAYMENT_METHOD_EVIDENCE_PAIRS);
  const load = deps?.loadTaxRates ?? defaultLoadTaxRates;
  const cache = new Map<string, Promise<TaxRates>>();
  return {
    taxRuleOf: (evidenceType) => (evidenceType ? (rules.get(evidenceType) ?? null) : null),
    basisWithholding,
    basisVat,
    evidenceRequired,
    pairs,
    paymentMethodName: (code) => (code ? (methodNames.get(code) ?? null) : null),
    evidenceTypeName: (code) => (code ? (evidenceNames.get(code) ?? null) : null),
    ratesFor: (asOf) => {
      let rates = cache.get(asOf);
      if (!rates) {
        rates = load(asOf);
        cache.set(asOf, rates);
      }
      return rates;
    },
  };
}

type PaymentTax = { taxRule: TaxRule; dates: PickedTaxDates; incomeType: TaxIncomeType };

export type PaymentInputs = {
  expenseId: string;
  today: string;
  payDate: string | null;
  approvalState: string | null;
  // 막힘 이유의 표시 문자열 — 통과 여부는 잠금 뒤 tx로 읽은 상태로 판정한다(이유 글자만 한 단계 낡을 수 있다).
  stepName: string | null;
  evidenceType: string | null;
  hasLiveEvidence: boolean;
  // 06-04 — 증빙 없음 막힘 이유의 이름(지출결의 기안자 — P3). 표시 문자열.
  drafterName: string;
  amount: PaymentAmount | null;
  tax: (PaymentTax & { rates: TaxRates }) | null;
};

// 잠근 행이든 사전 조회 행이든 같은 규칙으로 기준(세금 규칙 · 기준일 · 소득 종류 · 금액 원천)을 정한다 — DB 없음.
function basisOf(
  row: Pick<ExpenseRow, "evidenceType" | "supplyAmountKrw" | "evidenceAmount" | "scheduledPaymentDate" | "evidenceDate" | "createdAt">,
  ctx: { shared: PaymentShared; payDate: string | null; today: string; hasLiveEvidence: boolean },
): { amount: PaymentAmount | null; tax: PaymentTax | null } {
  const amount =
    row.supplyAmountKrw === null
      ? null
      : pickPaymentAmount({ hasLiveEvidence: ctx.hasLiveEvidence, evidenceAmountKrw: row.evidenceAmount, supplyAmountKrw: row.supplyAmountKrw });
  const taxRule = ctx.shared.taxRuleOf(row.evidenceType);
  if (!taxRule) return { amount, tax: null };
  const dates = pickTaxDates(
    { paidDate: ctx.payDate, scheduledPaymentDate: row.scheduledPaymentDate, evidenceDate: row.evidenceDate, createdAt: row.createdAt },
    { ruleKind: taxRule.ruleKind, codeBasis: taxRule.basisDate, basisWithholding: ctx.shared.basisWithholding, basisVat: ctx.shared.basisVat, todayKst: ctx.today },
  );
  return { amount, tax: { taxRule, dates, incomeType: incomeTypeFor(row.evidenceType) } };
}

const IN_PROGRESS: readonly string[] = ["submitted", "in_review"];

// 잠금 없는 사전 조회 — 문서 행 · 살아 있는 증빙 유무 · 결재 상태(+ 진행 중이면 현재 단계 이름)는 문서마다, 세금 규칙 · 기준일 설정은
// shared에서. 오늘(서울)을 여기서 한 번 정하고 05 pickTaxDates로 기준일 하나를 골라 그날 세율을 얻는다. 미래 payDate도 그대로(Q6 · RS-11).
export async function loadPaymentInputs(
  viewer: Viewer,
  // scheduledPayDate — 미리보기 전용(06-04 검토 P3-2): 행의 예정일 대신 이 날짜로 기준일을 고른다(예정일 칸 힌트 · 저장 전 값).
  input: { expenseId: string; payDate?: string | null; scheduledPayDate?: string; now?: Date },
  shared?: PaymentShared,
): Promise<PaymentInputs> {
  const row = UUID_SHAPE.test(input.expenseId) ? await findExpenseById(viewer, input.expenseId) : null;
  if (!row) throw new PaymentNotFoundError();
  const ctxShared = shared ?? (await loadPaymentShared(viewer));
  const owner = { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: row.id };
  const hasLiveEvidence = await hasEvidence(viewer, owner);
  const instance = await findExpenseApprovalInstance(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, documentId: row.id });
  const approvalState = instance?.status ?? null;
  const stepName = approvalState && IN_PROGRESS.includes(approvalState) ? await currentStepName(viewer, row.id) : null;
  const drafterName = (await findUserNamesByIds(viewer, [row.drafterId])).get(row.drafterId) ?? "";
  const today = seoulToday(input.now);
  const payDate = input.payDate ?? null;
  const basisRow = input.scheduledPayDate === undefined ? row : { ...row, scheduledPaymentDate: input.scheduledPayDate };
  const { amount, tax } = basisOf(basisRow, { shared: ctxShared, payDate, today, hasLiveEvidence });
  return {
    expenseId: row.id,
    today,
    payDate,
    approvalState,
    stepName,
    evidenceType: row.evidenceType,
    hasLiveEvidence,
    drafterName,
    amount,
    tax: tax ? { ...tax, rates: await ctxShared.ratesFor(tax.dates.basisDate) } : null,
  };
}

async function currentStepName(viewer: Viewer, expenseId: string): Promise<string | null> {
  const view = await getApprovalView(viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId, readOnlyVisible: true });
  return view?.steps?.find((step) => step.state === "current")?.label ?? null;
}

function payableOf(pre: PaymentInputs, transferKrw?: number): Promise<PayableDecision> | null {
  if (!pre.amount || !pre.tax) return null;
  return decidePayable(
    { amount: pre.amount, taxRule: pre.tax.taxRule, applyOpts: pre.tax.dates.applyOpts, incomeType: pre.tax.incomeType, transferKrw },
    pre.tax.rates,
  );
}

// 잠금 뒤 기준일 바뀜 신호 — 그날 세율은 풀을 읽어야 하므로 트랜잭션을 되돌린 뒤 밖에서 새 지급 총액을 셈해 PayableChangedError로 바꾼다.
export class BasisChangedSignal extends Error {}

function sameBasis(pre: PaymentInputs, locked: { evidenceType: string | null; amount: PaymentAmount | null; tax: PaymentTax | null }): boolean {
  return (
    pre.evidenceType === locked.evidenceType &&
    pre.amount?.source === locked.amount?.source &&
    pre.amount?.amountKrw === locked.amount?.amountKrw &&
    pre.tax?.dates.basisDate === locked.tax?.dates.basisDate &&
    pre.tax?.dates.basisKind === locked.tax?.dates.basisKind
  );
}

export type LockedExpense = Pick<
  ExpenseRow,
  "id" | "evidenceType" | "supplyAmountKrw" | "evidenceAmount" | "scheduledPaymentDate" | "evidenceDate" | "createdAt" | "paymentMethod" | "prepaid"
>;

// 06-04 — 증빙 · 짝 게이트 ctx(DB 없음). 문서 상태(증빙 유무 · 선결제)는 호출자가 넘긴 값 — 잠금 뒤에는 tx로 읽은 값(CROSS R-3).
// waived · confirmation은 기록 표를 읽는 06-06 · 06-10의 evidenceGateInputs가 넣는다 — 06-04에는 그 기록을 쓰는 경로가 없어 「기록 없음」 하나.
export function evidenceGateCtx(input: { shared: PaymentShared; hasEvidence: boolean; prepaid: boolean; drafterName: string }): EvidenceGateInput {
  return {
    evidenceRequired: input.shared.evidenceRequired,
    hasEvidence: input.hasEvidence,
    prepaid: input.prepaid,
    waived: false,
    confirmation: null,
    drafterName: input.drafterName,
  };
}

export function pairGateCtx(row: { paymentMethod: string | null; evidenceType: string | null }, shared: PaymentShared): PairGateInput {
  return {
    pairs: shared.pairs,
    paymentMethod: row.paymentMethod,
    evidenceType: row.evidenceType,
    paymentMethodName: shared.paymentMethodName(row.paymentMethod),
    evidenceTypeName: shared.evidenceTypeName(row.evidenceType),
  };
}

// 잠금 뒤 판정(DB 없음) — 트랜잭션 콜백이 tx로 읽은 값(잠근 행 · 결재 상태 · 살아 있는 증빙 유무)만 넘긴다. 순서: 결재 게이트 →
// 증빙 게이트(잠근 행의 prepaid · tx로 읽은 증빙 유무) → 짝 게이트(잠근 행의 방식 · 종류, 06-04) →
// 기준 재판정(기준일 · 증빙 종류 · 금액 원천 — CROSS-R1 F-3: 게이트가 먼저) → 지급 총액 → 화면이 본 값 비교. 기준이 바뀌었어도 기준일이
// 같으면 사전 조회 세율로 여기서 새 값을 셈하고, 기준일이 바뀌면 BasisChangedSignal(그날 세율은 밖에서).
export async function judgeLockedPayment(input: {
  pre: PaymentInputs;
  locked: LockedExpense;
  approvalState: string | null;
  lockedHasEvidence: boolean;
  payDate: string;
  expectedPayableKrw: number;
  shared: PaymentShared;
  /** 06-04 — 실제 이체액(없으면 지급 총액). 차이 = diffKrw(이체액, 지급 총액). */
  transferKrw?: number;
  diffReason?: string | null;
}): Promise<{ payable: PayableDecision; paymentMethod: string; diffReason: string | null }> {
  const { pre, locked } = input;
  const decision = await gate(locked, "payment.approval-required", { approvalState: input.approvalState, stepName: pre.stepName });
  if (!decision.allowed) throw new GateBlockedError(decision.reason);
  const evidence = await gate(
    locked,
    "payment.evidence-required",
    evidenceGateCtx({ shared: input.shared, hasEvidence: input.lockedHasEvidence, prepaid: locked.prepaid, drafterName: pre.drafterName }),
  );
  if (!evidence.allowed) throw new GateBlockedError(evidence.reason);
  const pair = await gate(locked, "payment.method-evidence-mismatch", pairGateCtx(locked, input.shared));
  if (!pair.allowed) throw new GateBlockedError(pair.reason);

  const basis = basisOf(locked, { shared: input.shared, payDate: input.payDate, today: pre.today, hasLiveEvidence: input.lockedHasEvidence });
  if (!sameBasis(pre, { evidenceType: locked.evidenceType, ...basis })) {
    if (!pre.tax || !basis.amount || !basis.tax || basis.tax.dates.basisDate !== pre.tax.rates.asOf) throw new BasisChangedSignal();
    const fresh = await decidePayable(
      { amount: basis.amount, taxRule: basis.tax.taxRule, applyOpts: basis.tax.dates.applyOpts, incomeType: basis.tax.incomeType },
      pre.tax.rates,
    );
    throw new PayableChangedError(fresh.payableKrw, input.payDate);
  }
  if (!pre.tax || !basis.amount || !basis.tax) throw new GateBlockedError(TAX_UNAVAILABLE);
  // 05 제출 게이트가 지급 방식을 강제해 결재 통과 문서에는 생기지 않는 갈래 — 그래도 이유는 지급 방식으로(06-03 검토 P3-2).
  if (!locked.paymentMethod) throw new GateBlockedError(PAYMENT_METHOD_MISSING);

  const payable = await decidePayable(
    {
      amount: basis.amount,
      taxRule: basis.tax.taxRule,
      applyOpts: basis.tax.dates.applyOpts,
      incomeType: basis.tax.incomeType,
      transferKrw: input.transferKrw,
    },
    pre.tax.rates,
  );
  if (payable.payableKrw !== input.expectedPayableKrw) throw new PayableChangedError(payable.payableKrw, input.payDate);
  // 차이 사유(D-605) — 차이 0이면 사유를 저장하지 않는다. 비용 기준 칸(증빙 금액 · 공급가액)은 어느 갈래도 쓰지 않는다.
  const reason = input.diffReason?.trim() ?? "";
  if (payable.diffKrw !== 0 && reason === "") throw new DiffReasonRequiredError();
  return { payable, paymentMethod: locked.paymentMethod, diffReason: payable.diffKrw === 0 ? null : reason };
}

// 06-04 검토 P3-4 — 액션 zod를 거치지 않는 호출(06-15 일괄 · 06-17)도 이체액 칸 문구로 거부한다(DB 캐스트 · CHECK 오류 500 대신).
function transferKrwProblem(value: number): string | null {
  if (!Number.isFinite(value)) return TRANSFER_NOT_NUMBER;
  if (!Number.isInteger(value)) return TRANSFER_FRACTION;
  if (!Number.isSafeInteger(value)) return TRANSFER_NOT_NUMBER;
  if (value <= 0) return TRANSFER_NOT_POSITIVE;
  return null;
}

export type CompletePaymentDeps = {
  shared?: PaymentShared;
  // 경합 테스트 장벽 — 지출결의 행을 잠근 직후(05 submitExpense deps.afterLock 꼴). 06-04 · 06-11 · 06-13이 쓴다.
  afterLock?: () => Promise<void>;
  now?: Date;
};

export type CompletePaymentResult = { paymentId: string; payDate: string; version: number };

// 지급 완료. 권한 · 사전 조회는 트랜잭션 전. 한 트랜잭션: ⑴ 지출결의 행 FOR UPDATE(05 lockExpenseForUpdate — 전역 잠금 순서 N-3에서
// 이 앞이 06-13 견적 줄 잠금 자리) ⑵ 문서 version ⑶ 결재 상태(같은 tx) → 결재 게이트(06-04가 그 뒤에 증빙 · 짝 게이트를 더한다)
// ⑶′ 기준 재판정(기준일 · 증빙 종류 · 금액 원천 — 증빙 유무는 hasEvidence(…, tx)) · 재계산 — 게이트보다 뒤(CROSS-R1 F-3)
// ⑷ INSERT ⑸ 문서 version + 1 ⑹ 행동 로그 payment_process(같은 tx). 이체액은 화면 칸 값(06-04) — 차이 ≠ 0이면 사유 필수(D-605).
export async function completeExpensePayment(
  viewer: Viewer,
  input: {
    expenseId: string;
    payDate?: string | null;
    expectedPayableKrw: number;
    version: number;
    /** 06-04 — 실제 이체액(화면 칸 기본값 = 지급 총액). 없으면 지급 총액(일괄 · 테스트 경로). */
    transferKrw?: number;
    diffReason?: string | null;
  },
  deps?: CompletePaymentDeps,
): Promise<CompletePaymentResult> {
  if (!(await can(viewer, "expenses.payments", "write"))) throw new ForbiddenError("지급 처리 권한 없음");
  const transferProblem = input.transferKrw === undefined ? null : transferKrwProblem(input.transferKrw);
  if (transferProblem) throw new UserFacingError(transferProblem);
  const shared = deps?.shared ?? (await loadPaymentShared(viewer));
  const today = seoulToday(deps?.now);
  const payDate = input.payDate ?? today;
  const pre = await loadPaymentInputs(viewer, { expenseId: input.expenseId, payDate, now: deps?.now }, shared);

  try {
    return await withTransaction(async (tx) => {
      const locked = await lockExpenseForUpdate(viewer, pre.expenseId, tx);
      await deps?.afterLock?.();
      if (!locked) throw new PaymentNotFoundError();
      const live = await findLivePayment(viewer, locked.id, tx);
      if (live) throw new AlreadyPaidSignal(live.processedBy, live.processedAt);
      if (locked.version !== input.version) throw new PaymentConflictError(`다른 사람이 ${formatKstTime(locked.updatedAt)}에 바꿈 · 새로 고침`);
      const instance = await findExpenseApprovalInstance(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, documentId: locked.id }, tx);
      const lockedEvidence = await hasEvidence(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: locked.id }, tx);
      const { payable, paymentMethod, diffReason } = await judgeLockedPayment({
        pre,
        locked,
        approvalState: instance?.status ?? null,
        lockedHasEvidence: lockedEvidence,
        payDate,
        expectedPayableKrw: input.expectedPayableKrw,
        shared,
        transferKrw: input.transferKrw,
        diffReason: input.diffReason,
      });

      const payment = await insertPayment(
        viewer,
        {
          expenseId: locked.id,
          payDate,
          transferKrw: payable.transferKrw,
          payableKrw: payable.payableKrw,
          diffKrw: payable.diffKrw,
          diffReason,
          grossSupplyKrw: payable.grossSupplyKrw,
          paymentMethod,
          processedBy: viewer.id,
        },
        tx,
      );
      const version = await bumpExpenseVersion(viewer, { expenseId: locked.id, expectedVersion: locked.version, updatedBy: viewer.id }, tx);
      if (version === null) throw new PaymentConflictError(`다른 사람이 ${formatKstTime(locked.updatedAt)}에 바꿈 · 새로 고침`);
      await recordAction(
        viewer,
        {
          actionType: "payment_process",
          entity: "expense",
          entityId: locked.id,
          documentId: locked.id,
          detail: { paymentId: payment.id, payDate, transferKrw: payable.transferKrw, payableKrw: payable.payableKrw, diffKrw: payable.diffKrw, diffReason },
        },
        { tx },
      );
      return { paymentId: payment.id, payDate, version };
    });
  } catch (error) {
    if (error instanceof BasisChangedSignal) {
      const fresh = await loadPaymentInputs(viewer, { expenseId: input.expenseId, payDate, now: deps?.now }, shared);
      const recomputed = await payableOf(fresh);
      if (!recomputed) throw new GateBlockedError(TAX_UNAVAILABLE);
      throw new PayableChangedError(recomputed.payableKrw, payDate);
    }
    if (error instanceof AlreadyPaidSignal) throw await alreadyDone(viewer, error);
    if (isUniqueViolation(error, "expense_payments_live_uniq")) {
      const live = await findLivePayment(viewer, input.expenseId);
      throw live ? await alreadyDone(viewer, live) : new PaymentConflictError(ALREADY_PAID);
    }
    throw error;
  }
}

// ── 지급 취소(06-04 · D-606) ────────────────────────────────────────────
// 권한은 트랜잭션 전. 사유 필수. 한 트랜잭션: 문서 행 FOR UPDATE → version → 살아 있는 지급(없으면 이미 취소) → 취소 표시(행 삭제 없음) →
// 문서 version + 1 → 끌 수 없는 행동 로그 payment_cancel(같은 tx). 프로젝트 상태를 읽지 않는다 — 완료 프로젝트도 취소된다(U-4 · D-47).
// 견적 줄 잠금은 06-13이 「살아 있는 지급 기록」에서 파생하므로 여기서 따로 풀지 않는다.
export async function cancelExpensePayment(
  viewer: Viewer,
  input: { expenseId: string; reason: string; version: number },
): Promise<{ version: number }> {
  if (!(await can(viewer, "expenses.payments", "write"))) throw new ForbiddenError("지급 처리 권한 없음");
  if (!UUID_SHAPE.test(input.expenseId)) throw new PaymentNotFoundError();
  const reason = input.reason.trim();
  if (reason === "") throw new UserFacingError(CANCEL_REASON_REQUIRED);
  return withTransaction(async (tx) => {
    const locked = await lockExpenseForUpdate(viewer, input.expenseId, tx);
    if (!locked) throw new PaymentNotFoundError();
    const conflict = `다른 사람이 ${formatKstTime(locked.updatedAt)}에 바꿈 · 새로 고침`;
    if (locked.version !== input.version) throw new PaymentConflictError(conflict);
    const live = await findLivePayment(viewer, locked.id, tx);
    if (!live) throw new PaymentConflictError(ALREADY_CANCELLED);
    const cancelled = await markPaymentCancelled(viewer, { paymentId: live.id, reason, cancelledBy: viewer.id }, tx);
    if (!cancelled) throw new PaymentConflictError(ALREADY_CANCELLED);
    const version = await bumpExpenseVersion(viewer, { expenseId: locked.id, expectedVersion: locked.version, updatedBy: viewer.id }, tx);
    if (version === null) throw new PaymentConflictError(conflict);
    await recordAction(
      viewer,
      {
        actionType: "payment_cancel",
        entity: "expense",
        entityId: locked.id,
        documentId: locked.id,
        detail: { paymentId: live.id, reason, payDate: live.payDate, transferKrw: live.transferKrw, payableKrw: live.payableKrw },
      },
      { tx },
    );
    return { version };
  });
}

// ── 지급 예정일 저장(06-04 · SP-3 ②) ───────────────────────────────────
// 예정일만 바꾼다(미래 날짜 허용 — Q6). 권한은 트랜잭션 전. 한 트랜잭션: 문서 행 FOR UPDATE → version → 결재 통과(같은 tx) →
// 살아 있는 지급 없음 → 조건 UPDATE(예정일 · version + 1) → 행동 로그 document_update(전후 날짜, 같은 tx).
export async function saveScheduledPayDate(
  viewer: Viewer,
  input: { expenseId: string; scheduledPayDate: string; version: number },
): Promise<{ version: number }> {
  if (!(await can(viewer, "expenses.payments", "write"))) throw new ForbiddenError("지급 처리 권한 없음");
  if (!UUID_SHAPE.test(input.expenseId)) throw new PaymentNotFoundError();
  return withTransaction(async (tx) => {
    const locked = await lockExpenseForUpdate(viewer, input.expenseId, tx);
    if (!locked) throw new PaymentNotFoundError();
    const conflict = `다른 사람이 ${formatKstTime(locked.updatedAt)}에 바꿈 · 새로 고침`;
    if (locked.version !== input.version) throw new PaymentConflictError(conflict);
    const instance = await findExpenseApprovalInstance(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, documentId: locked.id }, tx);
    const decision = await gate(locked, "payment.approval-required", { approvalState: instance?.status ?? null, stepName: null });
    if (!decision.allowed) throw new GateBlockedError(decision.reason);
    if (await findLivePayment(viewer, locked.id, tx)) throw new PaymentConflictError(ALREADY_PAID);
    const version = await updateScheduledPaymentDate(
      viewer,
      { expenseId: locked.id, date: input.scheduledPayDate, expectedVersion: locked.version, updatedBy: viewer.id },
      tx,
    );
    if (version === null) throw new PaymentConflictError(conflict);
    await recordAction(
      viewer,
      {
        actionType: "document_update",
        entity: "expense",
        entityId: locked.id,
        documentId: locked.id,
        detail: { field: "scheduledPaymentDate", before: locked.scheduledPaymentDate, after: input.scheduledPayDate },
      },
      { tx },
    );
    return { version };
  });
}

// ── 지급 총액 미리보기(06-04 · S5 loading) ─────────────────────────────
// 지급일(또는 이체액)을 바꾸면 화면이 서버가 다시 계산한 지급 총액 · 차이를 받는다 — 읽기 전용, 트랜잭션 · 행동 로그 없음.
// 차이도 서버 diffKrw로만(O-18 — 화면은 금액을 셈하지 않는다). 셈할 수 없는 문서(세금 규칙 · 공급가 없음)는 지급 총액 null.
export type PayablePreview = { payDate: string; payableKrw: number | null; diffKrw: number | null };

export const PAYABLE_PREVIEW_DTO_SPEC: DtoSpec<PayablePreview, PayablePreview> = {
  fields: [
    { key: "payDate", from: "payDate", infoItem: "expense.value" },
    { key: "payableKrw", from: "payableKrw", infoItem: "expense.amount" },
    { key: "diffKrw", from: "diffKrw", infoItem: "expense.amount" },
  ],
};

registerDto({ name: "payablePreview", fields: PAYABLE_PREVIEW_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });

export async function previewPayable(
  viewer: Viewer,
  input: { expenseId: string; payDate: string; transferKrw?: number; scheduledPayDate?: string },
  deps?: { now?: Date },
): Promise<Partial<PayablePreview>> {
  if (!(await can(viewer, "expenses.payments", "write"))) throw new ForbiddenError("지급 처리 권한 없음");
  const pre = await loadPaymentInputs(viewer, { expenseId: input.expenseId, payDate: input.payDate, scheduledPayDate: input.scheduledPayDate, now: deps?.now });
  const payable = await payableOf(pre, input.transferKrw);
  return project(
    viewer,
    {
      payDate: input.payDate,
      payableKrw: payable?.payableKrw ?? null,
      diffKrw: payable && input.transferKrw !== undefined ? payable.diffKrw : null,
    },
    PAYABLE_PREVIEW_DTO_SPEC,
  );
}

// ── 지급 섹션 DTO ───────────────────────────────────────────────────────
// 결재 통과 문서의 지급 섹션(S5). 금액 칸은 05 정보 항목 expense.amount, 나머지는 expense.value(RS-19 — 새 정보 항목 없음).
// 지급 전 = 사전 조회 → decidePayable(처리 지급일 기본 = 오늘). 지급 뒤(E-22) = 살아 있는 지급 기록 값 그대로(다시 계산하지 않는다).
// DTO의 행동 줄 = resolveExpenseActionRow 결과 그대로. 06-04가 더한 칸(blockReason · tertiary)은 DTO 타입에서만 선택이다 —
// 06-03 leak-scan 픽스처가 옛 모양으로 DTO를 만들고, 그 파일은 같은 웨이브 06-05가 써서 이 플랜이 열지 않는다(화면은 없으면 null로 읽는다).
export type PaymentViewBar = Pick<ExpenseActionBar, "row" | "primary" | "ownerNote"> & Partial<ExpenseActionBar>;

export type PaymentViewDto = {
  expenseId: string;
  version: number;
  row: PaymentViewBar;
  payDate: string;
  paidTime: string | null;
  payableKrw: number | null;
  transferKrw: number | null;
  diffKrw: number | null;
  grossSupplyKrw: number | null;
  // 06-04 — 지급 뒤 읽기 줄(차이 사유 · 지급일 2행 처리한 사람).
  diffReason?: string | null;
  processedByName?: string | null;
  // 06-04 — 지급 취소 확인 모달 부제 `{번호} · {지급일} 지급 · {이체액}`.
  number?: string | null;
};

export const PAYMENT_VIEW_DTO_SPEC: DtoSpec<PaymentViewDto, PaymentViewDto> = {
  fields: [
    { key: "expenseId", from: "expenseId", infoItem: "expense.value" },
    { key: "version", from: "version", infoItem: "expense.value" },
    { key: "row", from: "row", infoItem: "expense.value" },
    { key: "payDate", from: "payDate", infoItem: "expense.value" },
    { key: "paidTime", from: "paidTime", infoItem: "expense.value" },
    { key: "payableKrw", from: "payableKrw", infoItem: "expense.amount" },
    { key: "transferKrw", from: "transferKrw", infoItem: "expense.amount" },
    { key: "diffKrw", from: "diffKrw", infoItem: "expense.amount" },
    { key: "grossSupplyKrw", from: "grossSupplyKrw", infoItem: "expense.amount" },
    { key: "diffReason", from: "diffReason", infoItem: "expense.value" },
    { key: "processedByName", from: "processedByName", infoItem: "expense.value" },
    { key: "number", from: "number", infoItem: "expense.value" },
  ],
};

registerDto({ name: "paymentView", fields: PAYMENT_VIEW_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });

// 결재 통과가 아닌 문서면 던지지 않고 null(05 C1 갈래 방어 — 호출자가 보임을 이미 판정한 문서만 넘긴다).
export async function getPaymentView(viewer: Viewer, expenseId: string, deps?: { now?: Date }): Promise<Partial<PaymentViewDto> | null> {
  const row = UUID_SHAPE.test(expenseId) ? await findExpenseById(viewer, expenseId) : null;
  if (!row) return null;
  const instance = await findExpenseApprovalInstance(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, documentId: row.id });
  if (instance?.status !== "approved") return null;
  const [canPay, amountVisible, live] = await Promise.all([
    can(viewer, "expenses.payments", "write"),
    visible(viewer, "expense.amount"),
    findLivePayment(viewer, row.id),
  ]);
  const today = seoulToday(deps?.now);
  const shared = await loadPaymentShared(viewer);
  const pre = await loadPaymentInputs(viewer, { expenseId: row.id, payDate: today, now: deps?.now }, shared);
  // 화면 1차와 서버 게이트가 같은 규칙(gate)을 읽는다 — 사전 조회 값이라 낡을 수 있고, 지급 완료는 잠금 뒤 tx 값으로 다시 판정한다.
  const evidence = await gate(row, "payment.evidence-required", evidenceGateCtx({ shared, hasEvidence: pre.hasLiveEvidence, prepaid: row.prepaid, drafterName: pre.drafterName }));
  const pair = await gate(row, "payment.method-evidence-mismatch", pairGateCtx(row, shared));
  const actionRow = resolveExpenseActionRow(
    { approvalState: instance.status, paid: live !== null, hasEvidence: pre.hasLiveEvidence, waived: false, evidence, pair },
    { canPay, amountVisible },
  );
  if (live) {
    const names = await findUserNamesByIds(viewer, [live.processedBy]);
    return project(
      viewer,
      {
        expenseId: row.id,
        version: row.version,
        row: actionRow,
        payDate: live.payDate,
        paidTime: formatKstTime(live.processedAt),
        payableKrw: live.payableKrw,
        transferKrw: live.transferKrw,
        diffKrw: live.diffKrw,
        grossSupplyKrw: live.grossSupplyKrw,
        diffReason: live.diffReason,
        processedByName: names.get(live.processedBy) ?? null,
        number: row.number,
      },
      PAYMENT_VIEW_DTO_SPEC,
    );
  }
  const payable = await payableOf(pre);
  return project(
    viewer,
    {
      expenseId: row.id,
      version: row.version,
      row: actionRow,
      payDate: today,
      paidTime: null,
      payableKrw: payable?.payableKrw ?? null,
      transferKrw: null,
      diffKrw: null,
      grossSupplyKrw: null,
      diffReason: null,
      processedByName: null,
      number: row.number,
    },
    PAYMENT_VIEW_DTO_SPEC,
  );
}
