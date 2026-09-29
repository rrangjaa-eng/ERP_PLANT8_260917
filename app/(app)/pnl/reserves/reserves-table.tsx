"use client";

import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { saveReservesAction } from "./actions";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { Button } from "@/ui/button/Button";
import { Select } from "@/ui/select/Select";
import { Table } from "@/ui/table/Table";
import { Pagination } from "@/ui/pagination/Pagination";
import { pageRangeText } from "@/ui/pagination/page-window";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { Toast } from "@/ui/toast/Toast";
import { useDirtyStorage, viewerDirtyScope } from "@/ui/table/use-dirty-storage";
import { applyPaste, type PasteColumn } from "@/ui/table/use-clipboard-paste";
import { useEditableWidth } from "@/ui/table/use-editable-width";
import { LIST_PAGE_SIZE } from "@/lib/paging";
import { useCommaInput } from "@/ui/input/use-comma-input";
import { savedNoticeText, type FooterNoticeItem } from "@/ui/table/footer-notice";
import type { CellEditability, CellIssue, TableColumn } from "@/ui/table/types";
import { formatForeignLine, formatKrw, parseNumberInput, type NumberInputKind } from "@/lib/format-number";
import { toKrw, type Currency } from "@/domain/money";
import type {
  ReserveBalanceRejection,
  ReserveCellEditability,
  ReserveCellField,
  ReserveDirection,
  ReserveEntryDto,
  ReserveListResult,
  ReserveReferences,
} from "@/domain/reserves";
import styles from "./reserves.module.css";

// 04-42 — 클라이언트별 리저브 대장(S9). 셀 단계·잔액·클라이언트 잠금은 서버 DTO 그대로 그리고(T-04-43b), 화면은 편집을
// 행 id로 잡은 맵에 모아 1차 「일괄 저장」 한 번에 보낸다. 판정은 전부 04-07의 saveReserves다.

type Money = { currency: Currency; amount: number; fxRate: number };

type Row = {
  id: string;
  isNew: boolean;
  version: number;
  clientId: string;
  clientName: string;
  entryDate: string;
  direction: ReserveDirection;
  money: Money;
  /** 원화 환산 표시값 — 저장된 줄은 서버 값, 편집 중인 외화 줄은 금액 × 환율. */
  amountKrw: number;
  fxRateTouched: boolean;
  projectId: string | null;
  /** 04-42 리뷰 B1 · S1 — 서버가 실은 이름(보관된 프로젝트·비활성 코드도). 편집하면 선택지의 이름으로 바뀐다. */
  projectName: string | null;
  evidenceType: string | null;
  evidenceLabel: string | null;
  taxInvoiceNumber: string | null;
  note: string | null;
  /** 서버 계산 잔액 — 저장 전 새 줄은 없다. */
  balanceKrw: number | null;
  cells: Record<ReserveCellField, ReserveCellEditability>;
};

type EditableField =
  | "clientId"
  | "clientName"
  | "entryDate"
  | "direction"
  | "money"
  | "fxRateTouched"
  | "projectId"
  | "projectName"
  | "evidenceType"
  | "evidenceLabel"
  | "taxInvoiceNumber"
  | "note";
type Patch = Partial<Pick<Row, EditableField>>;
/** 기존 줄의 편집 — 처음 고친 순간의 서버 줄(base)과 바뀐 칸(patch). 쪽을 넘어가도 base로 저장 페이로드를 만든다(DR-18). */
type Edit = { base: Row; patch: Patch; /** 처음 고친 쪽 — 오류로 이동(DR-5)이 그 쪽으로 간다. */ page: number };

// 열 키 = 서버 셀 단계의 필드 이름(금액 열은 amount).
const COLUMN_FIELD: Record<string, EditableField | null> = {
  entryDate: "entryDate",
  direction: "direction",
  amount: "money",
  balanceKrw: null,
  projectId: "projectId",
  evidenceType: "evidenceType",
  taxInvoiceNumber: "taxInvoiceNumber",
  note: "note",
  clientId: "clientId",
};

// 서버 거부 칸 이름 → 열 키(환율은 금액 칸 안, 줄 전체 이유는 날짜 칸).
function columnForField(field: string): string {
  if (field === "fxRate" || field === "money") return "amount";
  if (field === "row" || !(field in COLUMN_FIELD)) return "entryDate";
  return field;
}

// 힌트 줄 — 이 화면에서 실제로 되는 키만(저장은 1차 kbd가 말한다).
const HINT_ITEMS = [
  { label: "이동", keys: "Tab ↑↓←→" },
  { label: "복사", keys: "Ctrl+C" },
  { label: "붙여넣기", keys: "Ctrl+V" },
  { label: "취소", keys: "Esc" },
  { label: "새 줄", keys: "Ctrl+Enter" },
  { label: "줄 삭제", keys: "Delete" },
];

const DIRECTION_OPTIONS: { value: ReserveDirection; label: string }[] = [
  { value: "deposit", label: "입금" },
  { value: "withdrawal", label: "출금" },
];

// 문구는 이 한 곳에 둔다(Copywriting — 리저브).
const COPY = {
  empty: "리저브 기록이 없습니다",
  emptyReadOnly: "리저브 기록이 없습니다 · 기록은 경영관리",
  addRow: "리저브 줄 추가",
  addRowShortcut: "Ctrl+Enter",
  noChange: "바뀐 칸 없음",
  deleteTitle: "리저브 줄 삭제",
  deleteResult: "보관함으로 옮겨짐 · 잔액 다시 계산",
  discarded: "편집을 버렸습니다",
  invalidInput: "저장 실패 · 입력값 확인",
  /** ui/table applyPaste의 잠김 셀 이유와 같은 문자열. */
  lockedPaste: "읽기 전용·잠김 셀에 값 떨어짐",
};

