import { and, asc, eq, gt, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type DbOrTx } from "@/db/client";
import { approvalInstances, approvalRoutes, approvalSteps, expenses, projects, quoteLines, teams, users, vendors } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import type { RowScope } from "@/domain/permissions/scope-for";
import { rowScopeCondition } from "@/repositories/row-scope";

// 05-03(EXP-01): 지출결의 표. 결재 상태는 approval_instances에 있어 읽기는 문서 종류 키(호출자가 넘긴다)로
// 인스턴스를 왼쪽 조인한다(연차 리포지토리와 같은 결). 삭제된 문서(deleted_at)는 읽지 않는다.

export type ExpenseRow = InferSelectModel<typeof expenses>;
// 06.5 D-6517: 직원 지급처 이름 — 거래처 이름과 따로 둔다(정보 항목이 다르다). 06.5-08 목록 검색이 이 조인을 이어 쓴다(EP2-D5 — 검색 노출은 이 칸의 person.value).
const payeeUsers = alias(users, "payee_users");
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

// 05 /review A7 — 여러 문서의 결재 인스턴스 상태(문서 id → 상태, 인스턴스 없는 문서는 없음)를 한 쿼리로.
export async function findExpenseApprovalStatuses(viewer: Viewer, input: { documentKind: string; documentIds: string[] }): Promise<Map<string, string>> {
  void viewer;
  if (input.documentIds.length === 0) return new Map();
  const rows = await db
    .select({ documentId: approvalInstances.documentId, status: approvalInstances.status })
    .from(approvalInstances)
    .where(and(eq(approvalInstances.documentKind, input.documentKind), inArray(approvalInstances.documentId, input.documentIds)));
  return new Map(rows.map((row) => [row.documentId, row.status]));
}

// 06.5 D-6507(UI-SPEC V4): 지급처(거래처 · 직원)의 계좌 유무 — 은행 칸과 「암호문 있음」 불리언만 읽는다(평문 · 암호문 문자열 · 복호화 없음).
// 행이 없으면 null. 제출 트랜잭션 안에서는 tx로 읽는다(미리보기와 같은 판정).
export async function findPayeeAccountPresence(
  viewer: Viewer,
  payee: { kind: "vendor" | "user"; id: string },
  tx: DbOrTx = db,
): Promise<{ bank: string | null; hasNumber: boolean } | null> {
  void viewer;
  const table = payee.kind === "vendor" ? vendors : users;
  const [row] = await tx
    .select({ bank: table.accountBank, hasNumber: sql<boolean>`${table.accountNumberEncrypted} is not null` })
    .from(table)
    .where(eq(table.id, payee.id))
    .limit(1);
  return row ?? null;
}

// 06.5 D-6517(V12 후보): 직원 지급처 후보 — 보관 아님 ∧ (퇴사일 없음 ∨ 퇴사일 > today), 이름 부분 일치(앞뒤 공백 뗀 검색어) · 이름 → id 순 · 최대 limit행.
// today는 호출자가 넘기는 서울 날짜(SQL current_date 아님). 이름 · 은행 · 「암호문 있음」 불리언만 읽는다(평문 · 이메일 없음).
export async function listPayeeUserCandidates(
  viewer: Viewer,
  input: { query: string; today: string; limit: number },
  tx: DbOrTx = db,
): Promise<{ id: string; name: string; bank: string | null; hasNumber: boolean }[]> {
  void viewer;
  const conditions: (SQL | undefined)[] = [isNull(users.archivedAt), or(isNull(users.resignationDate), gt(users.resignationDate, input.today))];
  const query = input.query.trim();
  if (query !== "") conditions.push(ilike(users.name, `%${query}%`));
  return tx
    .select({ id: users.id, name: users.name, bank: users.accountBank, hasNumber: sql<boolean>`${users.accountNumberEncrypted} is not null` })
    .from(users)
    .where(and(...conditions))
    .orderBy(asc(users.name), asc(users.id))
    .limit(input.limit);
}

export type ExpenseDraftFields = Partial<
  Pick<
    ExpenseRow,
    | "vendorId"
    | "payeeUserId"
    | "evidenceType"
    | "paymentMethod"
    | "supplyCurrency"
    | "supplyForeignAmount"
    | "supplyFxRate"
    | "supplyAmountKrw"
    | "installment"
    | "requestedPaymentDate"
    | "requestedPaymentReason"
    | "note"
    | "teamExpenseKind"
    | "usageDate"
    | "content"
    | "prepaid"
    | "prepaidReason"
    | "recipientCount"
    | "evidenceDate"
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
  },
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
  "id" | "number" | "installment" | "installmentSeq" | "supplyCurrency" | "supplyForeignAmount" | "supplyFxRate" | "supplyAmountKrw" | "submittedAt"
>;

