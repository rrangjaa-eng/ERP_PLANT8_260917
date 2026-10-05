import { and, asc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { approvalInstances, approvalRoutes, approvalSteps, expenses, projects, quoteLines, teams, users, vendors } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 05-03(EXP-01): 지출결의 표. 결재 상태는 approval_instances에 있어 읽기는 문서 종류 키(호출자가 넘긴다)로
// 인스턴스를 왼쪽 조인한다(연차 리포지토리와 같은 결). 삭제된 문서(deleted_at)는 읽지 않는다.

export type ExpenseRow = InferSelectModel<typeof expenses>;
type ProjectRow = InferSelectModel<typeof projects>;
export type ExpenseDraftInsert = Omit<InferInsertModel<typeof expenses>, "id" | "number" | "version" | "createdAt" | "updatedAt">;

// 작성 중 문서 하나 — 같은 줄 · 같은 기안자의 작성 중 문서는 부분 UNIQUE(expenses_line_drafter_draft_uniq)가 하나로 막는다.
// 이미 있으면 아무것도 쓰지 않고 null.
export async function insertDraftIfAbsent(viewer: Viewer, values: ExpenseDraftInsert, tx: DbOrTx = db): Promise<ExpenseRow | null> {
  void viewer;
  const [row] = await tx
    .insert(expenses)
    .values(values)
    .onConflictDoNothing({
      target: [expenses.quoteLineId, expenses.drafterId],
      where: sql`${expenses.number} is null and ${expenses.deletedAt} is null`,
    })
    .returning();
  return row ?? null;
}

// 05-07 팀 비용 첫 저장 — idempotency_key UNIQUE가 두 번 눌러도 하나로 막는다(이미 있으면 아무것도 쓰지 않고 null).
export async function insertTeamDraftIfAbsent(viewer: Viewer, values: ExpenseDraftInsert, tx: DbOrTx = db): Promise<ExpenseRow | null> {
  void viewer;
  const [row] = await tx.insert(expenses).values(values).onConflictDoNothing({ target: expenses.idempotencyKey }).returning();
  return row ?? null;
}

export async function findExpenseByIdempotencyKey(viewer: Viewer, key: string, tx: DbOrTx = db): Promise<ExpenseRow | null> {
  void viewer;
  const [row] = await tx
    .select()
    .from(expenses)
    .where(and(eq(expenses.idempotencyKey, key), isNull(expenses.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function findDraftByLineAndDrafter(
  viewer: Viewer,
  input: { quoteLineId: string; drafterId: string },
  tx: DbOrTx = db,
): Promise<ExpenseRow | null> {
  void viewer;
  const [row] = await tx
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.quoteLineId, input.quoteLineId),
        eq(expenses.drafterId, input.drafterId),
        isNull(expenses.number),
        isNull(expenses.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function findExpenseById(viewer: Viewer, id: string, tx: DbOrTx = db): Promise<ExpenseRow | null> {
  void viewer;
  const [row] = await tx
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), isNull(expenses.deletedAt)))
    .limit(1);
  return row ?? null;
}

// 제출 트랜잭션 안에서만 — 프로젝트 행 잠금 뒤에 부른다(잠금 순서: 프로젝트 → 지출결의 → 카운터).
export async function lockExpenseForUpdate(viewer: Viewer, id: string, tx: DbOrTx): Promise<ExpenseRow | null> {
  void viewer;
  const [row] = await tx
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), isNull(expenses.deletedAt)))
    .for("update");
  return row ?? null;
}

// 그 문서의 결재 인스턴스 상태(없으면 null) — 제출 tx 안 「이미 제출됨」 판정 재료.
export async function findExpenseApprovalStatus(
  viewer: Viewer,
  input: { documentKind: string; documentId: string },
  tx: DbOrTx = db,
): Promise<string | null> {
  void viewer;
  const [row] = await tx
    .select({ status: approvalInstances.status })
    .from(approvalInstances)
    .where(and(eq(approvalInstances.documentKind, input.documentKind), eq(approvalInstances.documentId, input.documentId)))
    .limit(1);
  return row?.status ?? null;
}

