import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import {
  listOrgUnits,
  listTeams,
  listAssignableTeams,
  createOrgUnit,
  createTeam,
  renameOrgUnit,
  renameTeam,
  NotFoundError,
  ForbiddenError,
} from "@/domain/org";
import { archive, restore } from "@/domain/archive";
import { listOrgUnits as repoListOrgUnits } from "@/repositories/org-units";
import { listTeams as repoListTeams } from "@/repositories/teams";

describe("org (MAST-02, 실제 Postgres) — 본부·팀 CRUD", () => {
  it("본부·팀을 추가하고 이름을 바꿀 수 있다", async () => {
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `본부-${randomUUID()}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `팀-${randomUUID()}` });

    await renameOrgUnit(SYSTEM_VIEWER, orgUnit.id, "바뀐 본부 이름");
    await renameTeam(SYSTEM_VIEWER, team.id, "바뀐 팀 이름");

    const orgUnits = await listOrgUnits(SYSTEM_VIEWER);
    const teams = await listTeams(SYSTEM_VIEWER);
    expect(orgUnits.find((o) => o.id === orgUnit.id)?.name).toBe("바뀐 본부 이름");
    expect(teams.find((t) => t.id === team.id)?.name).toBe("바뀐 팀 이름");
    expect(teams.find((t) => t.id === team.id)?.orgUnitId).toBe(orgUnit.id);
  });

  it("모든 팀이 본부 외래키를 갖는다 — 존재하지 않는 본부로 팀을 만들면 거부된다", async () => {
    await expect(
      createTeam(SYSTEM_VIEWER, { orgUnitId: randomUUID(), name: `팀-${randomUUID()}` }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("같은 본부에 같은 이름의 팀을 두 번 만들면 두 번째가 거부된다(복합 UNIQUE)", async () => {
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `본부-${randomUUID()}` });
    const name = `중복팀-${randomUUID()}`;
    await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name });
    await expect(createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name })).rejects.toThrow();
  });

  it("본부를 보관하면 보관 제외 서술자 조회에서 빠지고 복원하면 다시 보인다", async () => {
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `본부-${randomUUID()}` });
    await archive(SYSTEM_VIEWER, "org_unit", orgUnit.id);

    const excluded = await repoListOrgUnits(SYSTEM_VIEWER, { scope: { rows: "all", includeArchived: false } });
    expect(excluded.some((o) => o.id === orgUnit.id)).toBe(false);

    const included = await repoListOrgUnits(SYSTEM_VIEWER, { scope: { rows: "all", includeArchived: true } });
    expect(included.some((o) => o.id === orgUnit.id)).toBe(true);

    await restore(SYSTEM_VIEWER, "org_unit", orgUnit.id);
    const restored = await listOrgUnits(SYSTEM_VIEWER);
    expect(restored.some((o) => o.id === orgUnit.id)).toBe(true);
  });

  it("팀을 보관하면 보관 제외 서술자 조회에서 빠지고 복원하면 다시 보인다", async () => {
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `본부-${randomUUID()}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `팀-${randomUUID()}` });
    await archive(SYSTEM_VIEWER, "team", team.id);

    const excluded = await repoListTeams(SYSTEM_VIEWER, { scope: { rows: "all", includeArchived: false } });
    expect(excluded.some((t) => t.id === team.id)).toBe(false);

    const included = await repoListTeams(SYSTEM_VIEWER, { scope: { rows: "all", includeArchived: true } });
    expect(included.some((t) => t.id === team.id)).toBe(true);

    await restore(SYSTEM_VIEWER, "team", team.id);
    const restored = await listTeams(SYSTEM_VIEWER);
    expect(restored.some((t) => t.id === team.id)).toBe(true);
  });

  it("사람 메뉴 쓰기 권한이 없는 계급은 본부·팀을 만들 수 없다", async () => {
    const pmViewer = { id: "org-pm-tester", roleId: DEFAULT_ROLE_ID };
    await expect(createOrgUnit(pmViewer, { name: `거부-${randomUUID()}` })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

// 07-21 Codex 델타 P2 — 사람 등록 · 발령의 팀 선택지: 서버가 거부하는 보관 본부 아래 팀은 목록에서 뺀다(할 수 없는 선택지는 숨김).
describe("listAssignableTeams — 사람 등록 · 발령 팀 선택지", () => {
  it("보관된 본부 아래 활성 팀과 보관된 팀은 빠지고, 활성 본부의 활성 팀만 남는다", async () => {
    const activeOrg = await createOrgUnit(SYSTEM_VIEWER, { name: `본부-${randomUUID()}` });
    const archivedOrg = await createOrgUnit(SYSTEM_VIEWER, { name: `본부-${randomUUID()}` });
    const keep = await createTeam(SYSTEM_VIEWER, { orgUnitId: activeOrg.id, name: `팀-${randomUUID()}` });
    const archivedTeam = await createTeam(SYSTEM_VIEWER, { orgUnitId: activeOrg.id, name: `팀-${randomUUID()}` });
    const underArchivedOrg = await createTeam(SYSTEM_VIEWER, { orgUnitId: archivedOrg.id, name: `팀-${randomUUID()}` });
    await archive(SYSTEM_VIEWER, "team", archivedTeam.id);
    await archive(SYSTEM_VIEWER, "org_unit", archivedOrg.id);

    const options = (await listAssignableTeams(SYSTEM_VIEWER)).map((team) => team.id);

    expect(options).toContain(keep.id);
    expect(options).not.toContain(archivedTeam.id);
    expect(options).not.toContain(underArchivedOrg.id);
    // 일반 팀 목록은 그대로 — 보관 본부 아래 활성 팀도 담긴다(조직 화면 · 소속 필터가 쓴다).
    expect((await listTeams(SYSTEM_VIEWER)).map((team) => team.id)).toContain(underArchivedOrg.id);
  });
});
