import { describe, expect, it } from "vitest";
import { companyInfoLine, companyWordmark } from "@/app/print/_frame/company-line";

const full = { name: "플랜트", address: "서울시 강남구", businessNo: "123-45-67890", representative: "홍길동", phone: "02-123-4567" };
const empty = { name: "", address: "", businessNo: "", representative: "", phone: "" };

describe("companyInfoLine (D-7405 B줄)", () => {
  it("넷 다 채우면 구분점으로 잇는다", () => {
    expect(companyInfoLine(full)).toBe("서울시 강남구 · 사업자번호 123-45-67890 · 대표 홍길동 · 전화 02-123-4567");
  });

  it("주소만 있으면 구분점 없이 한 항목이다", () => {
    expect(companyInfoLine({ ...empty, address: "서울시" })).toBe("서울시");
  });

  it("빈 항목은 이름째 빠진다", () => {
    expect(companyInfoLine({ ...full, address: "", representative: "" })).toBe("사업자번호 123-45-67890 · 전화 02-123-4567");
  });

  it("이름만 채워졌거나 공백뿐이면 null이다", () => {
    expect(companyInfoLine({ ...empty, name: "플랜트" })).toBeNull();
    expect(companyInfoLine({ ...empty, address: "   ", phone: " " })).toBeNull();
  });
});

describe("companyWordmark (D-7406 · 사용자 카드 F3)", () => {
  it("회사명 앞뒤 공백을 걷는다", () => {
    expect(companyWordmark(" 플랜트 ")).toBe("플랜트");
  });

  it("비거나 공백뿐이면 PLANT8이다", () => {
    expect(companyWordmark("")).toBe("PLANT8");
    expect(companyWordmark("   ")).toBe("PLANT8");
  });
});
