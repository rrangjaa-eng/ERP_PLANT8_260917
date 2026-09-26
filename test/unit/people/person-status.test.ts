import { describe, expect, it } from "vitest";
import { personLoginStatus } from "@/app/(app)/admin/people/person-status";

// D8-07 · UI-SPEC 배지 조합 규칙: 두 칼럼에서 독립적으로 배지를 만들고, 보관된 사람은 「보관됨」만.
// 정보 노출표가 가린 필드는 DTO에 키가 없다 — NULL/false로 오인하지 않는다.
describe("personLoginStatus", () => {
  it("보관된 사람은 두 조건이 있어도 보관됨만", () => {
    expect(personLoginStatus({ archivedAt: new Date(), firstLoginAt: null, passwordIsTemporary: true })).toEqual({ kind: "archived" });
  });

  it("로그인했고 임시 비밀번호가 아니면 배지 0개", () => {
    expect(personLoginStatus({ archivedAt: null, firstLoginAt: new Date(), passwordIsTemporary: false })).toEqual({ kind: "badges", badges: [] });
  });

  it("첫 로그인 전만", () => {
    expect(personLoginStatus({ archivedAt: null, firstLoginAt: null, passwordIsTemporary: false })).toEqual({ kind: "badges", badges: ["첫 로그인 전"] });
  });

  it("임시 비밀번호 사용 중만", () => {
    expect(personLoginStatus({ archivedAt: null, firstLoginAt: new Date(), passwordIsTemporary: true })).toEqual({
      kind: "badges",
      badges: ["임시 비밀번호 사용 중"],
    });
  });

  it("둘 다면 첫 로그인 전 · 임시 비밀번호 사용 중 순서", () => {
    expect(personLoginStatus({ archivedAt: null, firstLoginAt: null, passwordIsTemporary: true })).toEqual({
      kind: "badges",
      badges: ["첫 로그인 전", "임시 비밀번호 사용 중"],
    });
  });

  it("두 키가 없으면(노출표가 가림) 배지 0개", () => {
    expect(personLoginStatus({ archivedAt: null })).toEqual({ kind: "badges", badges: [] });
  });
});
