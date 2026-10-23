import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, notInArray, or, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import {
  actionLog,
  approvalInstances,
  approvalRoutes,
  approvalSteps,
  corpCardUsages,
  corpCards,
  expensePayments,
  expenses,
  leaveRequests,
  permissionMatrix,
  projects,
  quoteLines,
  quoteRevisions,
  roles,
  settlementApprovals,
  teams,
  users,
} from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 07-10 C-P2-3: 알림 종류가 쓰는 읽기 한 곳 — 종류 판정 쿼리 · 권한 보유자 · 계급 사용자. 결재 · 지급 저장소는 고치지 않고(읽기 import만)
// 여기서 새 읽기를 둔다. viewer는 감사용 자리(SYSTEM_VIEWER)이고, 마지막 인자 tx가 있으면 tick 잠금 연결로 읽는다(R8).

// 활성 사용자 = 보관되지 않았고 퇴직일이 오늘 이후(당일까지 후보)인 사람 — 결재 조직 스냅숏(repositories/org-snapshot.ts)과 같은 판정.
function activeUser(today: string) {
  return and(isNull(users.archivedAt), or(isNull(users.resignationDate), gte(users.resignationDate, today)));
}

// 경영관리 = 지급 처리(expenses.payments) 쓰기 권한을 가진 계급의 활성 사용자(D-702) — 시드 계급이 아니라 권한표로 해석한다.
export async function listPaymentManagerIds(viewer: Viewer, today: string, tx: DbOrTx = db): Promise<string[]> {
  void viewer;
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .innerJoin(roles, and(eq(roles.id, users.roleId), isNull(roles.archivedAt)))
    .innerJoin(
      permissionMatrix,
      and(
        eq(permissionMatrix.roleId, roles.id),
        eq(permissionMatrix.menu, "expenses.payments"),
        eq(permissionMatrix.action, "write"),
        eq(permissionMatrix.allowed, true),
      ),
    )
    .where(activeUser(today))
    .groupBy(users.id)
    .orderBy(users.id);
  return rows.map((row) => row.id);
}

// D-748: 계급 → 회사 전체의 그 계급 활성 사용자 — 보관된 계급 id는 건너뛴다(읽기에서 빠진다). 계급마다 한 쿼리가 아니라 한 번에 읽는다.
export async function listActiveUserIdsByRoles(
  viewer: Viewer,
  roleIds: readonly string[],
  today: string,
  tx: DbOrTx = db,
): Promise<Map<string, string[]>> {
  void viewer;
  const byRole = new Map<string, string[]>();
  if (roleIds.length === 0) return byRole;
  const rows = await tx
    .select({ roleId: roles.id, userId: users.id })
    .from(users)
    .innerJoin(roles, and(eq(roles.id, users.roleId), isNull(roles.archivedAt)))
    .where(and(inArray(roles.id, [...roleIds]), activeUser(today)))
    .orderBy(users.id);
  for (const row of rows) byRole.set(row.roleId, [...(byRole.get(row.roleId) ?? []), row.userId]);
  return byRole;
}

