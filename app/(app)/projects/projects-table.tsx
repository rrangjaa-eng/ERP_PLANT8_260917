"use client";

import Link from "next/link";
import { Table } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import type { ProjectListItemWithGroup, ProjectSortKey } from "@/domain/projects";
import type { ProjectStatus } from "@/domain/projects/status-transitions";
import { PROJECT_STATUS_WORD } from "@/domain/projects/status-word";
import { Num } from "@/ui/num/Num";
import { PROJECT_COLUMN_LABELS } from "./list-columns";
import { formatListPeriod, type ListColumnStep } from "@/domain/projects/list-view";
import styles from "./projects.module.css";

// SYSTEM.md §6-1 · 04-UI-SPEC S1 — 목록 표. `ui/table`을 **읽기 형태**로
// 쓴다(편집 가능 셀 0개, D-61 (가)). 이 파일은 04-04가 고치는 ui/table
// 디렉터리를 건드리지 않는다(같은 웨이브, 이 플랜의 <probe_fallback>).
export function ProjectsTable({
  rows,
  viewYear,
  columnStep,
  sort,
  filterQuery,
}: {
  rows: ProjectListItemWithGroup[];
  /** 04-48(D-89) — 보기 연도(전체 연도면 null). 기간 칸이 그 해면 월-일만 적는다. */
  viewYear: number | null;
  /** 04-18(S1 열 폭) — 서버가 페이지 금액 글자 수로 판정한 단계. narrow면 1280 이상에서도 좁은 PC 열 집합. */
  columnStep: ListColumnStep;
  /** 04-18 — 서버가 실제로 쓴 정렬(볼 수 없는 열 키는 이미 기본 정렬로 떨어졌다). */
  sort: { key: ProjectSortKey; direction: "asc" | "desc" };
  /** 04-18 — 정렬 링크가 그대로 싣는 필터 쿼리(정렬 · page 제외). */
  filterQuery: string;
}) {
  const nowrap = (text: string) => <span className={styles.nowrap}>{text}</span>;
  const period = (row: ProjectListItemWithGroup) => formatListPeriod(row.startDate, row.endDate, viewYear);

  // 04-18(D-87) — 금액 열은 서버가 그 키를 보냈을 때만 만든다(키 부재는 계급 단위라 행마다 갈리지 않는다).
  // 좁은 PC(S1): 1280 미만에서 매출 · 실행가, 1024 미만에서 기준 · 수익금 · 수익률이 숨는다.
  const amountColumns: TableColumn<ProjectListItemWithGroup>[] = [
    {
      key: "revenueKrw",
      header: PROJECT_COLUMN_LABELS.revenueKrw,
      priority: "p3",
      collapseBelow: 1280,
      align: "right",
      cell: (row) => (row.revenueKrw === null || row.revenueKrw === undefined ? "—" : row.revenueKrw),
    },
    {
      key: "quoteAmountKrw",
      header: PROJECT_COLUMN_LABELS.quoteAmountKrw,
      priority: "p1",
      align: "right",
      cell: (row) => row.quoteAmountKrw ?? 0,
    },
    {
      key: "executionAmountKrw",
      header: PROJECT_COLUMN_LABELS.executionAmountKrw,
      priority: "p3",
      collapseBelow: 1280,
      align: "right",
      cell: (row) => row.executionAmountKrw ?? 0,
    },
    {
      key: "profitBasis",
      header: PROJECT_COLUMN_LABELS.profitBasis,
      priority: "p3",
      collapseBelow: 1024,
      cell: (row) => <span className={styles.basisCell}>{row.profitBasis === "issued" ? "발행" : "견적"}</span>,
    },
    {
      key: "profitKrw",
      header: PROJECT_COLUMN_LABELS.profitKrw,
      priority: "p3",
      collapseBelow: 1024,
      align: "right",
      cell: (row) => row.profitKrw ?? 0,
    },
    {
      key: "profitRate",
      header: PROJECT_COLUMN_LABELS.profitRate,
      priority: "p3",
      collapseBelow: 1024,
      align: "right",
      cell: (row) => <Num value={row.profitRate === null || row.profitRate === undefined ? null : row.profitRate * 100} unit="percent" />,
    },
  ];
  const moneyColumns = amountColumns.filter((column) => rows.some((row) => column.key in row));

  // 04-18(§6-1) — 머리글 정렬 링크. 같은 열이면 방향을 뒤집고 다른 열이면 오름차순, page를 싣지 않아 1쪽이다.
  const sortHeader = (key: ProjectSortKey): TableColumn<ProjectListItemWithGroup>["sort"] => {
    const direction = sort.key === key ? sort.direction : null;
    const next = new URLSearchParams(filterQuery);
    next.set("sort", key);
    if (direction === "asc") next.set("dir", "desc");
    return { href: `/projects?${next.toString()}`, direction };
  };
  const SORT_KEY_OF_COLUMN: Record<string, ProjectSortKey> = {
    number: "number",
    clientName: "client",
    name: "name",
    period: "endDate",
    revenueKrw: "revenueKrw",
    quoteAmountKrw: "quoteAmountKrw",
    executionAmountKrw: "executionAmountKrw",
    profitKrw: "profitKrw",
    profitRate: "profitRate",
  };

  const columns: TableColumn<ProjectListItemWithGroup>[] = [
    {
      key: "number",
      header: PROJECT_COLUMN_LABELS.number,
      priority: "p3",
      collapseBelow: 1280,
      cell: (row) => <span className={styles.numberCell}>{row.number}</span>,
    },
    {
      key: "clientName",
      header: PROJECT_COLUMN_LABELS.clientName,
      priority: "p2",
      cell: (row) => <span className={styles.clientCell}>{row.clientName || "—"}</span>,
      summary: (row) => row.clientName || "—",
    },
    {
      key: "name",
      header: PROJECT_COLUMN_LABELS.name,
      priority: "p1",
      cell: (row) => (
        <span className={styles.nameCell}>
          <Link href={`/projects/${row.id}`} className={styles.link} data-row-link="">
            {row.name}
          </Link>
        </span>
      ),
    },
    { key: "pmUserName", header: PROJECT_COLUMN_LABELS.pmUserName, priority: "p2", cell: (row) => nowrap(row.pmUserName || "—") },
    { key: "teamName", header: PROJECT_COLUMN_LABELS.teamName, priority: "p3", collapseBelow: 1280, cell: (row) => nowrap(row.teamName || "—") },
    {
      key: "period",
      header: PROJECT_COLUMN_LABELS.period,
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
      header: PROJECT_COLUMN_LABELS.status,
      priority: "p1",
      cell: (row) => (
        <>
          <StatusTag status={PROJECT_STATUS_WORD[row.status as ProjectStatus] ?? "수주중"} variant="text" />
          {/* D-81 · DR-34 — 수주중 + 종료일 지남의 2행. 태그가 아니라 상태 글자보다 크지 않은 글자다. */}
          {row.endDatePassed ? <span className={[styles.endDatePassed, styles.statusSecondLine].join(" ")}>종료일 지남</span> : null}
        </>
      ),
    },
  ];
  const sortableColumns = columns.map((column) => {
    const sortKey = SORT_KEY_OF_COLUMN[column.key];
    return sortKey ? { ...column, sort: sortHeader(sortKey) } : column;
  });

  return (
    <Table
      caption="프로젝트"
      columns={sortableColumns}
      rows={rows}
      getRowId={(row) => row.id}
      groupBy={(row) => row.groupLabel}
      phoneRowLink
      collapseEarly={columnStep === "narrow"}
    />
  );
}
