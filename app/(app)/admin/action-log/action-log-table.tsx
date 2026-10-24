"use client";

import { useState } from "react";
import type { DetailLine } from "@/domain/action-log/detail-lines";
import { Num } from "@/ui/num/Num";
import { RowSheet } from "@/ui/table/RowSheet";
import { Table } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
import { DetailCell, detailLineText } from "./detail-cell";
import styles from "./action-log.module.css";

// 07-25 K16 · SC-08 — 서버 페이지가 줄 데이터(직렬화 가능한 글자)만 넘긴다(R1 · 함수 prop 없음).
// 폰(<700)은 P1 발생 시각 + 행동 종류 / P2 접힌 줄 첫 요소 = 상세 첫 줄이고, 행을 탭하면 시트에 바뀐 칸 전체가 보인다.
export type ActionLogRowView = {
  key: string;
  occurredAt: string | null;
  actionType: string;
  actorName: string | null;
  actorRoleName: string | null;
  entity: string | null;
  documentId: string | null;
  lines: DetailLine[] | null;
};

function firstLine(row: ActionLogRowView): string {
  const first = row.lines?.[0];
  return first ? detailLineText(first) : "—";
}

const COLUMNS: TableColumn<ActionLogRowView>[] = [
  { key: "occurredAt", header: "발생 시각", priority: "p1", headerClassName: styles.nowrapHeader, cell: (row) => <Num value={row.occurredAt} /> },
  { key: "actionType", header: "행동 종류", priority: "p1", headerClassName: styles.nowrapHeader, cell: (row) => row.actionType },
  {
    key: "detail",
    header: "상세",
    priority: "p2",
    headerClassName: styles.nowrapHeader,
    cell: (row) => <DetailCell lines={row.lines} />,
    summary: (row) => <span className={styles.detailFirst}>{firstLine(row)}</span>,
  },
  { key: "actor", header: "행위자", priority: "p2", headerClassName: styles.nowrapHeader, cell: (row) => row.actorName ?? "—" },
  { key: "actorRole", header: "행위자 계급", priority: "p2", headerClassName: styles.nowrapHeader, cell: (row) => row.actorRoleName ?? "—" },
  { key: "entity", header: "대상", priority: "p2", headerClassName: styles.nowrapHeader, cell: (row) => row.entity ?? "—" },
  { key: "document", header: "문서", priority: "p2", headerClassName: styles.nowrapHeader, cell: (row) => row.documentId ?? "—" },
];

export function ActionLogTable({ rows }: { rows: ActionLogRowView[] }) {
  const [sheet, setSheet] = useState<ActionLogRowView | null>(null);
  return (
    <>
      <Table
        caption="행동 로그"
        columns={COLUMNS}
        rows={rows}
        getRowId={(row) => row.key}
        onRowTap={setSheet}
        rowLabel={(row) => `${row.occurredAt ?? "—"} ${row.actionType}`}
      />
      <RowSheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title={sheet?.actionType ?? ""}
        subtitle={sheet?.occurredAt ?? "—"}
        items={
          sheet
            ? [
                { label: "행위자", value: sheet.actorName ?? "—" },
                { label: "행위자 계급", value: sheet.actorRoleName ?? "—" },
                { label: "대상", value: sheet.entity ?? "—" },
                { label: "문서", value: sheet.documentId ?? "—" },
                ...(sheet.lines
                  ? sheet.lines.map((line) => ({ label: line.label, value: `${line.before} → ${line.after}` }))
                  : [{ label: "상세", value: "—" }]),
              ]
            : []
        }
      />
    </>
  );
}
