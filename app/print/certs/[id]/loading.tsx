import styles from "./print-cert.module.css";

// 04.3-11 — §7-7 인쇄 라우트 LOADING: 빈 A4 틀 + 상단 진행 바, 스피너 없음. 인쇄 미디어에서는 준비 전 한 줄만 찍힌다.
export default function CertPrintLoading() {
  return (
    <main className={styles.root}>
      <div className={styles.progress} aria-hidden="true" />
      <div className={styles.sheet} aria-hidden="true" />
      <p className={styles.notReady}>인쇄물이 아직 준비되지 않았습니다 · 화면이 다 뜬 뒤 다시 인쇄해 주세요</p>
    </main>
  );
}
