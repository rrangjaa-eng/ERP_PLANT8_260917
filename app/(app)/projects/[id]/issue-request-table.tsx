"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { IssueRequestDto } from "@/domain/issue-requests";
import { Button } from "@/ui/button/Button";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { Table } from "@/ui/table/Table";
import type { CellIssue, TableColumn } from "@/ui/table/types";
import { formatKrw } from "@/lib/format-number";
import { kstToday } from "@/lib/kst-date";
import { AmountInput, NumberGroups } from "./revenue-section";
import { issueRequestStatusWord } from "./issue-request-word";
import styles from "./project-detail.module.css";

// 06-18(UI-SPEC S16, D-610): 상세 매출 섹션의 「발행 요청」 표 — 계약 금액 줄과 발행 줄 표 사이. 저장은 상세의 1차 `일괄 저장 Ctrl+S N` 하나다
// (이 표의 dirty도 N에 든다). 부가세 · 합계 · 발행액은 서버가 보낸 값만 그린다 — 화면이 금액을 셈하지 않는다.

export type IssueRequestDraft = {
  clientKey: string;
  id: string;
  version?: number;
  desiredIssueDate: string;
  amount: number;
  memo: string | null;
  status: "requested" | "issued" | "cancelled";
  dirty: boolean;
  /** 06-21(O-12) — 확인 모달로 취소한 저장된 줄. 상태 칸은 `취소`이고 `일괄 저장` 때 `cancel: true`로 간다(04 줄 삭제와 같은 흐름). */
  cancel?: true;
  /** 서버 값(저장 전 편집한 줄에는 낡은 값이라 2행을 그리지 않는다). */
  vatKrw?: number;
  totalKrw?: number;
  issuedEntryDate?: string | null;
  issuedAmountKrw?: number | null;
  /** 저장 거부 봉투에서 이 줄로 떼어 낸 칸 오류(열 키 → 이유). */
  cellErrors?: Record<string, string>;
};

export type IssueRequestsProps = {
  rows: IssueRequestDto[];
  /** 프로젝트 쓰기 + 수주중 · 진행 · 정산 — 서버가 계산한다. */
  canRequest: boolean;
  /** 매출 기록 권한(`projects.revenue` write) + 발행액 노출 — 서버가 계산한다. */
  canLink: boolean;
  /** 요청 금액 열은 프로젝트 쓰기 또는 발행액 노출이 있는 사람에게만(A-605). */
  amountVisible: boolean;
  /** 읽는 사람 빈 화면의 `요청은 담당 PM {이름}`(쓰기 권한 없을 때만 서버가 채운다). */
  pmName: string | null;
};

export function issueRequestDraftsFromDto(rows: IssueRequestDto[]): IssueRequestDraft[] {
  return rows.flatMap((row) =>
    row.id !== undefined && row.desiredIssueDate !== undefined && row.status !== undefined
      ? [
          {
            clientKey: row.id,
            id: row.id,
            version: row.version,
            desiredIssueDate: row.desiredIssueDate,
            amount: row.amountKrw ?? 0,
            memo: row.memo ?? null,
            status: row.status,
            dirty: false,
            vatKrw: row.vatKrw,
            totalKrw: row.totalKrw,
            issuedEntryDate: row.issuedEntryDate,
            issuedAmountKrw: row.issuedAmountKrw,
          },
        ]
      : [],
  );
}

export function newIssueRequestDraft(): IssueRequestDraft {
  const id = crypto.randomUUID();
  return { clientKey: id, id, desiredIssueDate: kstToday(new Date()), amount: 0, memo: null, status: "requested", dirty: true };
}

// 거부 봉투의 칸 중 요청 줄 id로 온 것을 떼어 낸다 — 나머지는 견적 줄 · 매출 표가 받는다. 대응 밖 필드는 상태 칸에 붙여 좌표를 잃지 않는다.
const REQUEST_COLUMNS = new Set(["desiredIssueDate", "amount", "memo"]);

