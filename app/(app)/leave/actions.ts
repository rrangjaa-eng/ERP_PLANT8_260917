"use server";

import { z } from "zod";
import { authedActionClient } from "@/lib/actions/client";
import "@/app/(app)/document-kinds";
import { formatRequestBalanceRow, formatRequestBalanceRowBeforeDates, LEAVE_DOCUMENT_KIND, LeaveValidationError, submitLeave } from "@/domain/leave";
import { countLeaveQuarters, leaveYearRange, type LeaveFieldError } from "@/domain/leave/days";
import { seoulToday } from "@/lib/dates";
import { assertLeaveWrite } from "@/domain/leave/access";
import { previewLeaveBalance } from "@/domain/leave/balance-service";
import { currentHolderNames, projectActionResult, withdrawDocument } from "@/domain/approvals";
import { previewRouteOrBlocked } from "./route-preview";
import { resubmitLeave } from "@/domain/leave/resubmit";
import { log } from "@/lib/log";
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
  // 신청은 이미 커밋됐다 — 토스트 재료(다음 담당 이름 · 투영) 읽기가 실패해도 성공으로 돌려준다. 실패로 돌려주면 폼이 다시
  // 신청하게 두고, 신청에는 멱등 키가 없어 두 번째 신청이 생긴다(Codex P2). 재료가 없으면 토스트는 이름 조각을 뺀다.
  try {
    const nextHolderNames = await currentHolderNames(ctx.viewer, { kind: LEAVE_DOCUMENT_KIND, documentId: submitted.leaveId });
    return { result: await projectActionResult(ctx.viewer, { documentId: submitted.leaveId, final: false, nextHolderNames }) };
  } catch (error) {
    log.warn("leave.submit_toast_material_failed", { leaveId: submitted.leaveId, error: error instanceof Error ? error.message : String(error) });
    return { result: { documentId: submitted.leaveId, final: false } };
  }
});

// 회수 — 기안자 판정만(leave write와 무관 — 계획 가정 4). 이름 · 일수 없는 `회수 · 결재 멈춤`이라 투영할 필드가 없다.
export const withdrawLeaveAction = authedActionClient
  .schema(z.object({ instanceId: z.string().uuid(), expectedVersion: z.number().int().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    const withdrawn = await withdrawDocument(ctx.viewer, parsedInput);
    return { documentId: withdrawn.documentId };
  });

// 다시 신청 — leave write 판정 · 칸 검증은 도메인(resubmitLeave 첫 줄 · countLeaveQuarters).
export const resubmitLeaveAction = authedActionClient
  .schema(z.object({ leaveId: z.string().uuid(), expectedVersion: z.number().int().min(1), input: leaveInputSchema }))
  .action(async ({ parsedInput, ctx }) => {
    let resubmitted: Awaited<ReturnType<typeof resubmitLeave>>;
    try {
      resubmitted = await resubmitLeave(ctx.viewer, parsedInput);
    } catch (error) {
      if (error instanceof LeaveValidationError) return leaveRejected(error);
      throw error;
    }
    // 다시 신청도 이미 커밋됐다 — 토스트 재료 투영이 실패해도 성공으로(신청과 같은 규칙, Codex P2).
    try {
      return {
        result: await projectActionResult(ctx.viewer, {
          documentId: resubmitted.leaveId,
          final: false,
          nextHolderNames: resubmitted.nextHolderNames,
        }),
      };
    } catch (error) {
      log.warn("leave.resubmit_toast_material_failed", { leaveId: resubmitted.leaveId, error: error instanceof Error ? error.message : String(error) });
      return { result: { documentId: resubmitted.leaveId, final: false } };
    }
  });

const DAY_MS = 24 * 60 * 60 * 1000;

// 04.1-06(S2 · Codex MEDIUM · CX-R3 · T8): 신청 창 미리보기 — 저장 없음. 첫 문장이 leave write 판정이다(previewRoute는
// 결재 모듈 함수라 연차 권한을 모른다). 힌트 재료(주말 제외 일수 · 재택 여부)와 잔고 행(formatBalanceRow — 연차 ·
// 월차 따로, 합계 없음, 재택이면 null)과 결재선(04.1-01 RoutePreviewDTO 그대로 — 이름은 approval.value 투영을
// 통과할 때만)을 한 응답으로 준다. 이번 신청 일수는 잔고 행에만 있다(힌트에 싣지 않는다).
export const previewLeaveAction = authedActionClient.schema(leaveInputSchema).action(async ({ parsedInput, ctx }) => {
  await assertLeaveWrite(ctx.viewer);
  const days = countLeaveQuarters(parsedInput, leaveYearRange(seoulToday()));
  let weekendDays: number | null = null;
  let balance: ReturnType<typeof formatRequestBalanceRow> = null;
  if (days.ok) {
    const span = (Date.parse(`${days.endDate}T00:00:00Z`) - Date.parse(`${days.startDate}T00:00:00Z`)) / DAY_MS + 1;
    weekendDays = days.kind === "full_day" ? span - days.quarters / 4 : null;
    balance = formatRequestBalanceRow(await previewLeaveBalance(ctx.viewer, parsedInput), days.kind);
  } else if (parsedInput.kind !== "remote") {
    // 날짜 전(계산 전) — 두 남음 · 결재 중만(UI-SPEC S2). 재택은 차감이 없어 잔고 행이 없다.
    balance = formatRequestBalanceRowBeforeDates(await previewLeaveBalance(ctx.viewer, parsedInput));
  }
  // 결재선이 막혀도(대표 없음) 잔고 행은 버리지 않고 막힌 이유를 결재선 자리에 준다 — 제출해야 처음 보이지 않게
  // (04.1-06 코드 검토 L3). 다른 오류는 그대로 던진다.
  const { route, blocked: routeBlocked } = await previewRouteOrBlocked(ctx.viewer);
  return { remote: days.ok && days.kind === "remote", weekendDays, balance, route, routeBlocked };
});

