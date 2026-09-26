"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import "@/app/(app)/document-kinds";
import { approveDocument, describeDeduction, projectActionResult } from "@/domain/approvals";
import "./actions.registry";

// 04.1-02: 결재함 액션 — expectedVersion은 화면이 받은 값을 그대로 넘긴다(낙관적 잠금).
// 자동 재시도를 두지 않는다 — 충돌은 도메인이 만든 한 줄로 사람에게 돌려준다.
const transitionSchema = z.object({
  instanceId: z.string().min(1).max(64),
  expectedVersion: z.number().int().min(1),
});

export const approveAction = authedActionClient.schema(transitionSchema).action(async ({ parsedInput, ctx }) => {
  const approved = await approveDocument(ctx.viewer, parsedInput);
  const deductedDays = approved.final
    ? await describeDeduction(ctx.viewer, { kind: approved.kind, documentId: approved.documentId })
    : null;
  revalidatePath("/approvals");
  return projectActionResult(ctx.viewer, {
    documentId: approved.documentId,
    final: approved.final,
    nextHolderNames: approved.nextHolderNames,
    deductedDays,
  });
});
