import type { Viewer } from "@/domain/viewer";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { visible } from "@/domain/permissions/visible";
import { gate } from "@/domain/rules/gate";
import "@/domain/rules/register";
import { diffKrw, moneyFromRow, sumKrw } from "@/domain/money";
import { EXPENSE_DOCUMENT_KIND, visibleExpenseScope, type VisibleExpenseScope } from "@/domain/expenses/access";
import { buildExpenseSearch, normalizeListQuery } from "@/domain/expenses/list";
import { pickTaxDates, type TaxLinePart } from "@/domain/expenses/tax";
import { TAX_UNAVAILABLE } from "@/domain/expenses/gate";
import {
  APPROVING_PAYMENT_ROW_DTO_SPEC,
  PAID_PAYMENT_ROW_DTO_SPEC,
  PAYMENT_TARGET_ROW_DTO_SPEC,
  type ApprovingPaymentRowDto,
  type PaidPaymentRowDto,
  type PaymentTargetRowDto,
} from "@/domain/expenses/dto";
import { evidenceSourcesOf, ownersWithEvidence } from "@/domain/evidence/has-evidence";
import { listEvidence } from "@/domain/evidence";
import { EVIDENCE_FORMAT_TYPES } from "@/domain/evidence-import/types";
import { formatKstTime } from "@/domain/holidays/business-day";
import { findUserNamesByIds } from "@/repositories/users";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { loadPrepaidDueDays, resolveEvidenceStatus, type EvidenceStatus } from "@/domain/evidence-reviews";
import { decidePayable, getPaymentView, loadPaymentShared, pairGateCtx, pickPaymentAmount, projectPaymentAccounts, type PaymentShared, type PaymentSharedDeps } from "@/domain/payments";
import { approvalGateDecision, EVIDENCE_UNCONFIRMED, resolveExpenseActionRow, VENDOR_UNCONFIRMED, type EvidenceGateInput, type ExpenseActionBar } from "@/domain/payments/action-row";
import { listTeams as listTeamRows } from "@/repositories/teams";
import { listExpenseIdsInScope } from "@/repositories/expenses";
import {
  findPaymentTargetRowsByIds,
  listApprovingPaymentTargetRows,
  listPaidMonthRows,
  listPaidPaymentRows,
  listPaymentTargetRows,
  type PaidPaymentRow,
  type PaymentTargetRow,
} from "@/repositories/payment-targets";
import { seoulToday } from "@/lib/dates";
import { addDays, kstDayStart } from "@/lib/kst-date";
import { findTransferFileTimes } from "@/repositories/action-log";
import { canExportBankTransferFile } from "@/domain/payments/transfer-gate";
import { clampPage, LIST_PAGE_SIZE, pageCountFrom } from "@/lib/paging";
import { loadPayCalendar, loadPaySchedules } from "@/domain/payments/pay-schedule-load";
import { payWeekGroupLabel, payWeekIndex, thisWeekPayDate, type PaySchedule } from "@/domain/payments/pay-schedule";
import { accountChangedSinceLastPayment } from "@/domain/vendors/account-changes";

// 06-15(EXP-09 · UI-SPEC S1): 지급 대상 목록 — 결재 통과 · 지급 전 · 종결 아님 지출결의. 행마다 고를 수 있는지(selectable)와 이유는
// 06-04 resolveExpenseActionRow(P4 = 고를 수 있음)가 정하고, 그 입력은 문서 화면(getPaymentView)과 같은 게이트 둘(payment.evidence-required ·
// payment.method-evidence-mismatch)이다 — 이 파일은 판정을 새로 쓰지 않는다. 증빙 유무는 evidenceSourcesOf 한 번(C5 · 06.1-12 — 파일 또는 붙임).
// 지급 총액은 06-03 단건 경로와 같은 규칙(pickPaymentAmount → pickTaxDates 기준일 하나 → shared.ratesFor → decidePayable, 지급일 자리 = 오늘 KST)이라
// 같은 지급일이면 completeExpensePayment의 잠금 뒤 재계산과 같다. 문서와 무관한 사전 읽기는 요청마다 loadPaymentShared 하나(E-34).
// 쪽 자르기는 listPaymentTargets 한 곳(E-25): 판정 → 증빙 필터 → 합계 · 총 건수 → clampPage · slice.

// 증빙 필터(K-8) — 화면 select 값 목록은 이 열거에서만 온다. row = 「지출결의 상태 → 1차」 표의 P 상태.
// row null = 행 상태가 아닌 증빙 출처 조건(06.1-10 `file-only` — JudgedPaymentTarget.fileOnly로 거른다).
export const PAYMENT_EVIDENCE_FILTERS = [
  { value: "unreviewed", label: "확인 전", row: "P2" },
  { value: "missing", label: "증빙 없음", row: "P3" },
  { value: "payable", label: "지급 가능", row: "P4" },
  { value: "file-only", label: "파일만 있음", row: null },
] as const satisfies readonly { value: string; label: string; row: ExpenseActionBar["row"] | null }[];

// 파일 서식으로 들어오는 증빙 종류(06.1-10 PA-FILEONLY-SET) — 서식 규칙 모음의 가벼운 상수에서 모은다(엑셀 파서를 끌어오지 않는다, C-F15).
const FILE_FORMAT_EVIDENCE_TYPES: ReadonlySet<string> = new Set(EVIDENCE_FORMAT_TYPES.map((format) => format.evidenceType));

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
  // 「파일만 있음」 — 파일 서식 증빙 종류 ∧ 살아 있는 파일 ≥ 1 ∧ 살아 있는 붙임 0 ∧ 면제 아님(06.1-10 · 06.1-12 묶음 읽기 결과만).
  fileOnly: boolean;
  // 07-06(D-715 · P1): 판정 때 한 번 셈한 지급 일정 — 지급 총액의 세금 기준일 · 목록 정렬 · 묶음이 이 값 하나를 쓴다.
  schedule: PaySchedule;
};

