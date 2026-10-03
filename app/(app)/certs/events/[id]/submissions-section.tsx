"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Num } from "@/ui/num/Num";
import { RowSheet } from "@/ui/table/RowSheet";
import { Table } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
import { formatSubmittedAtKst } from "@/domain/certs/format";
import type { CertSubmissionGroupDto, CertSubmissionReconcileDto } from "@/domain/certs/events";
import styles from "./event-detail.module.css";

// 04.3-17 — I′3 제출 섹션(대조 — UI-SPEC I′3 「제출 섹션」 · 「개정 (2026-10-01 결정 확정)」 T2 · T3 · T8). 읽기 표 =
// 공용 `ui/table/Table`(role="grid" 아님 — 편집 칸 0 · 숨긴 캡션 「제출」 — SYSTEM §7-3 읽기용 표 · DR-8). 경품별 그룹 머리글은
// `th[scope="rowgroup"]`(04.6-24 `groupHeaderScope`) `{경품명} · 제출 {N}건 / 당첨 {M}명`(+ N > M이면 ` · 초과 {N−M}건`만 경고 색),
// 그룹 안 제출 시각 오름차순. 화면은 대조를 판정하지 않는다(N13 a). 폰은 칸 접기(P1 이름 · 제출, P2 가린 연락처 · 수량) + 행 시트 `action` 「제출 내용」.

type Row = Partial<CertSubmissionReconcileDto>;

function submittedText(iso: string | undefined): string {
  return iso ? formatSubmittedAtKst(iso).slice(5) : "—";
}

// 이름 아래 색 글자 — `파기 대상` → `같은 연락처 {N}건` → `같은 이름 {N}건`(T2 순서, 모두 --status-warning). 대조 제외된 줄은 `대조 제외` 하나만(T3).
function marksOf(row: Row): string[] {
  if (row.excluded) return [];
  return [
    ...(row.purgeTarget ? ["파기 대상"] : []),
    ...((row.samePhoneCount ?? 0) >= 2 ? [`같은 연락처 ${row.samePhoneCount}건`] : []),
    ...((row.sameNameCount ?? 0) >= 2 ? [`같은 이름 ${row.sameNameCount}건`] : []),
  ];
}

function reviewHref(row: Row): string {
  return `/certs/submissions/${row.id ?? ""}`;
}

// 접근 이름 덧붙임 — `제출 내용 · {이름} · {MM-dd HH:mm}`(줄마다 다르게 — DR-8).
function linkSuffix(row: Row): string {
  return ` · ${row.name ?? ""} · ${submittedText(row.submittedAt)}`;
}

// 접힌 줄(폰)의 접근 이름 앞부분 — 표가 뒤에 ` 상세 보기`를 붙인다.
function tapName(row: Row): string {
  return `${row.name ?? ""} · ${submittedText(row.submittedAt)}`;
}

function tapLabel(row: Row): string {
  return `${tapName(row)} 상세 보기`;
}

type Line = { row: Row; group: CertSubmissionGroupDto };

