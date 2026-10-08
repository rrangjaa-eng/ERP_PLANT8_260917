import type { Viewer } from "@/domain/viewer";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { projectMany } from "@/domain/permissions/project";
import { visible } from "@/domain/permissions/visible";
import { gate } from "@/domain/rules/gate";
import "@/domain/rules/register";
import { sumKrw } from "@/domain/money";
import { canSeeExpense, EXPENSE_DOCUMENT_KIND, visibleExpenseScope } from "@/domain/expenses/access";
import { groupExpenses } from "@/domain/expenses/list";
import { incomeTypeFor, pickTaxDates } from "@/domain/expenses/tax";
import { TAX_UNAVAILABLE } from "@/domain/expenses/gate";
import { PAYMENT_TARGET_ROW_DTO_SPEC, type PaymentTargetRowDto } from "@/domain/expenses/dto";
import { ownersWithEvidence } from "@/domain/evidence/has-evidence";
import { loadPrepaidDueDays, resolveEvidenceStatus, type EvidenceStatus } from "@/domain/evidence-reviews";
import { decidePayable, loadPaymentShared, pairGateCtx, pickPaymentAmount, type PaymentShared, type PaymentSharedDeps } from "@/domain/payments";
import { approvalGateDecision, EVIDENCE_UNCONFIRMED, resolveExpenseActionRow, type EvidenceGateInput, type ExpenseActionBar } from "@/domain/payments/action-row";
import { listTeams as listTeamRows } from "@/repositories/teams";
import { EXPENSE_GROUP_RANKS } from "@/repositories/expenses";
import { findPaymentTargetRowsByIds, listPaymentTargetRows, type PaymentTargetRow } from "@/repositories/payment-targets";
import { seoulToday } from "@/lib/dates";
import { clampPage, LIST_PAGE_SIZE, pageCountFrom } from "@/lib/paging";

// 06-15(EXP-09 · UI-SPEC S1): 지급 대상 목록 — 결재 통과 · 지급 전 · 종결 아님 지출결의. 행마다 고를 수 있는지(selectable)와 이유는
// 06-04 resolveExpenseActionRow(P4 = 고를 수 있음)가 정하고, 그 입력은 문서 화면(getPaymentView)과 같은 게이트 둘(payment.evidence-required ·
// payment.method-evidence-mismatch)이다 — 이 파일은 판정을 새로 쓰지 않는다. 증빙 유무는 06-03 ownersWithEvidence 한 번(C5).
// 지급 총액은 06-03 단건 경로와 같은 규칙(pickPaymentAmount → pickTaxDates 기준일 하나 → shared.ratesFor → decidePayable, 지급일 자리 = 오늘 KST)이라
// 같은 지급일이면 completeExpensePayment의 잠금 뒤 재계산과 같다. 문서와 무관한 사전 읽기는 요청마다 loadPaymentShared 하나(E-34).
// 쪽 자르기는 listPaymentTargets 한 곳(E-25): 판정 → 증빙 필터 → 합계 · 총 건수 → clampPage · slice.

// 증빙 필터(K-8) — 화면 select 값 목록은 이 열거에서만 온다. row = 「지출결의 상태 → 1차」 표의 P 상태.
export const PAYMENT_EVIDENCE_FILTERS = [
  { value: "unreviewed", label: "확인 전", row: "P2" },
  { value: "missing", label: "증빙 없음", row: "P3" },
  { value: "payable", label: "지급 가능", row: "P4" },
] as const satisfies readonly { value: string; label: string; row: ExpenseActionBar["row"] }[];

export type PaymentEvidenceFilter = (typeof PAYMENT_EVIDENCE_FILTERS)[number]["value"];

// 모르는 값은 필터 없음(null).
export function parsePaymentEvidenceFilter(raw: unknown): PaymentEvidenceFilter | null {
  return PAYMENT_EVIDENCE_FILTERS.find((filter) => filter.value === raw)?.value ?? null;
}