function rowFromDto(dto: ReserveEntryDto): Row {
  return {
    id: dto.id,
    isNew: false,
    version: dto.version,
    clientId: dto.clientId,
    clientName: dto.clientName,
    entryDate: dto.entryDate,
    direction: dto.direction,
    money: { currency: dto.amount.currency, amount: dto.amount.amount, fxRate: dto.amount.fxRate },
    amountKrw: dto.amount.amountKrw,
    fxRateTouched: false,
    projectId: dto.projectId,
    projectName: dto.projectName ?? null,
    evidenceType: dto.evidenceType,
    evidenceLabel: dto.evidenceLabel ?? null,
    taxInvoiceNumber: dto.taxInvoiceNumber,
    note: dto.note,
    balanceKrw: dto.balanceKrw,
    cells: dto.cellEditability,
  };
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function withPatch(row: Row, patch: Patch): Row {
  const next = { ...row, ...patch };
  // 리뷰 R6 — 서버와 같은 정수 스케일 환산(domain/money toKrw — 순수 함수라 클라이언트에서도 쓴다). 0.35 × 1,350 = 473.
  if (patch.money) next.amountKrw = toKrw(patch.money);
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// next-safe-action 검증 오류(formatted) 트리에서 첫 이유 한 줄.
function firstReason(node: unknown): string | null {
  if (!isRecord(node)) return null;
  const own = node._errors;
  if (Array.isArray(own) && typeof own[0] === "string") return own[0];
  for (const [key, child] of Object.entries(node)) {
    if (key === "_errors") continue;
    const found = firstReason(child);
    if (found) return found;
  }
  return null;
}

type CellErrors = Record<string, Record<string, string>>;

// 가장자리(zod) 검증 오류를 보낸 줄 순서로 칸 오류에 붙인다 — 모양이 아닌 id도 그 칸의 이유가 된다(04-07 리뷰 S3).
// 리뷰 R12 — 보관 요청(archived[i])의 오류는 그 줄의 줄 전체 이유 자리(날짜 칸 — 서버 봉투의 "row"와 같다)에 붙인다.
function validationCellErrors(errors: unknown, sentIds: string[], sentArchivedIds: string[]): CellErrors {
  const out: CellErrors = {};
  const rows = isRecord(errors) ? errors.rows : undefined;
  if (isRecord(rows)) {
    for (const [index, fields] of Object.entries(rows)) {
      const rowId = sentIds[Number(index)];
      if (rowId === undefined || !isRecord(fields)) continue;
      for (const [field, node] of Object.entries(fields)) {
        if (field === "_errors") continue;
        const reason = firstReason(node);
        if (reason) out[rowId] = { ...out[rowId], [columnForField(field)]: reason };
      }
    }
  }
  const archived = isRecord(errors) ? errors.archived : undefined;
  if (isRecord(archived)) {
    for (const [index, node] of Object.entries(archived)) {
      const rowId = sentArchivedIds[Number(index)];
      const reason = firstReason(node);
      if (rowId !== undefined && reason) out[rowId] = { ...out[rowId], [columnForField("row")]: reason };
    }
  }
  return out;
}

function countCells(errors: CellErrors): number {
  return Object.values(errors).reduce((sum, cells) => sum + Object.keys(cells).length, 0);
}

// 리뷰 S5 — 날짜 칸은 형식을 잡는 date 입력(매출 표 revenue-section 선례).
function TextEditCell({
  ariaLabel,
  initialValue,
  numeric,
  type = "text",
  onCommit,
}: {
  ariaLabel: string;
  initialValue: string;
  numeric?: boolean;
  type?: "text" | "date";
  onCommit: (value: string) => void;
}) {
  return (
    <input
      aria-label={ariaLabel}
      type={type}
      defaultValue={initialValue}
      autoFocus
      className={numeric ? styles.cellInputNumeric : styles.cellInput}
      onBlur={(event) => onCommit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onCommit(event.currentTarget.value);
        }
      }}
    />
  );
}

// 리뷰 S1 — 저장된 값이 선택지에 없으면(보관된 프로젝트 · 비활성 증빙 종류) 그 값을 한 칸으로 남기고, 바꾸지 않고 떠나면 커밋하지 않는다.
function SelectEditCell({
  id,
  ariaLabel,
  initialValue,
  initialLabel,
  options,
  onCommit,
  onCancel,
}: {
  id: string;
  ariaLabel: string;
  initialValue: string;
  initialLabel?: string | null;
  options: { value: string; label: string; description?: string | null }[];
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const stored = initialValue !== "" && !options.some((option) => option.value === initialValue);
  return (
    <Select
      id={id}
      aria-label={ariaLabel}
      defaultValue={initialValue}
      autoFocus
      onChange={(event) => onCommit(event.target.value)}
      onBlur={(event) => (event.currentTarget.value === initialValue ? onCancel() : onCommit(event.currentTarget.value))}
      options={stored ? [{ value: initialValue, label: initialLabel || initialValue }, ...options] : options}
      className={styles.cellSelect}
    />
  );
}

// 환율 칸 — 통화가 바뀌면 마운트·언마운트된다(quote-table.tsx FxRateEditInput과 같은 모양).
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
  useEffect(() => {
    onState({ raw: rawValue, error });
  }, [rawValue, error, onState]);
  return (
    <input
      ref={inputRef}
      aria-label="금액 환율"
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

// D-71 · CEO 리뷰 B-12 — 통화 · 금액 · (외화면) 환율. 견적 표 UnitPriceEditCell과 같은 모양: 금액은 타이핑 중 쉼표(04-09),
// 서버로는 쉼표 없는 값, USD 기본 환율은 설정의 최근 환율, 환율을 고친 줄만 fxRateTouched.
function MoneyEditCell({
  rowKey,
  initial,
  usdDefaultFxRate,
  onCommit,
}: {
  rowKey: string;
  initial: Money;
  usdDefaultFxRate: number;
  onCommit: (value: string) => void;
}) {
  const [currency, setCurrency] = useState<Currency>(initial.currency);
  const [fxRateTouched, setFxRateTouched] = useState(false);
  const [fxRateError, setFxRateError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fxRateRawRef = useRef(String(initial.fxRate));
  const amountKind: NumberInputKind = currency === "KRW" ? "krw" : "foreign";
  const {
    inputRef: amountInputRef,
    value: amountValue,
    onChange: amountOnChange,
    error: amountError,
    rawValue: amountRawValue,
  } = useCommaInput(amountKind, initial.amount === 0 ? "" : String(initial.amount));

  function commit() {
    const parsedAmount = parseNumberInput(amountRawValue);
    const amountValid = parsedAmount !== null && Number.isFinite(parsedAmount);
    const parsedFxRate = parseNumberInput(fxRateRawRef.current);
    const fxRate = currency === "KRW" ? 1 : parsedFxRate !== null && Number.isFinite(parsedFxRate) ? parsedFxRate : initial.fxRate;
    onCommit(JSON.stringify({ amount: amountValid ? parsedAmount : initial.amount, currency, fxRate, fxRateTouched }));
  }

  function handleBlur(event: React.FocusEvent<HTMLElement>) {
    const next = event.relatedTarget as Node | null;
    if (!next || !wrapRef.current?.contains(next)) commit();
  }

  return (
    <div ref={wrapRef}>
      <div className={styles.moneyRow}>
        <Select
          id={`reserve-currency-${rowKey}`}
          aria-label="금액 통화"
          value={currency}
          onChange={(event) => setCurrency(event.target.value === "USD" ? "USD" : "KRW")}
          onBlur={handleBlur}
          options={[
            { value: "KRW", label: "KRW" },
            { value: "USD", label: "USD" },
          ]}
          className={styles.cellSelect}
        />
        <input
          ref={amountInputRef}
          aria-label="금액"
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
            initialValue={currency === initial.currency ? initial.fxRate : usdDefaultFxRate}
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

function readMoneyCommit(value: string, previous: Money): { money: Money; fxRateTouched: boolean } | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed)) return null;
    const currency: Currency = parsed.currency === "USD" ? "USD" : "KRW";
    const amount = typeof parsed.amount === "number" ? parsed.amount : previous.amount;
    const fxRate = currency === "KRW" ? 1 : typeof parsed.fxRate === "number" ? parsed.fxRate : previous.fxRate;
    return { money: { currency, amount, fxRate }, fxRateTouched: parsed.fxRateTouched === true };
  } catch {
    return null;
  }
}

// 04-04 useDirtyStorage 보관본 — 칸 하나가 키 하나다: `{id}:base`(처음 고친 서버 줄 · 세지 않음) · `{id}:{칸}` · `{id}:new`(새 줄) ·
// `{id}:archive`(삭제 — 값은 그 줄을 본 version, 리뷰 R9). 다시 열면 같은 모양으로 편집 맵을 되살린다.
type NewRow = Row & { page: number };
/** 보관(삭제)할 줄 — 확인한 순간 본 version을 함께 보낸다(리뷰 R9). */
type ArchiveRequest = { id: string; version: number };
type Snapshot = { edits: Record<string, Edit>; newRows: NewRow[]; archived: ArchiveRequest[] };

function editsSnapshot({ edits, newRows, archived }: Snapshot): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [id, edit] of Object.entries(edits)) {
    out[`${id}:base`] = { ...edit.base, page: edit.page };
    for (const [field, value] of Object.entries(edit.patch)) out[`${id}:${field}`] = value;
  }
  for (const row of newRows) out[`${row.id}:new`] = row;
  for (const { id, version } of archived) out[`${id}:archive`] = version;
  return out;
}

