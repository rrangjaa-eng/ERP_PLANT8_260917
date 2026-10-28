import type { Viewer } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { clampPage, LIST_PAGE_SIZE, pageCountFrom } from "@/lib/paging";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { projectMany } from "@/domain/permissions/project";
import { visible } from "@/domain/permissions/visible";
import { moneyFromRow } from "@/domain/money";
import { EXPENSE_DOCUMENT_KIND, visibleExpenseScope } from "@/domain/expenses/access";
import { EXPENSE_LIST_ROW_DTO_SPEC, type ExpenseListRowDto } from "@/domain/expenses/dto";
import { loadExpenseSchedules, scheduleOf, TEAM_EXPENSE_KIND_LABELS, type TeamExpenseKind } from "@/domain/expenses";
import { payWeekIndex, type PaySchedule } from "@/domain/payments/pay-schedule";
import {
  EXPENSE_GROUP_RANKS,
  listExpenseMonths,
  listExpensePage,
  listUnpaidApprovedScheduleSources,
  summarizeExpenseList,
  type ExpenseListFilter,
  type ExpenseListRow as RepoRow,
  type ExpenseScope,
  type ExpenseSearch,
  type ExpenseSearchField,
} from "@/repositories/expenses";
import { statusStepLabel, type CurrentStep } from "@/domain/approvals";
import { ownersWithEvidence } from "@/domain/evidence/has-evidence";
import { loadPrepaidDueDays } from "@/domain/evidence-reviews";
import { prepaidDueInfo } from "@/domain/evidence-reviews/prepaid";
import { findListPaymentStatusByIds, type ListPaymentStatusRow } from "@/repositories/payment-targets";
import { listTeams as listTeamRows } from "@/repositories/teams";
import type { RowScope } from "@/domain/permissions/scope-for";

export type { ExpenseListRowDto } from "@/domain/expenses/dto";

// 05-08(UI-SPEC S8 · §6-1 원장): 지출결의 목록 — 보임 범위(access.ts) 안의 문서를 보기(상태 select) 하나로 거른다. 그룹 순서 · 그룹 안
// 정렬 · 쪽 나눔은 리포지토리 쿼리의 SQL 한 곳(ORDER BY group_rank, …, id → LIMIT)이 정하고, 이 파일은 받은 순서 그대로 머리글만 붙인다.
// 07-06(AQ-01): 승인 묶음의 미지급 건 순서만 도메인이 유효 예정일로 셈해 id 배열로 넘긴다(approvedOrder).

export type ExpenseListStatus = "open" | "approved" | "all";

// 06.5 D-6508(EP3-D6): 검색어 규칙 하나 — 앞뒤 공백을 떼고 빈 값이면 없음, 100자를 넘으면 앞 100자. 세 보기의 도메인 입구와 페이지(칸에 보일 값)가 같이 쓴다.
const LIST_QUERY_MAX = 100;

export function normalizeListQuery(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  return trimmed === "" ? null : trimmed.slice(0, LIST_QUERY_MAX);
}

// 06.5 D-6508(EP2-D5 · D2): 보기마다 그 보기 화면에 보이는 문자 열만 검색한다 — 목록 = 번호 · 팀 비용 내용 · 프로젝트 이름 · 항목 · 거래처 이름 · 기안자 이름 · 직원 지급처 이름,
// 지급 대상 · 지급 완료 = 같은 열에서 기안자 이름을 뺀 것(PaymentTargetRowDto · PaidPaymentRowDto에 기안자 칸이 없다). 열마다 DTO infoItem 그대로 —
// 문서 칸은 expense.value, 직원 지급처 이름은 person.value가 보일 때만 남긴다(숨은 값을 건수로 떠보는 길을 막는다). 팀 이름은 대상이 아니다(ND-9).
const SEARCH_FIELDS: Record<"list" | "paymentTargets" | "paid", readonly ExpenseSearchField[]> = {
  list: ["number", "content", "projectName", "lineItem", "vendorName", "drafterName", "payeeUserName"],
  paymentTargets: ["number", "content", "projectName", "lineItem", "vendorName", "payeeUserName"],
  paid: ["number", "content", "projectName", "lineItem", "vendorName", "payeeUserName"],
};

