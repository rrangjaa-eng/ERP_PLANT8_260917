"use client";

import { useId, useState } from "react";
import type { RevisionSummaryDto } from "@/domain/quotes/revisions";
import { formatKrw } from "@/lib/format-number";
import { Button } from "@/ui/button/Button";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { Table } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
import { PreviousRevisionSection, type QuoteLineReadReferences } from "./previous-revision";
import styles from "./project-detail.module.css";

// 04-24(S5 · U-2 · DR-13) — 차수 섹션. 편집 셀이 없어 ui/table이 캡션 있는 읽기 표로 그린다(모드 prop 없음).
// 행·상태 낱말은 서버 요약(listRevisionSummaries — 최신 순번부터) 그대로다. ui/history-list는 쓰지 않는다.
type SummaryRow = Partial<RevisionSummaryDto> & { seq: number };

export function RevisionSection({
  projectId,
  summaries,
  references,
}: {
  projectId: string;
  summaries: Partial<RevisionSummaryDto>[];
  references: QuoteLineReadReferences;
}) {
  const [openSeq, setOpenSeq] = useState<number | null>(null);
  const headingId = useId();
  const rows = summaries.filter((row): row is SummaryRow => row.seq !== undefined);
  const latestSeq = Math.max(...rows.map((row) => row.seq));

  const columns: TableColumn<SummaryRow>[] = [
    { key: "seq", header: "차수", priority: "p1", cell: (row) => `${row.seq}차` },
    // /design-review P-6 — 노출 투영으로 모든 행에서 빠진 열은 채우지 않고 열째 뺀다(SYSTEM 762-765).
    ...(rows.some((row) => row.createdOn !== undefined)
      ? [{ key: "createdOn", header: "생성일", priority: "p2", cell: (row) => row.createdOn ?? "" } satisfies TableColumn<SummaryRow>]
      : []),
    ...(rows.some((row) => row.lineCount !== undefined)
      ? [{ key: "lineCount", header: "줄 수", priority: "p2", cell: (row) => (row.lineCount === undefined ? "" : `${row.lineCount}줄`) } satisfies TableColumn<SummaryRow>]
      : []),
    ...(rows.some((row) => row.totalKrw !== undefined)
      ? [{ key: "total", header: "견적 합계", priority: "p1", align: "right", cell: (row) => (row.totalKrw === undefined ? "" : formatKrw(row.totalKrw)) } satisfies TableColumn<SummaryRow>]
      : []),
    {
      key: "status",
      header: "상태",
      priority: "p2",
      // U-2 — 최신 미승인 `현재` · 승인 `승인`(최신이어도 승인만) · 승인 없이 지나간 차수는 빈 칸(`—` 아님).
      cell: (row) =>
        row.statusWord ? (
          <StatusTag kind={row.statusWord === "승인" ? "success" : "accent"} variant="text">
            {row.statusWord}
          </StatusTag>
        ) : (
          ""
        ),
    },
    {
      key: "action",
      header: "동작",
      priority: "p1",
      // 현재 행은 빈 칸. 이전 차수는 읽기 섹션을 펼치는 버튼(이동이 아니라 링크가 아니다 — DR-13).
      cell: (row) =>
        row.seq === latestSeq ? (
          ""
        ) : (
          <Button
            type="button"
            variant="tertiary"
            aria-expanded={openSeq === row.seq}
            aria-controls={headingId}
            onClick={() => setOpenSeq((current) => (current === row.seq ? null : row.seq))}
          >
            {openSeq === row.seq ? "차수 닫기" : "차수 열기"}
          </Button>
        ),
    },
  ];

  return (
    <>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>차수</h2>
        <Table caption="차수" columns={columns} rows={rows} getRowId={(row) => row.revisionId ?? String(row.seq)} />
      </section>
      <PreviousRevisionSection projectId={projectId} seq={openSeq} headingId={headingId} references={references} />
    </>
  );
}
