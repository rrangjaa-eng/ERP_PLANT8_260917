"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import "@/app/(app)/document-kinds";
import {
  approveDocument,
  describeDeduction,
  describeFinalApprovalNote,
  projectActionResult,
  rejectDocument,
  withdrawDocument,
  type ApprovalActionResult,
} from "@/domain/approvals";
import { approveBatch, APPROVAL_BATCH_LIMIT, rejectBatch } from "@/domain/approvals/batch";
import { log } from "@/lib/log";
import "./actions.registry";

// 04.1-02: 결재함 액션 — expectedVersion은 화면이 받은 값을 그대로 넘긴다(낙관적 잠금).
// 자동 재시도를 두지 않는다 — 충돌은 도메인이 만든 한 줄로 사람에게 돌려준다.
const transitionSchema = z.object({
  instanceId: z.string().uuid(),
  expectedVersion: z.number().int().min(1),
});

// 전이는 이미 커밋됐다 — 토스트 재료(차감 일수 · 투영) 읽기가 실패해도 성공으로 돌려준다. 실패로 돌려주면 다시 누른
// 시도가 version 충돌이 되어 흐름이 끝나지 않는다(Codex P2 — 신청 액션과 같은 규칙). 재료가 없으면 토스트는 그 조각을 뺀다.
async function afterCommit(base: ApprovalActionResult, enrich: () => Promise<ApprovalActionResult>): Promise<ApprovalActionResult> {
  try {
    return await enrich();
  } catch (error) {
    log.warn("approval.toast_material_failed", { documentId: base.documentId, error: error instanceof Error ? error.message : String(error) });
    return base;
  }
}

export const approveAction = authedActionClient.schema(transitionSchema).action(async ({ parsedInput, ctx }) => {
  const approved = await approveDocument(ctx.viewer, parsedInput);
  revalidatePath("/approvals");
  const base = { documentId: approved.documentId, final: approved.final };
  return afterCommit(base, async () => {
    const target = { kind: approved.kind, documentId: approved.documentId };
    const deductedDays = approved.final ? await describeDeduction(ctx.viewer, target) : null;
    // 05-01(Round 4 D8): 종류 요약의 최종 승인 토스트 꼬리(없으면 null).
    const finalNote = approved.final ? await describeFinalApprovalNote(ctx.viewer, target) : null;
    return projectActionResult(ctx.viewer, { ...base, nextHolderNames: approved.nextHolderNames, deductedDays, finalNote });
  });
});

// 반려 — 사유 검증(trim 1~500자)과 문구는 도메인 한 곳(rejectDocument). 스키마는 크기만 막는다.
export const rejectAction = authedActionClient
  .schema(transitionSchema.extend({ reason: z.string().max(2000) }))
  .action(async ({ parsedInput, ctx }) => {
    const rejected = await rejectDocument(ctx.viewer, parsedInput);
    revalidatePath("/approvals");
    const base = { documentId: rejected.documentId, final: false };
    return afterCommit(base, () => projectActionResult(ctx.viewer, { ...base, drafterName: rejected.drafterName }));
  });

// 05-01(Round 4 D8): 종류 중립 회수 — 결재함 · 문서 화면의 회수 확인이 종류와 상관없이 부른다. 문서 id만 돌려준다.
export const withdrawAction = authedActionClient.schema(transitionSchema).action(async ({ parsedInput, ctx }) => {
  const withdrawn = await withdrawDocument(ctx.viewer, parsedInput);
  revalidatePath("/approvals");
  return { documentId: withdrawn.documentId };
});

// 07.2-16(PU15 · 16 · D-7269 · D-7272): 결재함 일괄 승인 · 반려 — 요청에는 인스턴스 id · version만(종류 칸 없음 · 종류는 서버가 읽는다).
// 상한은 스키마와 도메인 둘 다(도메인이 문구 `100건까지`의 출처). 결과는 구조 값(id · 막힘 이유 · 시각)뿐이라 투영할 DTO가 없다.
const batchSchema = z.object({ items: z.array(transitionSchema).min(1).max(APPROVAL_BATCH_LIMIT) });

export const approveBatchAction = authedActionClient.schema(batchSchema).action(async ({ parsedInput, ctx }) => {
  const result = await approveBatch(ctx.viewer, parsedInput.items);
  revalidatePath("/approvals");
  return result;
});

// 빈 사유는 도메인이 행 루프 전에 막는다(`사유 없음 · 사유 적기` — 화면 aria-disabled만으로 막지 않는다).
export const rejectBatchAction = authedActionClient
  .schema(batchSchema.extend({ reason: z.string().max(2000) }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await rejectBatch(ctx.viewer, parsedInput.items, parsedInput.reason);
    revalidatePath("/approvals");
    return result;
  });
