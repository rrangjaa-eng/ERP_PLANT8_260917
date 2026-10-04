"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
import { Select } from "@/ui/select/Select";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import type { StatusWord } from "@/ui/status-tag/status-map";
import { Num } from "@/ui/num/Num";
import { LEAVE_LIST_COLUMN_LABELS } from "../labels";
import type { LeaveStatusKey } from "../status-display";
import styles from "../leave.module.css";

// 04.1-06 S1 — 내 연차 표. 그룹 머리글 = 상태, 순서는 아래 상수 하나(UI-SPEC 사용자 확인 대상 #4 — 뒤집을 때 이
// 줄만 고친다, T17). 그룹 안은 시작일 오름차순, 빈 그룹은 머리글째 없다. 행 전체가 `/leave/[id]` 링크(종류 · 기간
// 칸의 링크가 ::after로 행을 덮는다 — ui/table은 고치지 않는다). 합계 행 없음(A4 — 머리 잔고 줄이 합계다).
export const LEAVE_STATUS_GROUP_ORDER = ["결재 중", "반려", "승인", "회수"] as const;

const GROUP_OF: Partial<Record<LeaveStatusKey, (typeof LEAVE_STATUS_GROUP_ORDER)[number]>> = {
  submitted: "결재 중",
  in_review: "결재 중",
  rejected: "반려",
  approved: "승인",
  withdrawn: "회수",
};

export type LeaveListRow = {
  id: string;
  number: string;
  period: string;
  startDate: string;
  days: string;
  statusKey: LeaveStatusKey | null;
  status: StatusWord | null;
  // 신청일 `MM-DD`(서울).
  requestedOn: string;
  note: string;
};

function groupIndex(row: LeaveListRow): number {
  const group = row.statusKey ? GROUP_OF[row.statusKey] : undefined;
  return group ? LEAVE_STATUS_GROUP_ORDER.indexOf(group) : LEAVE_STATUS_GROUP_ORDER.length;
}

const COLUMNS: TableColumn<LeaveListRow>[] = [
  { key: "number", header: LEAVE_LIST_COLUMN_LABELS.number, priority: "p3", cell: (row) => row.number },
  {
    key: "period",
    header: LEAVE_LIST_COLUMN_LABELS.period,
    priority: "p1",
    cell: (row) => (
      <Link href={`/leave/${row.id}`} className={`${styles.link} ${styles.rowLink}`}>
        {row.period}
      </Link>
    ),
  },
  { key: "days", header: LEAVE_LIST_COLUMN_LABELS.days, priority: "p1", align: "right", cell: (row) => <Num value={row.days} /> },
  {
    key: "status",
    header: LEAVE_LIST_COLUMN_LABELS.status,
    priority: "p1",
    cell: (row) => (row.status ? <StatusTag status={row.status} variant="text" /> : null),
  },
  {
    key: "requestedOn",
    header: LEAVE_LIST_COLUMN_LABELS.requestedOn,
    priority: "p2",
    cell: (row) => row.requestedOn,
    // 폰 접힌 줄도 행의 일부라 같은 문서로 간다(04.1-06 DOM 감사 #6). 접힌 줄은 ui/table이 aria-hidden으로 그리므로
    // 이 링크는 탭 순서에서 빼고(주 행 링크 하나만 초점), ::after로 그 줄을 덮는다 — ui/table은 고치지 않는다.
    summary: (row) => (
      <Link href={`/leave/${row.id}`} tabIndex={-1} className={styles.foldLink}>
        {`신청 ${row.requestedOn}`}
      </Link>
    ),
  },
  { key: "note", header: LEAVE_LIST_COLUMN_LABELS.note, priority: "p3", cell: (row) => <span className={styles.noteCell}>{row.note}</span> },
];

export function LeaveTable({ rows }: { rows: LeaveListRow[] }) {
  const sorted = [...rows].sort((a, b) => groupIndex(a) - groupIndex(b) || (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));
  return (
    <Table
      caption="내 연차"
      columns={COLUMNS}
      rows={sorted}
      getRowId={(row) => row.id}
      groupBy={(row) => LEAVE_STATUS_GROUP_ORDER[groupIndex(row)] ?? ""}
    />
  );
}

// 필터 줄 칸(`ListScreen.filters`) — 연도 select(옵션이 둘 이상일 때 · 200) 또는 보는 연도 글자(옵션이 하나일 때, 연도는 화면에 한 자리만).
// 1차 `연차 신청`은 `ListScreen.primaryAction`이 그린다. select 제어값 = 보여 주는 연도(`—`로 열리지 않는다). `—`를 고르면 `?year` 없이 = 올해(D6 · #1).
export function LeaveYearFilter({ year, yearOptions }: { year: number; yearOptions: number[] | null }) {
  const router = useRouter();
  if (!yearOptions) return <span className={styles.yearLabel}>{`${year} 회계연도`}</span>;
  return (
    <span className={styles.yearField}>
      <label htmlFor="leave-year" className="sr-only">
        연도
      </label>
      <Select
        id="leave-year"
        value={String(year)}
        options={yearOptions.map((option) => ({ value: String(option), label: String(option) }))}
        onChange={(event) => router.push(event.target.value ? `/leave?year=${event.target.value}` : "/leave")}
      />
    </span>
  );
}
