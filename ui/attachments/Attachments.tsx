"use client";

import { Fragment, useEffect, useId, useRef, useState, type DragEvent, type MouseEvent } from "react";
import Link from "next/link";
import { Button } from "@/ui/button/Button";
import { Num } from "@/ui/num/Num";
import { RowAction, RowActions } from "@/ui/row-actions/RowActions";
import actionStyles from "@/ui/row-actions/RowActions.module.css";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import type { StatusKind } from "@/ui/status-tag/status-map";
import { prepareEvidenceFile, type PreparedEvidence } from "./prepare-file";
import styles from "./Attachments.module.css";

// 05-05(UI-SPEC S4 · EVID-01): 증빙 첨부 영역 — 파일 고르기 · 끌어 놓기 → 브라우저 축소 · 해시 → 서버 선언(요청) → 서명 PUT → 완료 통보.
// 컴포넌트는 지출결의를 모른다 — 서버 액션 넷을 부모가 `actions`로 주입한다(06 카드 사용 · 구매 완료 폼이 같은 컴포넌트를 쓴다).
// 실패 이유 글자는 서버가 돌려준 05-04 문자열 상수 그대로이고(요청 거부 · 완료 거부), 서명 PUT 실패 · 네트워크 실패만 부모가 넘긴
// `uploadFailedText`(같은 상수 `올리지 못함 · 다시 올리기`)를 쓴다 — 이 파일에 새 실패 문구는 없다.
// 올리는 행의 메타는 `올리는 중…` 글자 하나가 신호다(완료 통보 뒤 옮기는 동안도 같다).
// 05-09(S4 파일 행 3차): 누가 무엇을 할 수 있는지는 부모가 서버 값으로 준다(canAdd · deletableIds · voidableIds — 컴포넌트는 추론하지 않는다).
// 무효 행 = 「무효」 태그 → 취소선 파일명(aria-describedby = 2행) → 2행 `무효 · {처리자} · MM-DD HH:mm · {사유}`, 3차는 `크게 보기`만.
// 06.1-03(SP-6103 · G-1): `variant="bulk-import"` 갈래 — 같은 영역 모양에 accept 엑셀 · CSV, 파일 행 아래 결과 슬롯(결과 · 거절 · 업로드 중 · 실패).
// 이 갈래는 이미지 전처리 · 서버 액션 셋을 부르지 않고 고른 File을 onFiles로 부모에게 넘긴다. 결과 행은 부모가 넘긴 데이터만 그린다(서식 · 숫자 · 크기 판정 없음).

export type AttachmentFile = {
  id: string;
  name: string;
  sizeBytes: number;
  createdAt: string;
  voided?: { byName: string | null; at: string; reason: string | null };
  /** 07-22(SC-20) — 메타 줄 앞 조각(서류 `발주서 · {올린 사람}`). 있으면 `{조각} · {크기} · {MM-DD}`. */
  metaLead?: string;
};

export type UploadIntent = { intentId: string; url: string; method: string; headers: Record<string, string> };

export type AttachmentActions = {
  request: (declaration: { size: number; contentType: string; sha256: string; name: string }) => Promise<{ ok: true; intent: UploadIntent } | { ok: false; message: string }>;
  complete: (intentId: string) => Promise<{ ok: true; file: AttachmentFile } | { ok: false; message: string; retry: "complete" | "restart" }>;
  remove: (fileId: string) => Promise<boolean>;
  viewUrl: (fileId: string) => Promise<string | null>;
};

export type AttachmentsProps = {
  /** 증빙 파일 올리기 갈래는 `variant`가 없다 — 「엑셀 일괄 등록」은 `BulkImportProps`(variant="bulk-import"). */
  variant?: undefined;
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
  /** 07-22(SC-20 계산서) — 한 자리: 파일 하나만 고르고 마지막 파일 하나만 그리며 「하나 더」 자리가 `교체`다(이전 파일은 서버가 뗀다). */
  single?: boolean;
  /** 07-22(SC-20) — 되돌릴 수 없는 `삭제` 앞 확인(확인 창은 부모가 연다). 거짓이면 아무 일도 하지 않는다. */
  confirmRemove?: (file: AttachmentFile) => Promise<boolean>;
};

/** 결과 행 2행의 숫자 조각 — value 0이면 그리지 않는다. `kind`는 숫자 색(상태 토큰), `href`가 있으면 조각이 3차 링크다. `unit`은 숫자 뒤 단위(`상쇄 2쌍`의 `쌍`). */
export type BulkImportCount = { label: string; value: number; kind: StatusKind; href?: string; unit?: string };

