"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import { isCalendarDate, seoulToday } from "@/lib/dates";
import { CURRENCIES } from "@/domain/money/currency";
import { cardUsedOnError, USED_ON_FUTURE } from "@/domain/corp-card-usages/amounts";
import {
  completePurchaseRequest,
  createPurchaseRequest,
  LINK_URL_FORMAT,
  precheckPurchaseCompletion,
  precheckPurchaseRequest,
  previewPurchaseCompletion,
  previewPurchaseSupply,
  searchLinesForPurchaseLink,
  type PurchaseRequestInput,
} from "@/domain/purchase-requests";
import "./actions.registry";

// 06-08(EXP-10 · T-06-37): 구매 요청 신청 · 구매 요청 모드 줄 고르기. domain/purchase-requests만 부른다.
// 사람은 품목 · 링크 · 예상 금액만 보낸다 — 공급가 추정 · 남은 실행가 · 번호 칸은 이 스키마에 없다(서버가 정한다 — T-06-521).

const AMOUNT_NOT_NUMBER = "숫자 아님 · 1,240,000처럼";
const ESTIMATE_NOT_POSITIVE = "예상 금액 0 이하 · 금액 고치기";

// 링크는 비어 있거나 http(s)로 시작해야 한다 — DB `purchase_requests_link_url_check`와 같은 규칙.
const requestFields = {
  itemName: z.string().max(200),
  linkUrl: z
    .string()
    .max(2000)
    .refine((value) => value.trim() === "" || /^https?:\/\//i.test(value.trim()), LINK_URL_FORMAT)
    .nullable(),
  currency: z.enum(CURRENCIES).default("KRW"),
  amount: z.number({ error: AMOUNT_NOT_NUMBER }).positive(ESTIMATE_NOT_POSITIVE),
  fxRate: z.number().positive().optional(),
  memo: z.string().max(500).nullable(),
};

// 06-14: 연결 판별 합 — 견적 줄(`lineId`) / 팀 비용. 팀 · 사용한 사람 · 원화 환산액 칸은 없다(보내도 zod가 버린다 — O-19 · T-06-66 · T-06-69).
const createPurchaseRequestSchema = z
  .discriminatedUnion("linkKind", [
    z.object({ linkKind: z.literal("quote_line"), lineId: z.uuid(), ...requestFields }),
    z.object({ linkKind: z.literal("team_cost"), ...requestFields }),
  ])
  .superRefine((value, ctx) => {
    if (value.currency !== "KRW" && value.fxRate === undefined) ctx.addIssue({ code: "custom", message: `환율 없음 · ${value.currency} 환율 적기`, path: ["fxRate"] });
  });

export const createPurchaseRequestAction = authedActionClient.schema(createPurchaseRequestSchema).action(async ({ parsedInput, ctx }) => {
  const fields = {
    itemName: parsedInput.itemName,
    linkUrl: parsedInput.linkUrl,
    estimate: { currency: parsedInput.currency, amount: parsedInput.amount, fxRate: parsedInput.fxRate ?? 1 },
    memo: parsedInput.memo,
  };
  const input: PurchaseRequestInput =
    parsedInput.linkKind === "quote_line" ? { linkKind: "quote_line", lineId: parsedInput.lineId, ...fields } : { linkKind: "team_cost", ...fields };
  const pre = await precheckPurchaseRequest(ctx.viewer, input);
  const created = await createPurchaseRequest(ctx.viewer, input, pre);
  revalidatePath("/cards/purchases");
  revalidatePath("/cards");
  return created;
});

// 06-08(S10 구매 요청 모드): 온라인구매 협력사 줄만 고를 수 있고 나머지는 2행 이유(문 가르기).
export const searchLinesForPurchaseLinkAction = authedActionClient
  .schema(z.object({ projectId: z.uuid(), query: z.string().max(100), currentLineId: z.uuid().nullable() }))
  .action(async ({ parsedInput, ctx }) => searchLinesForPurchaseLink(ctx.viewer, parsedInput));

// 서버 계산 한 줄 — 예상 금액의 원화 환산액(외화) · 견적 줄 연결이면 공급가 추정(트랜잭션 없음). 상한 판정은 신청이 잠근 뒤 다시 한다.
export const previewPurchaseSupplyAction = authedActionClient
  .schema(z.object({ lineId: z.uuid().nullable(), currency: z.enum(CURRENCIES), amount: z.number().positive(), fxRate: z.number().positive().optional() }))
  .action(async ({ parsedInput, ctx }) =>
    previewPurchaseSupply(ctx.viewer, { lineId: parsedInput.lineId, estimate: { currency: parsedInput.currency, amount: parsedInput.amount, fxRate: parsedInput.fxRate ?? 1 } }),
  );

// ── 06-12 구매 완료(S13) ──────────────────────────────────────────────────────
// 사람은 카드 · 사용일 · 가맹점 · 결제 합계 · 증빙 종류 · 메모 · version만 보낸다 — 연결 · 사용한 사람 · 팀 · 공급가 칸은 없다(요청과 서버가 정한다).

const DATE_ERROR = "날짜 없음 · 날짜 고르기";
const TOTAL_NOT_POSITIVE = "결제 합계 0 이하 · 금액 고치기";
const FX_MISSING = "환율 없음 · USD 환율 적기";

const completePurchaseSchema = z
  .object({
    requestId: z.uuid(),
    version: z.number().int().positive(),
    corpCardId: z.uuid(),
    usedOn: z
      .string()
      .refine(isCalendarDate, DATE_ERROR)
      .refine((usedOn) => cardUsedOnError(usedOn, seoulToday()) === null, USED_ON_FUTURE),
    merchantVendorId: z.uuid().nullable(),
    currency: z.enum(CURRENCIES),
    amount: z.number({ error: AMOUNT_NOT_NUMBER }).positive(TOTAL_NOT_POSITIVE),
    fxRate: z.number().positive().optional(),
    evidenceTypeCode: z.string().min(1),
    memo: z.string().max(500).nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.currency !== "KRW" && value.fxRate === undefined) ctx.addIssue({ code: "custom", message: FX_MISSING, path: ["fxRate"] });
  });

