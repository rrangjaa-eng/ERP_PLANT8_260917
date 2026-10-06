"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authedActionClient } from "@/lib/actions/client";
import { cancelExpensePayment, completeExpensePayment, previewPayable, saveScheduledPayDate } from "@/domain/payments";
import { TRANSFER_FRACTION, TRANSFER_NOT_NUMBER, TRANSFER_NOT_POSITIVE } from "@/domain/payments/action-row";
import { DATE_FORMAT_ERROR, EXPENSE_TEXT_MAX } from "@/domain/expenses/draft-fields";
import { isCalendarDate } from "@/lib/dates";
import "./actions.registry";

// 06-03(EXP-06 · D-604): 문서 화면 지급 액션. 입력에 지급 총액 · 공급가 역산 칸이 없다 — 서버가 다시 계산한 값만 저장한다(T-06-09).
// expectedPayableKrw는 화면이 본 값이 낡았는지 가리는 비교값일 뿐이다.
// 06-04(E-20 · Q6): 날짜 칸 검사 하나 — 지급일 · 미리보기 · 지급 예정일이 함께 쓴다. 달력에 있는 날짜만 DB까지 가고(05 isCalendarDate ·
// DATE_FORMAT_ERROR — 05 scheduledPaymentDate 칸과 같은 꼴), 미래 날짜는 오류가 아니다(지급일 · 지급 예정일 모두 허용).
const paymentDate = z.string().refine(isCalendarDate, DATE_FORMAT_ERROR);

// 「Error — 이체액 칸」 — 정수 원 · 1 이상.
const transferKrw = z.number({ error: TRANSFER_NOT_NUMBER }).int(TRANSFER_FRACTION).positive(TRANSFER_NOT_POSITIVE);

const completePaymentSchema = z.object({
  expenseId: z.string().uuid(),
  payDate: paymentDate.optional(),
  expectedPayableKrw: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  transferKrw,
  diffReason: z.string().max(EXPENSE_TEXT_MAX, `차이 사유 ${EXPENSE_TEXT_MAX}자 넘음 · 줄여 적기`).optional(),
});

export const completeExpensePaymentAction = authedActionClient.schema(completePaymentSchema).action(async ({ parsedInput, ctx }) => {
  const result = await completeExpensePayment(ctx.viewer, parsedInput);
  revalidatePath(`/expenses/${parsedInput.expenseId}`);
  return { version: result.version };
});

// 지급일 · 이체액을 바꾸면 서버가 다시 계산한 지급 총액 · 차이(S5 loading). 읽기 전용 — 행동 로그 없음.
const previewPayableSchema = z.object({
  expenseId: z.string().uuid(),
  payDate: paymentDate,
  transferKrw: transferKrw.optional(),
  // 예정일 칸 힌트 — 저장 전 예정일로 기준일을 고른다(기준일이 지급 예정일인 규칙, 06-04 검토 P3-2).
  scheduledPayDate: paymentDate.optional(),
});

export const previewPayableAction = authedActionClient
  .schema(previewPayableSchema)
  .action(async ({ parsedInput, ctx }) => previewPayable(ctx.viewer, parsedInput));

// 지급 예정일 제자리 저장(SP-3 ②) — 예정일만 바꾼다. 미래 날짜 허용(Q6).
const saveScheduledPayDateSchema = z.object({
  expenseId: z.string().uuid(),
  scheduledPayDate: paymentDate,
  version: z.number().int().positive(),
});

export const saveScheduledPayDateAction = authedActionClient.schema(saveScheduledPayDateSchema).action(async ({ parsedInput, ctx }) => {
  const result = await saveScheduledPayDate(ctx.viewer, parsedInput);
  revalidatePath(`/expenses/${parsedInput.expenseId}`);
  return { version: result.version };
});

// 지급 취소(D-606) — 사유 · version만 받는다. 사유 빈 값은 도메인이 `사유 없음 · 사유 적기`로 거부한다.
const cancelPaymentSchema = z.object({
  expenseId: z.string().uuid(),
  reason: z.string().max(EXPENSE_TEXT_MAX, `사유 ${EXPENSE_TEXT_MAX}자 넘음 · 줄여 적기`),
  version: z.number().int().positive(),
});

export const cancelExpensePaymentAction = authedActionClient.schema(cancelPaymentSchema).action(async ({ parsedInput, ctx }) => {
  const result = await cancelExpensePayment(ctx.viewer, parsedInput);
  revalidatePath(`/expenses/${parsedInput.expenseId}`);
  return { version: result.version };
});
