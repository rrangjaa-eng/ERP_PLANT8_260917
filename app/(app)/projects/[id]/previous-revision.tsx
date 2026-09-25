"use client";

import { useEffect, useRef, useState } from "react";
import { listRevisionLinesAction } from "../actions";
import type { QuoteLineDto } from "@/domain/quotes/lines";
import { QUOTE_LINE_KINDS, type QuoteLineKind } from "@/domain/quotes/edit-scope";
import { formatForeignLine, formatKrw, formatQuantity } from "@/lib/format-number";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { Table } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
import { byKind, lineStatusLabel, quoteLineGroupLabel, type QuoteTableCodeOption, type QuoteTableOption } from "./quote-table";
import styles from "./project-detail.module.css";

// 04-24(DR-13 · S5 · W1) — 이전 차수 읽기 섹션과 견적 줄 읽기 열. 원장(QuoteLedger)과 상태를 나누지 않는다 —
// 1차 · dirty · 보관본 · 검색 파라미터에 닿지 않고, 되돌리기 동작이 없다(D-53).

/** 견적 줄 복사 글자의 입력 행 — 값 필드만(읽기 섹션 DTO 행 · 보관본을 덮은 행 · 격자 편집 행이 이 모양이다). */
export type QuoteLineCopyRow = {
  lineKind: QuoteLineKind;
  subcategory: string;
  itemName: string;
  vendorId: string | null;
  quantity: number;
  unitPriceAmount: number;
  unitPriceCurrency: string;
  unitPriceFxRate: number;
  unitPriceAmountKrw: number;
  quoteAmountKrw: number;
  executionAmount: number;
  profitKrw: number;
  lineStatus: string;
  note: string | null;
};

export type QuoteLineReadReferences = { subcategories: QuoteTableCodeOption[]; vendors: QuoteTableOption[] };

/** `copyText` — 그 열의 화면 첫 줄 글자 그대로(2행 없음). 견적 줄 복사 글자의 유일한 정의다(W1). */
export type QuoteLineReadColumn<Row extends QuoteLineCopyRow> = TableColumn<Row> & { copyText: (row: Row) => string };

// 견적 줄 표(quote-table.tsx)와 같은 열 키·순서·머리글·우선순위·좁은 PC 접기·셀 글자·외화 2행의 읽기 렌더.
export function quoteLineReadColumns<Row extends QuoteLineCopyRow>(
  references: QuoteLineReadReferences,
  rowNumber: (row: Row) => number,
): QuoteLineReadColumn<Row>[] {
  const subcategoryLabel = (value: string) => references.subcategories.find((option) => option.value === value)?.label ?? value;
  const vendorLabel = (id: string | null) => (id ? (references.vendors.find((vendor) => vendor.id === id)?.name ?? id) : "—");
  const column = ({ text, ...rest }: Omit<QuoteLineReadColumn<Row>, "cell" | "copyText"> & { text: (row: Row) => string }) => ({
    ...rest,
    cell: text,
    copyText: text,
  });
  return [
    column({ key: "sort", header: "번호", priority: "p3", collapseBelow: 1280, align: "left", text: (row) => String(rowNumber(row)) }),
    column({ key: "subcategory", header: "소분류", priority: "p3", text: (row) => quoteLineGroupLabel(row, subcategoryLabel) }),
    column({ key: "itemName", header: "항목", priority: "p1", text: (row) => row.itemName }),
    column({ key: "vendor", header: "거래처", priority: "p2", text: (row) => vendorLabel(row.vendorId) }),
    column({
      key: "quantity",
      header: "수량",
      priority: "p2",
      collapseBelow: 1024,
      align: "right",
      text: (row) => (row.lineKind === "quote" ? formatQuantity(row.quantity) : "—"),
    }),
    {
      ...column({
        key: "unitPrice",
        header: "단가",
        priority: "p2",
        collapseBelow: 1024,
        align: "right",
        text: (row) => (row.lineKind === "quote" ? formatKrw(row.unitPriceAmountKrw) : "—"),
      }),
      secondaryLine: (row: Row) => {
        if (row.lineKind !== "quote") return null;
        const line = formatForeignLine({ currency: row.unitPriceCurrency, amount: row.unitPriceAmount, fxRate: row.unitPriceFxRate });
        if (!line) return null;
        const at = line.indexOf(" @");
        return (
          <span className={styles.fxGroups}>
            <span>{line.slice(0, at)}</span> <span>{line.slice(at + 1)}</span>
          </span>
        );
      },
    },
    column({ key: "quoteAmount", header: "견적가", priority: "p2", collapseBelow: 1024, align: "right", text: (row) => formatKrw(row.quoteAmountKrw) }),
    column({ key: "execution", header: "실행가", priority: "p1", align: "right", text: (row) => formatKrw(row.executionAmount) }),
    column({ key: "profit", header: "차익", priority: "p2", collapseBelow: 1280, align: "right", text: (row) => formatKrw(row.profitKrw) }),
    column({ key: "status", header: "상태", priority: "p1", text: (row) => (row.lineKind === "adjustment" ? "—" : lineStatusLabel(row.lineStatus)) }),
    column({ key: "note", header: "비고", priority: "p3", collapseBelow: 1024, text: (row) => row.note ?? "—" }),
  ];
}

