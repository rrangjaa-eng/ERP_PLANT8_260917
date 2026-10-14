import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { listIssueRequests, type IssueRequestListStatus } from "@/domain/issue-requests";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { Num } from "@/ui/num/Num";
import { Pagination } from "@/ui/pagination/Pagination";
import { pageRangeText } from "@/ui/pagination/page-window";
// 합계 면은 프로젝트 · 구매 요청 목록 합계와 같은 클래스(새 CSS 없음).
import totalsStyles from "@/app/(app)/projects/projects.module.css";
import { IssueRequestFilter, IssueRequestList, type IssueRequestListRowView } from "./issue-request-list";

// 06-21(UI-SPEC S17 · SP-4 · O-1): 발행 요청 목록 — 프로젝트 메뉴의 하위 목록. 부제 · 1차 없음(C12).
// 필터 · 쪽은 GET 쿼리(`status` · `page`) — 범위 · 쪽 · 그룹 · 합계는 서버(listIssueRequests)가 정한다. 기본 보기 = `신청됨`.
// 로드 실패는 error.tsx(「Error — 목록 로드」)가 맡는다. WR-07: 인증 검사를 이 페이지가 직접 한다.
export const dynamic = "force-dynamic";

const LIST_HREF = "/projects/issue-requests";
const DEFAULT_STATUS: IssueRequestListStatus = "requested";
// 필터 낱말 — 상태 낱말은 status-map(06-18 issueRequestStatusWord)과 같다.
const VIEW_WORDS: Record<IssueRequestListStatus, string> = { requested: "신청됨", issued: "발행됨", cancelled: "취소", all: "전체" };

type IssueRequestsSearchParams = Record<string, string | string[] | undefined>;

function first(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

function isListStatus(value: string | undefined): value is IssueRequestListStatus {
  return value !== undefined && Object.hasOwn(VIEW_WORDS, value);
}

export default async function IssueRequestsPage({ searchParams }: { searchParams: Promise<IssueRequestsSearchParams> }) {
  const { viewer } = await requireSession();
  if (!(await can(viewer, "projects.revenue", "view"))) notFound();
  const params = await searchParams;
  const statusParam = first(params.status);
  const status = isListStatus(statusParam) ? statusParam : DEFAULT_STATUS;
  const list = await listIssueRequests(viewer, { status, page: first(params.page) });
  const canLink = await can(viewer, "projects.revenue", "write");
  const showAmount = list.totals.amountKrw !== undefined;

  const rows: IssueRequestListRowView[] = list.rows.flatMap((row) =>
    row.id && row.desiredIssueDate && row.status
      ? [
          {
            id: row.id,
            projectId: row.projectId,
            projectNumber: row.projectNumber,
            projectName: row.projectName,
            requesterName: row.requesterName ?? "—",
            desiredIssueDate: row.desiredIssueDate,
            amountKrw: row.amountKrw ?? null,
            totalKrw: row.totalKrw ?? null,
            memo: row.memo ?? null,
            status: row.status,
            group: row.group,
          },
        ]
      : [],
  );

  const pageHref = (target: number): string => {
    const query = new URLSearchParams();
    if (status !== DEFAULT_STATUS) query.set("status", status);
    if (target > 1) query.set("page", String(target));
    const text = query.toString();
    return text ? `${LIST_HREF}?${text}` : LIST_HREF;
  };

  let empty = undefined;
  let body = null;
  if (rows.length > 0) body = <IssueRequestList rows={rows} showAmount={showAmount} canLink={canLink} />;
  else if (status === DEFAULT_STATUS) empty = <ListEmpty message="처리할 발행 요청이 없습니다" action={{ label: "전체 보기", href: `${LIST_HREF}?status=all` }} />;
  else body = <ListEmpty message="조건에 맞는 발행 요청이 없습니다" action={{ label: "필터 지우기", href: LIST_HREF }} />;

  return (
    <ListScreen
      title="발행 요청"
      filters={<IssueRequestFilter status={status} options={Object.entries(VIEW_WORDS).map(([value, label]) => ({ value, label }))} />}
      summary={
        list.totals.count > 0 ? (
          <section aria-label="합계" className={totalsStyles.totals}>
            <p className={totalsStyles.totalsTitle}>{`합계 (${VIEW_WORDS[status]} · ${list.totals.count}건)`}</p>
            {list.totals.amountKrw === undefined ? null : (
              <dl className={totalsStyles.totalsPairs}>
                <div className={totalsStyles.totalsPair}>
                  <dt>금액</dt>
                  <dd>
                    <Num value={list.totals.amountKrw} />
                  </dd>
                </div>
              </dl>
            )}
          </section>
        ) : undefined
      }
      empty={empty}
      pagination={
        rows.length > 0 ? (
          <Pagination
            label="발행 요청"
            page={list.page.page}
            pageCount={list.page.pageCount}
            href={pageHref}
            rangeText={pageRangeText({ page: list.page.page, pageSize: list.page.pageSize, total: list.page.total, unit: "건" })}
          />
        ) : undefined
      }
    >
      {body}
    </ListScreen>
  );
}
