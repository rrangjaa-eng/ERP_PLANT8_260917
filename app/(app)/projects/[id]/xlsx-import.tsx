"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/ui/button/Button";
import { PickDialog, type PickResult, type PickRow } from "@/ui/pick-dialog/PickDialog";
import { formatKrw } from "@/lib/format-number";
import { EVIDENCE_IMPORT_MAX_BYTES, quoteXlsxSizeRefusalHeadline } from "@/domain/evidence-import/limits";
import type { QuoteImportLine, QuoteImportResult, QuoteImportSkipped } from "@/domain/quotes/import-xlsx";
import { readQuoteXlsxAction } from "../actions";
import styles from "./project-detail.module.css";

// 07.2-14(X2 · UI-SPEC S10) — 회사 양식 견적 xlsx 올리기 화면. 읽기는 서버 액션(저장 0), 올린 줄은 붙여넣기와 같은 길(미저장 줄 · dirty)로 표에 붙고
// 저장은 기존 `일괄 저장 N`이다. 입구는 머리 줄 2차 `엑셀 올리기`, 결과 · 거절은 표 위 한 줄(role="status"), 건너뜀은 네이티브 details(모달 없음 · D-B2).

const RELOAD_FAILED = "읽기 실패 · 다시 올리기";
const SHEET_PICK_SEARCH_LABEL = "시트 검색";

type Shown =
  | { kind: "rejected"; message: string; skipped: QuoteImportSkipped[]; skippedTotal: number }
  | { kind: "applied"; keys: string[]; added: number; skipped: QuoteImportSkipped[]; skippedTotal: number; checksumDiff: number | null; mismatchedLines: number };

type Okay = Extract<QuoteImportResult, { kind: "ok" }>;

export type QuoteXlsxImport = {
  /** 머리 줄 2차 `엑셀 올리기`(+ 숨은 파일 입력 · 시트 고르기). 입구가 서지 않으면 null. */
  entry: ReactNode;
  /** 표 위 결과 줄 · 거절 줄(+ `건너뜀 보기`). 보일 것이 없으면 null. */
  line: ReactNode;
};