/** 결과 슬롯의 행 — 결과(서식 이름 · 조각 · 목록) · 거절(오류 셀 모양, 2차 없음) · 업로드 중(2px 진행 바) · 실패(`다시 올리기`). */
export type BulkImportRow =
  | { key: string; state: "result"; fileName: string; formatLabel: string | null; counts: BulkImportCount[]; lines: string[]; restCount: number; restUnit?: string }
  | { key: string; state: "refused"; fileName: string; headline: string; lines: string[]; restCount: number; restUnit?: string }
  | { key: string; state: "uploading"; fileName: string }
  | { key: string; state: "failed"; fileName: string; onRetry: () => void };

export type BulkImportProps = {
  variant: "bulk-import";
  rows: BulkImportRow[];
  /** 고른 · 끌어 놓은 파일을 그대로 넘긴다(전처리 없음). */
  onFiles: (files: File[]) => void;
  /** 값이 바뀔 때마다 파일 고르기를 연다(부모 화면의 `Ctrl+U`). */
  openSignal?: number;
  /** 2차 `파일 고르기` 버튼 id. */
  pickerId?: string;
};

type LocalRow = {
  key: string;
  prepared: PreparedEvidence;
  state: "uploading" | "failed";
  message: string | null;
  // 실패 행의 다음 한 수 — 완료 통보만 다시 · 처음부터 다시 · 없음(서버 검사 거부는 다시 올려도 같다).
  retry: "complete" | "restart" | null;
};

export type DoneRow = AttachmentFile & { previewUrl: string | null };

/** 이번에 올려 마친 파일을 더한다 — 한 자리는 바꿔 끼운다. 쌓아 두면 서버가 옛 파일을 뗀 뒤(새로 고침 값 [새 파일])에도
 * 옛 파일이 「서버 값에 없는 이번 업로드」로 뒤에 붙어 마지막 하나로 다시 섰다(07-23 vendors 교체 E2E 불안정의 원인). */
export function withUploaded(done: DoneRow[], file: DoneRow, single: boolean): DoneRow[] {
  return single ? [file] : [...done, file];
}

/** 그릴 파일 — 서버 값(지운 것 빼고) 뒤에 아직 서버 값에 없는 이번 업로드. */
export function visibleFiles(files: AttachmentFile[], done: DoneRow[], removed: readonly string[], single: boolean): DoneRow[] {
  const all: DoneRow[] = [
    ...files.filter((file) => !removed.includes(file.id)).map((file) => ({ ...file, previewUrl: null })),
    ...done.filter((file) => !files.some((existing) => existing.id === file.id) && !removed.includes(file.id)),
  ];
  // 한 자리 — 교체 직후 서버 값을 다시 읽기 전에도 마지막 파일 하나만.
  return single ? all.slice(-1) : all;
}

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

