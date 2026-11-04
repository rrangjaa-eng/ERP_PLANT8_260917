import { describe, expect, it } from "vitest";
import {
  PRINT_COMPANY_ADDRESS,
  PRINT_COMPANY_BUSINESS_NO,
  PRINT_COMPANY_NAME,
  PRINT_COMPANY_PHONE,
  PRINT_COMPANY_REPRESENTATIVE,
  SETTING_DEFS,
} from "@/domain/settings/keys";
import type { SettingDef } from "@/domain/settings/registry";
import { koreanZodErrorMessage } from "@/lib/actions/zod-error-message";

// 07.4-01 D-7405 — 인쇄 머리 회사 정보 다섯 키. 오류 문장은 화면에 실제로 나가는 koreanZodErrorMessage 결과로 단언한다(eng 검토 A1).
const FIVE: SettingDef<string>[] = [PRINT_COMPANY_NAME, PRINT_COMPANY_ADDRESS, PRINT_COMPANY_BUSINESS_NO, PRINT_COMPANY_REPRESENTATIVE, PRINT_COMPANY_PHONE];

function screenMessage(def: SettingDef<string>, value: string): string {
  const result = def.schema.safeParse(value);
  if (result.success) throw new Error(`test setup 오류: ${value}가 통과했다`);
  return koreanZodErrorMessage(result.error);
}

describe("인쇄 회사 정보 키 (D-7405)", () => {
  it("다섯 키는 namespace 「회사 정보」 · default 빈 문자열 · readInvalidAsDefault · simple이다", () => {
    expect(FIVE.map((def) => def.key)).toEqual([
      "print.company_name",
      "print.company_address",
      "print.company_business_no",
      "print.company_representative",
      "print.company_phone",
    ]);
    for (const def of FIVE) {
      expect(def.namespace).toBe("회사 정보");
      expect(def.default).toBe("");
      expect(def.readInvalidAsDefault).toBe(true);
      expect(def.kind).toBe("simple");
    }
  });

  it("SETTING_DEFS에 이 순서로 연이어 들어 있다", () => {
    const keys = SETTING_DEFS.map((def) => def.key);
    const start = keys.indexOf("print.company_name");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(keys.slice(start, start + 5)).toEqual(FIVE.map((def) => def.key));
  });

  it("힌트는 사업자번호 · 전화에만 있다", () => {
    expect(PRINT_COMPANY_BUSINESS_NO.hint).toBe("123-45-67890");
    expect(PRINT_COMPANY_PHONE.hint).toBe("02-123-4567");
    expect(PRINT_COMPANY_NAME.hint).toBeUndefined();
    expect(PRINT_COMPANY_ADDRESS.hint).toBeUndefined();
    expect(PRINT_COMPANY_REPRESENTATIVE.hint).toBeUndefined();
  });

  it("빈 문자열은 다섯 다 통과한다", () => {
    for (const def of FIVE) expect(def.schema.safeParse("").success).toBe(true);
  });

  it("길이 초과 문장이 화면까지 간다(회사명 60 · 주소 120 · 대표자 30)", () => {
    expect(PRINT_COMPANY_NAME.schema.safeParse("가".repeat(60)).success).toBe(true);
    expect(screenMessage(PRINT_COMPANY_NAME, "가".repeat(61))).toBe("길이 초과 · 60자 이내");
    expect(PRINT_COMPANY_ADDRESS.schema.safeParse("가".repeat(120)).success).toBe(true);
    expect(screenMessage(PRINT_COMPANY_ADDRESS, "가".repeat(121))).toBe("길이 초과 · 120자 이내");
    expect(PRINT_COMPANY_REPRESENTATIVE.schema.safeParse("가".repeat(30)).success).toBe(true);
    expect(screenMessage(PRINT_COMPANY_REPRESENTATIVE, "가".repeat(31))).toBe("길이 초과 · 30자 이내");
  });

  it("사업자번호는 형식만 본다(검증 숫자는 보지 않는다)", () => {
    expect(PRINT_COMPANY_BUSINESS_NO.schema.safeParse("123-45-67890").success).toBe(true);
    expect(screenMessage(PRINT_COMPANY_BUSINESS_NO, "1234567890")).toBe("형식 오류 · 123-45-67890처럼");
    expect(screenMessage(PRINT_COMPANY_BUSINESS_NO, "12-345-67890")).toBe("형식 오류 · 123-45-67890처럼");
  });

  it("전화는 0으로 시작하는 하이픈 형식만 받는다", () => {
    for (const ok of ["02-123-4567", "010-1234-5678"]) expect(PRINT_COMPANY_PHONE.schema.safeParse(ok).success).toBe(true);
    expect(screenMessage(PRINT_COMPANY_PHONE, "021234567")).toBe("형식 오류 · 02-123-4567처럼");
  });

  it("앞뒤 공백은 저장 전에 걷는다", () => {
    expect(PRINT_COMPANY_NAME.schema.parse("  플랜트  ")).toBe("플랜트");
  });
});
