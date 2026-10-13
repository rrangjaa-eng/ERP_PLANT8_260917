import { describe, expect, it } from "vitest";
import { newSeats, seatTakenMessage, spansOverlap, type Employment } from "@/domain/people/seat-rules";
import { DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";

// 06.4(D-6404 · D-6415): 저장이 더하는 새 자리 구간(뒤 − 앞, 날짜 단위)과 구간 겹침 · 자리 문구(D3).

const E: Employment = { archivedAt: null, resignationDate: null };
const o1 = { teamId: "t1", orgUnitId: "u1", from: "2026-09-18", to: null };

describe("newSeats — 계급 · 점유 변화가 더하는 자리 구간", () => {
  it.each([
    {
      case: "PM → 팀장(같은 팀) = 그 팀 구간 전부",
      input: { roleBefore: DEFAULT_ROLE_ID, roleAfter: TEAM_LEAD_ROLE_ID, occupiedBefore: [o1], occupiedAfter: [o1] },
      want: { teams: [{ id: "t1", from: "2026-09-18", to: null }], orgUnits: [] },
    },
    {
      case: "PM → 본부 책임자 = 그 본부 구간",
      input: { roleBefore: DEFAULT_ROLE_ID, roleAfter: DIVISION_HEAD_ROLE_ID, occupiedBefore: [o1], occupiedAfter: [o1] },
      want: { teams: [], orgUnits: [{ id: "u1", from: "2026-09-18", to: null }] },
    },
    {
      case: "팀장 → PM(강등) = 없음",
      input: { roleBefore: TEAM_LEAD_ROLE_ID, roleAfter: DEFAULT_ROLE_ID, occupiedBefore: [o1], occupiedAfter: [o1] },
      want: { teams: [], orgUnits: [] },
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
      want: { teams: [{ id: "t2", from: "2026-11-01", to: null }], orgUnits: [] },
    },
    {
      case: "점유 본부가 null인 본부 책임자 = 없음(보관 본부)",
      input: {
        roleBefore: DEFAULT_ROLE_ID,
        roleAfter: DIVISION_HEAD_ROLE_ID,
        occupiedBefore: [],
        occupiedAfter: [{ teamId: "t1", orgUnitId: null, from: "2026-09-18", to: null }],
      },
      want: { teams: [], orgUnits: [] },
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
      want: { teams: [{ id: "t1", from: "2026-09-18", to: null }], orgUnits: [] },
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
        employedAfter: { archivedAt: new Date("2026-09-01T00:00:00Z"), resignationDate: null },
        occupiedBefore: [o1],
        occupiedAfter: [o1],
      }),
    ).toEqual({ teams: [], orgUnits: [] });
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
      employedBefore: { archivedAt: null, resignationDate: "2026-09-01" },
      employedAfter: E,
      want: [{ id: "t1", from: "2026-09-18", to: null }],
    },
    {
      case: "퇴직일 12-31 지우기 = 늘어난 2027-01-01부터만",
      employedBefore: { archivedAt: null, resignationDate: "2026-12-31" },
      employedAfter: E,
      want: [{ id: "t1", from: "2027-01-01", to: null }],
    },
    {
      case: "퇴직일 12-31 → 12-20(당기기) = 없음",
      employedBefore: { archivedAt: null, resignationDate: "2026-12-31" },
      employedAfter: { archivedAt: null, resignationDate: "2026-12-20" },
      want: [],
    },
  ])("$case", ({ employedBefore, employedAfter, want }) => {
    expect(newSeats({ ...lead, employedBefore, employedAfter })).toEqual({ teams: want, orgUnits: [] });
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
  ])("$kind · $name → $want", ({ kind, name, want }) => {
    expect(seatTakenMessage(kind, name)).toBe(want);
  });
});
