"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import { isCalendarDate, seoulToday } from "@/lib/dates";
import { CURRENCIES } from "@/domain/money/currency";
import {
  createCardUsage,
  listProjectCardUsages,
  precheckCardUsage,
  precheckCardUsageUpdate,
  previewCardAmounts,
  searchMerchantsForCard,
  updateCardUsage,
  usedByCandidates,
  type CardUsageInput,
} from "@/domain/corp-card-usages";
import { cardUsedOnError, USED_ON_FUTURE } from "@/domain/corp-card-usages/amounts";
import { searchLinesForCardLink, searchProjectsForCardLink } from "@/domain/corp-card-usages/link-targets";
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
const cardUsageFields = {
  corpCardId: z.uuid(),
  usedOn: usedOnSchema.refine((usedOn) => cardUsedOnError(usedOn, seoulToday()) === null, USED_ON_FUTURE),
  merchantVendorId: z.uuid().nullable(),
  currency: z.enum(CURRENCIES),
  amount: amountSchema,
  fxRate: z.number().positive().optional(),
  evidenceTypeCode: z.string().min(1),
  // 06-07: 연결 판별 합 — 팀 비용 · 견적 줄(줄 id만 — 공급가 · 실행가 칸 없음) · 견적 외 비용(프로젝트 · 항목 — 비면 가맹점 이름).
  link: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("team") }),
      z.object({ kind: z.literal("line"), lineId: z.uuid() }),
      z.object({ kind: z.literal("out_of_quote"), projectId: z.uuid(), itemName: z.string().max(200).nullable() }),
    ])
    .nullable(),
  memo: z.string().max(500).nullable(),
  // 06-09 사용한 사람(대리 등록 · 팀 비용 · 팀 또는 공용 카드) — 후보 안인지는 서버가 사용일 기준으로 다시 본다.
  usedByUserId: z.string().min(1).max(64).nullable().optional(),
};

function fxRequired(value: { currency: string; fxRate?: number | undefined }, ctx: z.RefinementCtx): void {
  if (value.currency !== "KRW" && value.fxRate === undefined) ctx.addIssue({ code: "custom", message: FX_MISSING, path: ["fxRate"] });
}

const createCardUsageSchema = z.object(cardUsageFields).superRefine(fxRequired);

// 06-09 수정(B-1 · D-609) — 건 id · version 필수. 공급가 · 부가세 칸은 없다(서버 재역산).
const updateCardUsageSchema = z.object({ ...cardUsageFields, id: z.uuid(), version: z.number().int().positive() }).superRefine(fxRequired);

function toCardUsageInput(parsedInput: z.infer<typeof createCardUsageSchema>): CardUsageInput {
  const base = {
    corpCardId: parsedInput.corpCardId,
    usedOn: parsedInput.usedOn,
    merchantVendorId: parsedInput.merchantVendorId,
    total: { currency: parsedInput.currency, amount: parsedInput.amount, fxRate: parsedInput.fxRate ?? 1 },
    evidenceTypeCode: parsedInput.evidenceTypeCode,
    memo: parsedInput.memo,
    usedByUserId: parsedInput.usedByUserId ?? null,
  };
  const link = parsedInput.link;
  return link === null
      ? { ...base, linkKind: null }
      : link.kind === "team"
        ? { ...base, linkKind: "team_cost" }
        : link.kind === "line"
          ? { ...base, linkKind: "quote_line", lineId: link.lineId }
          : { ...base, linkKind: "out_of_quote", projectId: link.projectId, itemName: link.itemName };
}

export const createCardUsageAction = authedActionClient.schema(createCardUsageSchema).action(async ({ parsedInput, ctx }) => {
  const input = toCardUsageInput(parsedInput);
  const pre = await precheckCardUsage(ctx.viewer, input);
  const created = await createCardUsage(ctx.viewer, input, pre);
  revalidatePath("/cards");
  return created;
});

// 06-09 수정 — 권리(O-11) · 카드 그대로 · 잠금 뒤 게이트 · Q3 상한은 domain이 판정한다(사전 조회 → 몸통).
export const updateCardUsageAction = authedActionClient.schema(updateCardUsageSchema).action(async ({ parsedInput, ctx }) => {
  const input = { ...toCardUsageInput(parsedInput), id: parsedInput.id, version: parsedInput.version };
  const pre = await precheckCardUsageUpdate(ctx.viewer, input);
  const updated = await updateCardUsage(ctx.viewer, input, pre);
  revalidatePath("/cards");
  return updated;
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

// 06-09(EXP-07 · Q5): 대리 등록 · 팀 비용의 `사용한 사람` 후보 — 사용일 기준. 권한(cards.proxy write)은 domain이 본다.
export const usedByCandidatesAction = authedActionClient
  .schema(z.object({ cardId: z.uuid(), usedOn: usedOnSchema }))
  .action(async ({ parsedInput, ctx }) => usedByCandidates(ctx.viewer, parsedInput));

export const searchMerchantsAction = authedActionClient
  .schema(z.object({ query: z.string().max(100) }))
  .action(async ({ parsedInput, ctx }) => searchMerchantsForCard(ctx.viewer, parsedInput));

// 06-07(S10): 연결 고르기 목록 — 프로젝트 · 견적 줄. 줄마다 고를 수 있음 · 이유 · 남은 실행가는 서버가 정한다.
export const searchProjectsForCardLinkAction = authedActionClient
  .schema(z.object({ query: z.string().max(100) }))
  .action(async ({ parsedInput, ctx }) => searchProjectsForCardLink(ctx.viewer, parsedInput));

export const searchLinesForCardLinkAction = authedActionClient
  .schema(z.object({ projectId: z.uuid(), query: z.string().max(100), currentLineId: z.uuid().nullable() }))
  .action(async ({ parsedInput, ctx }) => searchLinesForCardLink(ctx.viewer, parsedInput));

// 06-07(S15): 프로젝트 상세 「법인카드 사용」 섹션 — 섹션이 따로 불러 실패해도 상세의 다른 섹션은 선다(§7-7). 금액 칸은 서버가 가른다.
export const listProjectCardUsagesAction = authedActionClient
  .schema(z.object({ projectId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => listProjectCardUsages(ctx.viewer, parsedInput.projectId));
