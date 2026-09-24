"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { saveProjectLedgerAction } from "../actions";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { Button } from "@/ui/button/Button";
import { FormAlert } from "@/ui/form-alert/FormAlert";
import { Table } from "@/ui/table/Table";
import { Select } from "@/ui/select/Select";
import { RowSheet } from "@/ui/table/RowSheet";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { useDirtyStorage } from "@/ui/table/use-dirty-storage";
import { applyPaste, type PasteColumn } from "@/ui/table/use-clipboard-paste";
import { normalizeNumericPaste } from "@/ui/table/parse-tsv";
import { formatKrw, formatForeignLine, formatQuantity, parseNumberInput, type NumberInputKind } from "@/lib/format-number";
import { useCommaInput } from "@/ui/input/use-comma-input";
import type { TableColumn, CellIssue } from "@/ui/table/types";
import type { QuoteLineDto, QuoteLineBaseline } from "@/domain/quotes/lines";
import type { RevenueDto } from "@/domain/revenue";
import type { Currency } from "@/domain/money";
import { RevenueSection, type ContractDraft, type EntryDraft } from "./revenue-section";
import styles from "./project-detail.module.css";

export type QuoteTableOption = { id: string; name: string };
export type QuoteTableCodeOption = { value: string; label: string };

type DraftLine = {
  clientKey: string;
  id?: string;
  version?: number;
  subcategory: string;
  itemName: string;
  vendorId: string | null;
  quantity: number;
  unitPriceAmount: number;
  unitPriceCurrency: Currency;
  unitPriceFxRate: number;
  unitPriceFxRateTouched: boolean;
  unitPriceAmountKrw: number;
  executionAmount: number;
  quoteAmountKrw: number;
  profitKrw: number;
  lineStatus: string;
  note: string | null;
  dirty: boolean;
  /** 04-28 — Alt+↑↓로 옮겨진 줄. 값 비교로는 드러나지 않는 남은 변경이다. */
  moved?: true;
  /** 04-04 — 이 줄을 불러왔을 때(또는 마지막 저장 성공 직후) 읽은 값의
   * 스냅샷. 버전 충돌 판정의 baseline으로 저장 페이로드에 실린다(D-65).
   * 새 줄(id 없음)에서는 쓰이지 않는다. */
  baseline: QuoteLineBaseline;
  /** 04-04 — 붙여넣기/저장이 남긴 셀별 오류(§7-3 (나)(다)). 키는 열 key. */
  cellErrors: Record<string, string>;
  /** 04-28 — 저장 거부 봉투의 충돌 칸(§7-3 (나), D-65). 키는 열 key. */
  cellConflicts: Record<string, CellConflictDraft>;
};

type CellConflictDraft = { field: string; reason: string; theirRaw: string | number | null; theirVersion: number };

// 04-28 거부 봉투 — 도메인 필드 → 표 열 key 대응 한 표(충돌은 CompareField,
// 형식 오류는 입력 필드 이름으로 온다).
const FIELD_TO_COLUMN: Record<string, string> = {
  subcategory: "subcategory",
  itemName: "itemName",
  vendorId: "vendor",
  quantity: "quantity",
  unitPriceAmountKrw: "unitPrice",
  unitPrice: "unitPrice",
  executionAmountKrw: "execution",
  execution: "execution",
  lineStatus: "status",
  note: "note",
};

// 충돌 이유 문자열 끝의 행동 글자 — 셀에서는 이 둘이 3차 버튼으로 그려진다.
const CONFLICT_ACTIONS_SUFFIX = " · 덮어쓰기 / 그 값으로";

// 04-28(C-07 ② · DR-31) — 견적 표 힌트 줄. 지금 실제로 되는 키만 적는다 —
// Tab 편집 이동·Ctrl+C 복사는 04-19가 배선하며 여기 더한다. 저장은 1차 버튼
// kbd가 말하므로 적지 않는다.
const QUOTE_HINT_ITEMS: { label: string; keys: string }[] = [
  { label: "이동", keys: "↑↓←→" },
  { label: "붙여넣기", keys: "Ctrl+V" },
  { label: "취소", keys: "Esc" },
  { label: "새 줄", keys: "Ctrl+Enter" },
  { label: "줄 이동", keys: "Alt+↑↓" },
  { label: "줄 복제", keys: "Ctrl+D" },
];

const LINE_STATUS_LABELS: Record<string, string> = {
  not_started: "미착수",
  cancelled: "취소",
};

// 04-28 — 서버 현재 원값을 그 칸의 baseline과(「그 값으로」일 때) 줄 값으로.
// 금액은 원화 원값이다.
function theirValuePatch(
  current: QuoteLineBaseline,
  field: string,
  raw: string | number | null,
): { baseline: QuoteLineBaseline; value: Partial<DraftLine> } {
  const text = raw === null ? null : String(raw);
  switch (field) {
    case "subcategory":
      return { baseline: { ...current, subcategory: text ?? "" }, value: { subcategory: text ?? "" } };
    case "itemName":
      return { baseline: { ...current, itemName: text ?? "" }, value: { itemName: text ?? "" } };
    case "vendorId":
      return { baseline: { ...current, vendorId: text }, value: { vendorId: text } };
    case "quantity":
      return { baseline: { ...current, quantity: Number(raw) }, value: { quantity: Number(raw) } };
    case "unitPriceAmountKrw": {
      const amount = Number(raw);
      return {
        baseline: { ...current, unitPriceAmountKrw: amount },
        value: { unitPriceAmount: amount, unitPriceCurrency: "KRW", unitPriceFxRate: 1, unitPriceAmountKrw: amount },
      };
    }
    case "executionAmountKrw":
      return { baseline: { ...current, executionAmountKrw: Number(raw) }, value: { executionAmount: Number(raw) } };
    case "lineStatus":
      return { baseline: { ...current, lineStatus: text ?? "" }, value: { lineStatus: text ?? "" } };
    case "note":
      return { baseline: { ...current, note: text }, value: { note: text } };
    default:
      return { baseline: current, value: {} };
  }
}

function lineDiffersFromBaseline(line: DraftLine): boolean {
  const base = line.baseline;
  return (
    line.subcategory !== base.subcategory ||
    line.itemName !== base.itemName ||
    line.vendorId !== base.vendorId ||
    line.quantity !== base.quantity ||
    line.unitPriceAmountKrw !== base.unitPriceAmountKrw ||
    line.executionAmount !== base.executionAmountKrw ||
    line.lineStatus !== base.lineStatus ||
    line.note !== base.note
  );
}

