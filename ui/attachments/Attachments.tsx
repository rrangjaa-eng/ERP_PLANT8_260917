"use client";

import { useEffect, useId, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { Num } from "@/ui/num/Num";
import { RowAction, RowActions } from "@/ui/row-actions/RowActions";
import actionStyles from "@/ui/row-actions/RowActions.module.css";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { prepareEvidenceFile, type PreparedEvidence } from "./prepare-file";
import styles from "./Attachments.module.css";

// 05-05(UI-SPEC S4 · EVID-01): 증빙 첨부 영역 — 파일 고르기 · 끌어 놓기 → 브라우저 축소 · 해시 → 서버 선언(요청) → 서명 PUT → 완료 통보.
// 컴포넌트는 지출결의를 모른다 — 서버 액션 넷을 부모가 `actions`로 주입한다(06 카드 사용 · 구매 완료 폼이 같은 컴포넌트를 쓴다).
// 실패 이유 글자는 서버가 돌려준 05-04 문자열 상수 그대로이고(요청 거부 · 완료 거부), 서명 PUT 실패 · 네트워크 실패만 부모가 넘긴
// `uploadFailedText`(같은 상수 `올리지 못함 · 다시 올리기`)를 쓴다 — 이 파일에 새 실패 문구는 없다.
// 올리는 행의 메타는 `올리는 중…` 글자 하나가 신호다(완료 통보 뒤 옮기는 동안도 같다).
// 05-09(S4 파일 행 3차): 누가 무엇을 할 수 있는지는 부모가 서버 값으로 준다(canAdd · deletableIds · voidableIds — 컴포넌트는 추론하지 않는다).
// 무효 행 = 「무효」 태그 → 취소선 파일명(aria-describedby = 2행) → 2행 `무효 · {처리자} · MM-DD HH:mm · {사유}`, 3차는 `크게 보기`만.

export type AttachmentFile = {
  id: string;
  name: string;
  sizeBytes: number;
  createdAt: string;
  voided?: { byName: string | null; at: string; reason: string | null };
};

export type UploadIntent = { intentId: string; url: string; method: string; headers: Record<string, string> };

export type AttachmentActions = {
  request: (declaration: { size: number; contentType: string; sha256: string; name: string }) => Promise<{ ok: true; intent: UploadIntent } | { ok: false; message: string }>;
  complete: (intentId: string) => Promise<{ ok: true; file: AttachmentFile } | { ok: false; message: string; retry: "complete" | "restart" }>;
  remove: (fileId: string) => Promise<boolean>;
  viewUrl: (fileId: string) => Promise<string | null>;
};

export type AttachmentsProps = {
  mode: "edit" | "read";
  files: AttachmentFile[];
  actions: AttachmentActions;
  /** 크기 한도(MB) — 빈 영역 글자에 쓴다. */
  maxMb: number;
  /** 서명 PUT 실패 · 네트워크 실패 행의 이유(05-04 상수). */
  uploadFailedText: string;
  /** 메타가 `올리는 중…`인 행 수가 바뀔 때마다 부른다. */
  onUploadingChange?: (count: number) => void;
  /** 파일이 올라가거나 지워진 뒤 — 부모가 서버 값을 다시 읽는다. */
  onChanged?: () => void;
  /** 값이 바뀔 때마다 파일 고르기를 연다(부모 폼의 `Ctrl+U`). */
  openSignal?: number;
  /** 빈 영역 · 「하나 더」 버튼 id(폼 라벨이 가리킨다). */
  pickerId?: string;
  /** 파일을 더할 수 있나 — 기본은 편집 모드. */
  canAdd?: boolean;
  /** `삭제`를 그릴 파일 id — 기본은 편집 모드면 전부 · 읽기 모드면 없음. */
  deletableIds?: readonly string[];
  /** `무효 처리`를 그릴 파일 id와 누를 때 부를 함수(확인 창은 부모가 연다). */
  voidable?: { ids: readonly string[]; onVoid: (file: AttachmentFile) => void };
  /** 더할 수 없는 이유 한 줄(잠김) — 「하나 더」 자리에 그린다. */
  lockedText?: string;
};

type LocalRow = {
  key: string;
  prepared: PreparedEvidence;
  state: "uploading" | "failed";
  message: string | null;
  // 실패 행의 다음 한 수 — 완료 통보만 다시 · 처음부터 다시 · 없음(서버 검사 거부는 다시 올려도 같다).
  retry: "complete" | "restart" | null;
};

type DoneRow = AttachmentFile & { previewUrl: string | null };

const SEOUL_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" });
const SEOUL_MINUTE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function dayOf(iso: string): string {
  const parts = Object.fromEntries(SEOUL_DAY.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return `${parts.month}-${parts.day}`;
}

function minuteOf(iso: string): string {
  const parts = Object.fromEntries(SEOUL_MINUTE.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return `${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function sizeOf(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

function Paperclip() {
  return (
    <svg className={styles.clip} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M13.5 7.5 8 13a3.2 3.2 0 0 1-4.5-4.5l5.8-5.8a2.1 2.1 0 0 1 3 3L6.6 11.4a1 1 0 0 1-1.5-1.5L10.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Attachments({
  mode,
  files,
  actions,
  maxMb,
  uploadFailedText,
  onUploadingChange,
  onChanged,
  openSignal,
  pickerId,
  canAdd = mode === "edit",
  deletableIds,
  voidable,
  lockedText,
}: AttachmentsProps) {
  const [rows, setRows] = useState<LocalRow[]>([]);
  const [done, setDone] = useState<DoneRow[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const intents = useRef(new Map<string, string>());
  const counter = useRef(0);
  const nameId = useId();
  // 05-13(UI-SPEC a11y S4): 영역 버튼의 접근 이름 = 보이는 글자. 칸 라벨(`증빙`)이 `for`로 이름을 덮지 않게 보이는 글자 묶음을 가리킨다 —
  // 폭에 따라 숨는 쪽(display: none)은 이름에서 빠진다.
  const pickerTextId = useId();

  const uploading = rows.filter((row) => row.state === "uploading").length;
  const reported = useRef(0);
  useEffect(() => {
    if (reported.current === uploading) return;
    reported.current = uploading;
    onUploadingChange?.(uploading);
  }, [uploading, onUploadingChange]);

  const signal = useRef(openSignal);
  useEffect(() => {
    if (openSignal === signal.current) return;
    signal.current = openSignal;
    inputRef.current?.click();
  }, [openSignal]);

  // 올린 줄 로컬 미리보기 주소는 화면을 떠날 때 한 번에 치운다.
  const previews = useRef<string[]>([]);
  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function patch(key: string, change: Partial<LocalRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }

  function fail(key: string, message: string, retry: LocalRow["retry"]) {
    patch(key, { state: "failed", message, retry });
  }

  async function transfer(row: LocalRow, from: "complete" | "restart") {
    const { key, prepared } = row;
    patch(key, { state: "uploading", message: null, retry: null });
    let intentId = intents.current.get(key) ?? null;
    if (from === "restart" || intentId === null) {
      intents.current.delete(key);
      let requested: Awaited<ReturnType<AttachmentActions["request"]>>;
      try {
        requested = await actions.request({ size: prepared.size, contentType: prepared.contentType, sha256: prepared.sha256, name: prepared.name });
      } catch {
        fail(key, uploadFailedText, "restart");
        return;
      }
      if (!requested.ok) {
        fail(key, requested.message, null);
        return;
      }
      intentId = requested.intent.intentId;
      intents.current.set(key, intentId);
      try {
        const put = await fetch(requested.intent.url, { method: requested.intent.method, headers: requested.intent.headers, body: prepared.blob });
        if (!put.ok) {
          fail(key, uploadFailedText, "restart");
          return;
        }
      } catch {
        fail(key, uploadFailedText, "restart");
        return;
      }
    }
    let completed: Awaited<ReturnType<AttachmentActions["complete"]>>;
    try {
      completed = await actions.complete(intentId);
    } catch {
      // 응답이 오지 않았다 — 서버가 이미 끝냈을 수도 있다. 완료 통보만 한 번 더 부르고 서버 답의 갈래를 따른다.
      fail(key, uploadFailedText, "complete");
      return;
    }
    if (!completed.ok) {
      fail(key, completed.message, completed.retry);
      return;
    }
    intents.current.delete(key);
    if (prepared.previewUrl) previews.current.push(prepared.previewUrl);
    setDone((current) => [...current, { ...completed.file, previewUrl: prepared.previewUrl }]);
    setRows((current) => current.filter((candidate) => candidate.key !== key));
    onChanged?.();
  }

  async function addFiles(list: FileList | File[]) {
    for (const file of Array.from(list)) {
      const key = `row-${(counter.current += 1)}`;
      const placeholder: PreparedEvidence = { blob: file, name: file.name, size: file.size, contentType: file.type, sha256: "", previewUrl: null };
      setRows((current) => [...current, { key, prepared: placeholder, state: "uploading", message: null, retry: null }]);
      try {
        const prepared = await prepareEvidenceFile(file);
        const row: LocalRow = { key, prepared, state: "uploading", message: null, retry: null };
        setRows((current) => current.map((candidate) => (candidate.key === key ? row : candidate)));
        await transfer(row, "restart");
      } catch {
        fail(key, uploadFailedText, "restart");
      }
    }
  }

  function discard(row: LocalRow) {
    intents.current.delete(row.key);
    if (row.prepared.previewUrl) URL.revokeObjectURL(row.prepared.previewUrl);
    setRows((current) => current.filter((candidate) => candidate.key !== row.key));
  }

  async function removeFile(id: string) {
    if (!(await actions.remove(id))) return;
    setRemoved((current) => [...current, id]);
    onChanged?.();
  }

  async function view(event: MouseEvent<HTMLAnchorElement>, id: string) {
    event.preventDefault();
    // 서명 주소는 누른 때 만든다(5분 만료). 새 탭을 먼저 열어 두고 주소를 넣는다 — 앞 · 뒤 어디서도 팝업으로 막히지 않게.
    const opened = window.open("", "_blank");
    if (opened) opened.opener = null;
    const url = await actions.viewUrl(id);
    if (!url) {
      opened?.close();
      return;
    }
    if (opened) opened.location.href = url;
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    if (canAdd && event.dataTransfer.files.length > 0) void addFiles(event.dataTransfer.files);
  }

  const listed: (AttachmentFile & { previewUrl: string | null })[] = [
    ...files.filter((file) => !removed.includes(file.id)).map((file) => ({ ...file, previewUrl: null })),
    ...done.filter((file) => !files.some((existing) => existing.id === file.id) && !removed.includes(file.id)),
  ];
  const empty = listed.length === 0 && rows.length === 0;
  const deletable = (id: string) => (deletableIds ? deletableIds.includes(id) : mode === "edit");
  const dropProps =
    canAdd
      ? {
          onDragOver: (event: DragEvent<HTMLElement>) => {
            event.preventDefault();
            setDragging(true);
          },
          onDragLeave: () => setDragging(false),
          onDrop,
        }
      : {};

  return (
    <div className={styles.root} data-ui="attachments" {...dropProps}>
      {canAdd ? (
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          hidden
          data-testid="attachments-input"
          onChange={(event) => {
            if (event.target.files) void addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      ) : null}

      {canAdd && empty ? (
        <button
          id={pickerId}
          type="button"
          className={styles.drop}
          data-dragging={dragging ? "true" : undefined}
          aria-labelledby={pickerTextId}
          onClick={() => inputRef.current?.click()}
        >
          <span id={pickerTextId}>
            <span className={styles.pcText}>{`파일을 끌어 놓거나 Ctrl+U · 이미지·PDF ${maxMb}MB`}</span>
            <span className={styles.phoneText}>{`사진·파일 올리기 · 이미지·PDF ${maxMb}MB`}</span>
          </span>
        </button>
      ) : null}

      <div aria-live="polite">
        {listed.length > 0 || rows.length > 0 ? (
          <ul className={styles.list}>
            {listed.map((file) => (
              <li key={file.id} className={styles.item} data-state="done">
                {file.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 로컬 blob 미리보기(축소한 바이트) — 최적화 대상이 아니다.
                  <img src={file.previewUrl} alt="" className={styles.thumb} />
                ) : (
                  <span className={styles.clipBox}>
                    <Paperclip />
                  </span>
                )}
                {file.voided ? (
                  <span className={styles.text}>
                    <span className={styles.voidedHead}>
                      <StatusTag status="무효" />
                      <span className={`${styles.name} ${styles.voidedName}`} aria-describedby={`${nameId}-${file.id}-void`}>
                        {file.name}
                      </span>
                    </span>
                    <span id={`${nameId}-${file.id}-void`} className={styles.meta}>
                      {`무효 · ${file.voided.byName ?? "—"} · `}
                      <Num value={minuteOf(file.voided.at)} />
                      {file.voided.reason ? ` · ${file.voided.reason}` : ""}
                    </span>
                  </span>
                ) : (
                  <span className={styles.text}>
                    <span className={styles.name}>{file.name}</span>
                    <span className={styles.meta}>{`${sizeOf(file.sizeBytes)} · ${dayOf(file.createdAt)}`}</span>
                  </span>
                )}
                <span className={styles.actions}>
                  <RowActions>
                    <a href="#evidence" target="_blank" rel="noopener noreferrer" className={actionStyles.action} onClick={(event) => void view(event, file.id)}>
                      크게 보기
                    </a>
                    {!file.voided && deletable(file.id) ? (
                      <RowAction danger onClick={() => void removeFile(file.id)}>
                        삭제
                      </RowAction>
                    ) : null}
                    {!file.voided && voidable?.ids.includes(file.id) ? (
                      <RowAction danger onClick={() => voidable.onVoid(file)}>
                        무효 처리
                      </RowAction>
                    ) : null}
                  </RowActions>
                </span>
              </li>
            ))}
            {rows.map((row) => (
              <li key={row.key} className={styles.item} data-state={row.state}>
                {row.prepared.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 로컬 blob 미리보기(축소한 바이트) — 최적화 대상이 아니다.
                  <img src={row.prepared.previewUrl} alt="" className={styles.thumb} />
                ) : (
                  <span className={styles.clipBox}>
                    <Paperclip />
                  </span>
                )}
                <span className={styles.text}>
                  <span id={`${nameId}-${row.key}`} className={styles.name}>
                    {row.prepared.name}
                  </span>
                  {row.state === "uploading" ? <span className={styles.meta}>올리는 중…</span> : <span className={styles.error}>{row.message}</span>}
                </span>
                {row.state === "failed" ? (
                  <span className={styles.actions}>
                    <RowActions>
                      {row.retry ? (
                        <RowAction describedBy={`${nameId}-${row.key}`} onClick={() => void transfer(row, row.retry ?? "restart")}>
                          다시 올리기
                        </RowAction>
                      ) : null}
                      <RowAction describedBy={`${nameId}-${row.key}`} onClick={() => discard(row)}>
                        지우기
                      </RowAction>
                    </RowActions>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {canAdd && !empty ? (
        <button id={pickerId} type="button" className={styles.more} aria-labelledby={pickerTextId} onClick={() => inputRef.current?.click()}>
          <span id={pickerTextId}>
            <span className={styles.pcText}>하나 더 · Ctrl+U</span>
            <span className={styles.phoneText}>하나 더</span>
          </span>
        </button>
      ) : null}
      {!canAdd && lockedText ? <p className={styles.locked}>{lockedText}</p> : null}
    </div>
  );
}
