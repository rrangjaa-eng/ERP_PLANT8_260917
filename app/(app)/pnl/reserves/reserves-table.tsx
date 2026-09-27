"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { saveReservesAction } from "./actions";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { Button } from "@/ui/button/Button";
import { Select } from "@/ui/select/Select";
import { Table } from "@/ui/table/Table";
import { useCommaInput } from "@/ui/input/use-comma-input";
import { savedNoticeText, type FooterNoticeItem } from "@/ui/table/footer-notice";
import type { CellEditability, CellIssue, TableColumn } from "@/ui/table/types";
import { formatForeignLine, formatKrw, parseNumberInput, type NumberInputKind } from "@/lib/format-number";
import type { Currency } from "@/domain/money";
import type {
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
  evidenceType: string | null;
  taxInvoiceNumber: string | null;
  note: string | null;
  /** 서버 계산 잔액 — 저장 전 새 줄은 없다. */
  balanceKrw: number | null;
  cells: Record<ReserveCellField, ReserveCellEditability>;
};

type EditableField = "clientId" | "clientName" | "entryDate" | "direction" | "money" | "fxRateTouched" | "projectId" | "evidenceType" | "taxInvoiceNumber" | "note";
type Patch = Partial<Pick<Row, EditableField>>;
/** 기존 줄의 편집 — 처음 고친 순간의 서버 줄(base)과 바뀐 칸(patch). 쪽을 넘어가도 base로 저장 페이로드를 만든다(DR-18). */
type Edit = { base: Row; patch: Patch };

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

const DIRECTION_OPTIONS: { value: ReserveDirection; label: string }[] = [
  { value: "deposit", label: "입금" },
  { value: "withdrawal", label: "출금" },
];

