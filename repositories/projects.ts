import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { InferSelectModel, SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, projects, quoteLines, quoteRevisions, revenueEntries, teams, users, vendors } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import type { Scope } from "@/domain/permissions/scope-for";
import type { DbOrTx } from "@/repositories/document-counters";
import { ISSUED_BASIS_STATUSES, type ProfitBasis } from "@/domain/projects/list-view";
import type { ProjectStatus } from "@/domain/projects/status-transitions";

export type ProjectRow = InferSelectModel<typeof projects>;

// 04-17(CEO C-01) — 이 파일의 모든 집계 · 금액 반환은 JS number다: 돈 합은 SQL에서 `bigint`로 더하고
// `mapWith(Number)`로 리포지토리 경계에서 바꾼다(21억 초과에서 `int` 오류 · 문자열 합계가 나지 않는다).

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

// 현재 차수의 견적 줄 합계(견적가·실행가·차익) — revision_id당 한 행. 보관된 줄은 빼고
// 취소 줄은 견적가 0으로 더한다(04-12 · A-04 — 취소 줄의 견적가 열이 이미 0이다).
// 04-17(엔지 리뷰 C §4 P2) — 현재 차수의 줄만 모아 더한다(모든 차수의 줄을 GROUP BY하지 않는다).
function lineSumsSubquery() {
  const currentRevisionIds = db
    .selectDistinctOn([quoteRevisions.projectId], { id: quoteRevisions.id })
    .from(quoteRevisions)
    .orderBy(quoteRevisions.projectId, desc(quoteRevisions.seq));
  return db
    .select({
      revisionId: quoteLines.revisionId,
      quoteSum: sql<number>`coalesce(sum(${quoteLines.quoteAmountKrw}), 0)::bigint`.as("quote_sum"),
      executionSum: sql<number>`coalesce(sum(${quoteLines.executionAmountKrw}), 0)::bigint`.as("execution_sum"),
      profitSum: sql<number>`coalesce(sum(${quoteLines.profitKrw}), 0)::bigint`.as("profit_sum"),
    })
    .from(quoteLines)
    .where(and(isNull(quoteLines.archivedAt), inArray(quoteLines.revisionId, currentRevisionIds)))
    .groupBy(quoteLines.revisionId)
    .as("line_sums");
}

// 04-17(D-85 · C-14 · 엔지 리뷰 C §4 P2) — 발행 줄만(입금 줄 제외) · 보관 제외 합계와 줄 수. 표 전체를 GROUP BY하지 않고
// 행 필터를 지난 프로젝트마다 LEFT JOIN LATERAL로 구한다(revenue_entries_project_kind_date_idx).
function issuedSumsLateral() {
  return db
    .select({
      issuedSum: sql<number | null>`sum(${revenueEntries.amountAmountKrw})::bigint`.as("issued_sum"),
      issuedCount: sql<number>`count(*)::int`.as("issued_count"),
    })
    .from(revenueEntries)
    .where(and(eq(revenueEntries.projectId, projects.id), eq(revenueEntries.kind, "issue"), isNull(revenueEntries.archivedAt)))
    .as("issued");
}

