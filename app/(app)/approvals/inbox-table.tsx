"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { Num } from "@/ui/num/Num";
import { splitRefreshTail } from "@/ui/confirm-dialog/ConfirmDialog";
import { Table } from "@/ui/table/Table";
import { formatKrw } from "@/lib/format-number";
import type { TableColumn } from "@/ui/table/types";
import { Button } from "@/ui/button/Button";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import type { StatusWord } from "@/ui/status-tag/status-map";
import { Toast, type ToastTone } from "@/ui/toast/Toast";
import { approveAction, approveBatchAction, rejectBatchAction } from "./actions";
import { approveToast } from "./approve-toast";
import { APPROVE_FAILED_MESSAGE, APPROVE_UNKNOWN_MESSAGE, ApprovalSheet, type ApprovalSheetItem, type ApproveOutcome } from "./approval-sheet";
import { ConflictLine } from "./conflict-line";
import { evidenceViewUrl } from "./evidence-url";
import { INBOX_COLUMN_LABELS } from "./list-columns";
import { rowApprovalActions } from "./row-actions";
import { useRefreshThenFocus } from "./refresh-then-focus";
import { BatchApproveDialog, BatchRejectDialog, RejectDialog, WithdrawDialog, type DecisionTarget, type RejectMessages } from "./decision-dialogs";
import leaveStyles from "@/app/(app)/leave/leave.module.css";
import styles from "./inbox-table.module.css";

// 04.1-02 S4 · 04.1-05(S4 · S5 · T4 · ENG-16) — 그룹 `내 결재`(비면 머리글째 없음) · `처리함`. `내 결재` 행의 상태
// 칸은 비우고(그룹 머리글이 말한다), PC 행동 칸에 3차 `승인` — 확인 없이 즉시(사용자 결정 #3). `내 결재` 행 = 문서 칸 button
// (aria-haspopup="dialog")이 행 전체를 덮어 → 결재 시트: PC(≥700)는 오른쪽 480 패널, 폰(<700)은 전체 폭 행 → 아래 시트(DR4 A —
// 같은 `SidePanel` 하나의 폭별 모양이라 JS 폭 판정이 없다). `처리함` 행 = 문서 링크 → 문서 화면(처리함에는 상세를 미리 읽지
// 않는다). 갈래는 서버가 넘긴 그룹 값으로 정하고 상태 글자를 보지 않는다.
export type InboxRow = {
  id: string;
  group: "mine" | "processed";
  instanceId: string | null;
  version: number | null;
  href: string | null;
  document: string;
  drafter: string;
  // 05-01(Round 4 D8): 숫자 칸 — 종류 요약 measure를 서버가 그린 노드(금액 `Num` · 일수 글자 · 숫자 없는 종류 `—` · 투영에서 빠지면 빈 칸).
  measure: ReactNode;
  status: StatusWord | null;
  // `잔여 초과 N일`(해당할 때만) — PC는 문서 칸 2행, 폰은 접힌 줄 끝(UI-SPEC S4). 막힘이 아니라 경고다.
  overdraw: string | null;
  // 서버 가능 행동(구조 값 — 결재 정보 노출과 무관, 사용자 결정 2026-09-29 A). 처리함은 빈 목록.
  actions: ApprovalSheetItem["actions"];
  // 05-10 D4: 종류가 준 `승인` 막힘 이유(서버 원문) — 있으면 PC 행은 `승인` 대신 이유 글자 + `반려`.
  approveBlockedReason: string | null;
  // `내 결재` 항목의 결재 시트 재료(서버 가능 행동 · 상세 · 결재선) — 처리함은 null. 결재 정보가 꺼진 계급은 상세가
  // 없어 null이다 — 그 행은 폰에서도 문서 링크로 문서 화면에 간다(거기 행동 줄이 있다).
  sheet: ApprovalSheetItem | null;
  // 반려 · 회수 확인 재료 — 처리함은 null.
  decision: DecisionTarget | null;
  // 07.2-16(S13): 일괄로 고를 수 없는 종류면 이유 글자(서버 판정 — 정산 결재), 고를 수 있으면 null.
  batchBlock: string | null;
  // 막대 요약 조각 — 지출결의 원화 금액 · 연차 일수(쿼터). 해당 종류가 아니거나 투영에서 빠지면 null.
  amountKrw: number | null;
  leaveQuarters: number | null;
  // 사후 추인(PU7) — 문서 칸 2행(잔여 초과 줄과 같은 자리), 폰은 접힌 줄 끝.
  postHoc: boolean;
};

