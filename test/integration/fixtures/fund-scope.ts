import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { teamMemberships, users } from "@/db/schema";
import { FUND_SCOPED_MENUS } from "@/domain/permissions/fund-scope";
import type { PermissionAction } from "@/domain/permissions/menus";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertPermission } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { listMemberships } from "@/repositories/team-memberships";
import { makePerson, orgUnitIdByName, teamIdByName } from "../approvals-fixtures";

// 07.3-01 자금 게이트 통합 픽스처 — 시험 DB는 매번 seedMasterData로 경영관리본부 · 경영관리팀 · 자금 본부 설정이 선다.
// placement: 팀 이름이면 그 팀에 발령, `{ division }`이면 팀 없이 사람 본부 칸만(07.1-07 선례대로 db로 직접), null이면 소속 없음.
export type FundPlacement = string | { division: string } | null;

export async function makeFundPerson(name: string, roleId: string, placement: FundPlacement): Promise<Viewer> {
  const person = await makePerson(name, roleId, typeof placement === "string" ? placement : null);
  if (placement !== null && typeof placement === "object") {
    await setDivisionColumn(person.id, await orgUnitIdByName(placement.division));
  }
  return person;
}

export async function setDivisionColumn(userId: string, divisionId: string | null): Promise<void> {
  await db.update(users).set({ divisionId }).where(eq(users.id, userId));
}

/** 계급에 자금 키를 켠다 — 쓰기면 같은 메뉴 보기도 함께(권한표 규칙 matrix.ts PERMISSION_REQUIRES). */
export async function grantFundKeys(roleId: string, menus: readonly string[], action: PermissionAction = "write"): Promise<void> {
  for (const menu of menus) {
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu, action, allowed: true });
    if (action !== "view") await upsertPermission(SYSTEM_VIEWER, { roleId, menu, action: "view", allowed: true });
  }
}

/** 시험 전용 계급(관리자가 만든 계급처럼 — 시드 계급의 권한을 바꾸지 않는다). 기본 보는 범위는 team. */
export async function makeFundRole(viewScope: "company" | "org_unit" | "team" | "own" = "team"): Promise<string> {
  const id = `role-fund-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id, name: `자금 시험 ${id.slice(-8)}`, sortOrder: 90, viewScope });
  return id;
}

/** 6사람 세계(07.3-01 Task 2) — 시드 계급(사원 · 본부 책임자 · 대표)에 자금 키 8개 보기 · 쓰기를 켠다(시드 행은 07.3-02). */
export type FundWorld = {
  mgmtHead: Viewer;
  mgmtStaff: Viewer;
  planningHead: Viewer;
  planningStaff: Viewer;
  ceo: Viewer;
  sysadmin: Viewer;
};

export async function grantAllFundKeys(roleId: string): Promise<void> {
  await grantFundKeys(roleId, FUND_SCOPED_MENUS, "view");
  await grantFundKeys(roleId, FUND_SCOPED_MENUS, "write");
}

export async function buildFundWorld(): Promise<FundWorld> {
  for (const roleId of [DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID, CEO_ROLE_ID]) await grantAllFundKeys(roleId);
  return {
    mgmtHead: await makeFundPerson("경영관리 책임자", DIVISION_HEAD_ROLE_ID, { division: "경영관리본부" }),
    mgmtStaff: await makeFundPerson("경영관리 사원", DEFAULT_ROLE_ID, "경영관리팀"),
    planningHead: await makeFundPerson("기획 책임자", DIVISION_HEAD_ROLE_ID, { division: "기획본부" }),
    planningStaff: await makeFundPerson("기획 사원", DEFAULT_ROLE_ID, "기획1팀"),
    ceo: await makeFundPerson("대표", CEO_ROLE_ID, null),
    sysadmin: await makeFundPerson("시스템 관리자", SYSADMIN_ROLE_ID, null),
  };
}

/**
 * 기존 시험 보정용 — 이 사람을 경영관리본부 소속으로 만든다. 발령이 없으면 본부 칸 = 경영관리본부,
 * 있으면 그 발령 줄의 팀을 경영관리팀으로 바꾼다(발령일은 그대로 — 시험이 주입한 오늘 · 과거 날짜에서도 같은 답. 팀이 이기므로 칸으로는 못 바꾼다).
 */
export async function placeInFundDivision(userId: string): Promise<void> {
  const memberships = await listMemberships(SYSTEM_VIEWER, userId);
  if (memberships.length === 0) {
    await setDivisionColumn(userId, await orgUnitIdByName("경영관리본부"));
    return;
  }
  await db.update(teamMemberships).set({ teamId: await teamIdByName("경영관리팀") }).where(eq(teamMemberships.userId, userId));
}
