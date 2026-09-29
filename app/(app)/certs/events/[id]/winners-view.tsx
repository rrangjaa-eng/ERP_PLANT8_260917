"use client";

import { useState } from "react";
import { Table } from "@/ui/table/Table";
import { RowSheet } from "@/ui/table/RowSheet";
import type { TableColumn } from "@/ui/table/types";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import type { CertWinnerDto, CertWinnerSubmitState } from "@/domain/certs/events";
import { formatSubmittedAtKst } from "@/domain/certs/format";
import styles from "./event-detail.module.css";

// 04.3-04 Task 4 ③ — I3 당첨자 읽기 표(흰 머리글). 편집 표 · 행동 열은 04.3-10.
// 제출 열: 제출됨(--success) + 2행 MM-dd HH:mm · 미제출(--muted) · 잠김(--warning) + 2행 HH:mm까지 / 잠금 풀기 필요.
// 폰(<700): P1 이름 · 수량 · 제출, P2 접힌 줄 `전화 · 경품 · 전달( · 구별 표시)`, 행 탭 → RowSheet(보기 전용).
type Row = Partial<CertWinnerDto> & { rowId: string };

const DELIVERY_LABEL = { onsite: "현장", parcel: "택배" } as const;

function submitWord(submit: CertWinnerSubmitState | undefined): { word: string; kind: "success" | "muted" | "warning" } {
  if (submit?.kind === "submitted") return { word: "제출됨", kind: "success" };
  if (submit?.kind === "shortLocked" || submit?.kind === "hardLocked") return { word: "잠김", kind: "warning" };
  return { word: "미제출", kind: "muted" };
}

function submitSecond(submit: CertWinnerSubmitState | undefined): string | null {
  if (submit?.kind === "submitted") return formatSubmittedAtKst(submit.at).slice(5);
  if (submit?.kind === "shortLocked") return `${formatSubmittedAtKst(submit.until).slice(11)}까지`;
  if (submit?.kind === "hardLocked") return "잠금 풀기 필요";
  return null;
}

function submitText(submit: CertWinnerSubmitState | undefined): string {
  const second = submitSecond(submit);
  return second ? `${submitWord(submit).word} ${second}` : submitWord(submit).word;
}

function recipientText(row: Row): string {
  return [row.recipientName, row.recipientSecondLine].filter(Boolean).join(" · ");
}

export function WinnersView({ winners }: { winners: Partial<CertWinnerDto>[] }) {
  const rows: Row[] = winners.map((winner, index) => ({ ...winner, rowId: winner.id ?? `row-${index}` }));
  const [sheetRowId, setSheetRowId] = useState<string | null>(null);
  const sheetRow = rows.find((row) => row.rowId === sheetRowId);
  const submittedCount = rows.filter((row) => row.submit?.kind === "submitted").length;

  const columns: TableColumn<Row>[] = [
    { key: "name", header: "이름", priority: "p1", cell: (row) => <span className={styles.nowrap}>{row.name ?? "—"}</span> },
    { key: "phone", header: "전화번호", priority: "p2", cell: (row) => <span className={styles.nowrap}>{row.phone ?? "—"}</span> },
    { key: "prizeName", header: "경품명", priority: "p2", cell: (row) => <span className={styles.wrapText}>{row.prizeName ?? "—"}</span> },
    { key: "quantity", header: "수량", priority: "p1", align: "right", cell: (row) => <span className={styles.nowrap}>{row.quantity ?? "—"}</span> },
    { key: "delivery", header: "전달", priority: "p2", cell: (row) => (row.delivery ? DELIVERY_LABEL[row.delivery] : "—") },
    {
      key: "distinguishLabel",
      header: "구별 표시",
      priority: "p2",
      cell: (row) => row.distinguishLabel ?? "",
      summary: (row) => row.distinguishLabel || null,
    },
    {
      key: "recipient",
      header: "수령자 화면",
      priority: "p3",
      cell: (row) => (
        <>
          <span className={styles.nowrap}>{row.recipientName ?? "—"}</span>
          {row.recipientSecondLine ? <span className={styles.previewSecond}>{row.recipientSecondLine}</span> : null}
        </>
      ),
    },
    {
      key: "submit",
      header: "제출",
      priority: "p1",
      cell: (row) => {
        const { word, kind } = submitWord(row.submit);
        const second = submitSecond(row.submit);
        return (
          <>
            <StatusTag kind={kind} variant="text">
              {word}
            </StatusTag>
            {second ? <span className={styles.secondLine}>{second}</span> : null}
          </>
        );
      },
    },
  ];

  return (
    <>
      <Table
        caption="당첨자"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.rowId}
        onRowTap={(row) => setSheetRowId(row.rowId)}
        rowLabel={(row) => row.name ?? "당첨자"}
        footer={
          <tr>
            <td colSpan={columns.length} className={styles.footerCell}>
              {`합계 · ${rows.length}명 · 제출 ${submittedCount}명`}
            </td>
          </tr>
        }
      />
      {sheetRow ? (
        <RowSheet
          open
          onClose={() => setSheetRowId(null)}
          title={sheetRow.name ?? "당첨자"}
          subtitle={submitText(sheetRow.submit)}
          items={[
            { label: "전화번호", value: sheetRow.phone ?? "—" },
            { label: "경품명", value: sheetRow.prizeName ?? "—" },
            { label: "수량", value: sheetRow.quantity ?? "—" },
            { label: "전달", value: sheetRow.delivery ? DELIVERY_LABEL[sheetRow.delivery] : "—" },
            { label: "구별 표시", value: sheetRow.distinguishLabel || "—" },
            { label: "수령자 화면", value: recipientText(sheetRow) || "—" },
          ]}
        />
      ) : null}
    </>
  );
}
