import { z } from "zod";
import type { Viewer } from "@/domain/viewer";
import { requestEvidenceUpload, type EvidenceDeps, type EvidenceUploadIntent } from "@/domain/evidence";
import { assertVendorDocumentWritable, VENDOR_DOCUMENT_KIND, VENDOR_DOCUMENT_KINDS } from "@/domain/vendors/documents";
import { insertVendorDocument, markVendorDocumentRemoved } from "@/repositories/vendor-details";

// 07-23(V8 · SC-17 ⑨) — 거래처 서류 붙이기 시작. 서류 행을 먼저 만들고(파일 주인 id) 05 증빙 선언을 그 행으로 부른다 — 마침은 05
// completeEvidenceUpload 그대로이고, 이전 서류를 떼는 교체는 주인 표의 beforeAdd가 마침 트랜잭션에서 한다(끝내지 않은 시도는 이전 서류를 건드리지 않는다).
// 선언이 거부되면 행을 버린다. documents.ts와 나눈 까닭: evidence가 documents.ts의 주인 함수를 import한다(순환 — 07-22 프로젝트 서류와 같은 꼴).

const requestSchema = z
  .object({
    vendorId: z.string().uuid(),
    kind: z.enum(VENDOR_DOCUMENT_KINDS),
    size: z.number().int(),
    contentType: z.string().min(1).max(100),
    sha256: z.string().max(64),
    name: z.string().trim().min(1).max(255),
  })
  .strict();

export type VendorDocumentUploadRequest = z.input<typeof requestSchema>;

export async function requestVendorDocumentUpload(viewer: Viewer, raw: VendorDocumentUploadRequest, deps?: EvidenceDeps): Promise<EvidenceUploadIntent> {
  const input = requestSchema.parse(raw);
  const vendor = await assertVendorDocumentWritable(viewer, input.vendorId);
  const doc = await insertVendorDocument(viewer, { vendorId: vendor.id, kind: input.kind });
  try {
    return await requestEvidenceUpload(
      viewer,
      { ownerKind: VENDOR_DOCUMENT_KIND, ownerId: doc.id, size: input.size, contentType: input.contentType, sha256: input.sha256, name: input.name },
      deps,
    );
  } catch (error) {
    await markVendorDocumentRemoved(viewer, doc.id);
    throw error;
  }
}