// 07-01(D-715): 지급 일정(유효 예정일 = 수동 지정 ?? 자동)이 붙은 판정 — 목록 · 정렬 · 묶음 · 「다음 확인 전」이 이 값 하나를 쓴다.
// cutoffReason = gate `payment.cutoff` 판정 이유(그 주 소속 — 통과면 null). 지급 처리 동작은 막지 않는다(D-703 · J7).
export type ScheduledPaymentTarget = JudgedPaymentTarget & { cutoffReason: string | null };

async function cutoffReasonOf(row: PaymentTargetRow, schedule: PaySchedule): Promise<string | null> {
  const decision = await gate(row, "payment.cutoff", schedule);
  return decision.allowed ? null : decision.reason;
}

// today = 지급 총액의 지급일 자리(일괄 미리보기는 모달 지급일). scheduleAt = 지급 일정 로더의 오늘 · 지금.
type JudgeContext = { shared: PaymentShared; today: string; amountVisible: boolean; scheduleAt: { today: string; now: Date } };

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 지급 총액(DB 없음 — 세율은 shared 캐시) — 06-03 basisOf와 같은 순서. 금액 · 세금 규칙이 없으면 null(단건 경로는 TAX_UNAVAILABLE).
// 07-06(P1 · B-P1-3): 기준일 사슬의 지급 예정일 자리는 유효 예정일(이미 셈한 PaySchedule.payDate — 다시 셈하지 않는다).
async function payableOf(row: PaymentTargetRow, ctx: Pick<JudgeContext, "shared" | "today">, scheduledPaymentDate: string): Promise<number | null> {
  if (row.supplyAmountKrw === null) return null;
  const taxRule = ctx.shared.taxRuleOf(row.evidenceType);
  if (!taxRule) return null;
  const amount = pickPaymentAmount({ supplyAmountKrw: row.supplyAmountKrw });
  const dates = pickTaxDates(
    { paidDate: ctx.today, scheduledPaymentDate, evidenceDate: row.evidenceDate, createdAt: row.createdAt },
    { ruleKind: taxRule.ruleKind, codeBasis: taxRule.basisDate, basisWithholding: ctx.shared.basisWithholding, basisVat: ctx.shared.basisVat, todayKst: ctx.today },
  );
  const rates = await ctx.shared.ratesFor(dates.basisDate);
  const decision = await decidePayable({ amount, taxRule, applyOpts: dates.applyOpts, recipientCount: row.recipientCount }, rates);
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
  // 2026-10-24 사용자 결정(G13 일부 변경): 지급처 거래처가 확인 전이면 고를 수 없다 — 이체 파일 · 일괄 지급이 이 판정을 다시 읽는다.
  if (vendorPayeeOf(row) !== null && row.vendorConfirmedAt === null) return VENDOR_UNCONFIRMED;
  return null;
}

function isFileOnly(row: PaymentTargetRow, sources: { fileCount: number; linkCount: number } | undefined): boolean {
  if (!sources || row.evidenceType === null || !FILE_FORMAT_EVIDENCE_TYPES.has(row.evidenceType)) return false;
  return sources.fileCount >= 1 && sources.linkCount === 0 && row.review?.status !== "waived";
}

async function judgeTargets(viewer: Viewer, rows: readonly PaymentTargetRow[], ctx: JudgeContext): Promise<JudgedPaymentTarget[]> {
  const [withEvidence, schedules] = await Promise.all([
    evidenceSourcesOf(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerIds: rows.map((row) => row.id) }),
    loadPaySchedules(viewer, rows, ctx.scheduleAt),
  ]);
  const judged: JudgedPaymentTarget[] = [];
  for (const row of rows) {
    const schedule = schedules.get(row.id);
    if (!schedule) continue;
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
    const payableKrw = await payableOf(row, ctx, schedule.payDate);
    const reason = reasonOf(row, bar, payableKrw);
    judged.push({
      row,
      bar,
      selectable: reason === null && bar.row === "P4",
      reason,
      payableKrw,
      evidenceStatus: resolveEvidenceStatus({ hasEvidence: hasLiveEvidence, prepaid: row.prepaid, review: row.review }),
      fileOnly: isFileOnly(row, withEvidence.get(row.id)),
      schedule,
    });
  }
  return judged;
}

// 문서 보임(행 범위, CSO-1 패턴) — 지급 처리 경로(loadPaymentInputs)의 canSeeExpense와 같은 scopeCondition(기안자 ∪ 결재 관련자 ∪ 보는 범위)을
// visibleExpenseScope 한 번으로 만들어 한 질의로 거른다(06.2-08 검토 I-1 — 행마다 묻지 않는다). 보는 범위 전사(06.2 rowScope all)면 결재 통과 문서는 모두 보이므로 묻지 않는다.
async function visibleRows(viewer: Viewer, rows: readonly PaymentTargetRow[], today: string): Promise<PaymentTargetRow[]> {
  return keepVisible(viewer, rows, await visibleExpenseScope(viewer, { today }));
}

async function keepVisible<Row extends { id: string }>(viewer: Viewer, rows: readonly Row[], scope: VisibleExpenseScope): Promise<Row[]> {
  if (scope.rowScope.rows === "all") return [...rows];
  const kept = await listExpenseIdsInScope(viewer, { ids: rows.map((row) => row.id), scope, documentKind: EXPENSE_DOCUMENT_KIND });
  return rows.filter((row) => kept.has(row.id));
}

async function assertPayer(viewer: Viewer): Promise<void> {
  if (!(await can(viewer, "expenses.payments", "write"))) throw new ForbiddenError("지급 처리 권한 없음");
}

export type PaymentTargetDeps = Partial<Pick<PaymentSharedDeps, "loadTaxRates">> & { today?: string; now?: Date; shared?: PaymentShared };

// 07-01(D-715): 판정 행(지급 일정은 judgeTargets가 이미 셈함)을 계산 실패(R15) → 유효 예정일 → 번호 → id로 줄 세운다(목록이 메모리 전체라 도메인이
// 다시 정렬 — repositories/payment-targets.ts의 SQL 순서는 저장 칸 기준 선순서일 뿐이다). 행마다 gate `payment.cutoff` 판정을 붙인다(판정 경로 하나 — EXP-12).
async function withSchedules(judged: readonly JudgedPaymentTarget[]): Promise<ScheduledPaymentTarget[]> {
  const scheduled: ScheduledPaymentTarget[] = [];
  for (const target of judged) scheduled.push({ ...target, cutoffReason: await cutoffReasonOf(target.row, target.schedule) });
  return scheduled.sort((a, b) => compareTargetKey(targetKeyOf(a), targetKeyOf(b)));
}

