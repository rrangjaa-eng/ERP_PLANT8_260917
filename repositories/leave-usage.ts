import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
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
