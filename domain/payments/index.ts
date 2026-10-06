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
import { TAX_BASIS_DATE_VAT, TAX_BASIS_DATE_WITHHOLDING, type TaxBasisDate } from "@/domain/settings/keys";
import { getApprovalView } from "@/domain/approvals";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses/access";
import { incomeTypeFor, pickTaxDates, type PickedTaxDates } from "@/domain/expenses/tax";
import { TAX_UNAVAILABLE } from "@/domain/expenses/gate";
import { hasEvidence } from "@/domain/evidence/has-evidence";
import { resolveExpenseActionRow, type ExpenseActionBar } from "@/domain/payments/action-row";
import { listCodeItems as defaultListCodeItems } from "@/repositories/code-tables";
import { findExpenseApprovalInstance, findExpenseById, lockExpenseForUpdate, type ExpenseRow } from "@/repositories/expenses";
import { bumpExpenseVersion, findLivePayment, insertPayment } from "@/repositories/expense-payments";
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
  for (const item of items) {
    const parsed = taxRuleSchema.safeParse(item.taxRule);
    if (parsed.success) rules.set(item.value, parsed.data);
  }
  const getValue = deps?.getSettingValue ?? defaultGetSettingValue;
  const basisWithholding = await getValue(TAX_BASIS_DATE_WITHHOLDING);
  const basisVat = await getValue(TAX_BASIS_DATE_VAT);
  const load = deps?.loadTaxRates ?? defaultLoadTaxRates;
  const cache = new Map<string, Promise<TaxRates>>();
  return {
    taxRuleOf: (evidenceType) => (evidenceType ? (rules.get(evidenceType) ?? null) : null),
    basisWithholding,
    basisVat,
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
  input: { expenseId: string; payDate?: string | null; now?: Date },
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
  const today = seoulToday(input.now);
  const payDate = input.payDate ?? null;
  const { amount, tax } = basisOf(row, { shared: ctxShared, payDate, today, hasLiveEvidence });
  return {
    expenseId: row.id,
    today,
    payDate,
    approvalState,
    stepName,
    evidenceType: row.evidenceType,
    hasLiveEvidence,
    amount,
    tax: tax ? { ...tax, rates: await ctxShared.ratesFor(tax.dates.basisDate) } : null,
  };
}

async function currentStepName(viewer: Viewer, expenseId: string): Promise<string | null> {
  const view = await getApprovalView(viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId, readOnlyVisible: true });
  return view?.steps?.find((step) => step.state === "current")?.label ?? null;
}

function payableOf(pre: PaymentInputs): Promise<PayableDecision> | null {
  if (!pre.amount || !pre.tax) return null;
  return decidePayable({ amount: pre.amount, taxRule: pre.tax.taxRule, applyOpts: pre.tax.dates.applyOpts, incomeType: pre.tax.incomeType }, pre.tax.rates);
}

// 잠금 뒤 기준 바뀜 신호 — 트랜잭션을 되돌린 뒤 밖에서 새 지급 총액을 셈해 PayableChangedError로 바꾼다.
class BasisChangedSignal extends Error {}

