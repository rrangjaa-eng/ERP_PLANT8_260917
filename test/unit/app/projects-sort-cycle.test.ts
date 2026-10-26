import { describe, expect, it } from "vitest";
import { sortHeaderHref } from "@/app/(app)/projects/sort-cycle";

// 머리글 정렬 3클릭 — 정렬 없음(기본) → 오름차순 → 내림차순 → 초기화(sort·dir를 URL에서 뺀다). 다른 필터 값은 그대로.
const DEFAULT = { key: "endDate", direction: "asc" } as const;

describe("sortHeaderHref", () => {
  it("다른 열을 누르면 오름차순(sort만, dir 없음)", () => {
    expect(sortHeaderHref("q=a", "name", DEFAULT)).toBe("/projects?q=a&sort=name");
  });

  it("오름차순인 열을 누르면 내림차순", () => {
    expect(sortHeaderHref("q=a&sort=name", "name", { key: "name", direction: "asc" })).toBe("/projects?q=a&sort=name&dir=desc");
  });

  it("내림차순인 열을 누르면 sort·dir를 빼 기본 정렬로 돌아간다(필터는 유지)", () => {
    expect(sortHeaderHref("q=a&sort=name&dir=desc&year=all", "name", { key: "name", direction: "desc" })).toBe("/projects?q=a&year=all");
  });

  it("필터가 없으면 /projects", () => {
    expect(sortHeaderHref("sort=name&dir=desc", "name", { key: "name", direction: "desc" })).toBe("/projects");
  });

  it("기본 정렬 열(기간)은 주소에 정렬이 없어도 오름차순으로 보이므로 첫 클릭이 내림차순, 두 번째가 초기화", () => {
    expect(sortHeaderHref("q=a", "endDate", DEFAULT)).toBe("/projects?q=a&sort=endDate&dir=desc");
    expect(sortHeaderHref("q=a&sort=endDate&dir=desc", "endDate", { key: "endDate", direction: "desc" })).toBe("/projects?q=a");
  });

  it("page는 싣지 않는다", () => {
    expect(sortHeaderHref("q=a&page=3", "name", DEFAULT)).toBe("/projects?q=a&sort=name");
  });
});
