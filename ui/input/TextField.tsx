"use client";

import type { InputHTMLAttributes } from "react";
import { useCommaInput } from "./use-comma-input";
import type { NumberInputKind } from "@/lib/format-number";
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
  /** 금액 입력용 우측 정렬 + tabular-nums 변형. */
  numeric?: boolean;
  /** 쉼표 입력 칸(UI-SPEC S15, 04-09) — 있으면 useCommaInput으로 렌더한다.
   * numeric은 이때 의미가 없다(항상 우측 정렬 + tabular-nums). */
  numberKind?: NumberInputKind;
};

// 훅은 조건 없이 호출해야 한다(Rules of Hooks) — numberKind 유무로 다른
// 컴포넌트를 고르는 디스패처만 훅 없이 두고, 각 변형이 자기 훅만 무조건 부른다.
export function TextField(props: TextFieldProps) {
  if (props.numberKind) {
    return <CommaTextField {...props} numberKind={props.numberKind} />;
  }
  return <PlainTextField {...props} />;
}

function PlainTextField({ id, label, error, numeric = false, className, ...rest }: TextFieldProps) {
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

// C-02·C-20 — 보이는 입력 칸엔 name을 붙이지 않는다(쉼표 섞인 표시 텍스트가
// FormData로 그대로 나가면 서버 z.coerce.number가 못 읽는다). name이 있으면
// 같은 name의 hidden 입력이 쉼표 없는 rawValue를 대신 싣는다.
function CommaTextField({
  id,
  label,
  error: externalError,
  className,
  numberKind,
  name,
  defaultValue,
  ...rest
}: TextFieldProps & { numberKind: NumberInputKind }) {
  const initial = defaultValue === undefined || defaultValue === null ? "" : String(defaultValue);
  const { inputRef, value, onChange, error: commaError, rawValue } = useCommaInput(numberKind, initial);
  const errorId = `${id}-error`;
  const error = commaError ?? externalError;

  return (
    <div className={styles.row}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={styles.field}>
        <input
          id={id}
          {...rest}
          ref={inputRef}
          type="text"
          inputMode={numberKind === "krw" ? "numeric" : "decimal"}
          value={value}
          onChange={onChange}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={[styles.input, styles.numeric, error ? styles.inputError : "", className]
            .filter(Boolean)
            .join(" ")}
        />
        {name ? <input type="hidden" name={name} value={rawValue} readOnly /> : null}
        {error ? (
          <p id={errorId} className={styles.error}>
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
