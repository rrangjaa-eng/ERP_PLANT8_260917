"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { Table, reconcileSelection } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
import { useEditableWidth } from "@/ui/table/use-editable-width";
import { Num } from "@/ui/num/Num";
import { Button } from "@/ui/button/Button";
import { useCommaInput } from "@/ui/input/use-comma-input";
import { Pagination } from "@/ui/pagination/Pagination";
import { pageRangeText } from "@/ui/pagination/page-window";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import type { StatusWord } from "@/ui/status-tag/status-map";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import type { PaymentTargetRowDto } from "@/domain/expenses/dto";
import type { BatchPaymentResult } from "@/domain/payments/batch";
import type { SelectedTransferSum } from "@/domain/payments/targets";
import { AMOUNT_HIDDEN, DIFF_REASON_REQUIRED, TRANSFER_NOT_NUMBER, TRANSFER_NOT_POSITIVE } from "@/domain/payments/action-row";
import { formatKrw } from "@/lib/format-number";
import { completePaymentsBatchAction, sumSelectedTransfersAction } from "./actions";
import { editReason, editTransfer, nextSumSeq, sumKeyOf, sumRequestRows, transferNumber, type SelectionState } from "./payment-selection";
import { BatchPaymentDialog } from "./batch-payment-dialog";
import { StatusFilter, type FilterSelect } from "./status-filter";
import { PAYMENT_TARGET_COLUMN_LABELS, PAYMENT_TARGET_VIEW } from "./list-columns";
import styles from "./expenses.module.css";

// 06-15(UI-SPEC S1 · S2): 「지급 대상」 보기 — 05 ListScreen 틀 그대로(제목 `지출결의`, 부제 없음). 선택 열은 06-29 `Table.selection`,
// 1차 `지급 완료 N`은 06-29 `ListScreen.primaryAction` 버튼 갈래 — 둘 다 ≥1024에서만(DR-36, 그 미만은 보기 전용 · 폰은 행 → 문서 화면).
// 행을 고를 수 있는지 · 이유는 서버 행 값(selectable · reason)을 그대로 쓴다 — 클라이언트는 판정하지 않는다. 처리 응답 뒤 처리된 행은 빠지고
// 막힌 행은 자리를 지키며 행 아래 이유 한 줄(위험 색)이 서고, 선택은 응답이 다시 판정한 selectable로 06-29 reconcileSelection이 다시 세운다(H-3).
// 결과 글자는 처음부터 DOM에 있는 빈 aria-live 영역에 쓴다(필터 다음 자리 — 1차와 떨어짐, M-2). 토스트 없음(C12).
// 06-17: P4 행의 이체액 · 차이 사유 편집(04.6 편집 표 칸 — 기본값 = 지급 총액, 고치면 그 행이 저절로 골라짐), 고른 건 이체액 합 · 행별 차이는
// 서버 액션(sumSelectedTransfersAction) 응답 — 합계 번호(고른 id 집합 · 고른 행 이체액이 바뀔 때만 +1)로 낡은 응답을 버린다(O-18 — 화면은 금액을
// 셈하지 않고 건수만 센다). 계좌 칸 · 「지급 완료」 보기는 06-20.

export type PaymentTargetScreenRow = Partial<PaymentTargetRowDto> & { id: string; group: string; groupTone?: "warning" };

type Blocked = { reason: string; selectable: boolean; selectableReason: string | null; newPayableKrw: number | null; row: PaymentTargetScreenRow; index: number };

type ResultLine = { time: string; processed: number; blocked: number };

const NO_RESPONSE = "결과를 받지 못함 · 새로 고침";

// 합 요청 모음(계획 판단 — reversible): 고른 행 · 이체액이 바뀐 뒤 이만큼 모아 마지막 합계 번호 하나만 보낸다.
const SUM_DEBOUNCE_MS = 300;

const EMPTY_SELECTION: SelectionState = { selectedIds: [], edits: {} };

// 차이는 부호를 붙인다(`-3,300` · `+1,200` — 금액 표시 절 「차이」, S5 SignedNum과 같은 꼴). 값은 서버 diffKrw.
function SignedNum({ value }: { value: number }) {
  return <Num value={value > 0 ? `+${formatKrw(value)}` : formatKrw(value)} />;
}

