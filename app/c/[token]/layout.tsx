import type { ReactNode } from "react";
import styles from "./intake.module.css";

// UI-SPEC E1 공통 머리 — 셸 없이 상단 바만(SYSTEM.md §6-5). 실물
// docs/design/system/external-cert.html `.bar`. 열린 링크 · 닫힌 링크 ·
// 없는 링크(not-found) 모두 이 레이아웃 안에서 선다.
export default function CertIntakeLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className={styles.bar}>
        <span className={styles.mark}>
          PL<i className={styles.leaf}>A</i>NT8
        </span>
        <span className={styles.barName}>기타소득 지급 확인</span>
      </header>
      {children}
    </>
  );
}