export type ExpenseDraftFields = Partial<
  Pick<
    ExpenseRow,
    | "vendorId"
    | "evidenceType"
    | "paymentMethod"
    | "supplyCurrency"
    | "supplyForeignAmount"
    | "supplyFxRate"
    | "supplyAmountKrw"
    | "installment"
    | "scheduledPaymentDate"
    | "note"
    | "teamExpenseKind"
    | "usageDate"
    | "content"
    | "attributedTeamId"
    | "projectId"
    | "quoteLineId"
  >
>;

// 05-09: 다시 제출 갈래 재료 — 그 문서의 결재 인스턴스 id · 상태 · version · 지금 차수(없으면 null). 제출 tx 안에서 지출결의 행 잠금 뒤에 읽는다.
export async function findExpenseApprovalInstance(
  viewer: Viewer,
  input: { documentKind: string; documentId: string },
  tx: DbOrTx = db,
): Promise<{ id: string; status: string; version: number; currentRound: number } | null> {
  void viewer;
  const [row] = await tx
    .select({ id: approvalInstances.id, status: approvalInstances.status, version: approvalInstances.version, currentRound: approvalInstances.currentRound })
    .from(approvalInstances)
    .where(and(eq(approvalInstances.documentKind, input.documentKind), eq(approvalInstances.documentId, input.documentId)))
    .limit(1);
  return row ?? null;
}