// 쪽 자르기 전 단계 전부(E-31) — 권한 · 공유 읽기 · 보임 · 판정 · 증빙 필터. 06-20 · 06-23이 쪽 없이 한 번 부른다.
export async function listAllPaymentTargets(
  viewer: Viewer,
  input: { team?: string | null; evidence?: PaymentEvidenceFilter | null; q?: string | null },
  deps?: PaymentTargetDeps,
): Promise<ScheduledPaymentTarget[]> {
  await assertPayer(viewer);
  const today = deps?.today ?? seoulToday();
  const shared = deps?.shared ?? (await loadPaymentShared(viewer, deps?.loadTaxRates ? { loadTaxRates: deps.loadTaxRates } : undefined));
  const teamId = input.team && UUID_SHAPE.test(input.team) ? input.team : null;
  // 06.5 D-6508: 검색 열은 지급 대상 보기의 DTO 열(기안자 이름 없음 — D2) × 정보 항목. 보는 범위는 visibleRows가 그 뒤에 거른다(AND).
  const search = await buildExpenseSearch(viewer, "paymentTargets", input.q);
  const rows = await visibleRows(viewer, await listPaymentTargetRows(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, teamId, ...(search ? { search } : {}) }), today);
  const scheduleAt = { today, now: deps?.now ?? new Date() };
  const judged = await withSchedules(await judgeTargets(viewer, rows, { shared, today, amountVisible: await visible(viewer, "expense.amount"), scheduleAt }));
  const filter = PAYMENT_EVIDENCE_FILTERS.find((candidate) => candidate.value === input.evidence);
  if (!filter) return judged;
  return filter.row === null ? judged.filter((target) => target.fileOnly) : judged.filter((target) => target.bar.row === filter.row);
}

export type PaymentTargetGroup = { label: string; tone?: "warning"; rows: Partial<PaymentTargetRowDto>[] };

// 07-01(J11 데이터 — 화면은 07-16): 지금 승인되면 이번 주 · 다음 주에 들어갈 결재 중 지출결의. groups · total에는 들어가지 않는다.
// page = 이 하위 그룹이 서는 쪽 — 그 주 지급 대상 그룹의 마지막 행이 있는 쪽, 그 주 지급 대상이 없으면 1쪽(07-16 감사 #4 — 쪽마다 되풀이하지 않는다).
export type ApprovingPaymentWeek = { label: string; count: number; sumKrw: number | null; rows: Partial<ApprovingPaymentRowDto>[]; page: number };

export type PaymentTargetList = {
  groups: PaymentTargetGroup[];
  // 필터 전체(쪽 무관) 건수 · 지급 총액 합 — 금액을 볼 수 없는 계급에는 null.
  total: { count: number; sumKrw: number } | null;
  // 필터 없이도 지급 대상이 하나라도 있나 — 거짓이면 「Empty — 지급 대상」, 참인데 행이 없으면 「필터 0건」.
  hasAny: boolean;
  page: { page: number; pageCount: number; total: number; pageSize: number };
  // S2 결과 줄 ② `선결제 N건 · 증빙 기한 지급일부터 N일`의 날수(설정).
  prepaidDueDays: number;
  approvingByWeek: ApprovingPaymentWeek[];
  // 07-06(J9 · K6): 「이번 주로」가 옮길 이번 주 지급일 — 그 날이 지났으면(오늘 > 이번 주 지급일) null(07-16이 `이번 주로`를 숨긴다).
  thisWeekMove: { payDate: string } | null;
};

function titleOf(
  row: Pick<PaymentTargetRow, "projectId" | "quoteLineId" | "teamName" | "content" | "installment" | "installmentSeq" | "projectName" | "itemName">,
): string {
  if (row.projectId === null && row.quoteLineId === null) return [row.teamName, row.content].filter(Boolean).join(" · ");
  const seq = row.installment && row.installmentSeq ? ` ${row.installmentSeq}회차` : "";
  return `${[row.projectName, row.itemName].filter(Boolean).join(" · ")}${seq}`;
}

// 07-23 N2: 지급처가 거래처인 행(직원 지급처 문서는 줄 거래처가 있어도 그 계좌로 나가지 않는다).
function vendorPayeeOf(row: Pick<PaymentTargetRow, "vendorId" | "payeeUserId">): string | null {
  return row.payeeUserId === null ? row.vendorId : null;
}

function toDto(
  target: ScheduledPaymentTarget,
  shared: PaymentShared,
  transferFileAt: ReadonlyMap<string, string>,
  changedVendors: ReadonlySet<string>,
): PaymentTargetRowDto {
  const { row } = target;
  const vendorPayee = vendorPayeeOf(row);
  return {
    id: row.id,
    number: row.number,
    title: titleOf(row),
    vendorName: row.vendorName,
    payeeUserName: row.payeeUserName,
    paymentMethodName: shared.paymentMethodName(row.paymentMethod),
    scheduledPaymentDate: target.schedule.payDate,
    evidenceStatus: target.evidenceStatus,
    payableKrw: target.payableKrw,
    transferKrw: target.payableKrw,
    version: row.version,
    selectable: target.selectable,
    reason: target.reason,
    prepaid: row.prepaid,
    quoteLineId: row.quoteLineId,
    transferFileAt: transferFileAt.get(row.id) ?? null,
    scheduledPaymentManual: target.schedule.manual,
    autoPaymentDate: target.schedule.autoPayDate,
    paymentCutoffAt: target.schedule.cutoffAt.toISOString(),
    paymentPushReason: target.schedule.pushReason,
    paymentScheduleFailed: target.schedule.failed === true,
    paymentCutoffReason: target.cutoffReason,
    vendorConfirmed: vendorPayee === null || row.vendorConfirmedAt !== null,
    accountChanged: vendorPayee !== null && changedVendors.has(vendorPayee),
  };
}

