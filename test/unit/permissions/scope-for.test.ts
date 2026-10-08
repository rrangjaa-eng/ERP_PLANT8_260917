import { describe, expect, it } from "vitest";
import { rowScopeFor, scopeFor, UnknownScopeEntityError } from "@/domain/permissions/scope-for";
import type { Viewer } from "@/domain/viewer";

const viewer: Viewer = { id: "u1", roleId: "role-pm" };

describe("scopeFor (ADMN-01·ADMN-12 행 필터 서술자)", () => {
  it("메뉴 보기 권한이 있으면 rows가 all이다", async () => {
    const scope = await scopeFor(viewer, "code_items", {
      can: (_v, menu) => Promise.resolve(menu === "admin.code-tables"),
    });
    expect(scope.rows).toBe("all");
  });

  it("해당 엔티티의 메뉴 보기 권한이 없으면 rows가 none이다", async () => {
    const scope = await scopeFor(viewer, "code_items", {
      can: () => Promise.resolve(false),
    });
    expect(scope.rows).toBe("none");
  });

  it("보관함 메뉴 보기 권한이 없으면 includeArchived가 거짓이다", async () => {
    const scope = await scopeFor(viewer, "code_items", {
      can: (_v, menu) => Promise.resolve(menu === "admin.code-tables"),
    });
    expect(scope.includeArchived).toBe(false);
  });

  it("보관함 메뉴 보기 권한이 있으면 includeArchived가 참이다", async () => {
    const scope = await scopeFor(viewer, "code_items", {
      can: () => Promise.resolve(true),
    });
    expect(scope.includeArchived).toBe(true);
  });

  it("공휴일(holiday)은 admin.holidays 보기 권한으로 rows를, 보관함 보기 권한으로 includeArchived를 판정한다", async () => {
    const holidaysOnly = await scopeFor(viewer, "holiday", {
      can: (_v, menu) => Promise.resolve(menu === "admin.holidays"),
    });
    expect(holidaysOnly).toMatchObject({ rows: "all", includeArchived: false });
    const withArchive = await scopeFor(viewer, "holiday", {
      can: (_v, menu) => Promise.resolve(menu === "admin.holidays" || menu === "admin.archive"),
    });
    expect(withArchive).toMatchObject({ rows: "all", includeArchived: true });
  });

  it("등록되지 않은 entity면 UnknownScopeEntityError를 던진다", async () => {
    await expect(scopeFor(viewer, "not_registered")).rejects.toBeInstanceOf(UnknownScopeEntityError);
  });
});

