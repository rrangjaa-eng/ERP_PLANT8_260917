"use client";

import { useRouter } from "next/navigation";
import type { BudgetListStatus, BudgetRowDto } from "@/domain/projects/budget";
import { Num } from "@/ui/num/Num";
import { Select } from "@/ui/select/Select";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { Table } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
// 필터 칸 라벨 모양은 프로젝트 목록과 같은 클래스(새 CSS 없음).
import projectStyles from "@/app/(app)/projects/projects.module.css";
import styles from "./budget.module.css";

// 07-24(SC-21 · K9 · K11): 예산 현황 읽기 표. 열 순서 프로젝트 · 남은 예산 · 상태(P1) · 예산 · 사용액(P2) · PO 금액(P3).
// 금액은 Num(₩ 없음 — K9), 계산 불가 행의 예산 · 남은 예산은 —. 상태 칸은 한 값(초과 > 프로젝트 상태 — K11).
// 금액 열은 서버가 금액 키를 보냈을 때만 그린다(정보 항목 budget.amount — 키 부재면 열째 없다, SYSTEM §7-3 칸 수 가변).

function columns(showAmount: boolean, showPo: boolean): TableColumn<BudgetRowDto>[] {
  return [
    {
      key: "project",
      header: "프로젝트",
      priority: "p1",
      cell: (row) => (
        <span className={styles.project} title={`${row.number} · ${row.name}`}>
          <span className={styles.clip}>{`${row.number} · ${row.name}`}</span>
        </span>
      ),
    },
    ...(showAmount ? [{ key: "remaining", header: "남은 예산", priority: "p1" as const, align: "right" as const, cell: (row: BudgetRowDto) => <Num value={row.remainingKrw ?? null} /> }] : []),
    { key: "status", header: "상태", priority: "p1", cell: (row) => <StatusTag variant="text" status={row.statusWord} /> },
    ...(showAmount
      ? [
          { key: "budget", header: "예산", priority: "p2" as const, align: "right" as const, cell: (row: BudgetRowDto) => <Num value={row.budgetKrw ?? null} /> },
          { key: "used", header: "사용액", priority: "p2" as const, align: "right" as const, cell: (row: BudgetRowDto) => <Num value={row.usedKrw ?? null} /> },
        ]
      : []),
    ...(showPo ? [{ key: "po", header: "PO 금액", priority: "p3" as const, align: "right" as const, cell: (row: BudgetRowDto) => <Num value={row.poAmountKrw ?? null} /> }] : []),
  ];
}

export function BudgetTable({ rows, showAmount, showPo }: { rows: BudgetRowDto[]; showAmount: boolean; showPo: boolean }) {
  return <Table caption="예산 현황" columns={columns(showAmount, showPo)} rows={rows} getRowId={(row) => row.projectId} />;
}

// 필터 줄 — 상태 하나(진행 기본 / 전체). 고르면 바로 GET 이동.
export function BudgetFilter({ status, options }: { status: BudgetListStatus; options: { value: BudgetListStatus; label: string }[] }) {
  const router = useRouter();
  return (
    <div className={projectStyles.selectLabel}>
      <label htmlFor="budget-filter-status">상태</label>
      <Select
        key={status}
        id="budget-filter-status"
        options={options}
        hideEmptyOption
        defaultValue={status}
        onChange={(event) => router.push(event.target.value === "all" ? "/projects/budget?status=all" : "/projects/budget", { scroll: false })}
      />
    </div>
  );
}
