"use client";

import Link from "next/link";
import { Table } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import type { CertEventListDto } from "@/domain/certs/events";
import styles from "./events.module.css";

// 04.3-04 Task 3 ② · 04.3-15 — I′1 읽기 표(흰 머리글). domain이 신청됨 → 접수 중 → 닫힘, 그룹 안 당첨일
// 내림차순으로 정렬해 준 순서 그대로. 제출 셀 = 건수 하나(명단이 없어 분모가 없다 — 대조 제외 뺀 수), 신청됨은 `—`.
// 폰(<700)은 칸 접기 — P1 행사 · 제출 · 상태, P2 접힌 줄 `당첨일 · 담당`, 행 전체가 상세 링크(phoneRowLink).
type Row = Partial<CertEventListDto> & { id: string };

const STATUS_LABEL = { requested: "신청됨", open: "접수 중", closed: "닫힘" } as const;

export function EventsTable({ rows }: { rows: Row[] }) {
  const columns: TableColumn<Row>[] = [
    {
      key: "name",
      header: "행사",
      priority: "p1",
      cell: (row) => (
        <span className={styles.wrapText}>
          <Link href={`/certs/events/${row.id}`} className={styles.link} data-row-link="">
            {row.name ?? "—"}
          </Link>
        </span>
      ),
    },
    { key: "wonOn", header: "당첨일", priority: "p2", cell: (row) => <span className={styles.nowrap}>{row.wonOn ?? "—"}</span> },
    { key: "ownerName", header: "담당", priority: "p2", cell: (row) => <span className={styles.nowrap}>{row.ownerName ?? "—"}</span> },
    {
      key: "submitted",
      header: "제출",
      priority: "p1",
      align: "right",
      cell: (row) =>
        row.status === "requested" ? (
          "—"
        ) : (
          <>
            <span aria-hidden="true" className={styles.nowrap}>{`${row.submittedCount ?? 0}`}</span>
            <span className="sr-only">{`제출 ${row.submittedCount ?? 0}건`}</span>
          </>
        ),
    },
    {
      key: "status",
      header: "상태",
      priority: "p1",
      cell: (row) =>
        row.status ? (
          <StatusTag kind={row.status === "open" ? "accent" : "muted"} variant="text">
            {STATUS_LABEL[row.status]}
          </StatusTag>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <Table
      caption="확인증 행사"
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      groupBy={(row) => STATUS_LABEL[row.status ?? "open"]}
      phoneRowLink
    />
  );
}
