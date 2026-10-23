"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Attachments,
  type AttachmentActions,
  type AttachmentFile,
} from "@/ui/attachments/Attachments";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { Select } from "@/ui/select/Select";
import { EVIDENCE_UPLOAD_FAILED } from "@/domain/evidence/upload-checks";
import {
  completeEvidenceUploadAction,
  createEvidenceViewUrlAction,
  removeEvidenceAction,
} from "../../expenses/actions";
import { requestProjectDocumentUploadAction } from "../actions";
import styles from "./project-detail.module.css";

// 07-22(W3 · SC-20) — 상세 「서류」 섹션: 발주서 · 기타 여러 장. 05 `ui/attachments`에 서류 액션을 묶는다 — 마침 · 지우기 · 보기는 05 증빙 액션 그대로.
// 목록 · 쓰기 권리는 서버(listProjectDocuments)가 정해 page가 내려 준다. 올리기 · 지우기 뒤에는 router.refresh로 다시 읽는다(07-18 `발주서 파일 없음`도 함께).
// 종류는 고르지 않아도 `발주서`(기본). 지우기는 되돌리는 길이 없어 확인 창(UI-SPEC SC-20 · Destructive confirmation).

export type ProjectDocumentKind = "purchase_order" | "other";

export type ProjectDocumentItem = {
  fileId?: string;
  kind?: ProjectDocumentKind;
  name?: string;
  sizeBytes?: number;
  uploaderName?: string | null;
  createdAt?: string;
};

export type ProjectDocumentsProps = {
  projectId: string;
  canWrite: boolean;
  maxMb: number;
  documents: ProjectDocumentItem[];
};

const KIND_WORD: Record<ProjectDocumentKind, string> = {
  purchase_order: "발주서",
  other: "기타",
};
const KIND_OPTIONS = [
  { value: "purchase_order", label: KIND_WORD.purchase_order },
  { value: "other", label: KIND_WORD.other },
];

function toAttachmentFile(doc: ProjectDocumentItem): AttachmentFile {
  return {
    id: doc.fileId ?? "",
    name: doc.name ?? "",
    sizeBytes: doc.sizeBytes ?? 0,
    createdAt: doc.createdAt ?? new Date().toISOString(),
    metaLead: [doc.kind ? KIND_WORD[doc.kind] : null, doc.uploaderName ?? null]
      .filter(Boolean)
      .join(" · "),
  };
}

