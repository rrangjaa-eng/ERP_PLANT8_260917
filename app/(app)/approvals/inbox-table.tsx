"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { Table } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
import { Button } from "@/ui/button/Button";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import type { StatusWord } from "@/ui/status-tag/status-map";
import { Toast, type ToastTone } from "@/ui/toast/Toast";
import { approveAction } from "./actions";
import { approveToast } from "./approve-toast";
import { APPROVE_FAILED_MESSAGE, ApprovalSheet, type ApprovalSheetItem, type ApproveOutcome } from "./approval-sheet";
import { ConflictLine } from "./conflict-line";
import { evidenceViewUrl } from "./evidence-url";
import { INBOX_COLUMN_LABELS } from "./list-columns";
import { rowApprovalActions } from "./row-actions";
import { useRefreshThenFocus } from "./refresh-then-focus";
import { RejectDialog, WithdrawDialog, type DecisionTarget, type RejectMessages } from "./decision-dialogs";
import leaveStyles from "@/app/(app)/leave/leave.module.css";
import styles from "./inbox-table.module.css";

// 04.1-02 S4 · 04.1-05(S4 · S5 · T4 · ENG-16) — 그룹 `내 결재`(비면 머리글째 없음) · `처리함`. `내 결재` 행의 상태
// 칸은 비우고(그룹 머리글이 말한다), PC 행동 칸에 3차 `승인` — 확인 없이 즉시(사용자 결정 #3). `내 결재` 행 = 문서 칸 button
// (aria-haspopup="dialog")이 행 전체를 덮어 → 결재 시트: PC(≥700)는 오른쪽 480 패널, 폰(<700)은 전체 폭 행 → 아래 시트(DR4 A —
// 같은 `SidePanel` 하나의 폭별 모양이라 JS 폭 판정이 없다). `처리함` 행 = 문서 링크 → 문서 화면(처리함에는 상세를 미리 읽지
// 않는다). 갈래는 서버가 넘긴 그룹 값으로 정하고 상태 글자를 보지 않는다.
export type InboxRow = {
  id: string;
  group: "mine" | "processed";
  instanceId: string | null;
  version: number | null;
  href: string | null;
  document: string;
  drafter: string;
  // 05-01(Round 4 D8): 숫자 칸 — 종류 요약 measure를 서버가 그린 노드(금액 `Num` · 일수 글자 · 숫자 없는 종류 `—` · 투영에서 빠지면 빈 칸).
  measure: ReactNode;
  status: StatusWord | null;
  // `잔여 초과 N일`(해당할 때만) — PC는 문서 칸 2행, 폰은 접힌 줄 끝(UI-SPEC S4). 막힘이 아니라 경고다.
  overdraw: string | null;
  // 서버 가능 행동(구조 값 — 결재 정보 노출과 무관, 사용자 결정 2026-09-29 A). 처리함은 빈 목록.
  actions: ApprovalSheetItem["actions"];
  // 05-10 D4: 종류가 준 `승인` 막힘 이유(서버 원문) — 있으면 PC 행은 `승인` 대신 이유 글자 + `반려`.
  approveBlockedReason: string | null;
  // `내 결재` 항목의 결재 시트 재료(서버 가능 행동 · 상세 · 결재선) — 처리함은 null. 결재 정보가 꺼진 계급은 상세가
  // 없어 null이다 — 그 행은 폰에서도 문서 링크로 문서 화면에 간다(거기 행동 줄이 있다).
  sheet: ApprovalSheetItem | null;
  // 반려 · 회수 확인 재료 — 처리함은 null.
  decision: DecisionTarget | null;
};

const GROUP_HEADERS: Record<InboxRow["group"], string> = { mine: "내 결재", processed: "처리함" };

function documentCellId(row: InboxRow): string {
  return `inbox-doc-${row.id.replace(/[^a-zA-Z0-9-]/g, "-")}`;
}