export type JudgedPaymentTarget = {
  row: PaymentTargetRow;
  bar: ExpenseActionBar;
  selectable: boolean;
  // 고를 수 없는 이유(선택 칸 이유 글자) — 고를 수 있으면 null.
  reason: string | null;
  payableKrw: number | null;
  evidenceStatus: EvidenceStatus;
};

type JudgeContext = { shared: PaymentShared; today: string; amountVisible: boolean };

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 지급 총액(DB 없음 — 세율은 shared 캐시) — 06-03 basisOf와 같은 순서. 금액 · 세금 규칙이 없으면 null(단건 경로는 TAX_UNAVAILABLE).
async function payableOf(row: PaymentTargetRow, hasLiveEvidence: boolean, ctx: JudgeContext): Promise<number | null> {
  if (row.supplyAmountKrw === null) return null;
  const taxRule = ctx.shared.taxRuleOf(row.evidenceType);
  if (!taxRule) return null;
  const amount = pickPaymentAmount({ hasLiveEvidence, evidenceAmountKrw: row.evidenceAmount, supplyAmountKrw: row.supplyAmountKrw });
  const dates = pickTaxDates(
    { paidDate: ctx.today, scheduledPaymentDate: row.scheduledPaymentDate, evidenceDate: row.evidenceDate, createdAt: row.createdAt },
    { ruleKind: taxRule.ruleKind, codeBasis: taxRule.basisDate, basisWithholding: ctx.shared.basisWithholding, basisVat: ctx.shared.basisVat, todayKst: ctx.today },
  );
  const rates = await ctx.shared.ratesFor(dates.basisDate);
  const decision = await decidePayable({ amount, taxRule, applyOpts: dates.applyOpts, incomeType: incomeTypeFor(row.evidenceType) }, rates);
  return decision.payableKrw;
}

// 선택 칸 이유 — 판정표가 1차를 막은 이유 그대로. 목록 밖이 된 행(지급 뒤 · 종결 · 결재 통과 아님 — H-3 재판정)은 상태 낱말.
function reasonOf(row: PaymentTargetRow, bar: ExpenseActionBar, payableKrw: number | null): string | null {
  if (row.closedAt !== null) return "종결";
  if (bar.row === "P0") {
    const decision = approvalGateDecision({ approvalState: row.approvalStatus, stepName: null });
    return decision.allowed ? null : decision.reason;
  }
  if (bar.row === "P5" || bar.row === "P6") return "지급 완료";
  if (bar.row === "P2") return EVIDENCE_UNCONFIRMED;
  if (bar.blockReason) return bar.blockReason;
  if (payableKrw === null) return TAX_UNAVAILABLE;
  return null;
}

async function judgeTargets(viewer: Viewer, rows: readonly PaymentTargetRow[], ctx: JudgeContext): Promise<JudgedPaymentTarget[]> {
  const withEvidence = await ownersWithEvidence(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerIds: rows.map((row) => row.id) });
  const judged: JudgedPaymentTarget[] = [];
  for (const row of rows) {
    const hasLiveEvidence = withEvidence.has(row.id);
    const evidenceCtx: EvidenceGateInput = {
      evidenceRequired: ctx.shared.evidenceRequired,
      hasEvidence: hasLiveEvidence,
      prepaid: row.prepaid,
      waived: row.review?.status === "waived",
      confirmation: row.review?.status === "confirmed" ? { reviewedAt: row.review.reviewedAt } : null,
      drafterName: row.drafterName,
    };
    const evidence = await gate(row, "payment.evidence-required", evidenceCtx);
    const pair = await gate(row, "payment.method-evidence-mismatch", pairGateCtx(row, ctx.shared));
    const bar = resolveExpenseActionRow(
      { approvalState: row.approvalStatus, paid: row.paid, hasEvidence: hasLiveEvidence, waived: evidenceCtx.waived, confirmation: evidenceCtx.confirmation, evidence, pair },
      { canPay: true, amountVisible: ctx.amountVisible },
    );
    const payableKrw = await payableOf(row, hasLiveEvidence, ctx);
    const reason = reasonOf(row, bar, payableKrw);
    judged.push({
      row,
      bar,
      selectable: reason === null && bar.row === "P4",
      reason,
      payableKrw,
      evidenceStatus: resolveEvidenceStatus({ hasEvidence: hasLiveEvidence, prepaid: row.prepaid, review: row.review }),
    });
  }
  return judged;
}

