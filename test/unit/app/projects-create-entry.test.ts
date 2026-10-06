import { describe, expect, it } from "vitest";
import { canCreateProject, createFormClientCount, projectsEmptyState } from "@/app/(app)/projects/create-entry";

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

  // 261006-biv — 클라이언트 선택지는 클라이언트 · 둘 다 갈래만이라, 비면 클라이언트가 없는 것이고 등록 패널은 구분 클라이언트로 열린다.
  it("클라이언트만 없고 거래처를 만들 수 있으면 무엇이 없는지와 클라이언트 등록(구분 클라이언트로 열림)", () => {
    expect(projectsEmptyState(base)).toEqual({
      message: "등록된 클라이언트가 없습니다",
      action: { label: "클라이언트 등록", href: "/admin/vendors?new=1&kind=client" },
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

// 261006-biv Codex 리뷰 P2 — 복사 출처의 클라이언트가 다른 갈래(협력사)로 바뀌어 선택지에 없을 때도
// 복사 폼은 저장된 클라이언트 하나로 열려야 한다. 일반 선택지 수에는 더하지 않는다.
describe("createFormClientCount", () => {
  const clients = [{ id: "c1" }];

  it("복사 출처가 없으면 선택지 수", () => {
    expect(createFormClientCount(clients, null)).toBe(1);
  });

  it("복사 출처 클라이언트가 선택지 밖이고 이름이 보이면 하나 더한다", () => {
    expect(createFormClientCount([], { clientId: "s1", clientName: "협력사 A" })).toBe(1);
  });

  it("복사 출처 클라이언트가 이미 선택지에 있으면 더하지 않는다", () => {
    expect(createFormClientCount(clients, { clientId: "c1", clientName: "클라이언트 A" })).toBe(1);
  });

  it("복사 출처 클라이언트 이름이 가려져 있으면 더하지 않는다", () => {
    expect(createFormClientCount([], { clientId: "s1", clientName: null })).toBe(0);
  });
});
