"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
import { useEditableWidth } from "@/ui/table/use-editable-width";
import { Num } from "@/ui/num/Num";
import { Button, buttonLinkClassName } from "@/ui/button/Button";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import type { StatusWord } from "@/ui/status-tag/status-map";
import type { PaidPaymentRowDto } from "@/domain/expenses/dto";
import type { ConfirmEvidenceResult } from "@/domain/evidence-reviews";
import { formatKrw } from "@/lib/format-number";
import { PAID_COLUMN_LABELS } from "./list-columns";
import { EvidenceConfirmDialog } from "./evidence-confirm-dialog";
import { usePhoneWidth } from "./payment-targets-table";
import styles from "./expenses.module.css";

// 06-20(UI-SPEC S3): 「지급 완료」 보기 표 — 서버가 정한 주 그룹 · 순서 그대로 그리고 1차가 없다(지급 취소는 문서 화면 S5).
// 지급 방식은 낱말만(계좌 글자 없음 — 대표가 이 목록을 읽는다, O-17). 번호는 식별자형 링크 → 문서 화면, 폰은 행 전체(phoneRowLink).
// 열 우선순위: P1 = 항목 · 이체액, P2 = 번호 · 거래처 · 지급일 · 증빙, P3 = 지급 방식 · 차이 사유 · 처리한 사람(좁은 PC에서도 P3부터 숨는다).
// 지급일은 폰 접힌 줄(DOM 감사 D-3 — SYSTEM §7-3 「날짜는 접힌 줄」, 5em 제목 바닥 + 13자리 이체액 + 지급일 세 열이 320에서 넘쳤다).
// 1024 미만은 P2 번호 · 거래처도 접는다(DOM 감사 D-1 — S1과 같은 collapseBelow, 증빙은 3차 문서 화면 링크 자리라 남긴다). 폰 접힌 줄에는 그대로 낀다.
export type PaidScreenRow = Partial<PaidPaymentRowDto> & { id: string; group: string };

// 차이는 부호를 붙인다(`-3,300` · `+1,200` — S1 · S5 SignedNum과 같은 꼴). 값은 서버 diffKrw.
function SignedNum({ value }: { value: number }) {
  return <Num value={value > 0 ? `+${formatKrw(value)}` : formatKrw(value)} />;
}

// 「Error — 목록 로드」(C13) — 본문 자리에 한 줄 + 2차 `다시 시도`(같은 주소를 다시 받는다).
export function PaidLoadError() {
  const router = useRouter();
  return <ListEmpty message="지급 완료 목록 불러오지 못함" action={{ label: "다시 시도", onClick: () => router.refresh() }} tone="error" />;
}

