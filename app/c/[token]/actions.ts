"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { publicActionClient } from "@/lib/actions/client";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";
import { clientIp } from "@/lib/client-ip";
import { recheckWinnerLock, selectWinner, submitCertificate, verifyLast4 } from "@/domain/certs/intake";
import { SIGNATURE_BASE64_MAX_LENGTH } from "@/domain/certs/signature-png";

// 04.3-02 Task 2 ⑮ — 공개 액션(04.3-03이 넷째 recheckLockAction을 더했다). 전부 publicActionClient로 감싸고 첫
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
      last4: z.string().regex(/^\d{4}$/),
      idemKey: z.string().regex(/^[A-Za-z0-9_-]{22,64}$/),
    }),
  )
  .action(async ({ parsedInput }) => {
    await assertCertFeatureEnabled();
    // 04.3-03 ⑥ — 속도 제한용 IP. domain이 키 있는 해시로만 쓰고 로그에 남기지 않는다.
    const ip = clientIp(await headers());
    return verifyLast4(parsedInput.token, parsedInput.rowId, parsedInput.last4, parsedInput.idemKey, ip);
  });

// 04.3-03 ⑤-b — E3 누적 잠김 복구 길의 잠금 다시 확인(읽기 전용).
export const recheckLockAction = publicActionClient
  .schema(z.object({ token: z.string().min(1), rowId: z.uuid() }))
  .action(async ({ parsedInput }) => {
    await assertCertFeatureEnabled();
    return recheckWinnerLock(parsedInput.token, parsedInput.rowId);
  });

// 04.3-06 ⑤ — 칸마다 최대 길이를 둔다(본문 한도 예산 — test/unit/certs/signature-png.test.ts).
// 서명 문자열이 상한의 base64 길이를 넘으면 본문 한도 오류가 아니라 validationErrors.signature
// (칸 오류)로 돌아간다 — 화면이 서명 칸 오류로 바꾼다.
export const submitCertificateAction = publicActionClient
  .schema(
    z.object({
      token: z.string().min(1).max(128),
      rowId: z.uuid(),
      proof: z.string().min(1).max(128),
      name: z.string().min(1).max(40),
      rrnFront6: z.string().max(6),
      rrnBack7: z.string().max(7),
      phone: z.string().max(40),
      address: z.string().max(200).optional(),
      consent: z.literal(true),
      signaturePngBase64: z.string().min(1).max(SIGNATURE_BASE64_MAX_LENGTH),
      idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{22,64}$/),
      winnerVersion: z.number().int().min(1).max(2_147_483_647),
      consentVersion: z.string().min(1).max(20),
      retentionYears: z.number().int().min(1).max(99),
      rrnRecheckConfirmed: z.boolean().optional(),
    }),
  )
  .action(async ({ parsedInput }) => {
    await assertCertFeatureEnabled();
    const { token, ...input } = parsedInput;
    return submitCertificate(token, input);
  });
