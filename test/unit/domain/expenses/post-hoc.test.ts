import { describe, expect, it } from "vitest";
import { isPostHocSubmitted } from "@/domain/expenses/post-hoc";

// 07.2-16(PU7 · D-7234~7236): 사후 추인 — 상신일(서울) > 행사 시작일이면 참. 당일 · 임시 저장(상신 없음) · 시작일 없음은 거짓.
// 260907 O: server/src/expenses.ts:479-482(당일 제외)와 같은 판정 — 문장 없이 배지 하나(세 자리가 이 함수 하나).
describe("isPostHocSubmitted", () => {
  it("시작 10-01 · 상신 10-02 09:00 서울 → 참", () => {
    expect(isPostHocSubmitted(new Date("2026-10-02T00:00:00Z"), "2026-10-01")).toBe(true);
  });

  it("상신 10-01 23:59 서울(UTC 14:59) → 거짓(당일)", () => {
    expect(isPostHocSubmitted(new Date("2026-10-01T14:59:00Z"), "2026-10-01")).toBe(false);
  });

  it("상신 10-02 00:00 서울(UTC 10-01 15:00) → 참 — 서울 날짜로 바꿔 비교", () => {
    expect(isPostHocSubmitted(new Date("2026-10-01T15:00:00Z"), "2026-10-01")).toBe(true);
  });

  it("상신 전(임시 저장) → 거짓", () => {
    expect(isPostHocSubmitted(null, "2026-10-01")).toBe(false);
  });

  it("행사 시작일 없음 → 거짓", () => {
    expect(isPostHocSubmitted(new Date("2026-10-02T00:00:00Z"), null)).toBe(false);
  });

  it("시작일 전 상신 → 거짓", () => {
    expect(isPostHocSubmitted(new Date("2026-09-20T00:00:00Z"), "2026-10-01")).toBe(false);
  });
});
