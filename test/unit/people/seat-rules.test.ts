import { describe, expect, it } from "vitest";
import { newSeats, seatTakenMessage, spansOverlap, type Employment } from "@/domain/people/seat-rules";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID, SYSADMIN_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";

// 06.4(D-6404 · D-6415): 저장이 더하는 새 자리 구간(뒤 − 앞, 날짜 단위)과 구간 겹침 · 자리 문구(D3).

const E: Employment = { archivedAt: null, resignationDate: null, hireDate: null };
const o1 = { teamId: "t1", orgUnitId: "u1", from: "2026-09-18", to: null };

describe("newSeats — 계급 · 점유 변화가 더하는 자리 구간", () => {
  it.each([
    {
      case: "PM → 팀장(같은 팀) = 그 팀 구간 전부",
      input: { roleBefore: DEFAULT_ROLE_ID, roleAfter: TEAM_LEAD_ROLE_ID, occupiedBefore: [o1], occupiedAfter: [o1] },
      want: { teams: [{ id: "t1", from: "2026-09-18", to: null }], orgUnits: [], company: [] },
    },
    {
      case: "PM → 본부 책임자 = 그 본부 구간",
      input: { roleBefore: DEFAULT_ROLE_ID, roleAfter: DIVISION_HEAD_ROLE_ID, occupiedBefore: [o1], occupiedAfter: [o1] },
      want: { teams: [], orgUnits: [{ id: "u1", from: "2026-09-18", to: null }], company: [] },
    },
    {
      case: "팀장 → PM(강등) = 없음",
      input: { roleBefore: TEAM_LEAD_ROLE_ID, roleAfter: DEFAULT_ROLE_ID, occupiedBefore: [o1], occupiedAfter: [o1] },
      want: { teams: [], orgUnits: [], company: [] },
    },
    {
      case: "팀장 그대로 t1 → (t1 10-31까지 + t2 11-01부터) = t2 구간만",
      input: {
        roleBefore: TEAM_LEAD_ROLE_ID,
        roleAfter: TEAM_LEAD_ROLE_ID,
        occupiedBefore: [o1],
        occupiedAfter: [
          { teamId: "t1", orgUnitId: "u1", from: "2026-09-18", to: "2026-10-31" },
          { teamId: "t2", orgUnitId: "u1", from: "2026-11-01", to: null },
        ],
      },
      want: { teams: [{ id: "t2", from: "2026-11-01", to: null }], orgUnits: [], company: [] },
    },
    {
      case: "점유 본부가 null인 본부 책임자 = 없음(보관 본부)",
      input: {
        roleBefore: DEFAULT_ROLE_ID,
        roleAfter: DIVISION_HEAD_ROLE_ID,
        occupiedBefore: [],
        occupiedAfter: [{ teamId: "t1", orgUnitId: null, from: "2026-09-18", to: null }],
      },
      want: { teams: [], orgUnits: [], company: [] },
    },
    {
      case: "같은 자리의 이어진 구간은 합쳐 한 번",
      input: {
        roleBefore: DEFAULT_ROLE_ID,
        roleAfter: TEAM_LEAD_ROLE_ID,
        occupiedBefore: [],
        occupiedAfter: [
          { teamId: "t1", orgUnitId: "u1", from: "2026-09-18", to: "2026-10-31" },
          { teamId: "t1", orgUnitId: "u1", from: "2026-11-01", to: null },
        ],
      },
      want: { teams: [{ id: "t1", from: "2026-09-18", to: null }], orgUnits: [], company: [] },
    },
  ])("$case", ({ input, want }) => {
    expect(newSeats({ ...input, employedBefore: E, employedAfter: E })).toEqual(want);
  });

  it("뒤 고용이 보관이면 자리 없음", () => {
    expect(
      newSeats({
        roleBefore: DEFAULT_ROLE_ID,
        roleAfter: TEAM_LEAD_ROLE_ID,
        employedBefore: E,
        employedAfter: { archivedAt: new Date("2026-09-01T00:00:00Z"), resignationDate: null, hireDate: null },
        occupiedBefore: [o1],
        occupiedAfter: [o1],
      }),
    ).toEqual({ teams: [], orgUnits: [], company: [] });
  });
});

describe("newSeats — 재직 전환 · 퇴직일 늦추기 · 당기기(R5)", () => {
  const lead = { roleBefore: TEAM_LEAD_ROLE_ID, roleAfter: TEAM_LEAD_ROLE_ID, occupiedBefore: [o1], occupiedAfter: [o1] };

  it.each([
    {
      case: "앞 고용 없음(등록 · 복원) = 뒤 구간 전부",
      employedBefore: null,
      employedAfter: E,
      want: [{ id: "t1", from: "2026-09-18", to: null }],
    },
    {
      case: "지난 퇴직일 지우기(비재직 → 재직) = 오늘부터 전부",
      employedBefore: { archivedAt: null, resignationDate: "2026-09-01", hireDate: null },
      employedAfter: E,
      want: [{ id: "t1", from: "2026-09-18", to: null }],
    },
    {
      case: "퇴직일 12-31 지우기 = 늘어난 2027-01-01부터만",
      employedBefore: { archivedAt: null, resignationDate: "2026-12-31", hireDate: null },
      employedAfter: E,
      want: [{ id: "t1", from: "2027-01-01", to: null }],
    },
    {
      case: "퇴직일 12-31 → 12-20(당기기) = 없음",
      employedBefore: { archivedAt: null, resignationDate: "2026-12-31", hireDate: null },
      employedAfter: { archivedAt: null, resignationDate: "2026-12-20", hireDate: null },
      want: [],
    },
  ])("$case", ({ employedBefore, employedAfter, want }) => {
    expect(newSeats({ ...lead, employedBefore, employedAfter })).toEqual({ teams: want, orgUnits: [], company: [] });
  });
});

