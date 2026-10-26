import { describe, expect, it } from "vitest";
import { currentHref, isCurrentPath } from "../../../ui/shell/current-path";

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

// 한 목록 안에서 가장 긴 href 일치 하나만 현재 — /expenses/evidence에서 「지출결의」와 「증빙」이 함께 켜지지 않게 한다.
describe("currentHref — 목록 안 가장 긴 일치 하나", () => {
  const hrefs = ["/projects", "/expenses", "/cards", "/approvals", "/pnl", "/expenses/evidence"];

  it("/expenses/evidence 에서는 증빙만 현재다", () => {
    expect(currentHref("/expenses/evidence", hrefs)).toBe("/expenses/evidence");
  });

  it("/expenses/evidence/123 도 증빙이다", () => {
    expect(currentHref("/expenses/evidence/123", hrefs)).toBe("/expenses/evidence");
  });

  it("/expenses 와 /expenses/42 는 지출결의다", () => {
    expect(currentHref("/expenses", hrefs)).toBe("/expenses");
    expect(currentHref("/expenses/42", hrefs)).toBe("/expenses");
  });

  it("증빙이 목록에 없으면 /expenses/evidence 도 지출결의다", () => {
    expect(currentHref("/expenses/evidence", hrefs.slice(0, 5))).toBe("/expenses");
  });

  it("일치가 없거나 pathname이 null이면 null이다", () => {
    expect(currentHref("/account", hrefs)).toBeNull();
    expect(currentHref(null, hrefs)).toBeNull();
  });

  it('"/" 는 정확히 "/" 일 때만 일치한다', () => {
    expect(currentHref("/", ["/", "/projects"])).toBe("/");
    expect(currentHref("/projects/1", ["/", "/projects"])).toBe("/projects");
  });
});
