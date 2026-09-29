"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/ui/button/Button";
import { maskRrn } from "@/domain/certs/format";
import { reopenCertRrnAction, revealCertRrnAction } from "./actions";
import styles from "./review.module.css";

// 04.3-07 — I4 주민등록번호 칸(UI-SPEC I4). 기본은 가린 텍스트 + 3차 「전체 보기」(canReveal일 때만).
// 전체 보기 → 서버가 mask_reveal을 기록한 뒤 복호화 → 입력 칸 + 「가리기」(언제나).
// 「가리기」: 고친 값이 없으면 평문을 상태에서 지우고(서버 호출 없음), 고친 값이 있으면 칸을 내리고
// `{가림} · 저장 안 함` + 「전체 보기」(→ 서버 기록 성공 뒤에만 메모리의 고친 값으로 다시 연다).
// 화면이 가려지거나 이 화면에서 비활동 시간이 지나면 「가리기」를 누른 것과 같다.

export type RrnState = { original: string | null; input: string | null; open: boolean };

export const RRN_CLOSED: RrnState = { original: null, input: null, open: false };

export function isRrnDirty(state: RrnState): boolean {
  return state.input !== null && state.input !== state.original;
}

function hidden(state: RrnState): RrnState {
  if (!isRrnDirty(state)) return RRN_CLOSED;
  return { original: null, input: state.input, open: false };
}

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
  state,
  onChange,
  error,
  idleMinutes,
}: {
  id: string;
  submissionId: string;
  rrnMasked: string;
  canReveal: boolean;
  canEdit: boolean;
  state: RrnState;
  onChange: Dispatch<SetStateAction<RrnState>>;
  error?: string;
  idleMinutes: number;
}) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  useRrnAutoHide(onChange, idleMinutes);

  const reveal = useAction(revealCertRrnAction, {
    onSuccess: ({ data }) => {
      if (data?.kind === "sessionExpired") return router.push("/login");
      if (data?.kind === "revealed") {
        setFailed(false);
        onChange({ original: data.rrn, input: data.rrn, open: true });
        return;
      }
      setFailed(true);
    },
    onError: () => setFailed(true),
  });

  const reopen = useAction(reopenCertRrnAction, {
    onSuccess: ({ data }) => {
      if (data?.kind === "sessionExpired") return router.push("/login");
      if (data?.kind === "recorded") {
        setFailed(false);
        onChange((current) => ({ ...current, open: true }));
        return;
      }
      setFailed(true);
    },
    onError: () => setFailed(true),
  });

  const errorId = `${id}-error`;
  const failId = `${id}-fail`;

  if (state.open) {
    return (
      <div className={styles.rrnRow}>
        <input
          id={id}
          name="rrn"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={14}
          readOnly={!canEdit}
          className={[styles.textInput, styles.rrnInput, error ? styles.textInputError : ""].filter(Boolean).join(" ")}
          value={state.input ?? ""}
          onChange={(event) => onChange({ ...state, input: event.target.value })}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <Button variant="tertiary" onClick={() => onChange(hidden(state))}>
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

  const edited = isRrnDirty(state) && state.input !== null;
  const pending = edited ? reopen.isExecuting : reveal.isExecuting;

  return (
    <div className={styles.rrnRow}>
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
          pending={pending}
          aria-describedby={failed ? failId : undefined}
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
    const hide = () => onChange((current) => (current.open || current.original !== null ? hidden(current) : current));

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