type ReadRow = QuoteLineCopyRow & { id: string };

function readRow(dto: QuoteLineDto): ReadRow {
  return {
    id: dto.id,
    lineKind: QUOTE_LINE_KINDS.find((kind) => kind === dto.lineKind) ?? "quote",
    subcategory: dto.subcategory,
    itemName: dto.itemName,
    vendorId: dto.vendorId,
    quantity: dto.quantity,
    unitPriceAmount: dto.unitPrice?.amount ?? 0,
    unitPriceCurrency: dto.unitPrice?.currency ?? "KRW",
    unitPriceFxRate: dto.unitPrice?.fxRate ?? 1,
    unitPriceAmountKrw: dto.unitPrice?.amountKrw ?? 0,
    quoteAmountKrw: dto.quoteAmountKrw,
    executionAmount: dto.execution?.amountKrw ?? 0,
    profitKrw: dto.profitKrw,
    lineStatus: dto.lineStatus,
    note: dto.note,
  };
}

type Entry = { kind: "ready"; rows: ReadRow[] } | { kind: "error" };

// DR-13 — 차수 섹션 바로 아래 섹션. 한 번에 한 차수(seq), 닫혀 있으면 null. 순번별 결과는 이 컴포넌트가 들고 있어
// 같은 차수를 다시 열면 다시 부르지 않는다(닫아도 이 컴포넌트는 남는다).
export function PreviousRevisionSection({
  projectId,
  seq,
  headingId,
  references,
}: {
  projectId: string;
  seq: number | null;
  headingId: string;
  references: QuoteLineReadReferences;
}) {
  const [entries, setEntries] = useState<Record<number, Entry>>({});
  const inflightRef = useRef(new Set<number>());
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (seq === null || entries[seq] || inflightRef.current.has(seq)) return;
    inflightRef.current.add(seq);
    void (async () => {
      let entry: Entry = { kind: "error" };
      try {
        const result = await listRevisionLinesAction({ projectId, revisionSeq: seq });
        if (result?.data) entry = { kind: "ready", rows: byKind(result.data.map(readRow)) };
      } catch {
        // 요청이 끊겨도 섹션 자리 한 줄로만 알린다(원장 무영향).
      }
      inflightRef.current.delete(seq);
      setEntries((prev) => ({ ...prev, [seq]: entry }));
    })();
  }, [projectId, seq, entries]);

  useEffect(() => {
    if (seq !== null) headingRef.current?.focus();
  }, [seq]);

  if (seq === null) return null;
  const entry = entries[seq];

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className={styles.previousTitle}>
        {`상세 견적 ${seq}차`}
      </h2>
      {entry === undefined ? (
        <PreviousRevisionSkeleton />
      ) : entry.kind === "error" ? (
        <ListEmpty
          tone="error"
          message={`${seq}차 불러오지 못함`}
          action={{
            label: "다시 시도",
            onClick: () =>
              setEntries((prev) => {
                const next = { ...prev };
                delete next[seq];
                return next;
              }),
          }}
        />
      ) : (
        <PreviousRevisionTable seq={seq} rows={entry.rows} references={references} />
      )}
    </section>
  );
}

function PreviousRevisionTable({ seq, rows, references }: { seq: number; rows: ReadRow[]; references: QuoteLineReadReferences }) {
  const subcategoryLabel = (value: string) => references.subcategories.find((option) => option.value === value)?.label ?? value;
  const columns = quoteLineReadColumns<ReadRow>(references, (row) => rows.indexOf(row) + 1);
  return (
    <Table
      caption={`상세 견적 ${seq}차 견적 줄`}
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      groupBy={(row) => quoteLineGroupLabel(row, subcategoryLabel)}
      emptyMessage="이 차수에 견적 줄이 없습니다"
      footer={
        <tr>
          <td colSpan={columns.length} className={styles.footerCell}>
            {`합계 (공급가액 · ${rows.length}줄)`}
            <span className={styles.footerQuoteSum}> {`견적 ${formatKrw(rows.reduce((sum, row) => sum + row.quoteAmountKrw, 0))} ·`}</span>
            <span className={styles.footerProfitSum}> {`차익 ${formatKrw(rows.reduce((sum, row) => sum + row.profitKrw, 0))}`}</span>
          </td>
        </tr>
      }
    />
  );
}

// §7-7 LOADING — 머리글 + `--surface` 행 3개, 300ms 뒤에만 보인다(CSS 지연).
function PreviousRevisionSkeleton() {
  return (
    <table className={styles.previousSkeleton} aria-hidden="true">
      <thead>
        <tr>
          <th scope="col">&nbsp;</th>
        </tr>
      </thead>
      <tbody>
        {[0, 1, 2].map((index) => (
          <tr key={index}>
            <td>&nbsp;</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