export function splitRejectedRequestCells<Cell extends { rowId?: string; field: string; reason: string }>(
  cells: Cell[],
  requestIds: string[],
): { requests: Record<string, Record<string, string>>; rest: Cell[]; count: number } {
  const requests: Record<string, Record<string, string>> = {};
  const rest: Cell[] = [];
  let count = 0;
  for (const cell of cells) {
    const rowId = cell.rowId;
    if (rowId === undefined || !requestIds.includes(rowId)) {
      rest.push(cell);
      continue;
    }
    requests[rowId] = { ...requests[rowId], [REQUEST_COLUMNS.has(cell.field) ? cell.field : "status"]: cell.reason };
    count += 1;
  }
  return { requests, rest, count };
}

const monthDay = (date: string) => date.slice(5);

export function IssueRequestTable({
  rows,
  props,
  linkedRequestIds,
  onChange,
  onAdd,
  onLink,
  onUnlink,
  saveLocked,
  saveButtonId,
  editableWidth,
  onSave,
  firstIssueSignal,
}: {
  rows: IssueRequestDraft[];
  props: IssueRequestsProps;
  /** 「발행 줄로」 뒤 저장 전 새 발행 줄이 이 요청을 닫으려 서 있는 요청 id. */
  linkedRequestIds: ReadonlySet<string>;
  onChange: (clientKey: string, patch: Partial<IssueRequestDraft>) => void;
  onAdd: () => void;
  onLink: (requestId: string) => void;
  onUnlink: (requestId: string) => void;
  saveLocked: boolean;
  saveButtonId?: string;
  /** 1024 미만이면 보기 전용(DR-36 — 편집 칸 · 3차 없음). */
  editableWidth: boolean;
  onSave: () => void;
  /** 저장 거부 뒤 첫 오류 칸으로 포커스를 옮기는 신호(발행 · 입금 표와 같은 방식). */
  firstIssueSignal?: number;
}) {
  const canAdd = props.canRequest && editableWidth;
  const canEditRow = (row: IssueRequestDraft) => canAdd && row.status === "requested" && !linkedRequestIds.has(row.id) && (row.version !== undefined || row.dirty);
  // 06-21 — 취소는 저장된 `신청됨` · 미연결 줄만(새 줄 · 발행 줄 입력 중 · 발행됨 · 취소 줄은 Delete가 아무 일도 하지 않는다).
  const canCancelRow = (row: IssueRequestDraft) => canAdd && row.status === "requested" && row.version !== undefined && !linkedRequestIds.has(row.id);
  const [cancelTarget, setCancelTarget] = useState<IssueRequestDraft | null>(null);
  // 확인 모달 1차 뒤 트리거 칸은 읽기 칸이 되어 포커스를 받지 못한다(§7-17 · 감사 D-4) — 모달이 닫힌 뒤 취소한 그 줄(tabindex -1)로 옮긴다.
  const focusAfterCancel = useRef<string | null>(null);
  useEffect(() => {
    const id = focusAfterCancel.current;
    if (cancelTarget !== null || id === null) return;
    focusAfterCancel.current = null;
    const row = Array.from(document.querySelectorAll<HTMLElement>("[data-issue-request-id]"))
      .find((element) => element.dataset.issueRequestId === id)
      ?.closest("tr");
    if (!row) return;
    row.setAttribute("tabindex", "-1");
    row.focus();
  }, [cancelTarget]);
  const editability = (row: IssueRequestDraft) => (canEditRow(row) ? "edit" : props.canRequest ? "readonly" : "locked");

  // 06-21(S17 → S16) — `?issueRequest={id}`로 들어오면 마운트 뒤 그 요청 줄로 스크롤 · 포커스: `발행 줄로`가 선 줄이면 그 3차, 아니면 줄 자체
  // (`tabindex="-1"`). 없는 id면 아무 일도 하지 않는다. 상세 페이지는 동적 렌더(force-dynamic)라 useSearchParams에 Suspense 경계가 필요 없다.
  // 수화 렌더는 넓은 폭 스냅숏(editableWidth true)이라 1024 미만에서도 한 번 `발행 줄로`를 잡았다가 실제 폭으로 다시 그릴 때 그 버튼이
  // 사라져 포커스가 BODY로 빠진다(감사 D-3) — 폭이 바뀌고 포커스를 잃었을 때만 그 폭의 대상으로 다시 잡는다.
  const arrivalId = useSearchParams().get("issueRequest");
  const arrived = useRef<{ id: string; editableWidth: boolean } | null>(null);
  useEffect(() => {
    if (!arrivalId) return;
    const done = arrived.current;
    if (done?.id === arrivalId && (done.editableWidth === editableWidth || document.activeElement !== document.body)) return;
    const anchor = Array.from(document.querySelectorAll<HTMLElement>("[data-issue-request-id]")).find((element) => element.dataset.issueRequestId === arrivalId);
    if (!anchor) return;
    arrived.current = { id: arrivalId, editableWidth };
    const linkButton = editableWidth ? anchor.querySelector<HTMLButtonElement>('button[aria-label$=" 발행 줄로"]') : null;
    const row = anchor.closest("tr");
    const target = linkButton ?? row;
    if (!target) return;
    if (!linkButton) row?.setAttribute("tabindex", "-1");
    target.scrollIntoView({ block: "center" });
    target.focus({ preventScroll: true });
  }, [arrivalId, rows, editableWidth]);

  const emptyMessage =
    props.canRequest || props.pmName === null || !editableWidth ? "발행 요청이 없습니다" : `발행 요청이 없습니다 · 요청은 담당 PM ${props.pmName}`;

  const cellIssue = (row: IssueRequestDraft, columnKey: string): CellIssue | undefined => {
    const message = row.cellErrors?.[columnKey];
    return message ? { kind: "error", message } : undefined;
  };

  const columns: TableColumn<IssueRequestDraft>[] = [
    {
      key: "desiredIssueDate",
      header: "희망 발행일",
      priority: "p1",
      editability,
      cell: (row) =>
        canEditRow(row) ? (
          <input
            aria-label="희망 발행일"
            type="date"
            value={row.desiredIssueDate}
            onChange={(event) => onChange(row.clientKey, { desiredIssueDate: event.target.value })}
            className={styles.cellInput}
            readOnly={saveLocked}
          />
        ) : (
          row.desiredIssueDate
        ),
    },
    ...(props.amountVisible
      ? [
          {
            key: "amount",
            header: "금액",
            priority: "p1" as const,
            align: "right" as const,
            editability,
            cell: (row: IssueRequestDraft) =>
              canEditRow(row) ? (
                <AmountInput
                  readOnly={saveLocked}
                  ariaLabel="금액"
                  value={row.amount}
                  onCommit={(amount) => onChange(row.clientKey, { amount })}
                  className={styles.cellInputNumeric}
                />
              ) : (
                formatKrw(row.amount)
              ),
            // 부가세 · 합계는 서버 값이다 — 저장 전 편집한 줄에는 낡은 값이라 그리지 않는다.
            secondaryLine: (row: IssueRequestDraft) =>
              !row.dirty && row.vatKrw !== undefined && row.totalKrw !== undefined ? (
                <NumberGroups groups={[`부가세 ${formatKrw(row.vatKrw)}`, `합계 ${formatKrw(row.totalKrw)}`]} className={styles.pcSecondary} />
              ) : null,
          },
        ]
      : []),
    {
      key: "memo",
      header: "메모",
      priority: "p2",
      editability,
      cell: (row) =>
        canEditRow(row) ? (
          <input
            aria-label="메모"
            type="text"
            value={row.memo ?? ""}
            onChange={(event) => onChange(row.clientKey, { memo: event.target.value || null })}
            className={styles.cellInput}
            readOnly={saveLocked}
          />
        ) : row.memo ? (
          <span className={styles.requestMemo} title={row.memo}>
            {row.memo}
          </span>
        ) : (
          "—"
        ),
      summary: (row) =>
        row.memo ? (
          <span className={styles.requestMemo} title={row.memo}>
            {row.memo}
          </span>
        ) : null,
    },
    {
      key: "status",
      header: "상태",
      priority: "p1",
      cell: (row) => {
        const linked = linkedRequestIds.has(row.id);
        const day = monthDay(row.desiredIssueDate);
        const note =
          row.status === "issued"
            ? [row.issuedEntryDate ? `발행 ${monthDay(row.issuedEntryDate)}` : null, row.issuedAmountKrw != null ? formatKrw(row.issuedAmountKrw) : null].filter(Boolean).join(" · ") || null
            : linked
              ? "발행 줄 입력 중"
              : null;
        return (
          <span className={styles.requestStatus} data-issue-request-id={row.version !== undefined ? row.id : undefined}>
            <StatusTag variant="text" status={issueRequestStatusWord(row.status)} />
            {note ? <span className={styles.requestStatusNote}>{note}</span> : null}
            {props.canLink && editableWidth && row.status === "requested" && row.version !== undefined && !row.dirty ? (
              linked ? (
                <Button variant="tertiary" disabled={saveLocked} aria-label={`희망 ${day} 발행 줄 빼기`} onClick={() => onUnlink(row.id)}>
                  발행 줄 빼기
                </Button>
              ) : (
                <Button variant="tertiary" disabled={saveLocked} aria-label={`희망 ${day} 발행 줄로`} onClick={() => onLink(row.id)}>
                  발행 줄로
                </Button>
              )
            ) : null}
          </span>
        );
      },
      summary: (row) => issueRequestStatusWord(row.status),
    },
  ];

  return (
    <>
      <h3 className={styles.tableSubheading}>발행 요청</h3>
      <Table
        caption="발행 요청"
        keyboard={{ onSave, onDeleteRow: canAdd ? (row) => (canCancelRow(row) ? setCancelTarget(row) : undefined) : undefined }}
        columns={columns}
        rows={rows}
        getRowId={(row) => row.clientKey}
        emptyMessage={emptyMessage}
        emptyAction={canAdd && props.canRequest ? { label: "발행 요청 추가", onClick: onAdd } : undefined}
        saveLocked={saveLocked}
        cellIssue={cellIssue}
        // 취소한 줄의 상태 칸 `취소`는 저장 대기(dirty) 칸이다(§7-3 · 감사 D-6).
        cellDirty={(row, columnKey) => columnKey === "status" && row.cancel === true}
        firstIssueSignal={firstIssueSignal}
      />
      {canAdd && rows.length > 0 ? (
        <div className={styles.addLineButton}>
          <Button variant="tertiary" disabled={saveLocked} aria-describedby={saveLocked ? saveButtonId : undefined} onClick={onAdd}>
            발행 요청 추가
          </Button>
        </div>
      ) : null}
      {/* 06-21(O-12) — 확인하면 서버를 부르지 않고 그 줄을 dirty 한 칸(상태 `취소`)으로 만든다. 반영은 상세 1차 `일괄 저장` 때. */}
      <ConfirmDialog
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        title="발행 요청 취소"
        subtitle={cancelTarget ? `희망 ${cancelTarget.desiredIssueDate} · ${formatKrw(cancelTarget.amount)}` : undefined}
        resultLines={["경영관리 목록에서 빠짐"]}
        primary={{
          label: "발행 요청 취소",
          onConfirm: () => {
            if (cancelTarget) {
              onChange(cancelTarget.clientKey, { status: "cancelled", cancel: true });
              focusAfterCancel.current = cancelTarget.id;
            }
            setCancelTarget(null);
          },
        }}
      />
    </>
  );
}
