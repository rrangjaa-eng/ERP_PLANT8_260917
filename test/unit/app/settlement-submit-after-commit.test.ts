import { describe, expect, it, vi } from "vitest";

// 05 /review A14(testing): 정산 결재 올리기가 커밋된 뒤 토스트 재료(다음 담당 이름) 읽기가 실패해도 액션은 성공으로 끝나야 한다 —
// 실패로 돌려주면 화면이 다시 올리기를 시도한다(연차 leave-submit-after-commit.test.ts와 같은 규칙).
const submitted: string[] = [];
vi.mock("@/lib/viewer", () => ({ getSession: () => Promise.resolve({ viewer: { id: "viewer" }, user: { id: "viewer" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/app/(app)/document-kinds", () => ({}));
vi.mock("@/app/(app)/projects/actions.registry", () => ({}));
vi.mock("@/lib/log", () => ({ log: { warn: () => undefined, error: () => undefined, info: () => undefined } }));
vi.mock("@/domain/approvals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/domain/approvals")>()),
  projectActionResult: (_viewer: unknown, raw: unknown) => Promise.resolve(raw),
  currentHolderNames: () => Promise.reject(new Error("read after commit failed")),
}));
vi.mock("@/domain/settlements", () => ({
  SETTLEMENT_DOCUMENT_KIND: "settlement",
  withdrawSettlement: () => Promise.reject(new Error("not used")),
  submitSettlement: (_viewer: unknown, input: { projectId: string }) => {
    submitted.push(input.projectId);
    return Promise.resolve({ kind: "submitted", documentId: "doc-1", instanceId: "instance-1", round: 2 });
  },
}));

const { submitSettlementAction } = await import("@/app/(app)/projects/actions");

const PROJECT_ID = "8f0e7c1a-3b2d-4c5e-9f6a-7b8c9d0e1f2a";

describe("정산 결재 올리기 액션 — 커밋 뒤 표시 재료 실패", () => {
  it("다음 담당 이름 읽기가 실패해도 올리기는 성공으로 끝나고 차수를 돌려준다(이름 없는 토스트)", async () => {
    const result = await submitSettlementAction({ projectId: PROJECT_ID });
    expect(result?.serverError).toBeUndefined();
    expect(result?.data).toEqual({ kind: "submitted", round: 2, nextHolderNames: null });
    expect(submitted).toEqual([PROJECT_ID]);
  });
});
