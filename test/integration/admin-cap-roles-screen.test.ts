import { describe, expect, it } from "vitest";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, ROLE_VIEW_SCOPES, ROLE_WORK_SCOPES, listRoles } from "@/domain/permissions/roles";
import { assertCanEditRole, type RoleGrantSnapshot } from "@/domain/permissions/grant-ceiling";
import { loadRoleRowControls } from "@/app/(app)/admin/people/roles/role-row-controls";
import { makePerson } from "./approvals-fixtures";
import { makeAdmin, makeDelegatedRole } from "./admin-cap-fixtures";

// 07-21 T-07-21-01: 계급 화면 판정(`loadRoleRowControls`)이 서버 `assertCanEditRole`과 모든 계급 × 범위 값에서 같다.

async function passes(viewer: Viewer, roleId: string, edit: (b: RoleGrantSnapshot) => RoleGrantSnapshot): Promise<boolean> {
  return assertCanEditRole(viewer, roleId, edit).then(
    () => true,
    () => false,
  );
}

async function expectSameAsServer(viewer: Viewer): Promise<void> {
  const roles = await listRoles(SYSTEM_VIEWER);
  const controls = await loadRoleRowControls(viewer, roles.map((role) => role.id));
  for (const role of roles) {
    const row = controls[role.id];
    expect(row, role.id).toBeDefined();
    if (!row) continue;
    expect(row.editable, `${role.name} editable`).toBe(await passes(viewer, role.id, (b) => b));

    const acceptedWork: string[] = [];
    for (const s of ROLE_WORK_SCOPES) {
      if (await passes(viewer, role.id, (b) => ({ ...b, workScope: s }))) acceptedWork.push(s);
    }
    const acceptedView: string[] = [];
    for (const s of ROLE_VIEW_SCOPES) {
      if (await passes(viewer, role.id, (b) => ({ ...b, viewScope: s }))) acceptedView.push(s);
    }
    if (row.workScopes === null) expect(acceptedWork.length, `${role.name} work`).toBeLessThanOrEqual(1);
    else expect(row.workScopes, `${role.name} work`).toEqual(acceptedWork);
    if (row.viewScopes === null) expect(acceptedView.length, `${role.name} view`).toBeLessThanOrEqual(1);
    else expect(row.viewScopes, `${role.name} view`).toEqual(acceptedView);
  }
}

describe("계급 화면 판정 = 서버 판정(07-21 R14)", () => {
  it("위임자(team·team) — 모든 계급 × 값", async () => {
    const roleM = await makeDelegatedRole({ copyFrom: [DEFAULT_ROLE_ID], viewScope: "team", workScope: "team" });
    // 상한 안 줄이 선택지를 갖게 — PM 칸 부분집합인 임시 계급(own · team).
    const inside = await makeDelegatedRole({ name: "상한 안", copyFrom: [], menus: [], viewScope: "own", workScope: "team" });
    const d = await makePerson("위임 D", roleM, null);

    const controls = await loadRoleRowControls(d, [inside]);
    expect(controls[inside]).toEqual({ editable: true, workScopes: null, viewScopes: ["team", "own"] });

    await expectSameAsServer(d);
  });

  it("시스템 관리자 — 모든 줄 편집 가능 · 서버와 같음", async () => {
    const a = await makeAdmin("관리자 A");
    const roles = await listRoles(SYSTEM_VIEWER);
    const controls = await loadRoleRowControls(a, roles.map((role) => role.id));
    for (const role of roles) expect(controls[role.id]?.editable).toBe(true);
    await expectSameAsServer(a);
  });
});
