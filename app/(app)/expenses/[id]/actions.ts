"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authedActionClient } from "@/lib/actions/client";
import { completeExpensePayment } from "@/domain/payments";
import { DATE_FORMAT_ERROR } from "@/domain/expenses/draft-fields";
import { isCalendarDate } from "@/lib/dates";
import "./actions.registry";

// 06-03(EXP-06 · D-604): 문서 화면 지급 액션. 입력에 지급 총액 · 공급가 역산 칸이 없다 — 서버가 다시 계산한 값만 저장한다(T-06-09).
// expectedPayableKrw는 화면이 본 값이 낡았는지 가리는 비교값일 뿐이다. 지급일은 달력에 있는 날짜만 DB까지 간다(05 E-20 같은 꼴).
const completePaymentSchema = z.object({
  expenseId: z.string().uuid(),
  payDate: z.string().refine(isCalendarDate, DATE_FORMAT_ERROR).optional(),
  expectedPayableKrw: z.number().int().nonnegative(),
  version: z.number().int().positive(),
});

export const completeExpensePaymentAction = authedActionClient.schema(completePaymentSchema).action(async ({ parsedInput, ctx }) => {
  const result = await completeExpensePayment(ctx.viewer, parsedInput);
  revalidatePath(`/expenses/${parsedInput.expenseId}`);
  return { version: result.version };
});
