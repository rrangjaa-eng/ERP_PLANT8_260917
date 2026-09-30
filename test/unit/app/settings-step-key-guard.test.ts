import { describe, expect, it, vi } from "vitest";

// 리뷰(security): 결재선 단계 칸은 `N단 저장`(한 트랜잭션)으로만 저장한다 — 칸 하나 저장 액션이 단계 키를 받으면
// 오래된 탭 · 직접 호출로 중간 결재선이 다시 생긴다(사용자 결정 2026-09-30 A). 목은 평범한 함수로 둔다.
const saved: string[] = [];
vi.mock("@/lib/viewer", () => ({ getSession: () => Promise.resolve({ viewer: { id: "viewer" }, user: { id: "viewer" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/app/(app)/document-kinds", () => ({}));
vi.mock("@/app/(app)/admin/settings/actions.registry", () => ({}));
vi.mock("@/domain/settings/export", () => ({ exportSettings: () => Promise.resolve({}) }));
vi.mock("@/domain/settings/registry", () => ({
  addHistorizedValue: () => Promise.resolve(),
  cancelHistorizedValue: () => Promise.resolve(),
}));
vi.mock("@/domain/document-numbering", () => ({
  setSimpleSettingValue: (_viewer: unknown, def: { key: string }) => Promise.resolve(void saved.push(def.key)),
}));
vi.mock("@/domain/approvals/route-step-settings", () => ({
  saveRouteStepSettings: () => Promise.resolve(),
  isRouteStepSettingKey: (key: string) => key.includes(".step"),
}));

const { setSimpleSettingAction } = await import("@/app/(app)/admin/settings/actions");

describe("칸 하나 저장 액션 — 결재선 단계 키 거부", () => {
  it("단계 칸 키는 저장하지 않고 이유를 돌려준다", async () => {
    saved.length = 0;
    const result = await setSimpleSettingAction({ key: "approval_route.leave.step2.role_id", value: "role-ceo" });
    expect(result?.serverError).toBe("결재선 단계 칸 단독 저장 불가 · 단계 저장으로");
    expect(saved).toEqual([]);
  });

  it("단계 밖 칸(자기 승인)은 그대로 저장한다", async () => {
    saved.length = 0;
    const result = await setSimpleSettingAction({ key: "approval_route.leave.self_approval", value: "skip" });
    expect(result?.serverError).toBeUndefined();
    expect(saved).toEqual(["approval_route.leave.self_approval"]);
  });
});
