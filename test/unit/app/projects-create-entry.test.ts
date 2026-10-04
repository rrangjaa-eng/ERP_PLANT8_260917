import { describe, expect, it } from "vitest";
import { canCreateProject, projectsEmptyState } from "@/app/(app)/projects/create-entry";

// quick 261001-85g(사용자 결정 2026-10-01 · /design-review) — 프로젝트 등록 진입점 규칙과 프로젝트가 하나도 없는 빈 목록.
// 등록 진입점(목록 · 상세 「프로젝트 복사」)은 업무 범위로 좁힌 팀 · 담당 PM과 클라이언트 선택지가 모두 있을 때만.
// 빈 목록은 등록할 수 있으면 「프로젝트 등록」, 거래처만 없어 등록할 수 없고 거래처를 만들 수 있으면 「거래처 등록」.
const ready = { canWrite: true, teamCount: 1, pmUserCount: 1, clientCount: 1 };

describe("canCreateProject", () => {
  it("쓰기 권한과 세 선택지가 모두 있으면 참", () => {
    expect(canCreateProject(ready)).toBe(true);
  });

  it.each([
    ["쓰기 권한 없음", { canWrite: false }],
    ["팀 없음(팀 업무 범위인데 오늘 팀 없음 포함)", { teamCount: 0 }],
    ["담당 PM 없음", { pmUserCount: 0 }],
    ["클라이언트 없음", { clientCount: 0 }],
  ])("%s이면 거짓", (_label, patch) => {
    expect(canCreateProject({ ...ready, ...patch })).toBe(false);
  });
});

describe("projectsEmptyState", () => {
  const base = { ...ready, clientCount: 0, vendorShown: true, canWriteVendors: true, canViewVendors: true };

  it("등록할 수 있으면 프로젝트 등록", () => {
    expect(projectsEmptyState({ ...base, clientCount: 3 })).toEqual({
      message: "등록된 프로젝트가 없습니다",
      action: { label: "프로젝트 등록", href: "/projects?new=1" },
    });
  });

  it("거래처만 없고 거래처를 만들 수 있으면 무엇이 없는지와 거래처 등록", () => {
    expect(projectsEmptyState(base)).toEqual({
      message: "등록된 거래처가 없습니다",
      action: { label: "거래처 등록", href: "/admin/vendors?new=1" },
    });
  });

  it("거래처를 만들어도 팀이나 담당 PM이 없어 등록할 수 없으면 거래처 등록을 보이지 않는다", () => {
    expect(projectsEmptyState({ ...base, pmUserCount: 0 }).action).toBeUndefined();
    expect(projectsEmptyState({ ...base, teamCount: 0 }).action).toBeUndefined();
  });

  it("거래처 정보가 가려져 목록이 빈 계급에는 거래처 등록을 보이지 않는다", () => {
    expect(projectsEmptyState({ ...base, vendorShown: false })).toEqual({ message: "등록된 프로젝트가 없습니다", action: undefined });
  });

  it("거래처 화면 보기 권한이 없으면 행동 없음(쓰기만 있으면 링크가 404로 간다 — Codex 리뷰 P2)", () => {
    expect(projectsEmptyState({ ...base, canViewVendors: false }).action).toBeUndefined();
  });

  it("거래처 쓰기 권한이 없으면 행동 없음", () => {
    expect(projectsEmptyState({ ...base, canWriteVendors: false }).action).toBeUndefined();
  });

  it("프로젝트 쓰기 권한이 없으면 행동 없음", () => {
    expect(projectsEmptyState({ ...base, canWrite: false }).action).toBeUndefined();
  });
});
