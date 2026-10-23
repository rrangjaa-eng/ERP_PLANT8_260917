import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { files, projectDocuments, users } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import type { DbOrTx } from "@/repositories/document-counters";

// 07-18(W6) — 프로젝트 서류 읽기. 고객 승인 근거가 발주서인데 발주서 파일이 없으면 면이 경고 글자를 보이는 데 쓴다.
// 07-22(W3) — 쓰기(서류 행 만들기 · 버리기)와 목록. 서류는 살아 있는 파일(files.owner_kind = 'project_document', 지워지지도 무효도 아님)이
// 있을 때만 센다 — 올리기를 끝내지 않은 행 · 파일을 지운 행은 목록 · hasProjectDocument에 잡히지 않는다. 행 범위는 호출부가 프로젝트를
// 범위 안에서 읽은 뒤에 부른다.
export type ProjectDocumentKind = (typeof projectDocuments.$inferSelect)["kind"];
export type ProjectDocumentRow = typeof projectDocuments.$inferSelect;

const OWNER_KIND = "project_document";

const liveFileExists = sql`EXISTS (SELECT 1 FROM ${files} WHERE ${files.ownerKind} = ${OWNER_KIND} AND ${files.ownerId} = ${projectDocuments.id} AND ${files.removedAt} IS NULL AND ${files.voidedAt} IS NULL)`;

export async function hasProjectDocument(viewer: Viewer, projectId: string, kind: ProjectDocumentKind, tx: DbOrTx = db): Promise<boolean> {
  void viewer;
  const rows = await tx
    .select({ id: projectDocuments.id })
    .from(projectDocuments)
    .where(and(eq(projectDocuments.projectId, projectId), eq(projectDocuments.kind, kind), isNull(projectDocuments.removedAt), liveFileExists))
    .limit(1);
  return rows.length > 0;
}

export async function findProjectDocumentById(viewer: Viewer, id: string, tx: DbOrTx = db): Promise<ProjectDocumentRow | null> {
  void viewer;
  const [row] = await tx.select().from(projectDocuments).where(eq(projectDocuments.id, id)).limit(1);
  return row ?? null;
}

export async function insertProjectDocument(
  viewer: Viewer,
  input: { projectId: string; kind: ProjectDocumentKind; createdBy: string },
  tx: DbOrTx = db,
): Promise<ProjectDocumentRow> {
  void viewer;
  const [row] = await tx.insert(projectDocuments).values(input).returning();
  if (!row) throw new Error("project_documents insert returned no row");
  return row;
}

// 선언이 거부된 시도의 행을 버린다(파일이 붙지 않았다) — 지운 사람 = 시도한 사람.
export async function markProjectDocumentRemoved(viewer: Viewer, input: { id: string; removedBy: string }, tx: DbOrTx = db): Promise<void> {
  void viewer;
  await tx
    .update(projectDocuments)
    .set({ removedAt: new Date(), removedBy: input.removedBy })
    .where(and(eq(projectDocuments.id, input.id), isNull(projectDocuments.removedAt)));
}

export type ProjectDocumentFileRow = {
  documentId: string;
  kind: ProjectDocumentKind;
  fileId: string;
  name: string;
  sizeBytes: number;
  createdAt: Date;
  uploaderName: string | null;
};

// 프로젝트의 살아 있는 서류 파일 — 올린 순.
export async function listProjectDocumentFiles(viewer: Viewer, projectId: string, tx: DbOrTx = db): Promise<ProjectDocumentFileRow[]> {
  void viewer;
  return tx
    .select({
      documentId: projectDocuments.id,
      kind: projectDocuments.kind,
      fileId: files.id,
      name: files.originalName,
      sizeBytes: files.sizeBytes,
      createdAt: files.createdAt,
      uploaderName: users.name,
    })
    .from(projectDocuments)
    .innerJoin(files, and(eq(files.ownerKind, OWNER_KIND), eq(files.ownerId, projectDocuments.id), isNull(files.removedAt), isNull(files.voidedAt)))
    .leftJoin(users, eq(users.id, files.uploadedBy))
    .where(and(eq(projectDocuments.projectId, projectId), isNull(projectDocuments.removedAt)))
    .orderBy(asc(files.createdAt), asc(files.id));
}