// 이체액 편집 칸 — 05 쉼표 입력 훅(숫자 · 쉼표만 들어간다). Enter · 칸을 떠나면 확정, Esc는 표가 되돌린다(§7-3).
function TransferEditCell({ initial, onCommit }: { initial: string; onCommit: (value: string) => void }) {
  const { inputRef, value, onChange, rawValue } = useCommaInput("krw", initial);
  return (
    <input
      ref={inputRef}
      aria-label="이체액"
      type="text"
      inputMode="numeric"
      autoComplete="off"
      autoFocus
      className={styles.cellInputNumeric}
      value={value}
      onChange={onChange}
      onBlur={() => onCommit(rawValue)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onCommit(rawValue);
        }
      }}
    />
  );
}

function ReasonEditCell({ initial, onCommit }: { initial: string; onCommit: (value: string) => void }) {
  return (
    <input
      aria-label="차이 사유"
      type="text"
      autoComplete="off"
      autoFocus
      maxLength={480}
      className={styles.cellInput}
      defaultValue={initial}
      onBlur={(event) => onCommit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onCommit(event.currentTarget.value);
        }
      }}
    />
  );
}

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
  const [selection, setSelection] = useState<SelectionState>(EMPTY_SELECTION);
  const [processed, setProcessed] = useState<ReadonlySet<string>>(new Set());
  const [blocked, setBlocked] = useState<ReadonlyMap<string, Blocked>>(new Map());
  const [result, setResult] = useState<ResultLine | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<{ ids: string[]; rows: PaymentTargetScreenRow[]; edits: SelectionState["edits"]; seq: number }>({ ids: [], rows: [], edits: {}, seq: 0 });
  // 칸 오류는 1차를 누른 뒤에 세운다(사유 칸 — S5와 같은 결). 값이 바뀌면 표가 첫 오류 칸으로 포커스한다.
  const [showErrors, setShowErrors] = useState(false);
  const [issueSignal, setIssueSignal] = useState(0);
  // 합의 세율 기준일 — 마지막으로 처리 요청에 쓴 지급일(없으면 오늘, 서버가 채운다).
  const [sumPayDate, setSumPayDate] = useState<string | null>(null);

  const rows = mergeRows(props.rows, processed, blocked);
  const selectable = selectableWith(blocked);
  const chosen = reconcileSelection(selection.selectedIds, rows, (row) => row.id, selectable);
  const chosenRows = rows.filter((row) => chosen.includes(row.id));
  const effective: SelectionState = { selectedIds: chosen, edits: selection.edits };

  // 합계 번호 — 고른 id 집합 · 고른 행 이체액(· 합 기준일)이 바뀔 때만 1 는다. 렌더에서 파생(effect 없음).
  const [sumTicket, setSumTicket] = useState(() => ({ seq: 0, key: sumKeyOf(EMPTY_SELECTION) }));
  const ticket = nextSumSeq(sumTicket, sumKeyOf(effective, sumPayDate ?? ""));
  if (ticket !== sumTicket) setSumTicket(ticket);
  const seq = ticket.seq;
  const [sum, setSum] = useState<SelectedTransferSum | null>(null);
  const [sumFailedSeq, setSumFailedSeq] = useState<number | null>(null);
  const seqRef = useRef(seq);
  const pendingSumRef = useRef<{ timer: ReturnType<typeof setTimeout>; send: () => void } | null>(null);
  useEffect(() => {
    seqRef.current = seq;
  });

  function requestSum(forSeq: number, requestRows: { id: string; transferKrw?: number }[], payDate: string | null) {
    setSumFailedSeq(null);
    sumSelectedTransfersAction({ seq: forSeq, rows: requestRows, ...(payDate ? { payDate } : {}) }).then(
      (result) => {
        // 응답 번호가 지금 합계 번호가 아니면 버린다(늦게 온 옛 합).
        if (forSeq !== seqRef.current) return;
        if (result?.data && result.data.seq === forSeq) setSum(result.data);
        else setSumFailedSeq(forSeq);
      },
      () => {
        if (forSeq === seqRef.current) setSumFailedSeq(forSeq);
      },
    );
  }

  useEffect(() => {
    const requestRows = sumRequestRows(effective);
    if (seq === 0 || requestRows.length === 0) return;
    const payDate = sumPayDate;
    const send = () => {
      pendingSumRef.current = null;
      requestSum(seq, requestRows, payDate);
    };
    const timer = setTimeout(send, SUM_DEBOUNCE_MS);
    pendingSumRef.current = { timer, send };
    return () => {
      clearTimeout(timer);
      if (pendingSumRef.current?.timer === timer) pendingSumRef.current = null;
    };
    // 합계 번호가 오를 때만 보낸다 — 그 번호의 입력은 이 렌더의 선택 · 편집이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);

  // 모아 둔 요청을 바로 보낸다(모달을 여는 순간).
  function flushSum() {
    const pending = pendingSumRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.send();
  }

  function retrySum() {
    requestSum(seq, sumRequestRows(effective), sumPayDate);
  }

  const sumNow = sum !== null && sum.seq === seq ? sum : null;

  // 「Error — 이체액 칸」 — 고친 칸 글자가 양의 정수가 아니면(칸이 숫자 · 쉼표만 받으므로 빈 값 · 0).
  function transferIssue(row: PaymentTargetScreenRow): string | null {
    const edit = selection.edits[row.id];
    if (!edit) return null;
    const value = transferNumber(edit.transfer);
    if (value === null) return TRANSFER_NOT_NUMBER;
    if (value <= 0) return TRANSFER_NOT_POSITIVE;
    return null;
  }

  // 이체액이 서버 지급 총액과 다르면 차이 사유 칸이 서고 필수다(같음 비교 — 차이 값은 서버가 셈한다, S5 diffReasonNeeded 선례).
  function reasonNeeded(row: PaymentTargetScreenRow): boolean {
    const edit = selection.edits[row.id];
    const value = edit ? transferNumber(edit.transfer) : null;
    return value !== null && value > 0 && typeof row.payableKrw === "number" && value !== row.payableKrw;
  }

  function reasonIssue(row: PaymentTargetScreenRow): string | null {
    return reasonNeeded(row) && (selection.edits[row.id]?.reason ?? "").trim() === "" ? DIFF_REASON_REQUIRED : null;
  }

  function editable(row: PaymentTargetScreenRow): boolean {
    return wide && selectable(row) === true;
  }

  function commitCell(rowId: string, columnKey: string, value: string) {
    const row = rows.find((candidate) => candidate.id === rowId);
    if (!row) return;
    if (columnKey === "transfer") {
      const shown = selection.edits[rowId]?.transfer ?? (typeof row.payableKrw === "number" ? String(row.payableKrw) : "");
      if (value === shown) return;
      let next = editTransfer(selection, { id: rowId, transfer: value, selectable: selectable(row) === true });
      // 되돌려 지급 총액과 같아지면 적은 사유는 버린다(D-605).
      if (transferNumber(value) === row.payableKrw) next = editReason(next, { id: rowId, reason: "" });
      setSelection(next);
    }
    if (columnKey === "diffReason") setSelection(editReason(selection, { id: rowId, reason: value }));
  }

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
    setSelection({
      selectedIds: reconcileSelection(snapshot.ids.filter((id) => !nextProcessed.has(id)), nextRows, (row) => row.id, selectableWith(nextBlocked)),
      edits: selection.edits,
    });
    setResult({ time: data.time, processed: data.processed, blocked: data.blocked.length });
    setDialogOpen(false);
    router.refresh();
  }

  function openDialog() {
    if (chosen.length === 0 || isExecuting) return;
    // 고른 행에 오류 칸이 있으면 모달 없이 첫 오류 칸으로(04 DR-5와 같은 결).
    if (chosenRows.some((row) => transferIssue(row) !== null || reasonIssue(row) !== null)) {
      setShowErrors(true);
      setIssueSignal((value) => value + 1);
      return;
    }
    flushSum();
    setSnapshot({ ids: chosen, rows: chosenRows, edits: selection.edits, seq });
    setRejection(null);
    setDialogOpen(true);
  }

  // 스냅숏 한 행 — 고친 이체액(양의 정수)과, 지급 총액과 다르면 그 사유.
  function transferPart(row: PaymentTargetScreenRow): { transferKrw?: number; diffReason?: string } {
    const edit = snapshot.edits[row.id];
    const value = edit ? transferNumber(edit.transfer) : null;
    if (value === null || value <= 0) return {};
    return value === row.payableKrw ? { transferKrw: value } : { transferKrw: value, diffReason: (edit?.reason ?? "").trim() };
  }

  function confirm(payDate: string) {
    if (isExecuting) return;
    const sent = snapshot.rows.flatMap((row) =>
      typeof row.version === "number" && typeof row.payableKrw === "number"
        ? [{ expenseId: row.id, expenseVersion: row.version, expectedPayableKrw: row.payableKrw, ...transferPart(row) }]
        : [],
    );
    if (sent.length === 0) return;
    // 이유 줄 · 결과 글자는 다음 시도 때 지운다(04 DR-16 수명).
    setBlocked(new Map());
    setResult(null);
    setRejection(null);
    setSumPayDate(payDate);
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
            editability: (row) => (editable(row) ? "edit" : "readonly"),
            editCell: (row, ctx) => (
              <TransferEditCell
                initial={selection.edits[row.id]?.transfer ?? (typeof row.payableKrw === "number" ? String(row.payableKrw) : "")}
                onCommit={ctx.onCommit}
              />
            ),
            cell: (row) => {
              const edit = selection.edits[row.id];
              const value = edit ? transferNumber(edit.transfer) : (row.payableKrw ?? null);
              return (
                <span data-testid="payment-transfer-cell">
                  <Num value={edit && value === null ? edit.transfer || "—" : value} />
                </span>
              );
            },
            // 셀 2행 `차이 {±}` — 서버 합 응답의 행별 차이(0이면 없음). 요청 중에는 이전 값을 흐리게.
            secondaryLine: (row) => {
              const diff = chosen.includes(row.id) && sum ? sum.diffs[row.id] : undefined;
              if (diff === undefined || diff === 0) return null;
              return (
                <span className={[styles.diffLine, sumNow ? "" : styles.stale].join(" ")}>
                  {"차이 "}
                  <SignedNum value={diff} />
                </span>
              );
            },
          },
        ] satisfies TableColumn<PaymentTargetScreenRow>[])
      : []),
    {
      key: "diffReason",
      header: PAYMENT_TARGET_COLUMN_LABELS.diffReason,
      priority: "p3",
      collapseBelow: 1024,
      editability: (row) => (editable(row) && reasonNeeded(row) ? "edit" : "readonly"),
      editCell: (row, ctx) => <ReasonEditCell initial={selection.edits[row.id]?.reason ?? ""} onCommit={ctx.onCommit} />,
      cell: (row) => {
        if (!reasonNeeded(row)) return "—";
        const reason = selection.edits[row.id]?.reason ?? "";
        return (
          <span className={styles.reasonCell} title={reason || undefined} data-testid="payment-diff-reason-cell">
            {reason}
          </span>
        );
      },
    },
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
            {chosen.length > 0 ? (
              <p className={styles.selectedSum}>
                {sumFailedSeq === seq ? (
                  <>
                    <span className={styles.selectedSumLabel}>{`고른 ${chosen.length}건 · 합계를 받지 못함 · `}</span>
                    <Button variant="secondary" onClick={retrySum}>
                      다시 시도
                    </Button>
                  </>
                ) : (
                  <>
                    <span className={styles.selectedSumLabel}>{`고른 ${chosen.length}건 · 이체액`}</span>{" "}
                    <span className={[styles.selectedSumAmount, sumNow ? "" : styles.stale].join(" ")}>{sum ? <Num value={sum.totalKrw} /> : "…"}</span>
                  </>
                )}
              </p>
            ) : null}
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
        onCellCommit={commitCell}
        cellIssue={(row, columnKey) => {
          const message = columnKey === "transfer" ? transferIssue(row) : columnKey === "diffReason" && showErrors && chosen.includes(row.id) ? reasonIssue(row) : null;
          return message ? { kind: "error", message } : undefined;
        }}
        firstIssueSignal={issueSignal}
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
                onChange: (ids: string[]) => setSelection({ ...selection, selectedIds: ids }),
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
        // 모달을 연 순간 합계 번호의 서버 합만(아직이면 undefined — 부제 `…` · 1차 막힘). 실패면 「거부 — 이체액 합계 응답 없음」.
        totalKrw={sum !== null && sum.seq === snapshot.seq ? sum.totalKrw : undefined}
        sumFailed={sumFailedSeq === snapshot.seq}
        onRetrySum={retrySum}
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