// DR-4 · O-21(UI-SPEC S1 「제자리 증빙 확인」 「성공(S3)」): 지급 권한자에게만 증빙 칸 3차 `증빙 확인`(`확인 전`만). ≥1024는
// 06-17 EvidenceConfirmDialog(행 version = rowVersion — 새 판정 · 새 액션 없음), 1024 미만은 문서 화면 링크, 폰은 행 링크(3차 없음).
// 06.5 D-6520 — 빈 증빙 금액이 더는 막지 않아 R10-F2 갈래(문서 화면 링크)가 없다(DTO 칸은 06.5-02가 지운다).
// 성공하면 응답 상태로 그 행 증빙 칸을 덮고 3차가 사라지므로 포커스 = 그 행 번호 링크(§7-17). 목록은 다시 받는다.
export function PaidList({ rows, amountColumn, canConfirm }: { rows: PaidScreenRow[]; amountColumn: boolean; canConfirm: boolean }) {
  const router = useRouter();
  const wide = useEditableWidth();
  const phone = usePhoneWidth();
  const rootRef = useRef<HTMLDivElement>(null);
  const focusAfterCloseRef = useRef<string | null>(null);
  const [evidenceTarget, setEvidenceTarget] = useState<{ id: string; version: number } | null>(null);
  const [patches, setPatches] = useState<ReadonlyMap<string, { version: number; evidenceStatus: string }>>(new Map());
  // 확인 응답을 다시 받은 목록이 따라올 때까지 그 행에 덮는다(06-17 S1과 같은 규칙 — 더 새 version일 때만).
  const shown = rows.map((row) => {
    const patch = patches.get(row.id);
    return patch && (row.version ?? 0) < patch.version ? { ...row, ...patch } : row;
  });

  useEffect(() => {
    if (evidenceTarget !== null) return;
    const id = focusAfterCloseRef.current;
    focusAfterCloseRef.current = null;
    if (!id) return;
    setTimeout(() => rootRef.current?.querySelector<HTMLElement>(`a[data-paid-number="${CSS.escape(id)}"]`)?.focus(), 0);
  }, [evidenceTarget]);

  function confirmed(id: string, result: ConfirmEvidenceResult) {
    setPatches((current) => new Map(current).set(id, { version: result.version, evidenceStatus: result.evidenceStatus }));
    focusAfterCloseRef.current = id;
    setEvidenceTarget(null);
    router.refresh();
  }

  function evidenceAction(row: PaidScreenRow) {
    if (!canConfirm || phone || row.evidenceStatus !== "확인 전") return null;
    const label = `${row.number ?? ""} 증빙 확인`.trim();
    if (wide && typeof row.version === "number") {
      const version = row.version;
      return (
        <Button variant="tertiary" aria-label={label} data-cell-action="" onClick={() => setEvidenceTarget({ id: row.id, version })}>
          증빙 확인
        </Button>
      );
    }
    return (
      <Link href={`/expenses/${row.id}`} className={buttonLinkClassName("tertiary")} aria-label={label} data-cell-action="">
        증빙 확인
      </Link>
    );
  }

  const columns: TableColumn<PaidScreenRow>[] = [
    {
      key: "number",
      header: PAID_COLUMN_LABELS.number,
      priority: "p2",
      collapseBelow: 1024,
      cell: (row) =>
        row.number ? (
          <Link href={`/expenses/${row.id}`} className={styles.link} aria-label={`${row.number} 지출결의 열기`} data-paid-number={row.id}>
            <Num value={row.number} />
          </Link>
        ) : (
          <Num value={null} />
        ),
      summary: (row) => <Num value={row.number ?? null} />,
    },
    {
      key: "title",
      header: PAID_COLUMN_LABELS.title,
      priority: "p1",
      cell: (row) => (
        <span className={`${styles.titleCell} ${styles.paidTitle}`} data-row-id={row.id}>
          <Link href={`/expenses/${row.id}`} className={styles.link} title={row.title ?? undefined} data-row-link="">
            {row.title ?? "—"}
          </Link>
        </span>
      ),
    },
    {
      key: "vendor",
      header: PAID_COLUMN_LABELS.vendor,
      priority: "p2",
      collapseBelow: 1024,
      cell: (row) => (
        <span className={styles.vendorCell} title={row.vendorName ?? undefined}>
          {row.vendorName ?? "—"}
        </span>
      ),
      summary: (row) => row.vendorName ?? "—",
    },
    {
      key: "method",
      header: PAID_COLUMN_LABELS.method,
      priority: "p3",
      collapseBelow: 1280,
      cell: (row) => <span className={styles.nowrap}>{row.paymentMethodName ?? "—"}</span>,
    },
    { key: "payDate", header: PAID_COLUMN_LABELS.payDate, priority: "p2", cell: (row) => <Num value={row.payDate ? row.payDate.slice(5) : null} /> },
    ...(amountColumn
      ? ([
          {
            key: "transfer",
            header: PAID_COLUMN_LABELS.transfer,
            priority: "p1",
            align: "right",
            cell: (row) => <Num value={row.transferKrw ?? null} />,
            // 2행 `차이 {±}` — 차이 0이면 없다.
            secondaryLine: (row) =>
              row.diffKrw ? (
                <span className={styles.diffLine}>
                  {"차이 "}
                  <SignedNum value={row.diffKrw} />
                </span>
              ) : null,
          },
        ] satisfies TableColumn<PaidScreenRow>[])
      : []),
    {
      key: "diffReason",
      header: PAID_COLUMN_LABELS.diffReason,
      priority: "p3",
      collapseBelow: 1280,
      cell: (row) =>
        row.diffReason ? (
          <span className={styles.reasonCell} title={row.diffReason}>
            {row.diffReason}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "evidence",
      header: PAID_COLUMN_LABELS.evidence,
      priority: "p2",
      cell: (row) => (
        <span className={styles.evidenceCell}>
          {row.evidenceStatus ? <StatusTag status={row.evidenceStatus as StatusWord} variant="text" /> : "—"}
          {evidenceAction(row)}
        </span>
      ),
      summary: (row) => row.evidenceStatus ?? "—",
    },
    {
      key: "processedBy",
      header: PAID_COLUMN_LABELS.processedBy,
      priority: "p3",
      collapseBelow: 1280,
      cell: (row) => <span className={styles.nowrap}>{row.processedByName ?? "—"}</span>,
    },
  ];

  const evidenceRow = evidenceTarget ? shown.find((row) => row.id === evidenceTarget.id) : undefined;
  return (
    <div ref={rootRef}>
      <Table caption="지급 완료" columns={columns} rows={shown} getRowId={(row) => row.id} groupBy={(row) => row.group} phoneRowLink />
      {evidenceTarget ? (
        <EvidenceConfirmDialog
          open={evidenceRow === undefined || evidenceRow.evidenceStatus === "확인 전"}
          expenseId={evidenceTarget.id}
          rowVersion={evidenceRow?.version ?? evidenceTarget.version}
          onClose={() => setEvidenceTarget(null)}
          onConfirmed={(result) => confirmed(evidenceTarget.id, result)}
        />
      ) : null}
    </div>
  );
}
