import { describe, expect, it, vi } from "vitest";

// 05 /review A14(testing): 지출결의 제출이 커밋된 뒤 토스트 재료(다음 담당 이름) 읽기가 실패해도 액션은 성공으로 끝나야 한다 —
// 실패로 돌려주면 폼이 다시 제출을 시도한다(연차 leave-submit-after-commit.test.ts와 같은 규칙).
const submitted: string[] = [];
vi.mock("@/lib/viewer", () => ({ getSession: () => Promise.resolve({ viewer: { id: "viewer" }, user: { id: "viewer" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/app/(app)/document-kinds", () => ({}));
vi.mock("@/app/(app)/expenses/actions.registry", () => ({}));
vi.mock("@/lib/log", () => ({ log: { warn: () => undefined, error: () => undefined, info: () => undefined } }));
vi.mock("@/domain/approvals", () => ({
  projectActionResult: (_viewer: unknown, raw: unknown) => Promise.resolve(raw),
  currentHolderNames: () => Promise.reject(new Error("read after commit failed")),
}));
vi.mock("@/domain/evidence", () => ({}));
vi.mock("@/domain/expenses/pick", () => ({}));
vi.mock("@/domain/expenses", () => ({
  EXPENSE_DOCUMENT_KIND: "expense",
  TEAM_EXPENSE_KINDS: ["lost_bid", "team_overhead"],
  submitExpense: (_viewer: unknown, input: { expenseId: string }) => {
    submitted.push(input.expenseId);
    return Promise.resolve({ kind: "submitted", expenseId: input.expenseId, number: "EX-2609-001", round: 1 });
  },
}));

const { submitExpenseAction } = await import("@/app/(app)/expenses/actions");

const EXPENSE_ID = "8f0e7c1a-3b2d-4c5e-9f6a-7b8c9d0e1f2a";

describe("지출결의 제출 액션 — 커밋 뒤 표시 재료 실패", () => {
  it("다음 담당 이름 읽기가 실패해도 제출은 성공으로 끝나고 번호 · 차수 · 문서 id를 돌려준다(이름 없는 토스트)", async () => {
    const result = await submitExpenseAction({ expenseId: EXPENSE_ID, expectedVersion: 1 });
    expect(result?.serverError).toBeUndefined();
    expect(result?.data).toMatchObject({ kind: "submitted", number: "EX-2609-001", round: 1, result: { documentId: EXPENSE_ID, final: false } });
    expect(result?.data && "result" in result.data ? result.data.result : null).not.toHaveProperty("nextHolderNames");
    expect(submitted).toEqual([EXPENSE_ID]);
  });
});
