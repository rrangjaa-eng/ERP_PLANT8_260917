"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import "@/app/(app)/document-kinds";
import { approveDocument, describeDeduction, projectActionResult, rejectDocument, type ApprovalActionResult } from "@/domain/approvals";
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
    const deductedDays = approved.final
      ? await describeDeduction(ctx.viewer, { kind: approved.kind, documentId: approved.documentId })
      : null;
    return projectActionResult(ctx.viewer, { ...base, nextHolderNames: approved.nextHolderNames, deductedDays });
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
