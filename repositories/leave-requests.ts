import { and, asc, eq, inArray } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { approvalInstances, leaveRequests, users } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 04.1(LEAV-01): 연차 신청 표. 결재 상태는 approval_instances에 있어 목록은
// 문서 종류 키(호출자가 넘긴다)로 인스턴스를 왼쪽 조인해 함께 읽는다.

export type LeaveRequestRow = InferSelectModel<typeof leaveRequests>;
export type LeaveRequestWithApproval = LeaveRequestRow & {
  drafterName: string;
  instanceId: string | null;
  status: string | null;
  version: number | null;
};

export async function insertLeaveRequest(
  viewer: Viewer,
  input: {
    drafterId: string;
    kind: string;
    startDate: string;
    endDate: string;
    half: string | null;
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
    })
    .from(leaveRequests)
    .innerJoin(users, eq(users.id, leaveRequests.drafterId))
    .leftJoin(
      approvalInstances,
      and(eq(approvalInstances.documentKind, documentKind), eq(approvalInstances.documentId, leaveRequests.id)),
    );
}

type JoinedRow = {
  leave: LeaveRequestRow;
  drafterName: string;
  instanceId: string | null;
  status: string | null;
  version: number | null;
};

function flatten(row: JoinedRow): LeaveRequestWithApproval {
  return { ...row.leave, drafterName: row.drafterName, instanceId: row.instanceId, status: row.status, version: row.version };
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
