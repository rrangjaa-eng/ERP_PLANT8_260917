import type { Viewer } from "@/domain/viewer";
import { rowScopeFor, type RowScope, type RowScopeDeps } from "@/domain/permissions/scope-for";

// 06.2(D-6204 · D-6206): 프로젝트 가시성 단일 관문 — 없음(404)은 존재 여부를 새지 않는다.
// 결재자 예외 없음(260907 `O: server/src/projects.ts:786-830` visibleProject 확인).
export async function projectRowScope(viewer: Viewer, deps?: Partial<RowScopeDeps>): Promise<RowScope> {
  return rowScopeFor(viewer, "project", deps);
}
