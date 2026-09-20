import { describe, expect, it } from "vitest";
import { isCurrentPath } from "../../../ui/shell/current-path";

// WR-01(02-REVIEW.md) — 현재 메뉴 판정 경계 사례 고정. 순수 함수, import 없음
// (역할 데이터 role-menu.ts와 섞지 않는다, D-23은 역할→메뉴 매핑 한 곳이고
// 이것은 경로 판정이다).
describe("isCurrentPath — WR-01 경로 판정", () => {
  it('("/", "/") → true', () => {
    expect(isCurrentPath("/", "/")).toBe(true);
  });

  it('("/projects", "/") → false', () => {
    expect(isCurrentPath("/projects", "/")).toBe(false);
  });

  it('("/projects", "/projects") → true', () => {
    expect(isCurrentPath("/projects", "/projects")).toBe(true);
  });

  it('("/projects/123", "/projects") → true', () => {
    expect(isCurrentPath("/projects/123", "/projects")).toBe(true);
  });

  it('("/projectsx", "/projects") → false (접두 오탐 방지)', () => {
    expect(isCurrentPath("/projectsx", "/projects")).toBe(false);
  });

  it('(null, "/") → false', () => {
    expect(isCurrentPath(null, "/")).toBe(false);
  });

  it('("/account", "/projects") → false', () => {
    expect(isCurrentPath("/account", "/projects")).toBe(false);
  });
});
