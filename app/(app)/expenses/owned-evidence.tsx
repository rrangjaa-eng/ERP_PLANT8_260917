"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Attachments, type AttachmentActions, type AttachmentFile } from "@/ui/attachments/Attachments";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { RowAction, RowActions } from "@/ui/row-actions/RowActions";
import { EVIDENCE_UPLOAD_FAILED } from "@/domain/evidence/upload-checks";
import {
  completeEvidenceUploadAction,
  createEvidenceViewUrlAction,
  getReserveEvidenceAction,
  getRevisionEvidenceAction,
  removeEvidenceAction,
  requestReserveEvidenceUploadAction,
  requestRevisionEvidenceUploadAction,
  restoreEvidenceAction,
} from "./actions";
import styles from "./owned-evidence.module.css";

// 06-16(D-56 · D-60): 05 `ui/attachments`에 새 주인(차수 승인 증빙 · 리저브 줄 증빙)의 서버 액션을 묶는 펼침 섹션 — 05 EvidenceAttachments와 같은 꼴
// (05-05 주석 「06이 같은 컴포넌트에 다른 액션을 묶는다」). 섹션을 펼칠 때 서버가 정한 파일 목록 · 쓰기 권리(canAdd · deletableFileIds) · 한도를 한 번 읽고,
// 올리기 · 지우기 · 되돌리기 뒤에는 다시 읽는다(즉시 저장 — 부모 화면의 일괄 저장 N에 들지 않는다). 지운 파일은 확인 창 없이 결과 줄
// `증빙 삭제 · {파일명}` + `되돌리기`로 되돌린다(SYSTEM §7-8, 마지막 한 건만). 토스트 없음.

export type OwnedEvidenceKind = "quote_revision" | "reserve_entry";

type ServerFile = {
  id?: string;
  originalName?: string;
  sizeBytes?: number;
  createdAt?: Date | string;
  voidedAt?: Date | string | null;
  voidedByName?: string | null;
  voidReason?: string | null;
};

type Loaded = { files: AttachmentFile[]; canAdd: boolean; deletableIds: string[]; maxMb: number; writerName: string | null };

function toAttachmentFile(file: ServerFile): AttachmentFile {
  return {
    id: file.id ?? "",
    name: file.originalName ?? "",
    sizeBytes: file.sizeBytes ?? 0,
    createdAt: new Date(file.createdAt ?? Date.now()).toISOString(),
    ...(file.voidedAt ? { voided: { byName: file.voidedByName ?? null, at: new Date(file.voidedAt).toISOString(), reason: file.voidReason ?? null } } : {}),
  };
}

type UndoResult = { data?: unknown; validationErrors?: { _errors?: string[] }; serverError?: unknown } | null | undefined;

// 되돌리기 결과 → 결과 줄 실패 문구(04.2 undoFailure와 같은 규칙을 이 화면 안 순수 함수로 — 다른 화면 소유 파일을 import하지 않는다).
// 도메인 거부(같은 파일이 다시 붙음 · 권리 없음)는 원인을 싣고 `되돌리기`를 치운다. 연결 · 서버 실패(던짐은 null)는 `다시 시도`로 남긴다.
export function restoreFailure(result: UndoResult): { text: string; retry: boolean } | null {
  if (result?.data) return null;
  const reason = result?.validationErrors?._errors?.[0] ?? (typeof result?.serverError === "string" ? result.serverError : undefined);
  if (reason) return { text: `되돌리기 실패 · ${reason}`, retry: false };
  return { text: "되돌리기 실패 · 다시 시도", retry: true };
}

async function loadOwned(kind: OwnedEvidenceKind, ownerId: string): Promise<Loaded | null> {
  try {
    const result = kind === "quote_revision" ? await getRevisionEvidenceAction({ revisionId: ownerId }) : await getReserveEvidenceAction({ entryId: ownerId });
    const data = result?.data;
    if (!data) return null;
    return {
      files: data.files.map(toAttachmentFile),
      canAdd: data.actions.canAdd,
      deletableIds: data.actions.deletableFileIds,
      maxMb: data.maxMb,
      writerName: data.writerName,
    };
  } catch {
    return null;
  }
}

