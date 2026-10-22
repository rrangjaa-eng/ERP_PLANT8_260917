import type { Viewer } from "@/domain/viewer";
import { hasProjectDocument } from "@/repositories/project-documents";

// 07-18(W6) — 화면(app/)이 repositories를 직접 부르지 못하므로 한 겹 감싼다. 호출부(프로젝트 상세)는 프로젝트를 범위 안에서 읽은 뒤에 부른다.
export async function projectHasPurchaseOrder(viewer: Viewer, projectId: string): Promise<boolean> {
  return hasProjectDocument(viewer, projectId, "purchase_order");
}
