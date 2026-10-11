import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import {
  createRole,
  DEFAULT_ROLE_ID,
  SYSADMIN_ROLE_ID,
  type RoleViewScope,
  type RoleWorkScope,
} from "@/domain/permissions/roles";
import type { PermissionAction } from "@/domain/permissions/menus";
import { VIEW_SCOPE_RANK, WORK_SCOPE_RANK } from "@/domain/permissions/grant-ceiling";
import { listPermissions, listVisibility, upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { findRoleById, setRoleViewScope, setRoleWorkScope } from "@/repositories/roles";
import { makePerson } from "./approvals-fixtures";

// 06.4 관리자 상한 통합 테스트 공용 픽스처 — 사람 · 계급은 도메인 · 리포지토리 함수로만 만든다.

export async function makeAdmin(name: string): Promise<Viewer> {
  return makePerson(name, SYSADMIN_ROLE_ID, null);
}

// 커스텀 관리자급 계급 — admin.permissions 보기 · 쓰기만 허용.
export async function makeAdminRole(name: string): Promise<string> {
  const role = await createRole(SYSTEM_VIEWER, { name: `${name}-${randomUUID()}` });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "admin.permissions", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "admin.permissions", action: "write", allowed: true });
  return role.id;
}

// Pitfall 5: 위임 계급은 지정할 계급의 칸 · 범위를 전부 가져야 그 계급을 줄 수 있다(design-E.md:161 「PM 지정 통과」의 전제).
// copyFrom 계급들의 허용 칸 · 보임 칸을 복사하고, 범위는 입력값(없으면 copyFrom 중 가장 넓은 값)을 리포지토리로 쓴다 —
// 도메인 범위 함수는 상한 판정을 거치므로 픽스처는 리포지토리로 만든다. 그 뒤 menus(기본 admin.people 보기 · 쓰기) · infoItems를 더한다.
export async function makeDelegatedRole(input: {
  name?: string;
  copyFrom?: readonly string[];
  menus?: readonly { menu: string; action: PermissionAction }[];
  infoItems?: readonly string[];
  viewScope?: RoleViewScope;
  workScope?: RoleWorkScope;
}): Promise<string> {
  const role = await createRole(SYSTEM_VIEWER, { name: `${input.name ?? "위임"}-${randomUUID()}` });
  let viewScope: RoleViewScope = "own";
  let workScope: RoleWorkScope = "team";
  for (const sourceId of input.copyFrom ?? [DEFAULT_ROLE_ID]) {
    for (const row of await listPermissions(SYSTEM_VIEWER, { roleId: sourceId })) {
      if (row.allowed) {
        await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: row.menu, action: row.action, allowed: true });
      }
    }
    for (const row of await listVisibility(SYSTEM_VIEWER, { roleId: sourceId })) {
      if (row.visible) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: row.infoItem, visible: true });
    }
    const source = await findRoleById(SYSTEM_VIEWER, sourceId);
    if (!source) throw new Error(`복사할 계급이 없습니다: ${sourceId}`);
    const sourceView = source.viewScope as RoleViewScope;
    const sourceWork = source.workScope as RoleWorkScope;
    if (VIEW_SCOPE_RANK[sourceView] > VIEW_SCOPE_RANK[viewScope]) viewScope = sourceView;
    if (WORK_SCOPE_RANK[sourceWork] > WORK_SCOPE_RANK[workScope]) workScope = sourceWork;
  }
  await setRoleViewScope(SYSTEM_VIEWER, role.id, input.viewScope ?? viewScope);
  await setRoleWorkScope(SYSTEM_VIEWER, role.id, input.workScope ?? workScope);
  const menus = input.menus ?? [
    { menu: "admin.people", action: "view" },
    { menu: "admin.people", action: "write" },
  ];
  for (const { menu, action } of menus) {
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu, action, allowed: true });
  }
  for (const infoItem of input.infoItems ?? []) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  }
  return role.id;
}

// 자리 키(hashtextextended(key, 0))의 advisory 미획득 대기 수 — leave-overlap.test.ts의 waitingOn과 같은 SQL.
export async function waitingOnKey(key: string): Promise<number> {
  const hashed = sql`hashtextextended(${key}, 0)`;
  const result = await db.execute<{ n: string }>(sql`
    select count(*)::text as n from pg_locks
    where locktype = 'advisory' and not granted and objsubid = 1
      and classid::bigint = ((${hashed}) >> 32) & 4294967295
      and objid::bigint = (${hashed}) & 4294967295`);
  return Number(result.rows[0]?.n ?? 0);
}

// 키를 쥔 트랜잭션을 연다 — 쥔 뒤 돌아오고, release()가 문을 열고 홀더 트랜잭션 끝을 기다린다.
export async function holdKey(key: string): Promise<{ release: () => Promise<void> }> {
  let open: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  let held: () => void = () => {};
  const holding = new Promise<void>((resolve) => {
    held = resolve;
  });
  const holder = db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
    held();
    await gate;
  });
  await holding;
  return {
    release: async () => {
      open();
      await holder;
    },
  };
}
