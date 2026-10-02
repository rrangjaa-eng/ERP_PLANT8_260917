/* eslint-disable no-restricted-syntax -- 04.6 스킨 A 이관 전 */
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RowSheet } from "@/ui/table/RowSheet";
import { formatSubmittedAtKst } from "@/domain/certs/format";
import type { CertSubmissionGroupDto, CertSubmissionReconcileDto } from "@/domain/certs/events";
import styles from "./event-detail.module.css";

// 04.3-17 — I′3 제출 섹션(대조 — UI-SPEC I′3 「제출 섹션」 · 「개정 (2026-10-01 결정 확정)」 T2 · T3 · T8). 읽기 표 =
// `<table>` + 숨긴 `<caption>`(role="grid" 아님 — SYSTEM §7-3 읽기용 표 · DR-8). 경품별 그룹 머리글
// `{경품명} · 제출 {N}건 / 당첨 {M}명`(+ N > M이면 ` · 초과 {N−M}건`만 --warning), 그룹 안 제출 시각 오름차순.
// 화면은 대조를 판정하지 않는다(N13 a). 폰은 칸 접기(P1 이름 · 제출, P2 가린 연락처 · 수량) + 행 시트 `action` 「제출 내용」.

type Row = Partial<CertSubmissionReconcileDto>;

function submittedText(iso: string | undefined): string {
  return iso ? formatSubmittedAtKst(iso).slice(5) : "—";
}

// 이름 아래 색 글자 — `파기 대상` → `같은 연락처 {N}건` → `같은 이름 {N}건`(T2 순서, 모두 --warning). 대조 제외된 줄은 `대조 제외` 하나만(T3).
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

export function SubmissionsSection({
  groups,
  focusSubmissionId,
}: {
  groups: CertSubmissionGroupDto[];
  /** 「대조 제외」 뒤 I′3로 돌아왔을 때 포커스할 줄(T3) — 그 줄의 「제출 내용」(폰은 접힌 줄). */
  focusSubmissionId?: string;
}) {
  const [sheet, setSheet] = useState<{ row: Row; prizeName: string } | null>(null);
  const linkRefs = useRef(new Map<string, HTMLAnchorElement>());
  const tapRefs = useRef(new Map<string, HTMLTableCellElement>());

  useEffect(() => {
    if (!focusSubmissionId) return;
    const link = linkRefs.current.get(focusSubmissionId);
    const target = link && link.offsetParent !== null ? link : tapRefs.current.get(focusSubmissionId);
    target?.focus();
  }, [focusSubmissionId]);

  return (
    <section className={styles.section} aria-labelledby="cert-submission-section-label">
      <h2 id="cert-submission-section-label" className={styles.sectionLabel}>
        제출
      </h2>
      {groups.length === 0 ? (
        <p className={styles.emptyLine}>제출이 없습니다</p>
      ) : (
        <table className={styles.readTable}>
          <caption className="sr-only">제출</caption>
          <thead>
            <tr>
              <th scope="col">이름</th>
              <th scope="col" className={styles.p2}>
                연락처
              </th>
              <th scope="col" className={[styles.p2, styles.alignRight].join(" ")}>
                수량
              </th>
              <th scope="col">제출</th>
              <th scope="col" className={styles.p3}>
                <span className="sr-only">행동</span>
              </th>
            </tr>
          </thead>
          {groups.map((group) => {
            const over = group.submittedCount - group.winnerCount;
            return (
              <tbody key={group.prizeId}>
                <tr className={styles.groupRow}>
                  <th scope="rowgroup" colSpan={5} className={styles.groupHeader}>
                    {`${group.prizeName} · 제출 ${group.submittedCount}건 / 당첨 ${group.winnerCount}명`}
                    {over > 0 ? (
                      <>
                        {" · "}
                        <span className={styles.warningText}>{`초과 ${over}건`}</span>
                      </>
                    ) : null}
                  </th>
                </tr>
                {group.rows.map((row) => {
                  const id = row.id ?? "";
                  const marks = marksOf(row);
                  const at = submittedText(row.submittedAt);
                  const phone = row.phoneMasked ?? "—";
                  return [
                    <tr key={id} className={row.excluded ? styles.excludedRow : undefined}>
                      <td>
                        <span className={styles.wrapText}>{row.name ?? "—"}</span>
                        {row.excluded ? (
                          <span className={styles.rowMarkMuted}>대조 제외</span>
                        ) : marks.length > 0 ? (
                          <span className={styles.rowMarks}>{marks.join(" · ")}</span>
                        ) : null}
                      </td>
                      <td className={[styles.p2, styles.num].join(" ")}>{phone}</td>
                      <td className={[styles.p2, styles.num, styles.alignRight].join(" ")}>{row.quantity ?? "—"}</td>
                      <td className={styles.num}>{at}</td>
                      <td className={styles.p3}>
                        {/* I4 렌더는 조회 기록 · 개인정보 첫 접근 판정을 부른다 — 미리 가져오기 금지(04.3-14 E4-B2). */}
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
                      </td>
                    </tr>,
                    <tr key={`${id}-collapsed`} className={styles.collapsedRow}>
                      <td
                        ref={(element) => {
                          if (element) tapRefs.current.set(id, element);
                          else tapRefs.current.delete(id);
                        }}
                        colSpan={5}
                        className={styles.collapsedCell}
                        role="button"
                        tabIndex={0}
                        aria-haspopup="dialog"
                        aria-label={`${row.name ?? ""} · ${at} 상세 보기`}
                        onClick={() => setSheet({ row, prizeName: group.prizeName })}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSheet({ row, prizeName: group.prizeName });
                          }
                        }}
                      >
                        {`${phone} · ${row.quantity ?? "—"}개`}
                      </td>
                    </tr>,
                  ];
                })}
              </tbody>
            );
          })}
        </table>
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
