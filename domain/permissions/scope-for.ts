import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { seoulToday } from "@/lib/dates";
import { findRoleById as defaultFindRoleById } from "@/repositories/roles";
import { findMembershipAtDate as defaultFindMembershipAtDate } from "@/repositories/team-memberships";
import { findTeamById as defaultFindTeamById } from "@/repositories/teams";

// ADMN-01·ADMN-12: 행 필터 서술자 — repositories가 where절로 번역한다. Drizzle
// SQL 조각을 돌려주지 않는다 — boundaries/element-types가 domain에서 db 계층
// import를 금지하므로 표 컬럼을 참조할 수 없다(eslint.config.mjs 실측).
//
// 규칙: includeArchived는 보관함 메뉴("admin.archive")의 보기 권한 판정
// 결과이고, rows는 해당 엔티티의 메뉴 보기 권한이 없으면 "none"이다.
//
// 06.2(D-6204): 행 범위 판정(rowScopeFor) — 서술자만 만들고 SQL은 repositories/row-scope.ts가 번역한다.
// PM · 참여자 OR 조각은 서술자에 넣지 않는다 — 번역기가 늘 더한다(260907 `O: server/src/scope.ts:36-41` 호출부 누락 구멍 봉쇄).
// work_scope는 읽지 않는다(D-6202). 요청을 넘는 캐시 없음 — 요청 안 memo는 getSession이 등록한 viewer 객체에만.
export type Scope = { rows: "all" | "none"; includeArchived: boolean };

export type ScopeForDeps = {
  can: typeof defaultCan;
};

// 엔티티 → 그 행을 보여주는 메뉴. 새 마스터 표가 생기면 이 표에 한 줄을
// 더한다(03-05·03-06·03-07이 항목을 추가한다) — repositories/archive.ts의
// ARCHIVABLE_TABLES와 같은 결의 "단일 정본 + 한 줄 추가" 규약이다.
const ENTITY_MENUS: Record<string, string> = {
  code_items: "admin.code-tables",
  org_unit: "admin.people",
  team: "admin.people",
  user: "admin.people",
  corp_card: "admin.corp-cards",
  vendor: "admin.vendors",
  holiday: "admin.holidays",
  // Phase 4(04-01): 프로젝트·견적 줄은 관리자 메뉴가 아니라 업무 메뉴
  // "projects" 하나를 공유한다(견적 줄은 프로젝트에 종속된 문서라 별도
  // 메뉴가 없다).
  // 06.2(eng N3): 호출자가 없던 견적 줄 키는 뺐다 — 견적 줄 행 범위는 rowScopeFor(viewer, "project")를 프로젝트 조인에 건다.
  project: "projects",
};

const ARCHIVE_MENU = "admin.archive";

export class UnknownScopeEntityError extends UserFacingError {}

export async function scopeFor(
  viewer: Viewer,
  entity: string,
  deps?: Partial<ScopeForDeps>,
): Promise<Scope> {
  const menu = ENTITY_MENUS[entity];
  if (!menu) {
    throw new UnknownScopeEntityError(`scopeFor: 등록되지 않은 entity: ${entity}`);
  }

  const canFn = deps?.can ?? defaultCan;
  const [canView, canViewArchive] = await Promise.all([
    canFn(viewer, menu, "view"),
    canFn(viewer, ARCHIVE_MENU, "view"),
  ]);

  return { rows: canView ? "all" : "none", includeArchived: canViewArchive };
}

// ── 06.2 행 범위 서술자(D6 · D-6204 · D-6207) ─────────────────────────────────
// 기존 Scope(rows: all | none)는 마스터 리포지토리 9곳이 전제하므로 바꾸지 않고, 행 범위는 별도 유니온으로 둔다.
export const ROW_SCOPE_ENTITY_MENUS = { project: "projects", expense: "expenses" } as const;
export type RowScopeEntity = keyof typeof ROW_SCOPE_ENTITY_MENUS;

