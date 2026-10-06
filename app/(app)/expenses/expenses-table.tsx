"use client";

import Link from "next/link";
import { Table } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import type { StatusWord } from "@/ui/status-tag/status-map";
import { Num } from "@/ui/num/Num";
import { formatForeignLine } from "@/lib/format-number";
import type { ExpenseListRowDto } from "@/domain/expenses/list";
import { EXPENSE_COLUMN_LABELS } from "./list-columns";
import styles from "./expenses.module.css";

// 05-08(UI-SPEC S8 · §6-1 원장 · §7-3): 읽기 표 — 서버가 정한 그룹 · 순서 그대로 그리고 행 안에 행동 버튼이 없다.
// 「프로젝트 · 항목」 칸이 문서 링크(폰은 행 전체 — phoneRowLink). 기안 · 금액 열은 서버가 보낸 여부로만 그린다.
// 폰(<700)은 P1(프로젝트 · 항목 · 금액 · 상태) + 접힌 줄 `거래처 · 지급 예정`, 외화 2행 · `프로젝트 미연결 · {종류}`도 접힌 줄로 내린다.
export type ExpenseTableRow = Partial<ExpenseListRowDto> & { id: string; group: string; groupTone?: "warning" };

function foreignLine(row: ExpenseTableRow): string | null {
  return row.supply ? formatForeignLine(row.supply) : null;
}

export function ExpensesTable({ rows, drafterColumn, amountColumn }: { rows: ExpenseTableRow[]; drafterColumn: boolean; amountColumn: boolean }) {
  const columns: TableColumn<ExpenseTableRow>[] = [
    {
      key: "number",
      header: EXPENSE_COLUMN_LABELS.number,
      priority: "p3",
      collapseBelow: 1280,
      cell: (row) => <Num value={row.number ?? null} />,
    },
    {
      key: "title",
      header: EXPENSE_COLUMN_LABELS.title,
      priority: "p1",
      cell: (row) => (
        <span className={styles.titleCell}>
          <Link href={`/expenses/${row.id}`} className={styles.link} data-row-link="">
            {row.title ?? "—"}
          </Link>
          {row.unlinkedText ? <span className={styles.wideSecondLine}>{row.unlinkedText}</span> : null}
        </span>
      ),
    },
    {
      key: "vendor",
      header: EXPENSE_COLUMN_LABELS.vendor,
      priority: "p2",
      cell: (row) => <span className={styles.vendorCell}>{row.vendorName ?? "—"}</span>,
      summary: (row) => row.vendorName ?? "—",
    },
    ...(amountColumn
      ? [
          {
            key: "amount",
            header: EXPENSE_COLUMN_LABELS.amount,
            priority: "p1",
            align: "right",
            cell: (row) => {
              const supply = row.supply;
              if (!supply) return <Num value={null} />;
              if (supply.currency === "KRW") return <Num value={supply.amountKrw} />;
              return (
                <>
                  <span className={styles.wideOnly}>
                    <Num value={supply.amountKrw} fx={{ currency: supply.currency, amount: supply.amount, rate: supply.fxRate }} />
                  </span>
                  <span className={styles.phoneOnly}>
                    <Num value={supply.amountKrw} />
                  </span>
                </>
              );
            },
          } satisfies TableColumn<ExpenseTableRow>,
        ]
      : []),
    {
      key: "payment",
      header: EXPENSE_COLUMN_LABELS.payment,
      priority: "p2",
      cell: (row) => <Num value={row.scheduledPaymentDate ? row.scheduledPaymentDate.slice(5) : null} />,
      // 접힌 줄 — 지급 예정 뒤에 외화 2행 · 미연결 2행(폰은 주 행에서 숨긴 두 줄을 여기서 한 번만 보인다).
      summary: (row) => {
        const fx = amountColumn ? foreignLine(row) : null;
        return (
          <>
            <Num value={row.scheduledPaymentDate ? row.scheduledPaymentDate.slice(5) : null} />
            {fx ? (
              <>
                {" · "}
                <Num value={fx} />
              </>
            ) : null}
            {row.unlinkedText ? (
              <>
                {" · "}
                <span>{row.unlinkedText}</span>
              </>
            ) : null}
          </>
        );
      },
    },
    ...(drafterColumn
      ? [
          {
            key: "drafter",
            header: EXPENSE_COLUMN_LABELS.drafter,
            priority: "p3",
            collapseBelow: 1280,
            cell: (row) => <span className={styles.nowrap}>{row.drafterName ?? "—"}</span>,
          } satisfies TableColumn<ExpenseTableRow>,
        ]
      : []),
    {
      key: "status",
      header: EXPENSE_COLUMN_LABELS.status,
      priority: "p1",
      cell: (row) =>
        row.statusWord ? (
          <span className={styles.statusCell}>
            <StatusTag status={row.statusWord as StatusWord} variant="text" />
            {row.statusDate ? (
              <>
                {" "}
                <Num value={row.statusDate} />
              </>
            ) : null}
          </span>
        ) : null,
    },
  ];

  return (
    <Table
      caption="지출결의"
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      groupBy={(row) => row.group}
      groupHeader={(row) => (row.groupTone === "warning" ? <span className={styles.warningGroup}>{row.group}</span> : row.group)}
      phoneRowLink
    />
  );
}