// 문구는 이 한 곳에 둔다(Copywriting — 리저브).
const COPY = {
  empty: "리저브 기록이 없습니다",
  emptyReadOnly: "리저브 기록이 없습니다 · 기록은 경영관리",
  addRow: "리저브 줄 추가",
  noChange: "바뀐 칸 없음",
  invalidInput: "저장 실패 · 입력값 확인",
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
    evidenceType: dto.evidenceType,
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
  if (patch.money) next.amountKrw = patch.money.currency === "KRW" ? patch.money.amount : Math.round(patch.money.amount * patch.money.fxRate);
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
function validationCellErrors(errors: unknown, sentIds: string[]): CellErrors {
  const out: CellErrors = {};
  const rows = isRecord(errors) ? errors.rows : undefined;
  if (!isRecord(rows)) return out;
  for (const [index, fields] of Object.entries(rows)) {
    const rowId = sentIds[Number(index)];
    if (rowId === undefined || !isRecord(fields)) continue;
    for (const [field, node] of Object.entries(fields)) {
      if (field === "_errors") continue;
      const reason = firstReason(node);
      if (reason) out[rowId] = { ...out[rowId], [columnForField(field)]: reason };
    }
  }
  return out;
}

function countCells(errors: CellErrors): number {
  return Object.values(errors).reduce((sum, cells) => sum + Object.keys(cells).length, 0);
}

function TextEditCell({ ariaLabel, initialValue, numeric, onCommit }: { ariaLabel: string; initialValue: string; numeric?: boolean; onCommit: (value: string) => void }) {
  return (
    <input
      aria-label={ariaLabel}
      type="text"
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

function SelectEditCell({
  id,
  ariaLabel,
  initialValue,
  options,
  onCommit,
}: {
  id: string;
  ariaLabel: string;
  initialValue: string;
  options: { value: string; label: string; description?: string | null }[];
  onCommit: (value: string) => void;
}) {
  return (
    <Select
      id={id}
      aria-label={ariaLabel}
      defaultValue={initialValue}
      autoFocus
      onChange={(event) => onCommit(event.target.value)}
      onBlur={(event) => onCommit(event.currentTarget.value)}
      options={options}
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

export type ReservesTableProps = {
  list: ReserveListResult;
  references: ReserveReferences;
  usdDefaultFxRate: number;
  todayKst: string;
};

export function ReservesTable({ list: initialList, references, usdDefaultFxRate, todayKst }: ReservesTableProps) {
  // 서버 대장(지금 쪽). 쪽 이동·새로 고침은 props로, 저장 성공은 액션 응답으로 바뀐다 — 표는 다시 마운트되지 않는다.
  const [list, setList] = useState(initialList);
  const [seenList, setSeenList] = useState(initialList);
  if (initialList !== seenList) {
    setSeenList(initialList);
    setList(initialList);
  }

  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [newRows, setNewRows] = useState<(Row & { page: number })[]>([]);
  const [cellErrors, setCellErrors] = useState<CellErrors>({});
  const [rejectionSummary, setRejectionSummary] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState(0);
  const [openCell, setOpenCell] = useState<{ rowId: string; columnKey: string } | null>(null);
  const [issueSignal, setIssueSignal] = useState(0);
  const savingRef = useRef(false);
  const sentIdsRef = useRef<string[]>([]);

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
        setIssueSignal((signal) => signal + 1);
        return;
      }
      if (data?.saved) {
        setList(data.saved);
        setEdits({});
        setNewRows([]);
        setCellErrors({});
        setRejectionSummary(null);
        setSavedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }));
      }
    },
    onError: ({ error }) => {
      if (error.validationErrors) {
        const next = validationCellErrors(error.validationErrors, sentIdsRef.current);
        setCellErrors(next);
        setRejectionSummary(countCells(next) > 0 ? `오류 ${countCells(next)}칸 · 전부 거부` : COPY.invalidInput);
        setIssueSignal((signal) => signal + 1);
      }
    },
  });

  const serverRows = list.rows.map(rowFromDto);
  const rows: Row[] = [
    ...serverRows.map((row) => (edits[row.id] ? withPatch(row, edits[row.id]!.patch) : row)),
    ...newRows.filter((row) => row.page === list.page),
  ];
  const dirtyCount = Object.keys(edits).length + newRows.length;

  const clientName = (id: string) => references.clients.find((client) => client.id === id)?.name ?? "";
  const projectName = (id: string | null) => (id ? (references.projects.find((project) => project.id === id)?.name ?? "") : "");
  const evidenceLabel = (value: string | null) => (value ? (references.evidenceTypes.find((item) => item.value === value)?.label ?? value) : "");

  // 그룹 머리글 = 클라이언트 + 서버가 계산한 최종 잔액(S9 · D-91). 저장 전 새 줄의 클라이언트가 이 쪽에 없으면 이름만.
  function groupLabel(row: Row): string {
    if (!row.clientId) return "—";
    const name = row.clientName || clientName(row.clientId);
    const balance = list.clientBalances?.find((entry) => entry.clientId === row.clientId);
    return balance ? `${name} · 잔액 ${formatKrw(balance.balanceKrw)}` : name;
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
      else next[rowId] = { base, patch: merged };
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
      case "evidenceType":
        applyPatch(rowId, { [columnKey]: value === "" ? null : value });
        return;
      case "taxInvoiceNumber":
      case "note":
        applyPatch(rowId, { [columnKey]: value.trim() === "" ? null : value.trim() });
        return;
      case "clientId": {
        if (value === "" || value === row.clientId) return;
        // 다른 클라이언트의 프로젝트는 남기지 않는다(서버도 거부한다).
        const keepProject = references.projects.some((project) => project.id === row.projectId && project.clientId === value);
        applyPatch(rowId, { clientId: value, clientName: clientName(value), projectId: keepProject ? row.projectId : null });
        return;
      }
    }
  }

  function addRow() {
    if (!newRowCells || isExecuting) return;
    // ENG-D10 — 새 줄 id는 화면이 만든 uuid(행 키도 그 값). 응답을 잃어 다시 보내도 서버가 한 행만 남긴다.
    const id = crypto.randomUUID();
    setSavedAt(null);
    setNewRows((prev) => [
      ...prev,
      {
        id,
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
        evidenceType: null,
        taxInvoiceNumber: null,
        note: null,
        balanceKrw: null,
        cells: newRowCells,
        page: list.page,
      },
    ]);
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

  function handleSave() {
    if (savingRef.current || isExecuting || dirtyCount === 0) return;
    savingRef.current = true;
    setSavedAt(null);
    setRejectionSummary(null);
    const sent = [...Object.values(edits).map((edit) => withPatch(edit.base, edit.patch)), ...newRows];
    sentIdsRef.current = sent.map((row) => row.id);
    setSentCount(sent.length);
    execute({ rows: sent.map(toPayload), page: list.page });
  }

  // 키보드 Ctrl+S는 표가 열린 편집기를 먼저 커밋(blur)한 뒤 부른다 — 그 커밋이 반영된 다음 렌더에서 저장한다(04-30 선례).
  const [saveRequests, setSaveRequests] = useState(0);
  const saveAfterCommit = useEffectEvent(() => handleSave());
  useEffect(() => {
    if (saveRequests > 0) saveAfterCommit();
  }, [saveRequests]);

  const [cellEditing, setCellEditing] = useState(false);

  const editability = (row: Row, field: ReserveCellField): CellEditability => row.cells[field];

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
      editCell: (row, ctx) => <TextEditCell ariaLabel="날짜" initialValue={row.entryDate} onCommit={ctx.onCommit} />,
    },
    {
      key: "direction",
      header: "구분",
      priority: "p1",
      editability: (row) => editability(row, "direction"),
      cell: (row) => directionLabel(row.direction),
      copyText: (row) => directionLabel(row.direction),
      editCell: (row, ctx) => (
        <SelectEditCell id={`reserve-direction-${row.id}`} ariaLabel="구분" initialValue={row.direction} options={DIRECTION_OPTIONS} onCommit={ctx.onCommit} />
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
      cell: (row) => projectName(row.projectId) || "—",
      copyText: (row) => projectName(row.projectId),
      editCell: (row, ctx) => (
        <SelectEditCell id={`reserve-project-${row.id}`} ariaLabel="프로젝트" initialValue={row.projectId ?? ""} options={clientProjects(row)} onCommit={ctx.onCommit} />
      ),
    },
    {
      key: "evidenceType",
      header: "증빙 종류",
      priority: "p3",
      editability: (row) => editability(row, "evidenceType"),
      cell: (row) => evidenceLabel(row.evidenceType) || "—",
      copyText: (row) => evidenceLabel(row.evidenceType),
      editCell: (row, ctx) => (
        <SelectEditCell
          id={`reserve-evidence-${row.id}`}
          ariaLabel="증빙 종류"
          initialValue={row.evidenceType ?? ""}
          options={references.evidenceTypes}
          onCommit={ctx.onCommit}
        />
      ),
    },
    {
      key: "taxInvoiceNumber",
      header: "세금계산서 번호",
      priority: "p3",
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
      copyText: (row) => row.note ?? "",
      editCell: (row, ctx) => <TextEditCell ariaLabel="메모" initialValue={row.note ?? ""} onCommit={ctx.onCommit} />,
    },
    {
      key: "clientId",
      header: "클라이언트",
      priority: "p3",
      editability: (row) => editability(row, "clientId"),
      cell: (row) => row.clientName || clientName(row.clientId) || "—",
      copyText: (row) => row.clientName,
      editCell: (row, ctx) => (
        <SelectEditCell
          id={`reserve-client-${row.id}`}
          ariaLabel="클라이언트"
          initialValue={row.clientId}
          options={references.clients.map((client) => ({ value: client.id, label: client.name }))}
          onCommit={ctx.onCommit}
        />
      ),
    },
  ];

  const footerNotices: FooterNoticeItem[] = [];
  if (rejectionSummary) footerNotices.push({ tone: "danger", text: rejectionSummary });
  if (result.serverError) footerNotices.push({ tone: "danger", text: result.serverError });

  return (
    <>
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <PageHeader title="리저브 대장" subtitle="클라이언트별 리저브 입출금" />
        </div>
        {canWrite ? (
          <Button
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

      <Table
        caption="리저브 대장"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        groupBy={groupLabel}
        openCell={openCell}
        enableGridKeyboard
        onEditingChange={setCellEditing}
        onCellCommit={commitCell}
        cellIssue={cellIssue}
        cellDirty={isDirtyCell}
        firstIssueSignal={issueSignal}
        emptyMessage={canWrite ? COPY.empty : COPY.emptyReadOnly}
        emptyAction={canWrite ? { label: COPY.addRow, shortcut: "Ctrl+Enter", onClick: addRow } : undefined}
        keyboard={{
          onNewRow: canWrite ? () => addRow() : undefined,
          onSave: () => setSaveRequests((count) => count + 1),
        }}
        footerNotices={footerNotices}
        footerSuccess={savedAt ? savedNoticeText(sentCount, savedAt) : null}
        footer={(notice) => (
          <tr>
            <td colSpan={columns.length} className={styles.footerCell}>
              {`전체 ${list.total ?? 0}건`}
              {notice}
            </td>
          </tr>
        )}
      />

      {canWrite && rows.length > 0 ? (
        <div className={styles.addLine}>
          <Button variant="tertiary" onClick={addRow}>
            {COPY.addRow}
          </Button>
        </div>
      ) : null}
    </>
  );
}
