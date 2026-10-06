import { beforeEach, describe, expect, it, vi } from "vitest";

// 05 /review A6(red-team): 사용일 · 지급 예정일이 정규식만 지나 `2026-02-30`이 도메인 · DB까지 갔다(date 범위 오류 → 일반 오류 화면).
// 액션 입력 검증이 칸 오류로 돌려주고 도메인을 부르지 않는다.
const saved: unknown[] = [];
vi.mock("@/lib/viewer", () => ({ getSession: () => Promise.resolve({ viewer: { id: "viewer" }, user: { id: "viewer" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/app/(app)/document-kinds", () => ({}));
vi.mock("@/app/(app)/expenses/actions.registry", () => ({}));
vi.mock("@/lib/log", () => ({ log: { warn: () => undefined, error: () => undefined, info: () => undefined } }));
vi.mock("@/domain/approvals", () => ({}));
vi.mock("@/domain/evidence", () => ({}));
vi.mock("@/domain/expenses/pick", () => ({}));
vi.mock("@/domain/expenses", () => ({
  EXPENSE_DOCUMENT_KIND: "expense",
  TEAM_EXPENSE_KINDS: ["lost_bid", "team_overhead"],
  saveExpenseDraft: (_viewer: unknown, input: unknown) => {
    saved.push(input);
    return Promise.resolve({ version: 2 });
  },
}));

const { saveExpenseDraftAction } = await import("@/app/(app)/expenses/actions");

const EXPENSE_ID = "8f0e7c1a-3b2d-4c5e-9f6a-7b8c9d0e1f2a";

describe("지출결의 임시 저장 — 달력에 없는 날짜", () => {
  beforeEach(() => {
    saved.length = 0;
  });

  it("사용일 2026-02-30 · 지급 예정일 2026-13-01은 칸 오류이고 도메인을 부르지 않는다", async () => {
    const usage = await saveExpenseDraftAction({ expenseId: EXPENSE_ID, expectedVersion: 1, fields: { usageDate: "2026-02-30" } });
    expect(usage?.validationErrors?.fields?.usageDate?._errors).toEqual(["날짜 형식 오류 · 2026-09-19처럼"]);
    const scheduled = await saveExpenseDraftAction({ expenseId: EXPENSE_ID, expectedVersion: 1, fields: { scheduledPaymentDate: "2026-13-01" } });
    expect(scheduled?.validationErrors?.fields?.scheduledPaymentDate?._errors).toEqual(["날짜 형식 오류 · 2026-09-19처럼"]);
    expect(saved).toEqual([]);
  });

  it("달력에 있는 날짜는 도메인으로 간다", async () => {
    const ok = await saveExpenseDraftAction({ expenseId: EXPENSE_ID, expectedVersion: 1, fields: { usageDate: "2024-02-29" } });
    expect(ok?.validationErrors).toBeUndefined();
    expect(saved).toHaveLength(1);
  });
});
