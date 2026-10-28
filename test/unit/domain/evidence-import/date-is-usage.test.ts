import { describe, expect, it } from "vitest";
import { formatDateIsUsage } from "@/domain/evidence-import/registry";

// 07.1-04 검토 P1: 붙임이 카드 사용 사용일을 덮는 서식은 날짜 칸이 사용(승인)일인 서식뿐이다 — 롯데는 매입일자(사용일 뒤 며칠)라 덮지 않는다.
describe("formatDateIsUsage", () => {
  it("신한 이용일시 · 신한 회계 승인일자 · 비씨 승인일자 → 참, 롯데 매입일자 · 카드 서식 아님 · 모르는 서식 → 거짓", () => {
    expect(formatDateIsUsage("card-shinhan")).toBe(true);
    expect(formatDateIsUsage("card-shinhan-accounting")).toBe(true);
    expect(formatDateIsUsage("card-bc")).toBe(true);
    expect(formatDateIsUsage("card-lotte")).toBe(false);
    expect(formatDateIsUsage("hometax-tax-invoice")).toBe(false);
    expect(formatDateIsUsage("unknown")).toBe(false);
  });
});
