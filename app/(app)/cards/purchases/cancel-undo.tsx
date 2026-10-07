"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, useTransition, type ReactNode, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog, RefreshStep } from "@/ui/confirm-dialog/ConfirmDialog";
import { Form } from "@/ui/form/Form";
import { RowAction } from "@/ui/row-actions/RowActions";
import { usePanel } from "@/ui/side-panel/SidePanel";
import dialogStyles from "@/app/(app)/approvals/decision-dialogs.module.css";
import { cancelPurchaseRequestAction, undoCancelPurchaseRequestAction } from "./actions";
import styles from "../cards.module.css";

// 06-14(UI-SPEC S11 · Copywriting 「즉시 — 요청자 본인 구매 요청 취소」 · 「Destructive — 구매 요청 취소」 · §7-8 :1008):
// 요청자 본인의 `요청 취소`는 확인 창 없이 즉시 `취소` + 표 위 결과 줄 `구매 요청 취소됨 · {번호}` + 3차 `되돌리기`(마지막 한 건만).
// 구매 권한자의 남의 요청 취소는 사유 확인 창(결과 줄 · 되돌리기 없음 — 행 2행이 사유를 말한다). 06-09 `delete-undo.tsx`와 같은 꼴 —
// 결과 줄은 URL이 아니라 이 클라이언트 상태이고(만든 링크가 `되돌리기`를 띄우지 못한다) page.tsx가 필터 · 월 · 쪽을 `key`로 줘 바뀌면 줄이 사라진다.

const FAILED_REQUEST = "처리 중 오류 · 잠시 후 다시 시도";
// 요청이 닿지 않은 되돌리기(SYSTEM §7-8) — `되돌리기`를 남겨 다시 누를 수 있다. 서버 거부(원인 있음)만 버튼을 치운다.
const UNDO_RETRY = "되돌리기 실패 · 다시 시도";
// 취소된 줄이 화면에 없어 할 수 없는 다음 한 수 — 되돌리기 거부 줄에서는 뺀다(06-09 DOM O-3).
const IMPOSSIBLE_NEXT = [" · 다른 줄 고르기", " · 카드 사용은 다른 줄"];
const NO_RESPONSE = "결과를 받지 못함";

type Cancelled = { id: string; number: string; version: number };
type ResultLine = { kind: "cancelled"; cancelled: Cancelled; retryText: string | null } | { kind: "failed"; text: string; focus: boolean };
type ActionOutcome<T> = { data?: T; serverError?: string; validationErrors?: { reason?: { _errors?: string[] } } & { _errors?: string[] } } | undefined;

export type CancelReasonMessages = { empty: string; tooLong: string; max: number };

type CancelUndoValue = {
  messages: CancelReasonMessages;
  pendingId: string | null;
  line: ResultLine | null;
  shown: number;
  /** 실패면 그 글자(결과 줄과 같다), 성공이면 null. */
  cancelOwn: (target: { id: string; version: number; number: string }) => Promise<string | null>;
  undo: (cancelled: Cancelled) => void;
  /** 되돌려 다시 그려질 행 — 목록이 그 행 `요청 취소`(폰은 행 탭 자리)로 포커스를 옮기고 표식을 지운다(06-09 `focusId` 선례, DOM D-3a). */
  focusId: string | null;
  clearFocus: () => void;
  /** 결과 줄 `되돌리기`로 포커스 — 모달(시트 · 패널)이 닫힌 뒤 호출부가 부른다(모달이 열린 동안은 `autoFocus`가 먹지 않는다, DOM D-2). */
  focusUndo: () => void;
  lineRef: RefObject<HTMLParagraphElement | null>;
};

const CancelUndoContext = createContext<CancelUndoValue | null>(null);

function useCancelUndo(): CancelUndoValue {
  const value = useContext(CancelUndoContext);
  if (!value) throw new Error("PurchaseCancelUndo 밖에서 구매 요청 취소 행동을 그렸다");
  return value;
}

// 목록이 쓰는 포커스 복귀 도구 — 모달이 닫힌 뒤 `되돌리기`로(`focusUndo`) · 되돌린 행으로(`focusId`).
export function usePurchaseUndoFocus(): Pick<CancelUndoValue, "focusId" | "clearFocus" | "focusUndo"> {
  const { focusId, clearFocus, focusUndo } = useCancelUndo();
  return { focusId, clearFocus, focusUndo };
}

async function run<T>(action: () => Promise<ActionOutcome<T>>): Promise<ActionOutcome<T>> {
  try {
    return await action();
  } catch {
    return undefined;
  }
}

function focusScreenTitle() {
  document.querySelector<HTMLElement>('[data-ui="screen-title"]')?.focus();
}

