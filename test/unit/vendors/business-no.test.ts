import { describe, expect, it } from "vitest";
import { businessNoDigits } from "@/domain/vendors";
import { vendorKindToAdd } from "@/domain/vendors/kind";

// 거래처 사업자번호 중복 막기(PR A) — 비교는 숫자만 뽑은 값이다(SQL `[^0-9]` 제거와 같은 결과).
describe("businessNoDigits — 표기 차이를 지운 숫자", () => {
  it("하이픈 · 공백 · 없음이 같은 값이다", () => {
    expect(businessNoDigits("214-86-10231")).toBe("2148610231");
    expect(businessNoDigits("214 86 10231")).toBe("2148610231");
    expect(businessNoDigits("2148610231")).toBe("2148610231");
  });

  it("숫자가 없으면 null이다", () => {
    expect(businessNoDigits("")).toBeNull();
    expect(businessNoDigits("---")).toBeNull();
    expect(businessNoDigits(null)).toBeNull();
    expect(businessNoDigits(undefined)).toBeNull();
  });
});

// 같은 사업자번호 거래처가 다른 갈래로만 있을 때 「구분 더하기」로 켤 갈래 — 못 켜면 null.
describe("vendorKindToAdd — 구분 더하기 판정", () => {
  it("기존 갈래가 새 갈래를 덮으면 null이다", () => {
    expect(vendorKindToAdd("client", "client", false)).toBeNull();
    expect(vendorKindToAdd("supplier", "supplier", false)).toBeNull();
    expect(vendorKindToAdd("both", "client", false)).toBeNull();
    expect(vendorKindToAdd("both", "supplier", false)).toBeNull();
    expect(vendorKindToAdd("both", "both", false)).toBeNull();
  });

  it("다른 갈래로만 있으면 없는 갈래를 돌려준다", () => {
    expect(vendorKindToAdd("client", "supplier", false)).toBe("supplier");
    expect(vendorKindToAdd("supplier", "client", false)).toBe("client");
    expect(vendorKindToAdd("client", "both", false)).toBe("supplier");
    expect(vendorKindToAdd("supplier", "both", false)).toBe("client");
  });

  it("보관된 거래처는 갈래를 더할 수 없다", () => {
    expect(vendorKindToAdd("client", "supplier", true)).toBeNull();
  });
});
