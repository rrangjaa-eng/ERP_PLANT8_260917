import { describe, expect, it } from "vitest";
import { EXPENSE_TEXT_MAX, expenseDraftFieldsSchema, RECIPIENT_COUNT_INVALID } from "@/domain/expenses/draft-fields";

// 05 /review A12(maintainability): 임시 저장 칸 스키마가 app(비고 480자)과 domain(비고 1000자) 두 벌이었다 — 하나로, 상한은 폼과 같은 480.
describe("지출결의 칸 스키마 하나", () => {
  it("비고 · 내용 상한은 480자이고 넘으면 칸 오류 문구다", () => {
    expect(EXPENSE_TEXT_MAX).toBe(480);
    expect(expenseDraftFieldsSchema.safeParse({ note: "가".repeat(480), content: "나".repeat(480) }).success).toBe(true);
    const note = expenseDraftFieldsSchema.safeParse({ note: "가".repeat(481) });
    expect(note.success ? null : note.error.issues[0]?.message).toBe("상세 480자 넘음 · 줄여 적기");
    const content = expenseDraftFieldsSchema.safeParse({ content: "나".repeat(481) });
    expect(content.success ? null : content.error.issues[0]?.message).toBe("내용 480자 넘음 · 줄여 적기");
  });

  it("모르는 칸(팀 id 등)은 받지 않는다", () => {
    expect(expenseDraftFieldsSchema.safeParse({ attributedTeamId: "x" }).success).toBe(false);
  });
});

// 06.5 카드 ① · V15: 받는 인원은 1 이상 정수(DB int4 상한까지) — 어긋나면 한 문구. D-6520: 기안자 증빙 금액 칸은 없다.
describe("받는 인원 칸 · 증빙 금액 칸 없음 (06.5 V15 · D-6520)", () => {
  it.each([1, 5, 2147483647])("받는 인원 %j → 통과", (value) => {
    expect(expenseDraftFieldsSchema.safeParse({ recipientCount: value }).success).toBe(true);
  });

  it.each([0, -1, 1.5, null, 2147483648, "3"])("받는 인원 %j → 받는 인원 문구", (value) => {
    expect(RECIPIENT_COUNT_INVALID).toBe("받는 인원 1 미만 · 1 이상 적기");
    const parsed = expenseDraftFieldsSchema.safeParse({ recipientCount: value });
    expect(parsed.success ? null : parsed.error.issues[0]?.message).toBe(RECIPIENT_COUNT_INVALID);
  });

  it("옛 증빙 금액 키는 받지 않는다", () => {
    expect(expenseDraftFieldsSchema.safeParse({ evidenceAmountKrw: 12_400_000 }).success).toBe(false);
  });
});