export type RowScopeBy =
  | { kind: "team"; teamId: string | null }
  | { kind: "org_unit"; orgUnitId: string | null }
  | { kind: "own" };

export type RowScope =
  | { rows: "none"; includeArchived: boolean }
  | { rows: "all"; includeArchived: boolean }
  | { rows: "limited"; includeArchived: boolean; viewerId: string; by: RowScopeBy };

export type RowScopeDeps = {
  can: (viewer: Viewer, menu: string, action: "view") => Promise<boolean>;
  findRoleById: (viewer: Viewer, id: string) => Promise<{ viewScope: string } | null>;
  findMembershipAtDate: (viewer: Viewer, userId: string, date: string) => Promise<{ teamId: string } | null>;
  findTeamById: (viewer: Viewer, id: string) => Promise<{ orgUnitId: string } | null>;
  today: () => string;
};

// 판정 순서: 메뉴 보기 → 계급 → view_scope. 계급 없음 · 모르는 값은 none(fail-closed — 260907 `default: '(false)'`).
// 계급의 archivedAt은 보지 않는다(can()과 같음). 팀 · 본부를 못 찾으면 그 id가 null인 limited다.
// 요청 memo(성공 기준 4 · eng I10): React cache()는 렌더 안 memo만 문서화돼 서버 액션에서의 동작이 불명확하다 —
// getSession()이 요청마다 만든 viewer 객체를 WeakMap 키로 쓴다. 다음 요청은 새 객체라 새 값을 읽고, 요청이 끝나면 함께 사라진다.
const requestMemo = new WeakMap<Viewer, Map<RowScopeEntity, Promise<RowScope>>>();

export function memoizeRowScopeForRequest(viewer: Viewer): void {
  requestMemo.set(viewer, new Map());
}

export async function rowScopeFor(viewer: Viewer, entity: RowScopeEntity, deps?: Partial<RowScopeDeps>): Promise<RowScope> {
  const memo = requestMemo.get(viewer);
  if (!memo) return computeRowScope(viewer, entity, deps);
  const cached = memo.get(entity);
  if (cached) return cached;
  const pending = computeRowScope(viewer, entity, deps);
  memo.set(entity, pending);
  pending.catch(() => memo.delete(entity));
  return pending;
}

async function computeRowScope(
  viewer: Viewer,
  entity: RowScopeEntity,
  deps?: Partial<RowScopeDeps>,
): Promise<RowScope> {
  const canFn = deps?.can ?? defaultCan;
  const [canView, includeArchived] = await Promise.all([
    canFn(viewer, ROW_SCOPE_ENTITY_MENUS[entity], "view"),
    canFn(viewer, ARCHIVE_MENU, "view"),
  ]);
  if (!canView || !viewer.roleId) return { rows: "none", includeArchived };

  const findRoleById = deps?.findRoleById ?? defaultFindRoleById;
  const role = await findRoleById(viewer, viewer.roleId);
  if (!role) return { rows: "none", includeArchived };

  const limited = (by: RowScopeBy): RowScope => ({ rows: "limited", includeArchived, viewerId: viewer.id, by });
  const todayTeamId = async (): Promise<string | null> => {
    const findMembershipAtDate = deps?.findMembershipAtDate ?? defaultFindMembershipAtDate;
    const membership = await findMembershipAtDate(viewer, viewer.id, (deps?.today ?? seoulToday)());
    return membership?.teamId ?? null;
  };

  switch (role.viewScope) {
    case "company":
      return { rows: "all", includeArchived };
    case "team":
      return limited({ kind: "team", teamId: await todayTeamId() });
    case "org_unit": {
      const teamId = await todayTeamId();
      const findTeamById = deps?.findTeamById ?? defaultFindTeamById;
      const team = teamId ? await findTeamById(viewer, teamId) : null;
      return limited({ kind: "org_unit", orgUnitId: team?.orgUnitId ?? null });
    }
    case "own":
      return limited({ kind: "own" });
    default:
      return { rows: "none", includeArchived };
  }
}