// 04-17(교차 그룹 계약 7 · DR-8 · DR-38 · C-16) — 행 단위 식의 유일한 정의. 기준 금액은 정산·완료이고 발행 줄이 1개
// 이상일 때만 발행 합계, 그 밖은 견적 합계다(domain/projects/list-view의 profitBasisFor와 같은 규칙 · 같은 상태 목록).
// 수익금 = 기준 − 실행가, 수익률 = 수익금 ÷ 기준(기준 ≤ 0이면 NULL).
function rowMoneyExpressions(
  lineSums: ReturnType<typeof lineSumsSubquery>,
  issued: ReturnType<typeof issuedSumsLateral>,
) {
  const quote = sql`coalesce(${lineSums.quoteSum}, 0)`;
  const execution = sql`coalesce(${lineSums.executionSum}, 0)`;
  const issuedCount = sql`coalesce(${issued.issuedCount}, 0)`;
  const issuedBasisStatuses = sql.join(
    ISSUED_BASIS_STATUSES.map((status: ProjectStatus) => sql`${status}`),
    sql`, `,
  );
  const isIssuedBasis = sql`(${projects.status} in (${issuedBasisStatuses}) and ${issuedCount} > 0)`;
  const basis = sql`(case when ${isIssuedBasis} then coalesce(${issued.issuedSum}, 0) else ${quote} end)`;
  const profit = sql`(${basis} - ${execution})`;
  return {
    quote,
    execution,
    issuedCount,
    basis,
    profit,
    revenue: sql`(case when ${issuedCount} > 0 then ${issued.issuedSum} end)`,
    rate: sql`(case when ${basis} > 0 then ${profit}::float8 / ${basis} end)`,
    profitBasis: sql`(case when ${isIssuedBasis} then 'issued' else 'quote' end)`,
  };
}

export type ProjectListFilter = {
  /** 단일 선택(전체 상태 select, D-51) — 빈 값이면 필터 없음. */
  status?: string;
  teamId?: string;
  /**
   * 보기 범위 R(04-17 D-89 · D-90) — 없으면 범위 없음(전체 연도). 종료일이 있는 행은 기간이 R과 겹치면 보이고
   * (시작일이 없으면 종료일로 본다), 종료일이 없는 행은 수주중이면 항상, 그 밖은 등록일(KST 날짜)이 R 안일 때만 보인다.
   */
  range?: { start?: string; end?: string };
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
  // 04-17 — 행 단위 식(계약 7). DTO 명세에 올리는 것은 04-18이다(명세 밖이면 응답에 없다).
  /** 발행 줄 합계 — 발행 줄이 0개면 null. */
  revenueKrw: number | null;
  issuedCount: number;
  profitBasis: ProfitBasis;
  /** 수익금 = 기준 금액 − 실행가(D-87). profitKrw(줄 차익 합)와 다르다. */
  netProfitKrw: number;
  /** 수익금 ÷ 기준 금액 — 기준 ≤ 0이면 null. */
  profitRate: number | null;
};

// 04-17(D-90) — 귀속 구간: "in"(종료일이 R 안, R이 없으면 종료일 있는 전부) · "undetermined"(종료일 없음) · 종료 연도 문자열.
export type ProjectAggregateBucket = {
  bucket: string;
  count: number;
  revenueKrw: number;
  quoteAmountKrw: number;
  executionAmountKrw: number;
  profitKrw: number;
  basisAmountKrw: number;
  /** 구간의 Σ수익금 ÷ Σ기준 — Σ기준 ≤ 0이면 null. */
  profitRate: number | null;
};

// 목록 쿼리와 집계 쿼리가 공유하는 **같은 행 필터 서술자**(T-04-28) — 한쪽만
// 고치면 합계가 그 사람이 볼 수 없는 행을 더하거나 덜 더치는 정보 노출이
// 된다. 두 함수 모두 이 함수 하나만 호출한다.
// 04-17(사용자 D18 · C-21): 보관된 프로젝트는 보관함을 볼 수 있는 계급에게도 목록·합계에 없다.
function projectFilterConditions(filter: ProjectListFilter) {
  const conditions: (SQL | undefined)[] = [isNull(projects.archivedAt)];
  if (filter.status) conditions.push(eq(projects.status, filter.status));
  if (filter.teamId) conditions.push(eq(projects.teamId, filter.teamId));
  if (filter.range) conditions.push(rangeCondition(filter.range));
  if (filter.search) {
    const pattern = `%${filter.search}%`;
    conditions.push(or(ilike(projects.name, pattern), ilike(projects.number, pattern), ilike(vendors.name, pattern)));
  }
  return conditions;
}

// created_at은 시간대 없는 UTC 시각이다(세션 TimeZone = UTC) — KST 날짜로 바꿔 R과 비교한다.
const CREATED_ON_KST = sql`((${projects.createdAt} at time zone 'UTC') at time zone 'Asia/Seoul')::date`;
const ALWAYS_LISTED_UNDATED_STATUS: ProjectStatus = "bidding";

