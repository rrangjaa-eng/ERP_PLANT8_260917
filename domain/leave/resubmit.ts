import "./index";
import type { Viewer } from "@/domain/viewer";
import { withTransaction } from "@/lib/db-transaction";
import { NOT_HOLDER_MESSAGE, NotCurrentHolderError, prepareSubmission, resubmitDocument } from "@/domain/approvals";
import type { TxLogDeps } from "@/domain/approvals/tx-log";
import { findLeaveRequestById, updateLeaveRequestFields } from "@/repositories/leave-requests";
import { countLeaveQuarters } from "@/domain/leave/days";
import { assertLeaveWrite, LEAVE_DOCUMENT_KIND } from "@/domain/leave/access";
import { LeaveValidationError, type SubmitLeaveInput } from "@/domain/leave";

// 04.1-02(EXP-04 ordering): 반려된 연차의 다시 신청 — 번호는 그대로, 새 차수(round + 1)의 결재선은 다시
// 신청한 시점의 설정 · 소속으로 고정된다. 이전 차수의 단계 · 반려 사유는 지워지지 않는다. 맨 위 `./index`
// side-effect import는 이 파일만 적재된 콜드 경로에서도 연차 종류가 등록되게 한다(CEO-3 — index.ts는 이
// 파일을 import하지 않아 순환이 없다). 액션이 이 파일을 직접 import한다(index.ts에 연결하지 않는다).

export type ResubmitLeaveDeps = { now?: Date } & TxLogDeps;

export async function resubmitLeave(
  viewer: Viewer,
  input: { leaveId: string; expectedVersion: number; input: SubmitLeaveInput },
  deps?: ResubmitLeaveDeps,
): Promise<{ leaveId: string; instanceId: string; version: number; round: number; nextHolderNames: string | null }> {
  await assertLeaveWrite(viewer);
  // 검증된 값만 저장한다 — countLeaveQuarters가 돌려준 {kind, half}와 날짜(입력 원문을 쓰지 않는다).
  const days = countLeaveQuarters(input.input);
  if (!days.ok) throw new LeaveValidationError(days.errors);
  const note = input.input.note?.trim() ? input.input.note.trim() : null;

  const leave = await findLeaveRequestById(viewer, { id: input.leaveId, documentKind: LEAVE_DOCUMENT_KIND });
  if (!leave?.instanceId) throw new NotCurrentHolderError(NOT_HOLDER_MESSAGE);
  const instanceId = leave.instanceId;
  // 트랜잭션 전 읽기(CEO-2) — 다시 신청 시점의 결재선 설정 · 기안자 소속 · 스냅숏 · 로그 켜짐.
  const prepared = await prepareSubmission(viewer, { kind: LEAVE_DOCUMENT_KIND, drafterId: leave.drafterId }, { now: deps?.now });

  return withTransaction(async (tx) => {
    // 전이 판정(기안자 · rejected · version)이 먼저 — 거부되면 신청 칸은 쓰지 않는다.
    const resubmitted = await resubmitDocument(viewer, prepared, { instanceId, expectedVersion: input.expectedVersion }, tx, {
      appendActionLog: deps?.appendActionLog,
    });
    await updateLeaveRequestFields(
      viewer,
      input.leaveId,
      {
        kind: days.kind,
        startDate: days.startDate,
        endDate: days.endDate,
        half: days.half,
        daysQuarters: days.quarters,
        fiscalYear: days.fiscalYear,
        note,
      },
      tx,
    );
    return {
      leaveId: input.leaveId,
      instanceId,
      version: resubmitted.version,
      round: resubmitted.round,
      nextHolderNames: resubmitted.nextHolderNames,
    };
  });
}
