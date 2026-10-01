"use server";

import { headers } from "next/headers";
import { publicActionClient } from "@/lib/actions/client";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";
import { clientIp } from "@/lib/client-ip";
import { submitCertificate } from "@/domain/certs/intake";
import { submitCertificateSchema } from "./submit-schema";

// 04.3-02 Task 2 ⑮ · 04.3-15 — 공개 액션은 제출 하나다(명단 · 이름 고르기 · 전화번호 확인이 없다).
// publicActionClient로 감싸고 첫 줄에 assertCertFeatureEnabled()(규약 C1 — 페이지를 거치지 않은 직접
// 호출도 막는다). domain 함수 하나만 부르고 결과 유니온을 그대로 돌려준다. 입력 스키마는 submit-schema.ts
// (칸마다 최대 길이 · 서명 상한 → 칸 오류 signature). 속도 제한용 IP는 domain이 키 있는 해시로만 쓴다.
export const submitCertificateAction = publicActionClient
  .schema(submitCertificateSchema)
  .action(async ({ parsedInput }) => {
    await assertCertFeatureEnabled();
    const { token, ...input } = parsedInput;
    return submitCertificate(token, input, clientIp(await headers()));
  });
