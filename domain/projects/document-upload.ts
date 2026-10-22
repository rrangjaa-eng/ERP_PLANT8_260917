import { z } from "zod";
import type { Viewer } from "@/domain/viewer";
import { requestEvidenceUpload, type EvidenceDeps, type EvidenceUploadIntent } from "@/domain/evidence";
import { assertProjectDocumentWritable, PROJECT_DOCUMENT_KIND } from "@/domain/projects/documents";
import { insertProjectDocument, markProjectDocumentRemoved } from "@/repositories/project-documents";

// 07-22(W3 · SC-20) — 프로젝트 서류 붙이기 시작. 서류 행을 먼저 만들고(파일 주인 id) 05 증빙 선언을 그 행으로 부른다 — 마침은 05
// completeEvidenceUpload 그대로. 선언이 거부되면 행을 버린다. 끝내지 않은 시도의 행은 살아 있는 파일이 없어 목록 · hasProjectDocument가
// 세지 않는다. documents.ts와 나눈 까닭: evidence가 documents.ts의 주인 함수를 import한다(순환).

const requestSchema = z
  .object({
    projectId: z.string().uuid(),
    kind: z.enum(["purchase_order", "other"]),
    size: z.number().int(),
    contentType: z.string().min(1).max(100),
    sha256: z.string().max(64),
    name: z.string().trim().min(1).max(255),
  })
  .strict();

export type ProjectDocumentUploadRequest = z.input<typeof requestSchema>;

export async function requestProjectDocumentUpload(viewer: Viewer, raw: ProjectDocumentUploadRequest, deps?: EvidenceDeps): Promise<EvidenceUploadIntent> {
  const input = requestSchema.parse(raw);
  const project = await assertProjectDocumentWritable(viewer, input.projectId);
  const doc = await insertProjectDocument(viewer, { projectId: project.id, kind: input.kind, createdBy: viewer.id });
  try {
    return await requestEvidenceUpload(
      viewer,
      { ownerKind: PROJECT_DOCUMENT_KIND, ownerId: doc.id, size: input.size, contentType: input.contentType, sha256: input.sha256, name: input.name },
      deps,
    );
  } catch (error) {
    await markProjectDocumentRemoved(viewer, { id: doc.id, removedBy: viewer.id });
    throw error;
  }
}
