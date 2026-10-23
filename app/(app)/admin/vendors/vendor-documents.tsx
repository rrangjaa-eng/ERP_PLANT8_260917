"use client";

import { useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Attachments, type AttachmentActions, type AttachmentFile } from "@/ui/attachments/Attachments";
import { Form } from "@/ui/form/Form";
import { EVIDENCE_UPLOAD_FAILED } from "@/domain/evidence/upload-checks";
import { completeEvidenceUploadAction, createEvidenceViewUrlAction, removeEvidenceAction } from "../../expenses/actions";
import { requestVendorDocumentUploadAction } from "./actions";
import styles from "./vendors.module.css";

// 07-23 SC-17 ⑨ · V8 · AQ-34: 수정 패널 맨 아래 `서류` — 사업자등록증 · 통장 사본 각 한 자리(05 `ui/attachments` single — 있으면 `교체`,
// 이전 서류는 서버가 마침 트랜잭션에서 뗀다). 마침 · 보기는 05 증빙 액션 그대로. 계좌 · 서류 권한이 없으면 개수만(`서류 2`).
// 업로드 실패는 그 자리의 실패 줄 + 다시 올리기(05 Attachments 계약).

export type VendorDocumentKind = "registration" | "bankbook";

export type VendorDocumentSlotValue = {
  kind: VendorDocumentKind;
  file: { fileId?: string; name?: string; sizeBytes?: number; createdAt?: string } | null;
};

export type VendorDocumentsValue = { canWrite: true; maxMb: number; slots: VendorDocumentSlotValue[] } | { canWrite: false; count: number };

const KIND_LABEL: Record<VendorDocumentKind, string> = { registration: "사업자등록증", bankbook: "통장 사본" };

function DocumentSlot({ vendorId, slot, maxMb }: { vendorId: string; slot: VendorDocumentSlotValue; maxMb: number }) {
  const router = useRouter();
  const pickerId = `vendor-document-${slot.kind}`;
  const kindRef = useRef(slot.kind);
  const files = useMemo<AttachmentFile[]>(
    () =>
      slot.file?.fileId
        ? [{ id: slot.file.fileId, name: slot.file.name ?? "", sizeBytes: slot.file.sizeBytes ?? 0, createdAt: slot.file.createdAt ?? new Date().toISOString() }]
        : [],
    [slot.file],
  );
  const actions = useMemo<AttachmentActions>(
    () => ({
      request: async (declaration) => {
        const result = await requestVendorDocumentUploadAction({ vendorId, kind: kindRef.current, ...declaration });
        if (result?.data) return { ok: true, intent: result.data };
        return { ok: false, message: result?.serverError ?? EVIDENCE_UPLOAD_FAILED };
      },
      complete: async (intentId) => {
        const result = await completeEvidenceUploadAction({ intentId });
        const data = result?.data;
        const file = data?.file;
        if (file?.id) {
          return {
            ok: true,
            file: { id: file.id, name: file.originalName ?? "", sizeBytes: file.sizeBytes ?? 0, createdAt: new Date(file.createdAt ?? Date.now()).toISOString() },
          };
        }
        if (data?.failed && data.message && data.retry) return { ok: false, message: data.message, retry: data.retry };
        return { ok: false, message: result?.serverError ?? EVIDENCE_UPLOAD_FAILED, retry: "restart" };
      },
      remove: async (fileId) => Boolean((await removeEvidenceAction({ fileId }))?.data),
      viewUrl: async (fileId) => (await createEvidenceViewUrlAction({ fileId }))?.data?.url ?? null,
    }),
    [vendorId],
  );

  return (
    <Form.Field id={pickerId} label={KIND_LABEL[slot.kind]}>
      <Attachments
        mode="edit"
        single
        files={files}
        actions={actions}
        maxMb={maxMb}
        uploadFailedText={EVIDENCE_UPLOAD_FAILED}
        onChanged={() => router.refresh()}
        deletableIds={[]}
        pickerId={pickerId}
      />
    </Form.Field>
  );
}

export function VendorDocuments({ vendorId, documents }: { vendorId: string; documents: VendorDocumentsValue }) {
  if (!documents.canWrite) {
    return (
      <section className={styles.panelSection} aria-labelledby="vendor-documents">
        <h3 id="vendor-documents" className={styles.panelSectionTitle}>
          서류 {documents.count}
        </h3>
      </section>
    );
  }
  return (
    <section className={styles.panelSection} aria-labelledby="vendor-documents">
      <h3 id="vendor-documents" className={styles.panelSectionTitle}>
        서류
      </h3>
      {documents.slots.map((slot) => (
        <DocumentSlot key={slot.kind} vendorId={vendorId} slot={slot} maxMb={documents.maxMb} />
      ))}
    </section>
  );
}