// 일괄 상한(D-7272) — 서버 APPROVAL_BATCH_LIMIT와 같은 값(액션 zod · 도메인이 다시 막는다).
const BATCH_LIMIT = 100;
const BATCH_LIMIT_REASON = `${BATCH_LIMIT}건까지`;

type BatchVerb = "승인" | "반려";
// 처리 결과 — 처리된 행은 사라지고 막힌 행은 자리를 지킨다(새로 고침 뒤 내 결재에서 빠진 행도 이유와 함께 남긴다).
// processed는 인스턴스 id → 처리할 때 보낸 version — 숨김은 그 version의 행에만 건다(기안자가 다시 올리면 같은 id · 새 version으로 돌아온다).
type BatchOutcome = { processed: ReadonlyMap<string, number>; blocked: ReadonlyMap<string, string>; kept: InboxRow[]; order: string[] };
type BatchResultLine = { time: string; verb: BatchVerb; processed: number; blocked: number };

// 새로 받은 행에서 처리된 `내 결재` 행을 빼고, 막혀서 남겨 둔 행을 원래 순서 자리에 다시 끼운다(새로 들어온 행은 뒤).
function mergeRows(rows: InboxRow[], outcome: BatchOutcome | null): InboxRow[] {
  if (!outcome) return rows;
  const present = rows.filter((row) => !(row.group === "mine" && row.instanceId !== null && outcome.processed.get(row.instanceId) === row.version));
  const presentIds = new Set(present.map((row) => row.id));
  const order = new Map(outcome.order.map((id, index) => [id, index]));
  const rank = (row: InboxRow, index: number) => order.get(row.id) ?? outcome.order.length + index;
  const mine = [...present.filter((row) => row.group === "mine"), ...outcome.kept.filter((row) => !presentIds.has(row.id))]
    .map((row, index) => ({ row, at: rank(row, index) }))
    .sort((a, b) => a.at - b.at)
    .map((entry) => entry.row);
  return [...mine, ...present.filter((row) => row.group !== "mine")];
}

// 막대 · 확인 창 요약 조각 — 해당할 때만(UI-SPEC S13 zero-one-many). 단위가 달라 금액과 일수를 합치지 않는다(Open questions 14).
function batchSummary(chosen: InboxRow[]): { amountKrw: number | null; days: string | null; overdraw: number } {
  const amounts = chosen.filter((row) => row.amountKrw !== null);
  const quarters = chosen.reduce((total, row) => total + (row.leaveQuarters ?? 0), 0);
  return {
    amountKrw: amounts.length > 0 ? amounts.reduce((total, row) => total + (row.amountKrw ?? 0), 0) : null,
    // 쿼터 → 일수(domain/leave/days.ts formatLeaveDays와 같은 식 — 4로 나눈 값은 0.25 단위로 정확하다).
    days: quarters > 0 ? `연차 ${quarters / 4}일` : null,
    overdraw: chosen.filter((row) => row.overdraw !== null).length,
  };
}

const GROUP_HEADERS: Record<InboxRow["group"], string> = { mine: "내 결재", processed: "처리함" };

function documentCellId(row: { id: string }): string {
  return `inbox-doc-${row.id.replace(/[^a-zA-Z0-9-]/g, "-")}`;
}

