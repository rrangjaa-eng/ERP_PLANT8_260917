import { beforeEach, describe, expect, it, vi } from "vitest";

// 04.1-06 코드 검토 L6: error.tsx는 같은 세그먼트의 layout을 감싸지 않는다(Next 16 error.md) — 목록 layout에서 난
// 권한 읽기 오류는 목록 전용 오류 화면(`연차 불러오기 실패`)이 아니라 상위 (app)/error.tsx로 간다. layout은 「view
// 없음 → 404」만 판정하고 읽기 오류는 page로 넘긴다(page가 같은 판정을 다시 하다 던지면 (list)/error.tsx가 잡는다 —
// 04.1-05 [id]/layout 선례). 거부를 주는 목은 평범한 함수 변수로 둔다(04.1-05 989d428).
let canImpl: () => Promise<boolean> = () => Promise.resolve(true);
vi.mock("@/lib/viewer", () => ({ requireSession: () => Promise.resolve({ viewer: { id: "viewer" } }) }));
vi.mock("@/domain/permissions/can", () => ({ can: () => canImpl() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { default: LeaveListLayout } = await import("@/app/(app)/leave/(list)/layout");
const children = "목록 본문";

describe("/leave (list) layout", () => {
  beforeEach(() => {
    canImpl = () => Promise.resolve(true);
  });

  it("leave view가 없으면 404", async () => {
    canImpl = () => Promise.resolve(false);
    await expect(LeaveListLayout({ children })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("view가 있으면 본문을 그린다", async () => {
    await expect(LeaveListLayout({ children })).resolves.toBe(children);
  });

  it("권한 읽기 오류는 layout에서 던지지 않고 본문으로 넘긴다 — page의 같은 판정이 (list)/error.tsx 안에서 던진다", async () => {
    canImpl = () => Promise.reject(new Error("db down"));
    await expect(LeaveListLayout({ children })).resolves.toBe(children);
  });
});
