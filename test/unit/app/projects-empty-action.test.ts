import { describe, expect, it } from "vitest";
import { projectsEmptyAction } from "@/app/(app)/projects/empty-action";

// quick 261001-85g(사용자 결정 2026-10-01) — 프로젝트가 하나도 없는 빈 목록의 행동. 등록할 수 있으면 「프로젝트 등록」,
// 거래처가 하나도 없어 등록할 수 없고 거래처를 만들 수 있으면 「거래처 등록」(빈 화면은 다음 행동으로 이끈다).
const base = { canCreate: false, canWrite: true, vendorShown: true, clientCount: 0, canWriteVendors: true };

describe("projectsEmptyAction", () => {
  it("등록할 수 있으면 프로젝트 등록", () => {
    expect(projectsEmptyAction({ ...base, canCreate: true, clientCount: 3 })).toEqual({ label: "프로젝트 등록", href: "/projects?new=1#project-form" });
  });

  it("거래처가 하나도 없고 거래처를 만들 수 있으면 거래처 등록", () => {
    expect(projectsEmptyAction(base)).toEqual({ label: "거래처 등록", href: "/admin/vendors?new=1#vendor-form" });
  });

  it("거래처 정보가 가려져 목록이 빈 계급에는 거래처 등록을 보이지 않는다", () => {
    expect(projectsEmptyAction({ ...base, vendorShown: false })).toBeUndefined();
  });

  it("거래처 쓰기 권한이 없으면 행동 없음", () => {
    expect(projectsEmptyAction({ ...base, canWriteVendors: false })).toBeUndefined();
  });

  it("프로젝트 쓰기 권한이 없으면 행동 없음", () => {
    expect(projectsEmptyAction({ ...base, canWrite: false })).toBeUndefined();
  });

  it("거래처는 있는데 등록할 수 없으면(팀 · 담당 PM 없음) 행동 없음", () => {
    expect(projectsEmptyAction({ ...base, clientCount: 2 })).toBeUndefined();
  });
});
