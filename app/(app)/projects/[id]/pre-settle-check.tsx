"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PreSettleCheckDto, PreSettleExpenseRowDto, PreSettleLineRowDto } from "@/domain/pre-settle-check";
import { createExpenseFromLinesAction } from "@/app/(app)/expenses/actions";
import { formatKrw } from "@/lib/format-number";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { RowAction, RowActions } from "@/ui/row-actions/RowActions";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { Table } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
import { preSettleStatusWord } from "./pre-settle-word";
import styles from "./project-detail.module.css";

// 06-19(UI-SPEC S18 · D-611~D-613): 정산 프로젝트 상세 「완료 전 점검」 — 견적 줄 표 아래 첫 섹션(부제 없음 — r3 · C13). 판정은 서버 DTO 하나
// (막힘 건수 · 그룹 · 행 낱말 · 줄의 문)이고 화면은 읽기만 한다. 빈 그룹은 접고, 세 그룹이 다 비면 한 줄 `미결 없음`. 매출 줄은 늘 남는다(D-613).
// 머리 줄 `정산 결재 올리기`의 3차 `점검 보기`가 이 섹션 제목으로 포커스를 옮긴다(`data-ui="pre-settle-check"` → 가까운 section의 h2).
// 매출 미입력 행의 3차(`발행 요청 추가` · `발행 줄 추가`)와 섹션 로드 오류 줄은 06-22.

export const PRE_SETTLE_CHECK_TITLE = "완료 전 점검";

function GroupHeading({ text, count, allowed }: { text: string; count?: string; allowed: boolean }) {
  return (
    <h3 className={styles.preSettleGroup}>
      {text}
      {count ? " " : null}
      {count ? <span className={allowed ? undefined : styles.preSettleBlocked}>{count}</span> : null}
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

// 매출 줄 — `계약 금액 X · 발행 합계 Y · 차이 Z`(차이 ≠ 0이면 --status-warning, 막지 않음). 계약 미승인이면 `계약 금액 — · {n}차 고객 승인 전`.
// 금액 칸이 노출 밖이면(키 없음) 그 조각을 그리지 않는다.
function RevenueLine({ revenue }: { revenue: PreSettleCheckDto["revenue"] }) {
  const contract = revenue.pendingLabel ? `계약 금액 — · ${revenue.pendingLabel}` : revenue.contractKrw !== undefined ? `계약 금액 ${revenue.contractKrw === null ? "—" : formatKrw(revenue.contractKrw)}` : null;
  const issued = revenue.issuedTotalKrw !== undefined ? `발행 합계 ${revenue.issuedTotalKrw === null ? "—" : formatKrw(revenue.issuedTotalKrw)}` : null;
  const diff = revenue.diffKrw !== undefined ? (revenue.diffKrw === null ? "—" : formatKrw(revenue.diffKrw)) : null;
  const parts = [contract, issued].filter((part): part is string => part !== null);
  if (parts.length === 0 && diff === null) return null;
  return (
    <p className={styles.preSettleRevenue}>
      {parts.join(" · ")}
      {diff !== null ? (
        <>
          {parts.length > 0 ? " · " : null}
          <span className={revenue.diffKrw ? styles.preSettleDiff : undefined}>{`차이 ${diff}`}</span>
        </>
      ) : null}
    </p>
  );
}

export function PreSettleCheckSection({ check, ownerName }: { check: PreSettleCheckDto; ownerName: string | null }) {
  const router = useRouter();
  const busyRef = useRef(false);
  const [pendingLine, setPendingLine] = useState<string | null>(null);
  const [failedLine, setFailedLine] = useState<string | null>(null);

  // S14 행 행동과 같은 곳 — 그 줄의 작성 중 지출결의를 만들어 연다.
  async function openExpense(lineId: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setPendingLine(lineId);
    setFailedLine(null);
    let expenseId: string | undefined;
    try {
      expenseId = (await createExpenseFromLinesAction({ lineIds: [lineId] }))?.data?.created[0]?.expenseId;
    } catch {
      expenseId = undefined;
    }
    busyRef.current = false;
    if (expenseId) {
      router.push(`/expenses/${expenseId}`);
      return;
    }
    setPendingLine(null);
    setFailedLine(lineId);
  }

  function doorCell(row: PreSettleLineRowDto) {
    if (ownerName !== null) return <span className={styles.preSettleForced}>{`담당 PM ${ownerName}`}</span>;
    const { door } = row;
    if (door.kind === "purchase") {
      return (
        <RowActions>
          <RowAction href={door.href}>구매 요청</RowAction>
        </RowActions>
      );
    }
    if (door.kind === "expense_open") {
      return (
        <span>
          <RowActions>
            <RowAction pending={pendingLine === row.lineId} busy={pendingLine !== null && pendingLine !== row.lineId} onClick={() => void openExpense(row.lineId)}>
              지출결의 올리기
            </RowAction>
          </RowActions>
          {failedLine === row.lineId ? <span className={styles.doorFailure}>지출결의 만들기 실패 · 다시 시도</span> : null}
        </span>
      );
    }
    if (door.kind === "expense_closed") {
      return (
        <RowActions>
          <RowAction href={`/expenses/${door.latestId}`}>지출결의 열기</RowAction>
        </RowActions>
      );
    }
    if (door.kind === "no_vendor") return <span className={styles.doorNoVendor}>거래처 없음</span>;
    return null;
  }

  const lineColumns: TableColumn<PreSettleLineRowDto>[] = [
    { key: "number", header: "번호", priority: "p2", cell: (row) => row.displayNo },
    { key: "item", header: "항목", priority: "p1", cell: (row) => <span title={row.itemName}>{row.itemName}</span> },
    { key: "door", header: "행동", priority: "p1", headerHidden: true, cell: doorCell },
  ];

  const open = check.openExpenses;
  const unmatched = check.unmatchedLines;
  const missing = check.missingRevenue;
  const empty = open.count === 0 && unmatched.count === 0 && missing.count === 0;
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
        {unmatched.count > 0 ? (
          <>
            <GroupHeading text="미매칭 견적 줄" count={`${unmatched.count}줄`} allowed={unmatched.allowed} />
            <Table caption="미매칭 견적 줄" columns={lineColumns} rows={unmatched.rows} getRowId={(row) => row.lineId} rowLabel={(row) => row.itemName} />
          </>
        ) : null}
        {missing.count > 0 ? (
          <>
            <GroupHeading text="매출 미입력" allowed={missing.allowed} />
            <p className={styles.preSettleMissing}>발행 줄 없음</p>
          </>
        ) : null}
        <RevenueLine revenue={check.revenue} />
      </div>
    </DetailScreen.Section>
  );
}
