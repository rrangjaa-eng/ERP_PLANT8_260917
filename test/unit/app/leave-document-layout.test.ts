import { beforeEach, describe, expect, it, vi } from "vitest";

// 04.1-05 검토 MEDIUM-2: error.tsx는 같은 세그먼트의 layout을 감싸지 않는다(Next 16 error.md) — layout에서 난 읽기
// 오류는 문서 전용 오류 화면(`연차 문서 불러오기 실패`)이 아니라 상위 (app)/error.tsx로 간다. 그래서 layout은
// 「없음 · 볼 수 없음 → 404」만 판정하고, 읽기 오류는 page로 넘겨 page가 다시 읽다 던지면 [id]/error.tsx가 잡게 한다.
// 목은 평범한 함수 변수로 둔다 — 모듈 위 vi.fn에 mockImplementation으로 거부를 넣으면 코드가 잡아도 이 vitest는
// 테스트를 실패로 친다(인라인 vi.fn(impl)은 통과 — 2026-09-29 확인).
let getLeaveImpl: () => Promise<unknown> = () => Promise.resolve(null);
let getLeaveCalls = 0;
vi.mock("@/lib/viewer", () => ({ requireSession: () => Promise.resolve({ viewer: { id: "viewer" } }) }));
vi.mock("@/domain/leave", () => ({
  getLeave: () => {
    getLeaveCalls += 1;
    return getLeaveImpl();
  },
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { default: LeaveDocumentLayout } = await import("@/app/(app)/leave/[id]/layout");
const ID = "0b8f7a52-3c1e-4d9a-9f0e-2a6b5c4d3e21";
const children = "문서 본문";

describe("/leave/[id] layout", () => {
  beforeEach(() => {
    getLeaveImpl = () => Promise.resolve(null);
    getLeaveCalls = 0;
  });

  it("볼 수 없는 문서(null)는 404", async () => {
    getLeaveImpl = () => Promise.resolve(null);
    await expect(LeaveDocumentLayout({ children, params: Promise.resolve({ id: ID }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("id 모양이 아니면 읽지 않고 404", async () => {
    await expect(LeaveDocumentLayout({ children, params: Promise.resolve({ id: "x" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getLeaveCalls).toBe(0);
  });

  it("보이는 문서는 본문을 그린다", async () => {
    getLeaveImpl = () => Promise.resolve({ id: ID });
    await expect(LeaveDocumentLayout({ children, params: Promise.resolve({ id: ID }) })).resolves.toBe(children);
  });

  it("읽기 오류는 layout에서 던지지 않고 본문으로 넘긴다 — page의 같은 읽기가 [id]/error.tsx 안에서 던진다", async () => {
    getLeaveImpl = () => Promise.reject(new Error("db down"));
    await expect(LeaveDocumentLayout({ children, params: Promise.resolve({ id: ID }) })).resolves.toBe(children);
  });
});
