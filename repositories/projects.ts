import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db/client";
import { projects, quoteLines, quoteRevisions, teams, users, vendors } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import type { Scope } from "@/domain/permissions/scope-for";
import type { DbOrTx } from "@/repositories/document-counters";

export type ProjectRow = InferSelectModel<typeof projects>;

// 04-05 Task 1 ① — 목록·집계가 공유하는 「현재 차수」 파생 표. D-54: 최신
// 차수(seq 최댓값)만 현재다. project_id당 정확히 한 행(selectDistinctOn).
function currentRevisionsSubquery() {
  return db
    .selectDistinctOn([quoteRevisions.projectId], {
      projectId: quoteRevisions.projectId,
      revisionId: quoteRevisions.id,
    })
    .from(quoteRevisions)
    .orderBy(quoteRevisions.projectId, desc(quoteRevisions.seq))
    .as("current_revisions");
}

// 현재 차수의 견적 줄 합계(견적가·실행가·차익) — revision_id당 한 행. 상태
// (미착수/취소)와 무관하게 전 줄을 더한다 — `[id]/quote-table.tsx`의 합계
// 행(공급가액 · N줄)이 이미 같은 규칙(전 줄 포함)이다.
function lineSumsSubquery() {
  return db
    .select({
      revisionId: quoteLines.revisionId,
      quoteSum: sql<number>`coalesce(sum(${quoteLines.quoteAmountKrw}), 0)`.as("quote_sum"),
      executionSum: sql<number>`coalesce(sum(${quoteLines.executionAmountKrw}), 0)`.as("execution_sum"),
      profitSum: sql<number>`coalesce(sum(${quoteLines.profitKrw}), 0)`.as("profit_sum"),
    })
    .from(quoteLines)
    .groupBy(quoteLines.revisionId)
    .as("line_sums");
}

export type ProjectListFilter = {
  /** 단일 선택(전체 상태 select, D-51) — 빈 값이면 필터 없음. */
  status?: string;
  teamId?: string;
  /** 종료일 기준 연도 — 종료일 없는(기간 미정) 행은 특정 연도로 걸리지 않는다. */
  year?: number;
  /** 프로젝트명·번호·클라이언트명 ILIKE. */
  search?: string;
};

export const PROJECT_SORT_KEYS = [
  "endDate",
  "name",
  "number",
  "quoteAmountKrw",
  "executionAmountKrw",
  "profitKrw",
] as const;
export type ProjectSortKey = (typeof PROJECT_SORT_KEYS)[number];
export type ProjectSort = { key: ProjectSortKey; direction: "asc" | "desc" };

export type ProjectListRow = {
  id: string;
  number: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  clientName: string;
  teamName: string;
  pmUserName: string;
  quoteAmountKrw: number;
  executionAmountKrw: number;
  profitKrw: number;
};

export type ProjectAggregateRow = {
  count: number;
  quoteAmountKrw: number;
  executionAmountKrw: number;
  profitKrw: number;
};

// 목록 쿼리와 집계 쿼리가 공유하는 **같은 행 필터 서술자**(T-04-28) — 한쪽만
// 고치면 합계가 그 사람이 볼 수 없는 행을 더하거나 덜 더치는 정보 노출이
// 된다. 두 함수 모두 이 함수 하나만 호출한다.
function projectFilterConditions(scope: Scope, filter: ProjectListFilter) {
  const conditions = [];
  if (!scope.includeArchived) conditions.push(isNull(projects.archivedAt));
  if (filter.status) conditions.push(eq(projects.status, filter.status));
  if (filter.teamId) conditions.push(eq(projects.teamId, filter.teamId));
  // endDate가 NULL이면 extract(year from NULL) = NULL이라 이 조건이 거짓으로
  // 평가된다 — 기간 미정 행은 연도 필터에 걸리지 않고 자연히 제외된다.
  if (filter.year) conditions.push(sql`extract(year from ${projects.endDate}) = ${filter.year}`);
  if (filter.search) {
    const pattern = `%${filter.search}%`;
    conditions.push(or(ilike(projects.name, pattern), ilike(projects.number, pattern), ilike(vendors.name, pattern)));
  }
  return conditions;
}

