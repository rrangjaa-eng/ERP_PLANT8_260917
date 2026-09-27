"use client";

import Link from "next/link";
import { Table } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import type { ProjectListItemWithGroup } from "@/domain/projects";
import type { ProjectStatus } from "@/domain/projects/status-transitions";
import { PROJECT_STATUS_TAG_KIND } from "./status-display";
import { formatKrw, formatPercent } from "@/lib/format-number";
import { formatListPeriod, type ListColumnStep } from "@/domain/projects/list-view";
import styles from "./projects.module.css";

// SYSTEM.md §6-1 · 04-UI-SPEC S1 — 목록 표. `ui/table`을 **읽기 형태**로
// 쓴다(편집 가능 셀 0개, D-61 (가)). 이 파일은 04-04가 고치는 ui/table
// 디렉터리를 건드리지 않는다(같은 웨이브, 이 플랜의 <probe_fallback>).
export function ProjectsTable({
  rows,
  viewYear,
  statusLabels,
  columnStep,
}: {
  rows: ProjectListItemWithGroup[];
  /** 04-48(D-89) — 보기 연도(전체 연도면 null). 기간 칸이 그 해면 월-일만 적는다. */
  viewYear: number | null;
  /** 코드표 라벨(서버) — 값 → 라벨. */
  statusLabels: Record<string, string>;
  /** 04-18(S1 열 폭) — 서버가 페이지 금액 글자 수로 판정한 단계. narrow면 1280 이상에서도 좁은 PC 열 집합. */
  columnStep: ListColumnStep;
}) {
  const nowrap = (text: string) => <span className={styles.nowrap}>{text}</span>;
  const period = (row: ProjectListItemWithGroup) => formatListPeriod(row.startDate, row.endDate, viewYear);

  // 04-18(D-87) — 금액 열은 서버가 그 키를 보냈을 때만 만든다(키 부재는 계급 단위라 행마다 갈리지 않는다).
  // 좁은 PC(S1): 1280 미만에서 매출 · 실행가, 1024 미만에서 기준 · 수익금 · 수익률이 숨는다.
  const amountColumns: TableColumn<ProjectListItemWithGroup>[] = [
    {
      key: "revenueKrw",
      header: "매출",
      priority: "p3",
      collapseBelow: 1280,
      align: "right",
      cell: (row) => nowrap(row.revenueKrw === null || row.revenueKrw === undefined ? "—" : formatKrw(row.revenueKrw)),
    },
    {
      key: "quoteAmountKrw",
      header: "견적",
      priority: "p1",
      align: "right",
      cell: (row) => nowrap(formatKrw(row.quoteAmountKrw ?? 0)),
    },
    {
      key: "executionAmountKrw",
      header: "실행가",
      priority: "p3",
      collapseBelow: 1280,
      align: "right",
      cell: (row) => nowrap(formatKrw(row.executionAmountKrw ?? 0)),
    },
    {
      key: "profitBasis",
      header: "기준",
      priority: "p3",
      collapseBelow: 1024,
      cell: (row) => <span className={styles.basisCell}>{row.profitBasis === "issued" ? "발행" : "견적"}</span>,
    },
    {
      key: "profitKrw",
      header: "수익금",
      priority: "p3",
      collapseBelow: 1024,
      align: "right",
      cell: (row) => nowrap(formatKrw(row.profitKrw ?? 0)),
    },
    {
      key: "profitRate",
      header: "수익률",
      priority: "p3",
      collapseBelow: 1024,
      align: "right",
      cell: (row) => (
        <span className={styles.rateCell}>
          {formatPercent(row.profitRate === null || row.profitRate === undefined ? null : row.profitRate * 100)}
        </span>
      ),
    },
  ];
  const moneyColumns = amountColumns.filter((column) => rows.some((row) => column.key in row));

  const columns: TableColumn<ProjectListItemWithGroup>[] = [
    {
      key: "number",
      header: "번호",
      priority: "p3",
      collapseBelow: 1280,
      cell: (row) => <span className={styles.numberCell}>{row.number}</span>,
    },
    {
      key: "clientName",
      header: "클라이언트",
      priority: "p2",
      cell: (row) => <span className={styles.clientCell}>{row.clientName || "—"}</span>,
      summary: (row) => row.clientName || "—",
    },
    {
      key: "name",
      header: "프로젝트명",
      priority: "p1",
      cell: (row) => (
        <span className={styles.nameCell}>
          <Link href={`/projects/${row.id}`} className={styles.link} data-row-link="">
            {row.name}
          </Link>
        </span>
      ),
    },
    { key: "pmUserName", header: "담당 PM", priority: "p2", cell: (row) => nowrap(row.pmUserName || "—") },
    { key: "teamName", header: "팀", priority: "p3", collapseBelow: 1280, cell: (row) => nowrap(row.teamName || "—") },
    {
      key: "period",
      header: "기간",
      priority: "p2",
      cell: (row) => <span className={styles.periodCell}>{period(row)}</span>,
      // 04-17(D-90) — 보기 범위 밖에서 끝나는 행만 2행에 귀속(`2027 귀속`).
      secondaryLine: (row) => (row.attributionLabel ? <span className={styles.attribution}>{row.attributionLabel}</span> : null),
      // 폰 접힌 줄(S1 폰 열 우선순위) — 기간 뒤 같은 줄 끝에 귀속 · 종료일 지남(상태 칸 2행은 폰에서 숨는다).
      summary: (row) => (
        <>
          <span className={styles.periodCell}>{period(row)}</span>
          {row.attributionLabel ? (
            <>
              {" · "}
              <span className={styles.attribution}>{row.attributionLabel}</span>
            </>
          ) : null}
          {row.endDatePassed ? (
            <>
              {" · "}
              <span className={styles.endDatePassed}>종료일 지남</span>
            </>
          ) : null}
        </>
      ),
    },
    ...moneyColumns,
    {
      key: "status",
      header: "상태",
      priority: "p1",
      cell: (row) => (
        <>
          <StatusTag kind={PROJECT_STATUS_TAG_KIND[row.status as ProjectStatus] ?? "muted"} variant="text">
            {statusLabels[row.status] ?? row.status}
          </StatusTag>
          {/* D-81 · DR-34 — 수주중 + 종료일 지남의 2행. 태그가 아니라 상태 글자보다 크지 않은 글자다. */}
          {row.endDatePassed ? <span className={[styles.endDatePassed, styles.statusSecondLine].join(" ")}>종료일 지남</span> : null}
        </>
      ),
    },
  ];

  return (
    <Table
      caption="프로젝트"
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      groupBy={(row) => row.groupLabel}
      phoneRowLink
      collapseEarly={columnStep === "narrow"}
    />
  );
}