// 견적 줄 표 행 행동 열 재료(05-05) — 줄 여럿의 번호 있는 · 삭제 · 종결 안 된 문서를 한 번에 읽는다(줄마다 부르지 않는다).
// 06-28(C10 · E-1): 종결 문서는 여기서 빠진다 — 줄 문 · 회차 상한 · 사슬 · 계보 읽기의 입력 한 곳이라 호출부가 함께 따른다.
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
      installmentSeq: expenses.installmentSeq,
      supplyCurrency: expenses.supplyCurrency,
      supplyForeignAmount: expenses.supplyForeignAmount,
      supplyFxRate: expenses.supplyFxRate,
      supplyAmountKrw: expenses.supplyAmountKrw,
      submittedAt: expenses.submittedAt,
    })
    .from(expenses)
    .where(and(inArray(expenses.quoteLineId, lineIds), isNotNull(expenses.number), isNull(expenses.deletedAt), isNull(expenses.closedAt)))
    .orderBy(asc(expenses.submittedAt), asc(expenses.id));
  return rows.flatMap((row) => (row.quoteLineId ? [{ ...row, quoteLineId: row.quoteLineId }] : []));
}

// 06-28(X-9) — 줄 여럿의 종결된 분할 문서(번호 있음 · 삭제 안 됨). 회차 번호가 그 회차를 다시 쓰지 않도록 회차 입력에만 더한다
// (줄 문 · 회차 상한 · 남은 실행가는 listNumberedByLines만 본다).
export async function listClosedInstallmentsByLines(
  viewer: Viewer,
  lineIds: string[],
  tx: DbOrTx = db,
): Promise<{ id: string; quoteLineId: string; installmentSeq: number | null }[]> {
  void viewer;
  if (lineIds.length === 0) return [];
  const rows = await tx
    .select({ id: expenses.id, quoteLineId: expenses.quoteLineId, installmentSeq: expenses.installmentSeq })
    .from(expenses)
    .where(
      and(
        inArray(expenses.quoteLineId, lineIds),
        isNotNull(expenses.number),
        isNull(expenses.deletedAt),
        isNotNull(expenses.closedAt),
        eq(expenses.installment, true),
      ),
    );
  return rows.flatMap((row) => (row.quoteLineId ? [{ ...row, quoteLineId: row.quoteLineId }] : []));
}

// 06-28 종결 — 번호 있음 · 삭제 · 종결 안 됨 · version 조건, 종결 칸 셋을 채우고 version + 1. 0행이면 null(경합).
// 06-27 expenses_closed_check가 마지막 방어다.
export async function closeExpenseRow(
  viewer: Viewer,
  input: { id: string; expectedVersion: number; closedBy: string; reason: string; now: Date },
  tx: DbOrTx,
): Promise<{ version: number } | null> {
  void viewer;
  const [row] = await tx
    .update(expenses)
    .set({
      closedAt: input.now,
      closedBy: input.closedBy,
      closedReason: input.reason,
      updatedBy: input.closedBy,
      updatedAt: input.now,
      version: sql`${expenses.version} + 1`,
    })
    .where(
      and(
        eq(expenses.id, input.id),
        eq(expenses.version, input.expectedVersion),
        isNull(expenses.closedAt),
        isNotNull(expenses.number),
        isNull(expenses.deletedAt),
      ),
    )
    .returning({ version: expenses.version });
  return row ?? null;
}

// 06-13: `id`(지급 · 증빙 사실 조회 키) · `closedAt`(종결 문서는 줄 상태 · D-66에서 빠진다 — UC-7)을 더했다.
export type NumberedProjectExpense = { id: string; quoteLineId: string; number: string; approvalStatus: string | null; closedAt: Date | null };

// D-66 · 줄 파생 상태(05-15) — 한 프로젝트의 번호 있는 · 삭제 안 된 지출결의와 결재 인스턴스 상태를 한 쿼리로(차수 무관, 줄 id별 계보 해석은 호출자).
// 결재 문서 종류 키는 domain/expenses의 EXPENSE_DOCUMENT_KIND와 같은 값이다(domain/quotes가 domain/expenses를 import하지 않도록 이 리포지토리가 안다).
const EXPENSE_APPROVAL_KIND = "expense";

export async function listNumberedByProject(viewer: Viewer, projectId: string, tx: DbOrTx = db): Promise<NumberedProjectExpense[]> {
  void viewer;
  const rows = await tx
    .select({ id: expenses.id, quoteLineId: expenses.quoteLineId, number: expenses.number, approvalStatus: approvalInstances.status, closedAt: expenses.closedAt })
    .from(expenses)
    .leftJoin(approvalInstances, and(eq(approvalInstances.documentKind, EXPENSE_APPROVAL_KIND), eq(approvalInstances.documentId, expenses.id)))
    .where(and(eq(expenses.projectId, projectId), isNotNull(expenses.number), isNull(expenses.deletedAt)))
    .orderBy(asc(expenses.submittedAt), asc(expenses.id));
  return rows.flatMap((row) =>
    row.quoteLineId && row.number
      ? [{ id: row.id, quoteLineId: row.quoteLineId, number: row.number, approvalStatus: row.approvalStatus, closedAt: row.closedAt }]
      : [],
  );
}

