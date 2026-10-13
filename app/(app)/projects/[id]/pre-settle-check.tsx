"use client";

import type { PreSettleCheckDto, PreSettleExpenseRowDto } from "@/domain/pre-settle-check";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { RowAction, RowActions } from "@/ui/row-actions/RowActions";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { Table } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
import { preSettleStatusWord } from "./pre-settle-word";
import styles from "./project-detail.module.css";

// 06-19(UI-SPEC S18 · D-611~D-613): 정산 프로젝트 상세 「완료 전 점검」 — 견적 줄 표 아래 첫 섹션(부제 없음 — r3 · C13). 판정은 서버 DTO 하나
// (막힘 건수 · 그룹 · 행 낱말)이고 화면은 읽기만 한다. 빈 그룹은 접고, 세 그룹이 다 비면 한 줄 `미결 없음`.
// 머리 줄 `정산 결재 올리기`의 3차 `점검 보기`가 이 섹션 제목으로 포커스를 옮긴다(`data-ui="pre-settle-check"` → 가까운 section의 h2).

export const PRE_SETTLE_CHECK_TITLE = "완료 전 점검";

function GroupHeading({ text, count, allowed }: { text: string; count: string; allowed: boolean }) {
  return (
    <h3 className={styles.preSettleGroup}>
      {text} <span className={allowed ? undefined : styles.preSettleBlocked}>{count}</span>
      {allowed ? <span className={styles.preSettleForced}> · 강행 허용</span> : null}
    </h3>
  );
}

const EXPENSE_COLUMNS: TableColumn<PreSettleExpenseRowDto>[] = [
  { key: "number", header: "번호", priority: "p2", cell: (row) => row.number },
  { key: "item", header: "항목", priority: "p1", cell: (row) => <span title={row.itemName ?? undefined}>{row.itemName ?? "—"}</span> },
  { key: "status", header: "상태", priority: "p1", cell: (row) => <StatusTag variant="text" status={preSettleStatusWord(row.state)} /> },
  {
    key: "action",
    header: "행동",
    priority: "p1",
    headerHidden: true,
    cell: (row) => (
      <RowActions>
        <RowAction href={`/expenses/${row.id}`}>지출결의 열기</RowAction>
      </RowActions>
    ),
  },
];

export function PreSettleCheckSection({ check }: { check: PreSettleCheckDto }) {
  const open = check.openExpenses;
  const empty = open.count === 0 && check.unmatchedLines.count === 0 && check.missingRevenue.count === 0;
  return (
    <DetailScreen.Section title={PRE_SETTLE_CHECK_TITLE}>
      <div data-ui="pre-settle-check">
        {empty ? <p className={styles.preSettleNone}>미결 없음</p> : null}
        {open.count > 0 ? (
          <>
            <GroupHeading text="미결 지출결의" count={`${open.count}건`} allowed={open.allowed} />
            <Table caption="미결 지출결의" columns={EXPENSE_COLUMNS} rows={open.rows} getRowId={(row) => row.id} rowLabel={(row) => row.number} />
          </>
        ) : null}
      </div>
    </DetailScreen.Section>
  );
}