export async function projectPaymentTargets(
  viewer: Viewer,
  targets: readonly ScheduledPaymentTarget[],
  shared: PaymentShared,
  transferFileAt: ReadonlyMap<string, string> = new Map(),
): Promise<Partial<PaymentTargetRowDto>[]> {
  // 07-23 AQ-36: 계좌 바뀜은 쪽의 거래처 지급처 묶음으로 한 번 묻는다(행마다 부르지 않는다).
  const changedVendors = await accountChangedSinceLastPayment(viewer, targets.flatMap((target) => vendorPayeeOf(target.row) ?? []));
  // 06-20(O-17) — 계좌 칸은 문서 화면과 같은 투영 함수 하나. 지급 방식 코드 · 거래처 id · 직원 지급처 id(06.5 D-6517)는 스펙 밖 키라 projectMany가 버린다.
  const rows = await projectPaymentAccounts(
    viewer,
    targets.map((target) => ({ ...toDto(target, shared, transferFileAt, changedVendors), paymentMethod: target.row.paymentMethod, vendorId: target.row.vendorId, payeeUserId: target.row.payeeUserId })),
  );
  return projectMany(viewer, rows, PAYMENT_TARGET_ROW_DTO_SPEC);
}

export async function listPaymentTargets(
  viewer: Viewer,
  input: { team?: string | null; evidence?: PaymentEvidenceFilter | null; q?: string | null; page?: string | number },
  deps?: PaymentTargetDeps & { pageSize?: number },
): Promise<PaymentTargetList> {
  const today = deps?.today ?? seoulToday();
  await assertPayer(viewer);
  const shared = deps?.shared ?? (await loadPaymentShared(viewer, deps?.loadTaxRates ? { loadTaxRates: deps.loadTaxRates } : undefined));
  const all = await listAllPaymentTargets(viewer, { team: input.team, evidence: input.evidence, q: input.q }, { ...deps, today, shared });
  const amountVisible = await visible(viewer, "expense.amount");
  const pageSize = deps?.pageSize ?? LIST_PAGE_SIZE;
  const pageCount = pageCountFrom(all.length, pageSize);
  const page = clampPage(input.page, pageCount);
  const slice = all.slice((page - 1) * pageSize, page * pageSize);
  const dtos = await projectPaymentTargets(viewer, slice, shared, await transferFileTimes(viewer, slice, today));
  // 07-01: 지급 주 머리글(payWeekGroupLabel) — 연속 같은 라벨은 머리글 하나(기존 groupExpenses의 연속 묶음 규칙).
  const groups: PaymentTargetGroup[] = [];
  slice.forEach((target, index) => {
    const head = payWeekGroupLabel(target.schedule, today);
    const last = groups.at(-1);
    if (last && last.label === head.label) last.rows.push(dtos[index] ?? {});
    else groups.push({ label: head.label, ...(head.tone ? { tone: head.tone } : {}), rows: [dtos[index] ?? {}] });
  });
  // EP1-13: 검색도 필터다 — 검색으로 0건이어도 「필터 없이 하나라도 있나」를 q 없이 다시 센다.
  const filtered = Boolean(input.evidence) || Boolean(input.team) || normalizeListQuery(input.q) !== null;
  const hasAny = all.length > 0 || (filtered && (await listAllPaymentTargets(viewer, {}, { ...deps, today, shared })).length > 0);
  const lastIndexOf = new Map<string, number>();
  all.forEach((target, index) => lastIndexOf.set(payWeekGroupLabel(target.schedule, today).label, index));
  const approvingByWeek = (await listApprovingByWeek(viewer, input, { shared, today, now: deps?.now ?? new Date(), amountVisible })).map((week) => {
    const last = lastIndexOf.get(week.label);
    return { ...week, page: last === undefined ? 1 : Math.floor(last / pageSize) + 1 };
  });
  return {
    groups,
    total: amountVisible ? { count: all.length, sumKrw: sumKrw(all.map((target) => target.payableKrw ?? 0)) } : null,
    hasAny,
    page: { page, pageCount, total: all.length, pageSize },
    prepaidDueDays: all.some((target) => target.row.prepaid) ? await loadPrepaidDueDays() : 0,
    approvingByWeek,
    thisWeekMove: await thisWeekMoveOf(today),
  };
}

async function thisWeekMoveOf(today: string): Promise<{ payDate: string } | null> {
  const { cfg, lookup } = await loadPayCalendar([Number(today.slice(0, 4))]);
  const payDate = thisWeekPayDate(today, cfg, lookup);
  return today > payDate ? null : { payDate };
}

// 07-01(J11 데이터): 같은 팀 · 검색 조건 · 같은 보임 범위의 결재 중 지출결의를 「지금 승인되면」 일정(approvedAt null → now 기준)으로 셈해
// 이번 주 · 다음 주 머리글로 묶는다. 상태 낱말은 gate `payment.cutoff` 이유(결재 중) 그대로.
async function listApprovingByWeek(
  viewer: Viewer,
  input: { team?: string | null; q?: string | null },
  ctx: { shared: PaymentShared; today: string; now: Date; amountVisible: boolean },
): Promise<Omit<ApprovingPaymentWeek, "page">[]> {
  const teamId = input.team && UUID_SHAPE.test(input.team) ? input.team : null;
  const search = await buildExpenseSearch(viewer, "paymentTargets", input.q);
  const rows = await visibleRows(viewer, await listApprovingPaymentTargetRows(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, teamId, ...(search ? { search } : {}) }), ctx.today);
  if (rows.length === 0) return [];
  const schedules = await loadPaySchedules(viewer, rows, { today: ctx.today, now: ctx.now });
  const picked: { row: PaymentTargetRow; schedule: PaySchedule; payableKrw: number | null; status: string }[] = [];
  for (const row of rows) {
    const schedule = schedules.get(row.id);
    if (!schedule || schedule.failed || schedule.payDate < ctx.today) continue;
    const week = payWeekIndex(schedule.payDate, ctx.today);
    if (week !== 0 && week !== 1) continue;
    picked.push({ row, schedule, payableKrw: await payableOf(row, ctx, schedule.payDate), status: (await cutoffReasonOf(row, schedule)) ?? "결재 중" });
  }
  picked.sort((a, b) => compareTargetKey({ failed: false, payDate: a.schedule.payDate, number: a.row.number, id: a.row.id }, { failed: false, payDate: b.schedule.payDate, number: b.row.number, id: b.row.id }));
  const dtos = await projectMany(
    viewer,
    picked.map((item): ApprovingPaymentRowDto => ({ id: item.row.id, number: item.row.number, title: titleOf(item.row), payableKrw: item.payableKrw, status: item.status })),
    APPROVING_PAYMENT_ROW_DTO_SPEC,
  );
  const weeks: { label: string; amounts: number[]; rows: Partial<ApprovingPaymentRowDto>[] }[] = [];
  picked.forEach((item, index) => {
    const label = payWeekGroupLabel(item.schedule, ctx.today).label;
    let week = weeks.at(-1);
    if (!week || week.label !== label) {
      week = { label, amounts: [], rows: [] };
      weeks.push(week);
    }
    week.amounts.push(item.payableKrw ?? 0);
    week.rows.push(dtos[index] ?? {});
  });
  return weeks.map((week) => ({ label: week.label, count: week.rows.length, sumKrw: ctx.amountVisible ? sumKrw(week.amounts) : null, rows: week.rows }));
}

