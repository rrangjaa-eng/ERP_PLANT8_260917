import { describe, expect, it } from "vitest";
import { z } from "zod";
import { submitOutcomeFromValidationErrors } from "@/app/c/[token]/flow-rules";
import { submitCertificateSchema } from "@/app/c/[token]/submit-schema";
import { SIGNATURE_BASE64_MAX_LENGTH } from "@/domain/certs/signature-png";

// 검토 L4 — 공개 제출 액션의 입력 스키마는 "use server" 파일 밖 보통 모듈에 있다.
// next-safe-action 기본 validationErrors 모양(formatted)은 z.formatError와 같다.

function validInput(signaturePngBase64: string) {
  return {
    token: "t".repeat(32),
    rowId: "00000000-0000-4000-8000-000000000000",
    proof: "p".repeat(32),
    name: "김하늘",
    rrnFront6: "930412",
    rrnBack7: "2123458",
    phone: "010-4821-7730",
    consent: true as const,
    signaturePngBase64,
    idempotencyKey: "k".repeat(36),
    winnerVersion: 1,
    consentVersion: "v2",
    retentionYears: 5,
  };
}

describe("submitCertificateSchema — 서명 최대 길이(검토 L4)", () => {
  it("상한 길이의 서명 문자열은 통과한다", () => {
    expect(submitCertificateSchema.safeParse(validInput("A".repeat(SIGNATURE_BASE64_MAX_LENGTH))).success).toBe(true);
  });

  it("상한 + 1 길이의 서명 문자열은 signature 칸 오류다", () => {
    const parsed = submitCertificateSchema.safeParse(validInput("A".repeat(SIGNATURE_BASE64_MAX_LENGTH + 1)));
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(submitOutcomeFromValidationErrors(z.formatError(parsed.error))).toEqual({
      kind: "invalid",
      fields: ["signature"],
    });
  });
});