export const completePurchaseRequestAction = authedActionClient.schema(completePurchaseSchema).action(async ({ parsedInput, ctx }) => {
  const input = {
    requestId: parsedInput.requestId,
    version: parsedInput.version,
    corpCardId: parsedInput.corpCardId,
    usedOn: parsedInput.usedOn,
    merchantVendorId: parsedInput.merchantVendorId,
    total: { currency: parsedInput.currency, amount: parsedInput.amount, fxRate: parsedInput.fxRate ?? 1 },
    evidenceTypeCode: parsedInput.evidenceTypeCode,
    memo: parsedInput.memo,
  };
  const pre = await precheckPurchaseCompletion(ctx.viewer, input);
  const done = await completePurchaseRequest(ctx.viewer, input, pre);
  revalidatePath("/cards/purchases");
  revalidatePath("/cards");
  // 실행가 초과액(Q-E)은 견적 금액을 보는 사람에게만 — 기록(행동 로그)은 그대로 남는다.
  return { requestId: done.requestId, capOver: pre.card.amountVisible ? done.capOver : null };
});

// S13 서버 계산 한 줄 — 공급가 · 부가세 · 팀(요청자의 사용일 소속) · 실행가 상한 · 예상 금액 차이(트랜잭션 없음).
export const previewPurchaseCompletionAction = authedActionClient
  .schema(
    z.object({
      requestId: z.uuid(),
      usedOn: z.string().refine(isCalendarDate, DATE_ERROR),
      currency: z.enum(CURRENCIES),
      amount: z.number().positive().nullable(),
      fxRate: z.number().positive().optional(),
      evidenceTypeCode: z.string().min(1).nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) =>
    previewPurchaseCompletion(ctx.viewer, {
      requestId: parsedInput.requestId,
      usedOn: parsedInput.usedOn,
      total:
        parsedInput.amount === null || (parsedInput.currency !== "KRW" && parsedInput.fxRate === undefined)
          ? null
          : { currency: parsedInput.currency, amount: parsedInput.amount, fxRate: parsedInput.fxRate ?? 1 },
      evidenceTypeCode: parsedInput.evidenceTypeCode,
    }),
  );
