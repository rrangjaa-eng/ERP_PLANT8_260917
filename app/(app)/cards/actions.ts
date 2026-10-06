"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import { isCalendarDate, seoulToday } from "@/lib/dates";
import { CURRENCIES } from "@/domain/money/currency";
import { createCardUsage, precheckCardUsage, previewCardAmounts } from "@/domain/corp-card-usages";
import { cardUsedOnError, USED_ON_FUTURE } from "@/domain/corp-card-usages/amounts";
import { searchVendorsForPick } from "@/domain/expenses/pick";
import "./actions.registry";

// 06-05(EXP-07 · D-607): 카드 사용 등록 · 서버 계산 한 줄 · 가맹점 고르기. domain/corp-card-usages만 부른다.
// 사람은 결제 합계(통화 · 금액 · 환율)만 보낸다 — 공급가 · 부가세 · 원화 환산액 칸은 이 스키마에 없다(T-06-20).

const DATE_ERROR = "날짜 없음 · 날짜 고르기";
const AMOUNT_NOT_NUMBER = "숫자 아님 · 1,240,000처럼";
const AMOUNT_NOT_POSITIVE = "결제 합계 0 이하 · 금액 고치기";
const FX_MISSING = "환율 없음 · USD 환율 적기";

const usedOnSchema = z.string().refine(isCalendarDate, DATE_ERROR);
const amountSchema = z.number({ error: AMOUNT_NOT_NUMBER }).positive(AMOUNT_NOT_POSITIVE);

// 사용일 상한(Q6) — 오늘(서울 날짜)은 서버가 정한다. 미래 날짜는 사용일 칸 오류. 외화는 환율이 있어야 한다(O-7).
const createCardUsageSchema = z
  .object({
    corpCardId: z.uuid(),
    usedOn: usedOnSchema.refine((usedOn) => cardUsedOnError(usedOn, seoulToday()) === null, USED_ON_FUTURE),
    merchantVendorId: z.uuid().nullable(),
    currency: z.enum(CURRENCIES),
    amount: amountSchema,
    fxRate: z.number().positive().optional(),
    evidenceTypeCode: z.string().min(1),
    linkKind: z.enum(["team_cost"]).nullable(),
    memo: z.string().max(500).nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.currency !== "KRW" && value.fxRate === undefined) ctx.addIssue({ code: "custom", message: FX_MISSING, path: ["fxRate"] });
  });

export const createCardUsageAction = authedActionClient.schema(createCardUsageSchema).action(async ({ parsedInput, ctx }) => {
  const input = {
    corpCardId: parsedInput.corpCardId,
    usedOn: parsedInput.usedOn,
    merchantVendorId: parsedInput.merchantVendorId,
    total: { currency: parsedInput.currency, amount: parsedInput.amount, fxRate: parsedInput.fxRate ?? 1 },
    evidenceTypeCode: parsedInput.evidenceTypeCode,
    linkKind: parsedInput.linkKind,
    memo: parsedInput.memo,
  };
  const pre = await precheckCardUsage(ctx.viewer, input);
  const created = await createCardUsage(ctx.viewer, input, pre);
  revalidatePath("/cards");
  return created;
});

// 서버 계산 한 줄 — 트랜잭션 없이 사용일 기준 세율로 역산(domain previewCardAmounts → loadTaxRates(usedOn) → splitCardTotal).
export const previewCardAmountsAction = authedActionClient
  .schema(
    z.object({
      usedOn: usedOnSchema,
      currency: z.enum(CURRENCIES),
      amount: z.number().positive().nullable(),
      fxRate: z.number().positive().optional(),
      evidenceTypeCode: z.string().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) =>
    previewCardAmounts(ctx.viewer, {
      usedOn: parsedInput.usedOn,
      total:
        parsedInput.amount === null || (parsedInput.currency !== "KRW" && parsedInput.fxRate === undefined)
          ? null
          : { currency: parsedInput.currency, amount: parsedInput.amount, fxRate: parsedInput.fxRate ?? 1 },
      evidenceTypeCode: parsedInput.evidenceTypeCode,
    }),
  );

export const searchMerchantsAction = authedActionClient
  .schema(z.object({ query: z.string().max(100) }))
  .action(async ({ parsedInput, ctx }) => searchVendorsForPick(ctx.viewer, parsedInput));
