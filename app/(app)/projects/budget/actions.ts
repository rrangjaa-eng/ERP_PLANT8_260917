"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import { listBudgetHistory, setBudgetManually } from "@/domain/projects/budget";
import "./actions.registry";

// 07-24(SC-21 · D-729): 예산 이력 패널의 읽기 · 직접 수정. 권한(`projects.budget` 보기 · 쓰기) · 금액 정보 항목 · 행 범위는 도메인이 판정한다.
// 저장은 바뀐 이력 첫 쪽을 돌려준다 — 패널이 현재 값과 맨 위 줄을 같은 응답으로 다시 그린다(토스트 없음 · N4).

export const listBudgetHistoryAction = authedActionClient
  .schema(z.object({ projectId: z.string().uuid(), cursor: z.string().uuid().nullable() }))
  .action(async ({ parsedInput, ctx }) => listBudgetHistory(ctx.viewer, parsedInput.projectId, { cursor: parsedInput.cursor }));

export const setBudgetManuallyAction = authedActionClient
  .schema(
    z.object({
      projectId: z.string().uuid(),
      budgetKrw: z.number(),
      expectedBudgetKrw: z.number(),
      memo: z.string(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await setBudgetManually(ctx.viewer, parsedInput.projectId, {
      budgetKrw: parsedInput.budgetKrw,
      expectedBudgetKrw: parsedInput.expectedBudgetKrw,
      memo: parsedInput.memo,
    });
    revalidatePath("/projects/budget");
    return listBudgetHistory(ctx.viewer, parsedInput.projectId, { cursor: null });
  });