// 06.5-06(결정 맥락 11 · DM-5): 이 쪽 문서 중 오늘(KST) 이체 파일에 담긴 문서 → 가장 늦은 시각 HH:mm. 이체 파일 게이트를 가진 사람에게만 읽는다.
async function transferFileTimes(viewer: Viewer, targets: readonly JudgedPaymentTarget[], today: string): Promise<ReadonlyMap<string, string>> {
  if (targets.length === 0 || !(await canExportBankTransferFile(viewer))) return new Map();
  const ids = new Set(targets.map((target) => target.row.id));
  const rows = await findTransferFileTimes(viewer, { expenseIds: [...ids], since: kstDayStart(today) });
  const latest = new Map<string, Date>();
  for (const row of rows) {
    for (const id of row.expenseIds) {
      const before = latest.get(id);
      if (ids.has(id) && (!before || row.occurredAt > before)) latest.set(id, row.occurredAt);
    }
  }
  return new Map([...latest].map(([id, at]) => [id, formatKstTime(at)]));
}

// 일괄 처리 응답의 막힌 행 재판정(H-3) — id 묶음 한 번 다시 읽어 응답 순간의 「지금 고를 수 있음」. 보이지 않거나 지워진 문서는 고를 수 없다.
export async function rejudgePaymentTargets(
  viewer: Viewer,
  ids: readonly string[],
  ctx: { shared: PaymentShared; today?: string; now?: Date },
): Promise<Map<string, JudgedPaymentTarget>> {
  const today = ctx.today ?? seoulToday();
  const rows = await visibleRows(viewer, await findPaymentTargetRowsByIds(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, ids }), today);
  const judged = await judgeTargets(viewer, rows, { shared: ctx.shared, today, amountVisible: await visible(viewer, "expense.amount"), scheduleAt: { today, now: ctx.now ?? new Date() } });
  return new Map(judged.map((target) => [target.row.id, target]));
}

// 06-17(UI-SPEC S1 「합계 줄」 · O-18 · r2 F-2): 고른 건 이체액 합 · 행별 차이 · 고른 행 상태. 화면은 금액을 셈하지 않는다 — 고른 행 id와 사람이 고친
// 이체액만 받아 지급 총액 · version을 서버가 다시 읽고(id 묶음 한 번), 고를 수 있는지는 06-15 judgeTargets 그대로다(새 판정 없음).
// 합 = sumKrw(고를 수 있는 행의 이체액 — 고치지 않았으면 지급 총액), 차이 = diffKrw(이체액, 지급 총액). 응답에 합계 번호(seq)를 그대로 싣는다 —
// 화면이 낡은 응답을 버린다. 지급 대상 조회 범위 밖(없는 id · 보이지 않는 문서 · 결재 통과가 아닌 문서)은 rowStates에 싣지 않는다.
// payDate(모달이 마지막으로 쓴 지급일, 없으면 오늘)는 지급 총액의 세율 기준일 자리 — 처리 요청과 같은 날로 셈해 재시도가 다시 막히지 않는다.
// quoteLineId · prepaid(검토 D-2) — 모달 결과 줄 ① 견적 줄 수 · ② 선결제 수가 지금 쪽 밖 고른 행도 센다.
export type PaymentRowState = { id: string; selectable: boolean; version: number; payableKrw: number | null; quoteLineId: string | null; prepaid: boolean };

// 정보 항목은 06-15 PAYMENT_TARGET_ROW_DTO_SPEC(paymentTargetRow)의 같은 칸 그대로.
const PAYMENT_ROW_STATE_SPEC: DtoSpec<PaymentRowState, PaymentRowState> = {
  fields: [
    { key: "id", from: "id", infoItem: "expense.value" },
    { key: "selectable", from: "selectable", infoItem: "expense.value" },
    { key: "version", from: "version", infoItem: "expense.value" },
    { key: "payableKrw", from: "payableKrw", infoItem: "expense.amount" },
    { key: "quoteLineId", from: "quoteLineId", infoItem: "expense.value" },
    { key: "prepaid", from: "prepaid", infoItem: "expense.value" },
  ],
};

export type SelectedTransferSum = {
  seq: number;
  // 금액을 볼 수 없는 계급에는 null · 빈 차이.
  totalKrw: number | null;
  diffs: Record<string, number>;
  rowStates: Partial<PaymentRowState>[];
};