function baselineFromDto(dto: QuoteLineDto): QuoteLineBaseline {
  return {
    subcategory: dto.subcategory,
    itemName: dto.itemName,
    vendorId: dto.vendorId,
    quantity: dto.quantity,
    unitPriceAmountKrw: dto.unitPrice?.amountKrw ?? 0,
    executionAmountKrw: dto.execution?.amountKrw ?? 0,
    lineStatus: dto.lineStatus,
    note: dto.note,
  };
}

function fromDto(dto: QuoteLineDto): DraftLine {
  return {
    clientKey: dto.id,
    id: dto.id,
    version: dto.version,
    subcategory: dto.subcategory,
    itemName: dto.itemName,
    vendorId: dto.vendorId,
    quantity: dto.quantity,
    unitPriceAmount: dto.unitPrice?.amount ?? 0,
    unitPriceCurrency: dto.unitPrice?.currency ?? "KRW",
    unitPriceFxRate: dto.unitPrice?.fxRate ?? 1,
    unitPriceFxRateTouched: false,
    unitPriceAmountKrw: dto.unitPrice?.amountKrw ?? 0,
    executionAmount: dto.execution?.amountKrw ?? 0,
    quoteAmountKrw: dto.quoteAmountKrw,
    profitKrw: dto.profitKrw,
    lineStatus: dto.lineStatus,
    note: dto.note,
    dirty: false,
    baseline: baselineFromDto(dto),
    cellErrors: {},
    cellConflicts: {},
  };
}

function newDraftLine(defaultSubcategory: string): DraftLine {
  return {
    clientKey: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    subcategory: defaultSubcategory,
    itemName: "",
    vendorId: null,
    quantity: 1,
    unitPriceAmount: 0,
    unitPriceCurrency: "KRW",
    unitPriceFxRate: 1,
    unitPriceFxRateTouched: false,
    unitPriceAmountKrw: 0,
    executionAmount: 0,
    quoteAmountKrw: 0,
    profitKrw: 0,
    lineStatus: "not_started",
    note: null,
    dirty: true,
    // 새 줄은 id가 없어 baseline이 저장 시 쓰이지 않는다 — 로드된 값이
    // 아니므로 의미상 비운 값을 그대로 둔다.
    baseline: {
      subcategory: defaultSubcategory,
      itemName: "",
      vendorId: null,
      quantity: 1,
      unitPriceAmountKrw: 0,
      executionAmountKrw: 0,
      lineStatus: "not_started",
      note: null,
    },
    cellErrors: {},
    cellConflicts: {},
  };
}

function contractFromDto(revenue: RevenueDto): ContractDraft {
  const amount = revenue.contract?.amount;
  return {
    currency: amount?.currency ?? "KRW",
    amount: amount?.amount ?? 0,
    fxRate: amount?.fxRate ?? 1,
    fxRateTouched: false,
    dirty: false,
  };
}

function entriesFromDto(entries: RevenueDto["issuedEntries"]): EntryDraft[] | undefined {
  if (entries === undefined) return undefined;
  return entries.map((entry) => ({
    clientKey: entry.id,
    id: entry.id,
    version: entry.version,
    entryDate: entry.entryDate,
    amount: entry.amount.amountKrw,
    note: entry.note,
    dirty: false,
    computedGrossKrw: entry.computedGrossKrw,
    recomputeDeltaKrw: entry.recomputeDeltaKrw,
    vatKrw: entry.vatKrw,
    totalKrw: entry.totalKrw,
  }));
}

function newEntryDraft(): EntryDraft {
  return {
    clientKey: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    entryDate: new Date().toISOString().slice(0, 10),
    amount: 0,
    note: null,
    dirty: true,
  };
}

// 04-04 — 클릭/Enter로 편집에 들어가는 한 칸짜리 텍스트 셀. 순수 비제어
// 입력이라(값은 commit 시점에만 읽는다) 훅이 필요 없다 — 일반 함수로
// 충분하다(Rules of Hooks 위반 없음).
function textEditCell(opts: { ariaLabel: string; initialValue: string; onCommit: (value: string) => void }) {
  return (
    <input
      aria-label={opts.ariaLabel}
      type="text"
      defaultValue={opts.initialValue}
      autoFocus
      className={styles.cellInput}
      onBlur={(event) => opts.onCommit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          opts.onCommit(event.currentTarget.value);
        }
      }}
    />
  );
}

// 04-09 — 숫자 칸(수량·실행가)의 편집기. useCommaInput으로 타이핑 중
// 쉼표를 넣고(UI-SPEC S15), 붙여넣기·자동완성 거부 문구를 칸 바로 아래
// 한 줄로 보여준다(C-02). 커밋 값은 쉼표 없는 rawValue다.
function NumericEditCell({
  ariaLabel,
  initialValue,
  kind,
  onCommit,
}: {
  ariaLabel: string;
  initialValue: string;
  kind: NumberInputKind;
  onCommit: (value: string) => void;
}) {
  const { inputRef, value, onChange, error, rawValue } = useCommaInput(kind, initialValue);

  return (
    <>
      <input
        ref={inputRef}
        aria-label={ariaLabel}
        type="text"
        inputMode={kind === "krw" ? "numeric" : "decimal"}
        value={value}
        onChange={onChange}
        autoFocus
        className={styles.cellInputNumeric}
        onBlur={() => onCommit(rawValue)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onCommit(rawValue);
          }
        }}
      />
      {error ? <p className={styles.cellEditError}>{error}</p> : null}
    </>
  );
}

function selectEditCell(opts: {
  id: string;
  ariaLabel: string;
  initialValue: string;
  options: { value: string; label: string }[];
  onCommit: (value: string) => void;
}) {
  return (
    <Select
      id={opts.id}
      aria-label={opts.ariaLabel}
      defaultValue={opts.initialValue}
      autoFocus
      onChange={(event) => opts.onCommit(event.target.value)}
      onBlur={(event) => opts.onCommit(event.currentTarget.value)}
      options={opts.options}
      className={styles.cellSelect}
    />
  );
}

