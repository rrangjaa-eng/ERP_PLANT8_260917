"use server";

import { z } from "zod";
import { publicActionClient } from "@/lib/actions/client";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";
import { selectWinner, submitCertificate, verifyLast4 } from "@/domain/certs/intake";

// 04.3-02 Task 2 ⑮ — 공개 액션 셋. 전부 publicActionClient로 감싸고 첫
// 줄에 assertCertFeatureEnabled()(규약 C1 — 페이지를 거치지 않은 직접
// 호출도 막는다). domain 함수 하나만 부르고 결과 유니온을 그대로 돌려준다.

export const selectWinnerAction = publicActionClient
  .schema(z.object({ token: z.string().min(1), rowId: z.uuid() }))
  .action(async ({ parsedInput }) => {
    await assertCertFeatureEnabled();
    return selectWinner(parsedInput.token, parsedInput.rowId);
  });

export const verifyLast4Action = publicActionClient
  .schema(
    z.object({
      token: z.string().min(1),
      rowId: z.uuid(),
      last4: z.string().min(1).max(4),
      idemKey: z.string().min(1),
    }),
  )
  .action(async ({ parsedInput }) => {
    await assertCertFeatureEnabled();
    return verifyLast4(parsedInput.token, parsedInput.rowId, parsedInput.last4, parsedInput.idemKey);
  });

export const submitCertificateAction = publicActionClient
  .schema(
    z.object({
      token: z.string().min(1),
      rowId: z.uuid(),
      proof: z.string().min(1),
      name: z.string().min(1).max(40),
      rrnFront6: z.string(),
      rrnBack7: z.string(),
      phone: z.string(),
      address: z.string().max(200).optional(),
      consent: z.literal(true),
      signaturePngBase64: z.string().min(1),
      idempotencyKey: z.string().min(1),
      consentVersion: z.string().min(1),
      retentionYears: z.coerce.number().int().min(1),
      rrnRecheckConfirmed: z.boolean().optional(),
    }),
  )
  .action(async ({ parsedInput }) => {
    await assertCertFeatureEnabled();
    const { token, ...input } = parsedInput;
    return submitCertificate(token, input);
  });