// T-04-30 — 허용 목록 밖 정렬 키는 기본 정렬(종료일)로 떨어진다(임의 컬럼
// 정렬 방지). 호출자(domain)도 같은 허용 목록으로 한 번 더 막지만, 리포지토리
// 스스로도 신뢰하지 않는 입력을 받을 수 있다는 전제로 자체 방어한다.
function resolveSortColumn(
  key: ProjectSortKey,
  lineSums: ReturnType<typeof lineSumsSubquery>,
) {
  switch (key) {
    case "name":
      return projects.name;
    case "number":
      return projects.number;
    case "quoteAmountKrw":
      return lineSums.quoteSum;
    case "executionAmountKrw":
      return lineSums.executionSum;
    case "profitKrw":
      return lineSums.profitSum;
    case "endDate":
    default:
      return projects.endDate;
  }
}

// 04-05 Task 1 ① — 목록. 그룹(종료일 월, 기간 미정은 맨 아래)이 1차 정렬,
// 요청 정렬 키는 **그룹 안**에서의 순서다 — 그래야 열 머리글 정렬이 D-51의
// 월별 묶음 구조를 깨지 않는다. `limit`이 곧 화면의 "더 보기" 누적 개수
// (오프셋이 아니라 개수 증가 방식 — Task 1 action ③).
export async function listProjectsPage(
  viewer: Viewer,
  opts: { scope: Scope; filter: ProjectListFilter; sort: ProjectSort; limit: number },
): Promise<ProjectListRow[]> {
  void viewer;
  if (opts.scope.rows === "none") return [];

  const currentRevisions = currentRevisionsSubquery();
  const lineSums = lineSumsSubquery();
  const conditions = projectFilterConditions(opts.scope, opts.filter);
  const sortColumn = resolveSortColumn(opts.sort.key, lineSums);
  const orderDir = opts.sort.direction === "desc" ? desc : asc;

  const rows = await db
    .select({
      id: projects.id,
      number: projects.number,
      name: projects.name,
      status: projects.status,
      startDate: projects.startDate,
      endDate: projects.endDate,
      clientName: vendors.name,
      teamName: teams.name,
      pmUserName: users.name,
      quoteAmountKrw: sql<number>`coalesce(${lineSums.quoteSum}, 0)::bigint`.mapWith(Number),
      executionAmountKrw: sql<number>`coalesce(${lineSums.executionSum}, 0)::bigint`.mapWith(Number),
      profitKrw: sql<number>`coalesce(${lineSums.profitSum}, 0)::bigint`.mapWith(Number),
    })
    .from(projects)
    .leftJoin(vendors, eq(vendors.id, projects.clientId))
    .leftJoin(teams, eq(teams.id, projects.teamId))
    .leftJoin(users, eq(users.id, projects.pmUserId))
    .leftJoin(currentRevisions, eq(currentRevisions.projectId, projects.id))
    .leftJoin(lineSums, eq(lineSums.revisionId, currentRevisions.revisionId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(
      sql`(${projects.endDate} is null)`,
      sql`date_trunc('month', ${projects.endDate})`,
      orderDir(sortColumn),
      projects.id,
    )
    .limit(opts.limit);

  return rows.map((row) => ({
    ...row,
    clientName: row.clientName ?? "",
    teamName: row.teamName ?? "",
    pmUserName: row.pmUserName ?? "",
  }));
}

// 04-05 Task 1 ① — 집계. **쿼리 한 번**으로 건수·견적·실행가·차익 합계를
// 돌려준다(화면에 불러온 페이지 크기와 무관 — `listProjectsPage`의 `limit`을
// 이 함수는 아예 받지 않는다). `projectFilterConditions`를 그대로 재사용해
// 목록과 같은 행만 더한다.
export async function aggregateProjects(
  viewer: Viewer,
  opts: { scope: Scope; filter: ProjectListFilter },
): Promise<ProjectAggregateRow> {
  void viewer;
  if (opts.scope.rows === "none") return { count: 0, quoteAmountKrw: 0, executionAmountKrw: 0, profitKrw: 0 };

  const currentRevisions = currentRevisionsSubquery();
  const lineSums = lineSumsSubquery();
  const conditions = projectFilterConditions(opts.scope, opts.filter);

  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      quoteAmountKrw: sql<number>`coalesce(sum(coalesce(${lineSums.quoteSum}, 0)), 0)::bigint`.mapWith(Number),
      executionAmountKrw: sql<number>`coalesce(sum(coalesce(${lineSums.executionSum}, 0)), 0)::bigint`.mapWith(Number),
      profitKrw: sql<number>`coalesce(sum(coalesce(${lineSums.profitSum}, 0)), 0)::bigint`.mapWith(Number),
    })
    .from(projects)
    .leftJoin(vendors, eq(vendors.id, projects.clientId))
    .leftJoin(currentRevisions, eq(currentRevisions.projectId, projects.id))
    .leftJoin(lineSums, eq(lineSums.revisionId, currentRevisions.revisionId))
    .where(conditions.length ? and(...conditions) : undefined);

  return row ?? { count: 0, quoteAmountKrw: 0, executionAmountKrw: 0, profitKrw: 0 };
}

