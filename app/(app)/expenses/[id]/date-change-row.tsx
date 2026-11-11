"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DateChangeView } from "@/domain/expenses/date-change";
import { Button } from "@/ui/button/Button";
import buttonStyles from "@/ui/button/Button.module.css";
import { ConfirmDialog, RefreshStep, splitRefreshTail } from "@/ui/confirm-dialog/ConfirmDialog";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { Toast } from "@/ui/toast/Toast";
import dialogStyles from "@/app/(app)/approvals/decision-dialogs.module.css";
import { approveDateChangeAction, rejectDateChangeAction, undoDateChangeApprovalAction, withdrawDateChangeAction } from "./actions";
import styles from "./expense.module.css";

// 07.2-18 S16(X4 · D-7290~D-7295): 지출결의 상세 `희망 지급일` 값 자리 안의 변경 요청 줄 — 서버가 넘긴 사실(listDateChangeView) 하나로 갈린다.
// 기안자: 3차 `변경 요청`(요청 화면 링크) / 대기면 `변경 요청 중 · {날짜}`(StatusTag text accent) + 3차 `요청 철회`.
// 처리 권한자(지급 예정일 바꾸기): 요청 한 줄(새 희망일 · 요청자 · 시각) + aux 둘(`희망 사유` · `변경 사유`) + 줄 끝 3차 `요청 승인` · `요청 거절`.
// 승인은 확인 없이 즉시 → 토스트 `변경 승인 · 지급 예정일 MM-DD` + 3차 `되돌리기`(디자인 D-F4 · SYSTEM.md:1013-1014) — 거부되면 토스트 글자
// `되돌리기 실패 · {원인}`(danger)로 바꾸고 `되돌리기`를 치운다(SYSTEM.md:1072). 거절은 ConfirmDialog `변경 요청 거절` · 근거 칸 `거절 메모`(필수).
// 서버 거부는 줄 아래 막힘 자리 — 끝이 ` · 새로 고침`이면 그 꼬리는 3차 `새로 고침`(§7-17).
const NO_RESPONSE = "결과를 받지 못함 · 새로 고침";
const MEMO_EMPTY = "거절 메모 없음 · 메모 적기";
const MEMO_MAX = 500;
// 거절 뒤 포커스 자리 — date-change-history.tsx의 표 감싸개 id(서버 부품이라 상수를 가져오지 않고 같은 글자를 쓴다).
const HISTORY_ID = "date-change-history";

// §7-8 사라진 컨트롤 대신 남는 컨트롤 — 누른 3차가 다시 받은 화면에서 사라졌을 때(포커스가 body로 빠졌을 때)만 옮긴다.
function focusIfLost(target: HTMLElement | null) {
  const active = document.activeElement;
  if (active === null || active === document.body) target?.focus();
}

// 승인 착지 — 처리 줄은 승인 뒤 사라지므로 토스트는 주소(`?dateApproved=…`)로 상세가 띄운다(제출 착지 `?submitted=` 선례). 되돌리기 재료(승인 전 값 · 새 version)도 함께 싣는다.
export function dateApprovedHref(expenseId: string, approved: { requestId: string; newDate: string; before: string | null; version: number }): string {
  const query = new URLSearchParams({ dateApproved: approved.requestId, on: approved.newDate, before: approved.before ?? "", v: String(approved.version) });
  return `/expenses/${expenseId}?${query.toString()}`;
}

