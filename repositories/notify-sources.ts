import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, ne, notInArray, or, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import {
  approvalInstances,
  approvalRoutes,
  approvalSteps,
  corpCardUsages,
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

// 종료 후 지출결의 없음(N4) — 종료일이 [from, to]인 프로젝트 중 보관 · 미수주(lost) · 완료(completed)가 아니고 지출결의(삭제 아님)가 하나도 없는 것.
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
        notInArray(projects.status, ["lost", "completed"]),
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

// 대리 등록(N9 · D-716) — since 이후 대리 등록(registered_via = proxy) 카드 사용 중 견적 줄에 묶인 것(담당 PM이 있는 것). 팀 비용 연결은 담당 PM이 없어 뺀다. 담당 PM 본인이 등록한 건은 자기 행동이라 뺀다.
export type ProxyRegistrationRow = { id: string; number: string | null; usedOn: string; createdAt: Date; projectName: string; pmUserId: string };

export async function listProxyRegistrations(viewer: Viewer, since: Date, limit: number, tx: DbOrTx = db): Promise<ProxyRegistrationRow[]> {
  void viewer;
  return tx
    .select({
      id: corpCardUsages.id,
      number: corpCardUsages.number,
      usedOn: corpCardUsages.usedOn,
      createdAt: corpCardUsages.createdAt,
      projectName: projects.name,
      pmUserId: projects.pmUserId,
    })
    .from(corpCardUsages)
    .innerJoin(quoteLines, eq(quoteLines.id, corpCardUsages.quoteLineId))
    .innerJoin(quoteRevisions, eq(quoteRevisions.id, quoteLines.revisionId))
    .innerJoin(projects, eq(projects.id, quoteRevisions.projectId))
    .where(
      and(
        eq(corpCardUsages.registeredVia, "proxy"),
        ne(corpCardUsages.registeredBy, projects.pmUserId),
        isNull(corpCardUsages.archivedAt),
        sql`${corpCardUsages.createdAt} >= ${since.toISOString()}::timestamp`,
      ),
    )
    .orderBy(asc(corpCardUsages.createdAt), asc(corpCardUsages.id))
    .limit(limit + 1);
}
