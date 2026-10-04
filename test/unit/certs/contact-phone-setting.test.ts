import { describe, expect, it } from "vitest";
import { CERT_CONTACT_PHONE } from "@/domain/settings/keys";

// 04.3-09 — 설정 「확인증」 묶음의 수령자 문의 전화 스키마. 04.3-02가 만든 스키마를
// 고정하는 특성 테스트다(처음부터 녹색). 공유 설정 값은 건드리지 않는다 — E2E는
// 형식 오류 경로만 보고, 올바른 값 · 비우기는 여기서 본다.
const FORMAT_ERROR = "전화번호 형식이 아닙니다 · 02-1234-5678처럼 적어 주세요";

describe("CERT_CONTACT_PHONE 설정 스키마", () => {
  it("빈 값은 허용한다(비우기는 막지 않는다)", () => {
    expect(CERT_CONTACT_PHONE.schema.parse("")).toBe("");
  });

  it.each([
    ["02-1234-5678", "0212345678"],
    ["031-123-4567", "0311234567"],
    ["1588-1234", "15881234"],
    ["010-1234-5678", "01012345678"],
  ])("%s는 허용하고 숫자만 저장한다", (raw, digits) => {
    expect(CERT_CONTACT_PHONE.schema.parse(raw)).toBe(digits);
  });

  it("틀린 형식(02-12)은 거부하고 오류 문장이 정해진 그대로다", () => {
    const result = CERT_CONTACT_PHONE.schema.safeParse("02-12");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.message)).toEqual([FORMAT_ERROR]);
  });
});