function withinRange(column: SQL, range: { start?: string; end?: string }): SQL {
  return and(
    range.start ? sql`${column} >= ${range.start}::date` : undefined,
    range.end ? sql`${column} <= ${range.end}::date` : undefined,
  ) ?? sql`true`;
}

// 04-17(D-89 · C-11 · 사용자 D19) — 겹침 조건 + 기간 미정 노출 규칙.
function rangeCondition(range: { start?: string; end?: string }): SQL {
  const dated = and(
    isNotNull(projects.endDate),
    range.end ? sql`coalesce(${projects.startDate}, ${projects.endDate}) <= ${range.end}::date` : undefined,
    range.start ? sql`${projects.endDate} >= ${range.start}::date` : undefined,
  );
  const undated = and(
    isNull(projects.endDate),
    or(eq(projects.status, ALWAYS_LISTED_UNDATED_STATUS), withinRange(CREATED_ON_KST, range)),
  );
  return or(dated, undated) ?? sql`true`;
}

// 04-17(D-90) — 귀속 구간 식. 행 필터(projectFilterConditions) 위에 얹는 분류일 뿐 행을 거르지 않는다.
function attributionBucket(range: { start?: string; end?: string } | undefined): SQL {
  if (!range) return sql`(case when ${projects.endDate} is null then 'undetermined' else 'in' end)`;
  const endDate = sql`${projects.endDate}`;
  return sql`(case when ${projects.endDate} is null then 'undetermined' when ${withinRange(endDate, range)} then 'in' else extract(year from ${projects.endDate})::int::text end)`;
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
  opts: { scope: Scope; filter: ProjectListFilter; sort: ProjectSort; offset: number; limit: number },
): Promise<ProjectListRow[]> {
  void viewer;
  if (opts.scope.rows === "none") return [];

  const currentRevisions = currentRevisionsSubquery();
  const lineSums = lineSumsSubquery();
  const issued = issuedSumsLateral();
  const money = rowMoneyExpressions(lineSums, issued);
  const conditions = projectFilterConditions(opts.filter);
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
      quoteAmountKrw: sql<number>`${money.quote}::bigint`.mapWith(Number),
      executionAmountKrw: sql<number>`${money.execution}::bigint`.mapWith(Number),
      profitKrw: sql<number>`coalesce(${lineSums.profitSum}, 0)::bigint`.mapWith(Number),
      revenueKrw: sql<number | null>`${money.revenue}::bigint`.mapWith(Number),
      issuedCount: sql<number>`${money.issuedCount}::int`.mapWith(Number),
      profitBasis: sql<ProfitBasis>`${money.profitBasis}`,
      netProfitKrw: sql<number>`${money.profit}::bigint`.mapWith(Number),
      profitRate: sql<number | null>`${money.rate}`.mapWith(Number),
    })
    .from(projects)
    .leftJoin(vendors, eq(vendors.id, projects.clientId))
    .leftJoin(teams, eq(teams.id, projects.teamId))
    .leftJoin(users, eq(users.id, projects.pmUserId))
    .leftJoin(currentRevisions, eq(currentRevisions.projectId, projects.id))
    .leftJoin(lineSums, eq(lineSums.revisionId, currentRevisions.revisionId))
    .leftJoinLateral(issued, sql`true`)
    .where(and(...conditions))
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