// 05 /review A8 — 프로젝트별 결재 중(submitted · in_review) 지출결의 수(삭제 안 된 문서) — 정산 최종 승인 막힘 재료. 승인 tx 안에서는 tx로 부른다.
export async function countInReviewByProjects(viewer: Viewer, projectIds: string[], tx: DbOrTx = db): Promise<Map<string, number>> {
  void viewer;
  if (projectIds.length === 0) return new Map();
  const rows = await tx
    .select({ projectId: expenses.projectId, count: sql<number>`count(*)::int` })
    .from(expenses)
    .innerJoin(approvalInstances, and(eq(approvalInstances.documentKind, EXPENSE_APPROVAL_KIND), eq(approvalInstances.documentId, expenses.id)))
    .where(and(inArray(expenses.projectId, projectIds), isNull(expenses.deletedAt), inArray(approvalInstances.status, ["submitted", "in_review"])))
    .groupBy(expenses.projectId);
  return new Map(rows.flatMap((row) => (row.projectId ? [[row.projectId, row.count] as const] : [])));
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
  payeeUserName: string | null;
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
      payeeUserName: payeeUsers.name,
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
    .leftJoin(payeeUsers, eq(payeeUsers.id, expenses.payeeUserId))
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
    payeeUserName: row.payeeUserName,
    instanceId: row.instanceId,
    status: row.status,
    approvalVersion: row.approvalVersion,
  }));
}