export function searchFieldsFor(view: keyof typeof SEARCH_FIELDS, visibleItems: { expenseValue: boolean; personValue: boolean }): ExpenseSearchField[] {
  return SEARCH_FIELDS[view].filter((field) => (field === "payeeUserName" ? visibleItems.personValue : visibleItems.expenseValue));
}

// 검색어가 있으면 그 보기의 열 × 정보 항목으로 검색 묶음을 만든다 — 없으면 undefined(조건 없음).
export async function buildExpenseSearch(viewer: Viewer, view: keyof typeof SEARCH_FIELDS, raw: string | null | undefined): Promise<ExpenseSearch | undefined> {
  const query = normalizeListQuery(raw);
  if (query === null) return undefined;
  const [expenseValue, personValue] = await Promise.all([visible(viewer, "expense.value"), visible(viewer, "person.value")]);
  return { query, fields: searchFieldsFor(view, { expenseValue, personValue }) };
}

const VIEW_RANKS: Record<ExpenseListStatus, readonly number[]> = {
  open: [EXPENSE_GROUP_RANKS.draft, EXPENSE_GROUP_RANKS.returned, EXPENSE_GROUP_RANKS.inReview],
  approved: [EXPENSE_GROUP_RANKS.approved],
  all: [EXPENSE_GROUP_RANKS.draft, EXPENSE_GROUP_RANKS.returned, EXPENSE_GROUP_RANKS.inReview, EXPENSE_GROUP_RANKS.approved],
};

const RANK_LABELS: Record<number, string> = { 1: "작성 중", 2: "반려 · 회수", 3: "결재 중", 4: "승인" };

export type ExpenseListGroup<Row> = { label: string; tone?: "warning"; rows: Row[] };

// 승인 보기의 지급 예정일 구간(서울 날짜, 주 = 월요일 시작). 미지급 승인 건은 유효 예정일 오름차순(07-06)이라 구간이 연속한다.
// 지급 끝난 건은 SQL이 미지급 건 뒤(실제 지급일 순)로 보내므로 예정일과 무관하게 맨 뒤 「지급 완료」 한 구간이다(07-06 검토 P3).
function paymentBand(date: string, todayKst: string): { label: string; tone?: "warning" } {
  if (date < todayKst) return { label: "예정일 지남", tone: "warning" };
  // 주 셈은 지급 주 한 곳(D-715 payWeekIndex).
  const week = payWeekIndex(date, todayKst);
  if (week <= 0) return { label: "이번 주 지급" };
  if (week === 1) return { label: "다음 주" };
  return { label: "그 뒤" };
}

// 받은 행 순서를 바꾸지 않고 연속한 같은 그룹에 머리글 하나를 붙인다 — 쪽의 첫 행이 앞 쪽 그룹의 이어짐이어도 첫 머리글을 그 그룹으로 그린다.
export function groupExpenses<Row extends { groupRank: number; scheduledPaymentDate: string; paid: boolean }>(
  rows: readonly Row[],
  opts: { status: ExpenseListStatus; todayKst: string },
): ExpenseListGroup<Row>[] {
  const groups: ExpenseListGroup<Row>[] = [];
  for (const row of rows) {
    const band =
      opts.status === "approved" && row.groupRank === EXPENSE_GROUP_RANKS.approved
        ? row.paid
          ? { label: "지급 완료" }
          : paymentBand(row.scheduledPaymentDate, opts.todayKst)
        : { label: RANK_LABELS[row.groupRank] ?? "" };
    const last = groups.at(-1);
    if (last && last.label === band.label) last.rows.push(row);
    else groups.push({ ...band, rows: [row] });
  }
  return groups;
}

