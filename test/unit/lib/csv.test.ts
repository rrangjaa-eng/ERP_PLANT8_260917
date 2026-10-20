import { describe, expect, it } from "vitest";
import { csvEscape } from "@/lib/csv";

// 06.1-13 G6(RP-16) — 행동 로그 내보내기의 csvEscape를 lib/csv.ts로 꺼내 증빙 목록 파일 받기와 함께 쓴다(동작 그대로 — /cso F3 수식 방어).
describe("csvEscape", () => {
  it.each(["=1+1", "+82", "-12000원 환불", "@SUM(A1)", "\tx", "\rx"])("수식 시작 문자로 여는 %j 앞에 작은따옴표", (value) => {
    expect(csvEscape(value).replace(/^"/, "")).toMatch(/^'/);
  });

  it("쉼표 · 줄바꿈 · 따옴표가 있으면 따옴표로 감싸고 안 따옴표는 둘로", () => {
    expect(csvEscape("가,나")).toBe('"가,나"');
    expect(csvEscape("가\n나")).toBe('"가\n나"');
    expect(csvEscape('가"나')).toBe('"가""나"');
  });

  it("수식 방어와 인용이 겹치면 작은따옴표를 붙인 뒤 감싼다", () => {
    expect(csvEscape("=A1,B1")).toBe("\"'=A1,B1\"");
  });

  it("평범한 글자는 그대로", () => {
    expect(csvEscape("기획1팀 공개")).toBe("기획1팀 공개");
    expect(csvEscape("")).toBe("");
  });
});