export function PurchaseCancelUndo({ messages, children }: { messages: CancelReasonMessages; children: ReactNode }) {
  const router = useRouter();
  const [line, setLine] = useState<ResultLine | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  // 새로 취소할 때마다 `되돌리기`를 다시 그려 포커스를 준다.
  const [shown, setShown] = useState(0);
  const [focusId, setFocusId] = useState<string | null>(null);
  const clearFocus = useCallback(() => setFocusId(null), []);
  const lineRef = useRef<HTMLParagraphElement>(null);
  const focusUndo = useCallback(() => lineRef.current?.querySelector<HTMLElement>("button")?.focus(), []);

  const cancelOwn = useCallback(
    async (target: { id: string; version: number; number: string }) => {
      setPendingId(target.id);
      const outcome = await run(() => cancelPurchaseRequestAction({ id: target.id, version: target.version }));
      setPendingId(null);
      if (outcome?.data) {
        setLine({ kind: "cancelled", cancelled: { id: target.id, number: outcome.data.number, version: outcome.data.version }, retryText: null });
        setShown((count) => count + 1);
        router.refresh();
        return null;
      }
      const text = outcome?.serverError ?? FAILED_REQUEST;
      setLine({ kind: "failed", text, focus: false });
      return text;
    },
    [router],
  );

  async function undo(cancelled: Cancelled) {
    setPendingId(cancelled.id);
    const outcome = await run(() => undoCancelPurchaseRequestAction({ id: cancelled.id, version: cancelled.version }));
    setPendingId(null);
    if (outcome?.data) {
      setLine(null);
      setFocusId(cancelled.id);
      router.refresh();
      return;
    }
    if (outcome?.serverError) {
      const next = IMPOSSIBLE_NEXT.find((suffix) => outcome.serverError?.endsWith(suffix));
      const text = next ? outcome.serverError.slice(0, -next.length) : outcome.serverError;
      setLine({ kind: "failed", text, focus: true });
      return;
    }
    setLine({ kind: "cancelled", cancelled, retryText: UNDO_RETRY });
  }

  return (
    <CancelUndoContext.Provider value={{ messages, pendingId, line, shown, cancelOwn, undo: (cancelled) => void undo(cancelled), focusId, clearFocus, focusUndo, lineRef }}>
      {children}
    </CancelUndoContext.Provider>
  );
}

// 표 위 결과 줄 — 마지막으로 취소한 한 건(또는 막힘 문구). 포커스 → `되돌리기`, 되돌리기 거부면 → 줄 글자.
export function PurchaseCancelUndoLine() {
  const { line, shown, pendingId, undo, lineRef } = useCancelUndo();
  const failedRef = useRef<HTMLSpanElement>(null);
  const focusFailed = line?.kind === "failed" && line.focus;
  useEffect(() => {
    if (focusFailed) failedRef.current?.focus();
  }, [focusFailed, line]);
  if (!line) return null;
  return (
    <p ref={lineRef} role="status" className={styles.undoLine}>
      {line.kind === "failed" ? (
        <span ref={failedRef} tabIndex={line.focus ? -1 : undefined} className={styles.undoFailed}>
          {line.text}
        </span>
      ) : (
        <>
          {line.retryText ? <span className={styles.undoFailed}>{line.retryText}</span> : <span>{`구매 요청 취소됨 · ${line.cancelled.number}`}</span>}
          <RowAction key={shown} pending={pendingId === line.cancelled.id} autoFocus onClick={() => undo(line.cancelled)}>
            되돌리기
          </RowAction>
        </>
      )}
    </p>
  );
}

export type PurchaseCancelTarget = {
  id: string;
  number: string;
  version: number;
  itemName: string;
  /** 구매 완료 · 취소 행에는 버튼이 없다(Q2) — 호출자가 `신청됨` 행에만 준다. */
  branch: "own" | "others";
  /** 견적 줄 연결 요청이면 확인 창 결과 줄 `견적 줄 연결 풀림`(팀 비용이면 없다). */
  quoteLinked: boolean;
  /** 부제 금액 — 못 보는 사람이면 null. */
  estimateText: string | null;
};

// 행 `요청 취소`(RowAction danger — 맨 끝 · 위험 색). 접근 이름 `{번호} 요청 취소`.
// `onDone`은 요청이 끝난 뒤 호출부가 그 자리의 모달(시트 · 패널)을 닫는 데 쓴다. 본인 취소가 거부되면(PR #183 m-4) 닫지 않고
// 그 모달 안 버튼 옆에 거부 한 줄 — 뒤 결과 줄은 모달에 가려 있다. 모달 밖(PC 행)은 결과 줄이 말한다.
export function PurchaseCancelButton({ target, onDone }: { target: PurchaseCancelTarget; onDone?: () => void }) {
  const { pendingId, cancelOwn } = useCancelUndo();
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const label = (
    <>
      {/* 접근 이름 `{번호} 요청 취소` — 번호만 따로 읽히는 글자를 두지 않는다(목록 번호 칸과 같은 글자가 둘이 되지 않게). */}
      <span className="sr-only">{`${target.number} 요청 취소`}</span>
      <span aria-hidden="true">요청 취소</span>
    </>
  );
  if (target.branch === "own") {
    return (
      <>
        <RowAction
          danger
          pending={pendingId === target.id}
          onClick={() => {
            setFailure(null);
            void cancelOwn(target).then((failed) => {
              if (failed === null) onDone?.();
              else if (onDone) setFailure(failed);
            });
          }}
        >
          {label}
        </RowAction>
        {failure ? (
          <span role="alert" className={styles.undoFailed}>
            {failure}
          </span>
        ) : null}
      </>
    );
  }
  return (
    <>
      <RowAction danger onClick={() => setOpen(true)}>
        {label}
      </RowAction>
      <PurchaseCancelDialog target={target} open={open} onClose={() => setOpen(false)} onDone={onDone} />
    </>
  );
}