function FileAttachments({
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
  single = false,
  confirmRemove,
}: AttachmentsProps) {
  const [rows, setRows] = useState<LocalRow[]>([]);
  const [done, setDone] = useState<DoneRow[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  // 서버 파일 `삭제`가 실패한 행 — 그 행 안에 한 줄(05 /review B5).
  const [removeFailedId, setRemoveFailedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLButtonElement>(null);
  const focusAfterRemoveRef = useRef(false);
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

  // 지운 행이 사라져 포커스가 body로 빠지지 않게 — 지운 뒤 `하나 더`(비면 올리기 영역), 없으면 남은 행의 첫 행동으로(§7-8).
  useEffect(() => {
    if (!focusAfterRemoveRef.current) return;
    focusAfterRemoveRef.current = false;
    (pickerRef.current ?? rootRef.current?.querySelector<HTMLElement>("li a, li button"))?.focus();
  }, [removed]);

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

  async function transfer(row: LocalRow, from: "complete" | "restart"): Promise<boolean> {
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
        return false;
      }
      if (!requested.ok) {
        fail(key, requested.message, null);
        return false;
      }
      intentId = requested.intent.intentId;
      intents.current.set(key, intentId);
      try {
        const put = await fetch(requested.intent.url, { method: requested.intent.method, headers: requested.intent.headers, body: prepared.blob });
        if (!put.ok) {
          fail(key, uploadFailedText, "restart");
          return false;
        }
      } catch {
        fail(key, uploadFailedText, "restart");
        return false;
      }
    }
    let completed: Awaited<ReturnType<AttachmentActions["complete"]>>;
    try {
      completed = await actions.complete(intentId);
    } catch {
      // 응답이 오지 않았다 — 서버가 이미 끝냈을 수도 있다. 완료 통보만 한 번 더 부르고 서버 답의 갈래를 따른다.
      fail(key, uploadFailedText, "complete");
      return false;
    }
    if (!completed.ok) {
      fail(key, completed.message, completed.retry);
      return false;
    }
    intents.current.delete(key);
    if (prepared.previewUrl) previews.current.push(prepared.previewUrl);
    setDone((current) => withUploaded(current, { ...completed.file, previewUrl: prepared.previewUrl }, single));
    setRows((current) => current.filter((candidate) => candidate.key !== key));
    return true;
  }

  // 부모가 서버 값을 다시 읽는 새로 고침은 한 번에 올린 파일들이 다 끝난 뒤 한 번만 부른다(05 /review B7).
  async function addFiles(list: FileList | File[]) {
    let changed = false;
    // 한 자리 — 끌어 놓기 · 붙여넣기 어느 길로 여럿이 와도 첫 파일 하나만 올린다(나머지는 올라가 봐야 서버에서 서로 덮는다).
    for (const file of single ? Array.from(list).slice(0, 1) : Array.from(list)) {
      const key = `row-${(counter.current += 1)}`;
      const placeholder: PreparedEvidence = { blob: file, name: file.name, size: file.size, contentType: file.type, sha256: "", previewUrl: null };
      setRows((current) => [...current, { key, prepared: placeholder, state: "uploading", message: null, retry: null }]);
      try {
        const prepared = await prepareEvidenceFile(file);
        const row: LocalRow = { key, prepared, state: "uploading", message: null, retry: null };
        setRows((current) => current.map((candidate) => (candidate.key === key ? row : candidate)));
        if (await transfer(row, "restart")) changed = true;
      } catch {
        fail(key, uploadFailedText, "restart");
      }
    }
    if (changed) onChanged?.();
  }

  function discard(row: LocalRow) {
    intents.current.delete(row.key);
    if (row.prepared.previewUrl) URL.revokeObjectURL(row.prepared.previewUrl);
    setRows((current) => current.filter((candidate) => candidate.key !== row.key));
  }

  async function removeFile(file: AttachmentFile) {
    const id = file.id;
    if (confirmRemove && !(await confirmRemove(file))) return;
    setRemoveFailedId(null);
    let removedOnServer = false;
    try {
      removedOnServer = await actions.remove(id);
    } catch {
      removedOnServer = false;
    }
    if (!removedOnServer) {
      setRemoveFailedId(id);
      return;
    }
    focusAfterRemoveRef.current = true;
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

  const listed = visibleFiles(files, done, removed, single);
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
    <div ref={rootRef} className={styles.root} data-ui="attachments" {...dropProps}>
      {canAdd ? (
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple={!single}
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
          ref={pickerRef}
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
                      <span id={`${nameId}-${file.id}`} className={`${styles.name} ${styles.voidedName}`} title={file.name} aria-describedby={`${nameId}-${file.id}-void`}>
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
                    <span id={`${nameId}-${file.id}`} className={styles.name} title={file.name}>
                      {file.name}
                    </span>
                    <span className={styles.meta}>{[file.metaLead, sizeOf(file.sizeBytes), dayOf(file.createdAt)].filter(Boolean).join(" · ")}</span>
                    {removeFailedId === file.id ? <span className={styles.error}>삭제 실패 · 다시 시도</span> : null}
                  </span>
                )}
                <span className={styles.actions}>
                  <RowActions>
                    <a href="#evidence" target="_blank" rel="noopener noreferrer" className={actionStyles.action} aria-describedby={`${nameId}-${file.id}`} onClick={(event) => void view(event, file.id)}>
                      크게 보기
                    </a>
                    {!file.voided && deletable(file.id) ? (
                      <RowAction danger describedBy={`${nameId}-${file.id}`} onClick={() => void removeFile(file)}>
                        삭제
                      </RowAction>
                    ) : null}
                    {!file.voided && voidable?.ids.includes(file.id) ? (
                      <RowAction danger describedBy={`${nameId}-${file.id}`} onClick={() => voidable.onVoid(file)}>
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
                  <span id={`${nameId}-${row.key}`} className={styles.name} title={row.prepared.name}>
                    {row.prepared.name}
                  </span>
                  {row.state === "uploading" ? <span className={styles.meta}>올리는 중…</span> : <span className={styles.error}>{row.message}</span>}
                </span>
                {row.state === "failed" ? (
                  <span className={styles.actions}>
                    <RowActions>
                      {row.retry ? (
                        <RowAction describedBy={`${nameId}-${row.key}`} onClick={() => void transfer(row, row.retry ?? "restart").then((ok) => ok && onChanged?.())}>
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
        <button ref={pickerRef} id={pickerId} type="button" className={styles.more} aria-labelledby={pickerTextId} onClick={() => inputRef.current?.click()}>
          <span id={pickerTextId}>
            <span className={styles.pcText}>{single ? "교체 · Ctrl+U" : "하나 더 · Ctrl+U"}</span>
            <span className={styles.phoneText}>{single ? "교체" : "하나 더"}</span>
          </span>
        </button>
      ) : null}
      {!canAdd && lockedText ? <p className={styles.locked}>{lockedText}</p> : null}
    </div>
  );
}

const BULK_LIST_MAX = 5;

function BulkRowLines({ lines, restCount, restUnit }: { lines: string[]; restCount: number; restUnit?: string }) {
  return (
    <>
      {lines.slice(0, BULK_LIST_MAX).map((line, index) => (
        <span key={index} className={styles.bulkLine}>
          {line}
        </span>
      ))}
      {restCount > 0 ? <span className={styles.bulkLine}>{`외 ${restCount}${restUnit ?? ""}`}</span> : null}
    </>
  );
}

function BulkCounts({ counts }: { counts: BulkImportCount[] }) {
  const shown = counts.filter((count) => count.value > 0);
  if (shown.length === 0) return null;
  return (
    <span className={styles.bulkLine}>
      {shown.map((count, index) => {
        const body = (
          <>
            {`${count.label} `}
            <span className={styles.bulkNum} data-kind={count.kind}>
              {count.value}
            </span>
            {count.unit ?? ""}
          </>
        );
        return (
          <Fragment key={count.label}>
            {index > 0 ? " · " : null}
            {count.href ? (
              <Link href={count.href} prefetch={false} className={actionStyles.action}>
                {body}
              </Link>
            ) : (
              body
            )}
          </Fragment>
        );
      })}
    </span>
  );
}

function BulkImportItem({ row }: { row: BulkImportRow }) {
  return (
    <li className={styles.bulkItem} data-state={row.state} data-row={row.key}>
      <span className={styles.bulkTitle}>{row.state === "result" && row.formatLabel ? `${row.fileName} · ${row.formatLabel}` : row.fileName}</span>
      {row.state === "result" ? (
        <>
          <BulkCounts counts={row.counts} />
          <BulkRowLines lines={row.lines} restCount={row.restCount} restUnit={row.restUnit} />
        </>
      ) : null}
      {row.state === "refused" ? (
        <>
          <span className={styles.bulkError}>{row.headline}</span>
          <BulkRowLines lines={row.lines} restCount={row.restCount} restUnit={row.restUnit} />
        </>
      ) : null}
      {row.state === "uploading" ? (
        <>
          <span className={styles.bulkLine}>올리는 중…</span>
          <span className={styles.bulkProgress} data-ui="bulk-progress" aria-hidden="true" />
        </>
      ) : null}
      {row.state === "failed" ? (
        <>
          <span className={styles.bulkError}>올리지 못함</span>
          <span className={styles.bulkRetry}>
            <Button variant="secondary" onClick={row.onRetry}>
              다시 올리기
            </Button>
          </span>
        </>
      ) : null}
    </li>
  );
}

function BulkImport({ rows, onFiles, openSignal, pickerId }: BulkImportProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const signal = useRef(openSignal);
  useEffect(() => {
    if (openSignal === signal.current) return;
    signal.current = openSignal;
    inputRef.current?.click();
  }, [openSignal]);

  function send(list: FileList | null) {
    const files = list ? Array.from(list) : [];
    if (files.length > 0) onFiles(files);
  }

  return (
    <div
      className={styles.root}
      data-ui="attachments"
      data-variant="bulk-import"
      onDragOver={(event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        setDragging(false);
        send(event.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xls,.xlsx,.csv"
        multiple
        hidden
        data-testid="attachments-input"
        onChange={(event) => {
          send(event.target.files);
          event.target.value = "";
        }}
      />
      <div className={`${styles.drop} ${styles.bulkDrop}`} data-dragging={dragging ? "true" : undefined}>
        <span className={styles.bulkHint}>
          <Paperclip />
          <span className={styles.pcText}>끌어 놓거나 Ctrl+U · 엑셀·CSV 1MB</span>
          <span className={styles.phoneText}>엑셀·CSV 1MB</span>
        </span>
        <Button id={pickerId} variant="secondary" shortcut="Ctrl+U" onClick={() => inputRef.current?.click()}>
          파일 고르기
        </Button>
      </div>
      <div aria-live="polite">
        {rows.length > 0 ? (
          <ul className={styles.bulkList}>
            {rows.map((row) => (
              <BulkImportItem key={row.key} row={row} />
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

export function Attachments(props: AttachmentsProps | BulkImportProps) {
  if (props.variant === "bulk-import") return <BulkImport {...props} />;
  return <FileAttachments {...props} />;
}