export function useQuoteXlsxImport({
  projectId,
  lineCap,
  atLineCap,
  capReasonId,
  enabled,
  visible,
  capLeft,
  append,
  remove,
  liveKeys,
}: {
  projectId: string;
  /** 설정 줄 상한 — 거절 글자(`300줄 초과 · 300줄까지`)에 쓴다. */
  lineCap: number;
  /** 상한이 찬 차수 — `줄 추가`와 같이 입구를 비활성(aria-disabled)하고 줄 추가의 상한 이유 글자(capReasonId)를 가리킨다. */
  atLineCap: boolean;
  capReasonId: string;
  /** 입구가 서는 조건 — 구조 권리 · 현재 미승인 차수 · 정산 아님. */
  enabled: boolean;
  /** 결과 줄을 그리는 폭 조건(편집 폭, ≥1024). */
  visible: boolean;
  /** 이 차수에 더 담을 수 있는 줄 수(상한 − 화면에 있는 줄). */
  capLeft: number;
  /** 올린 줄을 표 맨 아래 미저장 줄로 붙이고 새 줄 키를 돌려준다. */
  append: (lines: QuoteImportLine[]) => string[];
  /** 이번에 붙인 줄만 뺀다. */
  remove: (keys: readonly string[]) => void;
  /** 붙인 줄 가운데 아직 미저장으로 남은 키 — 저장되면 결과 줄이 사라진다. */
  liveKeys: (keys: readonly string[]) => string[];
}): QuoteXlsxImport {
  const [reading, setReading] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  const [pick, setPick] = useState<{ fileName: string; sheets: Extract<QuoteImportResult, { kind: "needsSheet" }>["sheets"] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const entryId = useId();
  const focusEntry = () => document.getElementById(entryId)?.focus();
  const fileRef = useRef<File | null>(null);

  async function run(file: File, sheet?: string) {
    setShown(null);
    // 서버 액션 본문 기본 한도(1MB)가 우리 코드보다 먼저 걸리므로 크기는 보내기 전에 브라우저가 먼저 거른다(증빙 가져오기 06.1-05와 같다 — 같은 상수).
    if (file.size > EVIDENCE_IMPORT_MAX_BYTES) {
      setShown({ kind: "rejected", message: quoteXlsxSizeRefusalHeadline(file.size), skipped: [], skippedTotal: 0 });
      return;
    }
    setReading(true);
    const form = new FormData();
    form.set("file", file);
    form.set("projectId", projectId);
    if (sheet !== undefined) form.set("sheet", sheet);
    let data: QuoteImportResult | undefined;
    let failure: string | undefined;
    try {
      const result = await readQuoteXlsxAction(form);
      data = result?.data;
      failure = result?.serverError;
    } catch {
      failure = undefined;
    }
    setReading(false);
    if (!data) {
      setShown({ kind: "rejected", message: failure ?? RELOAD_FAILED, skipped: [], skippedTotal: 0 });
      return;
    }
    if (data.kind === "rejected") {
      setShown({ kind: "rejected", message: data.message, skipped: [], skippedTotal: 0 });
      return;
    }
    if (data.kind === "needsSheet") {
      fileRef.current = file;
      setPick({ fileName: file.name, sheets: data.sheets });
      return;
    }
    apply(data);
  }

  function apply(data: Okay) {
    if (data.lines.length === 0) {
      setShown({ kind: "rejected", message: `올릴 줄 없음 · 건너뜀 ${data.skippedTotal}줄`, skipped: data.skipped, skippedTotal: data.skippedTotal });
      return;
    }
    if (data.lines.length > capLeft) {
      setShown({ kind: "rejected", message: `${lineCap}줄 초과 · ${lineCap}줄까지`, skipped: [], skippedTotal: 0 });
      return;
    }
    const keys = append(data.lines);
    setShown({
      kind: "applied",
      keys,
      added: data.lines.length,
      skipped: data.skipped,
      skippedTotal: data.skippedTotal,
      checksumDiff: data.checksumDiff,
      mismatchedLines: data.mismatchedLines,
    });
  }

  function onFileChosen(file: File | undefined) {
    if (inputRef.current) inputRef.current.value = "";
    if (file) void run(file);
  }

  function openFilePicker() {
    if (atLineCap) return;
    inputRef.current?.click();
  }

  function undo() {
    if (shown?.kind !== "applied") return;
    remove(shown.keys);
    setShown(null);
    // 사라진 `되돌리기` 대신 남는 컨트롤로 포커스(SYSTEM.md 표 위 결과 줄 포커스 원리).
    focusEntry();
  }

  const entry = enabled ? (
    <>
      <Button
        id={entryId}
        type="button"
        variant="secondary"
        className={`${styles.headerTouchButton} ${styles.xlsxEntry}`}
        pending={reading}
        disabled={atLineCap}
        aria-describedby={atLineCap ? capReasonId : undefined}
        onClick={openFilePicker}
      >
        엑셀 올리기
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        hidden
        tabIndex={-1}
        aria-label="견적 엑셀 파일"
        onChange={(event) => onFileChosen(event.target.files?.[0])}
      />
      {pick ? (
        <PickDialog
          open
          title="시트 고르기"
          subtitle={pick.fileName}
          searchLabel={SHEET_PICK_SEARCH_LABEL}
          primaryLabel="이 시트로"
          noun="시트"
          search={(query): Promise<PickResult | null> => {
            const needle = query.trim().toLowerCase();
            const matched = pick.sheets.filter((sheet) => needle === "" || sheet.name.toLowerCase().includes(needle));
            return Promise.resolve({
              items: matched.map((sheet) => ({
                type: "row" as const,
                id: sheet.name,
                title: sheet.name,
                subtitle: sheet.grandTotal === null ? `${sheet.lines}줄` : `${sheet.lines}줄 · Grand Total ${formatKrw(sheet.grandTotal)}`,
                selectable: true,
              })),
              truncated: false,
              preselect: needle === "" && matched[0] ? [matched[0].name] : null,
            });
          }}
          onClose={() => {
            fileRef.current = null;
            setPick(null);
            focusEntry();
          }}
          onPick={(row: PickRow) => {
            const file = fileRef.current;
            fileRef.current = null;
            setPick(null);
            // 창이 닫힌 뒤 입구로 포커스를 돌려준다(Esc와 같게) — 모달이 열려 있는 동안은 바깥 요소가 포커스를 못 받는다.
            setTimeout(focusEntry, 0);
            if (file) void run(file, row.id);
          }}
        />
      ) : null}
    </>
  ) : null;

  const live = shown?.kind === "applied" ? liveKeys(shown.keys) : [];
  // 저장되었거나 줄을 다 지웠으면 결과 줄은 사라진다.
  const visibleShown = shown && visible && (shown.kind === "rejected" || live.length > 0) ? shown : null;

  const line = visibleShown ? (
    <div>
      <p role="status" className={visibleShown.kind === "rejected" ? `${styles.importLine} ${styles.importLineFailed}` : styles.importLine}>
        {visibleShown.kind === "rejected" ? (
          <>
            <span>{visibleShown.message}</span>
            <button type="button" className={styles.restoreAction} onClick={openFilePicker}>
              다시 올리기
            </button>
          </>
        ) : (
          <>
            <span className={styles.importPieces}>
              {resultPieces(visibleShown).map((piece, index) => (
                <span key={piece.text} className={piece.warning ? styles.importWarning : undefined}>
                  {index > 0 ? " · " : ""}
                  {piece.text}
                </span>
              ))}
            </span>
            <button type="button" className={styles.restoreAction} onClick={undo}>
              되돌리기
            </button>
          </>
        )}
      </p>
      {visibleShown.skippedTotal > 0 ? (
        <details className={styles.importSkipped}>
          <summary className={styles.restoreAction}>건너뜀 보기</summary>
          <ul className={styles.importSkipList}>
            {visibleShown.skipped.map((skipped) => (
              <li key={skipped.row}>{skipped.reason}</li>
            ))}
            {visibleShown.skippedTotal > visibleShown.skipped.length ? <li>{`그 밖 ${visibleShown.skippedTotal - visibleShown.skipped.length}줄`}</li> : null}
          </ul>
        </details>
      ) : null}
    </div>
  ) : null;

  return { entry, line };
}

// 결과 줄 조각 — warning(건너뜀 → 합계 차이 → 엑셀 금액과 다름)이 먼저, muted `엑셀 올림 N줄`이 끝(SYSTEM.md DR-16 danger → warning → muted). 0이면 조각 없음.
function resultPieces(shown: Extract<Shown, { kind: "applied" }>): { text: string; warning: boolean }[] {
  const pieces: { text: string; warning: boolean }[] = [];
  if (shown.skippedTotal > 0) pieces.push({ text: `건너뜀 ${shown.skippedTotal}줄`, warning: true });
  if (shown.checksumDiff !== null) pieces.push({ text: `합계 ${formatKrw(shown.checksumDiff)} 차이`, warning: true });
  if (shown.mismatchedLines > 0) pieces.push({ text: `엑셀 금액과 다름 ${shown.mismatchedLines}줄`, warning: true });
  pieces.push({ text: `엑셀 올림 ${shown.added}줄`, warning: false });
  return pieces;
}