// 05-07 견적 줄 골라내기 — 후보 프로젝트(보관 아님 · 주어진 상태). 검색어가 있으면 프로젝트 이름 · 번호 또는 현재 차수가 아닌 것까지 포함해 줄 이름이 맞는
// 프로젝트로 넓힌다(줄은 호출자가 현재 차수만 읽는다). 쓰기 권리는 호출자, 보임은 여기 — 06.2 M10(보는 범위 밖 프로젝트는 후보가 아니다). 상한 limit.
export async function listPickProjects(
  viewer: Viewer,
  input: { pmUserId: string | null; statuses: readonly string[]; query: string | null; limit: number; scope: RowScope },
): Promise<ProjectRow[]> {
  const conditions = [
    inArray(projects.status, [...input.statuses]),
    isNull(projects.archivedAt),
    rowScopeCondition(viewer, input.scope, { projectId: projects.id, teamId: projects.teamId, pmUserId: projects.pmUserId }),
  ];
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
// 작성 중(번호 없음)은 기안자만. 번호가 있으면 기안자 ∪ 처리한 사람(결재 단계 표 EXISTS — 차수를 거쳐 인스턴스로, approval_steps(acted_by) 인덱스) ∪
// 지금 단계 후보(진행 중 인스턴스 한정 목록) ∪ 보는 범위(06.2 번역기 — 문서 팀 · 담당 PM · 참여자. 문서 팀은 팀 비용 = 귀속 팀, 견적 줄 문서 = 프로젝트 팀).
export type ExpenseScope = {
  drafterId: string;
  rowScope: RowScope;
  actedByUserId: string;
  currentHolderInstanceIds: string[];
};

// 목록 그룹 순위 — 작성 중 1 · 반려 · 회수 2 · 결재 중 3 · 승인 4(그 밖의 상태 5는 어느 보기에도 없다).
export const EXPENSE_GROUP_RANKS = { draft: 1, returned: 2, inReview: 3, approved: 4 } as const;

const docTeamId = sql`case when ${expenses.projectId} is not null then ${projects.teamId} else ${expenses.attributedTeamId} end`;
const groupRankExpr = sql<number>`case when ${approvalInstances.id} is null then 1 when ${approvalInstances.status} in ('rejected', 'withdrawn') then 2 when ${approvalInstances.status} in ('submitted', 'in_review') then 3 when ${approvalInstances.status} = 'approved' then 4 else 5 end`;

// 세 질의(목록 · 합계 · 문서 하나)는 모두 projects를 left join한다 — docTeamId · 담당 PM 열이 그 조인을 읽는다.
function scopeCondition(viewer: Viewer, scope: ExpenseScope): SQL {
  const party: SQL[] = [
    sql`exists (select 1 from approval_routes ar join approval_steps st on st.route_id = ar.id where ar.instance_id = ${approvalInstances.id} and st.acted_by = ${scope.actedByUserId})`,
  ];
  party.push(rowScopeCondition(viewer, scope.rowScope, { projectId: expenses.projectId, teamId: docTeamId, pmUserId: projects.pmUserId }));
  if (scope.currentHolderInstanceIds.length > 0) party.push(inArray(approvalInstances.id, scope.currentHolderInstanceIds));
  return sql`${expenses.deletedAt} is null and (${expenses.drafterId} = ${scope.drafterId} or (${expenses.number} is not null and (${sql.join(party, sql` or `)})))`;
}

function ranksCondition(ranks: readonly number[]): SQL {
  return sql`(${groupRankExpr}) in (${sql.join(ranks.map((rank) => sql`${rank}`), sql`, `)})`;
}

function instanceJoin(documentKind: string): SQL {
  return sql`${approvalInstances.documentKind} = ${documentKind} and ${approvalInstances.documentId} = ${expenses.id}`;
}

// 06.5 D-6508(G20 · EP1-13 · EP2-D5 · EP3-D5): 목록 검색 조건 — 보기가 고른 열(fields)만 OR로 잇는다. 열을 고르는 것은 도메인(searchFieldsFor — 그 보기 DTO의 열 ×
// 열마다 정보 항목)이고 여기는 받은 열을 그대로 쓴다. 이름 열은 조인이 아니라 `exists`(byLine 선례) — 바깥 질의의 조인과 무관해 목록 · 합계 · 지급 대상 · 지급 완료가
// 한 함수를 쓰고 행이 겹치지 않는다. 값은 모두 바인딩 매개변수(T-06.5-63). 받은 열이 없으면 거짓(숨은 값을 건수로 떠보지 못하게 — 범위 · 노출 판정은 건드리지 않는다).
export type ExpenseSearchField = "number" | "content" | "projectName" | "lineItem" | "vendorName" | "drafterName" | "payeeUserName";

export function expenseSearchCondition(viewer: Viewer, query: string, fields: readonly ExpenseSearchField[]): SQL {
  void viewer; // 4계층 규약(plant8/repository-viewer-param) 자리 — 범위 판정은 호출 쪽 scopeCondition이 한다.
  // Codex P2: 사용자 글자의 %·_를 와일드카드가 아니라 글자로 찾는다(LIKE 기본 이스케이프는 백슬래시).
  const like = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  const parts: Record<ExpenseSearchField, SQL> = {
    number: sql`${expenses.number} ilike ${like}`,
    // 내용은 팀 비용 행(프로젝트 · 견적 줄 없음)에서만 화면에 보인다 — 보이는 글자만 찾는다(/review P3-1).
    content: sql`(${expenses.projectId} is null and ${expenses.quoteLineId} is null and ${expenses.content} ilike ${like})`,
    projectName: sql`exists (select 1 from projects sp where sp.id = ${expenses.projectId} and sp.name ilike ${like})`,
    lineItem: sql`exists (select 1 from quote_lines sl where sl.id = ${expenses.quoteLineId} and sl.item_name ilike ${like})`,
    vendorName: sql`exists (select 1 from vendors sv where sv.id = ${expenses.vendorId} and sv.name ilike ${like})`,
    drafterName: sql`exists (select 1 from users sd where sd.id = ${expenses.drafterId} and sd.name ilike ${like})`,
    payeeUserName: sql`exists (select 1 from users su where su.id = ${expenses.payeeUserId} and su.name ilike ${like})`,
  };
  const picked = fields.map((field) => parts[field]);
  return picked.length === 0 ? sql`false` : sql`(${sql.join(picked, sql` or `)})`;
}

export type ExpenseSearch = { query: string; fields: readonly ExpenseSearchField[] };

// 07.1-09(PF4 · C-36 · E-P1-08): 목록 거르개 — 팀(문서의 팀 docTeamId, 행 범위와 같은 칸 · 기안자 발령 팀 아님) · 월(문서 등록 시각의 서울 월) · 내 것(기안자).
// 검색어와 같은 자리에 AND로 걸린다(합계 FILTER · 쪽 · 승인 정렬 공용). scopeCondition에는 섞지 않는다 — 문서 하나 판정(isExpenseInScope)이 같이 쓰므로 거름이 보임을 바꾸면 안 된다.
export type ExpenseListFilter = { teamId: string | null; month: string | null; drafterId: string | null };

// created_at은 시간대 없는 UTC 값 — UTC로 읽은 뒤 서울로 한 번 더 바꿔야 서울 날짜다(`at time zone 'Asia/Seoul'` 한 번이면 9시간 틀린다 · projects.ts CREATED_ON_KST 선례).
const createdMonthKst = sql`to_char((${expenses.createdAt} at time zone 'UTC') at time zone 'Asia/Seoul', 'YYYY-MM')`;

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function expenseListFilterCondition(viewer: Viewer, filter: ExpenseListFilter): SQL | null {
  void viewer; // 4계층 규약 자리 — 범위 판정은 호출 쪽 scopeCondition이 한다.
  const parts: SQL[] = [];
  // 팀 — 문서의 팀(프로젝트가 있으면 프로젝트 팀, 없으면 귀속 팀)을 칸 그대로 비교한다(칸에 ::text 를 씌우면 인덱스를 못 탄다). uuid 모양이 아닌 값은 Postgres 형식 오류(500) 대신 결과 0.
  if (filter.teamId !== null) {
    parts.push(
      UUID_SHAPE.test(filter.teamId)
        ? sql`((${expenses.projectId} is not null and ${projects.teamId} = ${filter.teamId}::uuid) or (${expenses.projectId} is null and ${expenses.attributedTeamId} = ${filter.teamId}::uuid))`
        : sql`false`,
    );
  }
  // 월 — 서울 월의 시작·끝을 UTC 값으로 한 번 바꿔 칸에는 범위 비교만 건다(월 글자를 칸마다 만들지 않는다 · domain이 YYYY-MM 모양을 이미 거른다).
  if (filter.month !== null) {
    const startUtc = sql`(((${filter.month}::text || '-01')::timestamp) at time zone 'Asia/Seoul') at time zone 'UTC'`;
    const endUtc = sql`(((${filter.month}::text || '-01')::timestamp + interval '1 month') at time zone 'Asia/Seoul') at time zone 'UTC'`;
    parts.push(sql`(${expenses.createdAt} >= ${startUtc} and ${expenses.createdAt} < ${endUtc})`);
  }
  if (filter.drafterId !== null) parts.push(sql`${expenses.drafterId} = ${filter.drafterId}`);
  return parts.length === 0 ? null : sql`(${sql.join(parts, sql` and `)})`;
}

/** 월 select 옵션 — 보는 범위 안 문서의 등록 월(서울), 최신 먼저. */
export async function listExpenseMonths(viewer: Viewer, input: { scope: ExpenseScope; documentKind: string }): Promise<string[]> {
  const rows = await db
    .selectDistinct({ month: createdMonthKst.mapWith(String) })
    .from(expenses)
    .leftJoin(approvalInstances, instanceJoin(input.documentKind))
    .leftJoin(projects, eq(projects.id, expenses.projectId))
    .where(scopeCondition(viewer, input.scope))
    .orderBy(sql`1 desc`);
  return rows.map((row) => row.month);
}

export type ExpenseListRow = ExpenseRow & {
  groupRank: number;
  drafterName: string;
  projectName: string | null;
  itemName: string | null;
  teamName: string | null;
  vendorName: string | null;
  payeeUserName: string | null;
  instanceId: string | null;
  status: string | null;
  statusChangedAt: Date | null;
};

// 목록 한 쪽 — 한 쿼리. 보임 범위 · 보기(그룹 순위) 조건의 서브쿼리 q가 group_rank와 그룹별 정렬 키를 열로 만들고, 바깥 쿼리가
// ORDER BY group_rank, <그룹별 CASE 키>, id 한 곳에서 줄 세운 뒤에만 LIMIT · OFFSET으로 자른다(리뷰 Round 2 M2 — PostgreSQL은
// ORDER BY 식 안에서 SELECT 별칭을 읽지 못해 서브쿼리 열로 둔다). 그룹 안: 작성 중 = 고친 시각 ↓ · 반려 · 회수 = 상태 바뀐 시각 ↓ ·
// 결재 중 = 제출 시각 ↑ · 승인 = 미지급 건의 유효 예정일 순서(approvedOrder 위치 — 07-06) → 지급 끝난 건의 실제 지급일 ↑ → 번호.
// 05-09(05-08 검토 #6): 승인 뒤 증빙 추가가 인스턴스 updated_at을 올리므로 승인 날짜는 지금 차수 단계의 마지막 처리 시각에서 읽는다
// (반려 · 회수에서는 증빙 변경이 인스턴스를 건드리지 않아 updated_at = 상태 바뀐 시각 그대로).
// 07-01: 승인된 인스턴스의 지금 차수 승인 단계는 전부 action = 'approved'라 필터를 더해도 statusChangedAtExpr 결과는 같다.
const currentRoundApprovedAtExpr = sql`(
  select max(${approvalSteps.actedAt}) from ${approvalSteps}
  inner join ${approvalRoutes} on ${approvalRoutes.id} = ${approvalSteps.routeId}
  where ${approvalRoutes.instanceId} = ${approvalInstances.id} and ${approvalRoutes.round} = ${approvalInstances.currentRound} and ${approvalSteps.action} = 'approved'
)`;
const statusChangedAtExpr = sql<Date | null>`case when ${approvalInstances.status} = 'approved' then ${currentRoundApprovedAtExpr} else ${approvalInstances.updatedAt} end`.mapWith(
  approvalInstances.updatedAt,
);

// 07-01(D-703 · P4): 결재 마감 판정의 승인 시각 = 지금 차수 승인 단계 acted_at(서버 시각)의 최댓값. 인스턴스 updated_at은 승인 뒤 증빙 변경으로
// 올라가므로 쓰지 않는다. 인스턴스가 approved가 아니면 null(결재 중). 부르는 쪽이 이미 보임 범위로 거른 id만 넘긴다.
export async function listCurrentRoundApprovedAt(
  viewer: Viewer,
  input: { documentKind: string; expenseIds: readonly string[] },
  tx: DbOrTx = db,
): Promise<Map<string, Date | null>> {
  void viewer;
  if (input.expenseIds.length === 0) return new Map();
  const rows = await tx
    .select({
      id: expenses.id,
      approvedAt: sql<Date | null>`case when ${approvalInstances.status} = 'approved' then ${currentRoundApprovedAtExpr} end`.mapWith(approvalInstances.updatedAt),
    })
    .from(expenses)
    .leftJoin(approvalInstances, instanceJoin(input.documentKind))
    .where(inArray(expenses.id, [...input.expenseIds]));
  return new Map(rows.map((row) => [row.id, row.approvedAt]));
}

// 07-06(AQ-01 · B-P2-1): 승인 묶음 사전 정렬 재료 — 보임 범위 · 검색이 같은 미지급 승인 건(살아 있는 지급 없음)의 최소 칸만. 지급 끝난 승인 건은
// 읽지 않는다(그 뒤에 SQL 키로 선다). 도메인이 07-01 로더로 유효 예정일을 셈해 순서 배열을 listExpensePage에 넘긴다(날짜 규칙을 SQL로 다시 쓰지 않는다).
export type UnpaidApprovedScheduleSource = Pick<ExpenseRow, "id" | "number" | "submittedAt" | "scheduledPaymentDate" | "vendorId">;

const liveExpensePaymentExists = sql`exists (select 1 from expense_payments ep where ep.expense_id = ${expenses.id} and ep.cancelled_at is null)`;

export async function listUnpaidApprovedScheduleSources(
  viewer: Viewer,
  input: { scope: ExpenseScope; documentKind: string; search?: ExpenseSearch; filter?: ExpenseListFilter },
): Promise<UnpaidApprovedScheduleSource[]> {
  return db
    .select({ id: expenses.id, number: expenses.number, submittedAt: expenses.submittedAt, scheduledPaymentDate: expenses.scheduledPaymentDate, vendorId: expenses.vendorId })
    .from(expenses)
    .leftJoin(approvalInstances, instanceJoin(input.documentKind))
    .leftJoin(projects, eq(projects.id, expenses.projectId))
    .where(
      and(
        scopeCondition(viewer, input.scope),
        ranksCondition([EXPENSE_GROUP_RANKS.approved]),
        sql`not ${liveExpensePaymentExists}`,
        input.search ? expenseSearchCondition(viewer, input.search.query, input.search.fields) : undefined,
        input.filter ? (expenseListFilterCondition(viewer, input.filter) ?? undefined) : undefined,
      ),
    );
}

export async function listExpensePage(
  viewer: Viewer,
  // approvedOrder — 미지급 승인 건 id의 유효 예정일 순서(도메인 사전 정렬). 배열 밖 승인 건(지급 끝남)은 그 뒤 실제 지급일 ↑ → 번호 → id.
  input: { scope: ExpenseScope; ranks: readonly number[]; documentKind: string; limit: number; offset: number; search?: ExpenseSearch; filter?: ExpenseListFilter; approvedOrder?: readonly string[] },
): Promise<ExpenseListRow[]> {
  const q = db
    .select({
      id: expenses.id,
      groupRank: groupRankExpr.as("group_rank"),
      editedKey: sql<Date>`${expenses.updatedAt}`.as("edited_key"),
      statusKey: sql<Date | null>`${approvalInstances.updatedAt}`.as("status_key"),
      submittedKey: sql<Date | null>`${expenses.submittedAt}`.as("submitted_key"),
      payKey: sql<number | null>`array_position(string_to_array(${(input.approvedOrder ?? []).join(",")}, ',')::uuid[], ${expenses.id})`.as("pay_key"),
      paidKey: sql<string | null>`(select min(ep.pay_date) from expense_payments ep where ep.expense_id = ${expenses.id} and ep.cancelled_at is null)`.as("paid_key"),
      numberKey: sql<string | null>`${expenses.number}`.as("number_key"),
    })
    .from(expenses)
    .leftJoin(approvalInstances, instanceJoin(input.documentKind))
    .leftJoin(projects, eq(projects.id, expenses.projectId))
    // 06.5 D-6508: 검색은 범위 · 보기와 AND로 안쪽 서브쿼리 WHERE에 — LIMIT 전에 걸린다.
    .where(
      and(
        scopeCondition(viewer, input.scope),
        ranksCondition(input.ranks),
        input.search ? expenseSearchCondition(viewer, input.search.query, input.search.fields) : undefined,
        input.filter ? (expenseListFilterCondition(viewer, input.filter) ?? undefined) : undefined,
      ),
    )
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
      payeeUserName: payeeUsers.name,
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
    .leftJoin(payeeUsers, eq(payeeUsers.id, expenses.payeeUserId))
    .leftJoin(approvalInstances, instanceJoin(input.documentKind))
    .orderBy(
      asc(q.groupRank),
      sql`case when ${q.groupRank} = 1 then ${q.editedKey} end desc`,
      sql`case when ${q.groupRank} = 2 then ${q.statusKey} end desc`,
      sql`case when ${q.groupRank} = 3 then ${q.submittedKey} end asc`,
      sql`case when ${q.groupRank} = 4 then ${q.payKey} end asc nulls last`,
      sql`case when ${q.groupRank} = 4 then ${q.paidKey} end asc nulls last`,
      sql`case when ${q.groupRank} = 4 then ${q.numberKey} end asc`,
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
    payeeUserName: row.payeeUserName,
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
  input: { scope: ExpenseScope; ranks: readonly number[]; documentKind: string; search?: ExpenseSearch; filter?: ExpenseListFilter },
): Promise<ExpenseListSummary> {
  // 06.5 D-6508(G20 · EP1-13 · EP2-D5): 검색은 보기 건수 · 합계(FILTER)에만 — 범위 전체 건수(visibleCount, 빈 화면 판정)와 남의 문서 수(othersCount, 기안 열)는
  // 검색과 무관하다. 검색을 바깥 WHERE에 넣으면 0건 검색에서 필터 줄이 사라진다.
  const inRanks = ranksCondition(input.ranks);
  // 07.1-09: 팀 · 월 · 내 것 거름도 같은 자리(보기 FILTER)에만 — 범위 전체 건수와 남의 문서 수에는 걸지 않아 0건 필터에서도 필터 줄 · 빈 결과 문구가 남는다.
  const searchPart = input.search ? sql`${inRanks} and ${expenseSearchCondition(viewer, input.search.query, input.search.fields)}` : inRanks;
  const filterPart = input.filter ? expenseListFilterCondition(viewer, input.filter) : null;
  const inView = filterPart ? sql`${searchPart} and ${filterPart}` : searchPart;
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
    .where(scopeCondition(viewer, input.scope));
  return {
    visibleCount: Number(row?.visibleCount ?? 0),
    viewCount: Number(row?.viewCount ?? 0),
    viewSumKrw: Number(row?.viewSumKrw ?? 0),
    othersCount: Number(row?.othersCount ?? 0),
  };
}

// 문서 하나가 범위 안인지 — 목록과 같은 조건(문서 화면 · 증빙 목록 · 서명 GET의 404 판정).
export async function isExpenseInScope(viewer: Viewer, input: { id: string; scope: ExpenseScope; documentKind: string }): Promise<boolean> {
  const [row] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .leftJoin(approvalInstances, instanceJoin(input.documentKind))
    .leftJoin(projects, eq(projects.id, expenses.projectId))
    .where(and(eq(expenses.id, input.id), scopeCondition(viewer, input.scope)))
    .limit(1);
  return row !== undefined;
}

// 받은 id 가운데 범위 안인 것 — 문서 하나와 같은 scopeCondition을 한 질의로(지급 대상 visibleRows, 06.2-08 검토 I-1 — 행마다 묻지 않는다).
export async function listExpenseIdsInScope(
  viewer: Viewer,
  input: { ids: readonly string[]; scope: ExpenseScope; documentKind: string },
  tx: DbOrTx = db,
): Promise<Set<string>> {
  if (input.ids.length === 0) return new Set();
  const rows = await tx
    .select({ id: expenses.id })
    .from(expenses)
    .leftJoin(approvalInstances, instanceJoin(input.documentKind))
    .leftJoin(projects, eq(projects.id, expenses.projectId))
    .where(and(inArray(expenses.id, [...input.ids]), scopeCondition(viewer, input.scope)));
  return new Set(rows.map((row) => row.id));
}

// ── 06.1-06 증빙 기록 붙이기 후보(E34 · RP-5 · RP-8) ─────────────────────────────────────────────

/** 후보 한 질의의 상한 — 21째 행은 넘침 판정(PickDialog `truncated`)에만 쓰고 버린다(Round 2 P2-C1). */
export const CANDIDATE_LIMIT = 20;

export type AttachCandidateRecord = { evidenceType: string; businessNoDigits: string | null; supplyKrw: number; issuedOn: string };

export type ExpenseAttachCandidateRow = {
  id: string;
  number: string;
  drafterId: string;
  drafterName: string;
  usageDate: string | null;
  status: string | null;
  instanceId: string | null;
  instanceVersion: number | null;
  supplyAmountKrw: number | null;
  paymentMethod: string | null;
  evidenceType: string | null;
  businessNo: string | null;
  projectId: string | null;
  projectCompleted: boolean;
  updatedAt: Date;
  version: number;
  /** 취소 안 된 지급 행 있음 — findLivePayment와 같은 조건(카드 R1). */
  paid: boolean;
  pairOk: boolean;
  score: number;
};

// 목록과 같은 보임 범위(scopeCondition — 06.2 rowScopeCondition 포함) ∧ 번호 있음(임시 문서는 작성자만 본다 — RP-8) ∧ 종결 아님 ∧ 검색어
// (문서 번호 · 작성자 이름 · 지급처 이름 — 바인딩). 순위도 여기서(E34): 짝 맞음(G3 — 지급 방식이 짝 설정에 없거나 이 기록 종류와 짝) →
// 점수 CASE 합(종류 4 · 사업자번호 숫자 2 — 기록이 빈 값이면 0 · 공급가액 1) 내림 → 사용일과 기록 날짜 차 오름(없음 맨 뒤) → id.
// 권리 막힘(결재 중 · 지급 뒤)은 SQL로 옮기지 않는다 — 부르는 domain이 행마다 판정한다.
export async function listExpenseAttachCandidates(
  viewer: Viewer,
  input: {
    scope: ExpenseScope;
    documentKind: string;
    record: AttachCandidateRecord;
    query: string | null;
    /** 짝 설정에 짝이 하나라도 있는 지급 방식 코드(그 밖의 방식은 검사 없음). */
    constrainedMethodCodes: readonly string[];
    /** 그 가운데 이 기록 종류와 짝인 지급 방식 코드. */
    pairedMethodCodes: readonly string[];
  },
  tx: DbOrTx = db,
): Promise<ExpenseAttachCandidateRow[]> {
  const digits = input.record.businessNoDigits && input.record.businessNoDigits !== "" ? input.record.businessNoDigits : null;
  const pairOk = sql<boolean>`(${expenses.paymentMethod} is null or not (${expenses.paymentMethod} = any(${sql.param([...input.constrainedMethodCodes])}::text[])) or ${expenses.paymentMethod} = any(${sql.param([...input.pairedMethodCodes])}::text[]))`;
  const score = sql<number>`((case when ${expenses.evidenceType} = ${input.record.evidenceType} then 4 else 0 end) + (case when ${digits}::text is not null and regexp_replace(coalesce(${vendors.businessNo}, ''), '[^0-9]', '', 'g') = ${digits}::text then 2 else 0 end) + (case when ${expenses.supplyAmountKrw} = ${input.record.supplyKrw} then 1 else 0 end))`;
  const dayGap = sql`abs(${expenses.usageDate} - ${input.record.issuedOn}::date)`;
  const paid = sql<boolean>`exists (select 1 from expense_payments ep where ep.expense_id = ${expenses.id} and ep.cancelled_at is null)`;
  const conditions: SQL[] = [scopeCondition(viewer, input.scope), isNotNull(expenses.number), isNull(expenses.closedAt)];
  if (input.query) {
    const like = `%${input.query.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(sql`(${expenses.number} ilike ${like} or ${users.name} ilike ${like} or ${vendors.name} ilike ${like} or exists (select 1 from users pu where pu.id = ${expenses.payeeUserId} and pu.name ilike ${like}))`);
  }
  const rows = await tx
    .select({
      id: expenses.id,
      number: expenses.number,
      drafterId: expenses.drafterId,
      drafterName: users.name,
      usageDate: expenses.usageDate,
      status: approvalInstances.status,
      instanceId: approvalInstances.id,
      instanceVersion: approvalInstances.version,
      supplyAmountKrw: expenses.supplyAmountKrw,
      paymentMethod: expenses.paymentMethod,
      evidenceType: expenses.evidenceType,
      businessNo: vendors.businessNo,
      projectId: expenses.projectId,
      projectCompleted: sql<boolean>`coalesce(${projects.status} = 'completed', false)`,
      updatedAt: expenses.updatedAt,
      version: expenses.version,
      paid,
      pairOk,
      score,
    })
    .from(expenses)
    .innerJoin(users, eq(users.id, expenses.drafterId))
    .leftJoin(approvalInstances, instanceJoin(input.documentKind))
    .leftJoin(projects, eq(projects.id, expenses.projectId))
    .leftJoin(vendors, eq(vendors.id, expenses.vendorId))
    .where(and(...conditions))
    .orderBy(sql`case when ${pairOk} then 0 else 1 end`, sql`${score} desc`, sql`${dayGap} asc nulls last`, asc(expenses.id))
    .limit(CANDIDATE_LIMIT + 1);
  return rows.map((row) => ({ ...row, number: row.number ?? "", score: Number(row.score) }));
}

// 쪽 단위 존재 조회 — 그 사람이 볼 수 있는 번호 있는 · 종결 아닌 지출결의가 하나라도 있나(S2 `붙이기` 존재 판정 — eng B-P3).
export async function hasExpenseAttachTarget(viewer: Viewer, input: { scope: ExpenseScope; documentKind: string }): Promise<boolean> {
  const [row] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .leftJoin(approvalInstances, instanceJoin(input.documentKind))
    .leftJoin(projects, eq(projects.id, expenses.projectId))
    .where(and(scopeCondition(viewer, input.scope), isNotNull(expenses.number), isNull(expenses.closedAt)))
    .limit(1);
  return row !== undefined;
}