// 04-09 — UnitPriceEditCell의 환율 칸. 통화가 KRW↔USD로 바뀌면 이 컴포넌트
// 자체가 마운트·언마운트된다(currency !== "KRW" 조건부 렌더) — useCommaInput은
// Rules of Hooks 때문에 조건부로 켤 수 없으니, 다시 나타날 때 initialValue를
// 새로 반영하려면(기존 uncontrolled defaultValue와 같은 동작) 컴포넌트 자체를
// 다시 마운트하는 쪽이 자연스럽다.
function FxRateEditInput({
  initialValue,
  onState,
  onTouched,
  onEnter,
  onBlur,
}: {
  initialValue: number;
  onState: (state: { raw: string; error: string | null }) => void;
  onTouched: () => void;
  onEnter: () => void;
  onBlur: (event: React.FocusEvent<HTMLElement>) => void;
}) {
  const { inputRef, value, onChange, rawValue, error } = useCommaInput("fxRate", String(initialValue));

  // 부모의 commit()이 통화 select·단가·환율 세 조각을 한 번에 묶어 커밋해야
  // 하므로, 어느 칸에서 blur가 나든 최신 rawValue·error를 부모가 갖고 있게
  // 렌더마다 흘려보낸다.
  useEffect(() => {
    onState({ raw: rawValue, error });
  }, [rawValue, error, onState]);

  return (
    <input
      ref={inputRef}
      aria-label="단가 환율"
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(event) => {
        onChange(event);
        onTouched();
      }}
      className={styles.cellInputNumeric}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onEnter();
        }
      }}
      onBlur={onBlur}
    />
  );
}

