import type { Viewer } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { addDays } from "@/lib/kst-date";
import { clampPage, LIST_PAGE_SIZE, pageCountFrom } from "@/lib/paging";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { projectMany } from "@/domain/permissions/project";
import { visible } from "@/domain/permissions/visible";
import { moneyFromRow } from "@/domain/money";
import { EXPENSE_DOCUMENT_KIND, visibleExpenseScope } from "@/domain/expenses/access";
import { EXPENSE_LIST_ROW_DTO_SPEC, type ExpenseListRowDto } from "@/domain/expenses/dto";
import { TEAM_EXPENSE_KIND_LABELS, type TeamExpenseKind } from "@/domain/expenses";
import { EXPENSE_GROUP_RANKS, listExpensePage, summarizeExpenseList, type ExpenseListRow as RepoRow } from "@/repositories/expenses";
import type { CurrentStep } from "@/domain/approvals";

export type { ExpenseListRowDto } from "@/domain/expenses/dto";

// 05-08(UI-SPEC S8 · §6-1 원장): 지출결의 목록 — 보임 범위(access.ts) 안의 문서를 보기(상태 select) 하나로 거른다. 그룹 순서 · 그룹 안
// 정렬 · 쪽 나눔은 리포지토리 쿼리의 SQL 한 곳(ORDER BY group_rank, …, id → LIMIT)이 정하고, 이 파일은 받은 순서 그대로 머리글만 붙인다.

export type ExpenseListStatus = "open" | "approved" | "all";

const VIEW_RANKS: Record<ExpenseListStatus, readonly number[]> = {
  open: [EXPENSE_GROUP_RANKS.draft, EXPENSE_GROUP_RANKS.returned, EXPENSE_GROUP_RANKS.inReview],
  approved: [EXPENSE_GROUP_RANKS.approved],
  all: [EXPENSE_GROUP_RANKS.draft, EXPENSE_GROUP_RANKS.returned, EXPENSE_GROUP_RANKS.inReview, EXPENSE_GROUP_RANKS.approved],
};

const RANK_LABELS: Record<number, string> = { 1: "작성 중", 2: "반려 · 회수", 3: "결재 중", 4: "승인" };

export type ExpenseListGroup<Row> = { label: string; tone?: "warning"; rows: Row[] };

// 승인 보기의 지급 예정일 구간(서울 날짜, 주 = 월요일 시작). SQL이 지급 예정일 오름차순 · 없음 끝으로 주므로 구간은 이미 연속한다.
function paymentBand(date: string | null, todayKst: string): { label: string; tone?: "warning" } {
  if (date === null) return { label: "지급 예정일 없음" };
  if (date < todayKst) return { label: "예정일 지남", tone: "warning" };
  const [year, month, day] = todayKst.split("-").map(Number) as [number, number, number];
  const daysFromMonday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  const thisSunday = addDays(todayKst, 6 - daysFromMonday);
  if (date <= thisSunday) return { label: "이번 주 지급" };
  if (date <= addDays(thisSunday, 7)) return { label: "다음 주" };
  return { label: "그 뒤" };
}

// 받은 행 순서를 바꾸지 않고 연속한 같은 그룹에 머리글 하나를 붙인다 — 쪽의 첫 행이 앞 쪽 그룹의 이어짐이어도 첫 머리글을 그 그룹으로 그린다.
export function groupExpenses<Row extends { groupRank: number; scheduledPaymentDate: string | null }>(
  rows: readonly Row[],
  opts: { status: ExpenseListStatus; todayKst: string },
): ExpenseListGroup<Row>[] {
  const groups: ExpenseListGroup<Row>[] = [];
  for (const row of rows) {
    const band =
      opts.status === "approved" && row.groupRank === EXPENSE_GROUP_RANKS.approved
        ? paymentBand(row.scheduledPaymentDate, opts.todayKst)
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
};

function teamKindLabel(kind: string | null): string | null {
  return kind && kind in TEAM_EXPENSE_KIND_LABELS ? TEAM_EXPENSE_KIND_LABELS[kind as TeamExpenseKind] : null;
}

function statusOf(row: RepoRow, currentSteps: Map<string, CurrentStep>): { statusWord: string; statusDate: string | null } {
  const date = row.statusChangedAt ? seoulToday(row.statusChangedAt).slice(5) : null;
  if (row.groupRank === EXPENSE_GROUP_RANKS.draft) return { statusWord: "작성 중", statusDate: null };
  if (row.groupRank === EXPENSE_GROUP_RANKS.returned) return { statusWord: row.status === "withdrawn" ? "회수" : "반려", statusDate: date };
  if (row.groupRank === EXPENSE_GROUP_RANKS.inReview) {
    const stepLabel = row.instanceId ? currentSteps.get(row.instanceId)?.stepLabel : null;
    return { statusWord: stepLabel ? `${stepLabel} 결재 중` : "결재 중", statusDate: null };
  }
  return { statusWord: "승인", statusDate: date };
}

function toSource(row: RepoRow, currentSteps: Map<string, CurrentStep>): ExpenseListRowDto {
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
    supply:
      row.supplyAmountKrw === null
        ? null
        : moneyFromRow({ currency: row.supplyCurrency, foreignAmount: row.supplyForeignAmount, fxRate: row.supplyFxRate, amountKrw: row.supplyAmountKrw }),
    scheduledPaymentDate: row.scheduledPaymentDate,
    drafterName: row.drafterName,
    ...statusOf(row, currentSteps),
  };
}

export async function listExpenses(
  viewer: Viewer,
  input: { status: ExpenseListStatus; page?: string | number },
  deps?: { today?: string; pageSize?: number },
): Promise<ExpenseList> {
  if (!(await can(viewer, "expenses", "view"))) throw new ForbiddenError("지출결의 보기 권한 없음");
  const today = deps?.today ?? seoulToday();
  const pageSize = deps?.pageSize ?? LIST_PAGE_SIZE;
  const ranks = VIEW_RANKS[input.status];
  const [scope, amountColumn] = await Promise.all([visibleExpenseScope(viewer, { today }), visible(viewer, "expense.amount")]);
  const summary = await summarizeExpenseList(viewer, { scope, ranks, documentKind: EXPENSE_DOCUMENT_KIND });
  const pageCount = pageCountFrom(summary.viewCount, pageSize);
  const page = clampPage(input.page, pageCount);
  const rows =
    summary.viewCount > 0
      ? await listExpensePage(viewer, { scope, ranks, documentKind: EXPENSE_DOCUMENT_KIND, limit: pageSize, offset: (page - 1) * pageSize })
      : [];
  const drafterColumn = scope.company || scope.teamIds.length > 0 || summary.othersCount > 0;
  const projected = await projectMany(viewer, rows.map((row) => toSource(row, scope.currentSteps)), EXPENSE_LIST_ROW_DTO_SPEC);
  const items = rows.map((row, index) => {
    const dto = { ...projected[index] };
    if (!drafterColumn) delete dto.drafterName;
    return { groupRank: row.groupRank, scheduledPaymentDate: row.scheduledPaymentDate, dto };
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
  };
}
