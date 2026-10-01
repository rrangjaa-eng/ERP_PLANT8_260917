"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { authedActionClient } from "@/lib/actions/client";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";
import { cancelRequest, closeEvent, generateQr, prizeChangesSchema, requestQr, savePrizes } from "@/domain/certs/events";
import "./actions.registry";
import { CANCELLED_TOAST_COOKIE, cancelledToastCookieOptions } from "./cancelled-toast-cookie";

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
    // 이미 생성됨도 화면을 다시 그린다 — 다른 키로 생긴 QR · 접수 중 상태를 보여 준다(독립 검토 W3).
    if (result.kind === "ok" || result.kind === "alreadyGenerated") revalidatePath(`/certs/events/${parsedInput.eventId}`);
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

// 04.3-17 — 「링크 닫기」(I′3 머리 2차 · 확인 모달). 이미 닫혔어도 화면을 다시 그린다(다른 사람이 닫은 상태를 보인다).
export const closeCertEventAction = authedActionClient
  .schema(z.object({ eventId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await assertCertFeatureEnabled();
    const result = await closeEvent(ctx.viewer, parsedInput.eventId);
    if (result.kind !== "notFound") {
      revalidatePath(`/certs/events/${parsedInput.eventId}`);
      revalidatePath("/certs/events");
    }
    return result;
  });

// 04.3-17 — 「신청 취소」(I′3 머리 2차 · 경품 0일 때만 · 확인 없음). 성공이면 화면이 목록으로 간다.
export const cancelCertRequestAction = authedActionClient
  .schema(z.object({ eventId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await assertCertFeatureEnabled();
    const result = await cancelRequest(ctx.viewer, parsedInput.eventId);
    if (result.kind === "cancelled") {
      // 착지 토스트의 이름 — 서버가 지운 행사의 이름만(검토 X4). 목록이 읽고 곧바로 지운다.
      (await cookies()).set(CANCELLED_TOAST_COOKIE, result.name, cancelledToastCookieOptions);
      revalidatePath("/certs/events");
    }
    if (result.kind === "hasPrizes") revalidatePath(`/certs/events/${parsedInput.eventId}`);
    return result;
  });

// 04.3-17 검토 X4 — 목록 착지 토스트가 뜬 뒤 그 쿠키를 지운다(한 번만 — 새로 고침 · 뒤로 가기에 다시 없음). 쿠키 지우기는
// 렌더 중에 할 수 없어(서버 컴포넌트) 착지 화면이 이 액션을 한 번 부른다.
export const clearCertCancelledToastAction = authedActionClient.action(async () => {
  (await cookies()).delete({ name: CANCELLED_TOAST_COOKIE, path: cancelledToastCookieOptions.path });
  return { kind: "cleared" as const };
});