export function DateChangeRow({
  expenseId,
  number,
  date,
  view,
  hopeReason,
}: {
  expenseId: string;
  number: string | null;
  /** 결재자가 본 희망 지급일(없으면 `—`) — 이 부품이 `희망 지급일` 값 칸 전체를 그린다. */
  date: string | null;
  view: DateChangeView;
  hopeReason: string | null;
}) {
  const router = useRouter();
  const memoId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [memo, setMemo] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
  const pending = view.pending;
  // 철회 → 다시 선 `변경 요청`, 거절 → 이력 표. 다시 받은 화면이 그려진 뒤에 옮긴다 — 이 줄이 남으면 view가 바뀐 효과에서,
  // 처리 줄과 함께 이 부품이 사라지면 해제 정리에서(정리는 새 화면이 붙은 뒤 돈다 — ConfirmDialog 「열린 채로 사라질 때」와 같은 꼴).
  const linkRef = useRef<HTMLAnchorElement>(null);
  const focusAfterRef = useRef<"entry" | "history" | null>(null);
  useEffect(() => {
    const target = focusAfterRef.current;
    if (target === null) return;
    focusAfterRef.current = null;
    focusIfLost((target === "entry" ? linkRef.current : null) ?? document.getElementById(HISTORY_ID));
  }, [view]);
  useEffect(
    () => () => {
      if (focusAfterRef.current !== null) focusIfLost(document.getElementById(HISTORY_ID));
    },
    [],
  );

  async function run<T>(call: () => Promise<{ data?: T; serverError?: string } | undefined>): Promise<T | null> {
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    let response: { data?: T; serverError?: string } | undefined;
    try {
      response = await call();
    } catch {
      response = undefined;
    }
    busyRef.current = false;
    setBusy(false);
    if (response?.data !== undefined) return response.data;
    setError(response?.serverError ?? NO_RESPONSE);
    return null;
  }

  async function withdraw() {
    if (!pending?.id) return;
    const requestId = pending.id;
    if ((await run(() => withdrawDateChangeAction({ requestId }))) === null) return;
    focusAfterRef.current = "entry";
    router.refresh();
  }

  async function approve() {
    if (!pending?.id) return;
    const requestId = pending.id;
    const data = await run(() => approveDateChangeAction({ requestId, version: view.version }));
    if (data === null) return;
    router.replace(dateApprovedHref(expenseId, { requestId, ...data }));
  }

  async function reject() {
    if (!pending?.id || busyRef.current || memo.trim() === "") return;
    const requestId = pending.id;
    busyRef.current = true;
    setBusy(true);
    setRejectError(null);
    let response: Awaited<ReturnType<typeof rejectDateChangeAction>> | undefined;
    try {
      response = await rejectDateChangeAction({ requestId, memo });
    } catch {
      response = undefined;
    }
    busyRef.current = false;
    setBusy(false);
    if (response?.data) {
      setRejectOpen(false);
      setMemo("");
      focusAfterRef.current = "history";
      router.refresh();
      return;
    }
    setRejectError(response?.serverError ?? response?.validationErrors?.memo?._errors?.[0] ?? NO_RESPONSE);
  }

  const shownError = splitRefreshTail(error ?? undefined);
  const errorLine = error ? (
    <span className={`${styles.subLine} ${styles.blockedLine}`}>
      <span role="status" className={styles.blockedReason}>
        {shownError.refresh ? `${shownError.reason ?? ""} · ` : error}
      </span>
      {shownError.refresh ? <RefreshStep onDone={() => setError(null)} /> : null}
    </span>
  ) : null;

  const dateText = date ?? <span className={styles.muted}>—</span>;
  let body = null;
  if (view.canDecide && pending) {
    body = (
      <span className={styles.subLine} data-testid="date-change-decide">
        <span className={`${styles.valueRow} ${styles.scheduleRow}`}>
          <span className={styles.fill}>{[pending.newDate, pending.requesterName, pending.requestedAt].filter(Boolean).join(" · ")}</span>
          <span>
            {view.canApprove ? (
              <Button id="date-change-approve" variant="tertiary" pending={busy} onClick={() => void approve()}>
                요청 승인
              </Button>
            ) : null}
            <Button variant="tertiary" disabled={busy} onClick={() => setRejectOpen(true)}>
              요청 거절
            </Button>
          </span>
        </span>
        {hopeReason ? <span className={`${styles.subLine} ${styles.muted}`}>{`희망 사유 ${hopeReason}`}</span> : null}
        {pending.reason ? <span className={`${styles.subLine} ${styles.muted}`}>{`변경 사유 ${pending.reason}`}</span> : null}
        {errorLine}
      </span>
    );
  } else if (view.entry === "pending" && pending) {
    body = (
      <span className={styles.subLine} data-testid="date-change-pending">
        <StatusTag status="변경 요청 중" variant="text" />
        {` · ${pending.newDate ?? ""} `}
        <Button variant="tertiary" pending={busy} onClick={() => void withdraw()}>
          요청 철회
        </Button>
        {errorLine}
      </span>
    );
  }

  const memoEmpty = memo.trim() === "";
  return (
    <>
      {view.entry === "can" ? (
        <span className={`${styles.valueRow} ${styles.scheduleRow}`}>
          <span className={styles.fill}>{dateText}</span>
          <Link ref={linkRef} href={`/expenses/${expenseId}/date-request`} className={`${buttonStyles.btn} ${buttonStyles.tertiary}`}>
            변경 요청
          </Link>
        </span>
      ) : (
        dateText
      )}
      {body}
      {view.canDecide && pending ? (
        <ConfirmDialog
          open={rejectOpen}
          onClose={() => {
            setRejectOpen(false);
            setRejectError(null);
          }}
          title="변경 요청 거절"
          subtitle={[number, pending.newDate].filter(Boolean).join(" · ")}
          evidenceField={
            <div className={dialogStyles.reason}>
              <label htmlFor={memoId}>거절 메모</label>
              <div>
                <textarea
                  id={memoId}
                  rows={2}
                  autoComplete="off"
                  maxLength={MEMO_MAX}
                  value={memo}
                  aria-disabled={busy ? "true" : undefined}
                  readOnly={busy}
                  onChange={(event) => {
                    setMemo(event.target.value);
                    setRejectError(null);
                  }}
                />
              </div>
            </div>
          }
          primary={{
            label: "요청 거절",
            shortcut: "Ctrl+Enter",
            pending: busy,
            onConfirm: () => void reject(),
            disabledReason: rejectError ?? (memoEmpty ? MEMO_EMPTY : undefined),
          }}
        />
      ) : null}
    </>
  );
}

