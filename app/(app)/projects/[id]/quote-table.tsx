"use client";

import { Children, Fragment, useCallback, useEffect, useEffectEvent, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useAction } from "next-safe-action/hooks";
import { useRouter } from "next/navigation";
import { saveProjectLedgerAction } from "../actions";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { StatusTag, type StatusTagKind } from "@/ui/status-tag/StatusTag";
import { Button } from "@/ui/button/Button";
import { FormAlert } from "@/ui/form-alert/FormAlert";
import { Table } from "@/ui/table/Table";
import { Select } from "@/ui/select/Select";
import { RowSheet } from "@/ui/table/RowSheet";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { Toast } from "@/ui/toast/Toast";
import { useDirtyStorage } from "@/ui/table/use-dirty-storage";
import { applyPaste, type PasteColumn } from "@/ui/table/use-clipboard-paste";
import { normalizeNumericPaste } from "@/ui/table/parse-tsv";
import { formatKrw, formatForeignLine, formatQuantity, parseNumberInput, type NumberInputKind } from "@/lib/format-number";
import { useCommaInput } from "@/ui/input/use-comma-input";
import type { TableColumn, CellIssue } from "@/ui/table/types";
import type { QuoteLineDto, QuoteLineBaseline } from "@/domain/quotes/lines";
import {
  QUOTE_LINE_STATUSES,
  visibleHintKeys,
  type QuoteCellEditability,
  type QuoteHintKey,
  type QuoteLineField,
  type QuoteLineStatus,
  type QuoteTableEmptyState,
  type StructuralEditability,
} from "@/domain/quotes/edit-scope";
import type { RevenueDto } from "@/domain/revenue";
import type { Currency, Money } from "@/domain/money";
import { RevenueSection, type ContractDraft, type EntryDraft } from "./revenue-section";
import { StatusChange, type StatusChangeProps } from "./status-change";
import { PeriodField, periodText, type PeriodDraft, type PeriodFieldError } from "./period-field";
import type { PeriodRights } from "@/domain/projects/period";
import {
  PreEstimateField,
  fxRateTouched,
  parsePreEstimateDraft,
  preEstimateDirtyCount,
  preEstimateDraftFrom,
  preEstimateText,
  type PreEstimateDraft,
  type PreEstimateFieldError,
} from "./pre-estimate-field";
import type { ProjectStatus } from "@/domain/projects/status-transitions";
import styles from "./project-detail.module.css";

export type QuoteTableOption = { id: string; name: string };
export type QuoteTableCodeOption = { value: string; label: string };

type DraftLine = {
  clientKey: string;
  id?: string;
  /** 04-30(ENG-D10) — 화면이 만든 uuid로 아직 저장되지 않은 줄. 재전송에도 같은 id를 싣는다. */
  isNew?: true;
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
  /** 04-30(D-78) — 칸별 편집 단계. 기존 줄은 서버 DTO, 저장 전 새 줄은 서버가 넘긴 새 줄 판정. */
  cells: Record<QuoteLineField, QuoteCellEditability>;
  /** 04-30(D-66 · DR-35) — 연결 문서가 있는 줄의 읽기 전용 이유(서버 DTO). */
  hasLinkedDocuments: boolean;
  readonlyReason: string | null;
};

type LineCells = Record<QuoteLineField, QuoteCellEditability>;

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

// 04-30(DR-35) — 편집기가 있는 표 열 key → 셀 단계 칸.
const COLUMN_TO_FIELD: Record<string, QuoteLineField> = {
  subcategory: "subcategory",
  itemName: "itemName",
  vendor: "vendorId",
  quantity: "quantity",
  unitPrice: "unitPrice",
  execution: "execution",
  note: "note",
};

// 04-22(A-34) — 기간 칸이 닫히면 포커스가 돌아올 3차 「기간 바꾸기」.
const PERIOD_TRIGGER_ID = "period-open";
const PRE_ESTIMATE_TRIGGER_ID = "pre-estimate-open";

// 충돌 이유 문자열 끝의 행동 글자 — 셀에서는 이 둘이 3차 버튼으로 그려진다.
const CONFLICT_ACTIONS_SUFFIX = " · 덮어쓰기 / 그 값으로";

// 04-28(C-07 ② · DR-31) — 견적 표 힌트 줄. 지금 실제로 되는 키만 적는다 —
// Tab 편집 이동·Ctrl+C 복사는 04-19가 배선하며 여기 더한다. 저장은 1차 버튼
// kbd가 말하므로 적지 않는다.
// 04-30 — 항목마다 key를 두어 구조 가능성으로 거른다(visibleHintKeys).
const QUOTE_HINT_ITEMS: { key: QuoteHintKey; label: string; keys: string }[] = [
  { key: "move", label: "이동", keys: "↑↓←→" },
  { key: "paste", label: "붙여넣기", keys: "Ctrl+V" },
  { key: "cancel", label: "취소", keys: "Esc" },
  { key: "newRow", label: "새 줄", keys: "Ctrl+Enter" },
  { key: "moveRow", label: "줄 이동", keys: "Alt+↑↓" },
  { key: "duplicateRow", label: "줄 복제", keys: "Ctrl+D" },
];

const LINE_STATUS_LABELS: Record<QuoteLineStatus, string> = {
  not_started: "미착수",
  cancelled: "취소",
};

function lineStatusLabel(value: string): string {
  const status = QUOTE_LINE_STATUSES.find((candidate) => candidate === value);
  return status ? LINE_STATUS_LABELS[status] : value;
}

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
    cells: dto.cellEditability,
    hasLinkedDocuments: dto.hasLinkedDocuments,
    readonlyReason: dto.readonlyReason,
  };
}

// 04-30(ENG-D10) — 새 줄은 만들 때 화면 uuid를 id로 붙인다(재전송·미저장 보관 키도 이 id). 복원은 보관된 id를 넘긴다.
function newDraftLine(defaultSubcategory: string, cells: LineCells, id: string = crypto.randomUUID()): DraftLine {
  return {
    clientKey: id,
    id,
    isNew: true,
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
    // 새 줄(isNew)은 baseline이 저장 시 쓰이지 않는다 — 로드된 값이
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
    cells,
    hasLinkedDocuments: false,
    readonlyReason: null,
  };
}