export function DocumentsSection({
  projectId,
  canWrite,
  maxMb,
  documents,
}: ProjectDocumentsProps) {
  const router = useRouter();
  const [kind, setKind] = useState<ProjectDocumentKind>("purchase_order");
  // EMPTY의 `서류 붙이기`를 누르면 종류 칸 · 첨부 영역이 서고 파일 고르기가 열린다.
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState<{
    file: AttachmentFile;
    resolve: (ok: boolean) => void;
  } | null>(null);
  const kindRef = useRef(kind);
  const emptyRef = useRef<HTMLDivElement>(null);
  // 마지막 서류를 지우면 누른 `삭제`가 사라진다 — EMPTY가 서는 때 포커스를 `서류 붙이기`로 옮긴다.
  const focusEmptyRef = useRef(false);
  const kindId = useId();
  const pickerId = useId();
  const files = useMemo(
    () => documents.filter((doc) => doc.fileId).map(toAttachmentFile),
    [documents],
  );

  // 같은 누름 안에서 첨부 영역을 그린 뒤 그 빈 영역(파일 고르기)을 누른다 — 사용자 활성화가 남아 있어 고르기 창이 열린다.
  function startAdding() {
    flushSync(() => setAdding(true));
    // 누른 버튼이 사라지므로 새로 선 종류 칸으로 포커스를 옮기고 나서 고르기를 연다.
    document.getElementById(kindId)?.focus();
    document.getElementById(pickerId)?.click();
  }

  function changeKind(next: ProjectDocumentKind) {
    kindRef.current = next;
    setKind(next);
  }

  const actions = useMemo<AttachmentActions>(
    () => ({
      request: async (declaration) => {
        const result = await requestProjectDocumentUploadAction({
          projectId,
          kind: kindRef.current,
          ...declaration,
        });
        if (result?.data) return { ok: true, intent: result.data };
        return {
          ok: false,
          message: result?.serverError ?? EVIDENCE_UPLOAD_FAILED,
        };
      },
      complete: async (intentId) => {
        const result = await completeEvidenceUploadAction({ intentId });
        const data = result?.data;
        const file = data?.file;
        if (file?.id) {
          return {
            ok: true,
            file: {
              id: file.id,
              name: file.originalName ?? "",
              sizeBytes: file.sizeBytes ?? 0,
              createdAt: new Date(file.createdAt ?? Date.now()).toISOString(),
              metaLead: KIND_WORD[kindRef.current],
            },
          };
        }
        if (data?.failed && data.message && data.retry)
          return { ok: false, message: data.message, retry: data.retry };
        return {
          ok: false,
          message: result?.serverError ?? EVIDENCE_UPLOAD_FAILED,
          retry: "restart",
        };
      },
      // 지운 뒤 남은 서류가 없으면 EMPTY(`서류 없음` + `서류 붙이기`)로 돌아간다.
      remove: async (fileId) => {
        const removed = Boolean((await removeEvidenceAction({ fileId }))?.data);
        if (removed) {
          focusEmptyRef.current = true;
          setAdding(false);
        }
        return removed;
      },
      viewUrl: async (fileId) =>
        (await createEvidenceViewUrlAction({ fileId }))?.data?.url ?? null,
    }),
    [projectId],
  );

  function confirmRemove(file: AttachmentFile): Promise<boolean> {
    return new Promise((resolve) => setConfirming({ file, resolve }));
  }

  function settle(ok: boolean) {
    confirming?.resolve(ok);
    setConfirming(null);
  }

  const showEmpty = files.length === 0 && !adding;

  useEffect(() => {
    if (!showEmpty || !focusEmptyRef.current) return;
    focusEmptyRef.current = false;
    if (document.activeElement && document.activeElement !== document.body) return;
    emptyRef.current?.querySelector("button")?.focus();
  }, [showEmpty]);

  return (
    <DetailScreen.Section title="서류">
      {showEmpty ? (
        canWrite ? (
          <div ref={emptyRef}>
            <ListEmpty
              message="서류 없음"
              action={{ label: "서류 붙이기", onClick: startAdding }}
            />
          </div>
        ) : (
          <ListEmpty message="서류 없음" />
        )
      ) : (
        <div className={styles.documents}>
          {canWrite ? (
            <p className={styles.documentKind}>
              <label htmlFor={kindId} className={styles.infoLabel}>
                종류
              </label>
              <Select
                id={kindId}
                className={styles.documentKindSelect}
                options={KIND_OPTIONS}
                hideEmptyOption
                value={kind}
                onChange={(event) =>
                  changeKind(
                    event.target.value === "other" ? "other" : "purchase_order",
                  )
                }
              />
            </p>
          ) : null}
          <Attachments
            mode={canWrite ? "edit" : "read"}
            files={files}
            actions={actions}
            maxMb={maxMb}
            uploadFailedText={EVIDENCE_UPLOAD_FAILED}
            onChanged={() => router.refresh()}
            canAdd={canWrite}
            deletableIds={canWrite ? files.map((file) => file.id) : []}
            confirmRemove={confirmRemove}
            pickerId={pickerId}
          />
        </div>
      )}
      <ConfirmDialog
        open={confirming !== null}
        onClose={() => settle(false)}
        title="서류 삭제"
        subtitle={confirming?.file.name ?? ""}
        resultLines={["되돌릴 수 없음"]}
        primary={{ label: "서류 삭제", onConfirm: () => settle(true) }}
      />
    </DetailScreen.Section>
  );
}
