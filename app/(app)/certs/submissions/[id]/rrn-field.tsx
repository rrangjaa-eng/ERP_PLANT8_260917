"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/ui/button/Button";
import { maskRrn } from "@/domain/certs/format";
import { LOGIN_REQUIRED_MESSAGE } from "@/lib/actions/user-facing-error";
import { reopenCertRrnAction, revealCertRrnAction } from "./actions";
import { hideRrn, isRrnDirty, revealedRrn, type RrnState } from "./rrn-state";
import styles from "./review.module.css";

// 04.3-07 — I4 주민등록번호 칸(UI-SPEC I4). 기본은 가린 텍스트 + 3차 「전체 보기」(canReveal일 때만).
// 전체 보기 → 서버가 mask_reveal을 기록한 뒤 복호화 → 입력 칸 + 「가리기」(언제나).
// 「가리기」: 고친 값이 없으면 평문을 상태에서 지우고(서버 호출 없음), 고친 값이 있으면 칸을 내리고
// `{가림} · 저장 안 함` + 「전체 보기」(→ 서버 기록 성공 뒤에만 메모리의 고친 값으로 다시 연다).
// 화면이 가려지거나 이 화면에서 비활동 시간이 지나면 「가리기」를 누른 것과 같다.

function maskEdited(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 ? maskRrn(digits) : "*".repeat(digits.length);
}

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "input"] as const;

export function RrnField({
  id,
  submissionId,
  rrnMasked,
  canReveal,
  canEdit,
  busy,
  state,
  onChange,
  onPendingChange,
  error,
  idleMinutes,
}: {
  id: string;
  submissionId: string;
  rrnMasked: string;
  canReveal: boolean;
  canEdit: boolean;
  /** 폼 저장 대기 중 — 칸 · 「가리기」 · 「전체 보기」를 잠근다(§7-1 진행 중 · DOM 감사 H1). */
  busy: boolean;
  state: RrnState;
  onChange: Dispatch<SetStateAction<RrnState>>;
  /** 전체 보기 대기 중인지 폼에 알린다 — 그동안 저장도 잠긴다(DOM 감사 L1). */
  onPendingChange: (pending: boolean) => void;
  error?: string;
  idleMinutes: number;
}) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  useRrnAutoHide(onChange, idleMinutes);

  // 응답을 이 칸의 상태로 옮긴 뒤 훅의 결과(평문)를 비운다(검토 R-M1). 화면이 가려진 동안 온
  // 응답은 열지 않는다 — 자동 가리기와 같다(검토 R-L5). 세션이 이미 없으면 로그인으로(검토 R-L2).
  const reveal = useAction(revealCertRrnAction, {
    onSuccess: ({ data }) => {
      if (data?.kind === "sessionExpired") return router.push("/login");
      if (data?.kind === "revealed") {
        setFailed(false);
        if (document.visibilityState !== "hidden") onChange(revealedRrn(data.rrn));
        return;
      }
      setFailed(true);
    },
    onError: ({ error: failure }) => {
      if (failure.serverError === LOGIN_REQUIRED_MESSAGE) return router.push("/login");
      setFailed(true);
    },
    onSettled: (): void => reveal.reset(),
  });

  const reopen = useAction(reopenCertRrnAction, {
    onSuccess: ({ data }) => {
      if (data?.kind === "sessionExpired") return router.push("/login");
      if (data?.kind === "recorded") {
        setFailed(false);
        if (document.visibilityState !== "hidden") onChange((current) => ({ ...current, open: true }));
        return;
      }
      setFailed(true);
    },
    onError: ({ error: failure }) => {
      if (failure.serverError === LOGIN_REQUIRED_MESSAGE) return router.push("/login");
      setFailed(true);
    },
    onSettled: (): void => reopen.reset(),
  });

  const revealPending = reveal.isExecuting || reopen.isExecuting;
  useEffect(() => onPendingChange(revealPending), [revealPending, onPendingChange]);

  const errorId = `${id}-error`;
  const failId = `${id}-fail`;

  if (state.open) {
    return (
      <div className={styles.rrnRow}>
        {canEdit ? (
          <input
            id={id}
            name="rrn"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={14}
            readOnly={busy}
            className={[styles.textInput, styles.rrnInput, error ? styles.textInputError : ""].filter(Boolean).join(" ")}
            value={state.input ?? ""}
            onChange={(event) => onChange({ ...state, input: event.target.value })}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
        ) : (
          // 고칠 수 없는 값은 입력이 아니라 글자(§6-3 · §7-2 · DOM 감사 L3).
          <span className={[styles.rrnText, styles.num].join(" ")}>{state.input}</span>
        )}
        <Button variant="tertiary" disabled={busy} onClick={() => onChange(hideRrn(state))}>
          가리기
        </Button>
        {error ? (
          <p id={errorId} className={styles.fieldError}>
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const edited = isRrnDirty(state);
  const describedBy = [failed ? failId : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined;

  // 가린 줄에는 라벨이 가리킬 입력이 없다 — 줄을 「주민등록번호」 묶음으로 이름 붙인다(DOM 감사 M1).
  return (
    <div className={styles.rrnRow} role="group" aria-label="주민등록번호">
      {edited ? (
        <span className={styles.rrnText}>
          <span className={styles.num}>{maskEdited(state.input ?? "")}</span>
          <span className={styles.unsaved}> · 저장 안 함</span>
        </span>
      ) : (
        <span className={[styles.rrnText, styles.num].join(" ")}>{rrnMasked}</span>
      )}
      {canReveal ? (
        <Button
          variant="tertiary"
          pending={edited ? reopen.isExecuting : reveal.isExecuting}
          disabled={busy}
          aria-describedby={describedBy}
          onClick={() => (edited ? reopen.execute({ id: submissionId }) : reveal.execute({ id: submissionId }))}
        >
          전체 보기
        </Button>
      ) : null}
      {failed ? (
        <p id={failId} className={styles.fieldError}>
          번호 불러오기 실패 · 다시 시도
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.fieldError}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

// 자동 가리기 — visibilitychange hidden · 이 화면 비활동(서버가 준 분). 평문이 있을 때만 가린다.
function useRrnAutoHide(onChange: Dispatch<SetStateAction<RrnState>>, idleMinutes: number): void {
  useEffect(() => {
    const hide = () => onChange((current) => (current.open ? hideRrn(current) : current));

    const onVisibility = () => {
      if (document.visibilityState === "hidden") hide();
    };

    let timer = window.setTimeout(hide, idleMinutes * 60_000);
    const onActivity = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(hide, idleMinutes * 60_000);
    };

    document.addEventListener("visibilitychange", onVisibility);
    for (const type of ACTIVITY_EVENTS) document.addEventListener(type, onActivity);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      for (const type of ACTIVITY_EVENTS) document.removeEventListener(type, onActivity);
    };
  }, [onChange, idleMinutes]);
}
