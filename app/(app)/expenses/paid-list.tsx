"use client";

import Link from "next/link";
import { Table } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
import { Num } from "@/ui/num/Num";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import type { StatusWord } from "@/ui/status-tag/status-map";
import type { PaidPaymentRowDto } from "@/domain/expenses/dto";
import { formatKrw } from "@/lib/format-number";
import { PAID_COLUMN_LABELS } from "./list-columns";
import styles from "./expenses.module.css";

// 06-20(UI-SPEC S3): 「지급 완료」 보기 표 — 서버가 정한 주 그룹 · 순서 그대로 그리고 1차가 없다(지급 취소는 문서 화면 S5).
// 지급 방식은 낱말만(계좌 글자 없음 — 대표가 이 목록을 읽는다, O-17). 번호는 식별자형 링크 → 문서 화면, 폰은 행 전체(phoneRowLink).
// 열 우선순위: P1 = 항목 · 이체액 · 지급일, P2 = 번호 · 거래처 · 증빙, P3 = 지급 방식 · 차이 사유 · 처리한 사람(좁은 PC에서도 P3부터 숨는다).
export type PaidScreenRow = Partial<PaidPaymentRowDto> & { id: string; group: string };

// 차이는 부호를 붙인다(`-3,300` · `+1,200` — S1 · S5 SignedNum과 같은 꼴). 값은 서버 diffKrw.
function SignedNum({ value }: { value: number }) {
  return <Num value={value > 0 ? `+${formatKrw(value)}` : formatKrw(value)} />;
}

export function PaidList({ rows, amountColumn }: { rows: PaidScreenRow[]; amountColumn: boolean }) {
  const columns: TableColumn<PaidScreenRow>[] = [
    {
      key: "number",
      header: PAID_COLUMN_LABELS.number,
      priority: "p2",
      cell: (row) =>
        row.number ? (
          <Link href={`/expenses/${row.id}`} className={styles.link} aria-label={`${row.number} 지출결의 열기`} data-paid-number="">
            <Num value={row.number} />
          </Link>
        ) : (
          <Num value={null} />
        ),
      summary: (row) => <Num value={row.number ?? null} />,
    },
    {
      key: "title",
      header: PAID_COLUMN_LABELS.title,
      priority: "p1",
      cell: (row) => (
        <span className={`${styles.titleCell} ${styles.paidTitle}`} data-row-id={row.id}>
          <Link href={`/expenses/${row.id}`} className={styles.link} title={row.title ?? undefined} data-row-link="">
            {row.title ?? "—"}
          </Link>
        </span>
      ),
    },
    {
      key: "vendor",
      header: PAID_COLUMN_LABELS.vendor,
      priority: "p2",
      cell: (row) => (
        <span className={styles.vendorCell} title={row.vendorName ?? undefined}>
          {row.vendorName ?? "—"}
        </span>
      ),
      summary: (row) => row.vendorName ?? "—",
    },
    {
      key: "method",
      header: PAID_COLUMN_LABELS.method,
      priority: "p3",
      collapseBelow: 1280,
      cell: (row) => <span className={styles.nowrap}>{row.paymentMethodName ?? "—"}</span>,
    },
    { key: "payDate", header: PAID_COLUMN_LABELS.payDate, priority: "p1", cell: (row) => <Num value={row.payDate ? row.payDate.slice(5) : null} /> },
    ...(amountColumn
      ? ([
          {
            key: "transfer",
            header: PAID_COLUMN_LABELS.transfer,
            priority: "p1",
            align: "right",
            cell: (row) => <Num value={row.transferKrw ?? null} />,
            // 2행 `차이 {±}` — 차이 0이면 없다.
            secondaryLine: (row) =>
              row.diffKrw ? (
                <span className={styles.diffLine}>
                  {"차이 "}
                  <SignedNum value={row.diffKrw} />
                </span>
              ) : null,
          },
        ] satisfies TableColumn<PaidScreenRow>[])
      : []),
    {
      key: "diffReason",
      header: PAID_COLUMN_LABELS.diffReason,
      priority: "p3",
      collapseBelow: 1280,
      cell: (row) =>
        row.diffReason ? (
          <span className={styles.reasonCell} title={row.diffReason}>
            {row.diffReason}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "evidence",
      header: PAID_COLUMN_LABELS.evidence,
      priority: "p2",
      cell: (row) => <span className={styles.evidenceCell}>{row.evidenceStatus ? <StatusTag status={row.evidenceStatus as StatusWord} variant="text" /> : "—"}</span>,
      summary: (row) => row.evidenceStatus ?? "—",
    },
    {
      key: "processedBy",
      header: PAID_COLUMN_LABELS.processedBy,
      priority: "p3",
      collapseBelow: 1280,
      cell: (row) => <span className={styles.nowrap}>{row.processedByName ?? "—"}</span>,
    },
  ];

  return <Table caption="지급 완료" columns={columns} rows={rows} getRowId={(row) => row.id} groupBy={(row) => row.group} phoneRowLink />;
}