// 알림 문장의 「문서 제목」 — 결재함 문서 칸과 같은 조각(지출결의 = 프로젝트 · 항목, 팀 비용 = 팀 · 내용, 정산 = 프로젝트, 연차 = 시작일). 금액 · 개인정보 없음.
// 키 = `${kind}:${id}`. 문서를 못 찾으면 맵에 넣지 않는다(부르는 쪽이 대체 글자를 쓴다).
export async function listDocumentTitles(
  viewer: Viewer,
  items: ReadonlyArray<{ kind: string; id: string }>,
  tx: DbOrTx = db,
): Promise<Map<string, string>> {
  void viewer;
  const titles = new Map<string, string>();
  const idsOf = (kind: string) => [...new Set(items.filter((item) => item.kind === kind).map((item) => item.id))];

  const expenseIds = idsOf("expense");
  if (expenseIds.length > 0) {
    const rows = await tx
      .select({
        id: expenses.id,
        number: expenses.number,
        content: expenses.content,
        projectName: projects.name,
        itemName: quoteLines.itemName,
        teamName: teams.name,
      })
      .from(expenses)
      .leftJoin(projects, eq(projects.id, expenses.projectId))
      .leftJoin(quoteLines, eq(quoteLines.id, expenses.quoteLineId))
      .leftJoin(teams, eq(teams.id, expenses.attributedTeamId))
      .where(inArray(expenses.id, expenseIds));
    for (const row of rows) {
      const title =
        row.projectName && row.itemName
          ? `${row.projectName} · ${row.itemName}`
          : row.teamName
            ? [row.teamName, row.content].filter(Boolean).join(" · ")
            : (row.number ?? "지출결의");
      titles.set(`expense:${row.id}`, title);
    }
  }
  const settlementIds = idsOf("settlement");
  if (settlementIds.length > 0) {
    const rows = await tx
      .select({ id: settlementApprovals.id, name: projects.name })
      .from(settlementApprovals)
      .innerJoin(projects, eq(projects.id, settlementApprovals.projectId))
      .where(inArray(settlementApprovals.id, settlementIds));
    for (const row of rows) titles.set(`settlement:${row.id}`, row.name);
  }
  const leaveIds = idsOf("leave");
  if (leaveIds.length > 0) {
    const rows = await tx.select({ id: leaveRequests.id, startDate: leaveRequests.startDate }).from(leaveRequests).where(inArray(leaveRequests.id, leaveIds));
    for (const row of rows) titles.set(`leave:${row.id}`, `연차 ${row.startDate.slice(5)}`);
  }
  return titles;
}

export type RouteStepRef = { roleId: string | null; scopeKind: string; scopeTargetId: string | null; isFallback: boolean };

// 문서의 지금 차수 결재선 단계(계급 × 범위) — 2회차부터 더하는 팀장(AQ-04)을 결재 경로의 팀장 단계 보유자로 해석하는 재료.
export async function listCurrentRouteSteps(
  viewer: Viewer,
  documentKind: string,
  documentIds: readonly string[],
  tx: DbOrTx = db,
): Promise<Map<string, RouteStepRef[]>> {
  void viewer;
  const byDocument = new Map<string, RouteStepRef[]>();
  if (documentIds.length === 0) return byDocument;
  const rows = await tx
    .select({
      documentId: approvalInstances.documentId,
      roleId: approvalSteps.roleId,
      scopeKind: approvalSteps.scopeKind,
      scopeTargetId: approvalSteps.scopeTargetId,
      isFallback: approvalSteps.isFallback,
    })
    .from(approvalInstances)
    .innerJoin(approvalRoutes, and(eq(approvalRoutes.instanceId, approvalInstances.id), eq(approvalRoutes.round, approvalInstances.currentRound)))
    .innerJoin(approvalSteps, eq(approvalSteps.routeId, approvalRoutes.id))
    .where(and(eq(approvalInstances.documentKind, documentKind), inArray(approvalInstances.documentId, [...documentIds])))
    .orderBy(approvalSteps.stepIndex);
  for (const row of rows) {
    byDocument.set(row.documentId, [...(byDocument.get(row.documentId) ?? []), { roleId: row.roleId, scopeKind: row.scopeKind, scopeTargetId: row.scopeTargetId, isFallback: row.isFallback }]);
  }
  return byDocument;
}

// 종료 후 지출결의 없음(N4) — 종료일이 [from, to]인 프로젝트 중 보관 · 수주중(bidding) · 미수주(lost) · 완료(completed)가 아니고 지출결의(삭제 아님)가 하나도 없는 것.
// 날짜 창은 사다리가 끝나는 때까지만 읽는다(부르는 쪽이 계산). limit + 1행까지 읽어 넘침을 알린다.
export type EndedProjectRow = { id: string; name: string; pmUserId: string; endDate: string };