// 04-04 — 단가 칸은 통화·금액·환율(비 KRW만) 세 조각이라 렌더 중 상태
// 전환(통화 바꾸면 환율 칸이 나타난다)이 필요하다 — useState를 쓰려면
// 진짜 컴포넌트여야 한다(column.editCell이 그냥 함수를 부르는 자리라도,
// JSX 엘리먼트로 반환하면 그 자체가 안정된 컴포넌트 인스턴스가 된다).
function UnitPriceEditCell({
  rowKey,
  initialAmount,
  initialCurrency,
  initialFxRate,
  usdDefaultFxRate,
  onCommit,
}: {
  rowKey: string;
  initialAmount: number;
  initialCurrency: Currency;
  initialFxRate: number;
  usdDefaultFxRate: number;
  onCommit: (value: string) => void;
}) {
  const [currency, setCurrency] = useState<Currency>(initialCurrency);
  const [fxRateTouched, setFxRateTouched] = useState(false);
  const [fxRateError, setFxRateError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fxRateRawRef = useRef(String(initialFxRate));

  const amountKind: NumberInputKind = currency === "KRW" ? "krw" : "foreign";
  const {
    inputRef: amountInputRef,
    value: amountValue,
    onChange: amountOnChange,
    error: amountError,
    rawValue: amountRawValue,
  } = useCommaInput(amountKind, String(initialAmount));

  function commit() {
    // F3 — `Number(...)`에 0 대체를 붙이면 "1,000,000"이 조용히 0이 된다. 쉼표
    // 없는 rawValue를 parseNumberInput으로 읽고, 숫자가 아니면(빈 칸 포함) 0을
    // 쓰지 않고 이전 값을 유지한 채 amountValid=false로 알려 호출부가 오류 셀로 고정한다.
    const parsedAmount = parseNumberInput(amountRawValue);
    const amountValid = parsedAmount !== null && Number.isFinite(parsedAmount);
    const parsedFxRate = parseNumberInput(fxRateRawRef.current);
    const fxRate = currency === "KRW" ? 1 : parsedFxRate !== null && Number.isFinite(parsedFxRate) ? parsedFxRate : initialFxRate;
    onCommit(
      JSON.stringify({
        amount: amountValid ? parsedAmount : initialAmount,
        amountValid,
        currency,
        fxRate,
        fxRateTouched,
      }),
    );
  }

  function handleBlur(event: React.FocusEvent<HTMLElement>) {
    const next = event.relatedTarget as Node | null;
    if (!next || !wrapRef.current?.contains(next)) commit();
  }

  return (
    <div ref={wrapRef}>
      <div className={styles.contractRow}>
        <Select
          id={`unit-price-currency-edit-${rowKey}`}
          aria-label="단가 통화"
          value={currency}
          onChange={(event) => setCurrency(event.target.value as Currency)}
          onBlur={handleBlur}
          options={[
            { value: "KRW", label: "KRW" },
            { value: "USD", label: "USD" },
          ]}
          className={styles.cellSelect}
        />
        <input
          ref={amountInputRef}
          aria-label="단가"
          type="text"
          inputMode={amountKind === "krw" ? "numeric" : "decimal"}
          value={amountValue}
          onChange={amountOnChange}
          autoFocus
          className={styles.cellInputNumeric}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
          onBlur={handleBlur}
        />
        {currency !== "KRW" ? (
          <FxRateEditInput
            initialValue={currency === initialCurrency ? initialFxRate : usdDefaultFxRate}
            onState={({ raw, error }) => {
              fxRateRawRef.current = raw;
              setFxRateError(error);
            }}
            onTouched={() => setFxRateTouched(true)}
            onEnter={commit}
            onBlur={handleBlur}
          />
        ) : null}
      </div>
      {amountError ? <p className={styles.cellEditError}>{amountError}</p> : null}
      {fxRateError ? <p className={styles.cellEditError}>{fxRateError}</p> : null}
    </div>
  );
}

// SYSTEM.md §6-2 + §7-3 보강 (가)~(아) — 견적 원장 + 매출 섹션. 화면의 1차
// 「일괄 저장 Ctrl+S N」 하나가 견적 줄 표 + 매출 섹션의 dirty 전부를 한
// 트랜잭션으로 저장한다(§7-3 (사), §7-15). 04-04부터 표는 클릭/Enter로
// 편집에 들어가는 진짜 grid 계약을 따른다(로빙 tabIndex · 방향키 · Esc ·
// Delete · 붙여넣기 · 셀 오류·충돌 고정 렌더) — 04-01/04-02의 always-on
// 인풋 트레이서를 여기서 완성한다.
export function QuoteLedger({
  projectId,
  projectName,
  projectNumber,
  revisionSeq,
  statusLabel,
  revisionId,
  initialLines,
  vendors,
  subcategories,
  editable,
  revenue,
  canWriteContract,
  canWriteEntries,
  usdDefaultFxRate,
  contractVatKrw,
  contractTotalKrw,
}: {
  projectId: string;
  projectName: string;
  projectNumber: string;
  revisionSeq: number;
  statusLabel: string;
  revisionId: string;
  initialLines: QuoteLineDto[];
  vendors: QuoteTableOption[];
  subcategories: QuoteTableCodeOption[];
  editable: boolean;
  revenue: RevenueDto;
  canWriteContract: boolean;
  canWriteEntries: boolean;
  usdDefaultFxRate: number;
  contractVatKrw: number;
  contractTotalKrw: number;
}) {
  const [lines, setLines] = useState<DraftLine[]>(() => initialLines.map(fromDto));
  const [contractDraft, setContractDraft] = useState<ContractDraft>(() => contractFromDto(revenue));
  const [issuedEntries, setIssuedEntries] = useState<EntryDraft[] | undefined>(() => entriesFromDto(revenue.issuedEntries));
  const [paidEntries, setPaidEntries] = useState<EntryDraft[] | undefined>(() => entriesFromDto(revenue.paidEntries));
  const [contractVat, setContractVat] = useState({ vatKrw: contractVatKrw, totalKrw: contractTotalKrw });
  const [balanceKrw, setBalanceKrw] = useState<number | undefined>(revenue.balanceKrw);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pasteWarning, setPasteWarning] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ clientKey: string; itemName: string; quoteAmountKrw: number } | null>(null);
  const [sheetRowKey, setSheetRowKey] = useState<string | null>(null);

  const dirtyStorage = useDirtyStorage(projectId, revisionId, 0);

  // 엔지 리뷰 C §1 P1 — 저장 래치. 같은 틱에 두 번 들어오는 저장(Ctrl+S
  // 연타)은 isExecuting이 아직 거짓인 렌더에서 처리되므로 동기 래치로 막는다.
  // 성공·실패·navigation 오류(redirect/notFound) 모두에서 부르는 onSettled에서 내린다.
  const savingRef = useRef(false);
  // 04-28 — 저장 요청에 실어 보낸 줄(clientKey) 순서 스냅숏. 봉투의 rowIndex가 이 순서다.
  const sentLineKeysRef = useRef<string[]>([]);

  const { execute, result, isExecuting } = useAction(saveProjectLedgerAction, {
    onSettled: () => {
      savingRef.current = false;
    },
    onSuccess: ({ data }) => {
      if (data && "rejected" in data) {
        applyRejectedCells(data.rejected.cells);
        return; // 전부 거부 — 줄 교체·저장됨·보관본 지우기를 하지 않는다.
      }
      if (data?.quoteLines?.lines) setLines(data.quoteLines.lines.map(fromDto));
      if (data?.revenue) {
        setContractDraft(contractFromDto(data.revenue));
        if (data.revenue.issuedEntries !== undefined) setIssuedEntries(entriesFromDto(data.revenue.issuedEntries));
        if (data.revenue.paidEntries !== undefined) setPaidEntries(entriesFromDto(data.revenue.paidEntries));
        if (data.revenue.contract) setContractVat({ vatKrw: data.revenue.contract.vatKrw, totalKrw: data.revenue.contract.totalKrw });
        setBalanceKrw(data.revenue.balanceKrw);
      }
      setSavedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }));
      dirtyStorage.clearAfterSave();
    },
  });

  const quoteLinesDirtyCount = lines.filter((line) => line.dirty).length;
  const issuedDirtyCount = (issuedEntries ?? []).filter((entry) => entry.dirty).length;
  const paidDirtyCount = (paidEntries ?? []).filter((entry) => entry.dirty).length;
  const contractDirtyCount = contractDraft.dirty ? 1 : 0;
  const dirtyCount = quoteLinesDirtyCount + issuedDirtyCount + paidDirtyCount + contractDirtyCount;
  // 해소되지 않은 충돌 칸도 함께 센다 — 충돌이 남은 채 서버를 부르지 않는다.
  const errorCellCount = lines.reduce(
    (sum, line) => sum + Object.keys(line.cellErrors).length + Object.keys(line.cellConflicts).length,
    0,
  );

  function updateLine(clientKey: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line) => (line.clientKey === clientKey ? { ...line, ...patch, dirty: true } : line)));
  }

  // 04-04(§7-3 (나)) — 특정 셀의 오류를 지운다(사용자가 그 셀을 직접
  // 고쳤을 때). 오류는 다른 셀 편집으로 사라지지 않는다 — 그 셀 자신을
  // 고쳐야만 지워진다.
  function clearCellError(clientKey: string, columnKey: string) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.clientKey !== clientKey || !(columnKey in line.cellErrors || columnKey in line.cellConflicts)) return line;
        const cellErrors = { ...line.cellErrors };
        delete cellErrors[columnKey];
        const cellConflicts = { ...line.cellConflicts };
        delete cellConflicts[columnKey];
        return { ...line, cellErrors, cellConflicts };
      }),
    );
  }

  function commitCell(clientKey: string, columnKey: string, patch: Partial<DraftLine>) {
    clearCellError(clientKey, columnKey);
    updateLine(clientKey, patch);
  }

  // F3 — 타이핑한 숫자 칸 커밋. `Number(...)`에 0 대체를 붙이면 "1,000,000"이
  // 조용히 0이 된다 — 붙여넣기와 같은 파서(normalizeNumericPaste)로 읽고,
  // 숫자가 아니면 0을 쓰지 않고 붙여넣기와 같은 오류 셀로 고정한다(기존
  // 값은 그대로 둔다).
  function commitNumericCell(clientKey: string, columnKey: string, rawValue: string, apply: (num: number) => Partial<DraftLine>) {
    const parsed = normalizeNumericPaste(rawValue);
    if (parsed === null) {
      setLines((prev) =>
        prev.map((line) =>
          line.clientKey === clientKey
            ? { ...line, cellErrors: { ...line.cellErrors, [columnKey]: "숫자가 아닙니다 · 12,400,000처럼 적어 주세요" }, dirty: true }
            : line,
        ),
      );
      return;
    }
    commitCell(clientKey, columnKey, apply(parsed));
  }

  const addLine = useCallback(
    (afterRow?: DraftLine) => {
      const inheritedSubcategory = afterRow?.subcategory ?? subcategories[0]?.value ?? "";
      setLines((prev) => [...prev, newDraftLine(inheritedSubcategory)]);
    },
    [subcategories],
  );

  function duplicateLine(clientKey: string) {
    setLines((prev) => {
      const source = prev.find((line) => line.clientKey === clientKey);
      if (!source) return prev;
      const copy: DraftLine = {
        ...newDraftLine(source.subcategory),
        itemName: source.itemName,
        vendorId: source.vendorId,
        quantity: source.quantity,
        unitPriceAmount: source.unitPriceAmount,
        unitPriceCurrency: source.unitPriceCurrency,
        unitPriceFxRate: source.unitPriceFxRate,
        executionAmount: source.executionAmount,
        note: source.note,
      };
      const index = prev.findIndex((line) => line.clientKey === clientKey);
      return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
    });
  }

  // 줄 이동(Alt+↑/↓). 그룹(대분류=소분류) 경계를 넘으면 소분류를 비운다
  // (§7-3 (라)) — "비운다"는 이 표에 자유 텍스트 소분류가 없으므로 그 줄이
  // 도착한 이웃 줄의 그룹을 새로 물려받는 것으로 구현한다(코드표 밖 값을
  // 만들지 않기 위해, D-62).
  function moveLine(clientKey: string, direction: "up" | "down") {
    setLines((prev) => {
      const index = prev.findIndex((line) => line.clientKey === clientKey);
      if (index === -1) return prev;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const moved = next[index]!;
      const neighborGroup = next[targetIndex]!.subcategory;
      next.splice(index, 1);
      const crossedGroup = moved.subcategory !== neighborGroup;
      next.splice(targetIndex, 0, { ...moved, subcategory: crossedGroup ? neighborGroup : moved.subcategory, dirty: true, moved: true });
      return next;
    });
  }

  function confirmDeleteLine() {
    if (!deleteConfirm) return;
    setLines((prev) => prev.filter((line) => line.clientKey !== deleteConfirm.clientKey));
    setDeleteConfirm(null);
  }

  function updateContract(patch: Partial<ContractDraft>) {
    setContractDraft((prev) => {
      const next = { ...prev, ...patch, dirty: true };
      if (patch.currency === "USD" && prev.currency !== "USD" && !patch.fxRateTouched) {
        next.fxRate = usdDefaultFxRate;
      }
      return next;
    });
  }

  function updateIssued(clientKey: string, patch: Partial<EntryDraft>) {
    setIssuedEntries((prev) => prev?.map((entry) => (entry.clientKey === clientKey ? { ...entry, ...patch, dirty: true } : entry)));
  }

  function updatePaid(clientKey: string, patch: Partial<EntryDraft>) {
    setPaidEntries((prev) => prev?.map((entry) => (entry.clientKey === clientKey ? { ...entry, ...patch, dirty: true } : entry)));
  }

  function addIssued() {
    setIssuedEntries((prev) => [...(prev ?? []), newEntryDraft()]);
  }

  function addPaid() {
    setPaidEntries((prev) => [...(prev ?? []), newEntryDraft()]);
  }

  function handleSave() {
    if (savingRef.current || isExecuting) return; // 버튼·키보드 두 경로가 여기서 한 번만 보낸다.
    if (errorCellCount > 0) return; // §7-3 "오류가 한 칸이라도 있으면 화면 전체가 거부" — 서버에 보내지 않는다.
    savingRef.current = true;

    const dirtyLines = lines.filter((line) => line.dirty);
    sentLineKeysRef.current = dirtyLines.map((line) => line.clientKey);
    const dirtyIssued = (issuedEntries ?? []).filter((entry) => entry.dirty);
    const dirtyPaid = (paidEntries ?? []).filter((entry) => entry.dirty);

    const hasRevenueChanges = contractDraft.dirty || dirtyIssued.length > 0 || dirtyPaid.length > 0;

    execute({
      projectId,
      quoteLines:
        dirtyLines.length > 0
          ? {
              revisionId,
              rows: dirtyLines.map((line) => ({
                id: line.id,
                version: line.version,
                subcategory: line.subcategory,
                itemName: line.itemName,
                vendorId: line.vendorId ?? undefined,
                quantity: line.quantity,
                unitPrice: {
                  currency: line.unitPriceCurrency,
                  amount: line.unitPriceAmount,
                  fxRate: line.unitPriceFxRate,
                },
                unitPriceFxRateTouched: line.unitPriceFxRateTouched,
                execution: { currency: "KRW" as const, amount: line.executionAmount, fxRate: 1 },
                lineStatus: line.lineStatus,
                note: line.note ?? undefined,
                baseline: line.id ? line.baseline : undefined,
              })),
            }
          : undefined,
      revenue: hasRevenueChanges
        ? {
            contract: contractDraft.dirty
              ? { currency: contractDraft.currency, amount: contractDraft.amount, fxRate: contractDraft.fxRate }
              : undefined,
            contractFxRateTouched: contractDraft.fxRateTouched,
            issuedEntries:
              dirtyIssued.length > 0
                ? dirtyIssued.map((entry) => ({
                    id: entry.id,
                    version: entry.version,
                    entryDate: entry.entryDate,
                    amount: { currency: "KRW" as const, amount: entry.amount, fxRate: 1 },
                    note: entry.note ?? undefined,
                  }))
                : undefined,
            paidEntries:
              dirtyPaid.length > 0
                ? dirtyPaid.map((entry) => ({
                    id: entry.id,
                    version: entry.version,
                    entryDate: entry.entryDate,
                    amount: { currency: "KRW" as const, amount: entry.amount, fxRate: 1 },
                    note: entry.note ?? undefined,
                  }))
                : undefined,
          }
        : undefined,
    });
  }

  const vendorLabel = (id: string | null) => (id ? (vendors.find((v) => v.id === id)?.name ?? id) : "—");
  const subcategoryLabel = (value: string) => subcategories.find((option) => option.value === value)?.label ?? value;

  const columns: TableColumn<DraftLine>[] = [
    {
      key: "sort",
      header: "번호",
      priority: "p3",
      align: "left",
      cell: (row) => lines.indexOf(row) + 1,
    },
    {
      key: "subcategory",
      header: "소분류",
      priority: "p3",
      editability: () => (editable ? "edit" : "locked"),
      cell: (row) => subcategoryLabel(row.subcategory),
      editCell: (row, ctx) =>
        selectEditCell({
          id: `subcategory-edit-${row.clientKey}`,
          ariaLabel: "소분류",
          initialValue: row.subcategory,
          options: subcategories.map((option) => ({ value: option.value, label: option.label })),
          onCommit: (value) => {
            commitCell(row.clientKey, "subcategory", { subcategory: value });
            ctx.onCommit(value);
          },
        }),
    },
    {
      key: "itemName",
      header: "항목",
      priority: "p1",
      editability: () => (editable ? "edit" : "locked"),
      cell: (row) => row.itemName,
      editCell: (row, ctx) =>
        textEditCell({
          ariaLabel: "항목",
          initialValue: row.itemName,
          onCommit: (value) => {
            commitCell(row.clientKey, "itemName", { itemName: value });
            ctx.onCommit(value);
          },
        }),
    },
    {
      key: "vendor",
      header: "거래처",
      priority: "p2",
      editability: () => (editable ? "edit" : "locked"),
      cell: (row) => vendorLabel(row.vendorId),
      editCell: (row, ctx) =>
        selectEditCell({
          id: `vendor-edit-${row.clientKey}`,
          ariaLabel: "거래처",
          initialValue: row.vendorId ?? "",
          options: vendors.map((option) => ({ value: option.id, label: option.name })),
          onCommit: (value) => {
            commitCell(row.clientKey, "vendor", { vendorId: value || null });
            ctx.onCommit(value);
          },
        }),
    },
    {
      key: "quantity",
      header: "수량",
      priority: "p2",
      align: "right",
      editability: () => (editable ? "edit" : "locked"),
      // D-95 — 읽기 모드도 쉼표 서식을 쓴다(04-09 Task 3 편차, 수량 칸이
      // 이관에서 빠져 있었다).
      cell: (row) => formatQuantity(row.quantity),
      editCell: (row, ctx) => (
        <NumericEditCell
          ariaLabel="수량"
          initialValue={String(row.quantity)}
          kind="quantity"
          onCommit={(value) => {
            commitNumericCell(row.clientKey, "quantity", value, (num) => ({ quantity: num }));
            ctx.onCommit(value);
          }}
        />
      ),
    },
    {
      key: "unitPrice",
      header: "단가",
      priority: "p2",
      align: "right",
      editability: () => (editable ? "edit" : "locked"),
      cell: (row) => formatKrw(row.unitPriceAmountKrw),
      editCell: (row, ctx) => (
        <UnitPriceEditCell
          rowKey={row.clientKey}
          initialAmount={row.unitPriceAmount}
          initialCurrency={row.unitPriceCurrency}
          initialFxRate={row.unitPriceFxRate}
          usdDefaultFxRate={usdDefaultFxRate}
          onCommit={(value) => {
            const parsed = JSON.parse(value) as {
              amount: number;
              amountValid: boolean;
              currency: Currency;
              fxRate: number;
              fxRateTouched: boolean;
            };
            // F3 — 숫자가 아닌 값을 쳤으면 조용히 0으로 쓰지 않는다. 붙여넣기와
            // 같은 오류 셀로 고정하고(이전 값은 그대로 둔다) 커밋을 끝낸다.
            if (!parsed.amountValid) {
              setLines((prev) =>
                prev.map((line) =>
                  line.clientKey === row.clientKey
                    ? {
                        ...line,
                        cellErrors: { ...line.cellErrors, unitPrice: "숫자가 아닙니다 · 12,400,000처럼 적어 주세요" },
                        dirty: true,
                      }
                    : line,
                ),
              );
              ctx.onCommit(value);
              return;
            }
            // 읽기 모드는 unitPriceAmountKrw를 보여준다(§2-4) — 서버가
            // 최종 재계산하지만(D-63), 저장 전 화면이 스스로 낡은 값을
            // 보여주지 않도록 클라이언트도 같은 공식(외화×환율/KRW=그대로)
            // 으로 즉시 갱신한다.
            const amountKrw = parsed.currency === "KRW" ? parsed.amount : Math.round(parsed.amount * parsed.fxRate);
            commitCell(row.clientKey, "unitPrice", {
              unitPriceAmount: parsed.amount,
              unitPriceCurrency: parsed.currency,
              unitPriceFxRate: parsed.fxRate,
              unitPriceFxRateTouched: parsed.fxRateTouched || row.unitPriceFxRateTouched,
              unitPriceAmountKrw: amountKrw,
            });
            ctx.onCommit(value);
          }}
        />
      ),
      secondaryLine: (row) =>
        formatForeignLine({ currency: row.unitPriceCurrency, amount: row.unitPriceAmount, fxRate: row.unitPriceFxRate }),
    },
    {
      key: "quoteAmount",
      header: "견적가",
      priority: "p2",
      align: "right",
      // 계산 열 — 누구에게나 항상 읽기 전용(D-63).
      cell: (row) => formatKrw(row.quoteAmountKrw),
    },
    {
      key: "execution",
      header: "실행가",
      priority: "p1",
      align: "right",
      editability: () => (editable ? "edit" : "locked"),
      cell: (row) => formatKrw(row.executionAmount),
      editCell: (row, ctx) => (
        <NumericEditCell
          ariaLabel="실행가"
          initialValue={String(row.executionAmount)}
          kind="krw"
          onCommit={(value) => {
            commitNumericCell(row.clientKey, "execution", value, (num) => ({ executionAmount: num }));
            ctx.onCommit(value);
          }}
        />
      ),
    },
    {
      key: "profit",
      header: "차익",
      priority: "p2",
      align: "right",
      cell: (row) => formatKrw(row.profitKrw),
    },
    {
      key: "status",
      header: "상태",
      priority: "p1",
      cell: (row) => LINE_STATUS_LABELS[row.lineStatus] ?? row.lineStatus,
    },
    {
      key: "note",
      header: "비고",
      priority: "p3",
      editability: () => (editable ? "edit" : "locked"),
      cell: (row) => row.note ?? "—",
      editCell: (row, ctx) =>
        textEditCell({
          ariaLabel: "비고",
          initialValue: row.note ?? "",
          onCommit: (value) => {
            commitCell(row.clientKey, "note", { note: value || null });
            ctx.onCommit(value);
          },
        }),
    },
  ];

  // 04-04(다) — 붙여넣기 열 정의. columns와 같은 순서·같은 길이여야 한다
  // (Table이 colIndex로 이 둘을 함께 참조한다).
  const pasteColumns: PasteColumn<DraftLine>[] = useMemo(
    () => [
      { key: "sort", kind: "text", isEditable: () => false },
      {
        key: "subcategory",
        kind: "select",
        options: subcategories.map((option) => ({ value: option.value, label: option.label })),
        isEditable: () => editable,
      },
      { key: "itemName", kind: "text", isEditable: () => editable },
      { key: "vendor", kind: "select", options: vendors.map((option) => ({ value: option.id, label: option.name })), isEditable: () => editable },
      { key: "quantity", kind: "number", isEditable: () => editable },
      { key: "unitPrice", kind: "number", isEditable: () => editable },
      { key: "quoteAmount", kind: "text", isEditable: () => false },
      { key: "execution", kind: "number", isEditable: () => editable },
      { key: "profit", kind: "text", isEditable: () => false },
      { key: "status", kind: "text", isEditable: () => false },
      { key: "note", kind: "text", isEditable: () => editable },
    ],
    [editable, subcategories, vendors],
  );

  function handlePasteAtCell(row: DraftLine, columnKey: string, clipboardText: string) {
    const rowIndex = lines.indexOf(row);
    const colIndex = pasteColumns.findIndex((column) => column.key === columnKey);
    if (rowIndex === -1 || colIndex === -1) return;

    const result = applyPaste({ clipboardText, columns: pasteColumns, rows: lines, activeRowIndex: rowIndex, activeColIndex: colIndex });

    setLines((prev) => {
      const next = [...prev];
      for (let i = 0; i < result.newRowsNeeded; i++) {
        next.push(newDraftLine(subcategories[0]?.value ?? ""));
      }
      for (const cell of result.cells) {
        const target = next[cell.rowIndex];
        if (!target) continue;
        const cellErrors = { ...target.cellErrors };
        const cellConflicts = { ...target.cellConflicts };
        delete cellConflicts[cell.columnKey];
        if (cell.result.status === "error") {
          cellErrors[cell.columnKey] = cell.result.reason;
          next[cell.rowIndex] = { ...target, cellErrors, cellConflicts, dirty: true };
          continue;
        }
        delete cellErrors[cell.columnKey];
        const value = cell.result.value;
        let patch: Partial<DraftLine> = {};
        switch (cell.columnKey) {
          case "subcategory":
            patch = { subcategory: value };
            break;
          case "itemName":
            patch = { itemName: value };
            break;
          case "vendor":
            patch = { vendorId: value || null };
            break;
          case "quantity":
            // 04-09 — value는 applyPaste가 이미 normalizeNumericPaste로 검증한
            // 문자열이다(status "ok"인 number 열만 여기 온다) — `|| 0` 대체 없이
            // 그대로 읽는다(CEO C-02, 붙여넣기 파서가 이미 유한한 숫자를 보장한다).
            patch = { quantity: Number(value) };
            break;
          case "unitPrice": {
            // 붙여넣기는 숫자 값 하나만 받는다 — 항상 KRW로 들어간다(외화
            // 붙여넣기는 이 플랜 범위 밖, 04-02가 만든 통화 select로 직접
            // 편집한다). amountKrw도 함께 갱신해야 읽기 모드 표시(§2-4)가
            // 맞는다 — amount만 바꾸면 화면이 예전 amountKrw를 계속 보여준다.
            const amount = Number(value);
            patch = { unitPriceAmount: amount, unitPriceCurrency: "KRW", unitPriceFxRate: 1, unitPriceAmountKrw: amount };
            break;
          }
          case "execution":
            patch = { executionAmount: Number(value) };
            break;
          case "note":
            patch = { note: value || null };
            break;
          default:
            break;
        }
        next[cell.rowIndex] = { ...target, ...patch, cellErrors, cellConflicts, dirty: true };
      }
      return next;
    });

    if (result.droppedColumnCount > 0) {
      setPasteWarning(`붙여넣기 · 오른쪽 ${result.droppedColumnCount}칸 버림`);
    } else {
      setPasteWarning(null);
    }
  }

  // 04-28 — 거부 봉투의 칸을 줄·열에 붙인다. 줄은 rowId가 있으면 그 id,
  // 없으면(새 줄) 보낸 줄 스냅숏의 rowIndex로 찾는다.
  function applyRejectedCells(
    cells: { rowId?: string; rowIndex?: number; field: string; kind: "conflict" | "error"; reason: string; theirRaw?: string | number | null; theirVersion?: number }[],
  ) {
    const sentKeys = sentLineKeysRef.current;
    setLines((prev) =>
      prev.map((line) => {
        const mine = cells.filter((cell) =>
          cell.rowId ? cell.rowId === line.id : cell.rowIndex !== undefined && sentKeys[cell.rowIndex] === line.clientKey,
        );
        if (mine.length === 0) return line;
        const cellErrors = { ...line.cellErrors };
        const cellConflicts = { ...line.cellConflicts };
        for (const cell of mine) {
          const column = FIELD_TO_COLUMN[cell.field];
          if (!column) continue;
          if (cell.kind === "conflict") {
            cellConflicts[column] = {
              field: cell.field,
              reason: cell.reason,
              theirRaw: cell.theirRaw ?? null,
              theirVersion: cell.theirVersion ?? line.version ?? 0,
            };
          } else {
            cellErrors[column] = cell.reason;
          }
        }
        return { ...line, cellErrors, cellConflicts };
      }),
    );
  }

  // 04-28(D-65) — 「덮어쓰기」는 내 값을 남기고, 「그 값으로」는 그 칸을 서버
  // 값으로 바꾼다. 둘 다 그 줄의 version과 그 칸의 baseline을 서버 현재로 올려
  // 다음 저장이 그 칸에서 다시 충돌하지 않는다.
  function resolveConflict(clientKey: string, columnKey: string, choice: "mine" | "theirs") {
    setLines((prev) =>
      prev.map((line) => {
        const conflict = line.cellConflicts[columnKey];
        if (line.clientKey !== clientKey || !conflict) return line;
        const cellConflicts = { ...line.cellConflicts };
        delete cellConflicts[columnKey];
        const { baseline, value } = theirValuePatch(line.baseline, conflict.field, conflict.theirRaw);
        const next: DraftLine = { ...line, version: conflict.theirVersion, baseline, cellConflicts };
        if (choice === "mine") return next;
        const taken = { ...next, ...value };
        return { ...taken, dirty: lineDiffersFromBaseline(taken) || Object.keys(taken.cellErrors).length > 0 || taken.moved === true };
      }),
    );
  }

  function cellIssueFor(row: DraftLine, columnKey: string): CellIssue | undefined {
    const message = row.cellErrors[columnKey];
    if (message) return { kind: "error", message };
    const conflict = row.cellConflicts[columnKey];
    if (!conflict) return undefined;
    return {
      kind: "conflict",
      message: conflict.reason.endsWith(CONFLICT_ACTIONS_SUFFIX)
        ? conflict.reason.slice(0, -CONFLICT_ACTIONS_SUFFIX.length)
        : conflict.reason,
      actions: [
        { label: "덮어쓰기", onClick: () => resolveConflict(row.clientKey, columnKey, "mine") },
        { label: "그 값으로", onClick: () => resolveConflict(row.clientKey, columnKey, "theirs") },
      ],
    };
  }

  const saveDisabledReason = dirtyCount === 0 ? "바뀐 칸 없음 · 고칠 칸을 눌러 주세요" : undefined;

  // 04-04 — 서버가 돌려준 문자열을 그대로 쓴다(화면이 이유를 새로 만들지
  // 않는다, Task 2 acceptance criterion). errorCellCount>0이면 handleSave가
  // execute()를 아예 부르지 않으므로(클라이언트 게이트) result.serverError는
  // 그 경로에서 생기지 않는다 — 여기 남는 건 서버가 실제로 거부한 경우뿐이다.
  // F2 — next-safe-action의 validationErrors(예: 항목명 빈 값)는 serverError와
  // 달리 조용히 무시되고 있었다 — 같은 요약 자리에 일반 문구로 띄운다.
  // 04-28 — 거부 봉투가 있으면 그 요약(`충돌 N줄 · 전부 거부` / `오류 N칸 · 전부 거부`).
  const rejectedEnvelope = result.data && "rejected" in result.data ? result.data.rejected : undefined;
  const rejectionSummary =
    rejectedEnvelope?.summary ??
    result.serverError ??
    (result.validationErrors ? "저장하지 못했습니다 · 입력값을 확인하세요" : undefined);
  // F2 — 계약 금액(revenue.contract) 아래에 붙는 필드 오류만 <RevenueSection>에 넘긴다.
  const contractError = result.validationErrors?.revenue?.contract
    ? "저장하지 못했습니다 · 입력값을 확인하세요"
    : undefined;

  const openSheetRow = sheetRowKey ? lines.find((line) => line.clientKey === sheetRowKey) : undefined;

  return (
    <>
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <PageHeader title={projectName} subtitle={`${projectNumber} · 상세 견적 ${revisionSeq}차`} />
        </div>
        <div className={styles.headerActions}>
          <StatusTag kind="muted" variant="tag">
            {statusLabel}
          </StatusTag>
          {editable || canWriteContract || canWriteEntries ? (
            <Button
              type="button"
              variant="primary"
              pending={isExecuting}
              disabled={dirtyCount === 0 || errorCellCount > 0}
              disabledReason={errorCellCount > 0 ? `오류 ${errorCellCount}칸 · 고쳐야 저장됩니다` : saveDisabledReason}
              shortcut="Ctrl+S"
              onClick={handleSave}
            >
              일괄 저장{dirtyCount > 0 ? ` ${dirtyCount}` : ""}
            </Button>
          ) : null}
        </div>
      </div>

      {dirtyStorage.restorableCount > 0 ? (
        <p className={styles.restoreBanner}>
          {`저장 안 한 편집 ${dirtyStorage.restorableCount}칸`}
          <button type="button" className={styles.restoreAction} onClick={() => dirtyStorage.restore()}>
            복원
          </button>
          <button type="button" className={styles.restoreAction} onClick={() => dirtyStorage.discard()}>
            버림
          </button>
        </p>
      ) : null}

      {rejectionSummary ? <FormAlert>{rejectionSummary}</FormAlert> : null}

      <Table
        caption="견적 줄"
        columns={columns}
        rows={lines}
        getRowId={(row) => row.clientKey}
        groupBy={(row) => subcategoryLabel(row.subcategory)}
        emptyMessage="이 프로젝트에 견적 줄이 없습니다"
        emptyAction={editable ? { label: "첫 줄 만들기", shortcut: "Ctrl+Enter", onClick: () => addLine() } : undefined}
        enableGridKeyboard
        keyboard={{
          onDeleteRow: (row) => setDeleteConfirm({ clientKey: row.clientKey, itemName: row.itemName, quoteAmountKrw: row.quoteAmountKrw }),
          onNewRow: (row) => addLine(row),
          onDuplicateRow: (row) => duplicateLine(row.clientKey),
          onMoveRow: (row, direction) => moveLine(row.clientKey, direction),
          onSave: handleSave,
        }}
        onPasteAtCell={handlePasteAtCell}
        cellIssue={cellIssueFor}
        cellDirty={(row) => row.dirty}
        onRowTap={(row) => setSheetRowKey(row.clientKey)}
        footer={
          <tr>
            <td colSpan={columns.length} className={styles.footerCell}>
              {`합계 (공급가액 · ${lines.length}줄)`}
              {savedAt ? <span className={styles.savedTag}> 저장됨 {savedAt}</span> : null}
              {pasteWarning ? <span className={styles.pasteWarning}> {pasteWarning}</span> : null}
              {rejectionSummary ? <span className={styles.rejectionSummary}> {rejectionSummary}</span> : null}
            </td>
          </tr>
        }
      />

      {/* SYSTEM.md §7-9 개정 ⑬ — 견적 표 아래 힌트 줄(라벨 kbd 묶음), 폰에서 숨는다. */}
      {editable ? (
        <p className={styles.hintRow}>
          {QUOTE_HINT_ITEMS.map((item, index) => (
            <Fragment key={item.label}>
              {index > 0 ? " · " : ""}
              {item.label} <kbd>{item.keys}</kbd>
            </Fragment>
          ))}
        </p>
      ) : null}

      {editable && lines.length > 0 ? (
        <button type="button" className={styles.addLineButton} onClick={() => addLine()}>
          줄 추가
        </button>
      ) : null}

      <ConfirmDialog
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        title="견적 줄 삭제"
        subtitle={`${deleteConfirm?.itemName || "(항목명 없음)"} · ${deleteConfirm ? formatKrw(deleteConfirm.quoteAmountKrw) : "—"}`}
        resultLines={["보관함으로 옮겨짐 · 복원은 관리자"]}
        primary={{ label: "견적 줄 삭제", onConfirm: confirmDeleteLine }}
      />

      {openSheetRow ? (
        <RowSheet
          open
          onClose={() => setSheetRowKey(null)}
          title={openSheetRow.itemName || "(항목명 없음)"}
          subtitle={`${subcategoryLabel(openSheetRow.subcategory)} · ${vendorLabel(openSheetRow.vendorId)}`}
          items={[
            { label: "수량", value: openSheetRow.quantity },
            { label: "단가", value: formatKrw(openSheetRow.unitPriceAmountKrw) },
            { label: "견적가", value: formatKrw(openSheetRow.quoteAmountKrw) },
            { label: "차익", value: formatKrw(openSheetRow.profitKrw) },
            {
              label: "환율",
              value:
                formatForeignLine({
                  currency: openSheetRow.unitPriceCurrency,
                  amount: openSheetRow.unitPriceAmount,
                  fxRate: openSheetRow.unitPriceFxRate,
                }) ?? "—",
            },
            { label: "비고", value: openSheetRow.note ?? "—" },
            { label: "상태", value: LINE_STATUS_LABELS[openSheetRow.lineStatus] ?? openSheetRow.lineStatus },
          ]}
        />
      ) : null}

      <RevenueSection
        contractDraft={contractDraft}
        onContractChange={updateContract}
        contractError={contractError}
        contractVatKrw={contractVat.vatKrw}
        contractTotalKrw={contractVat.totalKrw}
        canWriteContract={canWriteContract}
        issuedEntries={issuedEntries}
        paidEntries={paidEntries}
        onIssuedChange={updateIssued}
        onPaidChange={updatePaid}
        onAddIssued={addIssued}
        onAddPaid={addPaid}
        canWriteEntries={canWriteEntries}
        balanceKrw={balanceKrw}
      />
    </>
  );
}

