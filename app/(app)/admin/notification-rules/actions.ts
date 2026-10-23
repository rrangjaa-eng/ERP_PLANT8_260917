"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import { setRuleEnabled } from "@/domain/notify/rule-admin";
import "./actions.registry";

// 종류 이름 · 순서는 화면에 두지 않는다 — 입력은 모양만 본다. 등록부 밖 종류 · 권한 · version은 도메인이 다시 본다.
const setEnabledSchema = z.object({
  kind: z.string().min(1).max(80),
  enabled: z.boolean(),
  version: z.number().int().min(0),
});

export const setRuleEnabledAction = authedActionClient.schema(setEnabledSchema).action(async ({ parsedInput, ctx }) => {
  const { changed } = await setRuleEnabled(ctx.viewer, parsedInput);
  revalidatePath("/admin/notification-rules");
  return { changed };
});