// 06.2(D-6204 · D-6207): 행 범위 서술자 — 계급 view_scope · 오늘(KST) 발령 팀 · 그 팀의 본부를 deps로 주입해 판정만 본다.
describe("rowScopeFor (06.2 행 범위 서술자)", () => {
  const TEAM_ID = "00000000-0000-4000-8000-0000000000t1";
  const ORG_ID = "00000000-0000-4000-8000-0000000000o1";

  function deps(opts: {
    viewScope?: string | null;
    archivedAt?: Date | null;
    canMenus?: string[];
    teamByDate?: Record<string, string>;
    orgByTeam?: Record<string, string>;
    today?: string;
  }) {
    const canMenus = opts.canMenus ?? ["projects", "expenses"];
    return {
      can: (_v: Viewer, menu: string) => Promise.resolve(canMenus.includes(menu)),
      findRoleById: () =>
        Promise.resolve(
          opts.viewScope === null ? null : { viewScope: opts.viewScope ?? "team", archivedAt: opts.archivedAt ?? null },
        ),
      findMembershipAtDate: (_v: Viewer, _userId: string, date: string) => {
        const teamId = (opts.teamByDate ?? { "2026-10-08": TEAM_ID })[date];
        return Promise.resolve(teamId ? { teamId } : null);
      },
      findTeamById: (_v: Viewer, id: string) => {
        const orgUnitId = (opts.orgByTeam ?? { [TEAM_ID]: ORG_ID })[id];
        return Promise.resolve(orgUnitId ? { orgUnitId } : null);
      },
      today: () => opts.today ?? "2026-10-08",
    };
  }

  it("메뉴 보기 권한이 없으면 rows가 none이다(project → projects · expense → expenses)", async () => {
    expect(await rowScopeFor(viewer, "project", deps({ viewScope: "company", canMenus: ["expenses"] }))).toEqual({
      rows: "none",
      includeArchived: false,
    });
    expect(await rowScopeFor(viewer, "expense", deps({ viewScope: "company", canMenus: ["projects", "admin.archive"] }))).toEqual({
      rows: "none",
      includeArchived: true,
    });
  });

  it("계급이 없거나 계급 행이 없거나 view_scope가 네 값 밖이면 none이다(fail-closed)", async () => {
    expect((await rowScopeFor({ id: "u1", roleId: null }, "project", deps({ viewScope: "company" }))).rows).toBe("none");
    expect((await rowScopeFor(viewer, "project", deps({ viewScope: null }))).rows).toBe("none");
    expect((await rowScopeFor(viewer, "project", deps({ viewScope: "step" }))).rows).toBe("none");
  });

  it("company면 rows가 all이고 includeArchived는 보관함 보기 권한이다", async () => {
    expect(await rowScopeFor(viewer, "project", deps({ viewScope: "company", canMenus: ["projects", "admin.archive"] }))).toEqual({
      rows: "all",
      includeArchived: true,
    });
  });

  it("team이면 오늘 발령 팀으로 limited이고, 발령이 없으면 teamId가 null이다", async () => {
    expect(await rowScopeFor(viewer, "project", deps({ viewScope: "team" }))).toEqual({
      rows: "limited",
      includeArchived: false,
      viewerId: "u1",
      by: { kind: "team", teamId: TEAM_ID },
    });
    expect(await rowScopeFor(viewer, "project", deps({ viewScope: "team", teamByDate: {} }))).toMatchObject({
      by: { kind: "team", teamId: null },
    });
  });

  it("org_unit이면 오늘 발령 팀의 본부로 limited이고, 발령이 없으면 orgUnitId가 null이다", async () => {
    expect(await rowScopeFor(viewer, "expense", deps({ viewScope: "org_unit" }))).toEqual({
      rows: "limited",
      includeArchived: false,
      viewerId: "u1",
      by: { kind: "org_unit", orgUnitId: ORG_ID },
    });
    expect(await rowScopeFor(viewer, "expense", deps({ viewScope: "org_unit", teamByDate: {} }))).toMatchObject({
      by: { kind: "org_unit", orgUnitId: null },
    });
  });

  it("own이면 본인만 보는 limited다", async () => {
    expect(await rowScopeFor(viewer, "project", deps({ viewScope: "own" }))).toEqual({
      rows: "limited",
      includeArchived: false,
      viewerId: "u1",
      by: { kind: "own" },
    });
  });

  it("보관된 계급도 그 계급의 view_scope를 그대로 쓴다(can()과 같음)", async () => {
    expect((await rowScopeFor(viewer, "project", deps({ viewScope: "company", archivedAt: new Date() }))).rows).toBe("all");
  });

  it("옛 scopeFor는 quote_line을 모르고(UnknownScopeEntityError) project는 지금 모양 그대로다", async () => {
    await expect(scopeFor(viewer, "quote_line", { can: () => Promise.resolve(true) })).rejects.toBeInstanceOf(
      UnknownScopeEntityError,
    );
    expect(await scopeFor(viewer, "project", { can: (_v, menu) => Promise.resolve(menu === "projects") })).toEqual({
      rows: "all",
      includeArchived: false,
    });
  });

  it("발령 조회 날짜는 deps.today다 — 어제 날짜를 주면 어제 팀이다", async () => {
    const yesterdayTeam = "00000000-0000-4000-8000-0000000000t0";
    const scope = await rowScopeFor(
      viewer,
      "project",
      deps({ viewScope: "team", today: "2026-10-07", teamByDate: { "2026-10-07": yesterdayTeam, "2026-10-08": TEAM_ID } }),
    );
    expect(scope).toMatchObject({ rows: "limited", by: { kind: "team", teamId: yesterdayTeam } });
  });
});