// 문서 보임(행 범위, CSO-1 패턴) — 지급 처리 경로(loadPaymentInputs)와 같은 canSeeExpense. 보는 범위 전사(06.2 rowScope all)면 결재 통과 문서는 모두 보이므로 묻지 않는다.
async function visibleRows(viewer: Viewer, rows: readonly PaymentTargetRow[], today: string): Promise<PaymentTargetRow[]> {
  const scope = await visibleExpenseScope(viewer, { today });
  if (scope.rowScope.rows === "all") return [...rows];
  const kept: PaymentTargetRow[] = [];
  for (const row of rows) if (await canSeeExpense(viewer, row, { today })) kept.push(row);
  return kept;
}

async function assertPayer(viewer: Viewer): Promise<void> {
  if (!(await can(viewer, "expenses.payments", "write"))) throw new ForbiddenError("지급 처리 권한 없음");
}

export type PaymentTargetDeps = Partial<Pick<PaymentSharedDeps, "loadTaxRates">> & { today?: string; shared?: PaymentShared };

// 쪽 자르기 전 단계 전부(E-31) — 권한 · 공유 읽기 · 보임 · 판정 · 증빙 필터. 06-20 · 06-23이 쪽 없이 한 번 부른다.
export async function listAllPaymentTargets(
  viewer: Viewer,
  input: { team?: string | null; evidence?: PaymentEvidenceFilter | null },
  deps?: PaymentTargetDeps,
): Promise<JudgedPaymentTarget[]> {
  await assertPayer(viewer);
  const today = deps?.today ?? seoulToday();
  const shared = deps?.shared ?? (await loadPaymentShared(viewer, deps?.loadTaxRates ? { loadTaxRates: deps.loadTaxRates } : undefined));
  const teamId = input.team && UUID_SHAPE.test(input.team) ? input.team : null;
  const rows = await visibleRows(viewer, await listPaymentTargetRows(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, teamId }), today);
  const judged = await judgeTargets(viewer, rows, { shared, today, amountVisible: await visible(viewer, "expense.amount") });
  const filter = PAYMENT_EVIDENCE_FILTERS.find((candidate) => candidate.value === input.evidence);
  return filter ? judged.filter((target) => target.bar.row === filter.row) : judged;
}

export type PaymentTargetGroup = { label: string; tone?: "warning"; rows: Partial<PaymentTargetRowDto>[] };

export type PaymentTargetList = {
  groups: PaymentTargetGroup[];
  // 필터 전체(쪽 무관) 건수 · 지급 총액 합 — 금액을 볼 수 없는 계급에는 null.
  total: { count: number; sumKrw: number } | null;
  // 필터 없이도 지급 대상이 하나라도 있나 — 거짓이면 「Empty — 지급 대상」, 참인데 행이 없으면 「필터 0건」.
  hasAny: boolean;
  page: { page: number; pageCount: number; total: number; pageSize: number };
  // S2 결과 줄 ② `선결제 N건 · 증빙 기한 지급일부터 N일`의 날수(설정).
  prepaidDueDays: number;
};

function titleOf(row: PaymentTargetRow): string {
  if (row.projectId === null && row.quoteLineId === null) return [row.teamName, row.content].filter(Boolean).join(" · ");
  const seq = row.installment && row.installmentSeq ? ` ${row.installmentSeq}회차` : "";
  return `${[row.projectName, row.itemName].filter(Boolean).join(" · ")}${seq}`;
}

function toDto(target: JudgedPaymentTarget, shared: PaymentShared): PaymentTargetRowDto {
  const { row } = target;
  return {
    id: row.id,
    number: row.number,
    title: titleOf(row),
    vendorName: row.vendorName,
    paymentMethodName: shared.paymentMethodName(row.paymentMethod),
    scheduledPaymentDate: row.scheduledPaymentDate,
    evidenceStatus: target.evidenceStatus,
    payableKrw: target.payableKrw,
    transferKrw: target.payableKrw,
    version: row.version,
    selectable: target.selectable,
    reason: target.reason,
    prepaid: row.prepaid,
    quoteLineId: row.quoteLineId,
  };
}

