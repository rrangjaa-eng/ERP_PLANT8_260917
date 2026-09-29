"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { Table } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
import { Button } from "@/ui/button/Button";
import { StatusTag, type StatusTagKind } from "@/ui/status-tag/StatusTag";
import { Toast, type ToastTone } from "@/ui/toast/Toast";
import { approveAction } from "./actions";
import { approveToast } from "./approve-toast";
import { ApprovalSheet, type ApprovalSheetItem } from "./approval-sheet";
import { ConflictLine } from "./conflict-line";
import { RejectDialog, WithdrawDialog, type DecisionTarget, type RejectMessages } from "./decision-dialogs";
import leaveStyles from "@/app/(app)/leave/leave.module.css";
import styles from "./inbox-table.module.css";

// 04.1-02 S4 · 04.1-05(S4 · S5 · T4 · ENG-16) — 그룹 `내 결재`(비면 머리글째 없음) · `처리함`. `내 결재` 행의 상태
// 칸은 비우고(그룹 머리글이 말한다), PC 행동 칸에 3차 `승인` — 확인 없이 즉시(사용자 결정 #3). 폰(<700)에서
// `내 결재` 행 = 전체 폭 button(aria-haspopup="dialog") → 결재 시트, `처리함` 행 = 전체 폭 문서 링크 → 문서 화면
// (처리함에는 상세를 미리 읽지 않는다). 갈래는 서버가 넘긴 그룹 값으로 정하고 상태 글자를 보지 않는다.
export type InboxRow = {
  id: string;
  group: "mine" | "processed";
  instanceId: string | null;
  version: number | null;
  href: string | null;
  document: string;
  drafter: string;
  days: string;
  status: { kind: StatusTagKind; label: string } | null;
  // `잔여 초과 N일`(해당할 때만) — PC는 문서 칸 2행, 폰은 접힌 줄 끝(UI-SPEC S4). 막힘이 아니라 경고다.
  overdraw: string | null;
  // `내 결재` 항목의 결재 시트 재료(서버 가능 행동 · 상세 · 결재선) — 처리함은 null.
  sheet: ApprovalSheetItem | null;
  // 반려 · 회수 확인 재료 — 처리함은 null.
  decision: DecisionTarget | null;
};

const GROUP_HEADERS: Record<InboxRow["group"], string> = { mine: "내 결재", processed: "처리함" };

function documentCellId(row: InboxRow): string {
  return `inbox-doc-${row.id.replace(/[^a-zA-Z0-9-]/g, "-")}`;
}

export function InboxTable({ rows, rejectMessages }: { rows: InboxRow[]; rejectMessages: RejectMessages }) {
  const router = useRouter();
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
  const { execute } = useAction(approveAction, {
    onSuccess: ({ data }) => {
      if (!data) return;
      setToast({ message: approveToast(data), tone: "default" });
      router.refresh();
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
      header: "문서",
      priority: "p1",
      cell: (row) => (
        <span id={documentCellId(row)}>
          {row.href ? (
            <Link href={row.href} className={[leaveStyles.link, row.group === "processed" ? styles.rowLink : styles.wideOnly].join(" ")}>
              {row.document}
            </Link>
          ) : (
            <span className={row.sheet ? styles.wideOnly : undefined}>{row.document}</span>
          )}
          {row.sheet ? (
            <button
              type="button"
              className={styles.rowTap}
              aria-haspopup="dialog"
              onClick={() => setSheetItem(row.sheet)}
            >
              {row.document}
            </button>
          ) : null}
          {row.overdraw ? <span className={styles.overdraw}>{row.overdraw}</span> : null}
        </span>
      ),
    },
    {
      key: "drafter",
      header: "기안",
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
        ) : row.group === "processed" && row.href ? (
          <Link href={row.href} tabIndex={-1} className={styles.foldTap}>
            {row.drafter}
          </Link>
        ) : (
          row.drafter
        ),
    },
    { key: "days", header: "일수", priority: "p1", align: "right", cell: (row) => row.days },
    {
      key: "status",
      header: "상태",
      priority: "p1",
      cell: (row) =>
        row.status ? (
          <StatusTag kind={row.status.kind} variant="text">
            {row.status.label}
          </StatusTag>
        ) : null,
    },
    {
      key: "actions",
      header: "행동",
      priority: "p3",
      cell: (row) => {
        if (row.group !== "mine" || !row.instanceId || row.version === null) return null;
        const instanceId = row.instanceId;
        const expectedVersion = row.version;
        const actions = row.sheet?.actions ?? [];
        const decision = row.decision;
        // PC 행은 서버 가능 행동에서 승인 · 반려만 그린다 — 회수는 행에 두지 않는다(T6 · #3, 문서 화면 · 폰 시트에서만).
        return (
          <span className={styles.rowActions}>
            {actions.includes("approve") ? (
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
            {actions.includes("reject") && decision ? (
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
        onApproved={showToast}
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