// 04-22(D-68) — 미저장 보관본의 모양. 기존 줄은 `{줄 id}:{열 키}` → 값, 새 줄은
// `{화면 uuid}:new` → 줄 전체(04-30 — ENG-D10), 기간 칸은 `period:start`·`period:end`,
// 총 매출 예상가 칸(04-44)은 `preEstimate:amount`·`preEstimate:currency`·`preEstimate:fxRate`(칸 글자 그대로).
type StoredUnitPrice = { amount: number; currency: Currency; fxRate: number };
type StoredNewLine = {
  subcategory: string;
  itemName: string;
  vendorId: string | null;
  quantity: number;
  unitPrice: StoredUnitPrice;
  execution: number;
  lineStatus: string;
  note: string | null;
};

function editsSnapshot(
  lines: DraftLine[],
  period: PeriodDraft | null,
  periodBase: { startDate: string | null; endDate: string | null },
  preEstimate: PreEstimateDraft | null,
  preEstimateBase: PreEstimateDraft | null,
): Record<string, unknown> {
  const edits: Record<string, unknown> = {};
  for (const line of lines) {
    const unitPrice: StoredUnitPrice = { amount: line.unitPriceAmount, currency: line.unitPriceCurrency, fxRate: line.unitPriceFxRate };
    if (line.isNew || !line.id) {
      const stored: StoredNewLine = {
        subcategory: line.subcategory,
        itemName: line.itemName,
        vendorId: line.vendorId,
        quantity: line.quantity,
        unitPrice,
        execution: line.executionAmount,
        lineStatus: line.lineStatus,
        note: line.note,
      };
      edits[`${line.clientKey}:new`] = stored;
      continue;
    }
    const base = line.baseline;
    if (line.subcategory !== base.subcategory) edits[`${line.id}:subcategory`] = line.subcategory;
    if (line.itemName !== base.itemName) edits[`${line.id}:itemName`] = line.itemName;
    if (line.vendorId !== base.vendorId) edits[`${line.id}:vendor`] = line.vendorId;
    if (line.quantity !== base.quantity) edits[`${line.id}:quantity`] = line.quantity;
    if (line.unitPriceAmountKrw !== base.unitPriceAmountKrw) edits[`${line.id}:unitPrice`] = unitPrice;
    if (line.executionAmount !== base.executionAmountKrw) edits[`${line.id}:execution`] = line.executionAmount;
    if (line.lineStatus !== base.lineStatus) edits[`${line.id}:status`] = line.lineStatus;
    if (line.note !== base.note) edits[`${line.id}:note`] = line.note;
  }
  if (period) {
    if (period.start !== (periodBase.startDate ?? "")) edits["period:start"] = period.start;
    if (period.end !== (periodBase.endDate ?? "")) edits["period:end"] = period.end;
  }
  if (preEstimate && preEstimateBase) {
    if (preEstimate.amount !== preEstimateBase.amount) edits["preEstimate:amount"] = preEstimate.amount;
    if (preEstimate.currency !== preEstimateBase.currency) edits["preEstimate:currency"] = preEstimate.currency;
    if (preEstimate.currency !== "KRW" && preEstimate.fxRate !== preEstimateBase.fxRate) edits["preEstimate:fxRate"] = preEstimate.fxRate;
  }
  return edits;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readUnitPrice(value: unknown): StoredUnitPrice | null {
  if (!isRecord(value)) return null;
  const { amount, currency, fxRate } = value;
  if (typeof amount !== "number" || typeof fxRate !== "number" || (currency !== "KRW" && currency !== "USD")) return null;
  return { amount, currency, fxRate };
}

function unitPricePatch(price: StoredUnitPrice): Partial<DraftLine> {
  return {
    unitPriceAmount: price.amount,
    unitPriceCurrency: price.currency,
    unitPriceFxRate: price.fxRate,
    unitPriceAmountKrw: price.currency === "KRW" ? price.amount : Math.round(price.amount * price.fxRate),
  };
}

// 보관본의 한 칸을 그 줄의 patch로. 모양이 맞지 않는 값(이전 버전이 쓴 값)은 버린다.
function restoredCellPatch(column: string, value: unknown): Partial<DraftLine> | null {
  switch (column) {
    case "subcategory":
      return typeof value === "string" ? { subcategory: value } : null;
    case "itemName":
      return typeof value === "string" ? { itemName: value } : null;
    case "vendor":
      return typeof value === "string" || value === null ? { vendorId: value } : null;
    case "quantity":
      return typeof value === "number" ? { quantity: value } : null;
    case "unitPrice": {
      const price = readUnitPrice(value);
      return price ? unitPricePatch(price) : null;
    }
    case "execution":
      return typeof value === "number" ? { executionAmount: value } : null;
    case "status":
      return typeof value === "string" ? { lineStatus: value } : null;
    case "note":
      return typeof value === "string" || value === null ? { note: value } : null;
    default:
      return null;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function restoredNewLine(value: unknown, defaultSubcategory: string, cells: LineCells, storedId: string): DraftLine | null {
  if (!isRecord(value)) return null;
  // 보관된 id가 화면 uuid면 그대로 쓴다 — 응답을 잃은 저장 뒤 복원해 다시 보내도 줄이 두 번 생기지 않는다.
  let line = newDraftLine(defaultSubcategory, cells, UUID_PATTERN.test(storedId) ? storedId : crypto.randomUUID());
  for (const [field, column] of [
    ["subcategory", "subcategory"],
    ["itemName", "itemName"],
    ["vendorId", "vendor"],
    ["quantity", "quantity"],
    ["unitPrice", "unitPrice"],
    ["execution", "execution"],
    ["lineStatus", "status"],
    ["note", "note"],
  ] as const) {
    const patch = restoredCellPatch(column, value[field]);
    if (patch) line = { ...line, ...patch };
  }
  return line;
}

// 「복원」 — 돌려받은 편집을 dirty 모양으로 병합한다(기존 줄 칸 덮기 · 새 줄 끝에 다시 만들기 · 기간 칸 값 ·
// 총 매출 예상가 칸 값).
function mergeRestoredEdits(
  lines: DraftLine[],
  edits: Record<string, unknown>,
  defaultSubcategory: string,
  newLineCells: LineCells,
): { lines: DraftLine[]; period: { start?: string; end?: string }; preEstimate: Partial<PreEstimateDraft> } {
  let next = lines;
  const added: DraftLine[] = [];
  const period: { start?: string; end?: string } = {};
  const preEstimate: Partial<PreEstimateDraft> = {};
  for (const [key, value] of Object.entries(edits)) {
    const cut = key.lastIndexOf(":");
    const owner = key.slice(0, cut);
    const column = key.slice(cut + 1);
    if (owner === "period") {
      if (typeof value === "string" && (column === "start" || column === "end")) period[column] = value;
      continue;
    }
    if (owner === "preEstimate") {
      if (typeof value !== "string") continue;
      if (column === "amount" || column === "fxRate") preEstimate[column] = value;
      if (column === "currency" && (value === "KRW" || value === "USD")) preEstimate.currency = value;
      continue;
    }
    if (column === "new") {
      const line = restoredNewLine(value, defaultSubcategory, newLineCells, owner);
      if (line) added.push(line);
      continue;
    }
    const patch = restoredCellPatch(column, value);
    if (!patch) continue;
    next = next.map((line) => (line.id === owner ? { ...line, ...patch, dirty: true } : line));
  }
  return { lines: [...next, ...added], period, preEstimate };
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

// DR-26 — 머리 줄의 복사·차수 작업 묶음 자리. 그룹 B의 「복사해 새 차수」(04-24)·「프로젝트 복사」
// (04-15)가 이 안에 버튼을 둔다. 폰(<700)에서는 자식이 있을 때만 2차 「더보기」로 접어 바로 아래 한
// 줄로 펼치고, PC에서는 버튼군 안에 그대로 보인다. 자식이 없으면 아무것도 그리지 않는다.
function HeaderCopyActions({ children }: { children?: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const groupId = useId();
  if (Children.toArray(children).length === 0) return null;
  return (
    <>
      <span className={styles.moreToggle}>
        <Button
          type="button"
          variant="secondary"
          aria-expanded={expanded}
          aria-controls={groupId}
          onClick={() => setExpanded((open) => !open)}
        >
          더보기
        </Button>
      </span>
      <div id={groupId} className={expanded ? `${styles.copyActions} ${styles.copyActionsOpen}` : styles.copyActions}>
        {children}
      </div>
    </>
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
  status,
  period,
  preEstimate,
  canSave,
  projectName,
  subtitle,
  statusSinceText,
  statusLabel,
  statusTagKind,
  statusChange,
  endDateNote,
  revisionId,
  initialLines,
  vendors,
  subcategories,
  structural,
  newLineCells,
  lockReason,
  lockLine,
  emptyState,
  revenue,
  canWriteContract,
  canWriteEntries,
  usdDefaultFxRate,
  contractVatKrw,
  contractTotalKrw,
}: {
  projectId: string;
  /** 화면이 본 상태 — 서버 값. */
  status: ProjectStatus;
  /** 04-22(S13) — 기간 칸. 권리는 서버가 판정한다(periodEditRights). */
  period: { startDate: string | null; endDate: string | null; rights: PeriodRights; todayKst: string };
  /** 04-44(S17) — 총 매출 예상가. 값은 quote.amount를 볼 수 없으면 null, 권리는 서버가 판정한다(기간과 같은 권리 + 노출). */
  preEstimate: { value: Money | null; canEdit: boolean };
  /** 04-22(A-12) — 1차 「일괄 저장」 렌더 조건(서버 계산). */
  canSave: boolean;
  projectName: string;
  /** `{번호} · 상세 견적 {n}차` — 서버가 만든다. */
  subtitle: string;
  /** `{상태} {마지막 변경일}`(D-50) — 부제 마지막 항목. 총 매출 예상가 뒤에 온다(UI-SPEC S3). */
  statusSinceText: string;
  statusLabel: string;
  statusTagKind: StatusTagKind;
  statusChange: StatusChangeProps | null;
  /** D-81 `종료일 지남`(또는 `· 팀장 {이름}`) — 서버가 만든다. 없으면 null. */
  endDateNote: string | null;
  revisionId: string;
  initialLines: QuoteLineDto[];
  vendors: QuoteTableOption[];
  subcategories: QuoteTableCodeOption[];
  /** 04-30(사용자 D10) — 줄 구조 편집 가능성(서버 structuralEditability). */
  structural: StructuralEditability;
  /** 04-30(사용자 D12) — 저장 전 새 줄의 칸별 편집 단계(서버 lineCellEditability isNewLine). */
  newLineCells: LineCells;
  /** 04-30(DR-2 · DR-35) — 잠긴 셀 편집 시도의 이유(서버 quoteLockReason). */
  lockReason: string | null;
  /** 04-30(DR-2) — 표 위 잠김 줄(서버 tableLockLine). 없으면 null. */
  lockLine: string | null;
  /** 04-30 — 0줄 표의 한 줄과 다음 한 수(서버 quoteTableEmptyState). */
  emptyState: QuoteTableEmptyState;
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
  const [deleteConfirm, setDeleteConfirm] = useState<{
    clientKey: string;
    itemName: string;
    quoteAmountKrw: number;
    linked: boolean;
  } | null>(null);
  // 04-30(D-56) — 보관할 저장된 줄 id. 한 줄이 dirty 한 건이고 일괄 저장 때 보관된다.
  const [archivedLineIds, setArchivedLineIds] = useState<string[]>([]);
  // 04-30(DR-35) — 잠긴·읽기 전용 셀 편집 시도의 이유 한 줄(포커스가 셀을 떠나면 지운다).
  const [blockedReason, setBlockedReason] = useState<{ clientKey: string; columnKey: string; message: string } | null>(null);
  const [sheetRowKey, setSheetRowKey] = useState<string | null>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);
  // 04-22(S13) — 기간 칸. 기준값은 서버 렌더 값 또는 직전 저장 결과(엔지 리뷰 A §1 P1).
  const [periodBaseline, setPeriodBaseline] = useState({ startDate: period.startDate, endDate: period.endDate });
  const [periodDraft, setPeriodDraft] = useState<PeriodDraft | null>(null);
  const [periodFocus, setPeriodFocus] = useState<"start" | "end">("start");
  const [periodErrors, setPeriodErrors] = useState<PeriodFieldError[]>([]);
  const [periodSaved, setPeriodSaved] = useState(false);
  // 04-44(S17) — 총 매출 예상가 칸. 기준값은 서버 렌더 값 또는 직전 저장 결과(나중 저장이 이긴다 — 기준값 검사 없음).
  const [preEstimateBase, setPreEstimateBase] = useState<Money | null>(preEstimate.value);
  const [preEstimateDraft, setPreEstimateDraft] = useState<PreEstimateDraft | null>(null);
  const [preEstimateSaved, setPreEstimateSaved] = useState(false);
  const [preEstimateErrors, setPreEstimateErrors] = useState<PreEstimateFieldError[]>([]);
  // 리뷰 S5 — 저장이 상태를 바꾸면(정산 → 진행) router.refresh가 오기 전의 다음 저장도 새 상태를 싣는다.
  const [seenStatus, setSeenStatus] = useState(status);
  const router = useRouter();
  // 04-22(D-68) — 사용자가 칸을 바꾼 순간에만 보관본을 쓴다. 편집 핸들러가 켜고, 상태가
  // 반영된 뒤 효과가 현재 편집 전체를 쓴다. 서버 값으로 다시 그리는 경로는 켜지 않는다.
  const persistPendingRef = useRef(false);

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
      if (data && "statusChanged" in data) {
        // DR-6 — 보관본을 지우지 않은 채 서버가 새 상태·셀 단계·컨트롤을 다시 보내게 한다.
        router.refresh();
        return;
      }
      if (data && "rejected" in data) {
        applyRejectedCells(data.rejected.cells);
        return; // 전부 거부 — 줄 교체·저장됨·보관본 지우기를 하지 않는다.
      }
      if (data && "periodRejected" in data) {
        setPeriodErrors(data.periodRejected.errors);
        setPreEstimateErrors(data.periodRejected.preEstimateErrors);
        return; // 기간 칸 오류로 전부 거부.
      }
      if (data && "preEstimateRejected" in data) {
        setPreEstimateErrors(data.preEstimateRejected.errors);
        return; // 총 매출 예상가 칸 오류로 전부 거부.
      }
      if (data?.quoteLines?.lines) {
        setLines(data.quoteLines.lines.map(fromDto));
        setArchivedLineIds([]);
      }
      if (data?.revenue) {
        setContractDraft(contractFromDto(data.revenue));
        if (data.revenue.issuedEntries !== undefined) setIssuedEntries(entriesFromDto(data.revenue.issuedEntries));
        if (data.revenue.paidEntries !== undefined) setPaidEntries(entriesFromDto(data.revenue.paidEntries));
        if (data.revenue.contract) setContractVat({ vatKrw: data.revenue.contract.vatKrw, totalKrw: data.revenue.contract.totalKrw });
        setBalanceKrw(data.revenue.balanceKrw);
      }
      if (data?.project) {
        const saved = data.project;
        setPeriodBaseline({ startDate: saved.startDate, endDate: saved.endDate });
        setPeriodErrors([]);
        setPreEstimateErrors([]);
        setSeenStatus(saved.status as ProjectStatus); // projects.status 열은 text — 값은 PROJECT_STATUSES 중 하나다.
        if (periodDraft) closePeriodFieldAfterSave();
        if (saved.preEstimate) setPreEstimateBase(saved.preEstimate);
        if (preEstimateDraft) closePreEstimateFieldAfterSave();
        // 상태가 바뀌었으면(정산 → 진행 등) 서버가 계산하는 태그·권리·canSave를 다시 받는다.
        if (saved.status !== status) router.refresh();
      }
      setSavedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }));
      dirtyStorage.clearAfterSave();
    },
  });

  // S13 — 저장 성공: 600ms --accent-weak 틴트 뒤 묶음이 닫힌다(prefers-reduced-motion이면 바로).
  function closePeriodFieldAfterSave() {
    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setPeriodDraft(null);
      return;
    }
    setPeriodSaved(true);
    window.setTimeout(() => {
      setPeriodSaved(false);
      setPeriodDraft(null);
    }, 600);
  }

  // S17 — 저장 성공: 기간 칸과 같은 600ms 틴트 뒤 닫힘(토스트 없음).
  function closePreEstimateFieldAfterSave() {
    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setPreEstimateDraft(null);
      return;
    }
    setPreEstimateSaved(true);
    window.setTimeout(() => {
      setPreEstimateSaved(false);
      setPreEstimateDraft(null);
    }, 600);
  }

  const preEstimateBaselineDraft = useMemo(
    () => (preEstimateBase ? preEstimateDraftFrom(preEstimateBase, usdDefaultFxRate) : null),
    [preEstimateBase, usdDefaultFxRate],
  );
  const preEstimateDirty =
    preEstimateDraft && preEstimateBaselineDraft ? preEstimateDirtyCount(preEstimateDraft, preEstimateBaselineDraft) : 0;

  function openPreEstimateField() {
    setPreEstimateDraft((prev) => prev ?? preEstimateBaselineDraft);
  }

  function changePreEstimate(next: PreEstimateDraft) {
    persistPendingRef.current = true;
    setPreEstimateErrors([]);
    setPreEstimateDraft(next);
  }

  // S17 — Esc는 편집 중 값을 되돌리고, 칸이 모두 원래 값이면 묶음을 닫는다(기간 칸과 같은 규칙).
  function escapePreEstimate() {
    persistPendingRef.current = true;
    setPreEstimateErrors([]);
    setPreEstimateDraft(preEstimateDirty > 0 ? preEstimateBaselineDraft : null);
  }

  // 묶음이 닫히면 포커스가 「총 매출 예상가 바꾸기」로 돌아온다.
  const preEstimateWasOpenRef = useRef(false);
  useEffect(() => {
    if (preEstimateDraft) {
      preEstimateWasOpenRef.current = true;
    } else if (preEstimateWasOpenRef.current) {
      preEstimateWasOpenRef.current = false;
      document.getElementById(PRE_ESTIMATE_TRIGGER_ID)?.focus();
    }
  }, [preEstimateDraft]);

  // 04-44의 상태 모달 3차 · 04-30의 EMPTY 「기간 바꾸기」가 이 함수로 칸을 연다.
  function openPeriodField(focus: "start" | "end") {
    setPeriodFocus(focus);
    setPeriodDraft((prev) => prev ?? { start: periodBaseline.startDate ?? "", end: periodBaseline.endDate ?? "" });
    // 칸이 이미 열려 있으면 PeriodField의 포커스 effect가 다시 돌지 않는다 — 그 칸으로 바로 간다.
    document.getElementById(`period-${focus}`)?.focus();
  }

  // A-34 — 묶음이 닫히면 포커스가 그 칸을 연 3차로 돌아온다.
  const periodWasOpenRef = useRef(false);
  useEffect(() => {
    if (periodDraft) {
      periodWasOpenRef.current = true;
    } else if (periodWasOpenRef.current) {
      periodWasOpenRef.current = false;
      document.getElementById(PERIOD_TRIGGER_ID)?.focus();
    }
  }, [periodDraft]);

  const periodBaselineDraft: PeriodDraft = { start: periodBaseline.startDate ?? "", end: periodBaseline.endDate ?? "" };
  const periodDirtyCount = periodDraft
    ? (periodDraft.start !== periodBaselineDraft.start ? 1 : 0) + (periodDraft.end !== periodBaselineDraft.end ? 1 : 0)
    : 0;

  function changePeriod(next: PeriodDraft) {
    persistPendingRef.current = true;
    setPeriodErrors([]);
    setPeriodDraft(next);
  }

  // S13 — Esc는 편집 중 값을 되돌리고, 두 칸이 모두 원래 값이면 묶음을 닫는다.
  function escapePeriod() {
    persistPendingRef.current = true;
    if (periodDirtyCount > 0) {
      setPeriodDraft(periodBaselineDraft);
      setPeriodErrors([]);
      return;
    }
    setPeriodErrors([]);
    setPeriodDraft(null);
  }

  const quoteLinesDirtyCount = lines.filter((line) => line.dirty).length + archivedLineIds.length;
  const issuedDirtyCount = (issuedEntries ?? []).filter((entry) => entry.dirty).length;
  const paidDirtyCount = (paidEntries ?? []).filter((entry) => entry.dirty).length;
  const contractDirtyCount = contractDraft.dirty ? 1 : 0;
  const dirtyCount =
    quoteLinesDirtyCount + issuedDirtyCount + paidDirtyCount + contractDirtyCount + periodDirtyCount + preEstimateDirty;
  const dirtyStorage = useDirtyStorage(projectId, revisionId, dirtyCount);

  const { persist } = dirtyStorage;
  useEffect(() => {
    if (!persistPendingRef.current) return;
    persistPendingRef.current = false;
    persist(editsSnapshot(lines, periodDraft, periodBaseline, preEstimateDraft, preEstimateBaselineDraft));
  }, [lines, periodDraft, periodBaseline, preEstimateDraft, preEstimateBaselineDraft, persist]);

  // DR-6 — 상태 바뀜 거부 뒤 router.refresh()가 새 status를 내려보내면 화면 편집(줄·매출·기간 칸)을
  // 서버 props로 되돌리고 보관본의 칸 수를 다시 읽어 복원 줄을 띄운다. 기간 저장 성공으로 상태가
  // 바뀐 경우도 여기를 지나지만 저장 성공이 이미 보관본을 지웠으므로 복원 줄이 없다.
  const [renderedStatus, setRenderedStatus] = useState(status);
  if (renderedStatus !== status) {
    setRenderedStatus(status);
    setSeenStatus(status);
    setLines(initialLines.map(fromDto));
    setArchivedLineIds([]);
    setContractDraft(contractFromDto(revenue));
    setIssuedEntries(entriesFromDto(revenue.issuedEntries));
    setPaidEntries(entriesFromDto(revenue.paidEntries));
    setContractVat({ vatKrw: contractVatKrw, totalKrw: contractTotalKrw });
    setBalanceKrw(revenue.balanceKrw);
    setPeriodBaseline({ startDate: period.startDate, endDate: period.endDate });
    setPeriodDraft(null);
    setPeriodErrors([]);
    setPreEstimateBase(preEstimate.value);
    setPreEstimateDraft(null);
    setPreEstimateErrors([]);
    dirtyStorage.recount();
  }

  function restoreEdits() {
    const edits = dirtyStorage.restore();
    if (!edits) return;
    const restored = mergeRestoredEdits(lines, edits, subcategories[0]?.value ?? "", newLineCells);
    setLines(restored.lines);
    if (restored.period.start !== undefined || restored.period.end !== undefined) {
      setPeriodFocus(restored.period.start !== undefined ? "start" : "end");
      setPeriodDraft({
        start: restored.period.start ?? periodBaseline.startDate ?? "",
        end: restored.period.end ?? periodBaseline.endDate ?? "",
      });
    }
    if (preEstimateBaselineDraft && Object.keys(restored.preEstimate).length > 0) {
      setPreEstimateDraft({ ...preEstimateBaselineDraft, ...restored.preEstimate });
    }
  }
  // 해소되지 않은 충돌 칸도 함께 센다 — 충돌이 남은 채 서버를 부르지 않는다.
  const errorCellCount = lines.reduce(
    (sum, line) => sum + Object.keys(line.cellErrors).length + Object.keys(line.cellConflicts).length,
    0,
  );

  function updateLine(clientKey: string, patch: Partial<DraftLine>) {
    persistPendingRef.current = true;
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
      persistPendingRef.current = true;
      setLines((prev) => [...prev, newDraftLine(inheritedSubcategory, newLineCells)]);
    },
    [subcategories, newLineCells],
  );

  function duplicateLine(clientKey: string) {
    persistPendingRef.current = true;
    setLines((prev) => {
      const source = prev.find((line) => line.clientKey === clientKey);
      if (!source) return prev;
      const copy: DraftLine = {
        ...newDraftLine(source.subcategory, newLineCells),
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
    persistPendingRef.current = true;
    setLines((prev) => {
      const index = prev.findIndex((line) => line.clientKey === clientKey);
      if (index === -1) return prev;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const moved = next[index]!;
      const neighbor = next[targetIndex]!;
      const neighborGroup = neighbor.subcategory;
      next.splice(index, 1);
      const crossedGroup = moved.subcategory !== neighborGroup;
      next.splice(targetIndex, 0, { ...moved, subcategory: crossedGroup ? neighborGroup : moved.subcategory, dirty: true, moved: true });
      // 04-30(A-03) — 자리를 바꾼 두 줄이 모두 dirty다.
      next[index] = { ...neighbor, dirty: true, moved: true };
      return next;
    });
  }

  // 04-30(D-56 · DR-12) — 저장된 줄은 화면에서 빼고 보관할 id로(dirty 한 건), 연결 문서가 있는 줄은 상태만 취소,
  // 아직 저장되지 않은 새 줄은 그냥 뺀다.
  function confirmDeleteLine() {
    if (!deleteConfirm) return;
    persistPendingRef.current = true;
    const target = lines.find((line) => line.clientKey === deleteConfirm.clientKey);
    if (target?.hasLinkedDocuments) {
      updateLine(target.clientKey, { lineStatus: "cancelled" });
    } else {
      setLines((prev) => prev.filter((line) => line.clientKey !== deleteConfirm.clientKey));
      const archivedId = target?.isNew ? undefined : target?.id;
      if (archivedId) setArchivedLineIds((prev) => [...prev, archivedId]);
    }
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
    // 04-30(엔지 리뷰 A §2 P2) — 순서는 두 가지로만 보낸다: 줄 이동·가운데 삽입·복제가 있으면 활성 줄 전체의 표시
    // 순서를 한 번, 아니면 싣지 않는다(서버가 새 줄을 끝에 붙인다). 보관할 줄은 이미 lines에서 빠져 있다.
    const needsOrder = lines.some(
      (line, index) => line.moved === true || (line.isNew === true && lines.slice(index + 1).some((after) => !after.isNew)),
    );
    const order = needsOrder ? lines.flatMap((line) => (line.id ? [line.id] : [])) : undefined;

    execute({
      projectId,
      seenStatus,
      period:
        periodDraft && periodDirtyCount > 0
          ? {
              startDate: periodDraft.start.trim() || null,
              endDate: periodDraft.end.trim() || null,
              baseline: periodBaseline,
            }
          : undefined,
      preEstimate:
        preEstimateDraft && preEstimateBaselineDraft && preEstimateDirty > 0
          ? {
              ...parsePreEstimateDraft(preEstimateDraft),
              fxRateTouched: fxRateTouched(preEstimateDraft, preEstimateBaselineDraft),
            }
          : undefined,
      quoteLines:
        dirtyLines.length > 0 || archivedLineIds.length > 0
          ? {
              revisionId,
              order,
              archivedLineIds: archivedLineIds.length > 0 ? archivedLineIds : undefined,
              rows: dirtyLines.map((line) => ({
                id: line.id,
                isNew: line.isNew,
                version: line.isNew ? undefined : line.version,
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
                // 04-12(A-37) — 서버가 줄 상태를 QUOTE_LINE_STATUSES로 검증한다(화면 타입 좁히기는 04-30).
                lineStatus: line.lineStatus as QuoteLineStatus,
                note: line.note ?? undefined,
                baseline: line.isNew ? undefined : { ...line.baseline, lineStatus: line.baseline.lineStatus as QuoteLineStatus },
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

  // 04-30(엔지 r2 분할안) — 키보드 Ctrl+S는 표가 열린 셀 편집기를 먼저 커밋(blur)한 뒤 부른다. 그 커밋이
  // 상태에 반영된 다음 렌더에서 저장해야 활성 셀의 마지막 값이 페이로드에 든다.
  const [saveRequests, setSaveRequests] = useState(0);
  const saveAfterCommit = useEffectEvent(() => handleSave());
  useEffect(() => {
    if (saveRequests > 0) saveAfterCommit();
  }, [saveRequests]);

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
      editability: (row) => row.cells.subcategory,
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
      editability: (row) => row.cells.itemName,
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
      editability: (row) => row.cells.vendorId,
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
      editability: (row) => row.cells.quantity,
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
      editability: (row) => row.cells.unitPrice,
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
      editability: (row) => row.cells.execution,
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
      cell: (row) => lineStatusLabel(row.lineStatus),
    },
    {
      key: "note",
      header: "비고",
      priority: "p3",
      editability: (row) => row.cells.note,
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
        isEditable: (row) => row.cells.subcategory === "edit",
      },
      { key: "itemName", kind: "text", isEditable: (row) => row.cells.itemName === "edit" },
      {
        key: "vendor",
        kind: "select",
        options: vendors.map((option) => ({ value: option.id, label: option.name })),
        isEditable: (row) => row.cells.vendorId === "edit",
      },
      { key: "quantity", kind: "number", isEditable: (row) => row.cells.quantity === "edit" },
      { key: "unitPrice", kind: "number", isEditable: (row) => row.cells.unitPrice === "edit" },
      { key: "quoteAmount", kind: "text", isEditable: () => false },
      { key: "execution", kind: "number", isEditable: (row) => row.cells.execution === "edit" },
      { key: "profit", kind: "text", isEditable: () => false },
      { key: "status", kind: "text", isEditable: () => false },
      { key: "note", kind: "text", isEditable: (row) => row.cells.note === "edit" },
    ],
    [subcategories, vendors],
  );

  // 04-30(DR-35) — 잠긴 셀은 표 위 한 줄과 같은 이유(quoteLockReason), 읽기 전용 셀은 연결 문서 이유(DTO).
  // 이유가 없는 잠김은 아무것도 띄우지 않는다(DR-22).
  function blockedReasonFor(row: DraftLine, columnKey: string): string | null {
    const field = COLUMN_TO_FIELD[columnKey];
    if (!field) return null;
    const level = row.cells[field];
    if (level === "locked") return lockReason;
    if (level === "readonly") return row.readonlyReason;
    return null;
  }

  function showBlockedReason(row: DraftLine, columnKey: string) {
    const message = blockedReasonFor(row, columnKey);
    if (!message) return;
    setBlockedReason({ clientKey: row.clientKey, columnKey, message });
    // 고정 오류가 아니다 — 포커스가 그 셀을 떠나면 지운다.
    document.activeElement?.addEventListener("focusout", () => setBlockedReason(null), { once: true });
  }

  function handlePasteAtCell(row: DraftLine, columnKey: string, clipboardText: string) {
    const rowIndex = lines.indexOf(row);
    const colIndex = pasteColumns.findIndex((column) => column.key === columnKey);
    if (rowIndex === -1 || colIndex === -1) return;

    const result = applyPaste({ clipboardText, columns: pasteColumns, rows: lines, activeRowIndex: rowIndex, activeColIndex: colIndex });
    // DR-35 — 잠긴·읽기 전용 셀에 떨어진 값의 오류 이유는 그 셀의 편집 시도 이유와 같은 문자열이다.
    const blockedReasons = new Map<string, string>();
    for (const cell of result.cells) {
      const target = lines[cell.rowIndex];
      const column = pasteColumns.find((candidate) => candidate.key === cell.columnKey);
      if (cell.result.status !== "error" || !target || !column || column.isEditable(target)) continue;
      const reason = blockedReasonFor(target, cell.columnKey);
      if (reason) blockedReasons.set(`${cell.rowIndex}:${cell.columnKey}`, reason);
    }

    persistPendingRef.current = true;
    setLines((prev) => {
      const next = [...prev];
      for (let i = 0; i < result.newRowsNeeded; i++) {
        next.push(newDraftLine(subcategories[0]?.value ?? "", newLineCells));
      }
      for (const cell of result.cells) {
        const target = next[cell.rowIndex];
        if (!target) continue;
        const cellErrors = { ...target.cellErrors };
        const cellConflicts = { ...target.cellConflicts };
        delete cellConflicts[cell.columnKey];
        if (cell.result.status === "error") {
          cellErrors[cell.columnKey] = blockedReasons.get(`${cell.rowIndex}:${cell.columnKey}`) ?? cell.result.reason;
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
    persistPendingRef.current = true;
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
    if (!conflict) {
      return blockedReason && blockedReason.clientKey === row.clientKey && blockedReason.columnKey === columnKey
        ? { kind: "reason", message: blockedReason.message }
        : undefined;
    }
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

  const saveDisabledReason = dirtyCount === 0 ? "바뀐 칸 없음" : undefined;

  // 04-04 — 서버가 돌려준 문자열을 그대로 쓴다(화면이 이유를 새로 만들지
  // 않는다, Task 2 acceptance criterion). errorCellCount>0이면 handleSave가
  // execute()를 아예 부르지 않으므로(클라이언트 게이트) result.serverError는
  // 그 경로에서 생기지 않는다 — 여기 남는 건 서버가 실제로 거부한 경우뿐이다.
  // F2 — next-safe-action의 validationErrors(예: 항목명 빈 값)는 serverError와
  // 달리 조용히 무시되고 있었다 — 같은 요약 자리에 일반 문구로 띄운다.
  // 04-28 — 거부 봉투가 있으면 그 요약(`충돌 N줄 · 전부 거부` / `오류 N칸 · 전부 거부`).
  const rejectedEnvelope = result.data && "rejected" in result.data ? result.data.rejected : undefined;
  // U-6 — 표 밖 칸(기간 · 총 매출 예상가) 오류로 전부 거부되면 합계 행에 그 칸 수를 붙인다.
  const outsideErrorCount =
    result.data && "periodRejected" in result.data
      ? result.data.periodRejected.errors.length + result.data.periodRejected.preEstimateErrors.length
      : result.data && "preEstimateRejected" in result.data
        ? result.data.preEstimateRejected.errors.length
        : 0;
  const periodRejectedSummary = outsideErrorCount > 0 ? `전부 거부 · 다른 칸 오류 ${outsideErrorCount}칸` : undefined;
  // DR-6 — 상태 바뀜 거부 문구(서버가 statusChangedMessage로 만든다). 다시 그린 뒤에도 남는다.
  const statusChangedSummary = result.data && "statusChanged" in result.data ? result.data.statusChanged.message : undefined;
  const rejectionSummary =
    rejectedEnvelope?.summary ??
    periodRejectedSummary ??
    statusChangedSummary ??
    result.serverError ??
    (result.validationErrors ? "저장하지 못했습니다 · 입력값을 확인하세요" : undefined);
  // F2 — 계약 금액(revenue.contract) 아래에 붙는 필드 오류만 <RevenueSection>에 넘긴다.
  const contractError = result.validationErrors?.revenue?.contract
    ? "저장하지 못했습니다 · 입력값을 확인하세요"
    : undefined;

  // 04-30(C-07) — 힌트 줄은 그 사람에게 실제로 되는 키만. 편집 셀이 없는 읽기 표에는 힌트 줄이 없다.
  const hintKeys = visibleHintKeys(
    QUOTE_HINT_ITEMS.map((item) => item.key),
    structural,
  );
  const hintItems = QUOTE_HINT_ITEMS.filter((item) => hintKeys.includes(item.key));

  const openSheetRow = sheetRowKey ? lines.find((line) => line.clientKey === sheetRowKey) : undefined;

  return (
    <>
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <PageHeader title={projectName} subtitle={subtitle} />
          {/* S13 — 칸이 열린 동안 기간 글자와 「기간 바꾸기」는 숨는다(같은 값을 두 번 보이지 않는다). */}
          {periodDraft ? null : (
            <p className={`${styles.periodLine} ${styles.periodLead}`}>
              <span>{periodText(periodBaseline.startDate, periodBaseline.endDate)}</span>
              {period.rights !== "none" ? (
                <Button id={PERIOD_TRIGGER_ID} type="button" variant="tertiary" onClick={() => openPeriodField("start")}>
                  기간 바꾸기
                </Button>
              ) : null}
            </p>
          )}
          {/* S17 — 금액을 볼 수 없으면 줄이 없다. 칸이 열린 동안 값과 3차는 숨는다. */}
          {preEstimateBase === null || preEstimateDraft ? null : (
            <p className={styles.periodLine}>
              <span>{preEstimateText(preEstimateBase)}</span>
              {preEstimate.canEdit ? (
                <Button id={PRE_ESTIMATE_TRIGGER_ID} type="button" variant="tertiary" onClick={openPreEstimateField}>
                  총 매출 예상가 바꾸기
                </Button>
              ) : null}
            </p>
          )}
          <p className={styles.periodLine}>{statusSinceText}</p>
        </div>
        <span className={styles.statusLine}>
          <StatusTag kind={statusTagKind} variant="tag">
            {statusLabel}
          </StatusTag>
          {endDateNote ? <span className={styles.endDateNote}>{endDateNote}</span> : null}
        </span>
        <div className={styles.headerActions}>
          <HeaderCopyActions />
          {statusChange ? (
            <StatusChange
              {...statusChange}
              dirtyCount={dirtyCount}
              onChanged={setStatusToast}
              onOpenPeriodField={openPeriodField}
            />
          ) : null}
          {canSave ? (
            <Button
              type="button"
              variant="primary"
              pending={isExecuting}
              disabled={dirtyCount === 0 || errorCellCount > 0}
              disabledReason={errorCellCount > 0 ? `오류 ${errorCellCount}칸 · 고쳐야 저장됩니다` : saveDisabledReason}
              reasonTone={errorCellCount > 0 ? "block" : "info"}
              shortcut="Ctrl+S"
              onClick={handleSave}
            >
              일괄 저장{dirtyCount > 0 ? ` ${dirtyCount}` : ""}
            </Button>
          ) : null}
        </div>
      </div>

      {periodDraft ? (
        <PeriodField
          draft={periodDraft}
          baseline={periodBaselineDraft}
          status={status}
          todayKst={period.todayKst}
          errors={periodErrors}
          focusField={periodFocus}
          saved={periodSaved}
          onChange={changePeriod}
          onEscape={escapePeriod}
          onSave={handleSave}
        />
      ) : null}

      {preEstimateDraft && preEstimateBaselineDraft ? (
        <PreEstimateField
          draft={preEstimateDraft}
          baseline={preEstimateBaselineDraft}
          serverErrors={preEstimateErrors}
          saved={preEstimateSaved}
          onChange={changePreEstimate}
          onEscape={escapePreEstimate}
          onSave={handleSave}
        />
      ) : null}

      {dirtyStorage.restorableCount > 0 ? (
        <p className={styles.restoreBanner}>
          {`저장 안 한 편집 ${dirtyStorage.restorableCount}칸`}
          <button type="button" className={styles.restoreAction} onClick={restoreEdits}>
            복원
          </button>
          <button type="button" className={styles.restoreAction} onClick={() => dirtyStorage.discard()}>
            버림
          </button>
        </p>
      ) : null}

      {/* 04-30(DR-31) — 표 위 한 줄 순서: 현재 차수 복원 줄 → (이전 차수 복원 줄 — 04-24) → 잠김 줄. */}
      {lockLine && lines.length > 0 ? <p className={styles.lockLine}>{lockLine}</p> : null}

      {rejectionSummary ? <FormAlert>{rejectionSummary}</FormAlert> : null}

      <Table
        caption="견적 줄"
        columns={columns}
        rows={lines}
        getRowId={(row) => row.clientKey}
        groupBy={(row) => subcategoryLabel(row.subcategory)}
        emptyMessage={emptyState.message}
        emptyAction={
          emptyState.action?.kind === "addLine"
            ? { label: emptyState.action.label, shortcut: "Ctrl+Enter", onClick: () => addLine() }
            : emptyState.action?.kind === "openPeriodEnd"
              ? { label: emptyState.action.label, onClick: () => openPeriodField("end") }
              : undefined
        }
        enableGridKeyboard
        // 04-30(사용자 D10) — 할 수 없는 구조 동작은 키도 무동작이다(서버 structuralEditability).
        keyboard={{
          onDeleteRow: structural.archive
            ? (row) =>
                setDeleteConfirm({
                  clientKey: row.clientKey,
                  itemName: row.itemName,
                  quoteAmountKrw: row.quoteAmountKrw,
                  linked: row.hasLinkedDocuments,
                })
            : undefined,
          onNewRow: structural.insert ? (row) => addLine(row) : undefined,
          onDuplicateRow: structural.duplicate ? (row) => duplicateLine(row.clientKey) : undefined,
          onMoveRow: structural.reorder ? (row, direction) => moveLine(row.clientKey, direction) : undefined,
          onSave: () => setSaveRequests((count) => count + 1),
        }}
        onBlockedEdit={showBlockedReason}
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
      {lines.some((line) => Object.values(line.cells).includes("edit")) ? (
        <p className={styles.hintRow}>
          {hintItems.map((item, index) => (
            <Fragment key={item.label}>
              {index > 0 ? " · " : ""}
              {item.label} <kbd>{item.keys}</kbd>
            </Fragment>
          ))}
        </p>
      ) : null}

      {structural.insert && lines.length > 0 ? (
        <button type="button" className={styles.addLineButton} onClick={() => addLine()}>
          줄 추가
        </button>
      ) : null}

      <ConfirmDialog
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        title={deleteConfirm?.linked ? "견적 줄 취소" : "견적 줄 삭제"}
        subtitle={`${deleteConfirm?.itemName || "(항목명 없음)"} · ${deleteConfirm ? formatKrw(deleteConfirm.quoteAmountKrw) : "—"}`}
        resultLines={[deleteConfirm?.linked ? "견적가 0 · 이력과 연결된 지출결의는 그대로" : "보관함으로 옮겨짐 · 복원은 관리자"]}
        primary={{ label: deleteConfirm?.linked ? "견적 줄 취소" : "견적 줄 삭제", onConfirm: confirmDeleteLine }}
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
            { label: "상태", value: lineStatusLabel(openSheetRow.lineStatus) },
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

      {statusToast ? <Toast message={statusToast} onDismiss={() => setStatusToast(null)} /> : null}
    </>
  );
}

