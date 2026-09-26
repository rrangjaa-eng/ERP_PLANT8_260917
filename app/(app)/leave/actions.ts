"use server";

import { z } from "zod";
import { authedActionClient } from "@/lib/actions/client";
import "@/app/(app)/document-kinds";
import { LEAVE_DOCUMENT_KIND, LeaveValidationError, submitLeave } from "@/domain/leave";
import type { LeaveFieldError } from "@/domain/leave/days";
import { currentHolderNames, projectActionResult, withdrawDocument } from "@/domain/approvals";
import { resubmitLeave } from "@/domain/leave/resubmit";
import "./actions.registry";

// 04.1-02: 연차 신청 액션. kind · half는 문자열 그대로 도메인으로 넘긴다 — 빈 값 · 목록 밖 판정과
// 칸 문구는 countLeaveQuarters 한 곳이 칸 오류로 돌려준다. leave write 판정은 도메인(submitLeave 첫 줄).
const leaveInputSchema = z.object({
  kind: z.string().max(20),
  startDate: z.string().max(10),
  endDate: z.string().max(10),
  half: z.string().max(10),
  note: z.string().max(500, "비고 500자 넘음 · 줄여 적기").optional(),
});

function leaveRejected(error: LeaveValidationError): { rejected: { errors: LeaveFieldError[] } } {
  return { rejected: { errors: error.fieldErrors } };
}

export const submitLeaveAction = authedActionClient.schema(leaveInputSchema).action(async ({ parsedInput, ctx }) => {
  let submitted: Awaited<ReturnType<typeof submitLeave>>;
  try {
    submitted = await submitLeave(ctx.viewer, parsedInput);
  } catch (error) {
    if (error instanceof LeaveValidationError) return leaveRejected(error);
    throw error;
  }
  const nextHolderNames = await currentHolderNames(ctx.viewer, { kind: LEAVE_DOCUMENT_KIND, documentId: submitted.leaveId });
  return { result: await projectActionResult(ctx.viewer, { documentId: submitted.leaveId, final: false, nextHolderNames }) };
});

// 회수 — 기안자 판정만(leave write와 무관 — 계획 가정 4). 이름 · 일수 없는 `회수 · 결재 멈춤`이라 투영할 필드가 없다.
export const withdrawLeaveAction = authedActionClient
  .schema(z.object({ instanceId: z.string().min(1).max(64), expectedVersion: z.number().int().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    const withdrawn = await withdrawDocument(ctx.viewer, parsedInput);
    return { documentId: withdrawn.documentId };
  });

// 다시 신청 — leave write 판정 · 칸 검증은 도메인(resubmitLeave 첫 줄 · countLeaveQuarters).
export const resubmitLeaveAction = authedActionClient
  .schema(z.object({ leaveId: z.string().min(1).max(64), expectedVersion: z.number().int().min(1), input: leaveInputSchema }))
  .action(async ({ parsedInput, ctx }) => {
    let resubmitted: Awaited<ReturnType<typeof resubmitLeave>>;
    try {
      resubmitted = await resubmitLeave(ctx.viewer, parsedInput);
    } catch (error) {
      if (error instanceof LeaveValidationError) return leaveRejected(error);
      throw error;
    }
    return {
      result: await projectActionResult(ctx.viewer, {
        documentId: resubmitted.leaveId,
        final: false,
        nextHolderNames: resubmitted.nextHolderNames,
      }),
    };
  });
