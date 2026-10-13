"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { RevisionSummaryDto } from "@/domain/quotes/revisions";
import { formatKrw } from "@/lib/format-number";
import { Button } from "@/ui/button/Button";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { Table } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
import { OwnedEvidenceSection } from "@/app/(app)/expenses/owned-evidence";
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
  // 한 번에 하나 — 「차수 열기」(이전 차수 읽기 섹션)와 06-16 승인 증빙 펼침이 서로 바뀐다(S21 zero-one-many).
  const [open, setOpen] = useState<{ mode: "lines" | "evidence"; seq: number } | null>(null);
  const openSeq = open?.mode === "lines" ? open.seq : null;
  const headingId = useId();
  const evidenceHeadingId = useId();
  const evidenceButtonId = useId();
  const closedEvidenceRef = useRef(false);
  const rows = summaries.filter((row): row is SummaryRow => row.seq !== undefined);
  const latestSeq = Math.max(...rows.map((row) => row.seq));

  // 닫히면 포커스 = 그 3차(S21). 접힌 뒤 3차가 다시 그려진 다음에 옮긴다.
  useEffect(() => {
    if (open?.mode === "evidence" || !closedEvidenceRef.current) return;
    closedEvidenceRef.current = false;
    document.getElementById(evidenceButtonId)?.focus();
  }, [open, evidenceButtonId]);

  // 06-16(D-56) 승인 증빙 3차 — quote.amount 노출자에게만 개수가 실린다(approvalEvidenceCount가 DTO에 있을 때). 승인된 최신 차수는 늘, 승인 표시를 취소한 뒤에는 파일이 있을 때만.
  const evidenceShown = (row: SummaryRow) => row.approvalEvidenceCount !== undefined && (row.statusWord === "승인" || row.approvalEvidenceCount > 0);
  const evidenceRow = rows.find((row) => row.seq === latestSeq && evidenceShown(row));
  const openEvidenceRow = open?.mode === "evidence" ? rows.find((row) => row.seq === open.seq) : undefined;

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
          <StatusTag status={row.statusWord} variant="text" />
        ) : (
          ""
        ),
    },
    {
      key: "action",
      header: "동작",
      priority: "p1",
      // 현재 행은 빈 칸(06-16: 승인된 차수 · 승인 증빙이 있는 차수만 3차 `승인 증빙 {N}`). 이전 차수는 읽기 섹션을 펼치는 버튼(이동이 아니라 링크가 아니다 — DR-13).
      cell: (row) => {
        if (row.seq === latestSeq) {
          if (!evidenceShown(row)) return "";
          const count = row.approvalEvidenceCount ?? 0;
          const expanded = open?.mode === "evidence" && open.seq === row.seq;
          return (
            <Button
              id={evidenceButtonId}
              type="button"
              variant="tertiary"
              aria-expanded={expanded}
              aria-controls={expanded ? evidenceHeadingId : undefined}
              aria-label={count > 0 ? `${row.seq}차 승인 증빙 ${count}` : `${row.seq}차 승인 증빙`}
              onClick={() => {
                if (expanded) closedEvidenceRef.current = true;
                setOpen(expanded ? null : { mode: "evidence", seq: row.seq });
              }}
            >
              {count > 0 ? `승인 증빙 ${count}` : "승인 증빙"}
            </Button>
          );
        }
        return (
          <Button
            type="button"
            variant="tertiary"
            aria-expanded={openSeq === row.seq}
            aria-controls={headingId}
            onClick={() => setOpen((current) => (current?.mode === "lines" && current.seq === row.seq ? null : { mode: "lines", seq: row.seq }))}
          >
            {openSeq === row.seq ? "차수 닫기" : "차수 열기"}
          </Button>
        );
      },
    },
  ];

  return (
    <>
      <DetailScreen.Section title="차수">
        <Table caption="차수" columns={columns} rows={rows} getRowId={(row) => row.revisionId ?? String(row.seq)} />
      </DetailScreen.Section>
      <PreviousRevisionSection
        projectId={projectId}
        seq={openSeq}
        headingId={headingId}
        references={references}
        evidence={rows.map((row) => ({ seq: row.seq, revisionId: row.revisionId, show: evidenceShown(row) && row.seq !== latestSeq, approvedOn: row.approvedOn ?? null }))}
      />
      {open?.mode === "evidence" && evidenceRow && openEvidenceRow?.revisionId ? (
        <OwnedEvidenceSection
          key={openEvidenceRow.revisionId}
          kind="quote_revision"
          ownerId={openEvidenceRow.revisionId}
          headingId={evidenceHeadingId}
          title={`상세 견적 ${openEvidenceRow.seq}차 승인 증빙`}
          subtitle={openEvidenceRow.approvedOn ? `승인 ${openEvidenceRow.approvedOn}` : undefined}
          sectionClassName={styles.section}
          titleClassName={styles.previousTitle}
          subtitleClassName={styles.sectionSubtitle}
        />
      ) : null}
    </>
  );
}
