"use client";

import { useState, type ReactNode, type SelectHTMLAttributes } from "react";
import styles from "./Select.module.css";

// SYSTEM.md §7-15 — 네이티브 `<select>` 래퍼. 커스텀 드롭다운을 만들지
// 않는다(§7-2). 고를 것이 없으면(옵션 0개) 첫 옵션이 em dash(`—`)이고
// 제출이 막힌다 — 이유는 호출부의 `Form.Actions`가 쓴다. 자동완성은
// 값의 출처가 서버가 보낸 목록뿐이라는 사실과 브라우저 네이티브 타이핑
// 점프로 성립한다(⑨의 계획 단계 판단, 새 컴포넌트를 만들지 않는다).
// 04-25(D-93 · S14): 코드표 값이면 옵션이 설명을 싣고 온다 — 고른 값의
// 설명을 컨트롤 바로 아래 한 줄로 보인다. `<option>` 안에는 넣지 않는다.
export type SelectOption = { value: string; label: string; description?: string | null };

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "children"> & {
  id: string;
  options: SelectOption[];
  error?: string;
};

// `Form.Hint`와 같은 모양(`--fs-sm --muted`) 한 줄. 공용 `Select`로 아직
// 옮기지 않은 관리자 폼의 네이티브 select(거래처 기본 증빙 종류 — 이관은
// Phase 7, A-H2)도 같은 줄을 붙이려고 내보낸다.
export function SelectHint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className={styles.hint}>
      {children}
    </p>
  );
}

export function Select({ id, options, error, className, onChange, ...rest }: SelectProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  // 제어·비제어 둘 다 — 제어면 `value`가, 비제어면 고른 값을 따라가는 로컬
  // 상태가 지금 값이다. 설명이 없거나 오류가 있으면 힌트가 없다(오류가 이긴다).
  const [uncontrolledValue, setUncontrolledValue] = useState(String(rest.defaultValue ?? ""));
  const currentValue = rest.value !== undefined ? String(rest.value) : uncontrolledValue;
  const description = error ? null : options.find((option) => option.value === currentValue)?.description;

  return (
    <>
      <select
        id={id}
        {...rest}
        onChange={(event) => {
          setUncontrolledValue(event.target.value);
          onChange?.(event);
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : description ? hintId : undefined}
        className={[styles.select, error ? styles.selectError : "", className].filter(Boolean).join(" ")}
      >
        <option value="">—</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      ) : description ? (
        <SelectHint id={hintId}>{description}</SelectHint>
      ) : null}
    </>
  );
}
