import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import {
  listProjects,
  aggregateProjects,
  settleForProjectList,
  PROJECT_LIST_DEFAULT_LIMIT,
  PROJECT_LIST_MAX_LIMIT,
  PROJECT_SORT_KEYS,
  type ProjectSortKey,
} from "@/domain/projects";
import { listProjectFormReferences } from "@/domain/projects/references";
import { listProjectStatusCatalog } from "@/domain/projects/status";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { ProjectForm } from "./project-form";
import { ProjectsFilterBar, type ProjectFilterOption } from "./filter-bar";
import { ProjectsTable } from "./projects-table";
import styles from "./projects.module.css";

// D-18과 같은 결: 캐시·별도 저장 없음.
export const dynamic = "force-dynamic";

// 04-05 — 04-01의 트레이서 목록(무필터·무그룹)을 완성한다: 월별 그룹·상태
// 필터 한 줄·정렬·더 보기·전체 집계 합계(S1). 04-21 — 상태 값·라벨은 코드표(D-75).

function projectsHref(opts?: { isNew?: boolean }): string {
  return opts?.isNew ? "/projects?new=1#project-form" : "/projects";
}

function yearOptions(): number[] {
  const currentYear = new Date().getFullYear();
  return [currentYear + 1, currentYear, currentYear - 1, currentYear - 2, currentYear - 3];
}

function isValidSortKey(value: string | undefined): value is ProjectSortKey {
  return typeof value === "string" && (PROJECT_SORT_KEYS as readonly string[]).includes(value);
}

type ProjectsSearchParams = {
  new?: string;
  status?: string;
  teamId?: string;
  year?: string;
  q?: string;
  sort?: string;
  dir?: string;
  count?: string;
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
  const year = params.year && /^\d{4}$/.test(params.year) ? Number(params.year) : undefined;
  const search = params.q || undefined;
  const sortKey = isValidSortKey(params.sort) ? params.sort : "endDate";
  const sortDirection = params.dir === "desc" ? "desc" : "asc";
  const requestedCount = params.count ? Number(params.count) : PROJECT_LIST_DEFAULT_LIMIT;
  const count =
    Number.isFinite(requestedCount) && requestedCount > 0
      ? Math.min(Math.floor(requestedCount), PROJECT_LIST_MAX_LIMIT)
      : PROJECT_LIST_DEFAULT_LIMIT;

  const filter = { status, teamId, year, search };
  const hasFilter = Boolean(status || teamId || year || search);

  // 04-11(A-07): 자동 정산 판정은 목록 요청당 한 번, 목록·합계를 나란히 읽기 전에(04-17이
  // loadProjectList 안으로 옮긴다).
  await settleForProjectList(session.viewer);
  const [references, canWrite, rows, aggregate] = await Promise.all([
    listProjectFormReferences(session.viewer),
    can(session.viewer, "projects", "write"),
    listProjects(session.viewer, { filter, sort: { key: sortKey, direction: sortDirection }, limit: count }),
    aggregateProjects(session.viewer, filter),
  ]);

  const canSeeAmount = aggregate.quoteAmountKrw !== undefined;
  const hasMore = rows.length < aggregate.count;
  const loadMoreParams = new URLSearchParams();
  if (status) loadMoreParams.set("status", status);
  if (teamId) loadMoreParams.set("teamId", teamId);
  if (year) loadMoreParams.set("year", String(year));
  if (search) loadMoreParams.set("q", search);
  if (sortKey !== "endDate") loadMoreParams.set("sort", sortKey);
  if (sortDirection !== "asc") loadMoreParams.set("dir", sortDirection);
  loadMoreParams.set("count", String(count + PROJECT_LIST_DEFAULT_LIMIT));
  const loadMoreHref = hasMore ? `/projects?${loadMoreParams.toString()}` : null;

  return (
    <>
      <PageHeader title="프로젝트" subtitle="진행 중인 프로젝트 원장" />

      {/* §6-1 D-39: 폼이 열려 있으면(?new=1) 아래 필터 줄의 1차 버튼을
          렌더하지 않는다 — 한 화면에 1차는 하나다. */}
      {canWrite && showCreateForm ? (
        <ProjectForm
          clients={references.clients}
          teams={references.teams}
          pmUsers={references.pmUsers}
          cancelHref={projectsHref()}
        />
      ) : null}

      <div className={styles.filterRow}>
        {/* select의 defaultValue는 마운트 뒤 바뀌어도 칸에 반영되지 않는다 —
            「필터 지우기」·뒤로 가기로 URL이 바뀌면 key로 새로 마운트한다(/qa ISSUE-001). */}
        <ProjectsFilterBar
          key={`${status ?? ""}|${teamId ?? ""}|${year ?? ""}|${search ?? ""}`}
          teams={references.teams}
          statusOptions={statusOptions}
          yearOptions={yearOptions()}
          defaultValues={{ status, teamId, year: year ? String(year) : undefined, q: search }}
          hasFilter={hasFilter}
        />
        {/* aggregate.count === 0이면 ListEmpty가 이미 같은 「프로젝트 등록」
            행동을 준다 — vendors.tsx 선례와 같은 이유로 여기서도 중복 CTA를
            만들지 않는다. */}
        {canWrite && !showCreateForm && aggregate.count > 0 ? (
          <Link href={projectsHref({ isNew: true })} className={styles.toggle}>
            프로젝트 등록
          </Link>
        ) : null}
      </div>

      {aggregate.count === 0 && !hasFilter ? (
        <ListEmpty
          message="등록된 프로젝트가 없습니다"
          action={{ label: "프로젝트 등록", href: projectsHref({ isNew: true }) }}
        />
      ) : aggregate.count === 0 ? (
        <ListEmpty message="조건에 맞는 프로젝트가 없습니다" action={{ label: "필터 지우기", href: "/projects" }} />
      ) : (
        <ProjectsTable
          rows={rows}
          aggregate={aggregate}
          loadMoreHref={loadMoreHref}
          canSeeAmount={canSeeAmount}
          statusLabels={Object.fromEntries(statusOptions.map((option) => [option.value, option.label]))}
        />
      )}
    </>
  );
}
