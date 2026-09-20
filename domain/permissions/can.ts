import type { Viewer } from "@/domain/viewer";
import type { PermissionAction } from "@/domain/permissions/menus";
import { findPermission as defaultFindPermission } from "@/repositories/permissions";
import { UserFacingError } from "@/lib/actions/user-facing-error";

// ADMN-01: 메뉴×동작 판정 — 이 페이즈 이후 모든 메뉴 접근의 유일한 지점.
// domain/system-status/index.ts의 StatusDeps 패턴을 그대로 따른다(deps?로
// 리포지토리 함수를 주입해 단위 테스트가 Postgres 없이 스텁할 수 있게 한다).
// 정보 항목 노출 판정(visible.ts) 모듈은 import하지 않는다(D-35 완전 독립).
export class ForbiddenError extends UserFacingError {}

export type CanDeps = {
  findPermission: typeof defaultFindPermission;
};

export async function can(
  viewer: Viewer,
  menu: string,
  action: PermissionAction,
  deps?: Partial<CanDeps>,
): Promise<boolean> {
  // viewer에 계급 식별자가 없으면(undefined 또는 null) 기본 거부 — 권한표를
  // 조회하지도 않는다.
  if (!viewer.roleId) return false;

  const findPermission = deps?.findPermission ?? defaultFindPermission;
  const row = await findPermission(viewer, viewer.roleId, menu, action);
  // 행이 없거나 allowed가 거짓이면 false — 거짓인 행은 없는 것과 같다.
  return row?.allowed === true;
}