export async function projectPaymentTargets(viewer: Viewer, targets: readonly JudgedPaymentTarget[], shared: PaymentShared): Promise<Partial<PaymentTargetRowDto>[]> {
  return projectMany(
    viewer,
    targets.map((target) => toDto(target, shared)),
    PAYMENT_TARGET_ROW_DTO_SPEC,
  );
}

export async function listPaymentTargets(
  viewer: Viewer,
  input: { team?: string | null; evidence?: PaymentEvidenceFilter | null; page?: string | number },
  deps?: PaymentTargetDeps & { pageSize?: number },
): Promise<PaymentTargetList> {
  const today = deps?.today ?? seoulToday();
  await assertPayer(viewer);
  const shared = deps?.shared ?? (await loadPaymentShared(viewer, deps?.loadTaxRates ? { loadTaxRates: deps.loadTaxRates } : undefined));
  const all = await listAllPaymentTargets(viewer, { team: input.team, evidence: input.evidence }, { ...deps, today, shared });
  const amountVisible = await visible(viewer, "expense.amount");
  const pageSize = deps?.pageSize ?? LIST_PAGE_SIZE;
  const pageCount = pageCountFrom(all.length, pageSize);
  const page = clampPage(input.page, pageCount);
  const slice = all.slice((page - 1) * pageSize, page * pageSize);
  const dtos = await projectPaymentTargets(viewer, slice, shared);
  const items = slice.map((target, index) => ({ groupRank: EXPENSE_GROUP_RANKS.approved, scheduledPaymentDate: target.row.scheduledPaymentDate, dto: dtos[index] ?? {} }));
  const groups = groupExpenses(items, { status: "approved", todayKst: today }).map((group) => ({
    label: group.label,
    ...(group.tone ? { tone: group.tone } : {}),
    rows: group.rows.map((item) => item.dto),
  }));
  const filtered = Boolean(input.evidence) || Boolean(input.team);
  const hasAny = all.length > 0 || (filtered && (await listAllPaymentTargets(viewer, {}, { ...deps, today, shared })).length > 0);
  return {
    groups,
    total: amountVisible ? { count: all.length, sumKrw: sumKrw(all.map((target) => target.payableKrw ?? 0)) } : null,
    hasAny,
    page: { page, pageCount, total: all.length, pageSize },
    prepaidDueDays: all.some((target) => target.row.prepaid) ? await loadPrepaidDueDays() : 0,
  };
}

// 일괄 처리 응답의 막힌 행 재판정(H-3) — id 묶음 한 번 다시 읽어 응답 순간의 「지금 고를 수 있음」. 보이지 않거나 지워진 문서는 고를 수 없다.
export async function rejudgePaymentTargets(
  viewer: Viewer,
  ids: readonly string[],
  ctx: { shared: PaymentShared; today?: string },
): Promise<Map<string, JudgedPaymentTarget>> {
  const today = ctx.today ?? seoulToday();
  const rows = await visibleRows(viewer, await findPaymentTargetRowsByIds(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, ids }), today);
  const judged = await judgeTargets(viewer, rows, { shared: ctx.shared, today, amountVisible: await visible(viewer, "expense.amount") });
  return new Map(judged.map((target) => [target.row.id, target]));
}

// 팀 필터 값 — 활성 팀 전부(`팀 전체` + 이름). 05 · 04 listTeams는 관리 메뉴(admin.people) 보기를 요구해 지급 권한자에게 비므로
// 지급 권한 판정 뒤 활성 팀을 직접 읽는다(보관된 팀 제외).
export async function listPaymentTeamOptions(viewer: Viewer): Promise<{ value: string; label: string }[]> {
  await assertPayer(viewer);
  const rows = await listTeamRows(viewer, { scope: { rows: "all", includeArchived: false } });
  return rows.map((row) => ({ value: row.id, label: row.name }));
}