export async function listProjectsEndedWithoutExpense(
  viewer: Viewer,
  window: { from: string; to: string },
  limit: number,
  tx: DbOrTx = db,
): Promise<EndedProjectRow[]> {
  void viewer;
  const rows = await tx
    .select({ id: projects.id, name: projects.name, pmUserId: projects.pmUserId, endDate: projects.endDate })
    .from(projects)
    .where(
      and(
        isNull(projects.archivedAt),
        notInArray(projects.status, ["bidding", "lost", "completed"]),
        isNotNull(projects.endDate),
        gte(projects.endDate, window.from),
        lte(projects.endDate, window.to),
        sql`not exists (select 1 from ${expenses} where ${expenses.projectId} = ${projects.id} and ${expenses.deletedAt} is null)`,
      ),
    )
    .orderBy(asc(projects.endDate), asc(projects.id))
    .limit(limit + 1);
  return rows.flatMap((row) => (row.endDate === null ? [] : [{ id: row.id, name: row.name, pmUserId: row.pmUserId, endDate: row.endDate }]));
}

// 증빙 없음 재촉(N7 · prepaid=false) · 선결제 증빙 독촉(N8 · prepaid=true) 후보 — 살아 있는 지급이 있고 지출결의가 삭제 · 종결이 아니며 증빙 면제가 아닌 것.
// 증빙 유무는 여기서 세지 않는다 — domain/evidence/has-evidence.ts ownersWithEvidence 한 판정을 부르는 쪽이 쓴다(같은 판정 두 벌 금지).
export type PaidExpenseRow = { expenseId: string; drafterId: string; payDate: string };

export async function listPaidExpenseCandidates(
  viewer: Viewer,
  input: { prepaid: boolean; payDateFrom: string; payDateTo: string },
  limit: number,
  tx: DbOrTx = db,
): Promise<PaidExpenseRow[]> {
  void viewer;
  return tx
    .select({ expenseId: expenses.id, drafterId: expenses.drafterId, payDate: expensePayments.payDate })
    .from(expensePayments)
    .innerJoin(expenses, eq(expenses.id, expensePayments.expenseId))
    .where(
      and(
        isNull(expensePayments.cancelledAt),
        isNull(expenses.deletedAt),
        isNull(expenses.closedAt),
        eq(expenses.prepaid, input.prepaid),
        gte(expensePayments.payDate, input.payDateFrom),
        lte(expensePayments.payDate, input.payDateTo),
        sql`not exists (select 1 from expense_evidence_reviews r where r.expense_id = ${expenses.id} and r.status = 'waived')`,
      ),
    )
    .orderBy(asc(expensePayments.payDate), asc(expenses.id))
    .limit(limit + 1);
}

// 대리 등록(N9 · D-716 · 사용자 결정 2026-10-22) — since 이후 대리 등록(registered_via = proxy) 카드 사용. 받는 사람은 견적 줄 연결이면 담당 PM,
// 팀 비용 연결이면 카드 보유자(corp_cards.holder_user_id). 보유자가 없는 카드(공용)는 받는 사람이 없어 뺀다. 받는 사람 본인이 등록한 건은 자기 행동이라 뺀다.
export type ProxyRegistrationRow = { id: string; number: string | null; usedOn: string; createdAt: Date; projectName: string; recipientId: string };

