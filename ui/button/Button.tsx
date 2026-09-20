import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

// SYSTEM.md §7-1 버튼 위계: 1차(면) · 2차(테두리) · 3차(밑줄 텍스트).
// 한 화면에 1차는 1개만 — 호출부가 지킨다(이 컴포넌트는 강제하지 않는다).
export type ButtonVariant = "primary" | "secondary" | "tertiary";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> & {
  variant?: ButtonVariant;
  /** 서버 액션 대기 중 — 라벨 뒤 "…", 스피너 없음(§7-1 진행 중 규칙). */
  pending?: boolean;
  /** 정적으로 비활성일 때. disabledReason 없이 disabled만 참이면 안 된다(UX-06). */
  disabled?: boolean;
  /** 비활성 사유 — 버튼 옆에 글자로 렌더된다(§7-1). pending 중에는 렌더하지 않는다. */
  disabledReason?: string;
  /** 단축키 표기, 라벨 오른쪽에 kbd로 병기(§7-1). */
  shortcut?: string;
  children: ReactNode;
};

export function Button({
  variant = "secondary",
  pending = false,
  disabled = false,
  disabledReason,
  shortcut,
  children,
  className,
  type,
  ...rest
}: ButtonProps) {
  const isDisabled = pending || disabled;

  if (process.env.NODE_ENV !== "production" && disabled && !pending && !disabledReason) {
    // 이유 없는 비활성 버튼은 금지된다(UX-06, SYSTEM.md §7-1). 런타임 동작은 바꾸지 않고
    // 개발 중에만 알린다 — 이 파일에 예외 없이 색 리터럴을 두지 않는 것과 같은 종류의 계약.

    console.warn("[ui/button] 이유 없는 비활성 버튼은 금지된다(UX-06).");
  }

  return (
    <span className={styles.wrap}>
      <button
        type={type ?? "button"}
        {...rest}
        disabled={isDisabled}
        className={[styles.btn, styles[variant], className].filter(Boolean).join(" ")}
      >
        <span>{children}</span>
        {pending ? <span aria-hidden="true">…</span> : null}
        {shortcut ? (
          <kbd className={variant === "primary" ? styles.kbdOnAccent : styles.kbd}>{shortcut}</kbd>
        ) : null}
      </button>
      {isDisabled && !pending && disabledReason ? <span className={styles.reason}>{disabledReason}</span> : null}
    </span>
  );
}
