"use client";

import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { Form } from "@/ui/form/Form";
import { Select } from "@/ui/select/Select";
import { formatForeignLine, formatKrw, formatNumberInput, parseNumberInput, type NumberInputKind } from "@/lib/format-number";
import { validatePreEstimateChange, type PreEstimateFieldError } from "@/domain/projects/pre-estimate";
import type { Currency, Money } from "@/domain/money";
import styles from "./project-detail.module.css";

// 04-44(DR-28 · DR-37 · 계약 8 · S17 · §7-15) — 머리 줄 아래 총 매출 예상가 칸 묶음. 기간 칸(04-22)과 같은 형태의
// `Form.Actions`가 없는 칸 폼이다 — 고치면 화면 1차 「일괄 저장」의 N에 합류하고 같은 트랜잭션으로 저장된다.
// 값·dirty·오류는 QuoteLedger가 갖고 이 컴포넌트는 그리기와 키만 맡는다. 칸 값은 입력 칸 글자(쉼표 포함) 그대로다.
export type PreEstimateDraft = { amount: string; currency: Currency; fxRate: string };
export type { PreEstimateFieldError };

function numberText(value: number, kind: NumberInputKind): string {
  const raw = String(value);
  return formatNumberInput({ raw, caret: raw.length, kind }).text;
}

// 부제 글자 — 저장된 0은 미입력으로 본다(S17 empty · 사용자 2026-09-23).
export function preEstimateText(value: Money): string {
  if (value.amountKrw === 0) return "총 매출 예상가 —";
  const foreign = formatForeignLine(value);
  return `총 매출 예상가 ${formatKrw(value.amountKrw)}${foreign ? ` · ${foreign}` : ""}`;
}

// 칸을 열 때의 값. 금액이 0이면 빈칸, KRW면 환율 칸 기본값은 서버가 넘긴 최근 USD 환율(D-71).
export function preEstimateDraftFrom(value: Money, usdDefaultFxRate: number): PreEstimateDraft {
  return {
    currency: value.currency,
    amount: value.amountKrw === 0 ? "" : numberText(value.amount, value.currency === "KRW" ? "krw" : "foreign"),
    fxRate: numberText(value.currency === "KRW" ? usdDefaultFxRate : value.fxRate, "fxRate"),
  };
}

// 저장·검증에 싣는 값. 빈 금액은 0(미입력), 숫자가 아니면 NaN — 판정은 validatePreEstimateChange가 한다.
export function parsePreEstimateDraft(draft: PreEstimateDraft): { currency: Currency; amount: number; fxRate: number | null } {
  return {
    currency: draft.currency,
    amount: parseNumberInput(draft.amount) ?? 0,
    fxRate: draft.currency === "KRW" ? 1 : parseNumberInput(draft.fxRate),
  };
}

// 바뀐 칸 수 — 환율 칸은 외화일 때만 센다(KRW면 숨는 칸이다).
export function preEstimateDirtyCount(draft: PreEstimateDraft, baseline: PreEstimateDraft): number {
  return (
    (draft.amount !== baseline.amount ? 1 : 0) +
    (draft.currency !== baseline.currency ? 1 : 0) +
    (draft.currency !== "KRW" && draft.fxRate !== baseline.fxRate ? 1 : 0)
  );
}

export function fxRateTouched(draft: PreEstimateDraft, baseline: PreEstimateDraft): boolean {
  return draft.currency !== "KRW" && draft.fxRate !== baseline.fxRate;
}

// 쉼표 입력 칸(S15) — 값은 부모가 갖는다(Esc 되돌리기·복원이 칸을 다시 채운다). 커서는 형식 적용 뒤 되돌린다.
function CommaInput({
  id,
  kind,
  value,
  dirty,
  error,
  focusOnMount,
  onChange,
  onKeyDown,
}: {
  id: string;
  kind: NumberInputKind;
  value: string;
  dirty: boolean;
  error: string | undefined;
  focusOnMount: boolean;
  onChange: (text: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaretRef = useRef<number | null>(null);

  useEffect(() => {
    if (focusOnMount) inputRef.current?.focus();
  }, [focusOnMount]);

  useLayoutEffect(() => {
    if (pendingCaretRef.current !== null && inputRef.current) {
      inputRef.current.setSelectionRange(pendingCaretRef.current, pendingCaretRef.current);
      pendingCaretRef.current = null;
    }
  }, [value]);

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode={kind === "krw" ? "numeric" : "decimal"}
        autoComplete="off"
        value={value}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={dirty ? `${styles.periodInput} ${styles.periodInputDirty}` : styles.periodInput}
        onChange={(event) => {
          const raw = event.target.value;
          const result = formatNumberInput({ raw, caret: event.target.selectionStart ?? raw.length, kind, prev: value });
          pendingCaretRef.current = result.caret;
          onChange(result.text);
        }}
        onKeyDown={onKeyDown}
      />
      {error ? <Form.Error id={`${id}-error`}>{error}</Form.Error> : null}
    </>
  );
}

export function PreEstimateField({
  draft,
  baseline,
  saved,
  onChange,
  onSave,
}: {
  draft: PreEstimateDraft;
  baseline: PreEstimateDraft;
  /** 저장 성공 직후 600ms 틴트(S17) — 닫히기 직전 신호. */
  saved: boolean;
  onChange: (next: PreEstimateDraft) => void;
  onSave: () => void;
}) {
  // 칸 오류는 서버 저장과 같은 함수로 만든다(문구를 화면에서 새로 만들지 않는다).
  const errors = validatePreEstimateChange(parsePreEstimateDraft(draft));
  const errorOf = (field: PreEstimateFieldError["field"]) => errors.find((entry) => entry.field === field)?.reason;

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      return;
    }
    if (event.ctrlKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      onSave();
    }
  }

  return (
    <Form
      className={saved ? `${styles.periodForm} ${styles.periodSaved}` : styles.periodForm}
      onSubmit={(event) => event.preventDefault()}
    >
      <Form.Field id="pre-estimate-amount" label="총 매출 예상가" width="short">
        <CommaInput
          id="pre-estimate-amount"
          kind={draft.currency === "KRW" ? "krw" : "foreign"}
          value={draft.amount}
          dirty={draft.amount !== baseline.amount}
          error={errorOf("amount")}
          focusOnMount
          onChange={(amount) => onChange({ ...draft, amount })}
          onKeyDown={handleKeyDown}
        />
      </Form.Field>
      <Form.Field id="pre-estimate-currency" label="통화" width="select">
        <Select
          id="pre-estimate-currency"
          value={draft.currency}
          options={[
            { value: "KRW", label: "KRW" },
            { value: "USD", label: "USD" },
          ]}
          className={draft.currency !== baseline.currency ? styles.periodInputDirty : undefined}
          onChange={(event) => {
            const currency = event.target.value;
            if (currency === "KRW" || currency === "USD") onChange({ ...draft, currency });
          }}
          onKeyDown={handleKeyDown}
        />
      </Form.Field>
      {draft.currency === "KRW" ? null : (
        <Form.Field id="pre-estimate-fx-rate" label="환율" width="short">
          <CommaInput
            id="pre-estimate-fx-rate"
            kind="fxRate"
            value={draft.fxRate}
            dirty={draft.fxRate !== baseline.fxRate}
            error={errorOf("fxRate")}
            focusOnMount={false}
            onChange={(fxRate) => onChange({ ...draft, fxRate })}
            onKeyDown={handleKeyDown}
          />
        </Form.Field>
      )}
    </Form>
  );
}
