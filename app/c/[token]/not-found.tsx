import styles from "./intake.module.css";

// SYSTEM.md §6-5 E6-c — 잘못된 토큰과 플래그 꺼짐이 같은 화면으로 선다
// (행사가 있는지조차 드러나지 않는다).
export default function CertNotFound() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>링크를 찾을 수 없습니다</h1>
      <p>받은 QR이나 링크를 다시 열어 주세요 · 계속 안 되면 행사 담당자에게 알려 주세요</p>
    </main>
  );
}
