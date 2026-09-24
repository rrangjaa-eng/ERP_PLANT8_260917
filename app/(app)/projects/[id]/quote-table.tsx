"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { saveProjectLedgerAction } from "../actions";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { Button } from "@/ui/button/Button";
import { FormAlert } from "@/ui/form-alert/FormAlert";
import { Table } from "@/ui/table/Table";
import { Select } from "@/ui/select/Select";
import { RowSheet } from "@/ui/table/RowSheet";
import { useDirtyStorage } from "@/ui/table/use-dirty-storage";
import { applyPaste, type PasteColumn } from "@/ui/table/use-clipboard-paste";
import { normalizeNumericPaste } from "@/ui/table/parse-tsv";
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
  /** 04-04 — 이 줄을 불러왔을 때(또는 마지막 저장 성공 직후) 읽은 값의
   * 스냅샷. 버전 충돌 판정의 baseline으로 저장 페이로드에 실린다(D-65).
   * 새 줄(id 없음)에서는 쓰이지 않는다. */
  baseline: QuoteLineBaseline;
  /** 04-04 — 붙여넣기/저장이 남긴 셀별 오류(§7-3 (나)(다)). 키는 열 key. */
  cellErrors: Record<string, string>;
};

const LINE_STATUS_LABELS: Record<string, string> = {
  not_started: "미착수",
  cancelled: "취소",
};

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
  };
}

