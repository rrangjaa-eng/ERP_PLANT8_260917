"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { Table, reconcileSelection } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
import { useEditableWidth } from "@/ui/table/use-editable-width";
import { Num } from "@/ui/num/Num";
import { Pagination } from "@/ui/pagination/Pagination";
import { pageRangeText } from "@/ui/pagination/page-window";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import type { StatusWord } from "@/ui/status-tag/status-map";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import type { PaymentTargetRowDto } from "@/domain/expenses/dto";
import type { BatchPaymentResult } from "@/domain/payments/batch";
import { AMOUNT_HIDDEN } from "@/domain/payments/action-row";
import { completePaymentsBatchAction } from "./actions";
import { BatchPaymentDialog } from "./batch-payment-dialog";
import { StatusFilter, type FilterSelect } from "./status-filter";
import { PAYMENT_TARGET_COLUMN_LABELS, PAYMENT_TARGET_VIEW } from "./list-columns";
import styles from "./expenses.module.css";

// 06-15(UI-SPEC S1 · S2): 「지급 대상」 보기 — 05 ListScreen 틀 그대로(제목 `지출결의`, 부제 없음). 선택 열은 06-29 `Table.selection`,
// 1차 `지급 완료 N`은 06-29 `ListScreen.primaryAction` 버튼 갈래 — 둘 다 ≥1024에서만(DR-36, 그 미만은 보기 전용 · 폰은 행 → 문서 화면).
// 행을 고를 수 있는지 · 이유는 서버 행 값(selectable · reason)을 그대로 쓴다 — 클라이언트는 판정하지 않는다. 처리 응답 뒤 처리된 행은 빠지고
// 막힌 행은 자리를 지키며 행 아래 이유 한 줄(위험 색)이 서고, 선택은 응답이 다시 판정한 selectable로 06-29 reconcileSelection이 다시 세운다(H-3).
// 결과 글자는 처음부터 DOM에 있는 빈 aria-live 영역에 쓴다(필터 다음 자리 — 1차와 떨어짐, M-2). 토스트 없음(C12).
// 이체액 편집 · 서버 합 · 쪽 넘는 선택 · 제자리 증빙 확인 · 포커스는 06-17, 계좌 칸 · 「지급 완료」 보기는 06-20.

export type PaymentTargetScreenRow = Partial<PaymentTargetRowDto> & { id: string; group: string; groupTone?: "warning" };

type Blocked = { reason: string; selectable: boolean; selectableReason: string | null; newPayableKrw: number | null; row: PaymentTargetScreenRow; index: number };

type ResultLine = { time: string; processed: number; blocked: number };

const NO_RESPONSE = "결과를 받지 못함 · 새로 고침";

// 받은 행에서 처리된 행을 빼고, 받은 목록에서 사라진 막힌 행(그사이 다른 사람이 지급 · 종결)은 원래 자리에 남긴다.
function mergeRows(rows: readonly PaymentTargetScreenRow[], processed: ReadonlySet<string>, blocked: ReadonlyMap<string, Blocked>): PaymentTargetScreenRow[] {
  const merged = rows.filter((row) => !processed.has(row.id));
  const present = new Set(merged.map((row) => row.id));
  const ghosts = [...blocked.entries()].filter(([id]) => !present.has(id)).sort((a, b) => a[1].index - b[1].index);
  for (const [, ghost] of ghosts) merged.splice(Math.min(ghost.index, merged.length), 0, ghost.row);
  return merged;
}

function selectableWith(blocked: ReadonlyMap<string, Blocked>) {
  return (row: PaymentTargetScreenRow): true | { reason: string } => {
    const after = blocked.get(row.id);
    if (after && !after.selectable) return { reason: after.selectableReason ?? row.reason ?? after.reason };
    if (row.selectable === true) return true;
    return { reason: row.reason ?? "" };
  };
}

function href(query: Record<string, string>, page?: number): string {
  const params = new URLSearchParams(query);
  if (page && page > 1) params.set("page", String(page));
  return `/expenses?${params.toString()}`;
}

export type PaymentTargetsScreenProps = {
  views: readonly string[];
  selects: FilterSelect[];
  // 지금 필터(보기 · 팀 · 증빙) — 쪽 링크가 같은 필터를 싣는다.
  query: Record<string, string>;
  rows: PaymentTargetScreenRow[];
  total: { count: number; sumKrw: number } | null;
  hasAny: boolean;
  page: { page: number; pageCount: number; total: number; pageSize: number };
  prepaidDueDays: number;
  today: string;
  // 빈 화면 행동 이동 곳 — 지급 완료 보기(V-1 `?status=`). URLSearchParams로 인코딩한 값이어야 한다(원시 공백 · 한글 href는 프리페치가 끝나지 않는다).
  paidHref: string;
  // 지급일 칸 오류 글자 — 05 DATE_FORMAT_ERROR(서버 상수).
  dateError: string;
};

