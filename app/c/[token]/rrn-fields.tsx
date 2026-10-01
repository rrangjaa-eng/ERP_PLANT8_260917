"use client";

import { useId, useRef, type ChangeEvent, type ClipboardEvent } from "react";
import { shouldAdvance, splitRrnPaste } from "./rrn-paste";
import styles from "./intake.module.css";

// 04.3-06 Task 2 ② — 화면 전용 부품 「주민등록번호 두 칸」(UI-SPEC E4). 보이는
// 라벨이 묶음(role=group)의 이름이고 칸마다 접근 이름이 있다. 검사는 서버만 한다.
// 04.3-15(G5 a) — 라벨 옆 부제 `세무 신고용`(주소 칸 부제와 같은 부품 · 모양).
export const RRN_FRONT_ID = "rrn-front";

export function RrnFields({
  front,
  back,
  error,
  onChange,
}: {
  front: string;
  back: string;
  error?: string;
  onChange: (next: { front: string; back: string }) => void;
}) {
  const labelId = useId();
  const errorId = useId();
  const backRef = useRef<HTMLInputElement>(null);
  const invalid = error ? true : undefined;
  const describedBy = error ? errorId : undefined;
  const inputClass = error ? `${styles.rrnInput} ${styles.rrnInputError}` : styles.rrnInput;

  function focusBackEnd() {
    const el = backRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }

  function handleFront(e: ChangeEvent<HTMLInputElement>) {
    const el = e.currentTarget;
    const next = el.value.replace(/\D/g, "").slice(0, 6);
    onChange({ front: next, back });
    const inputType = (e.nativeEvent as InputEvent).inputType ?? "";
    const caretAtEnd = el.selectionStart === el.value.length;
    if (shouldAdvance({ inputType, caretAtEnd, length: next.length })) backRef.current?.focus();
  }

  function handleFrontPaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const split = splitRrnPaste(e.clipboardData.getData("text"));
    if (split.back !== null) {
      onChange({ front: split.front, back: split.back });
      // 값이 그려진 뒤 뒤 칸 끝으로.
      requestAnimationFrame(focusBackEnd);
    } else {
      onChange({ front: split.front, back });
    }
  }

  return (
    <div role="group" aria-labelledby={labelId} className={styles.fieldRow}>
      <span id={labelId} className={styles.fieldLabel}>
        주민등록번호 <span className={styles.labelSub}>세무 신고용</span>
      </span>
      <div className={styles.rrnRow}>
        <input
          id={RRN_FRONT_ID}
          aria-label="주민등록번호 앞 6자리"
          inputMode="numeric"
          maxLength={6}
          autoComplete="off"
          placeholder="930412"
          value={front}
          onChange={handleFront}
          onPaste={handleFrontPaste}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={inputClass}
        />
        <span className={styles.rrnDash} aria-hidden="true">
          -
        </span>
        <input
          ref={backRef}
          id="rrn-back"
          aria-label="주민등록번호 뒤 7자리"
          type="password"
          inputMode="numeric"
          maxLength={7}
          autoComplete="new-password"
          placeholder="•••••••"
          value={back}
          onChange={(e) => onChange({ front, back: e.currentTarget.value.replace(/\D/g, "").slice(0, 7) })}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={inputClass}
        />
      </div>
      {error ? (
        <p id={errorId} className={styles.rrnError}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