export type ExpenseList = {
  groups: ExpenseListGroup<Partial<ExpenseListRowDto>>[];
  // 보기 전체(페이지 무관) 건수 · 공급가액 원화 합 — 금액을 볼 수 없는 계급에는 null(합계 줄째 없음).
  total: { count: number; sumKrw: number } | null;
  // 보는 사람의 범위가 자기 문서뿐이면 거짓(기안 열 · 행의 기안 이름을 보내지 않는다).
  drafterColumn: boolean;
  amountColumn: boolean;
  // 보임 범위 안 지출결의가 하나라도 있나(보기와 무관) — 거짓이면 화면이 `empty` 슬롯을 쓴다.
  hasAny: boolean;
  page: { page: number; pageCount: number; total: number; pageSize: number };
  // 07.1-09(PF4): 팀 select 옵션(보는 범위 안 활성 팀 — 범위가 팀 하나 이하면 빈 목록 = select를 그리지 않는다) · 월 select 옵션(등록 월, 최신 먼저).
  teams: { value: string; label: string }[];
  months: string[];
};

function teamKindLabel(kind: string | null): string | null {
  return kind && kind in TEAM_EXPENSE_KIND_LABELS ? TEAM_EXPENSE_KIND_LABELS[kind as TeamExpenseKind] : null;
}

// 06-20(UA-605): 결재 통과 행의 지급 상태 — 살아 있는 지급 기록이 있으면 `지급 완료` · 지급일, 기한 지난 선결제면 둘째 줄 `증빙 {N}일 경과`.
type PaymentStatus = { payDate: string | null; note: string | null };

async function paymentStatuses(viewer: Viewer, rows: readonly RepoRow[], today: string): Promise<Map<string, PaymentStatus>> {
  const ids = rows.filter((row) => row.groupRank === EXPENSE_GROUP_RANKS.approved && row.closedAt === null).map((row) => row.id);
  if (ids.length === 0) return new Map();
  const found: ListPaymentStatusRow[] = await findListPaymentStatusByIds(viewer, ids);
  const paid = found.filter((row) => row.payDate !== null);
  const needsDue = paid.some((row) => row.prepaid && !row.waived);
  const [withEvidence, dueDays] = needsDue
    ? await Promise.all([ownersWithEvidence(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerIds: paid.map((row) => row.id) }), loadPrepaidDueDays()])
    : [new Set<string>(), 0];
  return new Map(
    paid.map((row) => {
      const due = needsDue
        ? prepaidDueInfo({ prepaid: row.prepaid, hasEvidence: withEvidence.has(row.id), waived: row.waived, paidOn: row.payDate, dueDays, today })
        : null;
      return [row.id, { payDate: row.payDate, note: due && due.overdueDays >= 1 ? `증빙 ${due.overdueDays}일 경과` : null }];
    }),
  );
}

function statusOf(row: RepoRow, currentSteps: Map<string, CurrentStep>, payment?: PaymentStatus): { statusWord: string; statusDate: string | null; statusNote?: string | null } {
  const date = row.statusChangedAt ? seoulToday(row.statusChangedAt).slice(5) : null;
  if (row.groupRank === EXPENSE_GROUP_RANKS.draft) return { statusWord: "작성 중", statusDate: null };
  // 06-28: 종결 문서(반려 · 회수에서만 끝난다) — 낱말 `종결` · 종결일. 그룹은 반려 · 회수 그대로.
  if (row.closedAt !== null) return { statusWord: "종결", statusDate: seoulToday(row.closedAt).slice(5) };
  if (row.groupRank === EXPENSE_GROUP_RANKS.returned) return { statusWord: row.status === "withdrawn" ? "회수" : "반려", statusDate: date };
  if (row.groupRank === EXPENSE_GROUP_RANKS.inReview) {
    const stepLabel = row.instanceId ? currentSteps.get(row.instanceId)?.stepLabel : null;
    return { statusWord: stepLabel ? `${statusStepLabel(stepLabel)} 결재 중` : "결재 중", statusDate: null };
  }
  if (payment?.payDate) return { statusWord: "지급 완료", statusDate: payment.payDate.slice(5), statusNote: payment.note };
  return { statusWord: "승인", statusDate: date };
}

