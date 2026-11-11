import { and, asc, desc, eq, gte, inArray, isNull, lte, max, min, or, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type DbOrTx } from "@/db/client";
import { approvalInstances, leaveRequests, teamMemberships, teams, users } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 04.1(LEAV-01): 연차 신청 표. 결재 상태는 approval_instances에 있어 목록은
// 문서 종류 키(호출자가 넘긴다)로 인스턴스를 왼쪽 조인해 함께 읽는다.

export type LeaveRequestRow = InferSelectModel<typeof leaveRequests>;
export type LeaveRequestWithApproval = LeaveRequestRow & {
  drafterName: string;
  instanceId: string | null;
  status: string | null;
  version: number | null;
  // 07.2-15(PU10): 같은 연차의 취소 요청(leave_cancel) 인스턴스 상태 — 없으면 null. 연차 표시 상태(`취소 요청 중` · `취소됨`)의 재료.
  cancelStatus: string | null;
};

// 07.2-15: domain/leave/access.ts LEAVE_CANCEL_KIND와 같은 값(leave-usage.ts와 같은 이유로 여기 둔다).
const LEAVE_CANCEL_KIND = "leave_cancel";
const cancelInstances = alias(approvalInstances, "leave_cancel_instances");

export async function insertLeaveRequest(
  viewer: Viewer,
  input: {
    drafterId: string;
    kind: string;
    startDate: string;
    endDate: string;
    half: string | null;
    startTime: string | null;
    daysQuarters: number;
    fiscalYear: number;
    note: string | null;
  },
  tx: DbOrTx,
): Promise<LeaveRequestRow> {
  void viewer;
  const [row] = await tx.insert(leaveRequests).values(input).returning();
  if (!row) throw new Error("leave_requests insert가 행을 반환하지 않았습니다.");
  return row;
}

