"use client";

import { useRef, useState } from "react";
import { Select } from "@/ui/select/Select";
import { OTHER_LABEL, pickReason, selectedOptionOf } from "./compose";
import styles from "./ReasonField.module.css";

// SYSTEM.md §7-2 `ReasonField`(07.2 DC-4) — 네이티브 Select(관리자가 등록한 항목 + 마지막 `기타` · 자리표시 `사유 고르기`) + 여러 줄 글 칸 한 쌍.
// 항목을 고르면 글이 그 문구로 채워지고 이어서 덧붙여 쓸 수 있다(D-7288). 저장은 글만(D-7287) — 선택 상태는 이 안에서만 산다:
// 처음 값만 selectedOptionOf로 정하고, 글을 고칠 때는 다시 계산하지 않는다(덧붙이는 순간 `기타`로 바뀌면 시작말 교체가 깨진다).
// 항목이 0이면 Select 없이 글 칸만. 필수 여부 · 막힘 이유는 부품 밖 행동 줄이 가진다(§7-8) — 라벨도 호출부(`<label htmlFor={id}>`)가 글 칸에 건다.
export type ReasonFieldProps = {
  id: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  /** 서버 필드 오류 한 줄(Form.Error와 같은 모양). 행동 줄이 이유를 가지는 화면은 주지 않는다. */
  error?: string;
  maxLength?: number;
  autoFocus?: boolean;
  /** 제출 중 — 글 칸 `aria-disabled` + `readOnly`, 고르개 `aria-disabled`(disabled 속성은 쓰지 않는다). */
  locked?: boolean;
};

export function ReasonField({ id, options, value, onChange, error, maxLength, autoFocus, locked = false }: ReasonFieldProps) {
  const initial = selectedOptionOf(value, options);
  const [selected, setSelected] = useState(initial);
  const [prevLabel, setPrevLabel] = useState<string | null>(initial !== "" && initial !== OTHER_LABEL ? initial : null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const errorId = `${id}-error`;

  function pick(label: string) {
    if (locked || label === "") return;
    const next = pickReason({ text: value, prevLabel }, label);
    setSelected(label);
    setPrevLabel(next.prevLabel);
    if (next.text !== value) onChange(next.text);
    if (label === OTHER_LABEL) textRef.current?.focus();
  }

  return (
    <div className={styles.field}>
      {options.length > 0 ? (
        <Select
          id={`${id}-pick`}
          aria-label="항목"
          hideEmptyOption
          options={[{ value: "", label: "사유 고르기" }, ...options.map((label) => ({ value: label, label })), { value: OTHER_LABEL, label: OTHER_LABEL }]}
          value={selected}
          aria-disabled={locked ? "true" : undefined}
          onChange={(event) => pick(event.target.value)}
        />
      ) : null}
      <textarea
        id={id}
        ref={textRef}
        rows={2}
        maxLength={maxLength}
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        readOnly={locked}
        aria-disabled={locked ? "true" : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={styles.text}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
