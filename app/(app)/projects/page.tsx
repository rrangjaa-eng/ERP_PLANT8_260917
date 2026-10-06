import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { getSettingValue } from "@/domain/settings/registry";
import { PROJECT_PROFIT_RATE_THRESHOLD } from "@/domain/settings/keys";
import {
  loadProjectList,
  getProjectCopySource,
  PROJECT_SORT_KEYS,
  type ProjectSortKey,
} from "@/domain/projects";
import { listProjectFormReferences, loadCreatorDefaults, scopeCreateFormReferences } from "@/domain/projects/references";
import { canCreateProject, createFormClientCount, projectsEmptyState } from "./create-entry";
import { listProjectStatusCatalog } from "@/domain/projects/status";
import { recentFxRate } from "@/domain/money/currency";
import { firstListParam, normalizeListYear, reconcileListYear, yearOptions } from "@/domain/projects/list-view";
import { kstToday, kstYear } from "@/lib/kst-date";
import { LIST_PAGE_SIZE } from "@/lib/paging";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { SidePanel } from "@/ui/side-panel/SidePanel";
import { Pagination } from "@/ui/pagination/Pagination";
import { pageRangeText } from "@/ui/pagination/page-window";
import { ProjectForm } from "./project-form";
import { ProjectsFilterBar, type ProjectFilterOption } from "./filter-bar";
import { ProjectsTable } from "./projects-table";
import { ListTotals } from "./list-totals";

// D-18과 같은 결: 캐시·별도 저장 없음.
export const dynamic = "force-dynamic";

// 04-05 — 04-01의 트레이서 목록(무필터·무그룹)을 완성한다: 월별 그룹·상태
// 필터 한 줄·정렬·전체 집계 합계(S1). 04-21 — 상태 값·라벨은 코드표(D-75). 04-17 — 50건씩 번호 페이지(D-91).