// 결재 시트 `승인` — 서버 액션 호출 · 토스트 문구 · 서버 거부 → 충돌 문구 변환(05-01 E7). 입력 오류 · 통신 실패는 `승인 실패` 한 줄(05 /review B3).
async function approveFromSheet(target: { instanceId: string; version: number }): Promise<ApproveOutcome> {
  try {
    const result = await approveAction({ instanceId: target.instanceId, expectedVersion: target.version });
    if (result?.data) return { message: approveToast(result.data) };
    return { conflict: result?.serverError ?? APPROVE_FAILED_MESSAGE };
  } catch {
    return { conflict: APPROVE_FAILED_MESSAGE };
  }
}

export function InboxTable({
  rows,
  rejectMessages,
  measureHeader,
}: {
  rows: InboxRow[];
  rejectMessages: RejectMessages;
  // 05-01 E5: 숫자 열 머리글(서버 listMyInbox) — null이면 숫자 열을 통째로 그리지 않는다.
  measureHeader: string | null;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  // 행 승인이 동시 처리로 거부되면 그 행 행동 칸에 한 줄 + 3차 `새로 고침`(토스트가 아니다 — 누른 자리 옆).
  const [rowConflict, setRowConflict] = useState<{ rowId: string; message: string } | null>(null);
  // 행 제출 중 — 동기로 바뀌어 두 번째 누름을 무시한다(T7).
  const submittingRef = useRef(false);
  const pendingIdRef = useRef<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [sheetItem, setSheetItem] = useState<ApprovalSheetItem | null>(null);
  const [rejectTarget, setRejectTarget] = useState<DecisionTarget | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<DecisionTarget | null>(null);
  const showToast = (message: string) => setToast({ message, tone: "default" });
  const refreshThenFocus = useRefreshThenFocus();
  // 승인한 줄이 사라진 뒤 포커스는 다음 줄의 열기(문서 칸 버튼 · 링크)로 — `승인`으로 가면 Enter 한 번 더로 다음 문서가 승인된다.
  // PC 행 `승인`과 결재 시트 `승인`(폰 — 05-11 웨이브 13 D3)이 같은 길을 쓴다.
  function refreshThenFocusNext(approvedIndex: number) {
    const next = approvedIndex < 0 ? undefined : rows[approvedIndex + 1];
    const nextId = next ? documentCellId(next) : null;
    refreshThenFocus(() => (nextId ? (document.getElementById(nextId)?.querySelector<HTMLElement>("button, a") ?? null) : null));
  }
  const { execute } = useAction(approveAction, {
    onSuccess: ({ data }) => {
      if (!data) return;
      setToast({ message: approveToast(data), tone: "default" });
      refreshThenFocusNext(rows.findIndex((row) => row.id === pendingIdRef.current));
    },
    onError: ({ error }) => {
      if (error.serverError && pendingIdRef.current) setRowConflict({ rowId: pendingIdRef.current, message: error.serverError });
    },
    onSettled: () => {
      submittingRef.current = false;
      pendingIdRef.current = null;
      setPendingId(null);
    },
  });

  const columns: TableColumn<InboxRow>[] = [
    {
      key: "document",
      header: INBOX_COLUMN_LABELS.document,
      priority: "p1",
      cell: (row) => (
        <span id={documentCellId(row)}>
          {row.sheet ? (
            <button
              type="button"
              className={styles.rowTap}
              aria-haspopup="dialog"
              onClick={() => setSheetItem(row.sheet)}
            >
              {row.document}
            </button>
          ) : row.href ? (
            <Link href={row.href} className={[leaveStyles.link, styles.rowLink].join(" ")}>
              {row.document}
            </Link>
          ) : (
            <span>{row.document}</span>
          )}
          {row.overdraw ? <span className={styles.overdraw}>{row.overdraw}</span> : null}
        </span>
      ),
    },
    {
      key: "drafter",
      header: INBOX_COLUMN_LABELS.drafter,
      priority: "p2",
      cell: (row) => row.drafter,
      // 폰 접힌 줄(`기안자 · MM-DD`)도 행의 일부라 주 행과 같은 곳으로 간다(04.1-07 DOM 감사 ① · `/leave` 04.1-06 #6과 같은 방식).
      // 접힌 줄은 ui/table이 aria-hidden으로 그리므로 탭 순서에서 빼고(주 행 대상 하나만 초점) ::after로 그 줄을 덮는다.
      summary: (row) =>
        row.sheet ? (
          <button type="button" tabIndex={-1} className={styles.foldTap} onClick={() => setSheetItem(row.sheet)}>
            {row.drafter}
            {row.overdraw ? (
              <>
                {" · "}
                <span className={styles.overdrawInline}>{row.overdraw}</span>
              </>
            ) : null}
          </button>
        ) : row.href ? (
          <Link href={row.href} tabIndex={-1} className={styles.foldTap}>
            {row.drafter}
          </Link>
        ) : (
          row.drafter
        ),
    },
    ...(measureHeader
      ? [{ key: "days", header: measureHeader, priority: "p1", align: "right", cell: (row) => row.measure } satisfies TableColumn<InboxRow>]
      : []),
    {
      key: "status",
      header: INBOX_COLUMN_LABELS.status,
      priority: "p1",
      cell: (row) =>
        row.status ? <StatusTag status={row.status} variant="text" /> : null,
    },
    {
      key: "actions",
      header: INBOX_COLUMN_LABELS.actions,
      priority: "p3",
      cell: (row) => {
        if (row.group !== "mine" || !row.instanceId || row.version === null) return null;
        const instanceId = row.instanceId;
        const expectedVersion = row.version;
        const actions = row.actions;
        const decision = row.decision;
        const cell = rowApprovalActions({ approveBlockedReason: row.approveBlockedReason, canReject: actions.includes("reject") && decision !== null });
        // PC 행은 서버 가능 행동에서 승인 · 반려만 그린다 — 회수는 행에 두지 않는다(T6 · #3, 문서 화면 · 폰 시트에서만).
        return (
          <span className={styles.rowActions}>
            {actions.includes("approve") && cell.showApprove ? (
              <Button
                variant="tertiary"
                pending={pendingId === row.id}
                aria-describedby={documentCellId(row)}
                onClick={() => {
                  if (submittingRef.current) return;
                  submittingRef.current = true;
                  pendingIdRef.current = row.id;
                  setPendingId(row.id);
                  setRowConflict(null);
                  execute({ instanceId, expectedVersion });
                }}
              >
                승인
              </Button>
            ) : null}
            {actions.includes("approve") && cell.reasonText ? <span className={styles.blockedReason}>{cell.reasonText}</span> : null}
            {cell.showReject && decision ? (
              <Button
                variant="tertiary"
                disabled={pendingId === row.id}
                aria-describedby={documentCellId(row)}
                onClick={() => setRejectTarget(decision)}
              >
                반려
              </Button>
            ) : null}
            {rowConflict?.rowId === row.id ? <ConflictLine message={rowConflict.message} /> : null}
          </span>
        );
      },
    },
  ];

  return (
    <>
      <Table caption="결재함" columns={columns} rows={rows} getRowId={(row) => row.id} groupBy={(row) => GROUP_HEADERS[row.group]} />
      <ApprovalSheet
        item={sheetItem}
        onClose={() => setSheetItem(null)}
        onApprove={approveFromSheet}
        onApproved={(message) => {
          showToast(message);
          refreshThenFocusNext(rows.findIndex((row) => row.sheet !== null && row.sheet.instanceId === sheetItem?.instanceId));
        }}
        evidenceUrl={evidenceViewUrl}
        onSecondary={(action, item) => {
          const row = rows.find((candidate) => candidate.sheet?.instanceId === item.instanceId);
          if (!row?.decision) return;
          if (action === "reject") setRejectTarget(row.decision);
          else setWithdrawTarget(row.decision);
        }}
      />
      <RejectDialog target={rejectTarget} messages={rejectMessages} onClose={() => setRejectTarget(null)} onDone={showToast} />
      <WithdrawDialog target={withdrawTarget} onClose={() => setWithdrawTarget(null)} onDone={showToast} />
      {toast ? <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
