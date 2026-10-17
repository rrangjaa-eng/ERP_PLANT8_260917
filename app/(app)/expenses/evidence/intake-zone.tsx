"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Attachments, type BulkImportCount, type BulkImportRow } from "@/ui/attachments/Attachments";
import { EVIDENCE_IMPORT_MAX_BYTES, sizeRefusalHeadline } from "@/domain/evidence-import/limits";
import { isCtrlCombo } from "@/lib/shortcut";
import { registerEvidenceFileAction } from "./actions";

// 06.1-05(S1 · G-1) — 끌어 놓기 영역 + 결과 행. 파일 하나 = 서버 액션 하나를 차례로 부르고(액션 본문 한도 — RESEARCH Pitfall 4),
// 결과 DTO의 숫자 · 문구를 그대로 결과 행으로 옮긴다(계산 · 판정 없음). 파일이 끝날 때마다 목록을 다시 읽는다(router.refresh).
// 06.1-05 Task 3(DA-2 · E2 · DA-21 · E32): 한도를 넘는 파일은 놓는 즉시 거절 행(액션을 부르지 않는다 — 크기 상수 · 문구는 SheetJS 없는
// limits.ts에서), 올리는 중 놓은 파일은 대기열 끝 · 결과 행 끝에 이어 붙고, 올리는 동안 표의 1차를 막는다(onUploadingChange).

// Next 서버 액션 본문 한도 글자(`Body exceeded {한도} limit.`) — 413 text/plain 응답이면 클라이언트가 이 글자로 던진다. 크기 거절이다.
const BODY_LIMIT_ERROR = /^Body exceeded /;

type QueuedFile = { key: string; file: File };

type RegisterResult = NonNullable<Awaited<ReturnType<typeof registerEvidenceFileAction>>["data"]>;
type RegisterSuccess = Exclude<RegisterResult, { refused: { kind: string } }>;

// 조각 표(UI-SPEC S1 「결과 행 글자」 — DA-20 · G12 · G17): 링크 조각은 그 묶음의 목록 보기로 간다. 0인 조각은 그리지 않는다(Attachments).
function resultCounts(result: RegisterSuccess): BulkImportCount[] {
  const view = (state: string) => `/expenses/evidence?state=${state}&batch=${result.batchId}`;
  const mismatchLines = result.nameMismatchLines ?? [];
  return [
    { label: "등록", value: result.registered, kind: "success", href: view("all") },
    { label: "확인 필요", value: result.needsCheck, kind: "warning", href: view("needs-check") },
    // 같은 파일을 다시 올리면 `이미 등록 n · 같은 파일`(멱등 — 표 줄 수 변화 0).
    { label: "이미 등록", value: result.skippedDuplicate, kind: "muted", ...(result.sameFile ? { unit: " · 같은 파일" } : {}) },
    { label: "상쇄", value: result.offsetPairs, kind: "muted", unit: "쌍" },
    { label: "카드 미등록", value: result.cardUnknown, kind: "danger", href: view("card-unknown") },
    { label: "거래처 생성", value: result.vendorCreated, kind: "muted" },
    { label: "되살림", value: result.vendorRestored, kind: "muted" },
    { label: "이름 다름", value: mismatchLines.length + result.nameMismatchRest, kind: "warning" },
  ];
}

function resultRow(key: string, fileName: string, result: RegisterResult): BulkImportRow {
  if (result.refused) {
    const { headline, lines, restCount } = result.refused;
    return { key, state: "refused", fileName, headline, lines, restCount, restUnit: "줄" };
  }
  return {
    key,
    state: "result",
    fileName,
    formatLabel: result.formatLabel,
    counts: resultCounts(result),
    lines: result.nameMismatchLines ?? [],
    restCount: result.nameMismatchRest,
  };
}

function sizeRefusedRow(key: string, file: File): BulkImportRow {
  return { key, state: "refused", fileName: file.name, headline: sizeRefusalHeadline(file.size), lines: [], restCount: 0 };
}

export function IntakeZone({ onUploadingChange }: { onUploadingChange: (uploading: boolean) => void }) {
  const router = useRouter();
  const [rows, setRows] = useState<BulkImportRow[]>([]);
  const [openSignal, setOpenSignal] = useState(0);
  // 차례로 올릴 파일과 「지금 올리는 중인가」 — 렌더와 무관한 진행 상태라 ref다(올리는 중 놓은 파일이 같은 대기열에 붙는다).
  const queueRef = useRef<QueuedFile[]>([]);
  const drainingRef = useRef(false);

  // `Ctrl+U`는 화면 어디서나 파일 고르기를 연다(UI-SPEC S1 — 힌트 줄과 같은 키).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isCtrlCombo(event, "u")) return;
      event.preventDefault();
      setOpenSignal((signal) => signal + 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function replaceRow(key: string, row: BulkImportRow) {
    setRows((current) => current.map((one) => (one.key === key ? row : one)));
  }

  // 연결 끊김 · 시간 초과 · 5xx만 `올리지 못함` + `다시 올리기`다. 본문 한도로 끝난 응답은 다시 올려도 같아 크기 거절 행이다.
  async function upload(key: string, file: File) {
    const form = new FormData();
    form.set("file", file);
    let data: RegisterResult | undefined;
    let bodyLimit = false;
    try {
      data = (await registerEvidenceFileAction(form))?.data;
    } catch (error) {
      bodyLimit = error instanceof Error && BODY_LIMIT_ERROR.test(error.message);
    }
    if (bodyLimit) {
      replaceRow(key, sizeRefusedRow(key, file));
      return;
    }
    if (!data) {
      replaceRow(key, { key, state: "failed", fileName: file.name, onRetry: () => retry(key, file) });
      return;
    }
    replaceRow(key, resultRow(key, file.name, data));
    router.refresh();
  }

  async function drain() {
    drainingRef.current = true;
    onUploadingChange(true);
    for (let next = queueRef.current.shift(); next; next = queueRef.current.shift()) await upload(next.key, next.file);
    drainingRef.current = false;
    onUploadingChange(false);
  }

  function enqueue(files: readonly QueuedFile[]) {
    if (files.length === 0) return;
    queueRef.current.push(...files);
    if (!drainingRef.current) void drain();
  }

  function retry(key: string, file: File) {
    replaceRow(key, { key, state: "uploading", fileName: file.name });
    enqueue([{ key, file }]);
  }

  // 결과 행은 다음 끌어 놓기 묶음이 시작될 때 통째로 바뀐다(누적 안 함) — 올리는 중에 놓은 파일만 그 줄 끝에 이어 붙는다.
  function onFiles(files: File[]) {
    const dropped = files.map((file) => ({ key: crypto.randomUUID(), file }));
    const added = dropped.map(({ key, file }): BulkImportRow => (file.size > EVIDENCE_IMPORT_MAX_BYTES ? sizeRefusedRow(key, file) : { key, state: "uploading", fileName: file.name }));
    // 갱신 함수는 나중에 돈다 — 그사이 enqueue가 대기열을 시작하므로 「올리는 중이었나」는 지금 읽어 둔다.
    const appending = drainingRef.current;
    setRows((current) => (appending ? [...current, ...added] : added));
    enqueue(dropped.filter(({ file }) => file.size <= EVIDENCE_IMPORT_MAX_BYTES));
  }

  return <Attachments variant="bulk-import" rows={rows} onFiles={onFiles} openSignal={openSignal} />;
}