export async function findProjectById(viewer: Viewer, id: string): Promise<ProjectRow | null> {
  void viewer;
  const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return row ?? null;
}

export async function findProjectByNumber(viewer: Viewer, number: string): Promise<ProjectRow | null> {
  void viewer;
  const [row] = await db.select().from(projects).where(eq(projects.number, number)).limit(1);
  return row ?? null;
}

export type ProjectInsertInput = {
  number: string;
  clientId: string;
  teamId: string;
  pmUserId: string;
  name: string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  preEstimateCurrency: string;
  preEstimateForeignAmount: string | null;
  preEstimateFxRate: string;
  preEstimateAmountKrw: number;
  contractCurrency: string;
  contractForeignAmount: string | null;
  contractFxRate: string;
  contractAmountKrw: number;
  source?: string;
  customFields?: Record<string, unknown>;
};

// **번호 부여와 같은 트랜잭션 안에서 불린다** — tx를 받는 유일한 쓰기
// 함수(Task 2 ⑧, 04-RESEARCH.md Anti-Patterns).
export async function insertProject(viewer: Viewer, input: ProjectInsertInput, tx: DbOrTx = db): Promise<ProjectRow> {
  void viewer;
  const [row] = await tx
    .insert(projects)
    .values({
      number: input.number,
      clientId: input.clientId,
      teamId: input.teamId,
      pmUserId: input.pmUserId,
      name: input.name,
      status: input.status,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      preEstimateCurrency: input.preEstimateCurrency,
      preEstimateForeignAmount: input.preEstimateForeignAmount,
      preEstimateFxRate: input.preEstimateFxRate,
      preEstimateAmountKrw: input.preEstimateAmountKrw,
      contractCurrency: input.contractCurrency,
      contractForeignAmount: input.contractForeignAmount,
      contractFxRate: input.contractFxRate,
      contractAmountKrw: input.contractAmountKrw,
      source: input.source ?? "demo",
      customFields: input.customFields ?? {},
    })
    .returning();
  if (!row) throw new Error("projects insert가 행을 반환하지 않았습니다.");
  return row;
}

export type ProjectContractUpdateInput = {
  contractCurrency: string;
  contractForeignAmount: string | null;
  contractFxRate: string;
  contractAmountKrw: number;
};

// 04-02(D-57) — 계약 금액 칸 하나만 갱신한다. 낙관적 잠금은 두지 않는다
// (칸 하나이고 PM 한 명만 쓰기 권한을 갖는다 — 견적 줄·매출 줄처럼 여러
// 사람이 동시에 같은 셀을 다투는 표가 아니다).
export async function updateProjectContract(
  viewer: Viewer,
  id: string,
  input: ProjectContractUpdateInput,
  tx: DbOrTx = db,
): Promise<void> {
  void viewer;
  await tx
    .update(projects)
    .set({
      contractCurrency: input.contractCurrency,
      contractForeignAmount: input.contractForeignAmount,
      contractFxRate: input.contractFxRate,
      contractAmountKrw: input.contractAmountKrw,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id));
}
