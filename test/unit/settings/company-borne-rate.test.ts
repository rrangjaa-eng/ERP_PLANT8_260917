import { describe, expect, it } from "vitest";
import { TAX_COMPANY_BORNE_RATE } from "@/domain/settings/keys";
import { koreanZodErrorMessage } from "@/lib/actions/zod-error-message";

// 05-06 돈 검토 m5 — gross-up은 공급가액 / (1 − 세율)이라 세율 1(100%)은 0 나누기다. 1 미만만 저장한다.
describe("회사 대납 세율 범위", () => {
  it.each([0, 0.22, 0.999999])("허용: %s", (value) => {
    expect(TAX_COMPANY_BORNE_RATE.schema.safeParse(value).success).toBe(true);
  });

  it.each([1, 1.5, -0.1])("거부: %s", (value) => {
    expect(TAX_COMPANY_BORNE_RATE.schema.safeParse(value).success).toBe(false);
  });

  it("1의 거부 문구는 설정 화면 오류 한 줄 「1 미만만 가능 · 값 확인」이다", () => {
    const result = TAX_COMPANY_BORNE_RATE.schema.safeParse(1);
    if (result.success) throw new Error("test setup 오류: 실패해야 할 파싱이 성공했다");
    expect(koreanZodErrorMessage(result.error)).toBe("1 미만만 가능 · 값 확인");
  });
});
