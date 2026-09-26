"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { Table } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
import { Button } from "@/ui/button/Button";
import { StatusTag, type StatusTagKind } from "@/ui/status-tag/StatusTag";
import { Toast, type ToastTone } from "@/ui/toast/Toast";
import { approveAction } from "./actions";
import styles from "@/app/(app)/leave/leave.module.css";

// 04.1-02 S4 첫 형태 — 그룹 `내 결재`(비면 머리글째 없음) · `처리함`. `내 결재` 행의 상태 칸은 비우고
// (그룹 머리글이 말한다), PC 행동 칸에 3차 `승인` — 확인 없이 즉시(사용자 결정 #3). 반려 버튼 · 폰 결재
// 시트는 04.1-05. 성공하면 토스트 + 서버가 목록을 다시 그려 그 행이 `처리함`으로 옮겨 간다.
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
};

const GROUP_HEADERS: Record<InboxRow["group"], string> = { mine: "내 결재", processed: "처리함" };

function documentCellId(row: InboxRow): string {
  return `inbox-doc-${row.id.replace(/[^a-zA-Z0-9-]/g, "-")}`;
}

export function InboxTable({ rows }: { rows: InboxRow[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const { execute } = useAction(approveAction, {
    onSuccess: ({ data }) => {
      if (!data) return;
      const message = data.final
        ? data.deductedDays
          ? `승인 · 최종 승인 · ${data.deductedDays} 차감`
          : "승인 · 최종 승인"
        : data.nextHolderNames
          ? `승인 · 결재 요청됨 → ${data.nextHolderNames}`
          : "승인 · 결재 요청됨";
      setToast({ message, tone: "default" });
      router.refresh();
    },
    onError: ({ error }) => {
      if (error.serverError) setToast({ message: error.serverError, tone: "error" });
    },
    onSettled: () => setPendingId(null),
  });

  const columns: TableColumn<InboxRow>[] = [
    {
      key: "document",
      header: "문서",
      priority: "p1",
      cell: (row) => (
        <span id={documentCellId(row)}>
          {row.href ? (
            <Link href={row.href} className={styles.link}>
              {row.document}
            </Link>
          ) : (
            row.document
          )}
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
              if (pendingId) return;
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
      {toast ? <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
