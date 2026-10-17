"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Attachments, type BulkImportCount, type BulkImportRow } from "@/ui/attachments/Attachments";
import { isCtrlCombo } from "@/lib/shortcut";
import { registerEvidenceFileAction } from "./actions";

// 06.1-05(S1 · G-1) — 끌어 놓기 영역 + 결과 행. 파일 하나 = 서버 액션 하나를 차례로 부르고(액션 본문 한도 — RESEARCH Pitfall 4),
// 결과 DTO의 숫자 · 문구를 그대로 결과 행으로 옮긴다(계산 · 판정 없음). 파일이 끝날 때마다 목록을 다시 읽는다(router.refresh).

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

export function IntakeZone() {
  const router = useRouter();
  const [rows, setRows] = useState<BulkImportRow[]>([]);
  const [openSignal, setOpenSignal] = useState(0);

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

  async function upload(key: string, file: File) {
    const form = new FormData();
    form.set("file", file);
    let data: RegisterResult | undefined;
    try {
      data = (await registerEvidenceFileAction(form))?.data;
    } catch {
      data = undefined;
    }
    if (!data) {
      replaceRow(key, { key, state: "failed", fileName: file.name, onRetry: () => retry(key, file) });
      return;
    }
    replaceRow(key, resultRow(key, file.name, data));
    router.refresh();
  }

  function retry(key: string, file: File) {
    replaceRow(key, { key, state: "uploading", fileName: file.name });
    void upload(key, file);
  }

  // 결과 행은 다음 끌어 놓기 묶음이 시작될 때 통째로 바뀐다(누적 안 함).
  async function onFiles(files: File[]) {
    const queue = files.map((file) => ({ key: crypto.randomUUID(), file }));
    setRows(queue.map(({ key, file }) => ({ key, state: "uploading", fileName: file.name })));
    for (const { key, file } of queue) await upload(key, file);
  }

  return <Attachments variant="bulk-import" rows={rows} onFiles={(files) => void onFiles(files)} openSignal={openSignal} />;
}
