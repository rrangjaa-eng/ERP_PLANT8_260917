"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { saveQuoteLinesAction } from "../actions";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { Button } from "@/ui/button/Button";
import { FormAlert } from "@/ui/form-alert/FormAlert";
import { Table } from "@/ui/table/Table";
import { Select } from "@/ui/select/Select";
import type { TableColumn } from "@/ui/table/types";
import type { QuoteLineDto } from "@/domain/quotes/lines";
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
  executionAmount: number;
  quoteAmountKrw: number;
  profitKrw: number;
  lineStatus: string;
  note: string | null;
  dirty: boolean;
};

const LINE_STATUS_LABELS: Record<string, string> = {
  not_started: "미착수",
  cancelled: "취소",
};

function fromDto(dto: QuoteLineDto): DraftLine {
  return {
    clientKey: dto.id,
    id: dto.id,
    version: dto.version,
    subcategory: dto.subcategory,
    itemName: dto.itemName,
    vendorId: dto.vendorId,
    quantity: dto.quantity,
    unitPriceAmount: dto.unitPrice.amountKrw,
    executionAmount: dto.execution.amountKrw,
    quoteAmountKrw: dto.quoteAmountKrw,
    profitKrw: dto.profitKrw,
    lineStatus: dto.lineStatus,
    note: dto.note,
    dirty: false,
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
    executionAmount: 0,
    quoteAmountKrw: 0,
    profitKrw: 0,
    lineStatus: "not_started",
    note: null,
    dirty: true,
  };
}

function formatKrw(value: number): string {
  return value.toLocaleString("ko-KR");
}