export function SubmissionsSection({
  groups,
  focusSubmissionId,
}: {
  groups: CertSubmissionGroupDto[];
  /** 「대조 제외」 뒤 I′3로 돌아왔을 때 포커스할 줄(T3) — 그 줄의 「제출 내용」(폰은 접힌 줄). */
  focusSubmissionId?: string;
}) {
  const [sheet, setSheet] = useState<{ row: Row; prizeName: string } | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const linkRefs = useRef(new Map<string, HTMLAnchorElement>());

  const lines: Line[] = groups.flatMap((group) => group.rows.map((row) => ({ row, group })));

  // 폰 접힌 줄(표가 그리는 `td[role="button"]`)의 접근 이름 — 「제출 내용」 열이 접혀 있을 때의 포커스 자리.
  const focusLine = focusSubmissionId ? lines.find((line) => line.row.id === focusSubmissionId) : undefined;
  const focusTapLabel = focusLine ? tapLabel(focusLine.row) : null;

  useEffect(() => {
    if (!focusSubmissionId) return;
    const link = linkRefs.current.get(focusSubmissionId);
    if (link && link.offsetParent !== null) {
      link.focus();
      return;
    }
    const taps = sectionRef.current?.querySelectorAll<HTMLElement>('td[role="button"]') ?? [];
    for (const tap of taps) {
      if (tap.getAttribute("aria-label") === focusTapLabel) {
        tap.focus();
        break;
      }
    }
  }, [focusSubmissionId, focusTapLabel]);

  const columns: TableColumn<Line>[] = [
    {
      key: "name",
      header: "이름",
      priority: "p1",
      cell: ({ row }) => {
        const marks = marksOf(row);
        return (
          <>
            <span className={styles.wrapText}>{row.name ?? "—"}</span>
            {row.excluded ? (
              <span className={styles.rowMarkMuted}>대조 제외</span>
            ) : marks.length > 0 ? (
              <span className={styles.rowMarks}>{marks.join(" · ")}</span>
            ) : null}
          </>
        );
      },
    },
    { key: "phone", header: "연락처", priority: "p2", cell: ({ row }) => <Num value={row.phoneMasked ?? "—"} /> },
    {
      key: "quantity",
      header: "수량",
      priority: "p2",
      align: "right",
      cell: ({ row }) => <Num value={row.quantity ?? null} unit="count" />,
      summary: ({ row }) => `${row.quantity ?? "—"}개`,
    },
    { key: "submittedAt", header: "제출", priority: "p1", cell: ({ row }) => <Num value={submittedText(row.submittedAt)} /> },
    {
      key: "action",
      header: "동작",
      priority: "p3",
      cell: ({ row }) => {
        const id = row.id ?? "";
        return (
          // I4 렌더는 조회 기록 · 개인정보 첫 접근 판정을 부른다 — 미리 가져오기 금지(04.3-14 E4-B2).
          <Link
            ref={(element) => {
              if (element) linkRefs.current.set(id, element);
              else linkRefs.current.delete(id);
            }}
            href={reviewHref(row)}
            prefetch={false}
            className={styles.rowLink}
          >
            제출 내용
            <span className="sr-only">{linkSuffix(row)}</span>
          </Link>
        );
      },
    },
  ];

  return (
    <section ref={sectionRef} className={[styles.section, styles.submissions].join(" ")} aria-labelledby="cert-submission-section-label">
      <h2 id="cert-submission-section-label" className={styles.sectionLabel}>
        제출
      </h2>
      {lines.length === 0 ? (
        <p className={styles.emptyLine}>제출이 없습니다</p>
      ) : (
        <Table
          caption="제출"
          columns={columns}
          rows={lines}
          getRowId={({ row }) => row.id ?? ""}
          groupBy={({ group }) => group.prizeId}
          groupHeader={({ group }) => {
            const over = group.submittedCount - group.winnerCount;
            return (
              <>
                {`${group.prizeName} · 제출 ${group.submittedCount}건 / 당첨 ${group.winnerCount}명`}
                {over > 0 ? (
                  <>
                    {" · "}
                    <span className={styles.warningText}>{`초과 ${over}건`}</span>
                  </>
                ) : null}
              </>
            );
          }}
          groupHeaderScope="rowgroup"
          onRowTap={({ row, group }) => setSheet({ row, prizeName: group.prizeName })}
          rowLabel={({ row }) => tapName(row)}
        />
      )}
      {sheet ? (
        <RowSheet
          open
          onClose={() => setSheet(null)}
          title={sheet.row.name ?? "—"}
          subtitle={`${sheet.prizeName} · ${submittedText(sheet.row.submittedAt)}`}
          items={[
            { label: "연락처", value: sheet.row.phoneMasked ?? "—" },
            { label: "수량", value: `${sheet.row.quantity ?? "—"}개` },
          ]}
          action={
            // 표 줄 링크와 같은 이유로 미리 가져오기 금지(04.3-14 E4-B2).
            <Link href={reviewHref(sheet.row)} prefetch={false} className={`${styles.rowLink} ${styles.sheetLink}`}>
              제출 내용
              <span className="sr-only">{linkSuffix(sheet.row)}</span>
            </Link>
          }
        />
      ) : null}
    </section>
  );
}
