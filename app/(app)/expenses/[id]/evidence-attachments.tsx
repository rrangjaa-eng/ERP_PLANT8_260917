"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Attachments, type AttachmentActions, type AttachmentFile } from "@/ui/attachments/Attachments";
import { EVIDENCE_UPLOAD_FAILED } from "@/domain/evidence/upload-checks";
import { completeEvidenceUploadAction, createEvidenceViewUrlAction, removeEvidenceAction, requestEvidenceUploadAction } from "../actions";

// 05-05: `ui/attachments`에 지출결의 서버 액션 넷을 묶어 주입한다(컴포넌트는 지출결의를 모른다 — 06이 같은 컴포넌트에 다른 액션을 묶는다).
// 폼(편집)과 문서 화면(읽기)이 같이 쓴다. 실패 이유 글자는 서버 응답 그대로이고, 응답이 없을 때만 05-04 상수 `올리지 못함 · 다시 올리기`다.

export function EvidenceAttachments(props: {
  expenseId: string;
  files: AttachmentFile[];
  mode: "edit" | "read";
  maxMb: number;
  onUploadingChange?: (count: number) => void;
  openSignal?: number;
  pickerId?: string;
}) {
  const router = useRouter();
  const { expenseId } = props;
  const actions = useMemo<AttachmentActions>(
    () => ({
      request: async (declaration) => {
        const result = await requestEvidenceUploadAction({ expenseId, ...declaration });
        if (result?.data) return { ok: true, intent: result.data };
        return { ok: false, message: result?.serverError ?? EVIDENCE_UPLOAD_FAILED };
      },
      complete: async (intentId) => {
        const result = await completeEvidenceUploadAction({ intentId });
        const data = result?.data;
        const file = data?.file;
        if (file) {
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
    [expenseId],
  );

  return (
    <Attachments
      mode={props.mode}
      files={props.files}
      actions={actions}
      maxMb={props.maxMb}
      uploadFailedText={EVIDENCE_UPLOAD_FAILED}
      onUploadingChange={props.onUploadingChange}
      onChanged={() => router.refresh()}
      openSignal={props.openSignal}
      pickerId={props.pickerId}
    />
  );
}
