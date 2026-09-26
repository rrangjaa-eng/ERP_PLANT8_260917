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

function yearOptions(currentYear: number): number[] {
  return [currentYear + 1, currentYear, currentYear - 1, currentYear - 2, currentYear - 3];
}

function isValidSortKey(value: string | undefined): value is ProjectSortKey {
  return typeof value === "string" && (PROJECT_SORT_KEYS as readonly string[]).includes(value);
}

type ProjectsSearchParams = {
  new?: string;
  copyFrom?: string;
  status?: string;
  teamId?: string;
  year?: string;
  q?: string;
  sort?: string;
  dir?: string;
  page?: string;
};

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<ProjectsSearchParams> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "projects", "view"))) notFound();

  const params = await searchParams;
  const showCreateForm = params.new === "1";
  const statusOptions: ProjectFilterOption[] = (await listProjectStatusCatalog(session.viewer)).map(
    ({ value, label }) => ({ value, label }),
  );

  // 네이티브 GET 폼이 빈 칸까지 `status=&...`로 실으므로 여기서 한 번만
  // undefined로 정규화한다(action-log/page.tsx와 같은 이유).
  const status =
    params.status && statusOptions.some((option) => option.value === params.status) ? params.status : undefined;
  const teamId = params.teamId || undefined;
  // D-89 — 조건 없는 URL은 올해(KST) 보기, `all`은 전체 연도.
  const currentYear = kstYear(new Date());
  const year = params.year === "all" ? "all" : params.year && /^\d{4}$/.test(params.year) ? Number(params.year) : currentYear;
  const search = params.q || undefined;
  const sortKey = isValidSortKey(params.sort) ? params.sort : "endDate";
  const sortDirection = params.dir === "desc" ? "desc" : "asc";

  // 올해 연도 값은 필터로 세지 않는다(UI-SPEC S1).
  const hasFilter = Boolean(status || teamId || year !== currentYear || search);
  const statusLabel = statusOptions.find((option) => option.value === status)?.label;

  const [references, canWrite, list, copySource, usdDefaultFxRate] = await Promise.all([
    listProjectFormReferences(session.viewer),
    can(session.viewer, "projects", "write"),
    loadProjectList(session.viewer, {
      status,
      statusLabel,
      teamId,
      year,
      search,
      sort: { key: sortKey, direction: sortDirection },
      page: params.page,
    }),
    // 04-15(D-70 · S2) — 복사 등록 미리 채우기. 범위 밖 · 보관 · 없는 출처면 null → 일반 등록 폼.
    showCreateForm && params.copyFrom ? getProjectCopySource(session.viewer, params.copyFrom) : Promise.resolve(null),
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

  const { rows, totals, total, page, pageCount } = list;
  const canSeeAmount = totals.quoteAmountKrw !== undefined;
  // 지금 필터·정렬을 그대로 두고 쪽 번호만 바꾼다. 필터 폼은 page를 싣지 않아 필터를 바꾸면 1쪽이다.
  const pageParams = new URLSearchParams();
  if (status) pageParams.set("status", status);
  if (teamId) pageParams.set("teamId", teamId);
  if (year !== currentYear) pageParams.set("year", String(year));
  if (search) pageParams.set("q", search);
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
          key={copySource && params.copyFrom ? `copy-${params.copyFrom}` : "new"}
          copySource={copySource && params.copyFrom ? { ...copySource, projectId: params.copyFrom } : null}
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
          key={`${status ?? ""}|${teamId ?? ""}|${year}|${search ?? ""}`}
          teams={references.teams}
          statusOptions={statusOptions}
          yearOptions={yearOptions(currentYear)}
          defaultValues={{ status, teamId, year: String(year), q: search }}
          hasFilter={hasFilter}
        />
        {/* total === 0이면 ListEmpty가 이미 같은 「프로젝트 등록」
            행동을 준다 — vendors.tsx 선례와 같은 이유로 여기서도 중복 CTA를
            만들지 않는다. */}
        {canCreate && !showCreateForm && total > 0 ? (
          <Link href={projectsHref({ isNew: true })} className={styles.toggle}>
            프로젝트 등록
          </Link>
        ) : null}
      </div>

      {total > 0 ? <ListTotals totals={totals} /> : null}

      {total === 0 && !hasFilter ? (
        <ListEmpty
          message="등록된 프로젝트가 없습니다"
          action={canCreate ? { label: "프로젝트 등록", href: projectsHref({ isNew: true }) } : undefined}
        />
      ) : total === 0 ? (
        <ListEmpty message="조건에 맞는 프로젝트가 없습니다" action={{ label: "필터 지우기", href: "/projects" }} />
      ) : (
        <>
          <ProjectsTable
            rows={rows}
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