// SYSTEM.md §6-2 + §7-3 보강 — 견적 원장. 화면의 1차 「일괄 저장 ⌘S N」
// 하나가 이 표의 dirty 전부를 한 트랜잭션으로 저장한다(사). **표는 항상
// 편집 가능이다**(§7-3 "모드를 나누지 않는다") — editable=true인 동안
// 편집 가능 셀이 인풋으로 렌더된다(한 칸 클릭 진입 대신 이 플랜은 always-on
// 인풋으로 트레이서를 얇게 유지했다 — 방향키 로빙·Esc 되돌리기 전체는
// 04-04). 계산 열(견적가·차익)은 누구에게나 항상 읽기 전용.
export function QuoteLedger({
  projectName,
  projectNumber,
  revisionSeq,
  statusLabel,
  revisionId,
  initialLines,
  vendors,
  subcategories,
  editable,
}: {
  projectName: string;
  projectNumber: string;
  revisionSeq: number;
  statusLabel: string;
  revisionId: string;
  initialLines: QuoteLineDto[];
  vendors: QuoteTableOption[];
  subcategories: QuoteTableCodeOption[];
  editable: boolean;
}) {
  const [lines, setLines] = useState<DraftLine[]>(() => initialLines.map(fromDto));
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const { execute, result, isExecuting } = useAction(saveQuoteLinesAction, {
    onSuccess: ({ data }) => {
      if (!data?.lines) return;
      setLines(data.lines.map(fromDto));
      setSavedAt(
        new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }),
      );
    },
  });

  const dirtyCount = lines.filter((line) => line.dirty).length;

  function updateLine(clientKey: string, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((line) => (line.clientKey === clientKey ? { ...line, ...patch, dirty: true } : line)),
    );
  }

  function addLine() {
    setLines((prev) => [...prev, newDraftLine(subcategories[0]?.value ?? "")]);
  }

  function handleSave() {
    const dirtyLines = lines.filter((line) => line.dirty);
    execute({
      revisionId,
      rows: dirtyLines.map((line) => ({
        id: line.id,
        version: line.version,
        subcategory: line.subcategory,
        itemName: line.itemName,
        vendorId: line.vendorId ?? undefined,
        quantity: line.quantity,
        unitPrice: { currency: "KRW" as const, amount: line.unitPriceAmount, fxRate: 1 },
        execution: { currency: "KRW" as const, amount: line.executionAmount, fxRate: 1 },
        lineStatus: line.lineStatus,
        note: line.note ?? undefined,
      })),
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
      cell: (row) =>
        editable ? (
          <Select
            id={`subcategory-${row.clientKey}`}
            aria-label="소분류"
            value={row.subcategory}
            onChange={(event) => updateLine(row.clientKey, { subcategory: event.target.value })}
            options={subcategories.map((option) => ({ value: option.value, label: option.label }))}
            className={styles.cellSelect}
          />
        ) : (
          subcategoryLabel(row.subcategory)
        ),
    },
    {
      key: "itemName",
      header: "항목",
      priority: "p1",
      editability: () => (editable ? "edit" : "locked"),
      cell: (row) =>
        editable ? (
          <input
            aria-label="항목"
            type="text"
            value={row.itemName}
            onChange={(event) => updateLine(row.clientKey, { itemName: event.target.value })}
            className={styles.cellInput}
          />
        ) : (
          row.itemName
        ),
    },
    {
      key: "vendor",
      header: "거래처",
      priority: "p2",
      editability: () => (editable ? "edit" : "locked"),
      cell: (row) =>
        editable ? (
          <Select
            id={`vendor-${row.clientKey}`}
            aria-label="거래처"
            value={row.vendorId ?? ""}
            onChange={(event) => updateLine(row.clientKey, { vendorId: event.target.value || null })}
            options={vendors.map((option) => ({ value: option.id, label: option.name }))}
            className={styles.cellSelect}
          />
        ) : (
          vendorLabel(row.vendorId)
        ),
    },
    {
      key: "quantity",
      header: "수량",
      priority: "p2",
      align: "right",
      editability: () => (editable ? "edit" : "locked"),
      cell: (row) =>
        editable ? (
          <input
            aria-label="수량"
            type="text"
            inputMode="decimal"
            value={row.quantity}
            onChange={(event) => updateLine(row.clientKey, { quantity: Number(event.target.value) || 0 })}
            className={styles.cellInputNumeric}
          />
        ) : (
          row.quantity
        ),
    },
    {
      key: "unitPrice",
      header: "단가",
      priority: "p2",
      align: "right",
      editability: () => (editable ? "edit" : "locked"),
      cell: (row) =>
        editable ? (
          <input
            aria-label="단가"
            type="text"
            inputMode="decimal"
            value={row.unitPriceAmount}
            onChange={(event) => updateLine(row.clientKey, { unitPriceAmount: Number(event.target.value) || 0 })}
            className={styles.cellInputNumeric}
          />
        ) : (
          formatKrw(row.unitPriceAmount)
        ),
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
      cell: (row) =>
        editable ? (
          <input
            aria-label="실행가"
            type="text"
            inputMode="decimal"
            value={row.executionAmount}
            onChange={(event) => updateLine(row.clientKey, { executionAmount: Number(event.target.value) || 0 })}
            className={styles.cellInputNumeric}
          />
        ) : (
          formatKrw(row.executionAmount)
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
      cell: (row) =>
        editable ? (
          <input
            aria-label="비고"
            type="text"
            value={row.note ?? ""}
            onChange={(event) => updateLine(row.clientKey, { note: event.target.value || null })}
            className={styles.cellInput}
          />
        ) : (
          (row.note ?? "—")
        ),
    },
  ];

  const saveDisabledReason = dirtyCount === 0 ? "저장할 편집 없음 · 셀을 고치면 켜집니다" : undefined;

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
          {editable ? (
            <Button
              type="button"
              variant="primary"
              pending={isExecuting}
              disabled={dirtyCount === 0}
              disabledReason={saveDisabledReason}
              shortcut="⌘S"
              onClick={handleSave}
            >
              일괄 저장{dirtyCount > 0 ? ` ${dirtyCount}` : ""}
            </Button>
          ) : null}
        </div>
      </div>

      {result.serverError ? <FormAlert>{result.serverError}</FormAlert> : null}

      <Table
        caption="견적 줄"
        columns={columns}
        rows={lines}
        getRowId={(row) => row.clientKey}
        emptyMessage="이 프로젝트에 견적 줄이 없습니다"
        emptyAction={editable ? { label: "첫 줄 만들기 ⌘↵", onClick: addLine } : undefined}
        footer={
          <tr>
            <td colSpan={columns.length} className={styles.footerCell}>
              {`합계 (공급가액 · ${lines.length}줄)`}
              {savedAt ? <span className={styles.savedTag}> 저장됨 {savedAt}</span> : null}
            </td>
          </tr>
        }
      />

      {editable && lines.length > 0 ? (
        <button type="button" className={styles.addLineButton} onClick={addLine}>
          줄 추가
        </button>
      ) : null}
    </>
  );
}
