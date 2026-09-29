"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";
import { createEvent } from "@/domain/certs/events";
import "./actions.registry";

// 04.3-04 — 행사 만들기. 줄 칸 내용은 domain(validateWinnerRows)이 셀 오류로
// 판정하므로 여기서는 모양만 받는다(E3-21). 당첨자 500줄 상한은 domain zod.
const winnerSchema = z.object({
  name: z.string(),
  phone: z.string(),
  prizeName: z.string(),
  quantity: z.string(),
  delivery: z.string(),
  distinguishLabel: z.string().optional(),
});

export const createCertEventAction = authedActionClient
  .schema(
    z.object({
      name: z.string(),
      wonOn: z.string(),
      requestId: z.string().uuid(),
      winners: z.array(winnerSchema),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await assertCertFeatureEnabled();
    const result = await createEvent(ctx.viewer, parsedInput);
    if (result.kind === "ok") revalidatePath("/certs/events");
    return result;
  });
