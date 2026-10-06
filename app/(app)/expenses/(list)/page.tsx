import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { listExpenses, type ExpenseListStatus } from "@/domain/expenses/list";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { Num } from "@/ui/num/Num";
import { Pagination } from "@/ui/pagination/Pagination";
import { pageRangeText } from "@/ui/pagination/page-window";
import { SubmittedToast } from "@/app/(app)/leave/[id]/submitted-toast";
import { DeletedToast } from "../deleted-toast";
import { ExpensesTable, type ExpenseTableRow } from "../expenses-table";
import { StatusFilter } from "../status-filter";
import { EXPENSE_STATUS_VIEWS, type ExpenseStatusView } from "../list-columns";
import styles from "../expenses.module.css";

// 05-08(UI-SPEC S8 · SYSTEM §6-1 목록 = 원장): 보임 범위(domain/expenses/access.ts) 안의 지출결의를 상태 보기 하나로 거른다.
// WR-07: 인증 검사를 이 페이지가 직접 한다(레이아웃에 기대지 않는다). 그룹 · 순서 · 합계 · 쪽은 서버(listExpenses)가 정한다.
const VIEW_STATUS: Record<ExpenseStatusView, ExpenseListStatus> = { "진행 중": "open", 승인: "approved", 전체: "all" };

function toView(raw: string | string[] | undefined): ExpenseStatusView {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return EXPENSE_STATUS_VIEWS.find((view) => view === value) ?? "진행 중";
}

function viewHref(view: ExpenseStatusView, page?: number): string {
  const params = new URLSearchParams({ status: view });
  if (page && page > 1) params.set("page", String(page));
  return `/expenses?${params.toString()}`;
}

type ExpensesSearchParams = Record<string, string | string[] | undefined>;

// 견적 줄 표 여러 줄 `Ctrl+E` 착지(`?created=N&blocked=M`) — 토스트 `지출결의 올리기 · 작성 중 N건 · 막힘 M줄`(DR-21 꼴). 숫자가 아니면 띄우지 않는다.
function countParam(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value !== undefined && /^[1-9][0-9]{0,2}$/.test(value) ? Number(value) : null;
}

function createdToast(params: ExpensesSearchParams): string | null {
  const created = countParam(params.created);
  if (created === null) return null;
  const blocked = countParam(params.blocked);
  return `지출결의 올리기 · 작성 중 ${created}건${blocked === null ? "" : ` · 막힘 ${blocked}줄`}`;
}

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<ExpensesSearchParams> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "expenses", "view"))) notFound();

  const params = await searchParams;
  const view = toView(params.status);
  const page = Array.isArray(params.page) ? params.page[0] : params.page;
  const [list, canWrite] = await Promise.all([
    listExpenses(session.viewer, { status: VIEW_STATUS[view], page }),
    can(session.viewer, "expenses", "write"),
  ]);

  const rows: ExpenseTableRow[] = list.groups.flatMap((group) =>
    group.rows.map((row) => ({ ...row, id: row.id ?? "", group: group.label, ...(group.tone ? { groupTone: group.tone } : {}) })),
  );
  const newAction = { label: "새 지출결의", href: "/expenses/new" };
  const toast = createdToast(params);
  // 05-09 작성 중 삭제 착지(`?deleted={id}`) — 토스트 `지출결의 삭제` + 3차 `되돌리기`. 빈 목록이면 틀이 `empty`만 그리므로 그쪽에도 싣는다.
  const deletedRaw = Array.isArray(params.deleted) ? params.deleted[0] : params.deleted;
  const deletedToast = deletedRaw && /^[0-9a-f-]{36}$/i.test(deletedRaw) ? <DeletedToast expenseId={deletedRaw} href={viewHref(view)} /> : null;

  return (
    <ListScreen
      title="지출결의"
      // DR5 A — 보임 범위 안 지출결의가 하나도 없을 때만 `empty`를 넘겨 틀이 머리 1차를 숨긴다. 보기 때문에 0건이면 머리 1차가 남는다.
      primaryAction={canWrite ? newAction : undefined}
      // 걸러 낼 문서가 하나도 없으면 상태 select를 넘기지 않는다(wave10 N2 — 사용자 지시(10/5 00:55)에 따라 추천안 적용).
      filters={list.hasAny ? <StatusFilter value={view} /> : undefined}
      summary={
        list.total && list.total.count > 0 ? (
          <section aria-label="합계" className={styles.totals}>
            <p className={styles.totalsTitle}>{`합계 (${view} · ${list.total.count}건)`}</p>
            <p className={styles.totalsAmount}>
              <Num value={list.total.sumKrw} />
            </p>
          </section>
        ) : undefined
      }
      empty={
        list.hasAny ? undefined : (
          <>
            <ListEmpty message="등록된 지출결의가 없습니다" {...(canWrite ? { action: newAction } : {})} />
            {deletedToast}
          </>
        )
      }
      pagination={
        rows.length > 0 ? (
          <Pagination
            label="지출결의"
            page={list.page.page}
            pageCount={list.page.pageCount}
            href={(target) => viewHref(view, target)}
            rangeText={pageRangeText({ page: list.page.page, pageSize: list.page.pageSize, total: list.page.total, unit: "건" })}
          />
        ) : undefined
      }
    >
      {rows.length > 0 ? (
        <ExpensesTable rows={rows} drafterColumn={list.drafterColumn} amountColumn={list.amountColumn} />
      ) : view === "승인" ? (
        <ListEmpty message="승인된 지출결의가 없습니다" action={{ label: "진행 중 보기", href: viewHref("진행 중") }} />
      ) : (
        <ListEmpty message="진행 중인 지출결의가 없습니다" action={{ label: "전체 보기", href: viewHref("전체") }} />
      )}
      {toast ? <SubmittedToast message={toast} href={viewHref(view)} /> : null}
      {deletedToast}
    </ListScreen>
  );
}
