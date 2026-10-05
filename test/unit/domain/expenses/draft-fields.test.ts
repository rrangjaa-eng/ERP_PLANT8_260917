import { describe, expect, it } from "vitest";
import { EXPENSE_TEXT_MAX, expenseDraftFieldsSchema } from "@/domain/expenses/draft-fields";

// 05 /review A12(maintainability): 임시 저장 칸 스키마가 app(비고 480자)과 domain(비고 1000자) 두 벌이었다 — 하나로, 상한은 폼과 같은 480.
describe("지출결의 칸 스키마 하나", () => {
  it("비고 · 내용 상한은 480자이고 넘으면 칸 오류 문구다", () => {
    expect(EXPENSE_TEXT_MAX).toBe(480);
    expect(expenseDraftFieldsSchema.safeParse({ note: "가".repeat(480), content: "나".repeat(480) }).success).toBe(true);
    const note = expenseDraftFieldsSchema.safeParse({ note: "가".repeat(481) });
    expect(note.success ? null : note.error.issues[0]?.message).toBe("비고 480자 넘음 · 줄여 적기");
    const content = expenseDraftFieldsSchema.safeParse({ content: "나".repeat(481) });
    expect(content.success ? null : content.error.issues[0]?.message).toBe("내용 480자 넘음 · 줄여 적기");
  });

  it("모르는 칸(팀 id 등)은 받지 않는다", () => {
    expect(expenseDraftFieldsSchema.safeParse({ attributedTeamId: "x" }).success).toBe(false);
  });
});