function isStoredRow(value: unknown): value is Row {
  return isRecord(value) && typeof value.id === "string" && isRecord(value.money) && isRecord(value.cells) && typeof value.entryDate === "string";
}

function restoredSnapshot(stored: Record<string, unknown>): Snapshot {
  const snapshot: Snapshot = { edits: {}, newRows: [], archived: [] };
  for (const [key, value] of Object.entries(stored)) {
    const cut = key.lastIndexOf(":");
    const id = key.slice(0, cut);
    const field = key.slice(cut + 1);
    if (field === "new" && isStoredRow(value)) {
      const page = (value as Row & { page?: unknown }).page;
      snapshot.newRows.push({ ...value, page: typeof page === "number" ? page : 1 });
    }
    // version 없는 옛 보관본(true)은 되살리지 않는다 — version 없이 보관을 보내지 않는다.
    else if (field === "archive" && typeof value === "number") snapshot.archived.push({ id, version: value });
    else if (field === "base" && isStoredRow(value)) {
      const page = (value as Row & { page?: unknown }).page;
      snapshot.edits[id] = { base: value, patch: snapshot.edits[id]?.patch ?? {}, page: typeof page === "number" ? page : 1 };
    }
  }
  for (const [key, value] of Object.entries(stored)) {
    const cut = key.lastIndexOf(":");
    const id = key.slice(0, cut);
    const field = key.slice(cut + 1);
    const edit = snapshot.edits[id];
    if (edit && field in edit.base && field !== "id") edit.patch = { ...edit.patch, [field]: value };
  }
  return snapshot;
}

export type ReservesTableProps = {
  /** 리뷰 R2 — 미저장 편집 보관본 키를 보는 사람별로 나눈다. */
  viewerId: string;
  list: ReserveListResult;
  references: ReserveReferences;
  usdDefaultFxRate: number;
  todayKst: string;
};

