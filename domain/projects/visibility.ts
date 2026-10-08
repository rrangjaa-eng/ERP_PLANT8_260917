import type { Viewer } from "@/domain/viewer";
import { rowScopeFor, type RowScope, type RowScopeDeps } from "@/domain/permissions/scope-for";
import { findProjectInScope } from "@/repositories/projects";
import { findQuoteRevisionById } from "@/repositories/quote-revisions";

// 06.2(D-6204 · D-6206): 프로젝트 가시성 단일 관문 — 없음(404)은 존재 여부를 새지 않는다.
// 결재자 예외 없음(260907 `O: server/src/projects.ts:786-830` visibleProject 확인).
// 내보내는 함수는 행을 돌려주지 않는다(plant8/no-row-type-escape) — 행이 필요한 모듈은 projectRowScope + findProjectInScope를 직접 부른다.
// 전역 db로 읽는다 — 잠근 트랜잭션 안에서 부르지 않는다(04-32). 판정은 트랜잭션 전.

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function projectRowScope(viewer: Viewer, deps?: Partial<RowScopeDeps>): Promise<RowScope> {
  return rowScopeFor(viewer, "project", deps);
}

export async function canOpenProject(viewer: Viewer, projectId: string): Promise<boolean> {
  if (!UUID_SHAPE.test(projectId)) return false;
  const scope = await projectRowScope(viewer);
  const row = await findProjectInScope(viewer, scope, projectId);
  if (!row) return false;
  return row.archivedAt === null || scope.includeArchived;
}

// 차수 → 프로젝트 → 서술자. 차수 id만 알면 열리던 견적 줄 입구(Pitfall 1)를 닫는다.
export async function canOpenRevision(viewer: Viewer, revisionId: string): Promise<boolean> {
  if (!UUID_SHAPE.test(revisionId)) return false;
  const revision = await findQuoteRevisionById(viewer, revisionId);
  if (!revision) return false;
  return canOpenProject(viewer, revision.projectId);
}
