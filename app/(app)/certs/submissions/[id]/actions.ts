"use server";

import { z } from "zod";
import { notFound } from "next/navigation";
import { authedActionClient } from "@/lib/actions/client";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";
import { getSessionId } from "@/lib/viewer";
import type { Viewer } from "@/domain/viewer";
import { touchPrivacySession } from "@/domain/certs/privacy-session";
import { correctSubmission, recordRrnReopen, revealRrn } from "@/domain/certs/review";
import "./actions.registry";

// 04.3-07 — I4 액션 셋. 순서가 모두 같다: 기능 게이트(C1 — 페이지를 거치지 않은 직접 POST도
// 여기서 not-found) → 개인정보취급자 비활동 판정(만료면 sessionExpired · 볼 수 없는 사람은
// 게이트 꺼짐과 같은 not-found) → domain 함수 하나.

async function touchOrStop(viewer: Viewer): Promise<"ok" | "expired"> {
  const sessionId = await getSessionId();
  if (!sessionId) return "expired";
  const touched = await touchPrivacySession(viewer, sessionId);
  if (touched.kind === "notAllowed") notFound();
  return touched.kind;
}

const idSchema = z.object({ id: z.string().uuid() });

export const revealCertRrnAction = authedActionClient.schema(idSchema).action(async ({ parsedInput, ctx }) => {
  await assertCertFeatureEnabled();
  if ((await touchOrStop(ctx.viewer)) === "expired") return { kind: "sessionExpired" as const };
  return revealRrn(ctx.viewer, parsedInput.id);
});

export const reopenCertRrnAction = authedActionClient.schema(idSchema).action(async ({ parsedInput, ctx }) => {
  await assertCertFeatureEnabled();
  if ((await touchOrStop(ctx.viewer)) === "expired") return { kind: "sessionExpired" as const };
  return recordRrnReopen(ctx.viewer, parsedInput.id);
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
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await assertCertFeatureEnabled();
    if ((await touchOrStop(ctx.viewer)) === "expired") return { kind: "sessionExpired" as const };
    const { id, ...input } = parsedInput;
    return correctSubmission(ctx.viewer, id, input);
  });