export async function listProxyRegistrations(viewer: Viewer, since: Date, limit: number, tx: DbOrTx = db): Promise<ProxyRegistrationRow[]> {
  void viewer;
  const recipientId = sql<string | null>`case when ${corpCardUsages.linkKind} = 'quote_line' then ${projects.pmUserId} else ${corpCards.holderUserId} end`;
  const rows = await tx
    .select({
      id: corpCardUsages.id,
      number: corpCardUsages.number,
      usedOn: corpCardUsages.usedOn,
      createdAt: corpCardUsages.createdAt,
      projectName: sql<string | null>`coalesce(${projects.name}, ${teams.name})`,
      recipientId,
    })
    .from(corpCardUsages)
    .innerJoin(corpCards, eq(corpCards.id, corpCardUsages.corpCardId))
    .leftJoin(quoteLines, eq(quoteLines.id, corpCardUsages.quoteLineId))
    .leftJoin(quoteRevisions, eq(quoteRevisions.id, quoteLines.revisionId))
    .leftJoin(projects, eq(projects.id, quoteRevisions.projectId))
    .leftJoin(teams, eq(teams.id, corpCardUsages.teamId))
    .where(
      and(
        eq(corpCardUsages.registeredVia, "proxy"),
        sql`${recipientId} is not null`,
        sql`${corpCardUsages.registeredBy} <> ${recipientId}`,
        isNull(corpCardUsages.archivedAt),
        sql`${corpCardUsages.createdAt} >= ${since.toISOString()}::timestamp`,
      ),
    )
    .orderBy(asc(corpCardUsages.createdAt), asc(corpCardUsages.id))
    .limit(limit + 1);
  return rows.flatMap((row) => (row.recipientId === null || row.projectName === null ? [] : [{ ...row, recipientId: row.recipientId, projectName: row.projectName }]));
}

// 07-14 결재 결과(N11 · N19 · D-716 · D-744) 사건 — 원천은 행동 로그가 아니라 도메인 표(결재 단계 acted_at)다. since 이후 사건을 사건 id(단계 id)로 돌려준다.
// 최종 승인 = 승인으로 끝난 지출결의 인스턴스의 지금 차수에서 단계 번호가 가장 큰 처리된 승인 단계. 본인 승인(처리자 = 기안자)은 자기 행동이라 뺀다. limit + 1행까지.
export type ExpenseResultEventRow = { expenseId: string; drafterId: string; eventId: string; at: Date };

export async function listExpenseFinalApprovals(viewer: Viewer, since: Date, limit: number, tx: DbOrTx = db): Promise<ExpenseResultEventRow[]> {
  void viewer;
  return tx
    .select({ expenseId: expenses.id, drafterId: approvalInstances.drafterId, eventId: approvalSteps.id, at: sql<Date>`${approvalSteps.actedAt}`.mapWith(approvalSteps.actedAt) })
    .from(approvalSteps)
    .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
    .innerJoin(approvalInstances, and(eq(approvalInstances.id, approvalRoutes.instanceId), eq(approvalInstances.currentRound, approvalRoutes.round)))
    .innerJoin(expenses, eq(expenses.id, approvalInstances.documentId))
    .where(
      and(
        eq(approvalInstances.documentKind, "expense"),
        eq(approvalInstances.status, "approved"),
        isNull(expenses.deletedAt),
        eq(approvalSteps.action, "approved"),
        sql`${approvalSteps.actedBy} <> ${approvalInstances.drafterId}`,
        sql`${approvalSteps.actedAt} >= ${since.toISOString()}::timestamp`,
        // 결재선 순서상 마지막 처리 단계(대표 폴백 행도 차수 끝 번호) — 처리 시각 순서가 아니라 단계 번호로 고른다.
        sql`not exists (select 1 from approval_steps later where later.route_id = ${approvalSteps.routeId} and later.acted_at is not null and later.step_index > ${approvalSteps.stepIndex})`,
      ),
    )
    .orderBy(asc(approvalSteps.actedAt), asc(approvalSteps.id))
    .limit(limit + 1);
}

