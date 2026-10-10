import { and, asc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { approvalInstances, leaveRequests } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 04.1-03(LEAV-01): 잔고 계산 재료 — 한 사람의 연차 신청과 결재 상태를 쿼리 한 번으로
// 읽는다. 최종 승인(approved)과 진행 중(submitted · in_review)만, 회수·반려는 뺀다.
export type LeaveUsageRow = {
  id: string;
  startDate: string;
  daysQuarters: number;
  fiscalYear: number;
  status: "approved" | "pending";
};

const PENDING_STATUSES = ["submitted", "in_review"];

export async function listLeaveUsage(
  viewer: Viewer,
  input: { drafterId: string; fiscalYears: number[]; documentKind: string },
): Promise<LeaveUsageRow[]> {
  void viewer;
  if (input.fiscalYears.length === 0) return [];
  const rows = await db
    .select({
      id: leaveRequests.id,
      startDate: leaveRequests.startDate,
      daysQuarters: leaveRequests.daysQuarters,
      fiscalYear: leaveRequests.fiscalYear,
      status: approvalInstances.status,
    })
    .from(leaveRequests)
    .innerJoin(
      approvalInstances,
      and(eq(approvalInstances.documentKind, input.documentKind), eq(approvalInstances.documentId, leaveRequests.id)),
    )
    .where(
      and(
        eq(leaveRequests.drafterId, input.drafterId),
        inArray(leaveRequests.fiscalYear, input.fiscalYears),
        inArray(approvalInstances.status, ["approved", ...PENDING_STATUSES]),
      ),
    )
    .orderBy(asc(leaveRequests.startDate), asc(leaveRequests.id));
  return rows.map((row) => ({ ...row, status: row.status === "approved" ? "approved" : "pending" }));
}

// 06.3-02(D-6307): 겹침 재료 — 같은 기안자의 살아 있는 신청(결재 중 · 승인, 잔고와 같은 3값) 중 날짜 구간이
// 닿는 것. 회수 · 반려는 뺀다 — 260907 `O: server/src/leave.ts:559-562`(pending · approved)와 같다. 신청은 해를
// 넘지 않으므로(days.ts 회계연도 검사) 해 하나만 본다(색인 leave_requests_drafter_year_idx).
export type LiveLeaveRow = { id: string; kind: string; half: string | null; startDate: string; endDate: string };

export async function listLiveLeaveInRange(
  viewer: Viewer,
  input: { drafterId: string; fiscalYear: number; startDate: string; endDate: string; documentKind: string; excludeId?: string },
  tx?: DbOrTx,
): Promise<LiveLeaveRow[]> {
  void viewer;
  return (tx ?? db)
    .select({
      id: leaveRequests.id,
      kind: leaveRequests.kind,
      half: leaveRequests.half,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
    })
    .from(leaveRequests)
    .innerJoin(
      approvalInstances,
      and(eq(approvalInstances.documentKind, input.documentKind), eq(approvalInstances.documentId, leaveRequests.id)),
    )
    .where(
      and(
        eq(leaveRequests.drafterId, input.drafterId),
        eq(leaveRequests.fiscalYear, input.fiscalYear),
        lte(leaveRequests.startDate, input.endDate),
        gte(leaveRequests.endDate, input.startDate),
        inArray(approvalInstances.status, ["approved", ...PENDING_STATUSES]),
        input.excludeId ? ne(leaveRequests.id, input.excludeId) : undefined,
      ),
    )
    .orderBy(asc(leaveRequests.startDate), asc(leaveRequests.id));
}