export function ReservesTable({ viewerId, list: initialList, references, usdDefaultFxRate, todayKst }: ReservesTableProps) {
  // 서버 대장(지금 쪽). 쪽 이동·새로 고침은 props로, 저장 성공은 액션 응답으로 바뀐다 — 표는 다시 마운트되지 않는다.
  const [list, setList] = useState(initialList);
  const [seenList, setSeenList] = useState(initialList);
  // 리뷰 S2(DR-5) — 다른 쪽의 첫 오류로 옮겨 가는 중이면, 그 쪽이 도착한 렌더에서 표에 첫 오류 신호를 준다.
  const [pendingIssuePage, setPendingIssuePage] = useState<number | null>(null);
  const [issueSignal, setIssueSignal] = useState(0);
  if (initialList !== seenList) {
    setSeenList(initialList);
    setList(initialList);
    if (pendingIssuePage !== null && initialList.page === pendingIssuePage) {
      setPendingIssuePage(null);
      setIssueSignal((signal) => signal + 1);
    }
  }
  const router = useRouter();

  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [newRows, setNewRows] = useState<NewRow[]>([]);
  const [archived, setArchived] = useState<ArchiveRequest[]>([]);
  const archivedIds = archived.map((request) => request.id);
  const [balanceRejection, setBalanceRejection] = useState<ReserveBalanceRejection | null>(null);
  // 거부 봉투가 말한 칸(행 id) — 합계 행 요약이 표가 센 오류 칸과 같을 때만 요약이 그 수를 대신한다(04-47 DR-16).
  const [rejectedRowIds, setRejectedRowIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [discardedEdits, setDiscardedEdits] = useState<Record<string, unknown> | null>(null);
  // 사용자가 칸을 바꾼 순간에만 보관본을 쓴다(04-22 D-68) — 서버 값으로 다시 그리는 경로는 켜지 않는다.
  const persistPendingRef = useRef(false);
  const [cellErrors, setCellErrors] = useState<CellErrors>({});
  const [rejectionSummary, setRejectionSummary] = useState<string | null>(null);
  // 리뷰 S4 — 붙여넣기 묶음(합계 행 오른쪽 한 줄, 견적 원장과 같은 조각). 저장을 시도하면 지운다.
  const [pasteNotices, setPasteNotices] = useState<FooterNoticeItem[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState(0);
  const [openCell, setOpenCell] = useState<{ rowId: string; columnKey: string } | null>(null);
  const savingRef = useRef(false);
  const sentIdsRef = useRef<string[]>([]);
  const sentArchivedIdsRef = useRef<string[]>([]);

  const newRowCells = list.newRowCellEditability;
  const canWrite = newRowCells?.entryDate === "edit";

  const { execute, result, isExecuting } = useAction(saveReservesAction, {
    onSettled: () => {
      savingRef.current = false;
    },
    onSuccess: ({ data }) => {
      if (data?.rejected) {
        const next: CellErrors = {};
        for (const cell of data.rejected.cells) {
          if (!cell.rowId) continue;
          next[cell.rowId] = { ...next[cell.rowId], [columnForField(cell.field)]: cell.reason };
        }
        setCellErrors(next);
        setRejectionSummary(data.rejected.summary);
        setRejectedRowIds(data.rejected.cells.flatMap((cell) => (cell.rowId ? [cell.rowId] : [])));
        setBalanceRejection(data.rejected.balance);
        setIssueSignal((signal) => signal + 1);
        return;
      }
      if (data?.saved) {
        setList(data.saved);
        setEdits({});
        setNewRows([]);
        setArchived([]);
        setCellErrors({});
        setRejectionSummary(null);
        setRejectedRowIds([]);
        setBalanceRejection(null);
        dirtyStorage.clearAfterSave();
        setSavedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }));
      }
    },
    onError: ({ error }) => {
      if (error.validationErrors) {
        const next = validationCellErrors(error.validationErrors, sentIdsRef.current, sentArchivedIdsRef.current);
        // 리뷰 R12 — 거부된 보관 요청은 되돌려 그 줄을 표에 다시 보인다(오류 칸이 그 줄에 붙는다).
        const rejectedArchive = sentArchivedIdsRef.current.filter((id) => next[id]);
        if (rejectedArchive.length > 0) {
          persistPendingRef.current = true;
          setArchived((prev) => prev.filter((request) => !rejectedArchive.includes(request.id)));
        }
        setCellErrors(next);
        setRejectedRowIds(Object.keys(next));
        setRejectionSummary(countCells(next) > 0 ? `오류 ${countCells(next)}칸 · 전부 거부` : COPY.invalidInput);
        setIssueSignal((signal) => signal + 1);
      }
    },
  });

  const serverRows = list.rows.map(rowFromDto);
  const rows: Row[] = [
    ...serverRows.filter((row) => !archivedIds.includes(row.id)).map((row) => (edits[row.id] ? withPatch(row, edits[row.id]!.patch) : row)),
    ...newRows.filter((row) => row.page === list.page),
  ];
  const dirtyCount = Object.keys(edits).length + newRows.length + archivedIds.length;
  const dirtyStorage = useDirtyStorage(viewerDirtyScope(viewerId, "reserves"), "ledger", dirtyCount);
  const { persist } = dirtyStorage;
  useEffect(() => {
    if (!persistPendingRef.current) return;
    persistPendingRef.current = false;
    persist(editsSnapshot({ edits, newRows, archived }));
  }, [edits, newRows, archived, persist]);

  const clientName = (id: string) => references.clients.find((client) => client.id === id)?.name ?? "";
  const projectName = (id: string | null) => (id ? (references.projects.find((project) => project.id === id)?.name ?? null) : null);
  const evidenceLabel = (value: string | null) => (value ? (references.evidenceTypes.find((item) => item.value === value)?.label ?? null) : null);

  // 그룹 머리글 = 클라이언트, 머리글 행 오른쪽 = 서버가 계산한 최종 잔액(굵게 — S9 · D-91 · 리뷰 S3). 저장 전 새 줄의 클라이언트가
  // 이 쪽에 없으면 이름만.
  function groupLabel(row: Row): string {
    if (!row.clientId) return "—";
    return row.clientName || clientName(row.clientId);
  }

  function groupBalance(row: Row): string | null {
    const balance = list.clientBalances?.find((entry) => entry.clientId === row.clientId);
    return balance ? `잔액 ${formatKrw(balance.balanceKrw)}` : null;
  }

  function clearCellError(rowId: string, columnKey: string) {
    setCellErrors((prev) => {
      if (!prev[rowId]?.[columnKey]) return prev;
      const cells = { ...prev[rowId] };
      delete cells[columnKey];
      return { ...prev, [rowId]: cells };
    });
  }

  function applyPatch(rowId: string, patch: Patch) {
    setSavedAt(null);
    persistPendingRef.current = true;
    if (newRows.some((row) => row.id === rowId)) {
      setNewRows((prev) => prev.map((row) => (row.id === rowId ? { ...withPatch(row, patch), page: row.page } : row)));
      return;
    }
    const serverRow = serverRows.find((row) => row.id === rowId);
    setEdits((prev) => {
      const base = prev[rowId]?.base ?? serverRow;
      if (!base) return prev;
      const merged: Patch = { ...prev[rowId]?.patch, ...patch };
      // 원래 값으로 되돌린 칸은 편집에서 뺀다 — 모두 되돌리면 그 줄은 dirty가 아니다.
      for (const key of Object.keys(merged) as EditableField[]) {
        if (key !== "fxRateTouched" && sameValue(merged[key], base[key])) delete merged[key];
      }
      if (!merged.money) delete merged.fxRateTouched;
      const next = { ...prev };
      if (Object.keys(merged).length === 0) delete next[rowId];
      else next[rowId] = { base, patch: merged, page: prev[rowId]?.page ?? list.page };
      return next;
    });
  }

  function commitCell(rowId: string, columnKey: string, value: string) {
    const row = rows.find((candidate) => candidate.id === rowId);
    if (!row) return;
    clearCellError(rowId, columnKey);
    switch (columnKey) {
      case "entryDate":
        applyPatch(rowId, { entryDate: value.trim() });
        return;
      case "direction":
        if (value === "deposit" || value === "withdrawal") applyPatch(rowId, { direction: value });
        return;
      case "amount": {
        const parsed = readMoneyCommit(value, row.money);
        if (parsed) applyPatch(rowId, { money: parsed.money, fxRateTouched: parsed.fxRateTouched || row.fxRateTouched });
        return;
      }
      case "projectId":
        applyPatch(rowId, { projectId: value === "" ? null : value, projectName: projectName(value || null) });
        return;
      case "evidenceType":
        applyPatch(rowId, { evidenceType: value === "" ? null : value, evidenceLabel: evidenceLabel(value || null) });
        return;
      case "taxInvoiceNumber":
      case "note":
        applyPatch(rowId, { [columnKey]: value.trim() === "" ? null : value.trim() });
        return;
      case "clientId": {
        if (value === "" || value === row.clientId) return;
        // 다른 클라이언트의 프로젝트는 남기지 않는다(서버도 거부한다).
        const keepProject = references.projects.some((project) => project.id === row.projectId && project.clientId === value);
        applyPatch(rowId, { clientId: value, clientName: clientName(value), projectId: keepProject ? row.projectId : null, projectName: keepProject ? row.projectName : null });
        return;
      }
    }
  }

  // ENG-D10 — 새 줄 id는 화면이 만든 uuid(행 키도 그 값). 응답을 잃어 다시 보내도 서버가 한 행만 남긴다.
  function blankNewRow(cells: Record<ReserveCellField, ReserveCellEditability>): NewRow {
    return {
      id: crypto.randomUUID(),
      isNew: true,
      version: 0,
      clientId: "",
      clientName: "",
      entryDate: todayKst,
      direction: "deposit",
      money: { currency: "KRW", amount: 0, fxRate: 1 },
      amountKrw: 0,
      fxRateTouched: false,
      projectId: null,
      projectName: null,
      evidenceType: null,
      evidenceLabel: null,
      taxInvoiceNumber: null,
      note: null,
      balanceKrw: null,
      cells,
      page: list.page,
    };
  }

  function addRow() {
    if (!newRowCells || isExecuting) return;
    const row = blankNewRow(newRowCells);
    const id = row.id;
    setSavedAt(null);
    persistPendingRef.current = true;
    setNewRows((prev) => [...prev, row]);
    // 사용자 D6 — 새 줄은 클라이언트 칸이 편집 상태로 열린다.
    setOpenCell({ rowId: id, columnKey: "clientId" });
  }

  function toPayload(row: Row) {
    return {
      id: row.id,
      ...(row.isNew ? { isNew: true as const } : { version: row.version }),
      clientId: row.clientId,
      entryDate: row.entryDate,
      direction: row.direction,
      amount: row.money,
      fxRateTouched: row.fxRateTouched,
      projectId: row.projectId,
      evidenceType: row.evidenceType,
      taxInvoiceNumber: row.taxInvoiceNumber,
      note: row.note,
    };
  }

  // 리뷰 S2(DR-5) — 고정 오류 칸이 있는 줄의 쪽. 고친 줄은 처음 고친 쪽, 새 줄은 만든 쪽, 잔액 거부 줄은 서버가 준 쪽,
  // 그 밖에는 지금 쪽에 보이는 줄만 센다(보관할 줄은 보이지 않아 세지 않는다).
  const shownIds = new Set(serverRows.map((row) => row.id));
  function issuePage(rowId: string): number | null {
    if (archivedIds.includes(rowId)) return null;
    const known = edits[rowId]?.page ?? newRows.find((row) => row.id === rowId)?.page;
    if (known !== undefined) return known;
    if (balanceRejection?.entryId === rowId && balanceRejection.page !== null) return balanceRejection.page;
    return shownIds.has(rowId) ? list.page : null;
  }
  const issues = Object.entries(cellErrors).flatMap(([rowId, cells]) => {
    const page = Object.keys(cells).length > 0 ? issuePage(rowId) : null;
    return page === null ? [] : [{ page, count: Object.keys(cells).length }];
  });
  // 다른 쪽의 오류 칸 수(페이지 줄 번호 옆 `오류 N` — 견적 원장 04-47과 같은 자리).
  const pageErrorCounts: Record<number, number> = {};
  for (const issue of issues) if (issue.page !== list.page) pageErrorCounts[issue.page] = (pageErrorCounts[issue.page] ?? 0) + issue.count;

  const pageHref = (n: number) => `/pnl/reserves?page=${n}`;
  function goToFirstIssue(): boolean {
    if (issues.length === 0) return false;
    if (issues.some((issue) => issue.page === list.page)) {
      setIssueSignal((signal) => signal + 1);
      return true;
    }
    const target = Math.min(...issues.map((issue) => issue.page));
    setPendingIssuePage(target);
    router.push(pageHref(target));
    return true;
  }

  function handleSave() {
    // S19 DR-5 — 고정된 오류 칸이 남아 있으면 서버에 보내지 않고 첫 오류로 간다(견적 원장 goToFirstIssue와 같은 규칙).
    if (savingRef.current || isExecuting || goToFirstIssue() || dirtyCount === 0) return;
    savingRef.current = true;
    setSavedAt(null);
    setRejectionSummary(null);
    setPasteNotices([]);
    setDiscardedEdits(null);
    const sent = [...Object.values(edits).map((edit) => withPatch(edit.base, edit.patch)), ...newRows];
    sentIdsRef.current = sent.map((row) => row.id);
    sentArchivedIdsRef.current = archivedIds;
    setSentCount(sent.length + archivedIds.length);
    execute({ rows: sent.map(toPayload), archived, page: list.page });
  }

  // 키보드 Ctrl+S는 표가 열린 편집기를 먼저 커밋(blur)한 뒤 부른다 — 그 커밋이 반영된 다음 렌더에서 저장한다(04-30 선례).
  const [saveRequests, setSaveRequests] = useState(0);
  const saveAfterCommit = useEffectEvent(() => handleSave());
  useEffect(() => {
    if (saveRequests > 0) saveAfterCommit();
  }, [saveRequests]);

  const [cellEditing, setCellEditing] = useState(false);
  // DR-36 · 계약 6 — 1024 미만은 보기 전용(셀 단계를 전부 읽기 전용으로 내린다). 편집기가 열린 채 폭이 줄면 커밋 뒤로 미룬다.
  const editableWidth = useEditableWidth() || cellEditing;
  // DR-3 · 계약 3 — 저장 요청 동안 표는 보이되 편집에 들어가지 않는다(ui/table saveLocked). 응답이 오면 곧바로 풀린다.
  const saveLocked = isExecuting;
  const saveButtonId = useId();

  const editability = (row: Row, field: ReserveCellField): CellEditability => (editableWidth ? row.cells[field] : "readonly");

  // B-04 · T5 — 삭제는 확인 뒤 보관할 id로 들어가 다음 「일괄 저장」에서 잔액 판정과 함께 저장된다(보관함 권한 불필요).
  function requestDelete(row: Row) {
    if (row.isNew) {
      persistPendingRef.current = true;
      setNewRows((prev) => prev.filter((candidate) => candidate.id !== row.id));
      return;
    }
    setDeleteTarget(row);
  }

  // DOM 감사 #36 — 확인하면 트리거 줄이 빠져 확인 창이 포커스를 돌려줄 곳이 없다(h1로 간다). 창이 닫힌 뒤 격자의 탭 정지
  // (같은 열의 다음 줄 — 마지막 줄이었으면 앞 줄)로 되돌린다.
  const deleteConfirmedRef = useRef(false);
  const [gridRefocus, setGridRefocus] = useState(0);
  useEffect(() => {
    if (gridRefocus > 0) document.querySelector<HTMLElement>('table[role="grid"] td[tabindex="0"]')?.focus();
  }, [gridRefocus]);

  function closeDeleteDialog() {
    setDeleteTarget(null);
    if (!deleteConfirmedRef.current) return;
    deleteConfirmedRef.current = false;
    setGridRefocus((count) => count + 1);
  }

  function confirmDelete() {
    const target = deleteTarget;
    if (!target) return;
    deleteConfirmedRef.current = true;
    persistPendingRef.current = true;
    setSavedAt(null);
    setArchived((prev) => (prev.some((request) => request.id === target.id) ? prev : [...prev, { id: target.id, version: target.version }]));
    setEdits((prev) => {
      const next = { ...prev };
      delete next[target.id];
      return next;
    });
    setCellErrors((prev) => {
      const next = { ...prev };
      delete next[target.id];
      return next;
    });
    setDeleteTarget(null);
  }

  function applyRestored(stored: Record<string, unknown>) {
    const snapshot = restoredSnapshot(stored);
    persistPendingRef.current = true;
    setEdits((prev) => ({ ...prev, ...snapshot.edits }));
    setNewRows((prev) => [...prev, ...snapshot.newRows.filter((row) => !prev.some((existing) => existing.id === row.id))]);
    setArchived((prev) => [...prev, ...snapshot.archived.filter((request) => !prev.some((existing) => existing.id === request.id))]);
  }

  function restoreEdits() {
    const stored = dirtyStorage.restore();
    if (stored) applyRestored(stored);
  }

  // 사용자 결정 2026-09-26(C-1) — 「버림」은 확인 없이 지우고 토스트 「되돌리기」로 되살린다(견적 원장과 같은 규칙).
  function discardEdits() {
    const stored = dirtyStorage.restore();
    dirtyStorage.discard();
    setDiscardedEdits(stored);
  }

  function isDirtyCell(row: Row, columnKey: string): boolean {
    if (row.isNew) return true;
    const field = COLUMN_FIELD[columnKey];
    return field ? field in (edits[row.id]?.patch ?? {}) : false;
  }

  const cellIssue = (row: Row, columnKey: string): CellIssue | undefined => {
    const message = cellErrors[row.id]?.[columnKey];
    return message ? { kind: "error", message } : undefined;
  };

  const directionLabel = (value: ReserveDirection) => DIRECTION_OPTIONS.find((option) => option.value === value)?.label ?? "";
  const moneyText = (row: Row) => (row.isNew && row.money.amount === 0 ? "—" : formatKrw(row.amountKrw));
  const clientProjects = (row: Row) =>
    references.projects.filter((project) => project.clientId === row.clientId).map((project) => ({ value: project.id, label: project.name }));

  const columns: TableColumn<Row>[] = [
    {
      key: "entryDate",
      header: "날짜",
      priority: "p1",
      editability: (row) => editability(row, "entryDate"),
      cell: (row) => row.entryDate || "—",
      copyText: (row) => row.entryDate,
      editCell: (row, ctx) => <TextEditCell ariaLabel="날짜" type="date" initialValue={row.entryDate} onCommit={ctx.onCommit} />,
    },
    {
      key: "direction",
      header: "구분",
      priority: "p1",
      editability: (row) => editability(row, "direction"),
      cell: (row) => directionLabel(row.direction),
      copyText: (row) => directionLabel(row.direction),
      editCell: (row, ctx) => (
        <SelectEditCell id={`reserve-direction-${row.id}`} ariaLabel="구분" initialValue={row.direction} options={DIRECTION_OPTIONS} onCommit={ctx.onCommit} onCancel={ctx.onCancel} />
      ),
    },
    {
      key: "amount",
      header: "금액",
      priority: "p1",
      align: "right",
      editability: (row) => editability(row, "amount"),
      cell: (row) => moneyText(row),
      secondaryLine: (row) => formatForeignLine(row.money),
      copyText: (row) => String(row.amountKrw),
      editCell: (row, ctx) => <MoneyEditCell rowKey={row.id} initial={row.money} usdDefaultFxRate={usdDefaultFxRate} onCommit={ctx.onCommit} />,
    },
    {
      key: "balanceKrw",
      header: "잔액",
      priority: "p2",
      align: "right",
      editability: () => "readonly",
      cell: (row) => <span className={styles.balance}>{row.balanceKrw === null ? "—" : formatKrw(row.balanceKrw)}</span>,
      copyText: (row) => (row.balanceKrw === null ? "" : String(row.balanceKrw)),
      pasteRole: "computed",
    },
    {
      key: "projectId",
      header: "프로젝트",
      priority: "p2",
      editability: (row) => editability(row, "projectId"),
      cell: (row) => row.projectName || "—",
      copyText: (row) => row.projectName ?? "",
      editCell: (row, ctx) => (
        <SelectEditCell
          id={`reserve-project-${row.id}`}
          ariaLabel="프로젝트"
          initialValue={row.projectId ?? ""}
          initialLabel={row.projectName}
          options={clientProjects(row)}
          onCommit={ctx.onCommit}
          onCancel={ctx.onCancel}
        />
      ),
    },
    {
      key: "evidenceType",
      header: "증빙 종류",
      priority: "p3",
      collapseBelow: 1280,
      editability: (row) => editability(row, "evidenceType"),
      cell: (row) => row.evidenceLabel || row.evidenceType || "—",
      copyText: (row) => row.evidenceLabel ?? row.evidenceType ?? "",
      editCell: (row, ctx) => (
        <SelectEditCell
          id={`reserve-evidence-${row.id}`}
          ariaLabel="증빙 종류"
          initialValue={row.evidenceType ?? ""}
          initialLabel={row.evidenceLabel}
          options={references.evidenceTypes}
          onCommit={ctx.onCommit}
          onCancel={ctx.onCancel}
        />
      ),
    },
    {
      key: "taxInvoiceNumber",
      header: "세금계산서 번호",
      priority: "p3",
      collapseBelow: 1280,
      editability: (row) => editability(row, "taxInvoiceNumber"),
      cell: (row) => <span className={styles.taxInvoice}>{row.taxInvoiceNumber || "—"}</span>,
      copyText: (row) => row.taxInvoiceNumber ?? "",
      editCell: (row, ctx) => <TextEditCell ariaLabel="세금계산서 번호" initialValue={row.taxInvoiceNumber ?? ""} onCommit={ctx.onCommit} />,
    },
    {
      key: "note",
      header: "메모",
      priority: "p2",
      editability: (row) => editability(row, "note"),
      cell: (row) => (row.note ? <span className={styles.noteText}>{row.note}</span> : "—"),
      // 폰 접힌 줄은 말줄임 없이 글자 그대로(줄바꿈) — 한 줄 말줄임은 PC 셀에만.
      summary: (row) => row.note ?? "",
      copyText: (row) => row.note ?? "",
      editCell: (row, ctx) => <TextEditCell ariaLabel="메모" initialValue={row.note ?? ""} onCommit={ctx.onCommit} />,
    },
    {
      key: "clientId",
      header: "클라이언트",
      priority: "p3",
      collapseBelow: 1024,
      editability: (row) => editability(row, "clientId"),
      cell: (row) => row.clientName || clientName(row.clientId) || "—",
      copyText: (row) => row.clientName,
      editCell: (row, ctx) => (
        <SelectEditCell
          id={`reserve-client-${row.id}`}
          ariaLabel="클라이언트"
          initialValue={row.clientId}
          options={references.clients.map((client) => ({ value: client.id, label: client.label }))}
          onCommit={ctx.onCommit}
          onCancel={ctx.onCancel}
        />
      ),
    },
  ];

  // 리뷰 S4 — 붙여넣기(§7-3 (다)). columns와 같은 순서·길이다 — 숨은 열(collapseBelow)도 논리 순서에 남는다. 파싱·오류 규칙은
  // ui/table applyPaste(견적 원장과 같다): 금액 쉼표·`원`, 목록 열은 라벨·값 대조, 읽기 전용·잠김·계산 열에 떨어진 엑셀 값은 오류 칸.
  const blankOption = { value: "", label: "—" };
  const pasteColumns: PasteColumn<Row>[] = [
    { key: "entryDate", kind: "text", isEditable: (row) => editability(row, "entryDate") === "edit" },
    { key: "direction", kind: "select", options: DIRECTION_OPTIONS, isEditable: (row) => editability(row, "direction") === "edit" },
    { key: "amount", kind: "number", numberKind: "krw", isEditable: (row) => editability(row, "amount") === "edit" },
    { key: "balanceKrw", kind: "text", isEditable: () => false, pasteRole: "computed" },
    {
      key: "projectId",
      kind: "select",
      options: [blankOption, ...references.projects.map((project) => ({ value: project.id, label: project.name }))],
      isEditable: (row) => editability(row, "projectId") === "edit",
    },
    { key: "evidenceType", kind: "select", options: [blankOption, ...references.evidenceTypes], isEditable: (row) => editability(row, "evidenceType") === "edit" },
    { key: "taxInvoiceNumber", kind: "text", isEditable: (row) => editability(row, "taxInvoiceNumber") === "edit" },
    { key: "note", kind: "text", isEditable: (row) => editability(row, "note") === "edit" },
    {
      key: "clientId",
      kind: "select",
      // QA ISSUE-005 — 이름만 붙이면 동명 여럿 오류(R1) 그대로, `이름 · 끝4자리` 라벨이 정확히 같으면 그 클라이언트.
      options: references.clients.flatMap((client) => [
        { value: client.id, label: client.name },
        ...(client.label !== client.name ? [{ value: client.id, label: client.label }] : []),
      ]),
      // 리뷰 R5 — 저장된 줄의 잠긴 클라이언트 칸도 값을 읽는다. 같은 클라이언트면 그대로 두고, 다른 클라이언트면 잠김 오류 칸(handlePasteAtCell).
      isEditable: (row) => editability(row, "clientId") !== "readonly",
    },
  ];

  // 붙여넣은 칸 값 → 줄 패치(견적 원장 handlePasteAtCell과 같은 결 — 금액은 원화로 들어간다, `—`는 빈 칸).
  function pastePatch(columnKey: string, value: string): Patch {
    switch (columnKey) {
      case "entryDate":
        return { entryDate: value };
      case "direction":
        return value === "deposit" || value === "withdrawal" ? { direction: value } : {};
      case "amount":
        return { money: { currency: "KRW", amount: Number(value), fxRate: 1 }, fxRateTouched: false };
      case "projectId":
        return { projectId: value || null, projectName: projectName(value || null) };
      case "evidenceType":
        return { evidenceType: value || null, evidenceLabel: evidenceLabel(value || null) };
      case "taxInvoiceNumber":
      case "note":
        return { [columnKey]: value === "—" || value === "" ? null : value };
      case "clientId":
        return { clientId: value, clientName: clientName(value) };
      default:
        return {};
    }
  }

  function handlePasteAtCell(row: Row, columnKey: string, clipboard: { text: string; appMeta: string | null }): string[] {
    // 표가 그리는 순서(클라이언트 그룹 순)로 아래 줄을 센다.
    const grouped = new Map<string, Row[]>();
    for (const candidate of rows) grouped.set(groupLabel(candidate), [...(grouped.get(groupLabel(candidate)) ?? []), candidate]);
    const ordered = [...grouped.values()].flat();
    const rowIndex = ordered.indexOf(row);
    const colIndex = pasteColumns.findIndex((column) => column.key === columnKey);
    if (rowIndex === -1 || colIndex === -1) return [];
    const result = applyPaste({
      clipboardText: clipboard.text,
      appMeta: clipboard.appMeta,
      columns: pasteColumns,
      rows: ordered,
      activeRowIndex: rowIndex,
      activeColIndex: colIndex,
      newRow: newRowCells ? blankNewRow(newRowCells) : undefined,
    });
    const created = newRowCells ? Array.from({ length: result.newRowsNeeded }, () => blankNewRow(newRowCells)) : [];
    const targetAt = (index: number) => ordered[index] ?? created[index - ordered.length];
    // 리뷰 R4 — 견적 원장 04-47(사용자 D15)과 같은 조각: 금액이 원화로 들어간 줄 중 원본(앱 형식)이 외화였거나 덮인 기존 줄이 외화였던 줄.
    const foreignToKrw = new Set(
      result.cells
        .filter((cell) => cell.columnKey === "amount" && cell.result.status === "ok")
        .filter((cell) => {
          const sourceCurrency = result.sourceCurrencies?.[cell.rowIndex - rowIndex];
          const existing = ordered[cell.rowIndex];
          return (sourceCurrency !== undefined && sourceCurrency !== "KRW") || (existing !== undefined && existing.money.currency !== "KRW");
        })
        .map((cell) => cell.rowIndex),
    ).size;

    const patches = new Map<string, Patch>();
    const errors: CellErrors = {};
    const cleared: { rowId: string; columnKey: string }[] = [];
    for (const cell of result.cells) {
      const target = targetAt(cell.rowIndex);
      if (!target) continue;
      if (cell.result.status === "error") {
        errors[target.id] = { ...errors[target.id], [cell.columnKey]: cell.result.reason };
        continue;
      }
      if (cell.columnKey === "clientId" && editability(target, "clientId") === "locked") {
        if (cell.result.value !== target.clientId) errors[target.id] = { ...errors[target.id], clientId: COPY.lockedPaste };
        continue;
      }
      cleared.push({ rowId: target.id, columnKey: cell.columnKey });
      patches.set(target.id, { ...patches.get(target.id), ...pastePatch(cell.columnKey, cell.result.value) });
    }

    setSavedAt(null);
    persistPendingRef.current = true;
    for (const { rowId, columnKey: key } of cleared) clearCellError(rowId, key);
    setCellErrors((prev) => {
      const next = { ...prev };
      for (const [rowId, cells] of Object.entries(errors)) next[rowId] = { ...next[rowId], ...cells };
      return next;
    });
    for (const target of ordered) {
      const patch = patches.get(target.id);
      if (patch) applyPatch(target.id, patch);
    }
    if (created.length > 0) {
      setNewRows((prev) => [...prev, ...created.map((newRow) => ({ ...withPatch(newRow, patches.get(newRow.id) ?? {}), page: newRow.page }))]);
    }

    const notices: FooterNoticeItem[] = [{ tone: "muted", text: `붙여넣기 ${result.rowCount}줄`, paste: "head" }];
    if (result.droppedColumnCount > 0) notices.push({ tone: "warning", text: `오른쪽 ${result.droppedColumnCount}칸 버림`, paste: "piece" });
    if (foreignToKrw > 0) notices.push({ tone: "warning", text: `외화 ${foreignToKrw}줄 원화로`, paste: "piece" });
    if (result.ignoredComputedCells > 0) notices.push({ tone: "muted", text: `계산 열 ${result.ignoredComputedCells}칸 무시`, paste: "piece" });
    setPasteNotices(notices);
    return Array.from({ length: result.rowCount }, (_, offset) => targetAt(rowIndex + offset)?.id ?? "").filter((id) => id !== "");
  }

  // 합계 행 오른쪽 한 줄 — 거부 요약은 지금 보이는 줄의 오류 칸 수를 말할 때만 표가 세는 수를 대신한다(다른 쪽 줄이면 0칸).
  const displayedIds = new Set(rows.map((row) => row.id));
  const claimedErrorCells = rejectedRowIds.filter((id) => displayedIds.has(id)).length;
  const footerNotices: FooterNoticeItem[] = [...pasteNotices];
  if (rejectionSummary) footerNotices.push({ tone: "danger", text: rejectionSummary, replacesIssueCount: { errorCells: claimedErrorCells, conflictRows: 0 } });
  if (result.serverError) footerNotices.push({ tone: "danger", text: result.serverError });

  // Codex #7 — 잔액을 음수로 만든 줄이 지금 보는 쪽에 없으면 표 위 한 줄과 그 쪽으로 가는 링크(편집 맵은 그대로 남는다).
  const otherPageRejection = balanceRejection && balanceRejection.page !== null && balanceRejection.page !== list.page ? balanceRejection : null;
  const total = list.total ?? 0;
  const canEditHere = canWrite && editableWidth;
  const emptyMessage = !canWrite ? COPY.emptyReadOnly : COPY.empty;

  return (
    <>
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <PageHeader title="리저브 대장" subtitle="클라이언트별 리저브 입출금" />
        </div>
        {/* 후속 결정 R1 — 1024 미만에서는 편집이 남았을 때(N ≥ 1)만 그 폭에서 저장할 수단으로 보인다. */}
        {canWrite && (editableWidth || dirtyCount > 0) ? (
          <Button
            id={saveButtonId}
            type="button"
            variant="primary"
            pending={isExecuting}
            disabled={dirtyCount === 0 && !cellEditing}
            disabledReason={dirtyCount === 0 && !cellEditing ? COPY.noChange : undefined}
            reasonTone="info"
            shortcut="Ctrl+S"
            onClick={handleSave}
          >
            일괄 저장{dirtyCount > 0 ? ` ${dirtyCount}` : ""}
          </Button>
        ) : null}
      </div>

      {dirtyStorage.restorableCount > 0 ? (
        <p className={styles.restoreBanner}>
          <span>{`저장 안 한 편집 ${dirtyStorage.restorableCount}칸`}</span>
          <span className={styles.restoreActions}>
            <button type="button" className={styles.restoreAction} onClick={() => (saveLocked ? undefined : restoreEdits())}>
              복원
            </button>
            <button type="button" className={styles.restoreAction} onClick={() => (saveLocked ? undefined : discardEdits())}>
              버림
            </button>
          </span>
        </p>
      ) : null}

      {otherPageRejection ? (
        <p role="alert" className={styles.batchError}>
          {`${otherPageRejection.entryDate} ${otherPageRejection.clientName} 잔액 ${formatKrw(otherPageRejection.balanceKrw)} · `}
          <Link href={pageHref(otherPageRejection.page ?? 1)} className={styles.batchErrorLink}>
            {`${otherPageRejection.page}쪽에서 고치기`}
          </Link>
        </p>
      ) : null}

      <Table
        caption="리저브 대장"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        // 리뷰 R5 — 격자 복사에 앱 형식(줄별 통화)을 싣는다. 같은 앱 안 붙여넣기는 계산 열을 무시하고 외화 줄을 센다(견적 원장과 같다).
        copyMeta={(copyRows) => JSON.stringify(copyRows.map((row) => ({ currency: row.money.currency })))}
        groupBy={groupLabel}
        groupAside={groupBalance}
        openCell={openCell}
        enableGridKeyboard
        saveLocked={saveLocked}
        onEditingChange={setCellEditing}
        onCellCommit={commitCell}
        cellIssue={cellIssue}
        cellDirty={isDirtyCell}
        firstIssueSignal={issueSignal}
        onPasteAtCell={canEditHere ? handlePasteAtCell : undefined}
        emptyMessage={emptyMessage}
        emptyAction={canEditHere ? { label: COPY.addRow, shortcut: COPY.addRowShortcut, onClick: addRow } : undefined}
        keyboard={{
          onNewRow: canEditHere ? () => addRow() : undefined,
          onDeleteRow: canEditHere ? requestDelete : undefined,
          onSave: () => setSaveRequests((count) => count + 1),
        }}
        footerNotices={footerNotices}
        footerSuccess={savedAt ? savedNoticeText(sentCount, savedAt) : null}
        footer={(notice) => (
          <tr>
            <td colSpan={columns.length} className={styles.footerCell}>
              {`전체 ${total}건`}
              {notice}
            </td>
          </tr>
        )}
      />

      {canEditHere && rows.length > 0 ? (
        <div className={styles.addLine}>
          <Button
            variant="tertiary"
            disabled={saveLocked}
            aria-describedby={saveLocked ? saveButtonId : undefined}
            onClick={() => (saveLocked ? undefined : addRow())}
          >
            {COPY.addRow}
          </Button>
        </div>
      ) : null}

      {/* D-91 · DR-18 — 50건 번호 페이지. 링크 갈래는 next/link 클라이언트 이동이라 표가 다시 마운트되지 않고 편집 맵이 남는다. */}
      <Pagination
        label="리저브"
        page={list.page}
        pageCount={list.pageCount}
        href={pageHref}
        rangeText={pageRangeText({ page: list.page, pageSize: LIST_PAGE_SIZE, total, unit: "건" })}
        errorCounts={pageErrorCounts}
      />

      {/* 개정 ⑬ — 힌트 줄은 페이지 줄 아래 한 곳, 이 화면에서 실제로 되는 키만(1024 미만에서 숨는다). */}
      {canEditHere && rows.length > 0 ? (
        <p className={styles.hintRow}>
          {HINT_ITEMS.map((item, index) => (
            <span key={item.label}>
              {index > 0 ? " · " : ""}
              {item.label} <kbd>{item.keys}</kbd>
            </span>
          ))}
        </p>
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={closeDeleteDialog}
        title={COPY.deleteTitle}
        subtitle={deleteTarget ? `${deleteTarget.entryDate} · ${deleteTarget.clientName} · ${formatKrw(deleteTarget.amountKrw)}` : undefined}
        resultLines={[COPY.deleteResult]}
        primary={{ label: COPY.deleteTitle, onConfirm: confirmDelete }}
      />

      {discardedEdits ? (
        <Toast
          message={COPY.discarded}
          actionLabel="되돌리기"
          onAction={() => {
            applyRestored(discardedEdits);
            setDiscardedEdits(null);
          }}
          onDismiss={() => setDiscardedEdits(null)}
        />
      ) : null}
    </>
  );
}
