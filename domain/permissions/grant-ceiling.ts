import type { Viewer } from "@/domain/viewer";
import type { RoleViewScope, RoleWorkScope } from "@/domain/permissions/roles";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import type { DbOrTx } from "@/repositories/document-counters";
import { listRoleGrantRows } from "@/repositories/permissions";

// 06.4(D-6401 · D-6402 · D-6407): 권한 상한 — 행위자가 `admin.permissions` 쓰기가 없으면 주는 계급 R과 대상의 지금 계급 C가
// 둘 다 행위자 계급의 권한 집합(허용 칸 + 보임 칸) 안이고 범위가 행위자 이하여야 한다. 260907 `adminSeatWhy`
// (`O: server/src/people-rules.ts:21-39`)는 직책 이름 `sys_admin` 비교였다 — 우리는 순위 열이 없어(D-33) 집합으로 비교해
// 커스텀 관리자급도 자동 보호. SYSTEM_VIEWER는 시드가 시스템 관리자 계급에 모든 칸을 주므로 명시 면제 없이 통과한다(O4).
// 화면 select 숨김은 UX일 뿐이고 이 판정이 진짜 관문이다.
// roles.ts가 이 파일을 값으로 import하므로 roles.ts에서는 타입만 가져온다(순환 방지).

export const ADMIN_PERMISSIONS_WRITE_KEY = "m:admin.permissions::write";

export function permissionKey(menu: string, action: string): string {
  return `m:${menu}::${action}`;
}

export function visibilityKey(infoItem: string): string {
  return `v:${infoItem}`;
}

// 배열 순서를 믿지 않는다 — roles.ts의 두 범위 배열은 방향이 반대다.
export const VIEW_SCOPE_RANK: Record<RoleViewScope, number> = { own: 0, team: 1, org_unit: 2, company: 3 };
export const WORK_SCOPE_RANK: Record<RoleWorkScope, number> = { team: 0, company: 1 };

export type RoleGrantSnapshot = { keys: ReadonlySet<string>; viewScope: RoleViewScope; workScope: RoleWorkScope };

export const NO_ROLE_SNAPSHOT: RoleGrantSnapshot = { keys: new Set<string>(), viewScope: "own", workScope: "team" };

export function canGrantRole(actor: RoleGrantSnapshot, role: RoleGrantSnapshot): boolean {
  if (actor.keys.has(ADMIN_PERMISSIONS_WRITE_KEY)) return true;
  for (const key of role.keys) {
    if (!actor.keys.has(key)) return false;
  }
  // D-6401 사용자 확정(2026-10-11 카드): 범위 포함
  if (VIEW_SCOPE_RANK[role.viewScope] > VIEW_SCOPE_RANK[actor.viewScope]) return false;
  if (WORK_SCOPE_RANK[role.workScope] > WORK_SCOPE_RANK[actor.workScope]) return false;
  return true;
}

export function canEditRole(actor: RoleGrantSnapshot, before: RoleGrantSnapshot, after: RoleGrantSnapshot): boolean {
  return canGrantRole(actor, before) && canGrantRole(actor, after);
}

export class RoleGrantForbiddenError extends UserFacingError {}

export const GRANT_FORBIDDEN_MESSAGE = "계급 지정 권한 없음 · 시스템 관리자";

// DB CHECK가 값을 보장하지만 타입 좁히기만 믿지 않는다(순위 표 키로 판정, roles.ts 배열 값은 쓰지 않는다).
function isViewScope(s: string): s is RoleViewScope {
  return Object.hasOwn(VIEW_SCOPE_RANK, s);
}

function isWorkScope(s: string): s is RoleWorkScope {
  return Object.hasOwn(WORK_SCOPE_RANK, s);
}

export async function loadRoleGrantSnapshots(
  viewer: Viewer,
  roleIds: readonly string[],
  tx?: DbOrTx,
): Promise<Map<string, RoleGrantSnapshot>> {
  const rows = await listRoleGrantRows(viewer, [...new Set(roleIds)], tx);
  // 06.4 /review F6: 모르는 범위 값의 계급은 결과에서 뺀다 — 대상이면 없는 계급처럼 거부되고(fail-closed), 행위자면
  // 호출자가 가장 낮은 NO_ROLE_SNAPSHOT으로 친다. 가장 좁은 범위로 바꿔 끼우면 대상이 상한 안으로 잘못 들어온다.
  const snapshots = new Map<string, RoleGrantSnapshot>();
  for (const row of rows) {
    const { viewScope, workScope } = row;
    if (!isViewScope(viewScope) || !isWorkScope(workScope)) continue;
    snapshots.set(row.roleId, { keys: new Set(row.keys), viewScope, workScope });
  }
  return snapshots;
}

export async function assertCanGrantRoles(
  viewer: Viewer,
  roleIds: readonly (string | null)[],
  tx?: DbOrTx,
): Promise<void> {
  const targets = roleIds.filter((id): id is string => id !== null);
  const snapshots = await loadRoleGrantSnapshots(viewer, viewer.roleId ? [viewer.roleId, ...targets] : targets, tx);
  const actor = (viewer.roleId ? snapshots.get(viewer.roleId) : undefined) ?? NO_ROLE_SNAPSHOT;
  for (const id of targets) {
    // 없는 계급은 앞 단계가 이미 거르지만 fail-closed — 빈 계급으로 치지 않고 거부한다.
    const role = snapshots.get(id);
    if (!role || !canGrantRole(actor, role)) throw new RoleGrantForbiddenError(GRANT_FORBIDDEN_MESSAGE);
  }
}

// roleId가 null이면 새 계급 — 바꾸기 전은 빈 계급(E3 createRole).
export async function assertCanEditRole(
  viewer: Viewer,
  roleId: string | null,
  edit: (before: RoleGrantSnapshot) => RoleGrantSnapshot,
  tx?: DbOrTx,
): Promise<void> {
  const ids = [viewer.roleId, roleId].filter((id): id is string => id !== null);
  const snapshots = await loadRoleGrantSnapshots(viewer, ids, tx);
  const actor = (viewer.roleId ? snapshots.get(viewer.roleId) : undefined) ?? NO_ROLE_SNAPSHOT;
  if (actor.keys.has(ADMIN_PERMISSIONS_WRITE_KEY)) return;
  const before = roleId === null ? NO_ROLE_SNAPSHOT : snapshots.get(roleId);
  if (!before || !canEditRole(actor, before, edit(before))) throw new RoleGrantForbiddenError(GRANT_FORBIDDEN_MESSAGE);
}
