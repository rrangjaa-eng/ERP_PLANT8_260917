"use client";

import { Table } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
import { Num } from "@/ui/num/Num";
import { formatForeignLine, formatKrw } from "@/lib/format-number";

// 06-05(UI-SPEC S8): 카드 사용 읽기 표 — 그룹 머리글 = 카드, 그룹 안 사용일 오름차순(서버 정렬). 카드 열은 그룹이 말하므로 두지 않는다.
// 행동 칸 `수정` · `삭제`는 06-09, 연결의 견적 줄 · 견적 외 비용 글자는 06-07이 더한다.

export type CardUsageListRowView = {
  id: string;
  cardId: string;
  cardLabel: string;
  usedOn: string;
  merchantName: string | null;
  linkKind: string;
  teamName: string | null;
  registeredByName: string;
  totalKrw: number | null;
  supplyKrw: number | null;
  vatKrw: number | null;
  currency: string | null;
  foreignAmount: number | null;
  fxRate: number | null;
};

// 「표시 — 카드 사용 결제 합계 2행」 한 형식: 외화면 `USD 1,000.00 @1,350 · 공급가 N`, 원화 부가세 규칙이면 `공급가 N`, 규칙 없음(공급가 = 합계)은 2행 없음.
function totalSecondLine(row: CardUsageListRowView): string | null {
  if (row.supplyKrw === null) return null;
  const supply = `공급가 ${formatKrw(row.supplyKrw)}`;
  const foreign =
    row.currency && row.foreignAmount !== null && row.fxRate !== null ? formatForeignLine({ currency: row.currency, amount: row.foreignAmount, fxRate: row.fxRate }) : null;
  if (foreign) return `${foreign} · ${supply}`;
  return row.vatKrw ? supply : null;
}

function linkText(row: CardUsageListRowView): string {
  if (row.linkKind === "team_cost") return `팀 비용 · ${row.teamName ?? "—"}`;
  return "—";
}

const COLUMNS: TableColumn<CardUsageListRowView>[] = [
  { key: "usedOn", header: "사용일", priority: "p2", cell: (row) => <Num value={row.usedOn.slice(5)} /> },
  { key: "merchant", header: "가맹점", priority: "p2", cell: (row) => row.merchantName ?? "—" },
  { key: "link", header: "연결", priority: "p1", cell: (row) => linkText(row) },
  {
    key: "total",
    header: "결제 합계",
    priority: "p1",
    align: "right",
    cell: (row) => <Num value={row.totalKrw} />,
    secondaryLine: totalSecondLine,
  },
  { key: "evidence", header: "증빙", priority: "p3", collapseBelow: 1024, cell: () => "—" },
  { key: "registered", header: "등록", priority: "p1", cell: (row) => row.registeredByName },
];

export function CardUsageList({ rows }: { rows: CardUsageListRowView[] }) {
  return (
    <Table
      caption="카드 사용"
      columns={COLUMNS}
      rows={rows}
      getRowId={(row) => row.id}
      groupBy={(row) => row.cardId}
      groupHeader={(row) => row.cardLabel}
    />
  );
}
