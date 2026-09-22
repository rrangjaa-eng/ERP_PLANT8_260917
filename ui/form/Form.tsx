import type { FormHTMLAttributes, ReactNode } from "react";
import styles from "./Form.module.css";

// SYSTEM.md §7-15 — 폼 컴포넌트 계약(Phase 4 신설). 사용처 둘: 프로젝트
// 등록 폼 · 매출 계약 금액 칸(04-02). `<form noValidate>` + 한 열,
// max-width `--form-max`(720), 왼쪽 정렬. 네이티브 `required`·`pattern`
// 검증 위임을 쓰지 않는다(A-H3) — 이 파일 어디에도 그 속성이 없다.
export type FormFieldWidth = "select" | "short" | "long";

function FormRoot({ children, className, ...rest }: FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form {...rest} noValidate className={[styles.form, className].filter(Boolean).join(" ")}>
      {children}
    </form>
  );
}

// 칸 폭 3종만: select 200 · 짧은 칸(금액·날짜·수량·환율) 280 · 긴 칸(이름·비고) 480.
function FormField({
  id,
  label,
  width = "long",
  children,
}: {
  id: string;
  label: string;
  width?: FormFieldWidth;
  children: ReactNode;
}) {
  return (
    <div className={styles.row}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={[styles.control, styles[width]].join(" ")}>{children}</div>
    </div>
  );
}

// 서버 계산 값의 자리(§6-3) — 읽기 전용 행을 따로 두지 않는다.
function FormHint({ children }: { children: ReactNode }) {
  return <p className={styles.hint}>{children}</p>;
}

// 서버 필드 오류 한 줄 — 「원인 · 다음 행동」. `aria-describedby`가 이 id를 가리킨다.
function FormError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className={styles.error}>
      {children}
    </p>
  );
}

// 폼 맨 아래 한 줄 — 1차(제출) + 막힘 이유 + 2차. **폼이 자기 제출을 가질
// 때만 둔다**(§7-15 일반 규칙) — 화면의 1차 「일괄 저장」에 합류하는 칸
// (예: 매출 계약 금액, 04-02)은 이 컴포넌트를 쓰지 않는다.
function FormActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}

export const Form = Object.assign(FormRoot, {
  Field: FormField,
  Hint: FormHint,
  Error: FormError,
  Actions: FormActions,
});
