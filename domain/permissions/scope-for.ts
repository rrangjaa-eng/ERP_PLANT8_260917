import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { UserFacingError } from "@/lib/actions/user-facing-error";

// ADMN-01·ADMN-12: 행 필터 서술자 — repositories가 where절로 번역한다. Drizzle
// SQL 조각을 돌려주지 않는다 — boundaries/element-types가 domain에서 db 계층
// import를 금지하므로 표 컬럼을 참조할 수 없다(eslint.config.mjs 실측).
//
// 규칙: includeArchived는 보관함 메뉴("admin.archive")의 보기 권한 판정
// 결과이고, rows는 해당 엔티티의 메뉴 보기 권한이 없으면 "none"이다.
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
  // Phase 4(04-01): 프로젝트·견적 줄은 관리자 메뉴가 아니라 업무 메뉴
  // "projects" 하나를 공유한다(견적 줄은 프로젝트에 종속된 문서라 별도
  // 메뉴가 없다).
  project: "projects",
  quote_line: "projects",
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
