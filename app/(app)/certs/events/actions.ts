"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";
import { generateQr, prizeChangesSchema, requestQr, savePrizes } from "@/domain/certs/events";
import "./actions.registry";

// 04.3-10 — 「QR 생성 신청」(I′2) · 「QR 생성」(I′3 신청됨 1차) · 경품 표 저장(I′3 「일괄 저장」 · Ctrl+S). 첫 줄 기능 게이트(C1) → domain 함수 하나 → 결과 유니온
// 그대로. 칸 내용은 domain이 셀 · 칸 오류로 판정하므로 여기서는 모양만 받는다.

export const requestCertQrAction = authedActionClient
  .schema(z.object({ name: z.string(), wonOn: z.string(), requestId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await assertCertFeatureEnabled();
    const result = await requestQr(ctx.viewer, parsedInput);
    if (result.kind === "ok") revalidatePath("/certs/events");
    return result;
  });

export const generateCertQrAction = authedActionClient
  .schema(z.object({ eventId: z.string().uuid(), requestId: z.string().uuid(), changes: prizeChangesSchema }))
  .action(async ({ parsedInput, ctx }) => {
    await assertCertFeatureEnabled();
    const result = await generateQr(ctx.viewer, parsedInput.eventId, {
      requestId: parsedInput.requestId,
      changes: parsedInput.changes,
    });
    if (result.kind === "ok") revalidatePath(`/certs/events/${parsedInput.eventId}`);
    return result;
  });

export const saveCertPrizesAction = authedActionClient
  .schema(z.object({ eventId: z.string().uuid(), changes: prizeChangesSchema }))
  .action(async ({ parsedInput, ctx }) => {
    await assertCertFeatureEnabled();
    const result = await savePrizes(ctx.viewer, parsedInput.eventId, { changes: parsedInput.changes });
    if (result.kind === "saved") revalidatePath(`/certs/events/${parsedInput.eventId}`);
    return result;
  });
