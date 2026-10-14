"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { returnValidationErrors } from "next-safe-action";
import { authedActionClient } from "@/lib/actions/client";
import { seoulToday } from "@/lib/dates";
import { setHireDate, setResignationDate } from "@/domain/people";
import { updatePersonPayoutAccount } from "@/domain/people/account";
import { AccountFieldsError } from "@/domain/vendors/account-fields";
import { addLeaveAdjustment, LeaveAdjustmentValidationError } from "@/domain/leave/balance-service";
import { MIN_LEAVE_YEAR } from "@/domain/leave/days";
import { parseAdjustmentDays } from "./adjustment-days";
import "./actions.registry";

// 04.1-06 Task 3(S9 · D-96 · D-97): 관리자 사람 상세 `연차` 섹션 액션 — 입사일 · 퇴직일 즉시 저장, 연차 · 월차 조정 추가.
// 권한(admin.people write) · 형식 · 퇴직일 ≥ 입사일 · 0.25 단위 · 사유 필수 · 월차 소멸 판정은 도메인(04.1-03)이 한다.
// 성공하면 사람 상세 경로를 무효화해 잔고 줄 · 조정 기록 · 월차 옵션이 서버 재렌더로 바뀐다(CXF2-C-F2-02).

const employmentDateSchema = z.object({ userId: z.string().min(1).max(64), date: z.string().max(10) });

export const setHireDateAction = authedActionClient.schema(employmentDateSchema).action(async ({ parsedInput, ctx }) => {
  await setHireDate(ctx.viewer, parsedInput.userId, parsedInput.date === "" ? null : parsedInput.date);
  revalidatePath(`/admin/people/${parsedInput.userId}`);
});

export const setResignationDateAction = authedActionClient.schema(employmentDateSchema).action(async ({ parsedInput, ctx }) => {
  await setResignationDate(ctx.viewer, parsedInput.userId, parsedInput.date === "" ? null : parsedInput.date);
  revalidatePath(`/admin/people/${parsedInput.userId}`);
  // 06.4 D10: 퇴직일이 재직을 바꿔 조직 화면 중복 수가 바뀐다(입사일은 재직 판정에 안 든다)
  revalidatePath("/admin/people/org");
});

// (S9-FY) 연차는 섹션이 보여 주는 회계연도를 fiscalYear로 — 정수 2000 ≤ y ≤ 올해(상한은 호출 때 seoulToday()로 계산,
// C-12). 월차는 fiscalYear가 없어야 한다. bucket은 문자열 그대로 도메인에 넘긴다 — 목록 밖(빈 값 = Select `—`) 거부와
// 문구 `잔고 비어 있음 · 잔고 고르기`는 addLeaveAdjustment 한 곳(C-02 · T3). 칸 오류는 칸 이름과 함께 돌려준다.
const adjustmentSchema = z
  .object({
    userId: z.string().min(1).max(64),
    bucket: z.string().max(20),
    amountDays: z.string().max(20),
    reason: z.string().max(500, "사유 500자 넘음 · 줄여 적기"),
    fiscalYear: z.number().int().optional(),
  })
  .refine(
    (input) =>
      input.bucket !== "annual" ||
      (input.fiscalYear !== undefined && input.fiscalYear >= MIN_LEAVE_YEAR && input.fiscalYear <= Number(seoulToday().slice(0, 4))),
    { message: "연도 범위 밖 · 다시 고르기", path: ["fiscalYear"] },
  )
  .refine((input) => input.bucket !== "monthly" || input.fiscalYear === undefined, {
    message: "잔고와 연도가 맞지 않음 · 다시 고르기",
    path: ["fiscalYear"],
  });

export const addLeaveAdjustmentAction = authedActionClient.schema(adjustmentSchema).action(async ({ parsedInput, ctx }) => {
  try {
    await addLeaveAdjustment(ctx.viewer, {
      userId: parsedInput.userId,
      bucket: parsedInput.bucket,
      fiscalYear: parsedInput.fiscalYear ?? null,
      amountDays: parseAdjustmentDays(parsedInput.amountDays),
      reason: parsedInput.reason,
    });
  } catch (error) {
    if (error instanceof LeaveAdjustmentValidationError) return { rejected: { field: error.field, message: error.message } };
    throw error;
  }
  revalidatePath(`/admin/people/${parsedInput.userId}`);
  return { added: true };
});

// 06.5-04(D-6505 · D-6506): 직원 지급 계좌 저장 — 게이트(`expenses.payments` 쓰기 ∧ `admin.people` 보기) · 예금주 필요 판정 ·
// 암호화는 도메인이 한다. 계좌번호는 거래처 `updateVendorSchema`와 같은 꼴(undefined = 안 바꿈 · null = 지움 · 문자열 = 새 값).
// 칸 판정 오류는 칸마다 validationErrors로 돌려준다(폼이 칸 아래 · 1차 옆 요약에 그린다).
const payoutAccountSchema = z.object({
  id: z.string().min(1).max(64),
  accountBank: z.string().optional(),
  accountHolder: z.string().optional(),
  accountNumber: z.string().nullable().optional(),
});

export const updatePersonPayoutAccountAction = authedActionClient.schema(payoutAccountSchema).action(async ({ parsedInput, ctx }) => {
  const { id, ...input } = parsedInput;
  try {
    await updatePersonPayoutAccount(ctx.viewer, id, input);
  } catch (error) {
    if (error instanceof AccountFieldsError) {
      returnValidationErrors(
        payoutAccountSchema,
        Object.fromEntries(Object.entries(error.fieldErrors).map(([key, message]) => [key, { _errors: [message] }])),
      );
    }
    throw error;
  }
  revalidatePath(`/admin/people/${id}`);
});
