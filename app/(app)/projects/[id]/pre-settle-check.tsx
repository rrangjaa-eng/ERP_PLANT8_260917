"use client";

import { createContext, Fragment, useContext, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { PreSettleCheckDto, PreSettleExpenseRowDto, PreSettleLineRowDto } from "@/domain/pre-settle-check";
import { createExpenseFromLinesAction } from "@/app/(app)/expenses/actions";
import { formatKrw } from "@/lib/format-number";
import { Button } from "@/ui/button/Button";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { Num } from "@/ui/num/Num";
import { RowAction, RowActions } from "@/ui/row-actions/RowActions";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { Table } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
import { preSettleStatusWord } from "./pre-settle-word";
import styles from "./project-detail.module.css";

// 06-19(UI-SPEC S18 · D-611~D-613): 정산 프로젝트 상세 「완료 전 점검」 — 견적 줄 표 아래 첫 섹션(부제 없음 — r3 · C13). 판정은 서버 DTO 하나
// (막힘 건수 · 그룹 · 행 낱말 · 줄의 문)이고 화면은 읽기만 한다. 빈 그룹은 접고, 세 그룹이 다 비면 한 줄 `미결 없음`. 매출 줄은 늘 남는다(D-613).
// 머리 줄 `정산 결재 올리기`의 3차 `점검 보기`가 이 섹션 제목(`#pre-settle-check`)으로 포커스를 옮긴다.
// 폰(<700): P1 = 항목 · 금액 · 상태, 행동 3차는 열(P3)이 숨고 항목 셀 2행에 선다(S18 · SYSTEM §7-3 P1 최대 3열 — 검토 D-1).
// 3차 접근 이름 앞에 보이는 행 식별자(`{번호} 지출결의 열기` · `{번호} {항목} 지출결의 올리기`, Copywriting — 검토 D-3).
// 06-22: 매출 미입력 행의 3차(PS-3 — `발행 요청 추가` · `발행 줄 추가`, ≥1024만) · `고객 승인 전` 3차(PS-6)는
// 견적 화면(QuoteLedger)이 컨텍스트로 넘긴 값 · 함수 그대로 쓰고(새 판정 · 새 줄 추가 함수 없음), 섹션 로드 오류는 `PreSettleCheckError`.
// R-6: 미결 지출결의 행은 보는 사람의 범위 안 것만 오고 범위 밖은 그룹 끝 `그 밖 {N}건`(건수만). 금액 열은 서버가 금액 키를 실은 행이 있을 때만.

export const PRE_SETTLE_CHECK_TITLE = "완료 전 점검";
export const PRE_SETTLE_CHECK_HEADING_ID = "pre-settle-check";

/** 06-22 — 섹션이 견적 화면(QuoteLedger)에서 빌려 쓰는 다음 한 수. 권한 · 폭 값과 함수는 QuoteLedger의 것 그대로다. */
export type PreSettleLedgerDoors = {
  /** QuoteLedger `editableWidth`(≥1024 · 칸 편집 중) — 1024 미만이면 매출 3차가 없다. */
  editableWidth: boolean;
  /** 매출 기록 권한(QuoteLedger `canWriteEntries`). */
  canWriteRevenue: boolean;
  /** 발행 요청 권한(06-18 `issueRequests.canRequest` — 담당 PM 쓰기). */
  canRequestIssue: boolean;
  addIssued: () => void;
  addIssueRequest: () => void;
  saveLocked: boolean;
  saveButtonId: string;
  /** 고객 승인 줄(`CustomerApprovalLine`)의 트리거로 포커스 — 트리거가 없으면 null. */
  focusCustomerApproval: (() => void) | null;
};

export const PreSettleLedgerContext = createContext<PreSettleLedgerDoors | null>(null);

// 「Error — 섹션 로드」 — 섹션 자리에 `점검 불러오지 못함` + 2차 `다시 시도`(카드 사용 섹션 선례). 기안 버튼은 06-19 `preSettleBlock` 경로로 막힌다.
export function PreSettleCheckError() {
  const router = useRouter();
  return (
    <DetailScreen.Section title={PRE_SETTLE_CHECK_TITLE} headingId={PRE_SETTLE_CHECK_HEADING_ID}>
      <ListEmpty tone="error" message="점검 불러오지 못함" action={{ label: "다시 시도", onClick: () => router.refresh() }} />
    </DetailScreen.Section>
  );
}

// 폰에서만 항목 셀 2행으로 서는 행동 3차(≥700은 행동 열).
function PhoneLine({ children }: { children: ReactNode }) {
  return children ? <div className={styles.preSettlePhoneLine}>{children}</div> : null;
}

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

function OutOfScope({ count }: { count: number }) {
  return count > 0 ? <p className={styles.preSettleOutOfScope}>{`그 밖 ${count}건`}</p> : null;
}

const EXPENSE_AMOUNT_COLUMN: TableColumn<PreSettleExpenseRowDto> = {
  key: "amount",
  header: "금액",
  priority: "p1",
  align: "right",
  cell: (row) => <Num value={row.expenseAmountKrw ?? null} />,
};

function openExpenseAction(row: PreSettleExpenseRowDto) {
  return (
    <RowActions>
      <RowAction href={`/expenses/${row.id}`}>
        <span className="sr-only">{`${row.number} `}</span>지출결의 열기
      </RowAction>
    </RowActions>
  );
}

function expenseColumns(amountVisible: boolean): TableColumn<PreSettleExpenseRowDto>[] {
  return [
    { key: "number", header: "번호", priority: "p2", cell: (row) => row.number },
    {
      key: "item",
      header: "항목",
      priority: "p1",
      cell: (row) => (
        <>
          <span className={styles.preSettleItem} title={row.itemName ?? undefined}>
            {row.itemName ?? "—"}
          </span>
          <PhoneLine>{openExpenseAction(row)}</PhoneLine>
        </>
      ),
    },
    ...(amountVisible ? [EXPENSE_AMOUNT_COLUMN] : []),
    { key: "status", header: "상태", priority: "p1", cell: (row) => <StatusTag variant="text" status={preSettleStatusWord(row.state)} /> },
    { key: "action", header: "행동", priority: "p3", headerHidden: true, cell: openExpenseAction },
  ];
}

const LINE_EXECUTION_COLUMN: TableColumn<PreSettleLineRowDto> = {
  key: "execution",
  header: "실행가",
  priority: "p1",
  align: "right",
  cell: (row) => <Num value={row.executionKrw ?? null} />,
};

// 매출 줄 — `계약 금액 X · 발행 합계 Y · 차이 Z`(차이 ≠ 0이면 --status-warning, 막지 않음). 계약 미승인이면 `계약 금액 — · {n}차 고객 승인 전`이고,
// 고객 승인 줄의 트리거가 있으면 `{n}차 고객 승인 전`이 3차(PS-6 — 누르면 그 트리거로 포커스). 금액 칸이 노출 밖이면(키 없음) 그 조각을 그리지 않는다.
function RevenueLine({ revenue, onPending }: { revenue: PreSettleCheckDto["revenue"]; onPending: (() => void) | null }) {
  const pendingDoor =
    revenue.pendingLabel && onPending ? (
      <Button variant="tertiary" onClick={onPending}>
        {revenue.pendingLabel}
      </Button>
    ) : null;
  const contract = revenue.pendingLabel
    ? pendingDoor
      ? "계약 금액 —"
      : `계약 금액 — · ${revenue.pendingLabel}`
    : revenue.contractKrw !== undefined
      ? `계약 금액 ${revenue.contractKrw === null ? "—" : formatKrw(revenue.contractKrw)}`
      : null;
  const issued = revenue.issuedTotalKrw !== undefined ? `발행 합계 ${revenue.issuedTotalKrw === null ? "—" : formatKrw(revenue.issuedTotalKrw)}` : null;
  const diff = revenue.diffKrw !== undefined ? (revenue.diffKrw === null ? "—" : formatKrw(revenue.diffKrw)) : null;
  const parts: ReactNode[] = [contract, pendingDoor, issued].filter((part) => part !== null);
  if (diff !== null) parts.push(<span className={revenue.diffKrw ? styles.preSettleDiff : undefined}>{`차이 ${diff}`}</span>);
  if (parts.length === 0) return null;
  return (
    <p className={styles.preSettleRevenue}>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? " · " : null}
          {part}
        </Fragment>
      ))}
    </p>
  );
}

