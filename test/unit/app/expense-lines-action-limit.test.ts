import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QUOTE_LINE_MAX_PER_REVISION_DEFAULT } from "@/domain/settings/keys";

// 05-08 검토 #5: 견적 줄 표에서 Ctrl+A → Ctrl+E는 한 차수의 줄 전부(기본 상한 300)를 보낸다. 액션 입력 상한이 100이면 101줄부터
// 검증에서 늘 실패해 `지출결의 만들기 실패 · 다시 시도`만 반복된다 — 상한을 차수 줄 상한 기본값과 같게 둔다. 목은 평범한 함수로 둔다.
const calls: string[][] = [];
vi.mock("@/lib/viewer", () => ({ getSession: () => Promise.resolve({ viewer: { id: "viewer" }, user: { id: "viewer" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/app/(app)/document-kinds", () => ({}));
vi.mock("@/app/(app)/expenses/actions.registry", () => ({}));
vi.mock("@/lib/log", () => ({ log: { warn: () => undefined, error: () => undefined, info: () => undefined } }));
vi.mock("@/domain/approvals", () => ({ currentHolderNames: () => Promise.resolve(null), projectActionResult: () => Promise.resolve(null) }));
vi.mock("@/domain/evidence", () => ({}));
vi.mock("@/domain/expenses/pick", () => ({}));
vi.mock("@/domain/expenses", () => ({
  EXPENSE_DOCUMENT_KIND: "expense",
  TEAM_EXPENSE_KINDS: ["team_overhead"],
  createExpenseFromLines: (_viewer: unknown, input: { lineIds: string[] }) => {
    calls.push(input.lineIds);
    return Promise.resolve({ created: [], blocked: [] });
  },
}));

const { createExpenseFromLinesAction } = await import("@/app/(app)/expenses/actions");

const ids = (count: number) => Array.from({ length: count }, () => randomUUID());

describe("여러 줄 Ctrl+E 액션 입력 상한", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("101줄을 보내도 검증을 지나 도메인이 101줄을 받는다", async () => {
    const result = await createExpenseFromLinesAction({ lineIds: ids(101) });
    expect(result?.validationErrors).toBeUndefined();
    expect(calls.map((lineIds) => lineIds.length)).toEqual([101]);
  });

  it("차수 줄 상한 기본값만큼은 받고 그보다 많으면 도메인을 부르지 않고 거부한다", async () => {
    const max = QUOTE_LINE_MAX_PER_REVISION_DEFAULT;
    expect((await createExpenseFromLinesAction({ lineIds: ids(max) }))?.validationErrors).toBeUndefined();
    expect((await createExpenseFromLinesAction({ lineIds: ids(max + 1) }))?.validationErrors).toBeDefined();
    expect(calls.map((lineIds) => lineIds.length)).toEqual([max]);
  });
});
