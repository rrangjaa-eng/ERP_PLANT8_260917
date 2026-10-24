import { and, desc, eq, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db/client";
import { projectBudgetEntries, projects, quoteRevisions } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import type { RowScope } from "@/domain/permissions/scope-for";
import { rowScopeCondition } from "@/repositories/row-scope";
import { approvalBasis } from "@/repositories/quote-revisions";
import { lineSumsSubquery } from "@/repositories/projects";
import type { DbOrTx } from "@/repositories/document-counters";

// 07-24(W4 · D-729 · D-730) — 예산 줄 저장소. 예산 = 프로젝트의 delta 합(한 번 잡으면 고정)이고, 줄은 쓰기만 한다(고치거나 지우지 않는다).
// 돈 합은 SQL에서 bigint로 더하고 mapWith(Number)로 경계에서 바꾼다(repositories/projects.ts 04-17 C-01과 같은 결).

export type BudgetEntryRow = InferSelectModel<typeof projectBudgetEntries>;
export type BudgetEntryReason = BudgetEntryRow["reason"];

export type BudgetEntryInput = {
  projectId: string;
  reason: BudgetEntryReason;
  baseAmountKrw: number | null;
  // numeric(4,1) — 문자열로 저장한다(예: "70.0"). 직접 수정 줄은 NULL.
  costRatePct: string | null;
  deltaKrw: number;
  memo: string | null;
  // F52 — 새 승인 차수 줄만 그 견적 판 id. 다른 사유 줄은 비운다(NULL).
  quoteRevisionId?: string | null;
};

export async function insertBudgetEntry(viewer: Viewer, input: BudgetEntryInput, tx: DbOrTx): Promise<BudgetEntryRow> {
  const [row] = await tx
    .insert(projectBudgetEntries)
    .values({ ...input, createdBy: viewer.id })
    .returning();
  if (!row) throw new Error("project_budget_entries insert가 행을 반환하지 않았습니다.");
  return row;
}

// F52 — 이 견적 판의 승인 반영 줄이 이미 있나(부르는 쪽 tx가 프로젝트 행을 잠갔다 · 부분 유일 인덱스가 마지막 방어).
export async function hasApprovedRevisionEntry(viewer: Viewer, projectId: string, quoteRevisionId: string, tx: DbOrTx): Promise<boolean> {
  void viewer;
  const [row] = await tx
    .select({ id: projectBudgetEntries.id })
    .from(projectBudgetEntries)
    .where(
      and(
        eq(projectBudgetEntries.projectId, projectId),
        eq(projectBudgetEntries.quoteRevisionId, quoteRevisionId),
        eq(projectBudgetEntries.reason, "new_approved_revision"),
      ),
    )
    .limit(1);
  return row !== undefined;
}

// 게이트 P1 — 이미 예산 줄로 반영된 기준 금액의 최댓값(자동 줄만 — base_amount_krw는 그 사건의 새 기준이고 auto_base_check가 자동 줄에
// NOT NULL을 보장한다 · 직접 수정 줄은 NULL이라 빠진다). 줄이 없으면 0.
export async function maxReflectedBasisKrw(viewer: Viewer, projectId: string, tx: DbOrTx): Promise<number> {
  void viewer;
  const [row] = await tx
    .select({ maxKrw: sql<number>`coalesce(max(${projectBudgetEntries.baseAmountKrw}), 0)::bigint`.mapWith(Number) })
    .from(projectBudgetEntries)
    .where(and(eq(projectBudgetEntries.projectId, projectId), sql`${projectBudgetEntries.reason} <> 'manual'`));
  return row?.maxKrw ?? 0;
}

export async function sumBudgetKrw(viewer: Viewer, projectId: string, tx: DbOrTx = db): Promise<{ sumKrw: number; count: number }> {
  void viewer;
  const [row] = await tx
    .select({
      sumKrw: sql<number>`coalesce(sum(${projectBudgetEntries.deltaKrw}), 0)::bigint`.mapWith(Number),
      count: sql<number>`count(*)::int`,
    })
    .from(projectBudgetEntries)
    .where(eq(projectBudgetEntries.projectId, projectId));
  return { sumKrw: row?.sumKrw ?? 0, count: row?.count ?? 0 };
}

// 기준 금액 재료: PO 금액(원화 — 07-18이 라벨만 바꾼 pre_estimate 칸)과 승인 견적 합계(AQ-39 — 고객 승인이 켜진 가장 최근 차수의
// 승인 기준 합계, repositories/quote-revisions approvalBasis와 같은 식). 어느 것을 쓸지는 도메인(budgetBasisKrw)이 정한다.
export async function findBudgetBasisFacts(
  viewer: Viewer,
  projectId: string,
  tx: DbOrTx = db,
): Promise<{ poAmountKrw: number; approvedTotalKrw: number | null } | null> {
  const [project] = await tx
    .select({ poAmountKrw: projects.preEstimateAmountKrw })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) return null;
  const [approved] = await tx
    .select({ id: quoteRevisions.id })
    .from(quoteRevisions)
    .where(and(eq(quoteRevisions.projectId, projectId), isNotNull(quoteRevisions.customerApprovedAt)))
    .orderBy(desc(quoteRevisions.seq))
    .limit(1);
  const approvedTotalKrw = approved ? (await approvalBasis(viewer, approved.id, tx)).totalKrw : null;
  return { poAmountKrw: project.poAmountKrw, approvedTotalKrw };
}

