"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { Form } from "@/ui/form/Form";
import { previewPeriodChange } from "@/domain/projects/period";
import type { ProjectStatus } from "@/domain/projects/status-transitions";
import styles from "./project-detail.module.css";

// 04-22(S13 · §7-15) — 머리 줄 아래 기간 칸 묶음. `Form.Actions`가 없는 칸 폼이다 — 고치면 화면 1차
// 「일괄 저장」의 N에 합류하고 견적 줄·매출과 같은 트랜잭션으로 저장된다. 값·dirty·오류는 QuoteLedger가
// 갖고 이 컴포넌트는 그리기와 키(Enter 막기 · Ctrl+S 저장 · Esc 되돌리기/닫기)만 맡는다.
export type PeriodDraft = { start: string; end: string };
export type PeriodFieldError = { field: "start" | "end"; reason: string };

export function PeriodField({
  draft,
  baseline,
  status,
  todayKst,
  errors,
  focusField,
  saved,
  onChange,
  onEscape,
  onSave,
  saveLocked = false,
}: {
  draft: PeriodDraft;
  baseline: PeriodDraft;
  status: ProjectStatus;
  todayKst: string;
  errors: PeriodFieldError[];
  focusField: "start" | "end";
  /** 저장 성공 직후 600ms 틴트(S13) — 닫히기 직전 신호. */
  saved: boolean;
  onChange: (next: PeriodDraft) => void;
  onEscape: () => void;
  onSave: () => void;
  /** 04-49(DR-3) — 저장 요청 중. 두 칸은 값·포커스를 둔 채 readOnly가 되고 Esc 되돌리기도 무동작이다. */
  saveLocked?: boolean;
}) {
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (focusField === "start" ? startRef : endRef).current?.focus();
  }, [focusField]);

  // 힌트는 화면 코드가 아니라 서버 저장과 같은 domain 함수가 만든다(개정 ⑨).
  const hint = previewPeriodChange({
    status,
    newStart: draft.start.trim() || null,
    newEnd: draft.end.trim() || null,
    todayKst,
  });

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (!saveLocked) onEscape();
      return;
    }
    if (event.ctrlKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      onSave();
    }
  }

  const fields: { key: "start" | "end"; label: string; ref: typeof startRef }[] = [
    { key: "start", label: "시작일", ref: startRef },
    { key: "end", label: "종료일", ref: endRef },
  ];

  return (
    <Form
      className={saved ? `${styles.periodForm} ${styles.periodSaved}` : styles.periodForm}
      onSubmit={(event) => event.preventDefault()}
    >
      {fields.map((field) => {
        const id = `period-${field.key}`;
        const error = errors.find((entry) => entry.field === field.key);
        const dirty = draft[field.key] !== baseline[field.key];
        return (
          <Form.Field key={field.key} id={id} label={field.label} width="short">
            <input
              ref={field.ref}
              id={id}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="2026-09-18"
              value={draft[field.key]}
              readOnly={saveLocked}
              aria-invalid={error ? "true" : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              className={dirty ? `${styles.periodInput} ${styles.periodInputDirty}` : styles.periodInput}
              onChange={(event) => onChange({ ...draft, [field.key]: event.target.value })}
              onKeyDown={handleKeyDown}
            />
            {error ? <Form.Error id={`${id}-error`}>{error.reason}</Form.Error> : null}
          </Form.Field>
        );
      })}
      {hint ? <Form.Hint>{hint}</Form.Hint> : null}
    </Form>
  );
}

// 부제의 기간 글자 — 날짜는 식별자형이라 쉼표가 없다(D-95 예외).
export function periodText(startDate: string | null, endDate: string | null): string {
  if (!startDate && !endDate) return "기간 미정";
  return `기간 ${startDate ?? "—"} ~ ${endDate ?? "—"}`;
}