describe("newSeats — 회사 자리(대표 · 시스템 관리자) 고용 구간(07.1 D-7108 · D-E5)", () => {
  const hired = (hireDate: string | null, resignationDate: string | null = null): Employment => ({ archivedAt: null, resignationDate, hireDate });
  const ceo = { roleBefore: CEO_ROLE_ID, roleAfter: CEO_ROLE_ID, occupiedBefore: [], occupiedAfter: [] };

  it.each([
    {
      case: "새로 만들기(앞 고용 없음) · 입사일 11-01 = [11-01, 열림]",
      input: { ...ceo, roleBefore: null, employedBefore: null, employedAfter: hired("2026-11-01") },
      want: [{ id: CEO_ROLE_ID, from: "2026-11-01", to: null }],
    },
    {
      case: "같은 계급 · 같은 고용(자리 아닌 고침) = 없음",
      input: { ...ceo, employedBefore: hired("2026-11-01"), employedAfter: hired("2026-11-01") },
      want: [],
    },
    {
      case: "퇴사일 10-31 지우기(재입사) = 늘어난 11-01부터만",
      input: { ...ceo, employedBefore: hired("2026-01-01", "2026-10-31"), employedAfter: hired("2026-01-01") },
      want: [{ id: CEO_ROLE_ID, from: "2026-11-01", to: null }],
    },
    {
      case: "입사일 11-05 → 10-20(당기기) = 늘어난 10-20 ~ 11-04",
      input: { ...ceo, employedBefore: hired("2026-11-05"), employedAfter: hired("2026-10-20") },
      want: [{ id: CEO_ROLE_ID, from: "2026-10-20", to: "2026-11-04" }],
    },
    {
      case: "대표 → PM(자리 비우기) = 없음",
      input: { ...ceo, roleAfter: DEFAULT_ROLE_ID, employedBefore: hired("2026-11-01"), employedAfter: hired("2026-11-01") },
      want: [],
    },
    {
      case: "시스템 관리자 → 대표 = 대표 자리 전부(다른 계급의 자리는 빼지 않는다)",
      input: { ...ceo, roleBefore: SYSADMIN_ROLE_ID, employedBefore: hired("2026-01-01"), employedAfter: hired("2026-01-01") },
      want: [{ id: CEO_ROLE_ID, from: "2026-01-01", to: null }],
    },
    {
      case: "PM → 시스템 관리자 · 입사일 없음 = 열린 시작부터",
      input: { ...ceo, roleBefore: DEFAULT_ROLE_ID, roleAfter: SYSADMIN_ROLE_ID, employedBefore: hired(null), employedAfter: hired(null) },
      want: [{ id: SYSADMIN_ROLE_ID, from: "0000-01-01", to: null }],
    },
  ])("$case", ({ input, want }) => {
    expect(newSeats(input)).toEqual({ teams: [], orgUnits: [], company: want });
  });

  it("뒤 고용이 보관이면 회사 자리 없음", () => {
    expect(
      newSeats({ ...ceo, roleBefore: null, employedBefore: null, employedAfter: { archivedAt: new Date("2026-09-01T00:00:00Z"), resignationDate: null, hireDate: null } }),
    ).toEqual({ teams: [], orgUnits: [], company: [] });
  });
});

describe("spansOverlap — 날짜 구간 겹침(끝 포함, null = 열림)", () => {
  it.each([
    { case: "12-31까지 · 1-1부터 = 안 겹침", a: { from: "2026-09-18", to: "2026-12-31" }, b: { from: "2027-01-01", to: null }, want: false },
    { case: "12-31까지 · 12-31부터 = 겹침", a: { from: "2026-09-18", to: "2026-12-31" }, b: { from: "2026-12-31", to: null }, want: true },
    { case: "둘 다 열림 = 겹침", a: { from: "2026-09-18", to: null }, b: { from: "2027-03-01", to: null }, want: true },
    { case: "같은 날 하루짜리 둘 = 겹침", a: { from: "2026-10-01", to: "2026-10-01" }, b: { from: "2026-10-01", to: "2026-10-01" }, want: true },
  ])("$case", ({ a, b, want }) => {
    expect(spansOverlap(a, b)).toBe(want);
    expect(spansOverlap(b, a)).toBe(want);
  });
});

describe("seatTakenMessage — 이름을 못 보면 담당(D3)", () => {
  it.each([
    { kind: "team" as const, name: "박도윤", want: "팀장 있음 · 박도윤" },
    { kind: "team" as const, name: null, want: "팀장 있음 · 시스템 관리자" },
    { kind: "division" as const, name: "최지우", want: "본부 책임자 있음 · 최지우" },
    { kind: "division" as const, name: null, want: "본부 책임자 있음 · 시스템 관리자" },
    { kind: "ceo" as const, name: "김대표", want: "대표 있음 · 김대표" },
    { kind: "sysadmin" as const, name: null, want: "시스템 관리자 있음 · 시스템 관리자" },
  ])("$kind · $name → $want", ({ kind, name, want }) => {
    expect(seatTakenMessage(kind, name)).toBe(want);
  });
});