// 낙관적 잠금 — 고칠 수 있는 문서(번호 없음 또는 05-09 결재 상태 반려 · 회수)이고 version이 같을 때만 + version + 1 + RETURNING. 0행이면 null(충돌).
export async function updateDraftIfVersion(
  viewer: Viewer,
  input: { id: string; expectedVersion: number; fields: ExpenseDraftFields; updatedBy: string },
  tx: DbOrTx = db,
): Promise<ExpenseRow | null> {
  void viewer;
  const [row] = await tx
    .update(expenses)
    .set({ ...input.fields, updatedBy: input.updatedBy, version: sql`${expenses.version} + 1`, updatedAt: new Date() })
    .where(
      and(
        eq(expenses.id, input.id),
        eq(expenses.version, input.expectedVersion),
        or(
          isNull(expenses.number),
          sql`exists (select 1 from ${approvalInstances} where ${approvalInstances.documentKind} = ${EXPENSE_APPROVAL_KIND} and ${approvalInstances.documentId} = ${expenses.id} and ${approvalInstances.status} in ('rejected', 'withdrawn'))`,
        ),
        isNull(expenses.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

// 05-09 작성 중 삭제 — 기안자 · 번호 없음 · 삭제 안 됨 · version 조건, deleted_at · deleted_by를 채우고 version + 1. 0행이면 null.
export async function softDeleteDraft(
  viewer: Viewer,
  input: { id: string; expectedVersion: number; deletedBy: string },
  tx: DbOrTx = db,
): Promise<ExpenseRow | null> {
  void viewer;
  const now = new Date();
  const [row] = await tx
    .update(expenses)
    .set({ deletedAt: now, deletedBy: input.deletedBy, updatedBy: input.deletedBy, updatedAt: now, version: sql`${expenses.version} + 1` })
    .where(
      and(
        eq(expenses.id, input.id),
        eq(expenses.drafterId, input.deletedBy),
        eq(expenses.version, input.expectedVersion),
        isNull(expenses.number),
        isNull(expenses.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

// 지운 작성 중 문서 하나(복원 재료) — 번호 없음 · deleted_at 있음.
export async function findDeletedDraftById(viewer: Viewer, id: string, tx: DbOrTx = db): Promise<ExpenseRow | null> {
  void viewer;
  const [row] = await tx
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), isNull(expenses.number), isNotNull(expenses.deletedAt)))
    .limit(1);
  return row ?? null;
}

// 05-09 되돌리기(복원) — 기안자의 지운 작성 중 문서만 deleted_at을 비운다. 같은 줄에 그 사이 새 작성 중 문서가 생겼으면
// 부분 UNIQUE(expenses_line_drafter_draft_uniq)가 막는다(호출자가 잡아 그 문서로 보낸다).
export async function restoreDraft(viewer: Viewer, input: { id: string; drafterId: string }, tx: DbOrTx = db): Promise<ExpenseRow | null> {
  void viewer;
  const [row] = await tx
    .update(expenses)
    .set({ deletedAt: null, deletedBy: null, updatedBy: input.drafterId, updatedAt: new Date(), version: sql`${expenses.version} + 1` })
    .where(and(eq(expenses.id, input.id), eq(expenses.drafterId, input.drafterId), isNull(expenses.number), isNotNull(expenses.deletedAt)))
    .returning();
  return row ?? null;
}

export type ExpenseTaxSnapshot = Pick<
  ExpenseRow,
  | "taxRuleKind"
  | "taxRate"
  | "taxRateSettingId"
  | "taxRateEffectiveFrom"
  | "taxCompanyBorneMethod"
  | "taxBasisDate"
  | "vatKrw"
  | "withholdingKrw"
  | "companyBorneKrw"
  | "payableKrw"
>;

export async function saveSubmissionSnapshot(
  viewer: Viewer,
  input: {
    id: string;
    taxSnapshot: ExpenseTaxSnapshot;
    installment: boolean;
    installmentSeq: number | null;
    submittedAt: Date;
    updatedAt?: Date;
    vendorId?: string | null;
  },
  tx: DbOrTx,
): Promise<void> {
  await tx
    .update(expenses)
    .set({
      ...input.taxSnapshot,
      ...(input.vendorId !== undefined ? { vendorId: input.vendorId } : {}),
      installment: input.installment,
      installmentSeq: input.installmentSeq,
      submittedAt: input.submittedAt,
      updatedBy: viewer.id,
      version: sql`${expenses.version} + 1`,
      // 05-09 다시 제출은 처음 제출 시각을 지키고 갱신 시각만 지금이다.
      updatedAt: input.updatedAt ?? input.submittedAt,
    })
    .where(eq(expenses.id, input.id));
}

export async function setExpenseNumber(viewer: Viewer, input: { id: string; number: string }, tx: DbOrTx): Promise<void> {
  void viewer;
  await tx.update(expenses).set({ number: input.number }).where(eq(expenses.id, input.id));
}

export type NumberedLineExpense = Pick<
  ExpenseRow,
  "id" | "number" | "installment" | "supplyCurrency" | "supplyForeignAmount" | "supplyFxRate" | "supplyAmountKrw" | "submittedAt"
>;

// 한 견적 줄의 번호 있는 · 삭제 안 된 문서 — 문 판정 · 회차 상한 재료(제출 순).
export async function listNumberedByLine(viewer: Viewer, lineId: string, tx: DbOrTx = db): Promise<NumberedLineExpense[]> {
  void viewer;
  return tx
    .select({
      id: expenses.id,
      number: expenses.number,
      installment: expenses.installment,
      supplyCurrency: expenses.supplyCurrency,
      supplyForeignAmount: expenses.supplyForeignAmount,
      supplyFxRate: expenses.supplyFxRate,
      supplyAmountKrw: expenses.supplyAmountKrw,
      submittedAt: expenses.submittedAt,
    })
    .from(expenses)
    .where(and(eq(expenses.quoteLineId, lineId), isNotNull(expenses.number), isNull(expenses.deletedAt)))
    .orderBy(asc(expenses.submittedAt), asc(expenses.id));
}

// 견적 줄 표 행 행동 열 재료(05-05) — 줄 여럿의 번호 있는 문서 · 내 작성 중 문서를 한 번씩 읽는다(줄마다 부르지 않는다).
export async function listNumberedByLines(
  viewer: Viewer,
  lineIds: string[],
  tx: DbOrTx = db,
): Promise<(NumberedLineExpense & { quoteLineId: string })[]> {
  void viewer;
  if (lineIds.length === 0) return [];
  const rows = await tx
    .select({
      id: expenses.id,
      quoteLineId: expenses.quoteLineId,
      number: expenses.number,
      installment: expenses.installment,
      supplyCurrency: expenses.supplyCurrency,
      supplyForeignAmount: expenses.supplyForeignAmount,
      supplyFxRate: expenses.supplyFxRate,
      supplyAmountKrw: expenses.supplyAmountKrw,
      submittedAt: expenses.submittedAt,
    })
    .from(expenses)
    .where(and(inArray(expenses.quoteLineId, lineIds), isNotNull(expenses.number), isNull(expenses.deletedAt)))
    .orderBy(asc(expenses.submittedAt), asc(expenses.id));
  return rows.flatMap((row) => (row.quoteLineId ? [{ ...row, quoteLineId: row.quoteLineId }] : []));
}

export type NumberedProjectExpense = { quoteLineId: string; number: string; approvalStatus: string | null };

// D-66 · 줄 파생 상태(05-15) — 한 프로젝트의 번호 있는 · 삭제 안 된 지출결의와 결재 인스턴스 상태를 한 쿼리로(차수 무관, 줄 id별 계보 해석은 호출자).
// 결재 문서 종류 키는 domain/expenses의 EXPENSE_DOCUMENT_KIND와 같은 값이다(domain/quotes가 domain/expenses를 import하지 않도록 이 리포지토리가 안다).
const EXPENSE_APPROVAL_KIND = "expense";

export async function listNumberedByProject(viewer: Viewer, projectId: string, tx: DbOrTx = db): Promise<NumberedProjectExpense[]> {
  void viewer;
  const rows = await tx
    .select({ quoteLineId: expenses.quoteLineId, number: expenses.number, approvalStatus: approvalInstances.status })
    .from(expenses)
    .leftJoin(approvalInstances, and(eq(approvalInstances.documentKind, EXPENSE_APPROVAL_KIND), eq(approvalInstances.documentId, expenses.id)))
    .where(and(eq(expenses.projectId, projectId), isNotNull(expenses.number), isNull(expenses.deletedAt)))
    .orderBy(asc(expenses.submittedAt), asc(expenses.id));
  return rows.flatMap((row) => (row.quoteLineId && row.number ? [{ quoteLineId: row.quoteLineId, number: row.number, approvalStatus: row.approvalStatus }] : []));
}

export async function listDraftsByLines(
  viewer: Viewer,
  input: { lineIds: string[]; drafterId: string },
  tx: DbOrTx = db,
): Promise<{ id: string; quoteLineId: string }[]> {
  void viewer;
  if (input.lineIds.length === 0) return [];
  const rows = await tx
    .select({ id: expenses.id, quoteLineId: expenses.quoteLineId })
    .from(expenses)
    .where(
      and(inArray(expenses.quoteLineId, input.lineIds), eq(expenses.drafterId, input.drafterId), isNull(expenses.number), isNull(expenses.deletedAt)),
    );
  return rows.flatMap((row) => (row.quoteLineId ? [{ id: row.id, quoteLineId: row.quoteLineId }] : []));
}

export type ExpenseSummaryRow = ExpenseRow & {
  drafterName: string;
  projectName: string | null;
  projectNumber: string | null;
  // 견적 표의 줄 번호(차수 안 보관 제외 줄의 표시 순서 1부터) — 문서 화면 · 결재 시트 `견적 줄` 값 앞 조각.
  lineNo: number | null;
  itemName: string | null;
  teamName: string | null;
  vendorName: string | null;
  instanceId: string | null;
  status: string | null;
  approvalVersion: number | null;
};

// 문서 화면 · 결재함 요약 — 프로젝트명 · 항목명 · 팀명 · 거래처명 · 결재 인스턴스를 한 번에.
export async function listExpenseSummaries(
  viewer: Viewer,
  input: { ids: string[]; documentKind: string },
): Promise<ExpenseSummaryRow[]> {
  void viewer;
  if (input.ids.length === 0) return [];
  const rows = await db
    .select({
      expense: expenses,
      drafterName: users.name,
      projectName: projects.name,
      projectNumber: projects.number,
      lineNo: sql<number | null>`case when ${quoteLines.id} is null then null else (select count(*)::int + 1 from quote_lines ql where ql.revision_id = ${quoteLines.revisionId} and ql.archived_at is null and (ql.sort_order < ${quoteLines.sortOrder} or (ql.sort_order = ${quoteLines.sortOrder} and ql.id < ${quoteLines.id}))) end`,
      itemName: quoteLines.itemName,
      teamName: teams.name,
      vendorName: vendors.name,
      instanceId: approvalInstances.id,
      status: approvalInstances.status,
      approvalVersion: approvalInstances.version,
    })
    .from(expenses)
    .innerJoin(users, eq(users.id, expenses.drafterId))
    .leftJoin(projects, eq(projects.id, expenses.projectId))
    .leftJoin(quoteLines, eq(quoteLines.id, expenses.quoteLineId))
    .leftJoin(teams, eq(teams.id, expenses.attributedTeamId))
    .leftJoin(vendors, eq(vendors.id, expenses.vendorId))
    .leftJoin(
      approvalInstances,
      and(eq(approvalInstances.documentKind, input.documentKind), eq(approvalInstances.documentId, expenses.id)),
    )
    .where(and(inArray(expenses.id, input.ids), isNull(expenses.deletedAt)));
  return rows.map((row) => ({
    ...row.expense,
    drafterName: row.drafterName,
    projectName: row.projectName,
    projectNumber: row.projectNumber,
    lineNo: row.lineNo,
    itemName: row.itemName,
    teamName: row.teamName,
    vendorName: row.vendorName,
    instanceId: row.instanceId,
    status: row.status,
    approvalVersion: row.approvalVersion,
  }));
}

// 05-07 견적 줄 골라내기 — 후보 프로젝트(보관 아님 · 주어진 상태). 검색어가 있으면 프로젝트 이름 · 번호 또는 현재 차수가 아닌 것까지 포함해 줄 이름이 맞는
// 프로젝트로 넓힌다(줄은 호출자가 현재 차수만 읽는다). 쓰기 권리(담당 PM · 팀 범위)는 호출자가 거른다 — 이 조회는 상한 limit만 건다.
export async function listPickProjects(
  viewer: Viewer,
  input: { pmUserId: string | null; statuses: readonly string[]; query: string | null; limit: number },
): Promise<ProjectRow[]> {
  void viewer;
  const conditions = [inArray(projects.status, [...input.statuses]), isNull(projects.archivedAt)];
  if (input.pmUserId) conditions.push(eq(projects.pmUserId, input.pmUserId));
  if (input.query) {
    const like = `%${input.query}%`;
    const byLine = sql`exists (select 1 from quote_revisions qr join quote_lines ql on ql.revision_id = qr.id where qr.project_id = ${projects.id} and ql.archived_at is null and ql.item_name ilike ${like})`;
    const match = or(ilike(projects.name, like), ilike(projects.number, like), byLine);
    if (match) conditions.push(match);
  }
  return db
    .select()
    .from(projects)
    .where(and(...conditions))
    .orderBy(asc(projects.name), asc(projects.id))
    .limit(input.limit);
}

// ── 05-08 목록 · 보임 범위 ─────────────────────────────────────────────

// 보임 범위(domain/expenses/access.ts visibleExpenseScope가 만든다) — 이 조건 하나를 목록 · 합계 · 문서 하나 판정이 같이 쓴다.
// 작성 중(번호 없음)은 기안자만. 번호가 있으면 기안자 ∪ 전사 ∪ 문서의 팀(팀 비용 = 귀속 팀, 견적 줄 문서 = 프로젝트 팀)이 teamIds 안 ∪
// 지금 단계 후보(진행 중 인스턴스 한정 목록) ∪ 처리한 사람(결재 단계 표 EXISTS — 차수를 거쳐 인스턴스로, approval_steps(acted_by) 인덱스).
export type ExpenseScope = {
  drafterId: string;
  company: boolean;
  teamIds: string[];
  actedByUserId: string;
  currentHolderInstanceIds: string[];
};

// 목록 그룹 순위 — 작성 중 1 · 반려 · 회수 2 · 결재 중 3 · 승인 4(그 밖의 상태 5는 어느 보기에도 없다).
export const EXPENSE_GROUP_RANKS = { draft: 1, returned: 2, inReview: 3, approved: 4 } as const;

const docTeamId = sql`case when ${expenses.projectId} is not null then ${projects.teamId} else ${expenses.attributedTeamId} end`;
const groupRankExpr = sql<number>`case when ${approvalInstances.id} is null then 1 when ${approvalInstances.status} in ('rejected', 'withdrawn') then 2 when ${approvalInstances.status} in ('submitted', 'in_review') then 3 when ${approvalInstances.status} = 'approved' then 4 else 5 end`;

function scopeCondition(scope: ExpenseScope): SQL {
  const party: SQL[] = [
    sql`exists (select 1 from approval_routes ar join approval_steps st on st.route_id = ar.id where ar.instance_id = ${approvalInstances.id} and st.acted_by = ${scope.actedByUserId})`,
  ];
  if (scope.company) party.push(sql`true`);
  if (scope.teamIds.length > 0) party.push(sql`${docTeamId} in (${sql.join(scope.teamIds.map((id) => sql`${id}::uuid`), sql`, `)})`);
  if (scope.currentHolderInstanceIds.length > 0) party.push(inArray(approvalInstances.id, scope.currentHolderInstanceIds));
  return sql`${expenses.deletedAt} is null and (${expenses.drafterId} = ${scope.drafterId} or (${expenses.number} is not null and (${sql.join(party, sql` or `)})))`;
}

function ranksCondition(ranks: readonly number[]): SQL {
  return sql`(${groupRankExpr}) in (${sql.join(ranks.map((rank) => sql`${rank}`), sql`, `)})`;
}

function instanceJoin(documentKind: string): SQL {
  return sql`${approvalInstances.documentKind} = ${documentKind} and ${approvalInstances.documentId} = ${expenses.id}`;
}

export type ExpenseListRow = ExpenseRow & {
  groupRank: number;
  drafterName: string;
  projectName: string | null;
  itemName: string | null;
  teamName: string | null;
  vendorName: string | null;
  instanceId: string | null;
  status: string | null;
  statusChangedAt: Date | null;
};

// 목록 한 쪽 — 한 쿼리. 보임 범위 · 보기(그룹 순위) 조건의 서브쿼리 q가 group_rank와 그룹별 정렬 키를 열로 만들고, 바깥 쿼리가
// ORDER BY group_rank, <그룹별 CASE 키>, id 한 곳에서 줄 세운 뒤에만 LIMIT · OFFSET으로 자른다(리뷰 Round 2 M2 — PostgreSQL은
// ORDER BY 식 안에서 SELECT 별칭을 읽지 못해 서브쿼리 열로 둔다). 그룹 안: 작성 중 = 고친 시각 ↓ · 반려 · 회수 = 상태 바뀐 시각 ↓ ·
// 결재 중 = 제출 시각 ↑ · 승인 = 지급 예정일 ↑(없음은 끝).
// 05-09(05-08 검토 #6): 승인 뒤 증빙 추가가 인스턴스 updated_at을 올리므로 승인 날짜는 지금 차수 단계의 마지막 처리 시각에서 읽는다
// (반려 · 회수에서는 증빙 변경이 인스턴스를 건드리지 않아 updated_at = 상태 바뀐 시각 그대로).
const statusChangedAtExpr = sql<Date | null>`case when ${approvalInstances.status} = 'approved' then (
  select max(${approvalSteps.actedAt}) from ${approvalSteps}
  inner join ${approvalRoutes} on ${approvalRoutes.id} = ${approvalSteps.routeId}
  where ${approvalRoutes.instanceId} = ${approvalInstances.id} and ${approvalRoutes.round} = ${approvalInstances.currentRound}
) else ${approvalInstances.updatedAt} end`.mapWith(approvalInstances.updatedAt);

export async function listExpensePage(
  viewer: Viewer,
  input: { scope: ExpenseScope; ranks: readonly number[]; documentKind: string; limit: number; offset: number },
): Promise<ExpenseListRow[]> {
  void viewer;
  const q = db
    .select({
      id: expenses.id,
      groupRank: groupRankExpr.as("group_rank"),
      editedKey: sql<Date>`${expenses.updatedAt}`.as("edited_key"),
      statusKey: sql<Date | null>`${approvalInstances.updatedAt}`.as("status_key"),
      submittedKey: sql<Date | null>`${expenses.submittedAt}`.as("submitted_key"),
      payKey: sql<string | null>`${expenses.scheduledPaymentDate}`.as("pay_key"),
    })
    .from(expenses)
    .leftJoin(approvalInstances, instanceJoin(input.documentKind))
    .leftJoin(projects, eq(projects.id, expenses.projectId))
    .where(and(scopeCondition(input.scope), ranksCondition(input.ranks)))
    .as("q");
  const rows = await db
    .select({
      groupRank: q.groupRank,
      expense: expenses,
      drafterName: users.name,
      projectName: projects.name,
      itemName: quoteLines.itemName,
      teamName: teams.name,
      vendorName: vendors.name,
      instanceId: approvalInstances.id,
      status: approvalInstances.status,
      statusChangedAt: statusChangedAtExpr,
    })
    .from(q)
    .innerJoin(expenses, eq(expenses.id, q.id))
    .innerJoin(users, eq(users.id, expenses.drafterId))
    .leftJoin(projects, eq(projects.id, expenses.projectId))
    .leftJoin(quoteLines, eq(quoteLines.id, expenses.quoteLineId))
    .leftJoin(teams, eq(teams.id, expenses.attributedTeamId))
    .leftJoin(vendors, eq(vendors.id, expenses.vendorId))
    .leftJoin(approvalInstances, instanceJoin(input.documentKind))
    .orderBy(
      asc(q.groupRank),
      sql`case when ${q.groupRank} = 1 then ${q.editedKey} end desc`,
      sql`case when ${q.groupRank} = 2 then ${q.statusKey} end desc`,
      sql`case when ${q.groupRank} = 3 then ${q.submittedKey} end asc`,
      sql`case when ${q.groupRank} = 4 then ${q.payKey} end asc nulls last`,
      asc(q.id),
    )
    .limit(input.limit)
    .offset(input.offset);
  return rows.map((row) => ({
    ...row.expense,
    groupRank: Number(row.groupRank),
    drafterName: row.drafterName,
    projectName: row.projectName,
    itemName: row.itemName,
    teamName: row.teamName,
    vendorName: row.vendorName,
    instanceId: row.instanceId,
    status: row.status,
    statusChangedAt: row.statusChangedAt,
  }));
}

export type ExpenseListSummary = { visibleCount: number; viewCount: number; viewSumKrw: number; othersCount: number };

// 같은 범위 조건의 집계 한 번 — 보임 범위 전체 건수(빈 화면 갈래) · 보기 건수 · 보기 공급가액 원화 합(페이지 무관 · 외화는 원화로만) ·
// 남의 문서 건수(기안 열 여부).
export async function summarizeExpenseList(
  viewer: Viewer,
  input: { scope: ExpenseScope; ranks: readonly number[]; documentKind: string },
): Promise<ExpenseListSummary> {
  void viewer;
  const inView = ranksCondition(input.ranks);
  const [row] = await db
    .select({
      visibleCount: sql<number>`count(*)::int`,
      viewCount: sql<number>`(count(*) filter (where ${inView}))::int`,
      viewSumKrw: sql<string>`coalesce(sum(${expenses.supplyAmountKrw}) filter (where ${inView}), 0)::text`,
      othersCount: sql<number>`(count(*) filter (where ${expenses.drafterId} <> ${input.scope.drafterId}))::int`,
    })
    .from(expenses)
    .leftJoin(approvalInstances, instanceJoin(input.documentKind))
    .leftJoin(projects, eq(projects.id, expenses.projectId))
    .where(scopeCondition(input.scope));
  return {
    visibleCount: Number(row?.visibleCount ?? 0),
    viewCount: Number(row?.viewCount ?? 0),
    viewSumKrw: Number(row?.viewSumKrw ?? 0),
    othersCount: Number(row?.othersCount ?? 0),
  };
}

// 문서 하나가 범위 안인지 — 목록과 같은 조건(문서 화면 · 증빙 목록 · 서명 GET의 404 판정).
export async function isExpenseInScope(viewer: Viewer, input: { id: string; scope: ExpenseScope; documentKind: string }): Promise<boolean> {
  void viewer;
  const [row] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .leftJoin(approvalInstances, instanceJoin(input.documentKind))
    .leftJoin(projects, eq(projects.id, expenses.projectId))
    .where(and(eq(expenses.id, input.id), scopeCondition(input.scope)))
    .limit(1);
  return row !== undefined;
}