// 승인 토스트(디자인 D-F4 · SYSTEM.md:1013-1014) — `변경 승인 · 지급 예정일 MM-DD` + 3차 `되돌리기`(확인 없이 즉시). 성공이면 주소를 비우고 다시 받아
// 처리 줄 · 승인 전 날짜가 다시 선다. 거부되면 글자 `되돌리기 실패 · {원인}`(오류 토스트 — 닫을 때까지)로 바꾸고 `되돌리기`를 치운다(SYSTEM.md:1072).
export function DateApprovedToast({ expenseId, requestId, newDate, before, version }: { expenseId: string; requestId: string; newDate: string; before: string | null; version: number }) {
  const router = useRouter();
  const here = `/expenses/${expenseId}`;
  const [shown, setShown] = useState<{ message: string; tone: "default" | "error"; undo: boolean } | null>({
    message: `변경 승인 · 지급 예정일 ${newDate.slice(5)}`,
    tone: "default",
    undo: true,
  });
  const busyRef = useRef(false);
  // 되돌린 뒤 포커스 = 다시 선 `요청 승인`(새 화면이 붙은 뒤 — 이 토스트는 주소가 비면 사라진다, 해제 정리에서). 저절로 사라지면 화면 제목(§7-17).
  const focusAfterRef = useRef<"approve" | "title" | null>(null);
  useEffect(() => {
    if (shown !== null || focusAfterRef.current !== "title") return;
    focusAfterRef.current = null;
    focusIfLost(document.querySelector<HTMLElement>('[data-ui="screen-title"]'));
  }, [shown]);
  useEffect(
    () => () => {
      if (focusAfterRef.current === "approve") focusIfLost(document.getElementById("date-change-approve"));
    },
    [],
  );

  async function undo() {
    if (busyRef.current) return;
    busyRef.current = true;
    let response: Awaited<ReturnType<typeof undoDateChangeApprovalAction>> | undefined;
    try {
      response = await undoDateChangeApprovalAction({ requestId, before, version });
    } catch {
      response = undefined;
    }
    if (response?.data) {
      focusAfterRef.current = "approve";
      setShown(null);
      router.replace(here);
      return;
    }
    busyRef.current = false;
    setShown({ message: `되돌리기 실패 · ${splitRefreshTail(response?.serverError ?? "결과를 받지 못함").reason ?? ""}`, tone: "error", undo: false });
  }

  if (!shown) return null;
  return (
    <Toast
      message={shown.message}
      tone={shown.tone}
      actionLabel={shown.undo ? "되돌리기" : undefined}
      onAction={shown.undo ? () => void undo() : undefined}
      focusAction={shown.undo}
      onDismiss={() => {
        focusAfterRef.current = "title";
        setShown(null);
        router.replace(here);
      }}
    />
  );
}
