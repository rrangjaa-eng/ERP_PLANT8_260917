"use client";

import { useId, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import styles from "./Button.module.css";

// SYSTEM.md §7-1 버튼 위계: 1차(면) · 2차(테두리) · 3차(밑줄 텍스트).
// 한 화면에 1차는 1개만 — 호출부가 지킨다(이 컴포넌트는 강제하지 않는다).
export type ButtonVariant = "primary" | "secondary" | "tertiary";

// SYSTEM.md §7-1 개정 ⑦(DR-10) — 비활성 이유의 두 색.
export type ButtonReasonTone = "block" | "info";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> & {
  variant?: ButtonVariant;
  /** 서버 액션 대기 중 — 라벨 뒤 "…". 네이티브 disabled가 아니라 aria-disabled다(§7-1 개정 ⑦, DR-11). */
  pending?: boolean;
  /** 정적으로 비활성일 때. disabledReason 없이 disabled만 참이면 안 된다(UX-06). 네이티브 disabled가 아니라 aria-disabled다(DR-11). */
  disabled?: boolean;
  /** 비활성 사유 — 버튼 옆에 글자로 렌더되고 버튼의 aria-describedby가 그 글자를 가리킨다(§7-1). pending 중에는 렌더하지 않는다. */
  disabledReason?: string;
  /** 이유 요소의 id — 주지 않으면 내부 id. 같은 이유를 다른 비활성 버튼이 aria-describedby로 가리킬 때 준다(04-23 검토 S-3). */
  reasonId?: string;
  /** 비활성 사유의 색 — block(기본) = --danger, info = --muted(§7-1 개정 ⑦, DR-10, U-4). */
  reasonTone?: ButtonReasonTone;
  /** 단축키 표기, 라벨 오른쪽에 kbd로 병기(§7-1). */
  shortcut?: string;
  children: ReactNode;
};

// 04-15(§7-1 — 이동은 링크) — 페이지 이동을 버튼 위계로 보일 때 링크(<a>)에 같은 클래스를 준다.
export function buttonLinkClassName(variant: ButtonVariant = "secondary"): string {
  return `${styles.btn} ${styles[variant]}`;
}

export function Button({
  variant = "secondary",
  pending = false,
  disabled = false,
  disabledReason,
  reasonId: givenReasonId,
  reasonTone = "block",
  shortcut,
  children,
  className,
  type,
  "aria-describedby": ariaDescribedBy,
  onClick,
  ...rest
}: ButtonProps) {
  const inactive = pending || disabled;
  const ownReasonId = useId();
  const reasonId = givenReasonId ?? ownReasonId;
  const showReason = disabled && !pending && Boolean(disabledReason);
  const describedBy = [ariaDescribedBy, showReason ? reasonId : undefined].filter(Boolean).join(" ") || undefined;

  // 다른 요소의 이유를 aria-describedby로 가리키면 이유 글자가 이미 화면에 한 번 있다.
  if (process.env.NODE_ENV !== "production" && disabled && !pending && !disabledReason && !ariaDescribedBy) {
    // 이유 없는 비활성 버튼은 금지된다(UX-06, SYSTEM.md §7-1). 런타임 동작은 바꾸지 않고
    // 개발 중에만 알린다 — 이 파일에 예외 없이 색 리터럴을 두지 않는 것과 같은 종류의 계약.

    console.warn("[ui/button] 이유 없는 비활성 버튼은 금지된다(UX-06).");
  }

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (inactive) {
      // 비활성·진행 중 버튼은 aria-disabled라 탭 순서에 남고 포커스된다 — 클릭·Enter·
      // 폼 안 Enter 암묵 제출을 여기서 전부 취소한다(§7-1 개정 ⑦, DR-11, T-04-360).
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  return (
    <span className={styles.wrap}>
      <button
        type={type ?? "button"}
        {...rest}
        aria-disabled={inactive ? "true" : undefined}
        aria-describedby={describedBy}
        onClick={handleClick}
        className={[styles.btn, styles[variant], className].filter(Boolean).join(" ")}
      >
        <span>{children}</span>
        {pending ? <span aria-hidden="true">…</span> : null}
        {shortcut ? (
          <kbd className={variant === "primary" ? styles.kbdOnAccent : styles.kbd}>{shortcut}</kbd>
        ) : null}
      </button>
      {showReason ? (
        <span id={reasonId} className={reasonTone === "info" ? styles.reasonInfo : styles.reason}>
          {disabledReason}
        </span>
      ) : null}
    </span>
  );
}