// 06.3(D-6311): 같은 기안자의 제출 · 다시 신청을 줄 세운다 — 겹침 조회와 삽입 사이 틈 없음. 260907은 잠금이
// 없었다(`O: db/schema/030_constraints_indexes.sql:253,1049`). 트랜잭션 끝에 풀린다.
export async function lockLeaveDrafter(viewer: Viewer, drafterId: string, tx: DbOrTx): Promise<void> {
  void viewer;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"leave:" + drafterId}, 0))`);
}

export async function setLeaveNumber(viewer: Viewer, id: string, number: string, tx: DbOrTx): Promise<void> {
  void viewer;
  await tx.update(leaveRequests).set({ number, updatedAt: new Date() }).where(eq(leaveRequests.id, id));
}

function withApprovalSelect(documentKind: string) {
  return db
    .select({
      leave: leaveRequests,
      drafterName: users.name,
      instanceId: approvalInstances.id,
      status: approvalInstances.status,
      version: approvalInstances.version,
      cancelStatus: cancelInstances.status,
    })
    .from(leaveRequests)
    .innerJoin(users, eq(users.id, leaveRequests.drafterId))
    .leftJoin(
      approvalInstances,
      and(eq(approvalInstances.documentKind, documentKind), eq(approvalInstances.documentId, leaveRequests.id)),
    )
    .leftJoin(cancelInstances, and(eq(cancelInstances.documentKind, LEAVE_CANCEL_KIND), eq(cancelInstances.documentId, leaveRequests.id)));
}

type JoinedRow = {
  leave: LeaveRequestRow;
  drafterName: string;
  instanceId: string | null;
  status: string | null;
  version: number | null;
  cancelStatus: string | null;
};

function flatten(row: JoinedRow): LeaveRequestWithApproval {
  return {
    ...row.leave,
    drafterName: row.drafterName,
    instanceId: row.instanceId,
    status: row.status,
    version: row.version,
    cancelStatus: row.cancelStatus,
  };
}

export async function findLeaveRequestById(
  viewer: Viewer,
  input: { id: string; documentKind: string },
): Promise<LeaveRequestWithApproval | null> {
  void viewer;
  const [row] = await withApprovalSelect(input.documentKind).where(eq(leaveRequests.id, input.id)).limit(1);
  return row ? flatten(row) : null;
}

export async function findLeaveRequestsByIds(
  viewer: Viewer,
  input: { ids: string[]; documentKind: string },
): Promise<LeaveRequestWithApproval[]> {
  void viewer;
  if (input.ids.length === 0) return [];
  const rows = await withApprovalSelect(input.documentKind).where(inArray(leaveRequests.id, input.ids));
  return rows.map(flatten);
}

export async function listLeaveRequestsByDrafter(
  viewer: Viewer,
  input: { drafterId: string; fiscalYear: number; documentKind: string },
): Promise<LeaveRequestWithApproval[]> {
  void viewer;
  const rows = await withApprovalSelect(input.documentKind)
    .where(and(eq(leaveRequests.drafterId, input.drafterId), eq(leaveRequests.fiscalYear, input.fiscalYear)))
    .orderBy(asc(leaveRequests.startDate), asc(leaveRequests.createdAt));
  return rows.map(flatten);
}

// 04.1-06(C-04 · C-P1 · 사용자 결정 2026-09-29): 한 기안자의 가장 이른 · 가장 늦은 회계연도 — min · max(fiscal_year)
// 한 번. 신청이 없으면 null.
export async function findLeaveFiscalYearRange(viewer: Viewer, drafterId: string): Promise<{ earliest: number; latest: number } | null> {
  void viewer;
  const [row] = await db
    .select({ earliest: min(leaveRequests.fiscalYear), latest: max(leaveRequests.fiscalYear) })
    .from(leaveRequests)
    .where(eq(leaveRequests.drafterId, drafterId));
  return row?.earliest != null && row.latest != null ? { earliest: row.earliest, latest: row.latest } : null;
}

// 04.1-02: 다시 신청 — 번호는 그대로, 검증된 칸만 갱신한다(호출자의 tx).
export async function updateLeaveRequestFields(
  viewer: Viewer,
  id: string,
  input: {
    kind: string;
    startDate: string;
    endDate: string;
    half: string | null;
    startTime: string | null;
    daysQuarters: number;
    fiscalYear: number;
    note: string | null;
  },
  tx: DbOrTx,
): Promise<void> {
  void viewer;
  await tx.update(leaveRequests).set({ ...input, updatedAt: new Date() }).where(eq(leaveRequests.id, id));
}

// 07.2-08(PU12 · D-7260): 사람별 연차 잔여 표의 대상 — 퇴직일이 그해 1월 1일 이후인 사람은 보관 여부와 무관하게 넣고, 그 밖의 보관된
// 사람은 빼고, 입사일이 그해 말 뒤면 뺀다. 팀 = 기준일(퇴직일과 오늘 중 이른 날) 이하의 가장 늦은 발령 팀 — 퇴직자는 마지막 발령 팀.
// 쿼리 두 번(사람 · 발령) — 사람마다 읽지 않는다.
export type LeaveBalancePersonRow = { user: InferSelectModel<typeof users>; teamId: string | null; teamName: string | null };

export async function listLeaveBalancePeople(
  viewer: Viewer,
  input: { yearStart: string; yearEnd: string; today: string },
): Promise<LeaveBalancePersonRow[]> {
  void viewer;
  const people = await db
    .select()
    .from(users)
    .where(
      and(
        or(gte(users.resignationDate, input.yearStart), and(isNull(users.resignationDate), isNull(users.archivedAt))),
        or(isNull(users.hireDate), lte(users.hireDate, input.yearEnd)),
      ),
    );
  if (people.length === 0) return [];
  const memberships = await db
    .select({ userId: teamMemberships.userId, effectiveFrom: teamMemberships.effectiveFrom, teamId: teams.id, teamName: teams.name })
    .from(teamMemberships)
    .innerJoin(teams, eq(teams.id, teamMemberships.teamId))
    .where(and(inArray(teamMemberships.userId, people.map((person) => person.id)), lte(teamMemberships.effectiveFrom, input.today)))
    .orderBy(desc(teamMemberships.effectiveFrom));
  return people.map((user) => {
    const asOf = user.resignationDate && user.resignationDate < input.today ? user.resignationDate : input.today;
    const membership = memberships.find((row) => row.userId === user.id && row.effectiveFrom <= asOf);
    return { user, teamId: membership?.teamId ?? null, teamName: membership?.teamName ?? null };
  });
}
