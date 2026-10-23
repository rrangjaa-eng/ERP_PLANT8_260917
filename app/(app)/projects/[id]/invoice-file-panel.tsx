"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Attachments,
  type AttachmentActions,
  type AttachmentFile,
} from "@/ui/attachments/Attachments";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { Num } from "@/ui/num/Num";
import { SidePanel } from "@/ui/side-panel/SidePanel";
import { EVIDENCE_UPLOAD_FAILED } from "@/domain/evidence/upload-checks";
import {
  completeEvidenceUploadAction,
  createEvidenceViewUrlAction,
  removeEvidenceAction,
} from "../../expenses/actions";
import {
  getInvoiceFileAction,
  requestInvoiceFileUploadAction,
} from "../actions";
import styles from "./project-detail.module.css";

// 07-22(W7 · SC-20) — 매출 발행 줄의 계산서 옆 패널(제어 패널 — 열린 동안만 렌더). 05 `ui/attachments` 한 자리(`single` — 있으면 `교체`).
// 파일 목록 · 쓰기 권리(canAdd · deletableFileIds) · 한도는 열 때 서버에서 한 번 읽고, 바뀐 뒤에는 다시 읽고 router.refresh로 줄의 `계산서 1`을 고친다.
// 닫으면 포커스는 SidePanel 계약대로 연 요소(줄의 행동 링크)로 돌아간다.

type KnownInvoiceFile = { fileId: string; name: string; sizeBytes: number; createdAt: string };

type Loaded = {
  files: AttachmentFile[];
  canAdd: boolean;
  deletableIds: string[];
  maxMb: number;
};

type ServerFile = {
  id?: string;
  originalName?: string;
  sizeBytes?: number;
  createdAt?: Date | string;
};

function toAttachmentFile(file: ServerFile, known?: KnownInvoiceFile): AttachmentFile {
  // 파일 DTO는 칸 전부를 expense.value로 가린다(id 포함). 계산서는 발행 줄을 볼 수 있으면 읽는 파일이라(invoiceFileRights) 줄 링크가 이미 받은 값으로 채운다.
  if (!file.id && known) return { id: known.fileId, name: known.name, sizeBytes: known.sizeBytes, createdAt: known.createdAt };
  return {
    id: file.id ?? "",
    name: file.originalName ?? "",
    sizeBytes: file.sizeBytes ?? 0,
    createdAt: new Date(file.createdAt ?? Date.now()).toISOString(),
  };
}

async function loadInvoice(entryId: string, known?: KnownInvoiceFile): Promise<Loaded | null> {
  try {
    const data = (await getInvoiceFileAction({ entryId }))?.data;
    if (!data) return null;
    return {
      files: data.files.map((file) => toAttachmentFile(file, known)),
      canAdd: data.actions.canAdd,
      deletableIds: data.actions.deletableFileIds,
      maxMb: data.maxMb,
    };
  } catch {
    return null;
  }
}

export function InvoiceFilePanel({
  title,
  entryId,
  entryDate,
  amount,
  readOnly,
  knownFile,
  onClose,
}: {
  title: string;
  entryId: string;
  entryDate: string;
  amount: number;
  /** 1024 미만(매출 표 보기 전용 — DR-36) — 서버가 쓰기를 줘도 파일 행만 그린다. */
  readOnly: boolean;
  /** 줄 링크가 받은 살아 있는 파일(id · 이름) — 파일 DTO가 이름을 가리는 계급에서 이름 자리를 채운다. */
  knownFile?: KnownInvoiceFile;
  onClose: () => void;
}) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | "error" | null>(null);
  const [confirming, setConfirming] = useState<{
    file: AttachmentFile;
    resolve: (ok: boolean) => void;
  } | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    const next = await loadInvoice(entryId, knownFile);
    if (mountedRef.current) setLoaded(next ?? "error");
  }, [entryId, knownFile]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const actions = useMemo<AttachmentActions>(
    () => ({
      request: async (declaration) => {
        const result = await requestInvoiceFileUploadAction({
          entryId,
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
        if (data?.file?.id)
          return { ok: true, file: toAttachmentFile(data.file) };
        if (data?.failed && data.message && data.retry)
          return { ok: false, message: data.message, retry: data.retry };
        return {
          ok: false,
          message: result?.serverError ?? EVIDENCE_UPLOAD_FAILED,
          retry: "restart",
        };
      },
      remove: async (fileId) =>
        Boolean((await removeEvidenceAction({ fileId }))?.data),
      viewUrl: async (fileId) =>
        (await createEvidenceViewUrlAction({ fileId }))?.data?.url ?? null,
    }),
    [entryId],
  );

  function settle(ok: boolean) {
    confirming?.resolve(ok);
    setConfirming(null);
  }

  const ready = loaded && loaded !== "error" ? loaded : null;
  const canAdd = ready !== null && ready.canAdd && !readOnly;

  return (
    <SidePanel title={title} onClose={onClose}>
      <div className={styles.invoicePanelBody}>
        <p className={styles.sectionSubtitle}>
          {`발행 ${entryDate} · `}
          <Num value={amount} />
        </p>
        {loaded === "error" ? (
          <ListEmpty
            tone="error"
            message="계산서 불러오지 못함"
            action={{ label: "다시 시도", onClick: () => void reload() }}
          />
        ) : ready ? (
          ready.files.length === 0 && !canAdd ? (
            <ListEmpty message="계산서 없음" />
          ) : (
            <Attachments
              mode={canAdd ? "edit" : "read"}
              single
              files={ready.files}
              actions={actions}
              maxMb={ready.maxMb}
              uploadFailedText={EVIDENCE_UPLOAD_FAILED}
              onChanged={() => {
                void reload();
                router.refresh();
              }}
              canAdd={canAdd}
              deletableIds={canAdd ? ready.deletableIds : []}
              confirmRemove={(file) =>
                new Promise((resolve) => setConfirming({ file, resolve }))
              }
            />
          )
        ) : null}
      </div>
      <ConfirmDialog
        open={confirming !== null}
        onClose={() => settle(false)}
        title="계산서 삭제"
        subtitle={confirming?.file.name ?? ""}
        resultLines={["되돌릴 수 없음"]}
        primary={{ label: "계산서 삭제", onConfirm: () => settle(true) }}
      />
    </SidePanel>
  );
}
