"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";
import { getSessionId } from "@/lib/viewer";
import { clientIp } from "@/lib/client-ip";
import type { Viewer } from "@/domain/viewer";
import { touchPrivacySession } from "@/domain/certs/privacy-session";
import { correctSubmission, excludeSubmission, recordRrnReopen, revealRrn } from "@/domain/certs/review";
import "./actions.registry";

// 04.3-07 — I4 액션 셋. 순서가 모두 같다: 기능 게이트(C1 — 페이지를 거치지 않은 직접 POST도
// 여기서 not-found) → 개인정보취급자 비활동 판정(만료면 sessionExpired · 볼 수 없는 사람은
// 게이트 꺼짐과 같은 not-found) → domain 함수 하나(접속기록의 접속지 IP — 04.3-14 사용자 결정 ⑤).

async function touchOrStop(viewer: Viewer): Promise<"ok" | "expired"> {
  const sessionId = await getSessionId();
  if (!sessionId) return "expired";
  const touched = await touchPrivacySession(viewer, sessionId);
  if (touched.kind === "notAllowed") notFound();
  return touched.kind;
}

const idSchema = z.object({ id: z.string().uuid() });

async function access(): Promise<{ ip: string | null }> {
  return { ip: clientIp(await headers()) };
}

// 04.3-14 G3 a — 화면 입력이 이어지는 동안 마지막 서버 활동 기록 뒤 5분마다 한 번 보내는 활동 기록(privacy-idle-logout.tsx).
// 게이트 → 비활동 판정만 한다(다른 일 없음). 끊겼으면 화면이 로그인으로 간다.
export const touchPrivacySessionAction = authedActionClient.action(async ({ ctx }) => {
  await assertCertFeatureEnabled();
  if ((await touchOrStop(ctx.viewer)) === "expired") return { kind: "sessionExpired" as const };
  return { kind: "ok" as const };
});

export const revealCertRrnAction = authedActionClient.schema(idSchema).action(async ({ parsedInput, ctx }) => {
  await assertCertFeatureEnabled();
  if ((await touchOrStop(ctx.viewer)) === "expired") return { kind: "sessionExpired" as const };
  return revealRrn(ctx.viewer, parsedInput.id, await access());
});

export const reopenCertRrnAction = authedActionClient.schema(idSchema).action(async ({ parsedInput, ctx }) => {
  await assertCertFeatureEnabled();
  if ((await touchOrStop(ctx.viewer)) === "expired") return { kind: "sessionExpired" as const };
  return recordRrnReopen(ctx.viewer, parsedInput.id, await access());
});

export const correctCertSubmissionAction = authedActionClient
  .schema(
    z.object({
      id: z.string().uuid(),
      version: z.number().int().min(1),
      name: z.string().max(200),
      phone: z.string().max(40),
      address: z.string().max(1000).nullish(),
      rrn: z.string().max(20).optional(),
      rrnRecheckConfirmed: z.boolean().optional(),
      quantity: z.union([z.number(), z.string().max(10)]).optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await assertCertFeatureEnabled();
    if ((await touchOrStop(ctx.viewer)) === "expired") return { kind: "sessionExpired" as const };
    const { id, ...input } = parsedInput;
    return correctSubmission(ctx.viewer, id, input, await access());
  });

// 04.3-17 — 「대조 제외」(I4 머리 2차 · 확인 창 — E1 b · UD-2 a). 되돌릴 수 없는 파기라 정정과 같은 쓰기 판정(domain). 성공이면
// 화면이 I′3로 돌아가고 그 줄이 제외 모양으로 다시 그려진다.
export const excludeCertSubmissionAction = authedActionClient
  .schema(z.object({ id: z.string().uuid(), version: z.number().int().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    await assertCertFeatureEnabled();
    if ((await touchOrStop(ctx.viewer)) === "expired") return { kind: "sessionExpired" as const };
    const result = await excludeSubmission(ctx.viewer, parsedInput.id, { version: parsedInput.version });
    if (result.kind !== "excluded") return result;
    revalidatePath(`/certs/events/${result.eventId}`);
    revalidatePath("/certs/events");
    // 이름은 응답에 싣지 않는다 — I′3이 제외된 줄에서 토스트 이름을 다시 읽는다.
    return { kind: "excluded" as const, eventId: result.eventId };
  });
