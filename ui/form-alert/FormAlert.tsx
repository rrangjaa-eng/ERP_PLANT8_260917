import type { ReactNode } from "react";
import styles from "./FormAlert.module.css";

// SYSTEM.md §6-7 A②(로그인 실패) · §6-3/§6-8 ERROR 행(「한 줄 --danger」)이 공유하는
// 폼 수준 실패 문구. role="alert" p 하나 — 요소·role·텍스트 노드 구조는 기존 소비자
// (login-form.tsx · change-password-form.tsx)가 렌더하던 <p role="alert">{...}</p>와
// 같아 기존 E2E 단언(getByRole("alert") · getByText(...))이 그대로 성립한다.
// 크기는 지정하지 않는다 — §6-7이 크기를 정하지 않았으므로 body --fs-base를 상속한다.
export type FormAlertProps = {
  children: ReactNode;
};

export function FormAlert({ children }: FormAlertProps) {
  return (
    <p role="alert" className={styles.alert}>
      {children}
    </p>
  );
}
