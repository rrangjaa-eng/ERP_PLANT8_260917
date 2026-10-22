import { randomUUID } from "node:crypto";
import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import type { recordAction as RecordActionFn } from "@/domain/action-log/record";
import { buildChanges } from "@/domain/action-log/changes";
import type { grantCustomFieldsToRole as GrantCustomFieldsFn } from "@/domain/custom-fields/visibility";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { normalizeRoleName } from "@/domain/permissions/role-name";
import { withTransaction } from "@/lib/db-transaction";
import {
  assertCanEditRole,
  canGrantRole,
  loadRoleGrantSnapshots,
  NO_ROLE_SNAPSHOT,
} from "@/domain/permissions/grant-ceiling";
import {
  findRoleById as defaultFindRoleById,
  listRoles as repoListRoles,
  insertRole as repoInsertRole,
  renameRole as repoRenameRole,
  setRoleWorkScope as repoSetRoleWorkScope,
  setRoleViewScope as repoSetRoleViewScope,
  type RoleRow,
} from "@/repositories/roles";

// ADMN-08: 계급 5종 시드 상수. Task 1 결정(옵션 A, 03-01-DECISION-TASK1.md ①) —
// 이름은 데이터라 화면에서 바꿀 수 있지만 식별자 문자열은 영구다. 시드 권한표와
// 이후 페이즈의 테스트 픽스처가 이 문자열을 참조한다.
// 04-27(D11·D20): 업무 범위 — team(자기 팀) · company(전사). 순위가 아니다(비교 없음).
export const ROLE_WORK_SCOPES = ["team", "company"] as const;
export type RoleWorkScope = (typeof ROLE_WORK_SCOPES)[number];

// 06.2(D-6201): 보는 범위 — company(전사) · org_unit(본부) · team(팀) · own(본인). rowScopeFor만 읽는다.
export const ROLE_VIEW_SCOPES = ["company", "org_unit", "team", "own"] as const;
export type RoleViewScope = (typeof ROLE_VIEW_SCOPES)[number];

export type SeedRole = {
  id: string;
  name: string;
  isSeed: true;
  sortOrder: number;
  workScope: RoleWorkScope;
  viewScope: RoleViewScope;
};

// 업무 범위 값은 마이그레이션 0013의 UPDATE와 같다 — 새 DB(시드)와 기존 DB(마이그레이션)가 같은 값을 갖는다.
// 보는 범위 값은 마이그레이션 *_view_scope의 시드 UPDATE와 같다.
export const SEED_ROLES: SeedRole[] = [
  { id: "role-ceo", name: "대표", isSeed: true, sortOrder: 0, workScope: "company", viewScope: "company" },
  { id: "role-division-head", name: "본부 책임자", isSeed: true, sortOrder: 1, workScope: "company", viewScope: "org_unit" },
  { id: "role-team-lead", name: "팀장", isSeed: true, sortOrder: 2, workScope: "team", viewScope: "team" },
  { id: "role-pm", name: "기획 PM", isSeed: true, sortOrder: 3, workScope: "team", viewScope: "team" },
  { id: "role-sysadmin", name: "시스템 관리자", isSeed: true, sortOrder: 4, workScope: "company", viewScope: "company" },
];

export { normalizeRoleName };

export const SYSADMIN_ROLE_ID = "role-sysadmin";

// 04-20(D-46·D-79): 상태 전환 권한·노출 기본값을 시드가 넣는 계급들.
export const CEO_ROLE_ID = "role-ceo";
export const DIVISION_HEAD_ROLE_ID = "role-division-head";
export const TEAM_LEAD_ROLE_ID = "role-team-lead";

// 백필 규칙(Task 1 결정 ④)의 대상 — 관리자 여부 잔여 컬럼이 거짓인 행이 옮겨가는 기본 계급.
export const DEFAULT_ROLE_ID = "role-pm";