function toSource(row: RepoRow, schedule: PaySchedule, currentSteps: Map<string, CurrentStep>, payment?: PaymentStatus): ExpenseListRowDto {
  const teamCost = row.projectId === null && row.quoteLineId === null;
  const seq = row.installment && row.installmentSeq ? ` ${row.installmentSeq}회차` : "";
  const title = teamCost ? [row.teamName, row.content].filter(Boolean).join(" · ") : `${[row.projectName, row.itemName].filter(Boolean).join(" · ")}${seq}`;
  const kindLabel = teamKindLabel(row.teamExpenseKind);
  return {
    id: row.id,
    number: row.number,
    title,
    unlinkedText: teamCost ? ["프로젝트 미연결", kindLabel].filter(Boolean).join(" · ") : null,
    vendorName: row.vendorName,
    payeeUserName: row.payeeUserName,
    supply:
      row.supplyAmountKrw === null
        ? null
        : moneyFromRow({ currency: row.supplyCurrency, foreignAmount: row.supplyForeignAmount, fxRate: row.supplyFxRate, amountKrw: row.supplyAmountKrw }),
    scheduledPaymentDate: schedule.payDate,
    scheduledPaymentManual: schedule.manual,
    drafterName: row.drafterName,
    ...statusOf(row, currentSteps, payment),
  };
}

// 07.1-09: 월 거름 형식 — 지급 보기 MONTH_SHAPE(payments/targets.ts)는 내보내지 않은 상수이고 그 파일은 다른 플랜 몫이라 같은 정규식을 둔다. 틀린 월은 거름 무시.
const FILTER_MONTH_SHAPE = /^\d{4}-(0[1-9]|1[0-2])$/;

// 07.1-09(PF4 · P3): 팀 옵션은 행 범위 모양별 — 전사는 활성 팀 전부, 본부 범위는 그 본부의 활성 팀(둘 미만이면 없음), 팀 · 본인 · 없음은 빈 목록.
async function teamOptionsFor(viewer: Viewer, rowScope: RowScope): Promise<{ value: string; label: string }[]> {
  if (rowScope.rows === "none") return [];
  if (rowScope.rows === "limited" && rowScope.by.kind !== "org_unit") return [];
  const active = await listTeamRows(viewer, { scope: { rows: "all", includeArchived: false } });
  const inScope = rowScope.rows === "all" ? active : active.filter((team) => rowScope.by.kind === "org_unit" && rowScope.by.orgUnitId !== null && team.orgUnitId === rowScope.by.orgUnitId);
  if (rowScope.rows === "limited" && inScope.length < 2) return [];
  return inScope.map((team) => ({ value: team.id, label: team.name }));
}

// 07-06(AQ-01 · B-P2-1): 보이는 미지급 승인 건(검색 포함)의 유효 예정일 ↑ → 번호 → id 순 id 배열. 승인 묶음이 보기에 없으면 읽지 않는다.
async function approvedOrderOf(viewer: Viewer, input: { scope: ExpenseScope; ranks: readonly number[]; search?: ExpenseSearch; filter?: ExpenseListFilter }): Promise<string[]> {
  if (!input.ranks.includes(EXPENSE_GROUP_RANKS.approved)) return [];
  const sources = await listUnpaidApprovedScheduleSources(viewer, { scope: input.scope, documentKind: EXPENSE_DOCUMENT_KIND, ...(input.search ? { search: input.search } : {}), ...(input.filter ? { filter: input.filter } : {}) });
  const loaded = await loadExpenseSchedules(viewer, sources);
  const keyed = sources.map((source) => ({ id: source.id, number: source.number ?? "", payDate: scheduleOf(loaded, source.id).payDate }));
  keyed.sort((a, b) => (a.payDate !== b.payDate ? (a.payDate < b.payDate ? -1 : 1) : a.number !== b.number ? (a.number < b.number ? -1 : 1) : a.id < b.id ? -1 : 1));
  return keyed.map((item) => item.id);
}