export type BudgetRowFacts = {
  projectId: string;
  number: string;
  name: string;
  status: string;
  poAmountKrw: number;
  budgetSumKrw: number;
  entryCount: number;
  usedKrw: number;
};

// 예산 현황 한 질의 — 행 범위 · 상태 필터를 지난 보관 안 된 프로젝트마다 예산 합 · 줄 수 · 사용액(D-733: 지금 차수 실행가 합 —
// 프로젝트 손익과 같은 lineSumsSubquery). excludeStatuses가 비면 전체.
export async function listBudgetRowFacts(
  viewer: Viewer,
  input: { scope: RowScope; excludeStatuses: readonly string[] },
  tx: DbOrTx = db,
): Promise<BudgetRowFacts[]> {
  if (input.scope.rows === "none") return [];
  const sums = tx
    .select({
      projectId: projectBudgetEntries.projectId,
      budgetSum: sql<number>`sum(${projectBudgetEntries.deltaKrw})::bigint`.as("budget_sum"),
      entryCount: sql<number>`count(*)::int`.as("entry_count"),
    })
    .from(projectBudgetEntries)
    .groupBy(projectBudgetEntries.projectId)
    .as("budget_sums");
  const lineSums = lineSumsSubquery(viewer);
  const currentRevisionId = sql`(select ${quoteRevisions.id} from ${quoteRevisions} where ${quoteRevisions.projectId} = ${projects.id} order by ${quoteRevisions.seq} desc limit 1)`;
  const conditions = [
    isNull(projects.archivedAt),
    rowScopeCondition(viewer, input.scope, { projectId: projects.id, teamId: projects.teamId, pmUserId: projects.pmUserId }),
  ];
  if (input.excludeStatuses.length > 0) conditions.push(notInArray(projects.status, [...input.excludeStatuses]));
  const rows = await tx
    .select({
      projectId: projects.id,
      number: projects.number,
      name: projects.name,
      status: projects.status,
      poAmountKrw: projects.preEstimateAmountKrw,
      budgetSumKrw: sql<number>`coalesce(${sums.budgetSum}, 0)`.mapWith(Number),
      entryCount: sql<number>`coalesce(${sums.entryCount}, 0)`.mapWith(Number),
      usedKrw: sql<number>`coalesce(${lineSums.executionSum}, 0)`.mapWith(Number),
    })
    .from(projects)
    .leftJoin(sums, eq(sums.projectId, projects.id))
    .leftJoin(lineSums, sql`${lineSums.revisionId} = ${currentRevisionId}`)
    .where(and(...conditions))
    .orderBy(projects.number);
  return rows;
}

// 이력 한 쪽 — 최신 위(만든 시각 · id 내림). cursor는 앞 쪽 마지막 줄의 id이고 비교는 SQL 안에서 그 줄의 (만든 시각, id)로 한다
// (JS Date로 옮기면 마이크로초를 잃는다). limit + 1을 읽어 다음 쪽 유무를 안다.
export async function listBudgetEntriesPage(
  viewer: Viewer,
  projectId: string,
  input: { limit: number; cursorId: string | null },
  tx: DbOrTx = db,
): Promise<{ rows: BudgetEntryRow[]; hasMore: boolean }> {
  void viewer;
  const after = input.cursorId
    ? sql`(${projectBudgetEntries.createdAt}, ${projectBudgetEntries.id}) < (select c.created_at, c.id from ${projectBudgetEntries} c where c.id = ${input.cursorId} and c.project_id = ${projectId})`
    : undefined;
  const rows = await tx
    .select()
    .from(projectBudgetEntries)
    .where(and(eq(projectBudgetEntries.projectId, projectId), after))
    .orderBy(desc(projectBudgetEntries.createdAt), desc(projectBudgetEntries.id))
    .limit(input.limit + 1);
  return { rows: rows.slice(0, input.limit), hasMore: rows.length > input.limit };
}

// 처음 원가율(D-747) 대상 — 예산 줄이 하나도 없는 진행 프로젝트(완료 · 미수주 · 보관 제외) id, 잠금 순서와 같은 id 오름.
export async function listProjectIdsWithoutBudget(viewer: Viewer, excludeStatuses: readonly string[], tx: DbOrTx): Promise<string[]> {
  void viewer;
  const rows = await tx
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        isNull(projects.archivedAt),
        notInArray(projects.status, [...excludeStatuses]),
        sql`not exists (select 1 from ${projectBudgetEntries} where ${projectBudgetEntries.projectId} = ${projects.id})`,
      ),
    )
    .orderBy(projects.id);
  return rows.map((row) => row.id);
}
