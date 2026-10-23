import { describe, expect, it } from "vitest";
import { ACTION_REGISTRY } from "@/lib/actions/registry";
import { DTO_REGISTRY } from "@/domain/permissions/dto-registry";
import "@/domain/people";
import "@/app/(app)/admin/people/[id]/actions.registry";

// 07-17 D-P2-7: `resetPersonPasswordAction`은 null DTO 비밀 액션이다 — 행 DTO가 아니라 일회성 임시 비밀번호를 돌려주고,
// 게이트는 `admin.people` 쓰기 + 상한 안 + 자기 제외(domain `resetPersonPassword`). 07-25 최종 누수 스캔 검토 목록 대상.
describe("resetPersonPasswordAction 등록 — null DTO 비밀 액션(D-P2-7)", () => {
  it("메뉴 admin.people · 동작 write · dtoName null", () => {
    const entry = ACTION_REGISTRY.find((item) => item.name === "resetPersonPasswordAction");
    expect(entry).toEqual({ name: "resetPersonPasswordAction", menu: "admin.people", action: "write", dtoName: null });
  });

  it("DTO_REGISTRY에 임시 비밀번호 결과 이름이 없다", () => {
    expect(DTO_REGISTRY.some((item) => /TempPassword/i.test(item.name))).toBe(false);
  });
});