function projectsHref(opts?: { isNew?: boolean }): string {
  return opts?.isNew ? "/projects?new=1" : "/projects";
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

  const [references, canWrite, canWriteVendors, canViewVendors, list, copySource, usdDefaultFxRate, profitRateThreshold] = await Promise.all([
    listProjectFormReferences(session.viewer),
    can(session.viewer, "projects", "write"),
    can(session.viewer, "admin.vendors", "write"),
    can(session.viewer, "admin.vendors", "view"),
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
    // quick 261004-51o — 수익률 기준선(설정). 미만 행의 수익률 글자만 위험 색.
    getSettingValue(PROJECT_PROFIT_RATE_THRESHOLD),
  ]);

  // 등록 폼의 팀 · 담당 PM 칸만 업무 범위로 좁힌다 — 필터 줄은 전체 팀(references.teams)을 계속 쓴다.
  // /review D3 — 등록 폼 기본값(결정 2)은 범위 좁히기와 함께 조회한다. 실패해도 null이라 목록을 막지 않는다.
  const [scopedCreateReferences, loadedCreatorDefaults] = await Promise.all([
    canWrite ? scopeCreateFormReferences(session.viewer, references, { todayKst: kstToday(new Date()) }) : null,
    canWrite && showCreateForm ? loadCreatorDefaults(session.viewer, { todayKst: kstToday(new Date()) }) : null,
  ]);
  // /review team-scope-create-review.md P3(2) — 팀 발령이 없는 팀 업무 범위 사람은
  // 등록해도 서버가 항상 거부한다(팀 목록 0개) — §7 "할 수 없는 선택지는 보이지 않게".
  // quick 261001-85g — 노출표가 클라이언트 · 담당 PM 선택지를 가려 0개여도 같다(필수 칸을 고를 수 없다). 규칙은 create-entry.ts.
  const createChoices = {
    canWrite,
    teamCount: scopedCreateReferences?.teams.length ?? 0,
    pmUserCount: scopedCreateReferences?.pmUsers.length ?? 0,
    clientCount: references.clients.length,
  };
  const canCreate = canCreateProject(createChoices);
  // 261006-biv Codex 리뷰 P2 — 복사 폼은 복사 출처의 클라이언트도 센다(머리 「프로젝트 등록」 · 빈 화면은 그대로).
  const canOpenCreateForm = canCreateProject({ ...createChoices, clientCount: createFormClientCount(references.clients, copySource) });
  const createReferences = canOpenCreateForm && showCreateForm ? scopedCreateReferences : null;
  const creatorDefaults = createReferences ? loadedCreatorDefaults : null;

  const { rows, totals, total, page, pageCount, periodErrors, year, hasFilter, emptyKind } = list;
  // 도메인이 정규화한 값(C-08) — 필터 줄 · 페이지 줄은 이 값만 쓴다.
  const { teamId, search, from, to } = list.params;
  // 지금 필터·정렬을 그대로 두고 쪽 번호만 바꾼다. 필터 폼은 page를 싣지 않아 필터를 바꾸면 1쪽이다.
  // 04-18 — 머리글 정렬 링크는 필터만 싣는다(정렬은 머리글이 정하고 page가 없어 1쪽이다).
  const filterParams = new URLSearchParams();
  if (status) filterParams.set("status", status);
  if (teamId) filterParams.set("teamId", teamId);
  if (year !== currentYear) filterParams.set("year", String(year));
  if (search) filterParams.set("q", search);
  if (from) filterParams.set("from", from);
  if (to) filterParams.set("to", to);
  const pageParams = new URLSearchParams(filterParams);
  if (list.sort.key !== "endDate") pageParams.set("sort", list.sort.key);
  if (list.sort.direction !== "asc") pageParams.set("dir", list.sort.direction);
  function pageHref(target: number): string {
    const next = new URLSearchParams(pageParams);
    next.set("page", String(target));
    return `/projects?${next.toString()}`;
  }

  const copyKey = copySource && copyFrom ? `copy-${copyFrom}` : "new";

  return (
    <ListScreen
      title="프로젝트"
      // DR5 A — 프로젝트가 하나도 없으면(emptyKind none) `ListScreen`이 머리 1차를 그리지 않고 아래 `empty`의 버튼 하나가 등록을 맡는다.
      // 필터 결과 0건(default-view · filtered)은 빈 목록이 아니라 표 자리의 빈 화면이고 머리 1차가 남는다.
      primaryAction={canCreate ? { label: "프로젝트 등록", href: projectsHref({ isNew: true }) } : undefined}
      filters={
        // select의 defaultValue는 마운트 뒤 바뀌어도 칸에 반영되지 않는다 —
        // 「필터 지우기」·뒤로 가기로 URL이 바뀌면 key로 새로 마운트한다(/qa ISSUE-001).
        <ProjectsFilterBar
          key={`${status ?? ""}|${teamId ?? ""}|${year}|${search ?? ""}|${from ?? ""}|${to ?? ""}`}
          teams={references.teams}
          statusOptions={statusOptions}
          yearOptions={yearOptions(currentYear, year)}
          defaultValues={{ status, teamId, year: String(year), q: search, from, to }}
          sort={{ key: list.sort.key !== "endDate" ? list.sort.key : undefined, dir: list.sort.direction !== "asc" ? list.sort.direction : undefined }}
          hasFilter={hasFilter}
          periodErrors={periodErrors}
        />
      }
      summary={total > 0 ? <ListTotals totals={totals} /> : undefined}
      empty={
        emptyKind === "none" ? (
          <ListEmpty {...projectsEmptyState({ ...createChoices, vendorShown: references.vendorShown, canWriteVendors, canViewVendors })} />
        ) : undefined
      }
      pagination={
        emptyKind === null ? (
          <Pagination
            label="프로젝트"
            page={page}
            pageCount={pageCount}
            href={pageHref}
            rangeText={pageRangeText({ page, pageSize: LIST_PAGE_SIZE, total, unit: "건" })}
          />
        ) : undefined
      }
      panel={
        // 쓰기 권한이 없거나 등록할 수 없는 계급(팀 · 담당 PM · 클라이언트 선택지 0개)에는 패널 자체를 렌더하지 않는다(R15).
        createReferences ? (
          <SidePanel key={copyKey} title="프로젝트 등록" closeHref={projectsHref()}>
            <ProjectForm
              key={copyKey}
              copySource={copySource && copyFrom ? { ...copySource, projectId: copyFrom } : null}
              clients={references.clients}
              teams={createReferences.teams}
              pmUsers={createReferences.pmUsers}
              creatorDefaults={creatorDefaults}
              usdDefaultFxRate={usdDefaultFxRate}
            />
          </SidePanel>
        ) : null
      }
    >
      {emptyKind === "default-view" ? (
        <ListEmpty message={`${year}년에 걸친 프로젝트가 없습니다`} action={{ label: "전체 연도 보기", href: "/projects?year=all" }} />
      ) : emptyKind === "filtered" ? (
        <ListEmpty message="조건에 맞는 프로젝트가 없습니다" action={{ label: "필터 지우기", href: "/projects" }} />
      ) : emptyKind === null ? (
        <ProjectsTable
          rows={rows}
          viewYear={year === "all" ? null : year}
          columnStep={list.columnStep}
          sort={list.sort}
          filterQuery={filterParams.toString()}
          profitRateThreshold={profitRateThreshold}
        />
      ) : null}
    </ListScreen>
  );
}
