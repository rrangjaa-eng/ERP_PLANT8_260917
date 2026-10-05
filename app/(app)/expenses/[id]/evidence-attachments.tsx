"use client";

import { useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Attachments, type AttachmentActions, type AttachmentFile } from "@/ui/attachments/Attachments";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import type { EvidenceActions } from "@/domain/evidence";
import { EVIDENCE_UPLOAD_FAILED } from "@/domain/evidence/upload-checks";
import type { RejectMessages } from "@/app/(app)/approvals/decision-dialogs";
import dialogStyles from "@/app/(app)/approvals/decision-dialogs.module.css";
import { completeEvidenceUploadAction, createEvidenceViewUrlAction, removeEvidenceAction, requestEvidenceUploadAction, voidEvidenceAction } from "../actions";

// 05-05: `ui/attachments`에 지출결의 서버 액션 넷을 묶어 주입한다(컴포넌트는 지출결의를 모른다 — 06이 같은 컴포넌트에 다른 액션을 묶는다).
// 폼(편집)과 문서 화면(읽기)이 같이 쓴다. 실패 이유 글자는 서버 응답 그대로이고, 응답이 없을 때만 05-04 상수 `올리지 못함 · 다시 올리기`다.
// 05-09: 문서 화면은 서버가 정한 evidenceActions(하나 더 · 지울 파일 · 무효 처리할 파일 · 기안자 잠김)대로 그린다. 무효 처리는 04.1 반려
// 확인 창과 같은 모양(사유 textarea · 빈 칸이면 04.1 반려 사유 문구로 막힘)이고, 성공하면 router.refresh()만 한다(토스트 없음 —
// 그 행이 그 자리에서 무효 행으로 바뀌고 첨부 aria-live가 읽는다).

// 결재 중 기안자에게 「하나 더」 자리에 보이는 잠김 한 줄(사용자 결정 2026-10-04 — 결재 중 증빙은 경영관리가 붙인다).
export const EVIDENCE_DRAFTER_LOCKED_LINE = "결재 중 · 증빙은 경영관리";
const VOID_FAILED = "무효 처리 실패 · 다시 시도";

export function EvidenceAttachments(props: {
  expenseId: string;
  files: AttachmentFile[];
  mode: "edit" | "read";
  maxMb: number;
  onUploadingChange?: (count: number) => void;
  openSignal?: number;
  pickerId?: string;
  // 05-06 — 파일 하나가 완료 통보까지 끝난 순간(서버가 다시 그린 files보다 먼저) — 폼이 지난 ⑧ 막힘을 바로 푼다.
  onAdded?: () => void;
  // 05-09 문서 화면 — 서버가 정한 파일 행 3차 · 무효 처리 사유 검증 문구(04.1 반려 사유 상수).
  evidenceActions?: EvidenceActions;
  reasonMessages?: RejectMessages;
}) {
  const router = useRouter();
  const { expenseId, onAdded } = props;
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
          onAdded?.();
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
    [expenseId, onAdded],
  );

  const [voidTarget, setVoidTarget] = useState<AttachmentFile | null>(null);
  const granted = props.evidenceActions;

  return (
    <>
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
        canAdd={granted ? granted.canAdd : undefined}
        deletableIds={granted?.deletableFileIds}
        voidable={granted && granted.voidableFileIds.length > 0 ? { ids: granted.voidableFileIds, onVoid: setVoidTarget } : undefined}
        lockedText={granted?.drafterLocked ? EVIDENCE_DRAFTER_LOCKED_LINE : undefined}
      />
      {props.reasonMessages ? <VoidEvidenceDialog target={voidTarget} messages={props.reasonMessages} onClose={() => setVoidTarget(null)} /> : null}
    </>
  );
}

function VoidEvidenceDialog({ target, messages, onClose }: { target: AttachmentFile | null; messages: RejectMessages; onClose: () => void }) {
  const router = useRouter();
  const fieldId = useId();
  const [reason, setReason] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [failureLine, setFailureLine] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const submittingRef = useRef(false);
  function close() {
    setReason("");
    setServerError(null);
    setFailureLine(undefined);
    onClose();
  }

  const trimmed = reason.trim();
  const inputReason = trimmed.length === 0 ? messages.empty : trimmed.length > messages.max ? messages.tooLong : undefined;
  const blocked = serverError ?? inputReason;

  // 서버 거부(이미 무효 · 승인 아님 · 권한)는 막힘 자리, 응답이 없으면 다시 보내면 되는 실패 한 줄 — 창은 닫히지 않고 사유는 남는다.
  async function confirm() {
    if (!target || submittingRef.current || blocked) return;
    submittingRef.current = true;
    setPending(true);
    setFailureLine(undefined);
    let response: Awaited<ReturnType<typeof voidEvidenceAction>> | undefined;
    try {
      response = await voidEvidenceAction({ fileId: target.id, reason: trimmed });
    } catch {
      response = undefined;
    }
    submittingRef.current = false;
    setPending(false);
    if (response?.data) {
      close();
      router.refresh();
      return;
    }
    if (response?.serverError) setServerError(response.serverError);
    else setFailureLine(VOID_FAILED);
  }

  return (
    <ConfirmDialog
      open={target !== null}
      onClose={close}
      title="증빙 무효 처리"
      subtitle={target?.name}
      evidenceField={
        <div className={dialogStyles.reason}>
          <label htmlFor={fieldId}>사유</label>
          <textarea
            id={fieldId}
            rows={2}
            autoComplete="off"
            value={reason}
            aria-disabled={pending ? "true" : undefined}
            readOnly={pending}
            onChange={(event) => {
              setReason(event.target.value);
              setServerError(null);
            }}
          />
        </div>
      }
      primary={{
        label: "무효 처리",
        pending,
        onConfirm: () => void confirm(),
        disabledReason: blocked,
        failure: failureLine,
      }}
    />
  );
}
