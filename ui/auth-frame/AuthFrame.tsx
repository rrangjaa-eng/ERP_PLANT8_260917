import type { ReactNode } from "react";
import styles from "./AuthFrame.module.css";

// SYSTEM.md §6-7 — 셸 없는 유일한 화면(상단 바·하단 탭·「더보기」 시트가 전혀 없다).
// 워드마크 + 폼 하나를 세로로 놓는 프레임. 폰(375)·PC 공통, 가로 스크롤 없음.
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.frame}>
        <p className={styles.mark}>PLANT8</p>
        {children}
      </div>
    </div>
  );
}