// 반려 — 지출결의 결재 단계가 반려된 사건(차수 무관 — 반려 뒤 다시 제출해 또 반려되면 각자 한 번). 사건 id = 단계 id.
export async function listExpenseRejections(viewer: Viewer, since: Date, limit: number, tx: DbOrTx = db): Promise<ExpenseResultEventRow[]> {
  void viewer;
  return tx
    .select({ expenseId: expenses.id, drafterId: approvalInstances.drafterId, eventId: approvalSteps.id, at: sql<Date>`${approvalSteps.actedAt}`.mapWith(approvalSteps.actedAt) })
    .from(approvalSteps)
    .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
    .innerJoin(approvalInstances, eq(approvalInstances.id, approvalRoutes.instanceId))
    .innerJoin(expenses, eq(expenses.id, approvalInstances.documentId))
    .where(
      and(
        eq(approvalInstances.documentKind, "expense"),
        isNull(expenses.deletedAt),
        eq(approvalSteps.action, "rejected"),
        sql`${approvalSteps.actedBy} <> ${approvalInstances.drafterId}`,
        sql`${approvalSteps.actedAt} >= ${since.toISOString()}::timestamp`,
      ),
    )
    .orderBy(asc(approvalSteps.actedAt), asc(approvalSteps.id))
    .limit(limit + 1);
}

// 지급 완료(지급 기록 처리 시각) · 지급 취소(취소 시각) — 지급 행 하나가 두 사건을 가질 수 있어 사건 id에 갈래를 붙인다(`paid-{지급 id}` · `cancel-{지급 id}`).
// 기안자 본인이 처리 · 취소한 건은 자기 행동이라 뺀다.
export async function listExpensePaymentEvents(
  viewer: Viewer,
  input: { since: Date; cancelled: boolean },
  limit: number,
  tx: DbOrTx = db,
): Promise<ExpenseResultEventRow[]> {
  void viewer;
  const at = input.cancelled ? expensePayments.cancelledAt : expensePayments.processedAt;
  const actor = input.cancelled ? expensePayments.cancelledBy : expensePayments.processedBy;
  const rows = await tx
    .select({ expenseId: expenses.id, drafterId: expenses.drafterId, paymentId: expensePayments.id, at: sql<Date>`${at}`.mapWith(expensePayments.processedAt) })
    .from(expensePayments)
    .innerJoin(expenses, eq(expenses.id, expensePayments.expenseId))
    .where(and(isNull(expenses.deletedAt), sql`${actor} <> ${expenses.drafterId}`, sql`${at} >= ${input.since.toISOString()}::timestamp`))
    .orderBy(asc(at), asc(expensePayments.id))
    .limit(limit + 1);
  const prefix = input.cancelled ? "cancel" : "paid";
  return rows.map((row) => ({ expenseId: row.expenseId, drafterId: row.drafterId, eventId: `${prefix}-${row.paymentId}`, at: row.at }));
}

// 금액 바뀜(AQ-24) — 기안자가 아닌 사람이 제출 뒤 지출결의 금액을 바꾼 사건. 확인 기록(expense_evidence_reviews)은 문서마다 한 행이라 고칠 때마다
// 덮여 사건마다 키를 못 만든다 → 원천은 그 고침이 같은 tx로 남기는 끌 수 없는 행동 로그 evidence_amount_change(ALWAYS_ON_ACTION_TYPES —
// 관리자가 꺼서 이 갈래가 조용히 비는 일이 없다). 사건 id = `amount-{로그 seq}`.
export async function listExpenseAmountChanges(viewer: Viewer, since: Date, limit: number, tx: DbOrTx = db): Promise<ExpenseResultEventRow[]> {
  void viewer;
  const rows = await tx
    .select({ expenseId: expenses.id, drafterId: expenses.drafterId, seq: actionLog.seq, at: actionLog.occurredAt })
    .from(actionLog)
    .innerJoin(expenses, sql`${expenses.id}::text = ${actionLog.entityId}`)
    .where(
      and(
        eq(actionLog.actionType, "evidence_amount_change"),
        eq(actionLog.entity, "expense"),
        isNull(actionLog.prunedAt),
        isNull(expenses.deletedAt),
        sql`${actionLog.actorId} is distinct from ${expenses.drafterId}`,
        sql`${actionLog.occurredAt} >= ${since.toISOString()}::timestamp`,
      ),
    )
    .orderBy(asc(actionLog.occurredAt), asc(actionLog.seq))
    .limit(limit + 1);
  return rows.map((row) => ({ expenseId: row.expenseId, drafterId: row.drafterId, eventId: `amount-${row.seq}`, at: row.at }));
}