function formatKrw(value: number): string {
  return value.toLocaleString("ko-KR");
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

// 04-04 — 클릭/Enter로 편집에 들어가는 한 칸짜리 텍스트/숫자 셀. 순수
// 비제어 입력이라(값은 commit 시점에만 읽는다) 훅이 필요 없다 — 일반
// 함수로 충분하다(Rules of Hooks 위반 없음).
function textEditCell(opts: {
  ariaLabel: string;
  initialValue: string;
  numeric?: boolean;
  onCommit: (value: string) => void;
}) {
  return (
    <input
      aria-label={opts.ariaLabel}
      type="text"
      inputMode={opts.numeric ? "decimal" : undefined}
      defaultValue={opts.initialValue}
      autoFocus
      className={opts.numeric ? styles.cellInputNumeric : styles.cellInput}
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
  const amountRef = useRef<HTMLInputElement>(null);
  const fxRateRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  function commit() {
    // F3 — `Number(value) || 0`은 "1,000,000"을 조용히 0으로 만든다. 붙여넣기와
    // 같은 파서(normalizeNumericPaste)로 읽고, 숫자가 아니면 0을 쓰지 않고
    // 이전 값을 유지한 채 amountValid=false로 알려 호출부가 오류 셀로 고정한다.
    const amountRaw = amountRef.current?.value ?? String(initialAmount);
    const parsedAmount = normalizeNumericPaste(amountRaw);
    const fxRate =
      currency === "KRW" ? 1 : (normalizeNumericPaste(fxRateRef.current?.value ?? String(initialFxRate)) ?? initialFxRate);
    onCommit(JSON.stringify({ amount: parsedAmount ?? initialAmount, amountValid: parsedAmount !== null, currency, fxRate, fxRateTouched }));
  }

  function handleBlur(event: React.FocusEvent<HTMLElement>) {
    const next = event.relatedTarget as Node | null;
    if (!next || !wrapRef.current?.contains(next)) commit();
  }

  return (
    <div className={styles.contractRow} ref={wrapRef}>
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
        ref={amountRef}
        aria-label="단가"
        type="text"
        inputMode="decimal"
        defaultValue={initialAmount}
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
        <input
          ref={fxRateRef}
          aria-label="단가 환율"
          type="text"
          inputMode="decimal"
          defaultValue={currency === initialCurrency ? initialFxRate : usdDefaultFxRate}
          className={styles.cellInputNumeric}
          onChange={() => setFxRateTouched(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
          onBlur={handleBlur}
        />
      ) : null}
    </div>
  );
}

// SYSTEM.md §6-2 + §7-3 보강 (가)~(아) — 견적 원장 + 매출 섹션. 화면의 1차
// 「일괄 저장 ⌘S N」 하나가 견적 줄 표 + 매출 섹션의 dirty 전부를 한
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

  const { execute, result, isExecuting } = useAction(saveProjectLedgerAction, {
    onSuccess: ({ data }) => {
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
  const errorCellCount = lines.reduce((sum, line) => sum + Object.keys(line.cellErrors).length, 0);

  function updateLine(clientKey: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line) => (line.clientKey === clientKey ? { ...line, ...patch, dirty: true } : line)));
  }

  // 04-04(§7-3 (나)) — 특정 셀의 오류를 지운다(사용자가 그 셀을 직접
  // 고쳤을 때). 오류는 다른 셀 편집으로 사라지지 않는다 — 그 셀 자신을
  // 고쳐야만 지워진다.
  function clearCellError(clientKey: string, columnKey: string) {
    setLines((prev) =>
      prev.map((line) => {
        if (line.clientKey !== clientKey || !(columnKey in line.cellErrors)) return line;
        const cellErrors = { ...line.cellErrors };
        delete cellErrors[columnKey];
        return { ...line, cellErrors };
      }),
    );
  }

  function commitCell(clientKey: string, columnKey: string, patch: Partial<DraftLine>) {
    clearCellError(clientKey, columnKey);
    updateLine(clientKey, patch);
  }

  // F3 — 타이핑한 숫자 칸 커밋. `Number(value) || 0`은 "1,000,000"을 조용히
  // 0으로 만든다 — 붙여넣기와 같은 파서(normalizeNumericPaste)로 읽고,
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
      next.splice(targetIndex, 0, { ...moved, subcategory: crossedGroup ? neighborGroup : moved.subcategory, dirty: true });
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
    if (errorCellCount > 0) return; // §7-3 "오류가 한 칸이라도 있으면 화면 전체가 거부" — 서버에 보내지 않는다.

    const dirtyLines = lines.filter((line) => line.dirty);
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
      cell: (row) => row.quantity,
      editCell: (row, ctx) =>
        textEditCell({
          ariaLabel: "수량",
          initialValue: String(row.quantity),
          numeric: true,
          onCommit: (value) => {
            commitNumericCell(row.clientKey, "quantity", value, (num) => ({ quantity: num }));
            ctx.onCommit(value);
          },
        }),
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
        row.unitPriceCurrency !== "KRW" ? `${row.unitPriceCurrency} ${row.unitPriceAmount.toFixed(2)} @${row.unitPriceFxRate}` : null,
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
      editCell: (row, ctx) =>
        textEditCell({
          ariaLabel: "실행가",
          initialValue: String(row.executionAmount),
          numeric: true,
          onCommit: (value) => {
            commitNumericCell(row.clientKey, "execution", value, (num) => ({ executionAmount: num }));
            ctx.onCommit(value);
          },
        }),
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
        if (cell.result.status === "error") {
          cellErrors[cell.columnKey] = cell.result.reason;
          next[cell.rowIndex] = { ...target, cellErrors, dirty: true };
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
            patch = { quantity: Number(value) || 0 };
            break;
          case "unitPrice": {
            // 붙여넣기는 숫자 값 하나만 받는다 — 항상 KRW로 들어간다(외화
            // 붙여넣기는 이 플랜 범위 밖, 04-02가 만든 통화 select로 직접
            // 편집한다). amountKrw도 함께 갱신해야 읽기 모드 표시(§2-4)가
            // 맞는다 — amount만 바꾸면 화면이 예전 amountKrw를 계속 보여준다.
            const amount = Number(value) || 0;
            patch = { unitPriceAmount: amount, unitPriceCurrency: "KRW", unitPriceFxRate: 1, unitPriceAmountKrw: amount };
            break;
          }
          case "execution":
            patch = { executionAmount: Number(value) || 0 };
            break;
          case "note":
            patch = { note: value || null };
            break;
          default:
            break;
        }
        next[cell.rowIndex] = { ...target, ...patch, cellErrors, dirty: true };
      }
      return next;
    });

    if (result.droppedColumnCount > 0) {
      setPasteWarning(`붙여넣기 · 오른쪽 ${result.droppedColumnCount}칸 버림`);
    } else {
      setPasteWarning(null);
    }
  }

  function cellIssueFor(row: DraftLine, columnKey: string): CellIssue | undefined {
    const message = row.cellErrors[columnKey];
    if (!message) return undefined;
    return { kind: "error", message };
  }

  const saveDisabledReason = dirtyCount === 0 ? "바뀐 칸 없음 · 고칠 칸을 눌러 주세요" : undefined;

  // 04-04 — 서버가 돌려준 문자열을 그대로 쓴다(화면이 이유를 새로 만들지
  // 않는다, Task 2 acceptance criterion). errorCellCount>0이면 handleSave가
  // execute()를 아예 부르지 않으므로(클라이언트 게이트) result.serverError는
  // 그 경로에서 생기지 않는다 — 여기 남는 건 서버가 실제로 거부한 경우뿐이다.
  // F2 — next-safe-action의 validationErrors(예: 항목명 빈 값)는 serverError와
  // 달리 조용히 무시되고 있었다 — 같은 요약 자리에 일반 문구로 띄운다.
  const rejectionSummary = result.serverError ?? (result.validationErrors ? "저장하지 못했습니다 · 입력값을 확인하세요" : undefined);
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
              shortcut="⌘S"
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
        emptyAction={editable ? { label: "첫 줄 만들기 ⌘↵", onClick: () => addLine() } : undefined}
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

      {/* SYSTEM.md §7-9 — 편집용 표가 있는 화면 하단 힌트 줄, 정확히 7개, 폰에서 숨는다. */}
      {editable ? (
        <p className={styles.hintRow}>
          이동 Tab ↑↓←→ · 범위 복사 ⌘C / 붙여넣기 ⌘V · 취소 Esc · 새 줄 ⌘↵ · 줄 이동 Alt↑↓ · 줄 복제 ⌘D · 저장 ⌘S
        </p>
      ) : null}

      {editable && lines.length > 0 ? (
        <button type="button" className={styles.addLineButton} onClick={() => addLine()}>
          줄 추가
        </button>
      ) : null}

      {deleteConfirm ? (
        <DeleteLineDialog
          itemName={deleteConfirm.itemName}
          quoteAmountKrw={deleteConfirm.quoteAmountKrw}
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={confirmDeleteLine}
        />
      ) : null}

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
                openSheetRow.unitPriceCurrency !== "KRW"
                  ? `${openSheetRow.unitPriceCurrency} ${openSheetRow.unitPriceAmount.toFixed(2)} @${openSheetRow.unitPriceFxRate}`
                  : "—",
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

