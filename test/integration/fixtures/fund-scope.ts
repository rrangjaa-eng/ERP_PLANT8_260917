import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import type { PermissionAction } from "@/domain/permissions/menus";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertPermission } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { makePerson, orgUnitIdByName } from "../approvals-fixtures";

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
