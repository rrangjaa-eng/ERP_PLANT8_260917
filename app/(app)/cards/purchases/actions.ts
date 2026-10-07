"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import {
  createPurchaseRequest,
  LINK_URL_FORMAT,
  precheckPurchaseRequest,
  previewPurchaseSupply,
  searchLinesForPurchaseLink,
  type PurchaseRequestInput,
} from "@/domain/purchase-requests";
import "./actions.registry";

// 06-08(EXP-10 · T-06-37): 구매 요청 신청 · 구매 요청 모드 줄 고르기. domain/purchase-requests만 부른다.
// 사람은 품목 · 링크 · 예상 금액만 보낸다 — 공급가 추정 · 남은 실행가 · 번호 칸은 이 스키마에 없다(서버가 정한다 — T-06-521).

const AMOUNT_NOT_NUMBER = "숫자 아님 · 1,240,000처럼";
const ESTIMATE_NOT_POSITIVE = "예상 금액 0 이하 · 금액 고치기";

const createPurchaseRequestSchema = z.object({
  lineId: z.uuid(),
  itemName: z.string().max(200),
  // 링크는 비어 있거나 http(s)로 시작해야 한다 — DB `purchase_requests_link_url_check`와 같은 규칙.
  linkUrl: z
    .string()
    .max(2000)
    .refine((value) => value.trim() === "" || /^https?:\/\//i.test(value.trim()), LINK_URL_FORMAT)
    .nullable(),
  amount: z.number({ error: AMOUNT_NOT_NUMBER }).positive(ESTIMATE_NOT_POSITIVE),
  memo: z.string().max(500).nullable(),
});

export const createPurchaseRequestAction = authedActionClient.schema(createPurchaseRequestSchema).action(async ({ parsedInput, ctx }) => {
  const input: PurchaseRequestInput = {
    linkKind: "quote_line",
    lineId: parsedInput.lineId,
    itemName: parsedInput.itemName,
    linkUrl: parsedInput.linkUrl,
    estimate: { currency: "KRW", amount: parsedInput.amount, fxRate: 1 },
    memo: parsedInput.memo,
  };
  const pre = await precheckPurchaseRequest(ctx.viewer, input);
  const created = await createPurchaseRequest(ctx.viewer, input, pre);
  revalidatePath("/cards/purchases");
  return created;
});

// 06-08(S10 구매 요청 모드): 온라인구매 협력사 줄만 고를 수 있고 나머지는 2행 이유(문 가르기).
export const searchLinesForPurchaseLinkAction = authedActionClient
  .schema(z.object({ projectId: z.uuid(), query: z.string().max(100), currentLineId: z.uuid().nullable() }))
  .action(async ({ parsedInput, ctx }) => searchLinesForPurchaseLink(ctx.viewer, parsedInput));

// 서버 계산 한 줄 — 예상 금액의 공급가 추정(트랜잭션 없음). 상한 판정은 신청이 잠근 뒤 다시 한다.
export const previewPurchaseSupplyAction = authedActionClient
  .schema(z.object({ lineId: z.uuid(), amount: z.number().positive() }))
  .action(async ({ parsedInput, ctx }) => previewPurchaseSupply(ctx.viewer, { lineId: parsedInput.lineId, amountKrw: parsedInput.amount }));