export async function sumSelectedTransfers(
  viewer: Viewer,
  input: { seq: number; rows: readonly { id: string; transferKrw?: number }[]; payDate?: string },
  deps?: PaymentTargetDeps,
): Promise<SelectedTransferSum> {
  await assertPayer(viewer);
  const today = deps?.today ?? seoulToday();
  const shared = deps?.shared ?? (await loadPaymentShared(viewer, deps?.loadTaxRates ? { loadTaxRates: deps.loadTaxRates } : undefined));
  const transferOf = new Map(input.rows.map((row) => [row.id, row.transferKrw]));
  const found = await findPaymentTargetRowsByIds(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, ids: [...transferOf.keys()] });
  const rows = await visibleRows(
    viewer,
    found.filter((row) => row.approvalStatus === "approved"),
    today,
  );
  const amountVisible = await visible(viewer, "expense.amount");
  const judged = await judgeTargets(viewer, rows, { shared, today: input.payDate ?? today, amountVisible, scheduleAt: { today, now: deps?.now ?? new Date() } });
  const diffs: Record<string, number> = {};
  const transfers: number[] = [];
  for (const target of judged) {
    if (!target.selectable || target.payableKrw === null) continue;
    const transfer = transferOf.get(target.row.id) ?? target.payableKrw;
    transfers.push(transfer);
    diffs[target.row.id] = diffKrw(transfer, target.payableKrw);
  }
  const rowStates = await projectMany(
    viewer,
    judged.map((target) => ({
      id: target.row.id,
      selectable: target.selectable,
      version: target.row.version,
      payableKrw: target.payableKrw,
      quoteLineId: target.row.quoteLineId,
      prepaid: target.row.prepaid,
    })),
    PAYMENT_ROW_STATE_SPEC,
  );
  return { seq: input.seq, totalKrw: amountVisible ? sumKrw(transfers) : null, diffs: amountVisible ? diffs : {}, rowStates };
}

// 06-17(UI-SPEC S1 「제자리 증빙 확인」 · DR-4 · r2 B-1): 확인 모달 보기 — 트랜잭션 없는 읽기. 지급 권한 · 지급 대상 조회 범위(보임) · 「확인 전」(P2 · P5)만.
// 파일 행은 05 listEvidence(살아 있는 것), 서버 계산 한 줄 · 지금 version · 증빙 지문은 06-06 getPaymentView 값 그대로(새 계산 없음 —
// 06.5 D-6520 증빙 금액 칸 · 넘침 줄 없음). 모달이 확인할 때 이 version + 지문을 보내 06-06 confirmEvidence가
// 잠금 뒤 다시 비교한다 — 보지 않은 증빙이 「확인됨」이 되지 않는다. 행 version이 지금과 다르면 같은 보기에 동시성 이유를 싣는다(화면이 1차를 막는다).
export const EVIDENCE_NOT_UNREVIEWED = "확인 전 아님 · 새로 고침";
const EVIDENCE_VIEW_MISSING = "없는 지출결의 · 새로 고침";

export type EvidenceConfirmFile = { id: string; name: string; sizeBytes: number; createdAt: string };

export type EvidenceConfirmView = {
  expenseId: string;
  number: string | null;
  title: string;
  version: number;
  evidenceStamp: string;
  taxLine: TaxLinePart[] | null;
  // 06.5-07 S1 부제 끝 `공급가액 {금액}` — 문서 통화 금액(영수증과 대조하는 값). 공급가가 없으면 null.
  supply: { currency: string; amount: number } | null;
  files: EvidenceConfirmFile[];
  conflict: string | null;
};

// 금액 칸은 06-06 PAYMENT_VIEW_DTO_SPEC(paymentView)과 같은 정보 항목 expense.amount, 나머지는 expense.value.
const EVIDENCE_CONFIRM_VIEW_SPEC: DtoSpec<EvidenceConfirmView, EvidenceConfirmView> = {
  fields: [
    { key: "expenseId", from: "expenseId", infoItem: "expense.value" },
    { key: "number", from: "number", infoItem: "expense.value" },
    { key: "title", from: "title", infoItem: "expense.value" },
    { key: "version", from: "version", infoItem: "expense.value" },
    { key: "evidenceStamp", from: "evidenceStamp", infoItem: "expense.amount" },
    { key: "taxLine", from: "taxLine", infoItem: "expense.amount" },
    { key: "supply", from: "supply", infoItem: "expense.amount" },
    { key: "files", from: "files", infoItem: "expense.value" },
    { key: "conflict", from: "conflict", infoItem: "expense.value" },
  ],
};

export async function getEvidenceConfirmView(viewer: Viewer, input: { expenseId: string; rowVersion: number }): Promise<Partial<EvidenceConfirmView>> {
  await assertPayer(viewer);
  if (!UUID_SHAPE.test(input.expenseId)) throw new UserFacingError(EVIDENCE_VIEW_MISSING);
  const found = await findPaymentTargetRowsByIds(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, ids: [input.expenseId] });
  const [row] = await visibleRows(
    viewer,
    found.filter((candidate) => candidate.approvalStatus === "approved"),
    seoulToday(),
  );
  if (!row) throw new UserFacingError(EVIDENCE_VIEW_MISSING);
  const view = await getPaymentView(viewer, row.id);
  const state = view?.row?.row;
  if (!view || (state !== "P2" && state !== "P5")) throw new UserFacingError(EVIDENCE_NOT_UNREVIEWED);
  const files = (await listEvidence(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: row.id })).flatMap((file) =>
    file.id && !file.voidedAt ? [{ id: file.id, name: file.originalName ?? "", sizeBytes: file.sizeBytes ?? 0, createdAt: new Date(file.createdAt ?? 0).toISOString() }] : [],
  );
  let conflict: string | null = null;
  if (row.version !== input.rowVersion) {
    const name = row.updatedBy ? (await findUserNamesByIds(viewer, [row.updatedBy])).get(row.updatedBy) : undefined;
    conflict = `${name ? `${name}이` : "다른 사람이"} ${formatKstTime(row.updatedAt)}에 바꿈 · 새로 고침`;
  }
  const supply =
    row.supplyAmountKrw === null ? null : moneyFromRow({ currency: row.supplyCurrency, foreignAmount: row.supplyForeignAmount, fxRate: row.supplyFxRate, amountKrw: row.supplyAmountKrw });
  const [projected] = await projectMany(
    viewer,
    [
      {
        expenseId: row.id,
        number: row.number,
        title: titleOf(row),
        version: row.version,
        evidenceStamp: view.evidenceStamp ?? "",
        taxLine: view.evidenceTaxLine ?? null,
        supply: supply && { currency: supply.currency, amount: supply.amount },
        files,
        conflict,
      },
    ],
    EVIDENCE_CONFIRM_VIEW_SPEC,
  );
  return projected ?? {};
}

