"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import { confirmHolidayYear } from "@/domain/holidays/admin";
import "./actions.registry";

// ADMN-11(04.2-11): 입력은 정수 모양만 본다 — 권한·음력 표 범위·후보 완결은
// domain/holidays/admin이 다시 본다(화면에 없는 해를 직접 불러도 같은 규칙).
export const confirmHolidayYearAction = authedActionClient
  .schema(z.object({ year: z.number().int() }))
  .action(async ({ parsedInput, ctx }) => {
    await confirmHolidayYear(ctx.viewer, parsedInput.year);
    revalidatePath("/admin/holidays");
    return { ok: true };
  });