// 04-04(아) — Delete 키·행동 줄의 줄 삭제 확인. 연결 문서가 없는 줄의
// "삭제"만 이 페이즈 범위다(Copywriting Contract "Destructive — 견적 줄
// 삭제"). 연결 문서가 있는 줄의 "취소" 갈래는 지출결의가 생기는 페이즈
// (04-06 이후) 몫 — 이 DTO에는 아직 연결 문서 여부 필드가 없다.
function DeleteLineDialog({
  itemName,
  quoteAmountKrw,
  onCancel,
  onConfirm,
}: {
  itemName: string;
  quoteAmountKrw: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className={styles.dialogScrim} role="presentation">
      <div role="alertdialog" aria-modal="true" aria-labelledby="delete-line-title" className={styles.dialog}>
        <h2 id="delete-line-title" className={styles.dialogTitle}>
          견적 줄 삭제
        </h2>
        <p className={styles.dialogSubtitle}>
          {itemName || "(항목명 없음)"} · {formatKrw(quoteAmountKrw)}
        </p>
        <p className={styles.dialogBody}>보관함으로 이동합니다 · 관리자가 복원할 수 있습니다</p>
        <div className={styles.dialogActions}>
          <Button type="button" variant="primary" onClick={onConfirm}>
            삭제
          </Button>
          <Button type="button" variant="tertiary" shortcut="Esc" onClick={onCancel}>
            취소
          </Button>
        </div>
      </div>
    </div>
  );
}

