"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/ui/button/Button";
import { TextField } from "@/ui/input/TextField";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { Num } from "@/ui/num/Num";
import styles from "./HistoryList.module.css";

// SYSTEM.md §7-14 — 이력형 설정 값(03-04)과 사람 폼의 팀 소속 발령일 이력(03-05,
// MAST-02)이 공유하는 컴포넌트다. `ui/`는 domain·repositories·db를 import할 수
// 없으므로(D-26) 계산된 데이터와 콜백만 받는다 — 설정 전용 낱말을 props 이름에
// 두지 않는다.
// active = 오늘 기준 유효한 행(가장 최근의 effectiveFrom <= 오늘). past = 이미
// 지나간 과거 행(적용 중이 아니다). scheduled = 미래로 예정된 행. active·past
// 둘 다 동작 칸이 비어 있다 — 취소는 scheduled에만 허용된다(append-only).
export type HistoryEntryStatus = "active" | "past" | "scheduled";

export type HistoryEntry = {
  effectiveFrom: string;
  displayValue: string;
  status: HistoryEntryStatus;
};

export type HistoryValueKind =
  | { kind: "text" }
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "enum"; options: Array<{ value: string; label: string }> };

export type HistoryListProps = {
  entries: HistoryEntry[];
  valueKind: HistoryValueKind;
  onAdd: (input: { effectiveFrom: string; value: string }) => Promise<void>;
  onCancel: (effectiveFrom: string) => Promise<void>;
  isLoading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  /**
   * M-3(03-REVIEW.md): 이 화면에 HistoryList가 여러 개 동시에 렌더될 수
   * 있다(예: 설정 화면의 이력형 키마다 하나씩). "새 이력 추가" 입력의 id를
   * 여기서 만드므로, 호출부마다 서로 다른 값을 반드시 넘겨야 한다 — 겹치면
   * <label htmlFor>가 문서상 첫 번째 id에 바인딩되어 엉뚱한 입력에 포커스가
   * 간다.
   */
  idPrefix: string;
  /**
   * A-M3(§10 접근성 계약): 시각적으로 숨긴 <caption>에 쓸 표 이름. 한 화면에
   * HistoryList가 여러 개(설정 화면의 이력형 키마다 하나) 또는 다른 의미(사람
   * 상세의 소속 발령 이력)로 렌더될 수 있어 컴포넌트가 이름을 지어낼 수 없다 —
   * idPrefix와 같은 이유로 호출부가 넘긴다.
   */
  caption: string;
  /** 07-17 R15 · F24 감사 P1 — 거짓이면 쓰기(「새 이력 추가」 · 예정 줄 「취소」)를 그리지 않는다(상한 밖 · 퇴직자 · 보기만처럼 쓸 수 없는 화면). 기본 참. */
  canAdd?: boolean;
};

function defaultValueFor(kind: HistoryValueKind): string {
  if (kind.kind === "boolean") return "false";
  if (kind.kind === "enum") return kind.options[0]?.value ?? "";
  return "";
}

