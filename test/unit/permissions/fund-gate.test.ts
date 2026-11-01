import { beforeEach, describe, expect, it, vi } from "vitest";
import { can } from "@/domain/permissions/can";
import { fundGate, memoizeFundGateForRequest, readFundDivision } from "@/domain/permissions/fund-gate";
import { FUND_DIVISION_SETTING_KEY } from "@/domain/permissions/fund-scope";
import type { Viewer } from "@/domain/viewer";
import { log } from "@/lib/log";

// 07.3-01(D-7301 · D-7310 · D-7311 · D-7313): 자금 게이트 — 계급 viewScope company는 면제, 아니면 소속 본부 === 자금 본부 설정.
// 기본 의존성(리포지토리)을 가짜로 바꿔 판정 · 요청 memo를 센다.
const repo = vi.hoisted(() => ({
  findSimpleValue: vi.fn(),
  findOrgUnitById: vi.fn(),
  findRoleById: vi.fn(),
  findMembershipAtDate: vi.fn(),
  findTeamById: vi.fn(),
  findUserDivision: vi.fn(),
}));
vi.mock("@/repositories/settings", () => ({ findSimpleValue: repo.findSimpleValue }));
vi.mock("@/repositories/org-units", () => ({ findOrgUnitById: repo.findOrgUnitById }));
vi.mock("@/repositories/roles", () => ({ findRoleById: repo.findRoleById }));
vi.mock("@/repositories/team-memberships", () => ({ findMembershipAtDate: repo.findMembershipAtDate }));
vi.mock("@/repositories/teams", () => ({ findTeamById: repo.findTeamById }));
vi.mock("@/repositories/users", () => ({ findUserDivision: repo.findUserDivision }));

const FUND_DIVISION = "22222222-2222-4222-8222-2222222222f1";
const OTHER_DIVISION = "22222222-2222-4222-8222-2222222222f2";
const ARCHIVED_DIVISION = "22222222-2222-4222-8222-2222222222f3";
const MGMT_TEAM = "22222222-2222-4222-8222-2222222222b1";

type World = {
  viewScope?: string | null;
  setting?: unknown;
  teamId?: string | null;
  teamOrgUnit?: string;
  divisionId?: string | null;
};

function world(w: World): void {
  repo.findRoleById.mockImplementation(() => Promise.resolve(w.viewScope === null ? null : { viewScope: w.viewScope ?? "team" }));
  repo.findSimpleValue.mockImplementation((_v: Viewer, key: string) =>
    Promise.resolve(key === FUND_DIVISION_SETTING_KEY && w.setting !== undefined ? { key, value: w.setting } : null),
  );
  repo.findOrgUnitById.mockImplementation((_v: Viewer, id: string) =>
    Promise.resolve(
      id === FUND_DIVISION
        ? { id, name: "자금 본부", archivedAt: null }
        : id === OTHER_DIVISION
          ? { id, name: "다른 본부", archivedAt: null }
          : id === ARCHIVED_DIVISION
            ? { id, name: "보관 본부", archivedAt: new Date("2026-09-01T00:00:00Z") }
            : null,
    ),
  );
  repo.findMembershipAtDate.mockImplementation(() => Promise.resolve(w.teamId ? { teamId: w.teamId } : null));
  repo.findTeamById.mockImplementation((_v: Viewer, id: string) =>
    Promise.resolve(id === w.teamId ? { orgUnitId: w.teamOrgUnit ?? FUND_DIVISION } : null),
  );
  repo.findUserDivision.mockImplementation(() => Promise.resolve({ divisionId: w.divisionId ?? null }));
}

const viewer = (): Viewer => ({ id: "u1", roleId: "role-x" });

beforeEach(() => {
  for (const fn of Object.values(repo)) fn.mockReset();
  vi.restoreAllMocks();
});