// 남의 요청 취소 확인 창 — 사유 한 칸 필수(비면 1차 비활성 + 왼쪽 `사유 없음 · 사유 적기`). 서버 거부는 1차 왼쪽 이유 + 꼬리 `새로 고침`.
function PurchaseCancelDialog({ target, open, onClose, onDone }: { target: PurchaseCancelTarget; open: boolean; onClose: () => void; onDone?: () => void }) {
  const { messages } = useCancelUndo();
  const router = useRouter();
  const fieldId = useId();
  const errorId = useId();
  const [reason, setReason] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const busyRef = useRef(false);
  // 성공하면 행의 `요청 취소`(이 창을 연 요소)가 목록 새로 고침과 함께 사라진다 — 그 순간(이 컴포넌트가 사라질 때) 포커스를 화면 제목에 둔다(DOM D-3b).
  const focusTitleOnExitRef = useRef(false);
  useEffect(
    () => () => {
      if (focusTitleOnExitRef.current) focusScreenTitle();
    },
    [],
  );

  const trimmed = reason.trim();
  const empty = trimmed.length === 0;
  const tooLong = !empty && trimmed.length > messages.max;
  const blocked = serverError ?? (empty ? messages.empty : tooLong ? messages.tooLong : undefined);
  const pending = submitting || refreshing;

  function close() {
    onClose();
    setServerError(null);
    setFailure(undefined);
  }

  async function confirm() {
    if (busyRef.current || blocked) return;
    busyRef.current = true;
    setSubmitting(true);
    setFailure(undefined);
    const outcome = await run(() => cancelPurchaseRequestAction({ id: target.id, version: target.version, reason: trimmed }));
    if (outcome?.data) {
      busyRef.current = false;
      setSubmitting(false);
      setReason("");
      focusTitleOnExitRef.current = true;
      onClose();
      startRefresh(() => router.refresh());
      onDone?.();
      return;
    }
    busyRef.current = false;
    setSubmitting(false);
    const message = outcome?.serverError ?? outcome?.validationErrors?.reason?._errors?.[0];
    if (message) setServerError(message);
    else setFailure(NO_RESPONSE);
  }

  return (
    <ConfirmDialog
      open={open}
      onClose={close}
      title="구매 요청 취소"
      subtitle={[target.number, target.itemName, ...(target.estimateText ? [target.estimateText] : [])].join(" · ")}
      resultLines={target.quoteLinked ? ["견적 줄 연결 풀림"] : []}
      evidenceField={
        <div className={dialogStyles.reason}>
          <label htmlFor={fieldId}>사유</label>
          <div>
            <textarea
              id={fieldId}
              rows={2}
              autoComplete="off"
              value={reason}
              aria-disabled={pending ? "true" : undefined}
              aria-invalid={tooLong ? "true" : undefined}
              aria-describedby={tooLong ? errorId : undefined}
              readOnly={pending}
              onChange={(event) => {
                setReason(event.target.value);
                setServerError(null);
              }}
            />
            {tooLong ? <Form.Error id={errorId}>{messages.tooLong}</Form.Error> : null}
          </div>
        </div>
      }
      primary={{
        label: "구매 요청 취소",
        shortcut: "Ctrl+Enter",
        pending,
        onConfirm: () => void confirm(),
        disabledReason: tooLong ? undefined : blocked,
        blockedBy: tooLong ? errorId : undefined,
        failure,
        nextStep: failure ? <RefreshStep onDone={close} /> : undefined,
      }}
    />
  );
}

// S13 패널(폰) 안 `요청 취소` — 폰은 행동 칸이 숨고 구매 권한자의 `신청됨` 행 탭이 S13을 열어서(06-12) 취소 길이 여기뿐이다(DOM D-1).
// 요청이 성공하면 패널을 닫는다(거부면 열어 둔 채 버튼 옆 한 줄): 본인 요청은 결과 줄 `되돌리기`로 포커스(패널이 사라진 뒤), 남의 요청(사유 창)은 화면 제목으로.
export function PurchaseCancelPanelAction({ target }: { target: PurchaseCancelTarget }) {
  const panel = usePanel();
  const { focusUndo } = useCancelUndo();
  const focusUndoOnExitRef = useRef(false);
  useEffect(
    () => () => {
      if (focusUndoOnExitRef.current) window.setTimeout(focusUndo, 0);
    },
    [focusUndo],
  );
  return (
    <PurchaseCancelButton
      target={target}
      onDone={() => {
        if (target.branch === "own") {
          focusUndoOnExitRef.current = true;
          panel?.requestClose("success", { returnFocus: false });
          return;
        }
        panel?.moveFocusToResult();
        panel?.requestClose("success");
      }}
    />
  );
}