export function PaymentTargetsScreen(props: PaymentTargetsScreenProps) {
  const router = useRouter();
  const wide = useEditableWidth();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [processed, setProcessed] = useState<ReadonlySet<string>>(new Set());
  const [blocked, setBlocked] = useState<ReadonlyMap<string, Blocked>>(new Map());
  const [result, setResult] = useState<ResultLine | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<{ ids: string[]; rows: PaymentTargetScreenRow[] }>({ ids: [], rows: [] });

  const rows = mergeRows(props.rows, processed, blocked);
  const selectable = selectableWith(blocked);
  const chosen = reconcileSelection(selectedIds, rows, (row) => row.id, selectable);
  const chosenRows = rows.filter((row) => chosen.includes(row.id));

  const { execute, isExecuting } = useAction(completePaymentsBatchAction, {
    onSuccess: ({ data }) => {
      if (!data) {
        setRejection(NO_RESPONSE);
        return;
      }
      applyResult(data);
    },
    onError: ({ error }) => setRejection(error.serverError ?? NO_RESPONSE),
  });

  function applyResult(data: BatchPaymentResult) {
    const before = mergeRows(props.rows, processed, new Map());
    const nextProcessed = new Set([...processed, ...data.processedIds]);
    const nextBlocked = new Map<string, Blocked>();
    for (const item of data.blocked) {
      const index = before.findIndex((row) => row.id === item.expenseId);
      const row = before[index] ?? snapshot.rows.find((candidate) => candidate.id === item.expenseId);
      if (!row) continue;
      nextBlocked.set(item.expenseId, {
        reason: item.reason,
        selectable: item.selectable,
        selectableReason: item.selectableReason,
        newPayableKrw: item.newPayableKrw,
        row: item.newPayableKrw === null ? row : { ...row, payableKrw: item.newPayableKrw },
        index: Math.max(index, 0),
      });
    }
    const nextRows = mergeRows(props.rows, nextProcessed, nextBlocked);
    setProcessed(nextProcessed);
    setBlocked(nextBlocked);
    setSelectedIds(reconcileSelection(snapshot.ids.filter((id) => !nextProcessed.has(id)), nextRows, (row) => row.id, selectableWith(nextBlocked)));
    setResult({ time: data.time, processed: data.processed, blocked: data.blocked.length });
    setDialogOpen(false);
    router.refresh();
  }

  function openDialog() {
    if (chosen.length === 0 || isExecuting) return;
    setSnapshot({ ids: chosen, rows: chosenRows });
    setRejection(null);
    setDialogOpen(true);
  }

  function confirm(payDate: string) {
    if (isExecuting) return;
    const sent = snapshot.rows.flatMap((row) =>
      typeof row.version === "number" && typeof row.payableKrw === "number" ? [{ expenseId: row.id, expenseVersion: row.version, expectedPayableKrw: row.payableKrw }] : [],
    );
    if (sent.length === 0) return;
    // 이유 줄 · 결과 글자는 다음 시도 때 지운다(04 DR-16 수명).
    setBlocked(new Map());
    setResult(null);
    setRejection(null);
    execute({ payDate, rows: sent });
  }

  const amountColumn = props.total !== null;
  const columns: TableColumn<PaymentTargetScreenRow>[] = [
    { key: "number", header: PAYMENT_TARGET_COLUMN_LABELS.number, priority: "p3", collapseBelow: 1280, cell: (row) => <Num value={row.number ?? null} /> },
    {
      key: "title",
      header: PAYMENT_TARGET_COLUMN_LABELS.title,
      priority: "p1",
      cell: (row) => (
        <span className={styles.titleCell}>
          <Link href={`/expenses/${row.id}`} className={styles.link} data-row-link="">
            {row.title ?? "—"}
          </Link>
        </span>
      ),
    },
    {
      key: "vendor",
      header: PAYMENT_TARGET_COLUMN_LABELS.vendor,
      priority: "p3",
      collapseBelow: 1280,
      cell: (row) => <span className={styles.vendorCell}>{row.vendorName ?? "—"}</span>,
    },
    { key: "method", header: PAYMENT_TARGET_COLUMN_LABELS.method, priority: "p2", cell: (row) => <span className={styles.nowrap}>{row.paymentMethodName ?? "—"}</span> },
    {
      key: "payment",
      header: PAYMENT_TARGET_COLUMN_LABELS.payment,
      priority: "p2",
      cell: (row) => <Num value={row.scheduledPaymentDate ? row.scheduledPaymentDate.slice(5) : null} />,
    },
    {
      key: "evidence",
      header: PAYMENT_TARGET_COLUMN_LABELS.evidence,
      priority: "p1",
      cell: (row) => (row.evidenceStatus ? <StatusTag status={row.evidenceStatus as StatusWord} variant="text" /> : null),
    },
    ...(amountColumn
      ? ([
          { key: "payable", header: PAYMENT_TARGET_COLUMN_LABELS.payable, priority: "p1", align: "right", cell: (row) => <Num value={row.payableKrw ?? null} /> },
          {
            key: "transfer",
            header: PAYMENT_TARGET_COLUMN_LABELS.transfer,
            priority: "p3",
            collapseBelow: 1024,
            align: "right",
            cell: (row) => <Num value={row.payableKrw ?? null} />,
          },
        ] satisfies TableColumn<PaymentTargetScreenRow>[])
      : []),
    { key: "diffReason", header: PAYMENT_TARGET_COLUMN_LABELS.diffReason, priority: "p3", collapseBelow: 1024, cell: () => "—" },
  ];

  const filters = (
    <>
      <StatusFilter value={PAYMENT_TARGET_VIEW} views={props.views} selects={props.selects} />
      <p aria-live="polite" className={styles.batchResult}>
        {result ? (
          <>
            <span className={styles.batchDone}>{`${result.time} 지급 완료 ${result.processed}건`}</span>
            {result.blocked > 0 ? (
              <>
                {" · "}
                <span className={styles.batchBlocked}>{`막힘 ${result.blocked}건`}</span>
              </>
            ) : null}
          </>
        ) : null}
      </p>
    </>
  );

  if (!props.hasAny && rows.length === 0) {
    return (
      <ListScreen title="지출결의" filters={filters} empty={<ListEmpty message="지급할 건이 없습니다" action={{ label: "지급 완료 보기", href: props.paidHref }} />}>
        {null}
      </ListScreen>
    );
  }

  if (rows.length === 0) {
    return (
      <ListScreen title="지출결의" filters={filters}>
        <ListEmpty message="조건에 맞는 건이 없습니다" action={{ label: "필터 지우기", href: href({ status: PAYMENT_TARGET_VIEW }) }} />
      </ListScreen>
    );
  }

  const lineCount = new Set(snapshot.rows.flatMap((row) => (row.quoteLineId ? [row.quoteLineId] : []))).size;
  const prepaidCount = snapshot.rows.filter((row) => row.prepaid === true).length;

  return (
    <ListScreen
      title="지출결의"
      filters={filters}
      primaryAction={
        wide
          ? {
              label: chosen.length === 0 ? "지급 완료" : `지급 완료 ${chosen.length}`,
              onClick: openDialog,
              shortcut: "Ctrl+Enter",
              // 금액을 못 보는 지급 권한자는 모든 행이 막힌다 — 1차 이유는 고른 수가 아니라 그 권한(문서 화면 1차와 같은 글자).
              ...(!amountColumn ? { disabledReason: AMOUNT_HIDDEN } : chosen.length === 0 ? { disabledReason: "고른 건 없음", reasonTone: "info" as const } : {}),
              pending: isExecuting,
            }
          : undefined
      }
      summary={
        props.total ? (
          <section aria-label="합계" className={styles.totals}>
            <p className={styles.totalsTitle}>{`합계 (${PAYMENT_TARGET_VIEW} · ${props.total.count}건)`}</p>
            <p className={styles.totalsAmount}>
              {"지급 총액 "}
              <Num value={props.total.sumKrw} />
            </p>
          </section>
        ) : undefined
      }
      pagination={
        <Pagination
          label="지급 대상"
          page={props.page.page}
          pageCount={props.page.pageCount}
          href={(target) => href(props.query, target)}
          rangeText={pageRangeText({ page: props.page.page, pageSize: props.page.pageSize, total: props.page.total, unit: "건" })}
        />
      }
    >
      <Table
        caption="지급 대상"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        groupBy={(row) => row.group}
        groupHeader={(row) => (row.groupTone === "warning" ? <span className={styles.warningGroup}>{row.group}</span> : row.group)}
        phoneRowLink
        enableGridKeyboard={wide}
        {...(wide
          ? {
              hint: [
                { label: "이동", keys: "Tab ↑↓←→" },
                { label: "고르기", keys: "Space" },
                { label: "취소", keys: "Esc" },
              ],
              selection: {
                selectedIds: chosen,
                selectable,
                onChange: setSelectedIds,
                rowLabel: (row: PaymentTargetScreenRow) => row.title ?? row.number ?? row.id,
                blockedReason: (row: PaymentTargetScreenRow) => {
                  const after = blocked.get(row.id);
                  if (!after) return null;
                  const gateReason = selectable(row);
                  // 선택 칸 이유와 같은 글자면 한 번만(같은 말을 두 자리에 쓰지 않는다).
                  return gateReason !== true && gateReason.reason === after.reason ? null : after.reason;
                },
                onPrimary: openDialog,
              },
            }
          : {})}
      />
      <BatchPaymentDialog
        open={dialogOpen}
        onClose={() => {
          if (!isExecuting) setDialogOpen(false);
        }}
        count={snapshot.rows.length}
        lineCount={lineCount}
        prepaidCount={prepaidCount}
        prepaidDueDays={props.prepaidDueDays}
        today={props.today}
        pending={isExecuting}
        rejection={rejection}
        dateError={props.dateError}
        onConfirm={confirm}
      />
    </ListScreen>
  );
}

// 「Error — 목록 로드」 — 지급 대상을 읽지 못함: 표 자리 한 줄 + 2차 `다시 시도`(같은 화면 다시 받기).
export function PaymentTargetsLoadError() {
  const router = useRouter();
  return (
    <DetailScreen title="지출결의">
      <ListEmpty message="지급 대상 불러오지 못함" action={{ label: "다시 시도", onClick: () => router.refresh() }} tone="error" />
    </DetailScreen>
  );
}