function ValueInput({
  kind,
  value,
  onChange,
  idPrefix,
}: {
  kind: HistoryValueKind;
  value: string;
  onChange: (next: string) => void;
  idPrefix: string;
}) {
  if (kind.kind === "boolean") {
    return (
      <label className={styles.addCheckboxLabel}>
        값
        <input
          type="checkbox"
          className={styles.addCheckbox}
          checked={value === "true"}
          onChange={(event) => onChange(event.target.checked ? "true" : "false")}
        />
      </label>
    );
  }
  if (kind.kind === "enum") {
    return (
      <label className={styles.addSelectLabel}>
        값
        <select
          className={styles.addSelect}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {kind.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <TextField
      id={`${idPrefix}-add-value`}
      label="값"
      type={kind.kind === "number" ? "number" : "text"}
      numeric={kind.kind === "number"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required
    />
  );
}

export function HistoryList({
  entries,
  valueKind,
  onAdd,
  onCancel,
  isLoading = false,
  errorMessage,
  onRetry,
  idPrefix,
  caption,
  canAdd = true,
}: HistoryListProps) {
  const [adding, setAdding] = useState(false);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [value, setValue] = useState<string>(() => defaultValueFor(valueKind));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [cancellingFrom, setCancellingFrom] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  function openAdd(): void {
    setValue(defaultValueFor(valueKind));
    setEffectiveFrom("");
    setSubmitError(null);
    setAdding(true);
  }

  function closeAdd(): void {
    setAdding(false);
    setSubmitError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onAdd({ effectiveFrom, value });
      closeAdd();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "저장 실패 · 다시 시도");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(entryEffectiveFrom: string): Promise<void> {
    setCancellingFrom(entryEffectiveFrom);
    setCancelError(null);
    try {
      await onCancel(entryEffectiveFrom);
    } catch (error) {
      // F24 감사 P1: 거부를 삼키지 않는다 — 추가 실패와 같은 오류 한 줄(addError)로 표 아래에 말한다.
      setCancelError(error instanceof Error ? error.message : "취소 실패 · 다시 시도");
    } finally {
      setCancellingFrom(null);
    }
  }

  if (errorMessage) {
    return (
      <ListEmpty message={errorMessage} tone="error" action={{ label: "다시 시도", onClick: () => onRetry?.() }} />
    );
  }

  if (isLoading) {
    return (
      <div className={styles.skeleton}>
        <div className={styles.skeletonRow} />
        <div className={styles.skeletonRow} />
        <div className={styles.skeletonRow} />
      </div>
    );
  }

  const addRow = adding ? (
    <tr>
      <td colSpan={4}>
        <form
          className={styles.addForm}
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") closeAdd();
          }}
        >
          <TextField
            id={`${idPrefix}-effective-from`}
            label="적용 시작일"
            type="date"
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
            required
          />
          <ValueInput kind={valueKind} value={value} onChange={setValue} idPrefix={idPrefix} />
          {submitError ? <p className={styles.addError}>{submitError}</p> : null}
          <div className={styles.addActions}>
            <Button type="button" variant="secondary" onClick={closeAdd}>
              취소 Esc
            </Button>
            <Button type="submit" variant="primary" pending={submitting}>
              새 이력 추가
            </Button>
          </div>
        </form>
      </td>
    </tr>
  ) : null;

  if (entries.length === 0 && !adding) {
    return <ListEmpty message="이 값의 이력이 없습니다" action={canAdd ? { label: "새 이력 추가", onClick: openAdd } : undefined} />;
  }

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">적용 시작일</th>
            <th scope="col" className={valueKind.kind === "number" ? styles.num : undefined}>값</th>
            <th scope="col">상태</th>
            <th scope="col">동작</th>
          </tr>
        </thead>
        <tbody>
          {addRow}
          {entries.map((entry) => (
            <tr key={entry.effectiveFrom}>
              <td>{entry.effectiveFrom}</td>
              <td className={valueKind.kind === "number" ? styles.num : undefined}>
                {valueKind.kind === "number" ? <Num value={entry.displayValue} /> : entry.displayValue}
              </td>
              <td>
                {entry.status === "active" ? (
                  <StatusTag status="적용 중" variant="text" />
                ) : entry.status === "scheduled" ? (
                  <StatusTag status="예정" variant="text" />
                ) : null}
              </td>
              <td>
                {entry.status === "scheduled" && canAdd ? (
                  <Button
                    variant="tertiary"
                    pending={cancellingFrom === entry.effectiveFrom}
                    onClick={() => {
                      void handleCancel(entry.effectiveFrom);
                    }}
                  >
                    취소
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {cancelError ? (
        <p className={styles.addError} role="alert">
          {cancelError}
        </p>
      ) : null}
      {!adding && canAdd ? (
        <div className={styles.addRowTrigger}>
          <Button variant="tertiary" onClick={openAdd}>
            새 이력 추가
          </Button>
        </div>
      ) : null}
    </div>
  );
}
