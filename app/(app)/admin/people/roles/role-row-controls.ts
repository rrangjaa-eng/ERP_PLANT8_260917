// 07-21(R14 · SYSTEM 개정 10): 계급 줄의 화면 판정 — 서버 `assertCanEditRole`과 같은 순서 · 같은 술어(`canEditRole`)를 재사용한다.
// 화면 숨김은 UX이고 관문은 서버다. 위험 경로(domain/permissions/)를 고치지 않으려고 app/에 둔다 — 클라이언트는 타입만 import한다.
import type { Viewer } from "@/domain/viewer";
import { ROLE_VIEW_SCOPES, ROLE_WORK_SCOPES, type RoleViewScope, type RoleWorkScope } from "@/domain/permissions/roles";
import {
  ADMIN_PERMISSIONS_WRITE_KEY,
  NO_ROLE_SNAPSHOT,
  canEditRole,
  loadRoleGrantSnapshots,
  type RoleGrantSnapshot,
} from "@/domain/permissions/grant-ceiling";

// 칸이 null이면 고를 값이 하나 이하 — select 없이 저장값 글자.
export type RoleRowControls = {
  editable: boolean;
  workScopes: RoleWorkScope[] | null;
  viewScopes: RoleViewScope[] | null;
};

const LOCKED: RoleRowControls = { editable: false, workScopes: null, viewScopes: null };

function choices<S>(values: readonly S[], accepts: (value: S) => boolean): S[] | null {
  const accepted = values.filter(accepts);
  return accepted.length < 2 ? null : accepted;
}

export function roleRowControls(actor: RoleGrantSnapshot, role: RoleGrantSnapshot | undefined): RoleRowControls {
  if (actor.keys.has(ADMIN_PERMISSIONS_WRITE_KEY)) {
    return { editable: true, workScopes: [...ROLE_WORK_SCOPES], viewScopes: [...ROLE_VIEW_SCOPES] };
  }
  if (!role || !canEditRole(actor, role, role)) return LOCKED;
  return {
    editable: true,
    workScopes: choices(ROLE_WORK_SCOPES, (workScope) => canEditRole(actor, role, { ...role, workScope })),
    viewScopes: choices(ROLE_VIEW_SCOPES, (viewScope) => canEditRole(actor, role, { ...role, viewScope })),
  };
}

// 자기 계급 줄(06.2 CSO-1 — 따로 글자)을 뺀 줄에 상한 때문에 잠긴 줄 · 칸이 하나라도 있으면 표 위 잠김 한 줄.
export function ceilingLocked(controlsById: Readonly<Record<string, RoleRowControls>>, viewerRoleId: string | null): boolean {
  return Object.entries(controlsById).some(
    ([id, row]) => id !== viewerRoleId && (!row.editable || row.workScopes === null || row.viewScopes === null),
  );
}

export async function loadRoleRowControls(
  viewer: Viewer,
  roleIds: readonly string[],
): Promise<Record<string, RoleRowControls>> {
  const snapshots = await loadRoleGrantSnapshots(viewer, viewer.roleId ? [viewer.roleId, ...roleIds] : roleIds);
  const actor = (viewer.roleId ? snapshots.get(viewer.roleId) : undefined) ?? NO_ROLE_SNAPSHOT;
  const controls: Record<string, RoleRowControls> = {};
  for (const id of roleIds) controls[id] = roleRowControls(actor, snapshots.get(id));
  return controls;
}
