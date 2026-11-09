"use client";

import { useState, useSyncExternalStore } from "react";
import { Num } from "@/ui/num/Num";
import { Button } from "@/ui/button/Button";
import { RowSheet } from "@/ui/table/RowSheet";
import { Table } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
import styles from "../leave.module.css";

// 07.2-08 S20(PU12 · DC-11): 사람별 연차 잔여 — 읽기 전용 행 시트 표. 서버 페이지가 글자만 넘긴다(숫자 → `n일` · 숨은 값 `—`).
// 1280 이상 전열 · 700~1279는 P3(부여 · 결재 중 · 월차 남음) 숨김 · 폰은 P1 이름 + 남음, 접힌 줄 = P2(팀 · 사용) 라벨 없이, 행 탭 → 시트 6 라벨.
// 두 잔고를 더한 열은 없다.
export type PeopleBalanceRow = {
  id: string;
  name: string;
  resigned: boolean;
  team: string;
  granted: string;
  used: string;
  pending: string;
  remaining: string;
  monthlyRemaining: string;
};

// 700~1279: 부여 · 결재 중 · 월차 남음이 숨는데 행 탭 자리(접힌 줄)는 폰에만 있다 — 이 폭에서는 이름 칸이 같은 시트를 여는 단추다.
// 공유 훅(useMinWidth)에 700 단계를 더하지 않고 이 표 안에서 판정한다 — 서버 스냅숏은 거짓(수화 전에는 단추 없음, 폰 렌더와 같다).
const TABLET = "(min-width: 700px) and (max-width: 1279.98px)";
function useTabletWidth(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(TABLET);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(TABLET).matches,
    () => false,
  );
}

const columnsOf = (openSheet: ((row: PeopleBalanceRow) => void) | null): TableColumn<PeopleBalanceRow>[] => [
  {
    key: "name",
    header: "이름",
    priority: "p1",
    cell: (row) => (
      <>
        {openSheet ? (
          <Button variant="tertiary" onClick={() => openSheet(row)}>
            {row.name}
          </Button>
        ) : (
          row.name
        )}
        {row.resigned ? <span className={styles.resignedTag}> 퇴직</span> : null}
      </>
    ),
  },
  { key: "team", header: "팀", priority: "p2", cell: (row) => row.team },
  { key: "granted", header: "부여", priority: "p3", align: "right", collapseBelow: 1280, cell: (row) => <Num value={row.granted} /> },
  { key: "used", header: "사용", priority: "p2", align: "right", cell: (row) => <Num value={row.used} /> },
  { key: "pending", header: "결재 중", priority: "p3", align: "right", collapseBelow: 1280, cell: (row) => <Num value={row.pending} /> },
  { key: "remaining", header: "남음", priority: "p1", align: "right", cell: (row) => <Num value={row.remaining} /> },
  { key: "monthlyRemaining", header: "월차 남음", priority: "p3", align: "right", collapseBelow: 1280, cell: (row) => <Num value={row.monthlyRemaining} /> },
];

export function PeopleBalanceTable({ rows }: { rows: PeopleBalanceRow[] }) {
  const [sheet, setSheet] = useState<PeopleBalanceRow | null>(null);
  const columns = columnsOf(useTabletWidth() ? setSheet : null);
  return (
    <>
      <Table caption="사람별 연차 잔여" columns={columns} rows={rows} getRowId={(row) => row.id} onRowTap={setSheet} rowLabel={(row) => row.name} />
      <RowSheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title={sheet?.name ?? ""}
        subtitle={sheet?.resigned ? "퇴직" : ""}
        items={
          sheet
            ? [
                { label: "팀", value: sheet.team },
                { label: "부여", value: sheet.granted },
                { label: "사용", value: sheet.used },
                { label: "결재 중", value: sheet.pending },
                { label: "남음", value: sheet.remaining },
                { label: "월차 남음", value: sheet.monthlyRemaining },
              ]
            : []
        }
      />
    </>
  );
}