// 팀 필터 값 — 활성 팀 전부(`팀 전체` + 이름). 05 · 04 listTeams는 관리 메뉴(admin.people) 보기를 요구해 지급 권한자에게 비므로
// 지급 권한 판정 뒤 활성 팀을 직접 읽는다(보관된 팀 제외).
export async function listPaymentTeamOptions(viewer: Viewer): Promise<{ value: string; label: string }[]> {
  await assertPayer(viewer);
  return activeTeamOptions(viewer);
}

async function activeTeamOptions(viewer: Viewer): Promise<{ value: string; label: string }[]> {
  const rows = await listTeamRows(viewer, { scope: { rows: "all", includeArchived: false } });
  return rows.map((row) => ({ value: row.id, label: row.name }));
}

// 06-20(S3) 팀 select — 지급 완료 보기를 받는 사람(지급 권한자 · 대표)에게 같은 활성 팀 목록.
export async function listPaidTeamOptions(viewer: Viewer): Promise<{ value: string; label: string }[]> {
  if (!(await paidViewAllowed(viewer))) throw new ForbiddenError("지급 완료 보기 권한 없음");
  return activeTeamOptions(viewer);
}

// ── 06-20(UI-SPEC S3) 「지급 완료」 보기 ──────────────────────────────────
// 받는 사람 = 지급 권한자 ∪ 05 visibleExpenseScope의 전사 보는 범위(06.2 rowScope all — 대표). 역할 이름 리터럴 없이 05 보임 규칙으로 판정한다.
// 행은 살아 있는 지급 기록 전부(06.5 카드 ③), 계좌 칸은 조회부터 없다(O-17). 주 그룹 · 합계(sumKrw) · 쪽은 서버가 정한다. 트랜잭션 없는 읽기.

const MONTH_SHAPE = /^\d{4}-(0[1-9]|1[0-2])$/;

function paidAllowedBy(canPay: boolean, scope: VisibleExpenseScope): boolean {
  return canPay || scope.rowScope.rows === "all";
}

export async function paidViewAllowed(viewer: Viewer, deps?: { today?: string }): Promise<boolean> {
  if (await can(viewer, "expenses.payments", "write")) return true;
  return paidAllowedBy(false, await visibleExpenseScope(viewer, { today: deps?.today ?? seoulToday() }));
}

// 지급일 주 그룹(KST 달력 · 월요일 시작) — 오늘 뒤 = `예정 지급`, 이번 주 · 지난주, 그 앞은 그 주 `MM-DD ~ MM-DD`.
function payWeekLabel(payDate: string, today: string): string {
  if (payDate > today) return "예정 지급";
  const mondayOf = (date: string) => {
    const [year, month, day] = date.split("-").map(Number) as [number, number, number];
    return addDays(date, -((new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7));
  };
  const thisMonday = mondayOf(today);
  if (payDate >= thisMonday) return "이번 주";
  if (payDate >= addDays(thisMonday, -7)) return "지난주";
  const monday = mondayOf(payDate);
  return `${monday.slice(5)} ~ ${addDays(monday, 6).slice(5)}`;
}

export type PaidPaymentGroup = { label: string; rows: Partial<PaidPaymentRowDto>[] };

export type PaidPaymentList = {
  groups: PaidPaymentGroup[];
  // 그 달 · 팀 전체(쪽 무관) 건수 · 이체액 합 — 금액을 볼 수 없는 계급에는 null.
  total: { count: number; sumKrw: number } | null;
  page: { page: number; pageCount: number; total: number; pageSize: number };
  // 고른 달(`YYYY-MM`)과 월 select 값(이번 달 + 보임 범위 안 지급이 있는 달, 최근 순).
  month: string;
  months: string[];
};

export async function listPaidPayments(
  viewer: Viewer,
  input: { team?: string | null; month?: string | null; q?: string | null; page?: string | number },
  deps?: { today?: string; pageSize?: number },
): Promise<PaidPaymentList> {
  const today = deps?.today ?? seoulToday();
  const [canPay, scope] = await Promise.all([can(viewer, "expenses.payments", "write"), visibleExpenseScope(viewer, { today })]);
  if (!paidAllowedBy(canPay, scope)) throw new ForbiddenError("지급 완료 보기 권한 없음");
  // 06.5 D-6516 · 카드 ③(사용자 카드 10/13 23:29 KST): 지급 완료는 06.2 K2와 같은 결 — 지급 권한자 · 지출결의 전사 범위는 전부, 그 밖은 06-20이 거부.
  // 통과한 viewer는 모두 전부라 거르는 갈래를 두지 않는다(팀 비용 포함, EP1-12).
  const teamId = input.team && UUID_SHAPE.test(input.team) ? input.team : null;
  const month = input.month && MONTH_SHAPE.test(input.month) ? input.month : today.slice(0, 7);
  // 06.5 D-6508: 통과한 viewer는 모두 전부를 보므로(카드 ③) 검색은 그 지급만 좁힌다 — 열은 지급 완료 DTO의 열(기안자 이름 없음 — D2) × 정보 항목.
  const search = await buildExpenseSearch(viewer, "paid", input.q);
  const all = await listPaidPaymentRows(viewer, { teamId, month, ...(search ? { search } : {}) });
  const monthRows = await listPaidMonthRows(viewer, { teamId });
  const months = [...new Set([today.slice(0, 7), ...monthRows.map((row) => row.month)])].sort().reverse();
  const amountVisible = await visible(viewer, "expense.amount");
  const pageSize = deps?.pageSize ?? LIST_PAGE_SIZE;
  const pageCount = pageCountFrom(all.length, pageSize);
  const page = clampPage(input.page, pageCount);
  const slice = all.slice((page - 1) * pageSize, page * pageSize);
  const dtos = await projectPaidRows(viewer, slice);
  const groups: PaidPaymentGroup[] = [];
  slice.forEach((row, index) => {
    const label = payWeekLabel(row.payDate, today);
    const dto = dtos[index] ?? {};
    const last = groups.at(-1);
    if (last && last.label === label) last.rows.push(dto);
    else groups.push({ label, rows: [dto] });
  });
  return {
    groups,
    total: amountVisible ? { count: all.length, sumKrw: sumKrw(all.map((row) => row.transferKrw)) } : null,
    page: { page, pageCount, total: all.length, pageSize },
    month,
    months,
  };
}

// 쪽 행만 — 증빙 유무는 06-03 ownersWithEvidence 한 번(C5), 상태 낱말은 06-06 resolveEvidenceStatus, 지급 방식은 지급 기록이 복사한 코드의 이름.
async function projectPaidRows(viewer: Viewer, rows: readonly PaidPaymentRow[]): Promise<Partial<PaidPaymentRowDto>[]> {
  if (rows.length === 0) return [];
  const [withEvidence, shared] = await Promise.all([
    ownersWithEvidence(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerIds: rows.map((row) => row.id) }),
    loadPaymentShared(viewer),
  ]);
  return projectMany(
    viewer,
    rows.map(
      (row): PaidPaymentRowDto => ({
        id: row.id,
        number: row.number,
        title: titleOf(row),
        vendorName: row.vendorName,
        payeeUserName: row.payeeUserName,
        paymentMethodName: shared.paymentMethodName(row.paymentMethod),
        payDate: row.payDate,
        transferKrw: row.transferKrw,
        diffKrw: row.diffKrw,
        diffReason: row.diffReason,
        evidenceStatus: resolveEvidenceStatus({ hasEvidence: withEvidence.has(row.id), prepaid: row.prepaid, review: row.review }),
        processedByName: row.processedByName,
        version: row.version,
      }),
    ),
    PAID_PAYMENT_ROW_DTO_SPEC,
  );
}

