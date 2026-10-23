import { describe, expect, it } from "vitest";
import { personLoginStatus, personLoginWord } from "@/app/(app)/admin/people/person-status";

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

  // 07-17 SC-11(U2 · D-728): 퇴직 > 잠김 > 기존 로그인 배지 — 퇴직자는 잠겨 있어도 `퇴직`(할 일 없는 빨간 `잠김`을 남기지 않는다).
  it("퇴직(퇴직일이 오늘 전)이면 잠겨 있어도 퇴직만", () => {
    expect(
      personLoginStatus({ archivedAt: null, firstLoginAt: null, passwordIsTemporary: true, resignationDate: "2026-10-21", locked: true }, "2026-10-22"),
    ).toEqual({ kind: "word", word: "퇴직" });
  });

  it("퇴직일이 오늘이면 아직 퇴직이 아니다 — 잠김이면 잠김만", () => {
    expect(
      personLoginStatus({ archivedAt: null, firstLoginAt: null, passwordIsTemporary: true, resignationDate: "2026-10-22", locked: true }, "2026-10-22"),
    ).toEqual({ kind: "word", word: "잠김" });
  });

  it("잠기지 않은 재직자는 기존 배지 조합 그대로", () => {
    expect(
      personLoginStatus({ archivedAt: null, firstLoginAt: null, passwordIsTemporary: true, resignationDate: null, locked: false }, "2026-10-22"),
    ).toEqual({ kind: "badges", badges: ["첫 로그인 전", "임시 비밀번호 사용 중"] });
  });

  it("보관이 퇴직 · 잠김보다 먼저", () => {
    expect(
      personLoginStatus({ archivedAt: new Date(), resignationDate: "2026-01-01", locked: true }, "2026-10-22"),
    ).toEqual({ kind: "archived" });
  });
});

// 07-17 SC-12: 상세 로그인 섹션 `로그인 상태`는 한 값 — 보관됨 > 퇴직 > 잠김 > 임시 비밀번호 사용 중 > 첫 로그인 전 > 정상(플랜 :205 순서).
describe("personLoginWord", () => {
  it.each([
    [{ archivedAt: new Date() }, "보관됨"],
    [{ archivedAt: null, resignationDate: "2026-10-21", locked: true }, "퇴직"],
    [{ archivedAt: null, resignationDate: null, locked: true, firstLoginAt: null, passwordIsTemporary: true }, "잠김"],
    [{ archivedAt: null, resignationDate: null, locked: false, firstLoginAt: null, passwordIsTemporary: true }, "임시 비밀번호 사용 중"],
    [{ archivedAt: null, resignationDate: null, locked: false, firstLoginAt: null, passwordIsTemporary: false }, "첫 로그인 전"],
    [{ archivedAt: null, resignationDate: null, locked: false, firstLoginAt: new Date(), passwordIsTemporary: true }, "임시 비밀번호 사용 중"],
    [{ archivedAt: null, resignationDate: null, locked: false, firstLoginAt: new Date(), passwordIsTemporary: false }, "정상"],
  ] as const)("%o → %s", (person, word) => {
    expect(personLoginWord(personLoginStatus(person, "2026-10-22"))).toBe(word);
  });
});
