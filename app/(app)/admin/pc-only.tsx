import type { ReactNode } from "react";
import styles from "./pc-only.module.css";

// 폰(<700)은 읽기만(사용자 결정 2026-10-03 14:57 KST 카드 · SYSTEM §7-3 「폰에서 셀 편집 없음」) — 편집 행동은 폰에서 `display:none`이다.
// 판정은 CSS 미디어쿼리라 서버 렌더 첫 화면부터 맞는다(PC는 `display: contents`라 레이아웃에 상자를 더하지 않는다).
export function PcOnly({ children }: { children: ReactNode }) {
  return <div className={styles.pcOnly}>{children}</div>;
}

// 폰에서만 보이는 읽기 글자 — PcOnly의 짝.
export function PhoneOnly({ children }: { children: ReactNode }) {
  return <div className={styles.phoneOnly}>{children}</div>;
}