// ── 07-14 재촉 셋(N13) · 임자 없는 증빙 받는 사람(AQ-25) · 착지 링크 재료 ──────────────

// 메뉴 × 쓰기 권한을 가진 계급의 활성 사용자(경영관리 판정 listPaymentManagerIds와 같은 꼴 — 권한표로 해석).
export async function listMenuWriterIds(viewer: Viewer, menu: string, today: string, tx: DbOrTx = db): Promise<string[]> {
  void viewer;
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .innerJoin(roles, and(eq(roles.id, users.roleId), isNull(roles.archivedAt)))
    .innerJoin(
      permissionMatrix,
      and(eq(permissionMatrix.roleId, roles.id), eq(permissionMatrix.menu, menu), eq(permissionMatrix.action, "write"), eq(permissionMatrix.allowed, true)),
    )
    .where(activeUser(today))
    .groupBy(users.id)
    .orderBy(users.id);
  return rows.map((row) => row.id);
}

// 정산 상신 재촉 — 정산 중(settling) · 보관 아님 · 정산 결재가 올라가 있지 않은(제출 · 결재 중 · 승인 아님) 프로젝트 중 종료일이 [from, to]인 것.
export type SettlingProjectRow = { id: string; name: string; pmUserId: string; endDate: string };

export async function listSettlingProjectsNotSubmitted(
  viewer: Viewer,
  window: { from: string; to: string },
  limit: number,
  tx: DbOrTx = db,
): Promise<SettlingProjectRow[]> {
  void viewer;
  const rows = await tx
    .select({ id: projects.id, name: projects.name, pmUserId: projects.pmUserId, endDate: projects.endDate })
    .from(projects)
    .where(
      and(
        isNull(projects.archivedAt),
        eq(projects.status, "settling"),
        isNotNull(projects.endDate),
        gte(projects.endDate, window.from),
        lte(projects.endDate, window.to),
        sql`not exists (select 1 from ${settlementApprovals} sa join ${approvalInstances} i on i.document_kind = 'settlement' and i.document_id = sa.id where sa.project_id = ${projects.id} and i.status in ('submitted', 'in_review', 'approved'))`,
      ),
    )
    .orderBy(asc(projects.endDate), asc(projects.id))
    .limit(limit + 1);
  return rows.flatMap((row) => (row.endDate === null ? [] : [{ id: row.id, name: row.name, pmUserId: row.pmUserId, endDate: row.endDate }]));
}

// 반려 방치 재촉 — 지금도 반려 상태(다시 제출 · 회수 · 종결 · 삭제 아님)인 지출결의의 지금 차수 반려 단계가 [from, before) 사이에 반려된 것.
export type RejectedExpenseRow = { expenseId: string; drafterId: string; stepId: string; rejectedAt: Date };

export async function listRejectedIdleExpenses(
  viewer: Viewer,
  window: { from: Date; before: Date },
  limit: number,
  tx: DbOrTx = db,
): Promise<RejectedExpenseRow[]> {
  void viewer;
  return tx
    .select({ expenseId: expenses.id, drafterId: expenses.drafterId, stepId: approvalSteps.id, rejectedAt: sql<Date>`${approvalSteps.actedAt}`.mapWith(approvalSteps.actedAt) })
    .from(approvalInstances)
    .innerJoin(approvalRoutes, and(eq(approvalRoutes.instanceId, approvalInstances.id), eq(approvalRoutes.round, approvalInstances.currentRound)))
    .innerJoin(approvalSteps, and(eq(approvalSteps.routeId, approvalRoutes.id), eq(approvalSteps.action, "rejected")))
    .innerJoin(expenses, eq(expenses.id, approvalInstances.documentId))
    .where(
      and(
        eq(approvalInstances.documentKind, "expense"),
        eq(approvalInstances.status, "rejected"),
        isNull(expenses.deletedAt),
        isNull(expenses.closedAt),
        sql`${approvalSteps.actedAt} >= ${window.from.toISOString()}::timestamp`,
        sql`${approvalSteps.actedAt} < ${window.before.toISOString()}::timestamp`,
      ),
    )
    .orderBy(asc(approvalSteps.actedAt), asc(approvalSteps.id))
    .limit(limit + 1);
}

