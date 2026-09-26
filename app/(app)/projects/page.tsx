import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import {
  loadProjectList,
  getProjectCopySource,
  PROJECT_SORT_KEYS,
  type ProjectSortKey,
} from "@/domain/projects";
import { listProjectFormReferences, scopeCreateFormReferences } from "@/domain/projects/references";
import { listProjectStatusCatalog } from "@/domain/projects/status";
import { recentFxRate } from "@/domain/money/currency";
import { firstListParam, normalizeListYear, reconcileListYear, yearOptions } from "@/domain/projects/list-view";
import { kstToday, kstYear } from "@/lib/kst-date";
import { LIST_PAGE_SIZE } from "@/lib/paging";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { Pagination } from "@/ui/pagination/Pagination";
import { pageRangeText } from "@/ui/pagination/page-window";
import { ProjectForm } from "./project-form";
import { ProjectsFilterBar, type ProjectFilterOption } from "./filter-bar";
import { ProjectsTable } from "./projects-table";
import { ListTotals } from "./list-totals";
import styles from "./projects.module.css";

// D-18과 같은 결: 캐시·별도 저장 없음.
export const dynamic = "force-dynamic";

// 04-05 — 04-01의 트레이서 목록(무필터·무그룹)을 완성한다: 월별 그룹·상태
// 필터 한 줄·정렬·전체 집계 합계(S1). 04-21 — 상태 값·라벨은 코드표(D-75). 04-17 — 50건씩 번호 페이지(D-91).

function projectsHref(opts?: { isNew?: boolean }): string {
  return opts?.isNew ? "/projects?new=1#project-form" : "/projects";
}

function isValidSortKey(value: string | undefined): value is ProjectSortKey {
  return typeof value === "string" && (PROJECT_SORT_KEYS as readonly string[]).includes(value);
}

