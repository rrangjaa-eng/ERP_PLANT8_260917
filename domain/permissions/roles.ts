import type { Viewer } from "@/domain/viewer";
import { findRoleById as defaultFindRoleById } from "@/repositories/roles";

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