// 견적 재촉 — 보관 · 미수주(lost) · 완료(completed)가 아니고 어느 차수에도 살아 있는 견적 줄이 없는 프로젝트 중 행사 시작일이 [from, to]인 것.
// 시작일이 없는 프로젝트(수주중 기간 미정)는 잴 날이 없어 빠진다.
export type QuotelessProjectRow = { id: string; name: string; pmUserId: string; startDate: string };

export async function listProjectsWithoutQuote(
  viewer: Viewer,
  window: { from: string; to: string },
  limit: number,
  tx: DbOrTx = db,
): Promise<QuotelessProjectRow[]> {
  void viewer;
  const rows = await tx
    .select({ id: projects.id, name: projects.name, pmUserId: projects.pmUserId, startDate: projects.startDate })
    .from(projects)
    .where(
      and(
        isNull(projects.archivedAt),
        notInArray(projects.status, ["lost", "completed"]),
        isNotNull(projects.startDate),
        gte(projects.startDate, window.from),
        lte(projects.startDate, window.to),
        sql`not exists (select 1 from ${quoteLines} ql join ${quoteRevisions} qr on qr.id = ql.revision_id where qr.project_id = ${projects.id} and ql.archived_at is null)`,
      ),
    )
    .orderBy(asc(projects.startDate), asc(projects.id))
    .limit(limit + 1);
  return rows.flatMap((row) => (row.startDate === null ? [] : [{ id: row.id, name: row.name, pmUserId: row.pmUserId, startDate: row.startDate }]));
}

// 착지 링크(07-14 N25): 결재 단계 id → 문서(종류 · id · 기안자 · 정산이면 프로젝트). 대표 폴백 자리 키(`{차수 id}:fallback`)는 차수로 찾는다.
export type StepDocumentRow = { key: string; documentKind: string; documentId: string; drafterId: string; projectId: string | null };

export async function listStepDocuments(viewer: Viewer, stepKeys: readonly string[], tx: DbOrTx = db): Promise<StepDocumentRow[]> {
  void viewer;
  if (stepKeys.length === 0) return [];
  const result = await tx.execute<{ key: string; document_kind: string; document_id: string; drafter_id: string; project_id: string | null }>(sql`
    select k.key, i.document_kind, i.document_id::text as document_id, i.drafter_id, sa.project_id::text as project_id
    from unnest(${sql.param([...stepKeys])}::text[]) as k(key)
    join approval_routes r on r.id = (
      case
        when k.key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then (select s.route_id from approval_steps s where s.id = k.key::uuid)
        when k.key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:fallback$'
          then split_part(k.key, ':', 1)::uuid
      end
    )
    join approval_instances i on i.id = r.instance_id
    left join settlement_approvals sa on i.document_kind = 'settlement' and sa.id = i.document_id
  `);
  return result.rows.map((row) => ({ key: row.key, documentKind: row.document_kind, documentId: row.document_id, drafterId: row.drafter_id, projectId: row.project_id }));
}

// 착지 링크: 보관된 프로젝트 id(canOpenProject의 보관 조건 재료).
export async function listArchivedProjectIds(viewer: Viewer, ids: readonly string[], tx: DbOrTx = db): Promise<Set<string>> {
  void viewer;
  if (ids.length === 0) return new Set();
  const rows = await tx.select({ id: projects.id }).from(projects).where(and(inArray(projects.id, [...ids]), isNotNull(projects.archivedAt)));
  return new Set(rows.map((row) => row.id));
}
