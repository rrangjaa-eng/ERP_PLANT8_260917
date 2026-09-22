import type { SelectHTMLAttributes } from "react";
import styles from "./Select.module.css";

// SYSTEM.md §7-15 — 네이티브 `<select>` 래퍼. 커스텀 드롭다운을 만들지
// 않는다(§7-2). 고를 것이 없으면(옵션 0개) 첫 옵션이 em dash(`—`)이고
// 제출이 막힌다 — 이유는 호출부의 `Form.Actions`가 쓴다. 자동완성은
// 값의 출처가 서버가 보낸 목록뿐이라는 사실과 브라우저 네이티브 타이핑
// 점프로 성립한다(⑨의 계획 단계 판단, 새 컴포넌트를 만들지 않는다).
export type SelectOption = { value: string; label: string };

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "children"> & {
  id: string;
  options: SelectOption[];
  error?: string;
};

export function Select({ id, options, error, className, ...rest }: SelectProps) {
  const errorId = `${id}-error`;

  return (
    <>
      <select
        id={id}
        {...rest}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
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
      ) : null}
    </>
  );
}
