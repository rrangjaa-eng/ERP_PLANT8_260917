import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { projectDocuments } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import type { DbOrTx } from "@/repositories/document-counters";

// 07-18(W6) — 프로젝트 서류 읽기 하나. 고객 승인 근거가 발주서인데 발주서 파일이 없으면 면이 경고 글자를 보이는 데 쓴다.
// 쓰기(업로드 · 지움)는 07-22가 맡는다. 행 범위는 호출부(프로젝트 상세)가 이미 프로젝트를 범위 안에서 읽은 뒤에 부른다.
export type ProjectDocumentKind = (typeof projectDocuments.$inferSelect)["kind"];

export async function hasProjectDocument(viewer: Viewer, projectId: string, kind: ProjectDocumentKind, tx: DbOrTx = db): Promise<boolean> {
  void viewer;
  const rows = await tx
    .select({ id: projectDocuments.id })
    .from(projectDocuments)
    .where(and(eq(projectDocuments.projectId, projectId), eq(projectDocuments.kind, kind), isNull(projectDocuments.removedAt)))
    .limit(1);
  return rows.length > 0;
}