describe("readFundDivision (07.3-01 D-7310)", () => {
  it("설정이 보관 안 된 본부 uuid면 그 본부의 id · 이름이다", async () => {
    world({ setting: FUND_DIVISION });
    expect(await readFundDivision(viewer())).toEqual({ id: FUND_DIVISION, name: "자금 본부" });
  });

  it.each([
    ["설정 행이 없다", undefined],
    ["값이 JSON null이다(관리자가 비움)", null],
    ["값이 uuid가 아니다", "경영관리본부"],
    ["가리키는 본부가 없다", "22222222-2222-4222-8222-2222222222f9"],
    ["가리키는 본부가 보관됐다", ARCHIVED_DIVISION],
  ])("%s → null", async (_label, setting) => {
    world({ setting });
    expect(await readFundDivision(viewer())).toBeNull();
  });

  it.each([
    ["값이 uuid가 아니다", "경영관리본부", "not_uuid"],
    ["가리키는 본부가 없다", "22222222-2222-4222-8222-2222222222f9", "org_unit_missing"],
    ["가리키는 본부가 보관됐다", ARCHIVED_DIVISION, "org_unit_archived"],
  ])("값이 있는데 %s → 키 · 사유로 경고 한 번", async (_label, setting, reason) => {
    world({ setting });
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined);
    await readFundDivision(viewer());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("fund_gate.division_unusable", { key: FUND_DIVISION_SETTING_KEY, reason });
  });

  it.each([
    ["설정 행이 없다", undefined],
    ["값이 JSON null이다", null],
    ["값이 살아 있는 본부다", FUND_DIVISION],
  ])("%s → 경고 없음", async (_label, setting) => {
    world({ setting });
    const warn = vi.spyOn(log, "warn").mockImplementation(() => undefined);
    await readFundDivision(viewer());
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("fundGate (07.3-01)", () => {
  it("계급 viewScope가 company면 설정이 비어도 참이다(D-7313)", async () => {
    world({ viewScope: "company" });
    expect(await fundGate(viewer())).toBe(true);
    expect(repo.findSimpleValue).not.toHaveBeenCalled();
  });

  it("오늘 팀의 본부가 자금 본부면 참이다", async () => {
    world({ setting: FUND_DIVISION, teamId: MGMT_TEAM });
    expect(await fundGate(viewer())).toBe(true);
  });

  it("팀이 없고 사람 본부 칸이 자금 본부면 참이다(D-7311)", async () => {
    world({ setting: FUND_DIVISION, teamId: null, divisionId: FUND_DIVISION });
    expect(await fundGate(viewer())).toBe(true);
  });

  it("오늘 팀의 본부가 다른 본부면 본부 칸이 자금 본부여도 거짓이다(팀이 이긴다)", async () => {
    world({ setting: FUND_DIVISION, teamId: MGMT_TEAM, teamOrgUnit: OTHER_DIVISION, divisionId: FUND_DIVISION });
    expect(await fundGate(viewer())).toBe(false);
  });

  it.each([
    ["설정 행이 없다", undefined],
    ["값이 uuid가 아니다", "not-a-uuid"],
    ["설정 본부가 보관됐다", ARCHIVED_DIVISION],
  ])("%s → 소속이 같아 보여도 거짓이다(fail-closed)", async (_label, setting) => {
    world({ setting, teamId: null, divisionId: typeof setting === "string" ? setting : FUND_DIVISION });
    expect(await fundGate(viewer())).toBe(false);
  });

  it("계급이 없거나 계급 행이 없으면 거짓이다", async () => {
    world({ setting: FUND_DIVISION, teamId: MGMT_TEAM });
    expect(await fundGate({ id: "u1", roleId: null })).toBe(false);
    world({ viewScope: null, setting: FUND_DIVISION, teamId: MGMT_TEAM });
    expect(await fundGate(viewer())).toBe(false);
  });

  it("uuid가 아닌 viewer id(leak-scan-probe)도 던지지 않고 소속 없음으로 거짓이다", async () => {
    world({ setting: FUND_DIVISION });
    repo.findUserDivision.mockImplementation(() => Promise.resolve(null));
    await expect(fundGate({ id: "leak-scan-probe", roleId: "role-x" })).resolves.toBe(false);
  });

  it("deps로 계급 · 자금 본부 · 소속 본부를 주입하면 리포지토리를 읽지 않는다", async () => {
    const result = await fundGate(viewer(), {
      findRoleById: () => Promise.resolve({ viewScope: "team" }),
      readFundDivision: () => Promise.resolve({ id: FUND_DIVISION, name: "자금 본부" }),
      viewerDivision: () => Promise.resolve({ teamId: null, orgUnitId: FUND_DIVISION }),
    });
    expect(result).toBe(true);
    expect(repo.findRoleById).not.toHaveBeenCalled();
    expect(repo.findSimpleValue).not.toHaveBeenCalled();
  });
});

// 요청 memo(T-07.3-01-09): getSession이 등록한 viewer 객체 하나 안에서만 한 번 계산한다.
describe("fundGate 요청 memo", () => {
  const paymentsRow = {
    findPermission: (_v: Viewer, roleId: string, menu: string, action: string) =>
      Promise.resolve({ id: "p1", roleId, menu, action, allowed: true, updatedAt: new Date(), updatedBy: null }),
  };

  it("등록한 viewer로 자금 키 can()을 세 번 불러도 설정 · 소속 읽기는 각 한 번이다", async () => {
    world({ setting: FUND_DIVISION, teamId: MGMT_TEAM });
    const v = viewer();
    memoizeFundGateForRequest(v);
    for (const menu of ["expenses.payments", "evidence.intake", "projects.budget"]) {
      expect(await can(v, menu, "write", paymentsRow)).toBe(true);
    }
    expect(repo.findSimpleValue).toHaveBeenCalledTimes(1);
    expect(repo.findMembershipAtDate).toHaveBeenCalledTimes(1);
  });

  it("등록하지 않은 viewer는 매번 계산한다", async () => {
    world({ setting: FUND_DIVISION, teamId: MGMT_TEAM });
    const v = viewer();
    for (let i = 0; i < 3; i += 1) await can(v, "expenses.payments", "write", paymentsRow);
    expect(repo.findSimpleValue).toHaveBeenCalledTimes(3);
    expect(repo.findMembershipAtDate).toHaveBeenCalledTimes(3);
  });

  it("deps를 넘기면 등록한 viewer라도 memo를 쓰지 않는다", async () => {
    world({ setting: FUND_DIVISION, teamId: MGMT_TEAM });
    const v = viewer();
    memoizeFundGateForRequest(v);
    expect(await fundGate(v)).toBe(true);
    const closed = await fundGate(v, { readFundDivision: () => Promise.resolve(null) });
    expect(closed).toBe(false);
  });

  it("새로 등록한 viewer 객체는 바뀐 소속을 읽는다", async () => {
    world({ setting: FUND_DIVISION, teamId: MGMT_TEAM });
    const first = viewer();
    memoizeFundGateForRequest(first);
    expect(await fundGate(first)).toBe(true);
    world({ setting: FUND_DIVISION, teamId: MGMT_TEAM, teamOrgUnit: OTHER_DIVISION });
    expect(await fundGate(first)).toBe(true);
    const next = viewer();
    memoizeFundGateForRequest(next);
    expect(await fundGate(next)).toBe(false);
  });

  it("첫 계산이 reject하면 memo에서 지워 다음 호출이 다시 계산한다", async () => {
    world({ setting: FUND_DIVISION, teamId: MGMT_TEAM });
    repo.findRoleById.mockRejectedValueOnce(new Error("일시 오류"));
    const v = viewer();
    memoizeFundGateForRequest(v);
    await expect(fundGate(v)).rejects.toThrow("일시 오류");
    expect(await fundGate(v)).toBe(true);
    expect(repo.findRoleById).toHaveBeenCalledTimes(2);
  });
});