// 04-05 Task 1 ① · 04-17(D-88 · D-90) — 집계. **쿼리 한 번**으로 귀속 구간마다 건수·매출·견적·실행가·수익금·기준
// 합과 수익률을 돌려준다(화면에 불러온 페이지와 무관 — 이 함수는 페이지 인자를 받지 않는다). `projectFilterConditions`를
// 그대로 재사용해 목록과 같은 행만 더하고, 귀속은 그 위에 구간 식으로만 나눈다.
export async function aggregateProjects(
  viewer: Viewer,
  opts: { scope: Scope; filter: ProjectListFilter },
): Promise<ProjectAggregateBucket[]> {
  void viewer;
  if (opts.scope.rows === "none") return [];

  const currentRevisions = currentRevisionsSubquery();
  const lineSums = lineSumsSubquery();
  const issued = issuedSumsLateral();
  const money = rowMoneyExpressions(lineSums, issued);
  const conditions = projectFilterConditions(opts.filter);

  // 구간 식에 날짜 파라미터가 있어 GROUP BY는 선택 목록의 첫 열(bucket) 번호로 건다 — 같은 식을 다시 쓰면
  // 파라미터 번호가 달라 Postgres가 다른 식으로 본다.
  return db
    .select({
      bucket: sql<string>`${attributionBucket(opts.filter.range)}`,
      count: sql<number>`count(*)::int`.mapWith(Number),
      revenueKrw: sql<number>`coalesce(sum(coalesce(${issued.issuedSum}, 0)), 0)::bigint`.mapWith(Number),
      quoteAmountKrw: sql<number>`coalesce(sum(${money.quote}), 0)::bigint`.mapWith(Number),
      executionAmountKrw: sql<number>`coalesce(sum(${money.execution}), 0)::bigint`.mapWith(Number),
      profitKrw: sql<number>`coalesce(sum(${money.profit}), 0)::bigint`.mapWith(Number),
      basisAmountKrw: sql<number>`coalesce(sum(${money.basis}), 0)::bigint`.mapWith(Number),
      profitRate: sql<number | null>`(case when sum(${money.basis}) > 0 then sum(${money.profit})::float8 / sum(${money.basis}) end)`.mapWith(Number),
    })
    .from(projects)
    .leftJoin(vendors, eq(vendors.id, projects.clientId))
    .leftJoin(currentRevisions, eq(currentRevisions.projectId, projects.id))
    .leftJoin(lineSums, eq(lineSums.revisionId, currentRevisions.revisionId))
    .leftJoinLateral(issued, sql`true`)
    .where(and(...conditions))
    .groupBy(sql`1`);
}

export async function findProjectById(viewer: Viewer, id: string, tx: DbOrTx = db): Promise<ProjectRow | null> {
  void viewer;
  const [row] = await tx.select().from(projects).where(eq(projects.id, id)).limit(1);
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
      source: input.source ?? "demo",
      customFields: input.customFields ?? {},
    })
    .returning();
  if (!row) throw new Error("projects insert가 행을 반환하지 않았습니다.");
  return row;
}

// 04-20(OV-3·A-11): 상태 전환의 배타 잠금 읽기 — 호출자가 연 트랜잭션 안에서만
// 부른다(tx 필수). 행이 없으면 null.
export async function lockProjectForWrite(viewer: Viewer, id: string, tx: DbOrTx): Promise<ProjectRow | null> {
  void viewer;
  const [row] = await tx.select().from(projects).where(eq(projects.id, id)).for("update");
  return row ?? null;
}

// 04-20(D-82): 기대 상태일 때만 바꾼다(0행이면 null — 호출자가 동시 변경으로
// 거부한다). 진행으로 가는 전환은 같은 문장에서 빈 종료일을 시작일로 채운다.
export async function updateProjectStatusIfCurrent(
  viewer: Viewer,
  id: string,
  input: { expectedStatus: string; status: string; fillEndDateFromStart: boolean },
  tx: DbOrTx,
): Promise<ProjectRow | null> {
  void viewer;
  const [row] = await tx
    .update(projects)
    .set({
      status: input.status,
      version: sql`${projects.version} + 1`,
      updatedAt: new Date(),
      ...(input.fillEndDateFromStart ? { endDate: sql`coalesce(${projects.endDate}, ${projects.startDate})` } : {}),
    })
    .where(and(eq(projects.id, id), eq(projects.status, input.expectedStatus)))
    .returning();
  return row ?? null;
}