export function PreSettleCheckSection({ check, ownerName }: { check: PreSettleCheckDto; ownerName: string | null }) {
  const router = useRouter();
  const doors = useContext(PreSettleLedgerContext);
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
    const label = <span className="sr-only">{`${row.displayNo} ${row.itemName} `}</span>;
    if (door.kind === "purchase") {
      return (
        <RowActions>
          <RowAction href={door.href}>{label}구매 요청</RowAction>
        </RowActions>
      );
    }
    if (door.kind === "expense_open") {
      return (
        <span>
          <RowActions>
            <RowAction pending={pendingLine === row.lineId} busy={pendingLine !== null && pendingLine !== row.lineId} onClick={() => void openExpense(row.lineId)}>
              {label}지출결의 올리기
            </RowAction>
          </RowActions>
          {failedLine === row.lineId ? <span className={styles.doorFailure}>지출결의 만들기 실패 · 다시 시도</span> : null}
        </span>
      );
    }
    if (door.kind === "expense_closed") {
      return (
        <RowActions>
          <RowAction href={`/expenses/${door.latestId}`}>{label}지출결의 열기</RowAction>
        </RowActions>
      );
    }
    if (door.kind === "no_vendor") return <span className={styles.doorNoVendor}>거래처 없음</span>;
    return null;
  }

  const lineColumns: TableColumn<PreSettleLineRowDto>[] = [
    { key: "number", header: "번호", priority: "p2", cell: (row) => row.displayNo },
    {
      key: "item",
      header: "항목",
      priority: "p1",
      cell: (row) => (
        <>
          <span className={styles.preSettleItem} title={row.itemName}>
            {row.itemName}
          </span>
          <PhoneLine>{doorCell(row)}</PhoneLine>
        </>
      ),
    },
    ...(check.unmatchedLines.rows.some((row) => "executionKrw" in row) ? [LINE_EXECUTION_COLUMN] : []),
    { key: "door", header: "행동", priority: "p3", headerHidden: true, cell: doorCell },
  ];

  const open = check.openExpenses;
  const unmatched = check.unmatchedLines;
  const missing = check.missingRevenue;
  const empty = open.count === 0 && unmatched.count === 0 && missing.count === 0;
  // PS-3 — 매출 기록 권한이면 `발행 줄 추가`(발행 요청 권한도 있어도), 발행 요청 권한만이면 `발행 요청 추가`. 1024 미만은 둘 다 없다(사실만).
  const revenueDoor = !doors?.editableWidth
    ? null
    : doors.canWriteRevenue
      ? { label: "발행 줄 추가", onClick: doors.addIssued }
      : doors.canRequestIssue
        ? { label: "발행 요청 추가", onClick: doors.addIssueRequest }
        : null;
  return (
    <DetailScreen.Section title={PRE_SETTLE_CHECK_TITLE} headingId={PRE_SETTLE_CHECK_HEADING_ID}>
      <div data-ui="pre-settle-check">
        {empty ? <p className={styles.preSettleNone}>미결 없음</p> : null}
        {open.count > 0 ? (
          <>
            <GroupHeading text="미결 지출결의" count={`${open.count}건`} allowed={open.allowed} />
            {open.rows.length > 0 ? (
              <Table
                caption="미결 지출결의"
                columns={expenseColumns(open.rows.some((row) => "expenseAmountKrw" in row))}
                rows={open.rows}
                getRowId={(row) => row.id}
                rowLabel={(row) => row.number}
              />
            ) : null}
            <OutOfScope count={open.outOfScopeCount} />
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
            <p className={styles.preSettleMissing}>
              <span>발행 줄 없음</span>
              {revenueDoor && doors ? (
                <Button
                  variant="tertiary"
                  disabled={doors.saveLocked}
                  aria-describedby={doors.saveLocked ? doors.saveButtonId : undefined}
                  onClick={revenueDoor.onClick}
                >
                  {revenueDoor.label}
                </Button>
              ) : null}
            </p>
          </>
        ) : null}
        <RevenueLine revenue={check.revenue} onPending={doors?.focusCustomerApproval ?? null} />
      </div>
    </DetailScreen.Section>
  );
}
