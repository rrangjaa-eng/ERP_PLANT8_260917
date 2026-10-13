import type { Viewer } from "@/domain/viewer";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { visible } from "@/domain/permissions/visible";
import { gate } from "@/domain/rules/gate";
import "@/domain/rules/register";
import { diffKrw, sumKrw } from "@/domain/money";
import { EXPENSE_DOCUMENT_KIND, visibleExpenseScope } from "@/domain/expenses/access";
import { groupExpenses } from "@/domain/expenses/list";
import { incomeTypeFor, pickTaxDates, type TaxLinePart } from "@/domain/expenses/tax";
import { TAX_UNAVAILABLE } from "@/domain/expenses/gate";
import { PAYMENT_TARGET_ROW_DTO_SPEC, type PaymentTargetRowDto } from "@/domain/expenses/dto";
import { ownersWithEvidence } from "@/domain/evidence/has-evidence";
import { listEvidence } from "@/domain/evidence";
import { formatKstTime } from "@/domain/holidays/business-day";
import { findUserNamesByIds } from "@/repositories/users";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { loadPrepaidDueDays, resolveEvidenceStatus, type EvidenceStatus } from "@/domain/evidence-reviews";
import { decidePayable, getPaymentView, loadEvidenceOverrun, loadPaymentShared, pairGateCtx, pickPaymentAmount, type PaymentShared, type PaymentSharedDeps } from "@/domain/payments";
import { approvalGateDecision, EVIDENCE_UNCONFIRMED, resolveExpenseActionRow, type EvidenceGateInput, type ExpenseActionBar } from "@/domain/payments/action-row";
import { listTeams as listTeamRows } from "@/repositories/teams";
import { EXPENSE_GROUP_RANKS, listExpenseIdsInScope } from "@/repositories/expenses";
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

// 문서 보임(행 범위, CSO-1 패턴) — 지급 처리 경로(loadPaymentInputs)의 canSeeExpense와 같은 scopeCondition(기안자 ∪ 결재 관련자 ∪ 보는 범위)을
// visibleExpenseScope 한 번으로 만들어 한 질의로 거른다(06.2-08 검토 I-1 — 행마다 묻지 않는다). 보는 범위 전사(06.2 rowScope all)면 결재 통과 문서는 모두 보이므로 묻지 않는다.
async function visibleRows(viewer: Viewer, rows: readonly PaymentTargetRow[], today: string): Promise<PaymentTargetRow[]> {
  const scope = await visibleExpenseScope(viewer, { today });
  if (scope.rowScope.rows === "all") return [...rows];
  const kept = await listExpenseIdsInScope(viewer, { ids: rows.map((row) => row.id), scope, documentKind: EXPENSE_DOCUMENT_KIND });
  return rows.filter((row) => kept.has(row.id));
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
    evidenceAmountEntered: row.evidenceAmount !== null,
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
  const judged = await judgeTargets(viewer, rows, { shared, today: input.payDate ?? today, amountVisible });
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
// 파일 행은 05 listEvidence(살아 있는 것), 서버 계산 한 줄 · 지금 version · 증빙 지문은 06-06 getPaymentView 값 그대로(새 계산 없음), 증빙 금액 초과
// 한 줄은 06-06 loadEvidenceOverrun(저장된 증빙 금액 — 표시만, 판정에 쓰지 않는다). 모달이 확인할 때 이 version + 지문을 보내 06-06 confirmEvidence가
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
  evidenceAmountKrw: number | null;
  taxLine: TaxLinePart[] | null;
  evidenceOverrun: string | null;
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
    { key: "evidenceAmountKrw", from: "evidenceAmountKrw", infoItem: "expense.amount" },
    { key: "taxLine", from: "taxLine", infoItem: "expense.amount" },
    { key: "evidenceOverrun", from: "evidenceOverrun", infoItem: "expense.amount" },
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
  const [projected] = await projectMany(
    viewer,
    [
      {
        expenseId: row.id,
        number: row.number,
        title: titleOf(row),
        version: row.version,
        evidenceStamp: view.evidenceStamp ?? "",
        evidenceAmountKrw: row.evidenceAmount,
        taxLine: view.evidenceTaxLine ?? null,
        evidenceOverrun: await loadEvidenceOverrun(viewer, row, row.evidenceAmount),
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
  const rows = await listTeamRows(viewer, { scope: { rows: "all", includeArchived: false } });
  return rows.map((row) => ({ value: row.id, label: row.name }));
}
