import { describe, expect, it } from "vitest";
import { z } from "zod";
import { submitOutcomeFromValidationErrors } from "@/app/c/[token]/flow-rules";
import { submitCertificateSchema } from "@/app/c/[token]/submit-schema";
import { SIGNATURE_BASE64_MAX_LENGTH } from "@/domain/certs/signature-png";

// 검토 L4 — 공개 제출 액션의 입력 스키마는 "use server" 파일 밖 보통 모듈에 있다.
// next-safe-action 기본 validationErrors 모양(formatted)은 z.formatError와 같다.
// 04.3-15 — 명단이 없어 경품 id · 멱등 키 · 페이지가 준 안내 판으로 제출한다(옛 자리 · 증표 칸 없음).

function validInput(signaturePngBase64: string = "A".repeat(100)) {
  return {
    token: "t".repeat(32),
    prizeId: "00000000-0000-4000-8000-000000000000",
    name: "김하늘",
    rrnFront6: "930412",
    rrnBack7: "2123458",
    phone: "010-4821-7730",
    consent: true as const,
    signaturePngBase64,
    idempotencyKey: "k".repeat(36),
    consentVersion: "v2",
    retentionYears: 5,
  };
}

describe("submitCertificateSchema — 경품 id 본문(04.3-15)", () => {
  it("경품 id · 멱등 키 · 안내 판 · 칸을 받는다(주소 · 되묻기 표시는 선택)", () => {
    expect(submitCertificateSchema.safeParse(validInput()).success).toBe(true);
    expect(
      submitCertificateSchema.safeParse({ ...validInput(), address: "서울시 강남구 테헤란로 1", rrnRecheckConfirmed: true })
        .success,
    ).toBe(true);
  });

  it("prizeId가 없는 본문은 거부한다", () => {
    const { prizeId: _omit, ...withoutPrize } = validInput();
    void _omit;
    expect(submitCertificateSchema.safeParse(withoutPrize).success).toBe(false);
  });

  it("prizeId가 uuid가 아니면 거부한다", () => {
    expect(submitCertificateSchema.safeParse({ ...validInput(), prizeId: "not-a-uuid" }).success).toBe(false);
  });

  it("옛 증표 칸(rowId · proof · winnerVersion)만 있고 prizeId가 없는 본문은 거부한다", () => {
    const { prizeId: _omit, ...rest } = validInput();
    void _omit;
    const old = { ...rest, rowId: "00000000-0000-4000-8000-000000000000", proof: "p".repeat(32), winnerVersion: 1 };
    expect(submitCertificateSchema.safeParse(old).success).toBe(false);
  });
});

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
