import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { listVendors as repoListVendors } from "@/repositories/vendors";
import { listTeams as repoListTeams } from "@/repositories/teams";
import { listUsers as repoListUsers } from "@/repositories/users";
import { listCodeItems as repoListCodeItems } from "@/repositories/code-tables";
import {
  findMembershipAtDate as repoFindMembershipAtDate,
  findMembershipsAtDate as repoFindMembershipsAtDate,
} from "@/repositories/team-memberships";
import { loadActorTeamScope } from "@/domain/projects/status";

export class ForbiddenError extends UserFacingError {}

export type ProjectReferenceOption = { id: string; name: string };
// 04-25(D-93): 코드표 설명을 싣고 온다(없으면 null) — 견적 소분류 셀이
// 편집 중 셀 아래 힌트로 쓴다(표 연결은 04-23).
export type CodeOption = { value: string; label: string; description: string | null };

// 견적 줄의 소분류 코드표 — 그룹 머리글이 이 값에서 파생된다(D-62).
export const QUOTE_SUBCATEGORY_TABLE_KEY = "quote_subcategory";

export type ProjectFormReferences = {
  clients: ProjectReferenceOption[];
  teams: ProjectReferenceOption[];
  pmUsers: ProjectReferenceOption[];
  // 견적 줄 표의 거래처(선택) 셀 — 클라이언트와 같은 vendors 표를 쓴다.
  vendors: ProjectReferenceOption[];
  subcategories: CodeOption[];
};

// 프로젝트 등록 폼의 클라이언트·담당 PM·팀 select 세 칸(⑨) — D-38 "클라이언트·
// 거래처는 자동완성되고" 요구를 채운다. `listVendors`/`listTeams`/`listPeople`가
// 각각 "admin.vendors"/"admin.people" 메뉴 view를 요구해(scope-for.ts
// ENTITY_MENUS) 그대로 쓰면 그 메뉴가 없는 role-pm(기획 PM)에게 등록 폼의
// select 세 칸이 전부 빈 목록으로 렌더된다 — `test/e2e/people.spec.ts`
// "기본 계급(기획 PM)으로는 사람 화면이 404다"가 이미 admin.people
// 기본값이 없음을 계약으로 고정해 두어(seedMasterData를 admin.people
// view 기본 참으로 바꾸는 시도는 그 테스트를 깬다) 두 메뉴 권한을 넓히지
// 않는다. 대신 "projects" 메뉴 view 권한 하나로 게이트하는 축소 투영
// (id·name만, 계좌번호·이메일 등 없음)을 이 파일에 따로 둔다 — admin 화면의
// 세부 노출과는 다른, 더 좁은 안전 표면이다.
export async function listProjectFormReferences(
  viewer: Viewer,
  deps?: Partial<{ can: typeof defaultCan }>,
): Promise<ProjectFormReferences> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, "projects", "view"))) {
    throw new ForbiddenError("프로젝트 조회 권한 없음");
  }

  const [vendorRows, teamRows, userRows, subcategoryRows] = await Promise.all([
    repoListVendors(viewer, { scope: { rows: "all", includeArchived: false }, includeHidden: false }),
    repoListTeams(viewer, { scope: { rows: "all", includeArchived: false } }),
    repoListUsers(viewer, { scope: { rows: "all", includeArchived: false }, includeArchived: false }),
    repoListCodeItems(viewer, {
      tableKey: QUOTE_SUBCATEGORY_TABLE_KEY,
      scope: { rows: "all", includeArchived: false },
      includeInactive: false,
    }),
  ]);

  return {
    clients: vendorRows.map((row) => ({ id: row.id, name: row.name })),
    teams: teamRows.map((row) => ({ id: row.id, name: row.name })),
    pmUsers: userRows.map((row) => ({ id: row.id, name: row.name })),
    vendors: vendorRows.map((row) => ({ id: row.id, name: row.name })),
    subcategories: subcategoryRows.map((row) => ({ value: row.value, label: row.label, description: row.description })),
  };
}

// 보안 감사 · CLAUDE.md §7 — 등록 폼의 팀 · 담당 PM 칸은 서버가 받는 값만 보인다.
// 팀 업무 범위면 내 팀 하나와 오늘(KST) 내 팀 사람만, 회사 범위면 그대로다(필터 줄은 전체 팀을 계속 쓴다).
export async function scopeCreateFormReferences(
  viewer: Viewer,
  references: Pick<ProjectFormReferences, "teams" | "pmUsers">,
  opts: { todayKst: string },
): Promise<Pick<ProjectFormReferences, "teams" | "pmUsers">> {
  const scope = await loadActorTeamScope(viewer, opts);
  if (scope.workScope === "company") return { teams: references.teams, pmUsers: references.pmUsers };
  if (scope.teamId === null) return { teams: [], pmUsers: [] };

  const memberships = await repoFindMembershipsAtDate(
    viewer,
    references.pmUsers.map((user) => user.id),
    opts.todayKst,
  );
  const memberIds = new Set(memberships.filter((row) => row.teamId === scope.teamId).map((row) => row.userId));
  return {
    teams: references.teams.filter((team) => team.id === scope.teamId),
    pmUsers: references.pmUsers.filter((user) => memberIds.has(user.id)),
  };
}

// 결정 2(사용자 결정 2026-09-26) — 등록 폼의 담당 PM·팀 기본값: 등록하는 사람과 그 사람의 오늘(KST) 소속 팀
// (가장 최근 발령). 폼은 좁힌 옵션에 있을 때만 고른다 — 없으면 빈 칸.
export async function loadCreatorDefaults(
  viewer: Viewer,
  opts: { todayKst: string },
): Promise<{ pmUserId: string; teamId: string | null }> {
  const membership = await repoFindMembershipAtDate(viewer, viewer.id, opts.todayKst);
  return { pmUserId: viewer.id, teamId: membership?.teamId ?? null };
}