// 04-22(엔지 리뷰 A §1 P1): 기간 갱신 — 화면이 읽은 기간(expected)과 같을 때만 바꾼다(0행이면
// null — 호출자가 동시 수정으로 거부한다). version은 판정에 쓰지 않는다(상태 변경·자동 정산도
// 올리는 값이라 헛충돌이 된다).
export async function updateProjectPeriod(
  viewer: Viewer,
  id: string,
  input: {
    startDate: string | null;
    endDate: string | null;
    expected: { startDate: string | null; endDate: string | null };
  },
  tx: DbOrTx,
): Promise<ProjectRow | null> {
  void viewer;
  const [row] = await tx
    .update(projects)
    .set({ startDate: input.startDate, endDate: input.endDate, updatedAt: new Date() })
    .where(
      and(
        eq(projects.id, id),
        sql`${projects.startDate} IS NOT DISTINCT FROM ${input.expected.startDate}::date`,
        sql`${projects.endDate} IS NOT DISTINCT FROM ${input.expected.endDate}::date`,
      ),
    )
    .returning();
  return row ?? null;
}

// 04-44(계약 8) — 총 매출 예상가 네 칸. 동시 수정 기준값은 두지 않는다(나중 저장이 이긴다 — 사용자 2026-09-23).
// 호출자는 잠근 트랜잭션 안에서 부른다.
export async function updateProjectPreEstimate(
  viewer: Viewer,
  id: string,
  input: { currency: string; foreignAmount: string | null; fxRate: string; amountKrw: number },
  tx: DbOrTx,
): Promise<ProjectRow | null> {
  void viewer;
  const [row] = await tx
    .update(projects)
    .set({
      preEstimateCurrency: input.currency,
      preEstimateForeignAmount: input.foreignAmount,
      preEstimateFxRate: input.fxRate,
      preEstimateAmountKrw: input.amountKrw,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id))
    .returning();
  return row ?? null;
}

export type SettledProjectRow = { id: string; endDate: string; lastChangeAt: Date | null };

// 04-11(D-76 · OV-5 · Pitfall 7): 종료일이 지난 from 상태 프로젝트를 to로 바꾼다. 대상은
// FOR UPDATE SKIP LOCKED 하위 선택으로 잠근다 — 누가 저장·전환으로 잡은 행은 기다리지
// 않고 건너뛴다(그 쓰기가 자기 잠금 안에서 같은 판정을 한다). 오늘(KST)은 인자로만
// 받는다 — DB의 현재 날짜·서버 시간대를 쓰지 않는다. 바뀐 행마다 그 프로젝트의 직전
// status_change 시각(발효일 계산용)을 같은 문장에서 돌려준다.
export async function settleOverdueProjects(
  viewer: Viewer,
  input: { todayKst: string; projectIds?: string[]; from: string; to: string },
  tx: DbOrTx,
): Promise<SettledProjectRow[]> {
  void viewer;
  const targets = tx
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.status, input.from),
        isNotNull(projects.endDate),
        lt(projects.endDate, input.todayKst),
        isNull(projects.archivedAt),
        input.projectIds ? inArray(projects.id, input.projectIds) : undefined,
      ),
    )
    .for("update", { skipLocked: true });

  const rows = await tx
    .update(projects)
    .set({ status: input.to, version: sql`${projects.version} + 1`, updatedAt: new Date() })
    .where(and(inArray(projects.id, targets), eq(projects.status, input.from)))
    .returning({
      id: projects.id,
      endDate: projects.endDate,
      lastChangeAt: sql<Date | null>`(
        select max(${actionLog.occurredAt}) from ${actionLog}
        where ${actionLog.entity} = 'project'
          and ${actionLog.entityId} = ${projects.id}::text
          and ${actionLog.actionType} = 'status_change'
      )`.mapWith(actionLog.occurredAt),
    });
  // 하위 선택이 종료일 없는 행을 거르므로 endDate는 항상 있다 — 타입만 좁힌다.
  return rows.flatMap((row) => (row.endDate === null ? [] : [{ id: row.id, endDate: row.endDate, lastChangeAt: row.lastChangeAt }]));
}