// T-03-17: 권한표·정보 노출표 셀 저장 액션의 zod 스키마가 roleId를 검증할 때
// 쓰는 domain 진입점 — `app`은 `repositories`를 직접 import할 수 없으므로
// (boundaries) 이 얇은 래퍼가 그 경계를 지킨다. ADMN-08이 계급을 관리 화면
// 밖(CLI·시드)에서도 늘릴 수 있어 SEED_ROLES 정적 집합이 아니라 DB를
// 확인한다.
export type RoleExistsDeps = { findRoleById: typeof defaultFindRoleById };

export async function roleExists(viewer: Viewer, roleId: string, deps?: Partial<RoleExistsDeps>): Promise<boolean> {
  const findRoleById = deps?.findRoleById ?? defaultFindRoleById;
  return (await findRoleById(viewer, roleId)) !== null;
}

export class ForbiddenError extends UserFacingError {}
export class SelfRoleScopeChangeError extends UserFacingError {}

// CSO-1(사용자 결정 2026-10-08 「막기」): 사람은 자기 계급의 범위를 바꿀 수 없다 — changePersonRole의
// 자기 가드와 같은 줄. 한 줄이 그 계급 모든 사람의 범위를 정해서다. 시스템 주체(SYSTEM_VIEWER — 계급이
// role-sysadmin)는 사람이 아니라 막지 않는다. viewer.ts가 이 파일을 import해 값으로 못 불러 id로 가른다.
function assertNotOwnRole(viewer: Viewer, roleId: string): void {
  if (viewer.id !== "system" && viewer.roleId === roleId) {
    throw new SelfRoleScopeChangeError("자기 계급의 범위는 바꿀 수 없음");
  }
}

const PEOPLE_MENU = "admin.people";

// ADMN-08: 계급 DTO — plant8/no-row-type-escape가 domain 출구의 RoleRow
// 노출을 막는다. 구조/식별 정보 하나뿐이라 code_item 패턴처럼 항목 하나로
// 게이트한다.
export type RoleDto = {
  id: string;
  name: string;
  isSeed: boolean;
  sortOrder: number;
  workScope: RoleWorkScope;
  viewScope: RoleViewScope;
  archivedAt: Date | null;
};

export const ROLE_DTO_SPEC: DtoSpec<RoleRow, RoleDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "role.value" },
    { key: "name", from: "name", infoItem: "role.value" },
    { key: "isSeed", from: "isSeed", infoItem: "role.value" },
    { key: "sortOrder", from: "sortOrder", infoItem: "role.value" },
    { key: "workScope", from: "workScope", infoItem: "role.value" },
    { key: "viewScope", from: "viewScope", infoItem: "role.value" },
    { key: "archivedAt", from: "archivedAt", infoItem: "role.value" },
  ],
};

