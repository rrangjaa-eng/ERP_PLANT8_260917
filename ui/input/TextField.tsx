import type { InputHTMLAttributes } from "react";
import styles from "./TextField.module.css";

// SYSTEM.md §7-2 입력 · 오류 표시, §10 접근성 계약.
export type TextFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "aria-invalid" | "aria-describedby"
> & {
  id: string;
  label: string;
  /** 서버 검증 오류 문자열 — next-safe-action의 validationErrors 필드값을 그대로 넣는다. */
  error?: string;
  /** 금액 입력용 우측 정렬 + tabular-nums 변형. 이 페이즈에서는 쓰지 않는다. */
  numeric?: boolean;
};

export function TextField({ id, label, error, numeric = false, className, ...rest }: TextFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div className={styles.row}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={styles.field}>
        <input
          id={id}
          {...rest}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={[styles.input, numeric ? styles.numeric : "", error ? styles.inputError : "", className]
            .filter(Boolean)
            .join(" ")}
        />
        {error ? (
          <p id={errorId} className={styles.error}>
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
