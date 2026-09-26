"use client";

import Link from "next/link";
import { Table } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import type { ProjectListItemWithGroup } from "@/domain/projects";
import type { ProjectStatus } from "@/domain/projects/status-transitions";
import { PROJECT_STATUS_TAG_KIND } from "./status-display";
import { formatKrw } from "@/lib/format-number";
import styles from "./projects.module.css";

// SYSTEM.md §6-1 · 04-UI-SPEC S1 — 목록 표. `ui/table`을 **읽기 형태**로
// 쓴다(편집 가능 셀 0개, D-61 (가)). 이 파일은 04-04가 고치는 ui/table
// 디렉터리를 건드리지 않는다(같은 웨이브, 이 플랜의 <probe_fallback>).
// ISO "YYYY-MM-DD" → "MM-DD". 값이 없으면 §2-4 "값이 있는데 비어 있는 칸만
// —"를 따라 — 기간 필드 자체는 항상 DTO에 실리므로(project.value, 계급
// 무관 노출) 부재가 아니라 빈 값이다.
function formatMonthDay(date: string | null): string {
  return date ? date.slice(5) : "—";
}

function formatPeriod(startDate: string | null, endDate: string | null): string {
  if (!startDate && !endDate) return "—";
  return `${formatMonthDay(startDate)} ~ ${formatMonthDay(endDate)}`;
}

export function ProjectsTable({
  rows,
  loadMoreHref,
  canSeeAmount,
  statusLabels,
}: {
  rows: ProjectListItemWithGroup[];
  loadMoreHref: string | null;
  canSeeAmount: boolean;
  /** 코드표 라벨(서버) — 값 → 라벨. */
  statusLabels: Record<string, string>;
}) {
  const moneyColumns: TableColumn<ProjectListItemWithGroup>[] = canSeeAmount
    ? [
        {
          key: "quoteAmountKrw",
          header: "견적",
          priority: "p1",
          align: "right",
          cell: (row) => formatKrw(row.quoteAmountKrw ?? 0),
        },
        {
          key: "executionAmountKrw",
          header: "실행가",
          priority: "p3",
          align: "right",
          cell: (row) => formatKrw(row.executionAmountKrw ?? 0),
        },
        {
          key: "profitKrw",
          header: "차익",
          priority: "p3",
          align: "right",
          cell: (row) => formatKrw(row.profitKrw ?? 0),
        },
      ]
    : [];

  const columns: TableColumn<ProjectListItemWithGroup>[] = [
    {
      key: "number",
      header: "번호",
      priority: "p3",
      cell: (row) => <span className={styles.numberCell}>{row.number}</span>,
    },
    {
      key: "name",
      header: "프로젝트명",
      priority: "p1",
      cell: (row) => (
        <Link href={`/projects/${row.id}`} className={styles.link}>
          {row.name}
        </Link>
      ),
      secondaryLine: (row) => row.clientName || "—",
      summary: (row) => row.clientName || "—",
    },
    { key: "pmUserName", header: "담당 PM", priority: "p2", cell: (row) => row.pmUserName || "—" },
    { key: "teamName", header: "팀", priority: "p3", cell: (row) => row.teamName || "—" },
    {
      key: "period",
      header: "기간",
      priority: "p2",
      cell: (row) => formatPeriod(row.startDate, row.endDate),
      // 04-17(D-90) — 보기 범위 밖에서 끝나는 행만 2행에 귀속(`2027 귀속`).
      secondaryLine: (row) => (row.attributionLabel ? <span className={styles.attribution}>{row.attributionLabel}</span> : null),
    },
    ...moneyColumns,
    {
      key: "status",
      header: "상태",
      priority: "p1",
      cell: (row) => (
        <StatusTag kind={PROJECT_STATUS_TAG_KIND[row.status as ProjectStatus] ?? "muted"} variant="text">
          {statusLabels[row.status] ?? row.status}
        </StatusTag>
      ),
    },
  ];

  return (
    <>
      <Table
        caption="프로젝트"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        groupBy={(row) => row.groupLabel}
      />
      {loadMoreHref ? (
        <a href={loadMoreHref} className={styles.loadMore}>
          더 보기 50건
        </a>
      ) : null}
    </>
  );
}