function sameBasis(pre: PaymentInputs, locked: { evidenceType: string | null; amount: PaymentAmount | null; tax: PaymentTax | null }): boolean {
  return (
    pre.evidenceType === locked.evidenceType &&
    pre.amount?.source === locked.amount?.source &&
    pre.amount?.amountKrw === locked.amount?.amountKrw &&
    pre.tax?.dates.basisDate === locked.tax?.dates.basisDate &&
    pre.tax?.dates.basisKind === locked.tax?.dates.basisKind
  );
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
// ⑷ INSERT ⑸ 문서 version + 1 ⑹ 행동 로그 payment_process(같은 tx). 이체액 = 서버가 계산한 지급 총액(칸 · 차이 사유는 06-04).
export async function completeExpensePayment(
  viewer: Viewer,
  input: { expenseId: string; payDate?: string | null; expectedPayableKrw: number; version: number },
  deps?: CompletePaymentDeps,
): Promise<CompletePaymentResult> {
  if (!(await can(viewer, "expenses.payments", "write"))) throw new ForbiddenError("지급 처리 권한 없음");
  const shared = deps?.shared ?? (await loadPaymentShared(viewer));
  const today = seoulToday(deps?.now);
  const payDate = input.payDate ?? today;
  const pre = await loadPaymentInputs(viewer, { expenseId: input.expenseId, payDate, now: deps?.now }, shared);

  try {
    return await withTransaction(async (tx) => {
      const locked = await lockExpenseForUpdate(viewer, pre.expenseId, tx);
      await deps?.afterLock?.();
      if (!locked) throw new PaymentNotFoundError();
      if (locked.version !== input.version) {
        const live = await findLivePayment(viewer, locked.id, tx);
        throw new PaymentConflictError(live ? ALREADY_PAID : `다른 사람이 ${formatKstTime(locked.updatedAt)}에 바꿈 · 새로 고침`);
      }
      const instance = await findExpenseApprovalInstance(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, documentId: locked.id }, tx);
      const decision = await gate(locked, "payment.approval-required", { approvalState: instance?.status ?? null, stepName: pre.stepName });
      if (!decision.allowed) throw new GateBlockedError(decision.reason);

      const lockedEvidence = await hasEvidence(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: locked.id }, tx);
      const lockedBasis = basisOf(locked, { shared, payDate, today: pre.today, hasLiveEvidence: lockedEvidence });
      if (!sameBasis(pre, { evidenceType: locked.evidenceType, ...lockedBasis })) throw new BasisChangedSignal();
      if (!pre.tax || !lockedBasis.amount || !lockedBasis.tax) throw new GateBlockedError(TAX_UNAVAILABLE);
      if (!locked.paymentMethod) throw new GateBlockedError(TAX_UNAVAILABLE);

      const payable = await decidePayable(
        { amount: lockedBasis.amount, taxRule: lockedBasis.tax.taxRule, applyOpts: lockedBasis.tax.dates.applyOpts, incomeType: lockedBasis.tax.incomeType },
        pre.tax.rates,
      );
      if (payable.payableKrw !== input.expectedPayableKrw) throw new PayableChangedError(payable.payableKrw, payDate);

      const payment = await insertPayment(
        viewer,
        {
          expenseId: locked.id,
          payDate,
          transferKrw: payable.transferKrw,
          payableKrw: payable.payableKrw,
          diffKrw: payable.diffKrw,
          diffReason: null,
          grossSupplyKrw: payable.grossSupplyKrw,
          paymentMethod: locked.paymentMethod,
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
          detail: { paymentId: payment.id, payDate, transferKrw: payable.transferKrw, payableKrw: payable.payableKrw },
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
    if (isUniqueViolation(error, "expense_payments_live_uniq")) throw new PaymentConflictError(ALREADY_PAID);
    throw error;
  }
}

// ── 지급 섹션 DTO ───────────────────────────────────────────────────────
// 결재 통과 문서의 지급 섹션(S5). 금액 칸은 05 정보 항목 expense.amount, 나머지는 expense.value(RS-19 — 새 정보 항목 없음).
// 지급 전 = 사전 조회 → decidePayable(처리 지급일 기본 = 오늘). 지급 뒤(E-22) = 살아 있는 지급 기록 값 그대로(다시 계산하지 않는다).
export type PaymentViewDto = {
  expenseId: string;
  version: number;
  row: ExpenseActionBar;
  payDate: string;
  paidTime: string | null;
  payableKrw: number | null;
  transferKrw: number | null;
  diffKrw: number | null;
  grossSupplyKrw: number | null;
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
  ],
};

registerDto({ name: "paymentView", fields: PAYMENT_VIEW_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });

// 결재 통과가 아닌 문서면 던지지 않고 null(05 C1 갈래 방어 — 호출자가 보임을 이미 판정한 문서만 넘긴다).
export async function getPaymentView(viewer: Viewer, expenseId: string, deps?: { now?: Date }): Promise<Partial<PaymentViewDto> | null> {
  const row = UUID_SHAPE.test(expenseId) ? await findExpenseById(viewer, expenseId) : null;
  if (!row) return null;
  const instance = await findExpenseApprovalInstance(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, documentId: row.id });
  if (instance?.status !== "approved") return null;
  const [canPay, live] = await Promise.all([can(viewer, "expenses.payments", "write"), findLivePayment(viewer, row.id)]);
  const actionRow = resolveExpenseActionRow({ approvalState: instance.status, paid: live !== null }, { canPay });
  if (live) {
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
      },
      PAYMENT_VIEW_DTO_SPEC,
    );
  }
  const today = seoulToday(deps?.now);
  const pre = await loadPaymentInputs(viewer, { expenseId: row.id, payDate: today, now: deps?.now });
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
    },
    PAYMENT_VIEW_DTO_SPEC,
  );
}
