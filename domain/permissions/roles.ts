import { randomUUID } from "node:crypto";
import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import type { recordAction as RecordActionFn } from "@/domain/action-log/record";
import {
  findRoleById as defaultFindRoleById,
  listRoles as repoListRoles,
  insertRole as repoInsertRole,
  renameRole as repoRenameRole,
  type RoleRow,
} from "@/repositories/roles";

// ADMN-08: 계급 5종 시드 상수. Task 1 결정(옵션 A, 03-01-DECISION-TASK1.md ①) —
// 이름은 데이터라 화면에서 바꿀 수 있지만 식별자 문자열은 영구다. 시드 권한표와
// 이후 페이즈의 테스트 픽스처가 이 문자열을 참조한다.
export type SeedRole = { id: string; name: string; isSeed: true; sortOrder: number };

export const SEED_ROLES: SeedRole[] = [
  { id: "role-ceo", name: "대표", isSeed: true, sortOrder: 0 },
  { id: "role-division-head", name: "본부 책임자", isSeed: true, sortOrder: 1 },
  { id: "role-team-lead", name: "팀장", isSeed: true, sortOrder: 2 },
  { id: "role-pm", name: "기획 PM", isSeed: true, sortOrder: 3 },
  { id: "role-sysadmin", name: "시스템 관리자", isSeed: true, sortOrder: 4 },
];

export const SYSADMIN_ROLE_ID = "role-sysadmin";

// 백필 규칙(Task 1 결정 ④)의 대상 — 관리자 여부 잔여 컬럼이 거짓인 행이 옮겨가는 기본 계급.
export const DEFAULT_ROLE_ID = "role-pm";

// 계급 이름 중복 판정은 Unicode NFC 정규화 후에 한다 — 조합형(NFD)·완성형(NFC)으로
// 적은 같은 한글 이름이 같은 이름으로 취급된다. DB의 UNIQUE 제약과 짝을 이룬다.
export function normalizeRoleName(name: string): string {
  return name.normalize("NFC").trim();
}

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

export class ForbiddenError extends Error {}

const PEOPLE_MENU = "admin.people";

// ADMN-08: 계급 DTO — plant8/no-row-type-escape가 domain 출구의 RoleRow
// 노출을 막는다. 구조/식별 정보 하나뿐이라 code_item 패턴처럼 항목 하나로
// 게이트한다.
export type RoleDto = {
  id: string;
  name: string;
  isSeed: boolean;
  sortOrder: number;
  archivedAt: Date | null;
};

export const ROLE_DTO_SPEC: DtoSpec<RoleRow, RoleDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "role.value" },
    { key: "name", from: "name", infoItem: "role.value" },
    { key: "isSeed", from: "isSeed", infoItem: "role.value" },
    { key: "sortOrder", from: "sortOrder", infoItem: "role.value" },
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

export type RoleWriteDeps = { can: typeof defaultCan; recordAction: typeof RecordActionFn };

// domain/action-log/record.ts를 정적으로 import하면 순환이 생긴다 —
// domain/viewer.ts가 SYSADMIN_ROLE_ID를 이 파일에서 값으로 import하고,
// record.ts는 SYSTEM_VIEWER를 domain/viewer.ts에서 값으로 import한다
// (record.ts가 registry.ts와 순환을 끊을 때 쓴 것과 같은 동적 import 패턴).
async function defaultRecordAction(...args: Parameters<typeof RecordActionFn>): ReturnType<typeof RecordActionFn> {
  const { recordAction } = await import("@/domain/action-log/record");
  return recordAction(...args);
}

export async function createRole(
  viewer: Viewer,
  input: { name: string; sortOrder?: number },
  deps?: Partial<RoleWriteDeps>,
): Promise<RoleDto> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, PEOPLE_MENU, "write"))) {
    throw new ForbiddenError("계급 추가 권한이 없습니다.");
  }

  const id = `role-${randomUUID()}`;
  const row = await repoInsertRole(viewer, { id, name: normalizeRoleName(input.name), sortOrder: input.sortOrder });

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "permission_change", entity: "roles", entityId: row.id });

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
    throw new ForbiddenError("계급 이름 변경 권한이 없습니다.");
  }

  await repoRenameRole(viewer, id, normalizeRoleName(name));

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "permission_change", entity: "roles", entityId: id });
}
