import { randomUUID } from "node:crypto";
import { createAccount } from "@/domain/auth/accounts";
import { archive } from "@/domain/archive";
import { createOrgUnit, createTeam } from "@/domain/org";
import { listRoles, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID, type RoleViewScope, type RoleWorkScope } from "@/domain/permissions/roles";
import type { PermissionAction } from "@/domain/permissions/menus";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { makeDelegatedRole, makeSeated } from "../integration/admin-cap-fixtures";
import { trackTempRole } from "./temp-roles";

// 06.4-04: 관리자 상한 화면 E2E 공용(스펙 아님). 위임 계급 · 중복 보유자는 통합 픽스처와 같은 함수로 만든다 —
// 중복 팀장은 리포지토리 발령(makeSeated)만 만들 수 있다(도메인 가드가 막는다).

export type DelegatedAccount = { email: string; password: string; userId: string; roleId: string };

function shortId(): string {
  return randomUUID().slice(0, 6);
}

export async function createDelegatedAccount(
  input: {
    menus?: readonly { menu: string; action: PermissionAction }[];
    infoItems?: readonly string[];
    copyFrom?: readonly string[];
    viewScope?: RoleViewScope;
    workScope?: RoleWorkScope;
    rolePrefix?: string;
  } = {},
): Promise<DelegatedAccount> {
  const roleId = await makeDelegatedRole({
    name: (input.rolePrefix ?? "E2E위임-") + shortId(),
    copyFrom: input.copyFrom,
    menus: input.menus,
    infoItems: input.infoItems,
    viewScope: input.viewScope,
    workScope: input.workScope,
  });
  trackTempRole(roleId);
  const email = `e2e-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: `E2E위임-${shortId()}`, roleId });
  return { email, password: tempPassword, userId, roleId };
}

// 새 본부 · 팀 둘 — 한 팀에 팀장 둘(이름 가나다순 = holderIds 순), 다른 팀에 하나.
export async function makeDuplicateLeads(): Promise<{ teamName: string; singleTeamName: string; holderIds: string[] }> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E중복본부-${shortId()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E중복팀-${shortId()}` });
  const single = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E한명팀-${shortId()}` });
  const first = await makeSeated(`E2E팀장가-${shortId()}`, TEAM_LEAD_ROLE_ID, team.id);
  const second = await makeSeated(`E2E팀장나-${shortId()}`, TEAM_LEAD_ROLE_ID, team.id);
  await makeSeated(`E2E팀장다-${shortId()}`, TEAM_LEAD_ROLE_ID, single.id);
  return { teamName: team.name, singleTeamName: single.name, holderIds: [first.id, second.id] };
}

// 06.4-04 DOM 감사 ① 최악 줄 — 본부 이름 20자 + 책임자 둘 · 팀 이름 14자 + 팀장 둘, 보유자 이름은 한글 6자(가장 넓은 글자).
export async function makeWorstCaseDuplicates(): Promise<{ orgUnitName: string; teamName: string }> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E긴이름중복책임자본부-${shortId()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E긴팀중복이-${shortId()}` });
  await makeSeated("책임자가나다", DIVISION_HEAD_ROLE_ID, team.id);
  await makeSeated("책임자라마바", DIVISION_HEAD_ROLE_ID, team.id);
  await makeSeated("팀장가나다라", TEAM_LEAD_ROLE_ID, team.id);
  await makeSeated("팀장마바사아", TEAM_LEAD_ROLE_ID, team.id);
  return { orgUnitName: orgUnit.name, teamName: team.name };
}

// 이름이 prefix로 시작하고 id가 keep이 아닌 보관 안 된 계급을 보관한다 — 앞 실행 · 재시도가 남긴 같은 꼴 계급을 치워
// 「통과 계급 0 · 1」 세계를 결정적으로 만든다.
export async function archiveRolesByPrefix(prefix: string, opts: { keep: string }): Promise<void> {
  for (const role of await listRoles(SYSTEM_VIEWER)) {
    if (role.name.startsWith(prefix) && role.id !== opts.keep && role.archivedAt === null) {
      await archive(SYSTEM_VIEWER, "roles", role.id);
    }
  }
}