// 결재 시트 `승인` — 서버 액션 호출 · 토스트 문구 · 서버 거부 → 충돌 문구 변환(05-01 E7). 입력 오류는 `승인 실패`, 통신 실패는 `결과 확인 안 됨` 한 줄(05 /review B3 · C9).
async function approveFromSheet(target: { instanceId: string; version: number }): Promise<ApproveOutcome> {
  try {
    const result = await approveAction({ instanceId: target.instanceId, expectedVersion: target.version });
    if (result?.data) return { message: approveToast(result.data) };
    return { conflict: result?.serverError ?? APPROVE_FAILED_MESSAGE };
  } catch {
    return { conflict: APPROVE_UNKNOWN_MESSAGE };
  }
}

export function InboxTable({
  rows: serverRows,
  rejectMessages,
  reasonOptions,
  measureHeader,
}: {
  rows: InboxRow[];
  rejectMessages: RejectMessages;
  // 07.2-07 X3: 반려 사유 코드표의 활성 항목 label(서버 page가 읽어 내린다).
  reasonOptions: string[];
  // 05-01 E5: 숫자 열 머리글(서버 listMyInbox) — null이면 숫자 열을 통째로 그리지 않는다.
  measureHeader: string | null;
}) {
  // 07.2-16(S13): 일괄 — 고른 행 id · 마지막 처리 결과(막힌 행 유지) · 결과 글자 · 열린 확인 창.
  const [outcome, setOutcome] = useState<BatchOutcome | null>(null);
  const rows = mergeRows(serverRows, outcome);
  const [chosenIds, setChosenIds] = useState<string[]>([]);
  const [batchResult, setBatchResult] = useState<BatchResultLine | null>(null);
  const [batchDialog, setBatchDialog] = useState<BatchVerb | null>(null);
  const [batchPending, setBatchPending] = useState(false);
  const [batchFailure, setBatchFailure] = useState<string | null>(null);
  const [batchServerError, setBatchServerError] = useState<string | null>(null);
  const batchSubmittingRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  // 행 승인이 동시 처리로 거부되면 그 행 행동 칸에 한 줄 + 3차 `새로 고침`(토스트가 아니다 — 누른 자리 옆).
  const [rowConflict, setRowConflict] = useState<{ rowId: string; message: string } | null>(null);
  // 행 제출 중 — 동기로 바뀌어 두 번째 누름을 무시한다(T7).
  const submittingRef = useRef(false);
  const pendingIdRef = useRef<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [sheetItem, setSheetItem] = useState<ApprovalSheetItem | null>(null);
  const [rejectTarget, setRejectTarget] = useState<DecisionTarget | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<DecisionTarget | null>(null);
  const showToast = (message: string) => setToast({ message, tone: "default" });
  const refreshThenFocus = useRefreshThenFocus();
  // 승인한 줄이 사라진 뒤 포커스는 다음 줄의 열기(문서 칸 버튼 · 링크)로 — `승인`으로 가면 Enter 한 번 더로 다음 문서가 승인된다.
  // PC 행 `승인`과 결재 시트 `승인`(폰 — 05-11 웨이브 13 D3)이 같은 길을 쓴다.
  function refreshThenFocusNext(approvedIndex: number) {
    const next = approvedIndex < 0 ? undefined : rows[approvedIndex + 1];
    const nextId = next ? documentCellId(next) : null;
    refreshThenFocus(() => (nextId ? (document.getElementById(nextId)?.querySelector<HTMLElement>("button, a") ?? null) : null));
  }
  const { execute } = useAction(approveAction, {
    onSuccess: ({ data }) => {
      if (!data) return;
      setToast({ message: approveToast(data), tone: "default" });
      refreshThenFocusNext(rows.findIndex((row) => row.id === pendingIdRef.current));
    },
    onError: ({ error }) => {
      if (error.serverError && pendingIdRef.current) setRowConflict({ rowId: pendingIdRef.current, message: error.serverError });
    },
    onSettled: () => {
      submittingRef.current = false;
      pendingIdRef.current = null;
      setPendingId(null);
    },
  });

  const mineRows = rows.filter((row) => row.group === "mine");
  const rowById = new Map(rows.map((row) => [row.id, row]));
  // 지금 고를 수 있는 행 중 고른 것만 — 새로 고침으로 사라졌거나 고를 수 없게 된 행은 상한 · 표 선택 · 막대 모두에서 빠진다(Codex P2).
  const chosen = chosenIds.map((id) => rowById.get(id)).filter((row): row is InboxRow => row !== undefined && !selectHidden(row) && !row.batchBlock);
  const liveChosenIds = chosen.map((row) => row.id);
  const summary = batchSummary(chosen);
  // 일괄 반려는 단건 반려가 열린 행만(본인 기안 등 반려가 없는 행은 고른 채 승인에만 남는다 · #377 리뷰 L1).
  const rejectable = chosen.filter((row) => row.actions.includes("reject"));
  function subtitleOf(target: InboxRow[]): string {
    const { amountKrw, days } = batchSummary(target);
    return [`${target.length}건`, amountKrw !== null ? `지출결의 ${formatKrw(amountKrw)}` : null, days].filter((piece): piece is string => piece !== null).join(" · ");
  }

  // 고를 수 있음 — 처리함 행은 칸을 비운다(hidden). 정산 결재는 서버 이유, 승인할 수 없는 행(종류 막힘 이유는 행동 칸이 이미 말한다)은 칸을 비운다.
  function selectable(row: InboxRow): true | { reason: string } {
    // 칸을 비운 행은 고를 수 없다(머리글 「이 쪽 전체 고르기」가 세지 않게) — 이유 글자는 그리지 않는다(ui/table hidden).
    if (selectHidden(row)) return { reason: "" };
    if (row.batchBlock) return { reason: row.batchBlock };
    if (liveChosenIds.length >= BATCH_LIMIT && !liveChosenIds.includes(row.id)) return { reason: BATCH_LIMIT_REASON };
    return true;
  }
  function selectHidden(row: InboxRow): boolean {
    return row.group !== "mine" || row.instanceId === null || row.version === null || (!row.batchBlock && (!row.actions.includes("approve") || row.approveBlockedReason !== null));
  }

  function openBatch(verb: BatchVerb) {
    if ((verb === "승인" ? chosen : rejectable).length === 0) return;
    setBatchFailure(null);
    setBatchServerError(null);
    setBatchDialog(verb);
  }

  function closeBatch() {
    if (batchSubmittingRef.current) return;
    setBatchDialog(null);
    setBatchFailure(null);
    setBatchServerError(null);
  }

  // 창이 닫힌 뒤(ConfirmDialog가 트리거로 포커스를 돌린 다음 차례) — 첫 막힌 행 체크박스, 없으면 필터 줄 1차(SYSTEM.md 결과 포커스 규칙).
  // 확인 창이 닫히며 연 요소(1차)로 포커스를 돌리고 새로 고침이 행을 다시 그리므로, 새로 고침이 끝난 뒤에 옮긴다 — 첫 막힌 행의 체크박스, 막힘이 없으면 필터 줄 1차.
  function batchFocusTarget(blockedRowId: string | null): HTMLElement | null {
    const root = rootRef.current;
    if (!root) return null;
    const blockedCell = blockedRowId ? document.getElementById(documentCellId({ id: blockedRowId })) : null;
    if (blockedCell) return blockedCell.closest("tr")?.querySelector<HTMLElement>('input[type="checkbox"]') ?? null;
    return [...root.querySelectorAll<HTMLElement>('[data-ui="primary-button"]')].find((candidate) => !candidate.closest("dialog")) ?? null;
  }

  async function runBatch(verb: BatchVerb, reason?: string) {
    const targets = verb === "승인" ? chosen : rejectable;
    if (batchSubmittingRef.current || targets.length === 0) return;
    batchSubmittingRef.current = true;
    setBatchPending(true);
    setBatchFailure(null);
    const sent = targets.filter((row) => row.instanceId !== null && row.version !== null);
    const items = sent.map((row) => ({ instanceId: row.instanceId ?? "", expectedVersion: row.version ?? 0 }));
    const failure = verb === "승인" ? "일괄 승인 실패 · 다시 시도" : "일괄 반려 실패 · 다시 시도";
    try {
      const response = verb === "승인" ? await approveBatchAction({ items }) : await rejectBatchAction({ items, reason: reason ?? "" });
      const data = response?.data;
      if (!data) {
        // 반려 사유를 서버가 거부하면 그 글자를 1차 막힘 자리에, 그 밖의 거부 · 응답 없음은 전체 실패 한 줄.
        if (verb === "반려" && response?.serverError) setBatchServerError(response.serverError);
        else setBatchFailure(failure);
        return;
      }
      const blocked = new Map(data.blocked.map((row) => [row.id, row.reason]));
      const keptRows = rows.filter((row) => row.instanceId !== null && blocked.has(row.instanceId));
      const processedIds = new Set(data.processedIds);
      const processed = new Map(items.filter((item) => processedIds.has(item.instanceId)).map((item) => [item.instanceId, item.expectedVersion]));
      setOutcome({ processed, blocked, kept: keptRows, order: rows.map((row) => row.id) });
      const sentIds = new Set(sent.map((row) => row.id));
      setChosenIds((ids) => ids.filter((id) => !sentIds.has(id)));
      setBatchResult({ time: data.time, verb, processed: data.processedIds.length, blocked: data.blocked.length });
      batchSubmittingRef.current = false;
      setBatchDialog(null);
      const blockedRowId = keptRows[0]?.id ?? null;
      refreshThenFocus(() => batchFocusTarget(blockedRowId));
    } catch {
      setBatchFailure(failure);
    } finally {
      batchSubmittingRef.current = false;
      setBatchPending(false);
    }
  }

  const columns: TableColumn<InboxRow>[] = [
    {
      key: "document",
      header: INBOX_COLUMN_LABELS.document,
      priority: "p1",
      cell: (row) => (
        <span id={documentCellId(row)}>
          {row.sheet ? (
            <button
              type="button"
              className={styles.rowTap}
              data-row-link=""
              aria-haspopup="dialog"
              onClick={() => setSheetItem(row.sheet)}
            >
              {row.document}
            </button>
          ) : row.href ? (
            <Link href={row.href} className={[leaveStyles.link, styles.rowLink].join(" ")} data-row-link="">
              {row.document}
            </Link>
          ) : (
            <span>{row.document}</span>
          )}
          {row.overdraw ? <span className={styles.overdraw}>{row.overdraw}</span> : null}
          {row.postHoc ? (
            <span className={styles.overdraw}>
              <StatusTag status="사후 추인" variant="text" />
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "drafter",
      header: INBOX_COLUMN_LABELS.drafter,
      priority: "p2",
      cell: (row) => row.drafter,
      // 폰 접힌 줄(`기안자 · MM-DD`)도 행의 일부라 주 행과 같은 곳으로 간다(04.1-07 DOM 감사 ① · `/leave` 04.1-06 #6과 같은 방식).
      // 접힌 줄은 ui/table이 aria-hidden으로 그리므로 탭 순서에서 빼고(주 행 대상 하나만 초점) ::after로 그 줄을 덮는다.
      summary: (row) =>
        row.sheet ? (
          <button type="button" tabIndex={-1} className={styles.foldTap} onClick={() => setSheetItem(row.sheet)}>
            {row.drafter}
            {row.overdraw ? (
              <>
                {" · "}
                <span className={styles.overdrawInline}>{row.overdraw}</span>
              </>
            ) : null}
            {row.postHoc ? (
              <>
                {" · "}
                <StatusTag status="사후 추인" variant="text" />
              </>
            ) : null}
          </button>
        ) : row.href ? (
          <Link href={row.href} tabIndex={-1} className={styles.foldTap}>
            {row.drafter}
            {row.postHoc ? (
              <>
                {" · "}
                <StatusTag status="사후 추인" variant="text" />
              </>
            ) : null}
          </Link>
        ) : (
          row.drafter
        ),
    },
    ...(measureHeader
      ? [{ key: "days", header: measureHeader, priority: "p1", align: "right", cell: (row) => row.measure } satisfies TableColumn<InboxRow>]
      : []),
    {
      key: "status",
      header: INBOX_COLUMN_LABELS.status,
      priority: "p1",
      cell: (row) =>
        row.status ? <StatusTag status={row.status} variant="text" /> : null,
    },
    {
      key: "actions",
      header: INBOX_COLUMN_LABELS.actions,
      priority: "p3",
      cell: (row) => {
        if (row.group !== "mine" || !row.instanceId || row.version === null) return null;
        const instanceId = row.instanceId;
        const expectedVersion = row.version;
        const actions = row.actions;
        const decision = row.decision;
        const cell = rowApprovalActions({ approveBlockedReason: row.approveBlockedReason, canReject: actions.includes("reject") && decision !== null });
        // PC 행은 서버 가능 행동에서 승인 · 반려만 그린다 — 회수는 행에 두지 않는다(T6 · #3, 문서 화면 · 폰 시트에서만).
        return (
          <span className={styles.rowActions}>
            {actions.includes("approve") && cell.showApprove ? (
              <Button
                variant="tertiary"
                pending={pendingId === row.id}
                aria-describedby={documentCellId(row)}
                onClick={() => {
                  if (submittingRef.current) return;
                  submittingRef.current = true;
                  pendingIdRef.current = row.id;
                  setPendingId(row.id);
                  setRowConflict(null);
                  execute({ instanceId, expectedVersion });
                }}
              >
                승인
              </Button>
            ) : null}
            {actions.includes("approve") && cell.reasonText ? <span className={styles.blockedReason}>{cell.reasonText}</span> : null}
            {cell.showReject && decision ? (
              <Button
                variant="tertiary"
                disabled={pendingId === row.id}
                aria-describedby={documentCellId(row)}
                onClick={() => setRejectTarget(decision)}
              >
                반려
              </Button>
            ) : null}
            {rowConflict?.rowId === row.id ? <ConflictLine message={rowConflict.message} /> : null}
          </span>
        );
      },
    },
  ];

  const blockedOf = (row: InboxRow) => (row.instanceId !== null ? (outcome?.blocked.get(row.instanceId) ?? null) : null);

  return (
    <div ref={rootRef}>
    <ListScreen
      title="결재"
      // 결과 글자 — 필터 줄의 필터 자리(결재함은 필터 칸이 없어 첫 자리 · 1차와 떨어진 자리). 처음부터 DOM에 있는 aria-live 영역.
      filters={
        <p role="status" aria-live="polite" className={styles.batchResult}>
          {batchResult ? (
            <>
              <span className={styles.batchDone}>{`${batchResult.time} ${batchResult.verb} ${batchResult.processed}건`}</span>
              {batchResult.blocked > 0 ? (
                <>
                  {" · "}
                  <span className={styles.batchBlocked}>{`막힘 ${batchResult.blocked}건`}</span>
                </>
              ) : null}
            </>
          ) : null}
        </p>
      }
      // 1차 = 필터 줄 오른쪽 끝 버튼 갈래 — 늘 렌더(0건이면 aria-disabled + 이유), 폰(<700)은 숨김(DC-8 · D-7268).
      primaryAction={{
        label: chosen.length === 0 ? "승인" : `승인 ${chosen.length}`,
        onClick: () => openBatch("승인"),
        shortcut: "Ctrl+Enter",
        phoneHidden: true,
        ...(mineRows.length === 0
          ? { disabledReason: "결재할 건 없음", reasonTone: "info" as const }
          : chosen.length === 0
            ? { disabledReason: "고른 건 없음", reasonTone: "info" as const }
            : {}),
      }}
    >
      {/* 선택 막대 — 요약과 2차만(DC-8). DOM에서도 필터 줄 뒤 · 표 앞(보이는 순서 = 탭 순서). */}
      {chosen.length > 0 ? (
        <div className={styles.bulkBar}>
          <p className={styles.bulkSummary}>
            {[
              <span key="count">{`선택 ${chosen.length}건`}</span>,
              summary.amountKrw !== null ? (
                <span key="amount">
                  {"지출결의 "}
                  <Num value={summary.amountKrw} />
                </span>
              ) : null,
              summary.days ? <span key="days">{summary.days}</span> : null,
              summary.overdraw > 0 ? <span key="overdraw" className={styles.bulkWarning}>{`잔여 초과 ${summary.overdraw}건`}</span> : null,
            ]
              .filter((piece) => piece !== null)
              .map((piece, index) => (
                <span key={index} className={styles.bulkPiece}>
                  {index > 0 ? " · " : null}
                  {piece}
                </span>
              ))}
          </p>
          {rejectable.length > 0 ? (
            <Button variant="secondary" onClick={() => openBatch("반려")}>
              {`반려 ${rejectable.length}`}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className={styles.bulk}>
      <Table
        caption="결재함"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        groupBy={(row) => GROUP_HEADERS[row.group]}
        // `내 결재` 행이 없으면(처리함만) 선택 열째 없다 — 머리글 체크박스도 없다(디자인 r6 N-2).
        selection={mineRows.length === 0 ? undefined : {
          selectedIds: liveChosenIds,
          selectable,
          hidden: selectHidden,
          onChange: (ids) => setChosenIds(ids.slice(0, BATCH_LIMIT)),
          rowLabel: (row) => row.document,
          blockedReason: (row) => {
            const reason = blockedOf(row);
            return reason ? splitRefreshTail(reason).reason ?? reason : null;
          },
          blockedLink: (row) => {
            const reason = blockedOf(row);
            return reason && splitRefreshTail(reason).refresh ? { label: "새로 고침", href: "/approvals", newTab: false } : null;
          },
          onPrimary: () => openBatch("승인"),
        }}
      />
      </div>
    </ListScreen>
      <ApprovalSheet
        item={sheetItem}
        onClose={() => setSheetItem(null)}
        onApprove={approveFromSheet}
        onApproved={(message) => {
          showToast(message);
          refreshThenFocusNext(rows.findIndex((row) => row.sheet !== null && row.sheet.instanceId === sheetItem?.instanceId));
        }}
        evidenceUrl={evidenceViewUrl}
        onSecondary={(action, item) => {
          const row = rows.find((candidate) => candidate.sheet?.instanceId === item.instanceId);
          if (!row?.decision) return;
          if (action === "reject") setRejectTarget(row.decision);
          else setWithdrawTarget(row.decision);
        }}
      />
      <RejectDialog target={rejectTarget} messages={rejectMessages} reasonOptions={reasonOptions} onClose={() => setRejectTarget(null)} onDone={showToast} />
      <WithdrawDialog target={withdrawTarget} onClose={() => setWithdrawTarget(null)} onDone={showToast} />
      <BatchApproveDialog
        open={batchDialog === "승인"}
        count={chosen.length}
        subtitle={subtitleOf(chosen)}
        overdrawCount={summary.overdraw}
        pending={batchPending}
        failure={batchFailure}
        onClose={closeBatch}
        onConfirm={() => void runBatch("승인")}
      />
      <BatchRejectDialog
        open={batchDialog === "반려"}
        count={rejectable.length}
        subtitle={subtitleOf(rejectable)}
        pending={batchPending}
        failure={batchFailure}
        serverError={batchServerError}
        onReasonChange={() => setBatchServerError(null)}
        messages={rejectMessages}
        reasonOptions={reasonOptions}
        onClose={closeBatch}
        onConfirm={(reason) => void runBatch("반려", reason)}
      />
      {toast ? <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}
