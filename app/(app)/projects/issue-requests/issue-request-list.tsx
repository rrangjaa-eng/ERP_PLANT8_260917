"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { IssueRequestGroup, IssueRequestStatus } from "@/domain/issue-requests";
import { formatKrw } from "@/lib/format-number";
import { Num } from "@/ui/num/Num";
import { RowAction, RowActions } from "@/ui/row-actions/RowActions";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { Table } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
// 필터 칸 · 식별자 링크(--accent 밑줄) 모양은 프로젝트 목록과 같은 클래스(새 CSS 없음 — 감사 D-5).
import projectStyles from "@/app/(app)/projects/projects.module.css";
import { issueRequestStatusWord } from "../[id]/issue-request-word";
import styles from "./issue-requests.module.css";

// 06-21(UI-SPEC S17): 발행 요청 읽기 표 + 상태 필터. 칸 렌더 함수는 서버 페이지에서 넘길 수 없어 이 클라이언트 파일에 둔다.
// 행동 3차(`발행 줄 입력` / `요청 보기`)는 1024 이상 · 매출 기록 권한자만(collapseBelow 1024). 1024 미만은 행 전체가 프로젝트 칸 링크
// (`data-row-link` — 폰은 Table phoneRowLink, 700~1023은 이 화면 CSS)라 같은 주소의 보기 전용 상세로 간다.

export type IssueRequestListRowView = {
  id: string;
  projectId: string;
  projectNumber: string;
  projectName: string;
  requesterName: string;
  desiredIssueDate: string;
  amountKrw: number | null;
  totalKrw: number | null;
  memo: string | null;
  status: IssueRequestStatus;
  group: IssueRequestGroup;
};

function requestHref(row: IssueRequestListRowView): string {
  return `/projects/${row.projectId}?issueRequest=${row.id}`;
}

function projectCell(row: IssueRequestListRowView) {
  const text = `${row.projectNumber} · ${row.projectName}`;
  return (
    <Link href={requestHref(row)} data-row-link="" className={`${projectStyles.link} ${styles.projectLink}`} title={text}>
      <span className={styles.clip}>{text}</span>
    </Link>
  );
}

function memoText(row: IssueRequestListRowView) {
  return row.memo ? (
    <span className={styles.memo} title={row.memo}>
      <span className={styles.clip}>{row.memo}</span>
    </span>
  ) : null;
}

function columns(showAmount: boolean, canLink: boolean): TableColumn<IssueRequestListRowView>[] {
  return [
    { key: "desiredIssueDate", header: "희망 발행일", priority: "p1", cell: (row) => <Num value={row.desiredIssueDate} /> },
    { key: "project", header: "프로젝트", priority: "p1", cell: projectCell },
    { key: "requester", header: "요청자", priority: "p2", cell: (row) => row.requesterName },
    // 금액 열은 서버가 금액 키를 보냈을 때만(A-605 — 발행액을 볼 수 없으면 열이 없다).
    ...(showAmount
      ? [
          {
            key: "amount",
            header: "금액",
            priority: "p1" as const,
            align: "right" as const,
            cell: (row: IssueRequestListRowView) => <Num value={row.amountKrw} />,
            // `합계`와 금액 사이에서만 줄을 바꾼다(묶음 안은 nowrap) — 폰 320에서 금액 칸이 표를 넓히지 않게(감사 D-2).
            secondaryLine: (row: IssueRequestListRowView) =>
              row.totalKrw === null ? null : (
                <span className={styles.totalLine}>
                  <span>합계</span> <span>{formatKrw(row.totalKrw)}</span>
                </span>
              ),
            // 폰에서는 셀 아래 줄이 숨는다 — 접힌 줄 앞 글자(`합계 {금액}`).
            secondaryText: (row: IssueRequestListRowView) => (row.totalKrw === null ? "" : `합계 ${formatKrw(row.totalKrw)}`),
          },
        ]
      : []),
    { key: "memo", header: "메모", priority: "p2", cell: (row) => memoText(row) ?? "—", summary: memoText },
    { key: "status", header: "상태", priority: "p2", cell: (row) => <StatusTag variant="text" status={issueRequestStatusWord(row.status)} /> },
    ...(canLink
      ? [
          {
            key: "actions",
            header: "행동",
            headerHidden: true,
            priority: "p3" as const,
            collapseBelow: 1024 as const,
            // 접근 이름 `{프로젝트 번호} 희망 {MM-DD} {행동}`(UI-SPEC 접근 이름 줄).
            cell: (row: IssueRequestListRowView) => (
              <RowActions>
                <RowAction href={requestHref(row)}>
                  <span className="sr-only">{`${row.projectNumber} 희망 ${row.desiredIssueDate.slice(5)} `}</span>
                  {row.status === "requested" ? "발행 줄 입력" : "요청 보기"}
                </RowAction>
              </RowActions>
            ),
          },
        ]
      : []),
  ];
}

export function IssueRequestList({ rows, showAmount, canLink }: { rows: IssueRequestListRowView[]; showAmount: boolean; canLink: boolean }) {
  return (
    <div className={styles.tabletRowLink}>
      <Table
        caption="발행 요청"
        columns={columns(showAmount, canLink)}
        rows={rows}
        getRowId={(row) => row.id}
        // 그룹 순서는 서버가 희망일 오름차순으로 준 행 순서 그대로(희망일 지남 → 이번 주 → 다음 주 → 그 뒤).
        groupBy={(row) => row.group}
        groupHeader={(row) => (row.group === "희망일 지남" ? <span className={styles.overdue}>{row.group}</span> : row.group)}
        phoneRowLink
      />
    </div>
  );
}

// 필터 줄(UI-SPEC S17) — 상태 하나. 고르면 바로 GET 이동(쿼리), 쪽은 1로 돌아간다.
export function IssueRequestFilter({ status, options }: { status: string; options: { value: string; label: string }[] }) {
  const router = useRouter();
  // 뒤로 가기 · `필터 지우기`로 URL이 바뀌면 key로 새로 마운트한다(defaultValue는 마운트 뒤 반영되지 않는다).
  return (
    <div className={projectStyles.selectLabel}>
      <label htmlFor="issue-request-filter-status">상태</label>
      <select
        key={status}
        id="issue-request-filter-status"
        className={projectStyles.select}
        defaultValue={status}
        onChange={(event) => router.push(event.target.value === "requested" ? "/projects/issue-requests" : `/projects/issue-requests?status=${event.target.value}`, { scroll: false })}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
