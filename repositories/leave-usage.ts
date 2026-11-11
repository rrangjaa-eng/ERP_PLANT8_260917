import { and, asc, eq, gte, inArray, lte, ne, notExists, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
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

// 07.2-15(PU10 · D-7253): 연차 취소 문서 종류 키 — domain/leave/access.ts LEAVE_CANCEL_KIND와 같은 값(리포지토리는 domain을 import하지 않는다 ·
// 통합 시험 leave-cancel이 두 값이 맞물리는지 고정한다).
const LEAVE_CANCEL_KIND = "leave_cancel";
const cancelInstances = alias(approvalInstances, "leave_cancel_instances");

// 「취소가 최종 승인된 연차」를 빼는 조건 한 곳 — 잔고(listLeaveUsage)와 겹침(listLiveLeaveInRange)이 **둘 다** 이 함수를 쓴다.
// 한쪽만 빼면 잔고는 돌아왔는데 같은 날 재신청이 겹침으로 막히거나(또는 반대) — RESEARCH F-PU10 · Pitfall 3. 취소 요청 중 · 반려 · 회수는
// 빼지 않는다(승인된 취소만). 연차 행은 쓰지 않는다 — 취소 판정은 leave_cancel 인스턴스 상태로만.
function cancelledLeaveFilter(): SQL {
  return notExists(
    db
      .select({ one: sql`1` })
      .from(cancelInstances)
      .where(
        and(
          eq(cancelInstances.documentKind, LEAVE_CANCEL_KIND),
          eq(cancelInstances.documentId, leaveRequests.id),
          eq(cancelInstances.status, "approved"),
        ),
      ),
  );
}

export async function listLeaveUsage(
  viewer: Viewer,
  input: { drafterId: string; fiscalYears: number[]; documentKind: string },
  tx: DbOrTx = db,
): Promise<LeaveUsageRow[]> {
  void viewer;
  if (input.fiscalYears.length === 0) return [];
  const rows = await tx
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
        cancelledLeaveFilter(),
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
        cancelledLeaveFilter(),
        input.excludeId ? ne(leaveRequests.id, input.excludeId) : undefined,
      ),
    )
    .orderBy(asc(leaveRequests.startDate), asc(leaveRequests.id));
}
