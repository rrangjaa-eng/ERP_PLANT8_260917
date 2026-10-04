import { and, asc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { approvalInstances, expenses, projects, quoteLines, teams, users, vendors } from "@/db/schema";
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

// 낙관적 잠금 — 작성 중(번호 없음)이고 version이 같을 때만 + version + 1 + RETURNING. 0행이면 null(충돌).
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
        isNull(expenses.number),
        isNull(expenses.deletedAt),
      ),
    )
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
  input: { id: string; taxSnapshot: ExpenseTaxSnapshot; installment: boolean; installmentSeq: number | null; submittedAt: Date },
  tx: DbOrTx,
): Promise<void> {
  await tx
    .update(expenses)
    .set({
      ...input.taxSnapshot,
      installment: input.installment,
      installmentSeq: input.installmentSeq,
      submittedAt: input.submittedAt,
      updatedBy: viewer.id,
      version: sql`${expenses.version} + 1`,
      updatedAt: input.submittedAt,
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