registerDto({
  name: "RoleDto",
  fields: ROLE_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

// ADMN-08: 계급 관리 화면(03-05)의 domain 진입점 — 03-01-SUMMARY에 없어 이
// 플랜이 더한다. app은 repositories를 직접 import할 수 없다(boundaries).
export async function listRoles(viewer: Viewer, opts?: { includeArchived?: boolean }): Promise<RoleDto[]> {
  const rows = await repoListRoles(viewer, opts);
  return Promise.all(rows.map((row) => project(viewer, row, ROLE_DTO_SPEC))) as Promise<RoleDto[]>;
}

// 06.4(D-6402): 등록 · 변경 화면의 계급 select 재료(06.4-04). 서버 거부가 진짜 관문이고 이 목록은 할 수 없는 선택지를
// 숨기는 UX(CLAUDE.md §7).
export async function assignableRoleIds(viewer: Viewer, roleIds?: readonly string[]): Promise<ReadonlySet<string>> {
  const targets = roleIds ?? (await repoListRoles(viewer)).map((row) => row.id);
  const snapshots = await loadRoleGrantSnapshots(viewer, viewer.roleId ? [viewer.roleId, ...targets] : targets);
  const actor = (viewer.roleId ? snapshots.get(viewer.roleId) : undefined) ?? NO_ROLE_SNAPSHOT;
  return new Set(
    targets.filter((id) => {
      const role = snapshots.get(id);
      return role !== undefined && canGrantRole(actor, role);
    }),
  );
}

export async function listAssignableRoles(viewer: Viewer): Promise<RoleDto[]> {
  const roles = await listRoles(viewer);
  const assignable = await assignableRoleIds(viewer, roles.map((role) => role.id));
  return roles.filter((role) => assignable.has(role.id));
}

export type RoleWriteDeps = {
  can: typeof defaultCan;
  recordAction: typeof RecordActionFn;
  grantCustomFieldsToRole: typeof GrantCustomFieldsFn;
};

// domain/action-log/record.ts를 정적으로 import하면 순환이 생긴다 —
// domain/viewer.ts가 SYSADMIN_ROLE_ID를 이 파일에서 값으로 import하고,
// record.ts는 SYSTEM_VIEWER를 domain/viewer.ts에서 값으로 import한다
// (record.ts가 registry.ts와 순환을 끊을 때 쓴 것과 같은 동적 import 패턴).
async function defaultRecordAction(...args: Parameters<typeof RecordActionFn>): ReturnType<typeof RecordActionFn> {
  const { recordAction } = await import("@/domain/action-log/record");
  return recordAction(...args);
}

// 같은 이유의 동적 import — domain/custom-fields/visibility.ts가 SYSTEM_VIEWER를 domain/viewer.ts에서
// 값으로 import하고, domain/viewer.ts는 이 파일에서 SYSADMIN_ROLE_ID를 값으로 import한다.
async function defaultGrantCustomFields(
  ...args: Parameters<typeof GrantCustomFieldsFn>
): ReturnType<typeof GrantCustomFieldsFn> {
  const { grantCustomFieldsToRole } = await import("@/domain/custom-fields/visibility");
  return grantCustomFieldsToRole(...args);
}

export async function createRole(
  viewer: Viewer,
  input: { name: string; sortOrder?: number; workScope?: RoleWorkScope },
  deps?: Partial<RoleWriteDeps>,
): Promise<RoleDto> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, PEOPLE_MENU, "write"))) {
    throw new ForbiddenError("계급 추가 권한 없음");
  }

  // 06.2(K1, 사용자 결정 2026-10-08): 새 계급의 보는 범위는 업무 범위를 복사한다.
  const workScope = input.workScope ?? "team";
  // 06.4(O7 · E3): 새 계급(빈 키 + 입력 범위)도 내 상한 안이어야 한다 — 위임자가 자기보다 넓은 범위의 계급을 만들어 두는
  // 길을 닫는다. 260907 `POST /api/roles`는 관리자 전용 `settings.edit`라 비교가 필요 없었다(`O: server/src/access.ts:570`).
  // D-6401 사용자 확정(2026-10-11 카드): 범위 포함.
  await assertCanEditRole(viewer, null, () => ({ keys: new Set<string>(), viewScope: workScope, workScope }));

  const id = `role-${randomUUID()}`;
  // 04.5-03: 기존 커스텀 항목의 기본 보임 행을 계급 행과 한 트랜잭션에서 넣는다 — 부여가 실패하면 계급도 생기지 않고
  // 오류가 관리자에게 간다(칸이 안 보이는 계급이 조용히 남지 않는다).
  const grant = deps?.grantCustomFieldsToRole ?? defaultGrantCustomFields;
  const row = await withTransaction(async (tx) => {
    const inserted = await repoInsertRole(
      viewer,
      { id, name: normalizeRoleName(input.name), sortOrder: input.sortOrder, workScope, viewScope: workScope },
      tx,
    );
    await grant(viewer, inserted.id, undefined, tx);
    return inserted;
  });

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, {
    actionType: "permission_change",
    entity: "roles",
    entityId: row.id,
    detail: { changes: buildChanges({ name: null }, { name: row.name }) },
  });

  return (await project(viewer, row, ROLE_DTO_SPEC)) as RoleDto;
}