// ── 06-20(C-1 문서 화면 쪽) 문서 화면 왕복 ─────────────────────────────────
// S1 번호 링크(06-17 docHref — `from=pay` + status · team · evidence · page)로 연 문서 화면의 3차 `지급 대상으로` · `다음 확인 전 {번호}`.
// 받은 쿼리는 허용 키만 검사해 남기고 href는 늘 새로 만든다 — 받은 URL · 경로 · 원문을 되돌려 보내지 않는다(열린 리디렉션 없음, T-06-175).
export type PayReturn = { backHref: string; next: { number: string; href: string } | null };
export type PayReturnQuery = { backHref: string; docQuery: string; team: string | null; evidence: PaymentEvidenceFilter | null; q: string | null };

const PAY_RETURN_PAGE = /^[1-9]\d{0,2}$/;

function single(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function parsePayReturn(searchParams: Readonly<Record<string, string | string[] | undefined>>): PayReturnQuery | null {
  if (single(searchParams.from) !== "pay") return null;
  const teamRaw = single(searchParams.team);
  const team = teamRaw && UUID_SHAPE.test(teamRaw) ? teamRaw : null;
  const evidence = parsePaymentEvidenceFilter(single(searchParams.evidence));
  const pageRaw = single(searchParams.page);
  const page = pageRaw && PAY_RETURN_PAGE.test(pageRaw) ? pageRaw : null;
  const q = normalizeListQuery(single(searchParams.q));
  const kept = new URLSearchParams({ status: "지급 대상" });
  if (team) kept.set("team", team);
  if (evidence) kept.set("evidence", evidence);
  if (q) kept.set("q", q);
  if (page) kept.set("page", page);
  return { backHref: `/expenses?${kept.toString()}`, docQuery: `from=pay&${kept.toString()}`, team, evidence, q };
}

// 정렬 키 = 지급 대상 목록의 정렬(07-01: 유효 예정일 오름 → 번호 → id). 저장 칸(scheduled_payment_date)으로 비교하지 않는다(B-P2-2).
// 계산 실패(R15) 행은 맨 앞 묶음.
type TargetKey = { failed: boolean; payDate: string; number: string | null; id: string };

function targetKeyOf(target: ScheduledPaymentTarget): TargetKey {
  return { failed: target.schedule.failed === true, payDate: target.schedule.payDate, number: target.row.number, id: target.row.id };
}

function compareTargetKey(a: TargetKey, b: TargetKey): number {
  if (a.failed !== b.failed) return a.failed ? -1 : 1;
  if (a.payDate !== b.payDate) return a.payDate < b.payDate ? -1 : 1;
  if ((a.number ?? "") !== (b.number ?? "")) return (a.number ?? "") < (b.number ?? "") ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

// 같은 필터 · 같은 판정(listAllPaymentTargets)에서 그 문서의 정렬 키보다 뒤인 첫 `확인 전`(P2). 그 문서가 필터에서 빠졌어도 키로 찾고,
// 없으면 null(맨 앞으로 돌아가지 않는다). 지급 권한이 없으면 null — 번호를 내지 않는다.
export async function nextUnreviewedTarget(
  viewer: Viewer,
  input: { afterExpenseId: string; team?: string | null; evidence?: PaymentEvidenceFilter | null; q?: string | null },
  deps?: PaymentTargetDeps,
): Promise<{ id: string; number: string } | null> {
  if (!UUID_SHAPE.test(input.afterExpenseId) || !(await can(viewer, "expenses.payments", "write"))) return null;
  const [current] = await findPaymentTargetRowsByIds(viewer, { documentKind: EXPENSE_DOCUMENT_KIND, ids: [input.afterExpenseId] });
  if (!current) return null;
  const all = await listAllPaymentTargets(viewer, { team: input.team, evidence: input.evidence, q: input.q }, deps);
  // 그 문서가 필터에서 빠졌어도 같은 일정 함수로 키를 만든다.
  const currentSchedule =
    all.find((target) => target.row.id === current.id)?.schedule ??
    (await loadPaySchedules(viewer, [current], { today: deps?.today ?? seoulToday(), now: deps?.now ?? new Date() })).get(current.id);
  if (!currentSchedule) return null;
  const currentKey: TargetKey = { failed: currentSchedule.failed === true, payDate: currentSchedule.payDate, number: current.number, id: current.id };
  const next = all.find((target) => target.bar.row === "P2" && target.row.number !== null && compareTargetKey(targetKeyOf(target), currentKey) > 0);
  return next?.row.number ? { id: next.row.id, number: next.row.number } : null;
}
