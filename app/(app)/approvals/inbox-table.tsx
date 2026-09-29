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
  // `내 결재` 항목의 결재 시트 재료(서버 가능 행동 · 상세 · 결재선) — 처리함은 null.
  sheet: ApprovalSheetItem | null;
};

const GROUP_HEADERS: Record<InboxRow["group"], string> = { mine: "내 결재", processed: "처리함" };

function documentCellId(row: InboxRow): string {
  return `inbox-doc-${row.id.replace(/[^a-zA-Z0-9-]/g, "-")}`;
}

export function InboxTable({ rows }: { rows: InboxRow[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  // 행 제출 중 — 동기로 바뀌어 두 번째 누름을 무시한다(T7).
  const submittingRef = useRef(false);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [sheetItem, setSheetItem] = useState<ApprovalSheetItem | null>(null);
  const { execute } = useAction(approveAction, {
    onSuccess: ({ data }) => {
      if (!data) return;
      setToast({ message: approveToast(data), tone: "default" });
      router.refresh();
    },
    onError: ({ error }) => {
      if (error.serverError) setToast({ message: error.serverError, tone: "error" });
    },
    onSettled: () => {
      submittingRef.current = false;
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
        </span>
      ),
    },
    { key: "drafter", header: "기안", priority: "p2", cell: (row) => row.drafter },
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
        return (
          <Button
            variant="tertiary"
            pending={pendingId === row.id}
            aria-describedby={documentCellId(row)}
            onClick={() => {
              if (submittingRef.current) return;
              submittingRef.current = true;
              setPendingId(row.id);
              execute({ instanceId, expectedVersion });
            }}
          >
            승인
          </Button>
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
        onApproved={(message) => setToast({ message, tone: "default" })}
        onSecondary={() => undefined}
      />
      {toast ? <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