export async function renameRole(
  viewer: Viewer,
  id: string,
  name: string,
  deps?: Partial<RoleWriteDeps>,
): Promise<void> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, PEOPLE_MENU, "write"))) {
    throw new ForbiddenError("계급 이름 변경 권한 없음");
  }

  // 07-26(R5): 이전 이름을 읽어 전후 값을 남긴다 — 행이 없으면 이전은 null(오류는 새로 만들지 않는다).
  const previous = await defaultFindRoleById(viewer, id);
  const nextName = normalizeRoleName(name);
  await repoRenameRole(viewer, id, nextName);

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, {
    actionType: "permission_change",
    entity: "roles",
    entityId: id,
    detail: { changes: buildChanges({ name: previous?.name ?? null }, { name: nextName }) },
  });
}

export async function setRoleWorkScope(
  viewer: Viewer,
  id: string,
  workScope: RoleWorkScope,
  deps?: Partial<RoleWriteDeps>,
): Promise<void> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, PEOPLE_MENU, "write"))) {
    throw new ForbiddenError("계급 업무 범위 변경 권한 없음");
  }
  assertNotOwnRole(viewer, id);

  const row = await defaultFindRoleById(viewer, id);
  if (!row) throw new UserFacingError("계급 찾을 수 없음");

  // 06.4(O7 · T-6409): `admin.permissions` 쓰기가 없으면 바꾸기 전 · 바꾼 뒤 계급이 둘 다 내 상한 안이어야 한다 — 지정 뒤
  // 범위를 넓혀 상한을 돌아가지 못하게. 자기 계급은 위 CSO-1이 먼저 막는다.
  await assertCanEditRole(viewer, id, (before) => ({ ...before, workScope }));

  await repoSetRoleWorkScope(viewer, id, workScope);

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, {
    actionType: "permission_change",
    entity: "roles",
    entityId: id,
    detail: {
      workScope: { from: row.workScope, to: workScope },
      changes: buildChanges({ workScope: row.workScope }, { workScope }),
    },
  });
}

// 06.2(D-6201 · 성공 기준 4): 계급 보는 범위 — setRoleWorkScope와 같은 순서. 액션 zod는 06.2-09가 두고, 여기서 한 번 더 거른다.
// 요청을 넘는 캐시가 없어 다음 요청(getSession이 만든 새 viewer)의 rowScopeFor가 새 값을 읽는다.
export async function setRoleViewScope(
  viewer: Viewer,
  id: string,
  viewScope: RoleViewScope,
  deps?: Partial<RoleWriteDeps>,
): Promise<void> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, PEOPLE_MENU, "write"))) {
    throw new ForbiddenError("계급 보는 범위 변경 권한 없음");
  }
  assertNotOwnRole(viewer, id);
  if (!(ROLE_VIEW_SCOPES as readonly string[]).includes(viewScope)) {
    throw new UserFacingError("보는 범위 값 없음");
  }

  const row = await defaultFindRoleById(viewer, id);
  if (!row) throw new UserFacingError("계급 찾을 수 없음");

  // 06.4(O7 · T-6409): setRoleWorkScope와 같다 — 바꾸기 전 · 바꾼 뒤 둘 다 내 상한 안.
  await assertCanEditRole(viewer, id, (before) => ({ ...before, viewScope }));

  await repoSetRoleViewScope(viewer, id, viewScope);

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, {
    actionType: "permission_change",
    entity: "roles",
    entityId: id,
    detail: {
      viewScope: { from: row.viewScope, to: viewScope },
      changes: buildChanges({ viewScope: row.viewScope }, { viewScope }),
    },
  });
}