// 04-48(C-08) — URL 값은 배열로도 온다. 페이지는 `string`으로 단정하지 않고 도메인 입구(normalizeListParams)에 넘긴다.
type ProjectsSearchParams = Record<string, string | string[] | undefined>;

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<ProjectsSearchParams> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "projects", "view"))) notFound();

  const params = await searchParams;
  const currentYear = kstYear(new Date());

  // DR-30 연도 자동 전환 — 기간이 선택 연도와 겹치지 않으면 조회 · 자동 정산 판정 전에 연도만 고친 같은 경로 주소로
  // 옮긴다(`page`는 뺀다, 문구 없음). 이동 주소의 연도는 reconcileListYear가 만든 4자리 연도 또는 `all`뿐이다(T-04-367).
  const reconciledYear = reconcileListYear({
    year: String(normalizeListYear(params.year, currentYear)),
    from: firstListParam(params.from),
    to: firstListParam(params.to),
  });
  if (reconciledYear) {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "year" || key === "page" || value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) next.append(key, item);
    }
    next.set("year", reconciledYear);
    redirect(`/projects?${next.toString()}`);
  }

  const showCreateForm = firstListParam(params.new) === "1";
  const copyFrom = firstListParam(params.copyFrom);
  const statusOptions: ProjectFilterOption[] = (await listProjectStatusCatalog(session.viewer)).map(
    ({ value, label }) => ({ value, label }),
  );

  // 네이티브 GET 폼이 빈 칸까지 `status=&...`로 실으므로 여기서 한 번만
  // undefined로 정규화한다(action-log/page.tsx와 같은 이유).
  const statusParam = firstListParam(params.status);
  const status = statusParam && statusOptions.some((option) => option.value === statusParam) ? statusParam : undefined;
  const sortParam = firstListParam(params.sort);
  const sortKey = isValidSortKey(sortParam) ? sortParam : "endDate";
  const sortDirection = firstListParam(params.dir) === "desc" ? "desc" : "asc";
  const statusLabel = statusOptions.find((option) => option.value === status)?.label;

  const [references, canWrite, list, copySource, usdDefaultFxRate] = await Promise.all([
    listProjectFormReferences(session.viewer),
    can(session.viewer, "projects", "write"),
    loadProjectList(session.viewer, {
      status,
      statusLabel,
      teamId: params.teamId,
      year: params.year,
      search: params.q,
      from: params.from,
      to: params.to,
      sort: { key: sortKey, direction: sortDirection },
      page: params.page,
    }),
    // 04-15(D-70 · S2) — 복사 등록 미리 채우기. 범위 밖 · 보관 · 없는 출처면 null → 일반 등록 폼.
    showCreateForm && copyFrom ? getProjectCopySource(session.viewer, copyFrom) : Promise.resolve(null),
    // 04-15(D-71) — 총 매출 예상가 USD 환율 칸 기본값(설정의 실제 값).
    showCreateForm ? recentFxRate("USD") : Promise.resolve(1),
  ]);

  // 등록 폼의 팀 · 담당 PM 칸만 업무 범위로 좁힌다 — 필터 줄은 전체 팀(references.teams)을 계속 쓴다.
  const scopedCreateReferences = canWrite
    ? await scopeCreateFormReferences(session.viewer, references, { todayKst: kstToday(new Date()) })
    : null;
  // /review team-scope-create-review.md P3(2) — 팀 발령이 없는 팀 업무 범위 사람은
  // 등록해도 서버가 항상 거부한다(팀 목록 0개) — §7 "할 수 없는 선택지는 보이지 않게".
  const canCreate = canWrite && scopedCreateReferences !== null && scopedCreateReferences.teams.length > 0;
  const createReferences = canCreate && showCreateForm ? scopedCreateReferences : null;

  const { rows, totals, total, page, pageCount, periodErrors, year, hasFilter, emptyKind } = list;
  // 도메인이 정규화한 값(C-08) — 필터 줄 · 페이지 줄은 이 값만 쓴다.
  const { teamId, search, from, to } = list.params;
  const canSeeAmount = totals.quoteAmountKrw !== undefined;
  // 지금 필터·정렬을 그대로 두고 쪽 번호만 바꾼다. 필터 폼은 page를 싣지 않아 필터를 바꾸면 1쪽이다.
  const pageParams = new URLSearchParams();
  if (status) pageParams.set("status", status);
  if (teamId) pageParams.set("teamId", teamId);
  if (year !== currentYear) pageParams.set("year", String(year));
  if (search) pageParams.set("q", search);
  if (from) pageParams.set("from", from);
  if (to) pageParams.set("to", to);
  if (sortKey !== "endDate") pageParams.set("sort", sortKey);
  if (sortDirection !== "asc") pageParams.set("dir", sortDirection);
  function pageHref(target: number): string {
    const next = new URLSearchParams(pageParams);
    next.set("page", String(target));
    return `/projects?${next.toString()}`;
  }

  return (
    <>
      <PageHeader title="프로젝트" subtitle="진행 중인 프로젝트 원장" />

      {/* §6-1 D-39: 폼이 열려 있으면(?new=1) 아래 필터 줄의 1차 버튼을
          렌더하지 않는다 — 한 화면에 1차는 하나다. */}
      {createReferences ? (
        <ProjectForm
          key={copySource && copyFrom ? `copy-${copyFrom}` : "new"}
          copySource={copySource && copyFrom ? { ...copySource, projectId: copyFrom } : null}
          clients={references.clients}
          teams={createReferences.teams}
          pmUsers={createReferences.pmUsers}
          cancelHref={projectsHref()}
          usdDefaultFxRate={usdDefaultFxRate}
        />
      ) : null}

      <div className={styles.filterRow}>
        {/* select의 defaultValue는 마운트 뒤 바뀌어도 칸에 반영되지 않는다 —
            「필터 지우기」·뒤로 가기로 URL이 바뀌면 key로 새로 마운트한다(/qa ISSUE-001). */}
        <ProjectsFilterBar
          key={`${status ?? ""}|${teamId ?? ""}|${year}|${search ?? ""}|${from ?? ""}|${to ?? ""}`}
          teams={references.teams}
          statusOptions={statusOptions}
          yearOptions={yearOptions(currentYear, year)}
          defaultValues={{ status, teamId, year: String(year), q: search, from, to }}
          sort={{ key: sortKey !== "endDate" ? sortKey : undefined, dir: sortDirection !== "asc" ? sortDirection : undefined }}
          hasFilter={hasFilter}
          periodErrors={periodErrors}
        />
        {/* 볼 수 있는 프로젝트가 하나도 없으면(none) ListEmpty가 이미 같은 「프로젝트 등록」
            행동을 준다 — vendors.tsx 선례와 같은 이유로 여기서도 중복 CTA를
            만들지 않는다. 나머지 두 빈 갈래에서는 1차가 그대로 있다. */}
        {canCreate && !showCreateForm && emptyKind !== "none" ? (
          <Link href={projectsHref({ isNew: true })} className={styles.toggle}>
            프로젝트 등록
          </Link>
        ) : null}
      </div>

      {total > 0 ? <ListTotals totals={totals} /> : null}

      {emptyKind === "none" ? (
        <ListEmpty
          message="등록된 프로젝트가 없습니다"
          action={canCreate ? { label: "프로젝트 등록", href: projectsHref({ isNew: true }) } : undefined}
        />
      ) : emptyKind === "default-view" ? (
        <ListEmpty message={`${year}년에 걸친 프로젝트가 없습니다`} action={{ label: "전체 연도 보기", href: "/projects?year=all" }} />
      ) : emptyKind === "filtered" ? (
        <ListEmpty message="조건에 맞는 프로젝트가 없습니다" action={{ label: "필터 지우기", href: "/projects" }} />
      ) : (
        <>
          <ProjectsTable
            rows={rows}
            viewYear={year === "all" ? null : year}
            canSeeAmount={canSeeAmount}
            statusLabels={Object.fromEntries(statusOptions.map((option) => [option.value, option.label]))}
          />
          <Pagination
            label="프로젝트"
            page={page}
            pageCount={pageCount}
            href={pageHref}
            rangeText={pageRangeText({ page, pageSize: LIST_PAGE_SIZE, total, unit: "건" })}
          />
        </>
      )}
    </>
  );
}