export async function listExpenses(
  viewer: Viewer,
  input: { status: ExpenseListStatus; page?: string | number; q?: string | null; team?: string | null; month?: string | null; mine?: boolean },
  deps?: { today?: string; pageSize?: number },
): Promise<ExpenseList> {
  if (!(await can(viewer, "expenses", "view"))) throw new ForbiddenError("지출결의 보기 권한 없음");
  const today = deps?.today ?? seoulToday();
  const pageSize = deps?.pageSize ?? LIST_PAGE_SIZE;
  const ranks = VIEW_RANKS[input.status];
  const [scope, amountColumn, search] = await Promise.all([
    visibleExpenseScope(viewer, { today }),
    visible(viewer, "expense.amount"),
    buildExpenseSearch(viewer, "list", input.q),
  ]);
  // 07.1-09: 모르는 팀 · 모양이 틀린 팀 값은 저장소 글자 비교로 결과 0(범위 AND라 넓어지지 않는다) · 틀린 월은 거름 무시.
  const team = input.team?.trim() ? input.team.trim() : null;
  const month = input.month && FILTER_MONTH_SHAPE.test(input.month) ? input.month : null;
  const filter: ExpenseListFilter | undefined = team || month || input.mine ? { teamId: team, month, drafterId: input.mine ? viewer.id : null } : undefined;
  const summary = await summarizeExpenseList(viewer, { scope, ranks, documentKind: EXPENSE_DOCUMENT_KIND, ...(search ? { search } : {}), ...(filter ? { filter } : {}) });
  const pageCount = pageCountFrom(summary.viewCount, pageSize);
  const page = clampPage(input.page, pageCount);
  const rows =
    summary.viewCount > 0
      ? await listExpensePage(viewer, {
          scope,
          ranks,
          documentKind: EXPENSE_DOCUMENT_KIND,
          limit: pageSize,
          offset: (page - 1) * pageSize,
          ...(search ? { search } : {}),
          ...(filter ? { filter } : {}),
          approvedOrder: await approvedOrderOf(viewer, { scope, ranks, ...(search ? { search } : {}), ...(filter ? { filter } : {}) }),
        })
      : [];
  const drafterColumn =
    scope.rowScope.rows === "all" || (scope.rowScope.rows === "limited" && scope.rowScope.by.kind !== "own") || summary.othersCount > 0;
  const [payments, loaded, teamOptions, months] = await Promise.all([
    paymentStatuses(viewer, rows, today),
    loadExpenseSchedules(viewer, rows),
    teamOptionsFor(viewer, scope.rowScope),
    listExpenseMonths(viewer, { scope, documentKind: EXPENSE_DOCUMENT_KIND }),
  ]);
  const projected = await projectMany(
    viewer,
    rows.map((row) => toSource(row, scheduleOf(loaded, row.id), scope.currentSteps, payments.get(row.id))),
    EXPENSE_LIST_ROW_DTO_SPEC,
  );
  const items = rows.map((row, index) => {
    const dto = { ...projected[index] };
    if (!drafterColumn) delete dto.drafterName;
    return { groupRank: row.groupRank, scheduledPaymentDate: scheduleOf(loaded, row.id).payDate, paid: Boolean(payments.get(row.id)?.payDate), dto };
  });
  const groups = groupExpenses(items, { status: input.status, todayKst: today }).map((group) => ({
    label: group.label,
    ...(group.tone ? { tone: group.tone } : {}),
    rows: group.rows.map((item) => item.dto),
  }));
  return {
    groups,
    total: amountColumn ? { count: summary.viewCount, sumKrw: summary.viewSumKrw } : null,
    drafterColumn,
    amountColumn,
    hasAny: summary.visibleCount > 0,
    page: { page, pageCount, total: summary.viewCount, pageSize },
    teams: teamOptions,
    months,
  };
}