export function OwnedEvidenceSection({
  kind,
  ownerId,
  headingId,
  title,
  subtitle,
  readOnly = false,
  nested = false,
  sectionClassName,
  titleClassName,
  subtitleClassName,
}: {
  kind: OwnedEvidenceKind;
  ownerId: string;
  headingId: string;
  /** 펼침 제목 — 열리면 포커스를 받는다(`tabindex="-1"`). */
  title: string;
  /** 제목 아래 부제(차수 승인 증빙 = `승인 {승인일}`). */
  subtitle?: string;
  /** 700~1023 · 폰처럼 올리기 · 지우기를 두지 않는 폭 — 서버가 쓰기를 줘도 파일 행만 그린다(O-22). */
  readOnly?: boolean;
  /** 다른 섹션(「차수 열기」 이전 차수 읽기 섹션) 안의 블록 — 위 선 없이 그 섹션 제목 아래에 서고 포커스는 바깥 제목이 가진다. */
  nested?: boolean;
  sectionClassName?: string;
  titleClassName?: string;
  subtitleClassName?: string;
}) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | "error" | null>(null);
  const [removedLine, setRemovedLine] = useState<{ id: string; name: string } | null>(null);
  const [pendingUndo, setPendingUndo] = useState(false);
  const [retryFailure, setRetryFailure] = useState<string | null>(null);
  // 다시 해도 안 되는 거절 — 되돌리기를 치우고 문구만 남긴다.
  const [rejection, setRejection] = useState<string | null>(null);
  // 새로 지울 때만 `되돌리기`를 다시 그려 포커스를 준다.
  const [shown, setShown] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const filesRef = useRef<AttachmentFile[]>([]);
  const mountedRef = useRef(true);
  const nameId = useId();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    const next = await loadOwned(kind, ownerId);
    if (mountedRef.current) setLoaded(next ?? "error");
  }, [kind, ownerId]);

  // 주인이 바뀌면 부모가 key로 새로 마운트한다 — 첫 읽기만 여기서.
  useEffect(() => {
    void reload();
  }, [reload]);

  // 열리면 포커스 = 제목(S21 zero-one-many) — 다시 열 때마다 새로 마운트되므로 한 번이면 된다.
  useEffect(() => {
    if (!nested) headingRef.current?.focus();
  }, [nested]);

  useEffect(() => {
    if (loaded && loaded !== "error") filesRef.current = loaded.files;
  }, [loaded]);

  const afterChange = useCallback(() => {
    void reload();
    router.refresh();
  }, [reload, router]);

  const actions = useMemo<AttachmentActions>(
    () => ({
      request: async (declaration) => {
        const result =
          kind === "quote_revision"
            ? await requestRevisionEvidenceUploadAction({ revisionId: ownerId, ...declaration })
            : await requestReserveEvidenceUploadAction({ entryId: ownerId, ...declaration });
        if (result?.data) return { ok: true, intent: result.data };
        return { ok: false, message: result?.serverError ?? EVIDENCE_UPLOAD_FAILED };
      },
      complete: async (intentId) => {
        const result = await completeEvidenceUploadAction({ intentId });
        const data = result?.data;
        const file = data?.file;
        if (file) return { ok: true, file: toAttachmentFile(file) };
        if (data?.failed && data.message && data.retry) return { ok: false, message: data.message, retry: data.retry };
        return { ok: false, message: result?.serverError ?? EVIDENCE_UPLOAD_FAILED, retry: "restart" };
      },
      remove: async (fileId) => {
        const name = filesRef.current.find((file) => file.id === fileId)?.name ?? "";
        const removed = Boolean((await removeEvidenceAction({ fileId }))?.data);
        if (removed && mountedRef.current) {
          setRemovedLine({ id: fileId, name });
          setShown((count) => count + 1);
          setRejection(null);
          setRetryFailure(null);
        }
        return removed;
      },
      viewUrl: async (fileId) => (await createEvidenceViewUrlAction({ fileId }))?.data?.url ?? null,
    }),
    [kind, ownerId],
  );

  async function undo() {
    if (!removedLine || pendingUndo) return;
    const target = removedLine;
    setPendingUndo(true);
    setRetryFailure(null);
    setRejection(null);
    let result: UndoResult = null;
    try {
      result = await restoreEvidenceAction({ fileId: target.id });
    } catch {
      result = null;
    }
    if (!mountedRef.current) return;
    setPendingUndo(false);
    const failed = restoreFailure(result);
    if (failed?.retry) {
      setRetryFailure(failed.text);
      return;
    }
    setRemovedLine(null);
    if (failed) {
      setRejection(failed.text);
      return;
    }
    afterChange();
  }

  const ready = loaded && loaded !== "error" ? loaded : null;
  const canEdit = ready !== null && !readOnly && ready.canAdd;
  const emptyText = kind === "quote_revision" ? (ready?.writerName ? `승인 증빙 없음 · 올리기는 담당 PM ${ready.writerName}` : "승인 증빙 없음") : "증빙 없음";

  return (
    <>
      {removedLine || rejection ? (
        <p role="status" className={styles.resultLine}>
          {rejection ? <span className={styles.failed}>{rejection}</span> : null}
          {removedLine ? (
            <>
              <span className={retryFailure ? styles.failed : undefined}>{retryFailure ?? `증빙 삭제 · ${removedLine.name}`}</span>
              <RowActions>
                <RowAction key={shown} pending={pendingUndo} autoFocus onClick={() => void undo()}>
                  되돌리기
                </RowAction>
              </RowActions>
            </>
          ) : null}
        </p>
      ) : null}
      <section className={nested ? styles.nested : sectionClassName} aria-labelledby={headingId} aria-busy={loaded === null ? "true" : undefined}>
        <Heading id={headingId} headingRef={headingRef} level={nested ? 3 : 2} className={titleClassName} title={title} />
        {subtitle ? <p className={subtitleClassName}>{subtitle}</p> : null}
        {loaded === "error" ? (
          <ListEmpty tone="error" message="증빙 불러오지 못함" action={{ label: "다시 시도", onClick: () => void reload() }} />
        ) : ready ? (
          ready.files.length === 0 && !canEdit ? (
            <p className={styles.emptyText}>{emptyText}</p>
          ) : (
            <Attachments
              mode={canEdit ? "edit" : "read"}
              files={ready.files}
              actions={actions}
              maxMb={ready.maxMb}
              uploadFailedText={EVIDENCE_UPLOAD_FAILED}
              onChanged={afterChange}
              canAdd={canEdit}
              deletableIds={readOnly ? [] : ready.deletableIds}
              pickerId={`${nameId}-picker`}
            />
          )
        ) : null}
      </section>
    </>
  );
}

function Heading({ id, headingRef, level, className, title }: { id: string; headingRef: React.RefObject<HTMLHeadingElement | null>; level: 2 | 3; className: string | undefined; title: string }) {
  const Tag = level === 2 ? "h2" : "h3";
  return (
    <Tag id={id} ref={headingRef} tabIndex={-1} className={className} title={title}>
      {title}
    </Tag>
  );
}
