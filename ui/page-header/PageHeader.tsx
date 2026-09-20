import styles from "./PageHeader.module.css";

// SYSTEM.md §6-0 화면 제목(--fs-lg)+부제(--fs-sm --muted) · §6-9 오류 제목(--fs-2xl).
// 실물: docs/design/system/preview.html:48-50 · form-expense.html:38-41 .sec 블록.
//
// 요소 선택자(전역 h1)가 아니라 컴포넌트인 이유(02-08-PLAN.md objective 결정 요약):
// (1) 실물 자체가 `.sec{...}` + `.sec h1` + `.sec .sub`라는 블록으로 모델링했다,
// 요소 규칙이 아니다. (2) 인접 선택자(h1 + p)는 구조 우연에 기댄다 — 지금도 내
// 계정 화면은 h1 다음 p가 이메일이라 부제 규칙이 그 요소를 우연히 잡을 뿐이고,
// Phase 4가 제목과 부제 사이에 도구 줄을 끼우면 조용히 풀린다. (3) 이 페이즈의
// 관례가 ui/<component>/<Name>.tsx + .module.css다(02-05 patterns-established).
//
// 우측 행동 슬롯(실물 .sec .right)은 소비자가 없어 만들지 않는다(D-25).
export type PageHeaderProps = {
  title: string;
  subtitle?: string;
  titleSize?: "lg" | "2xl";
};

export function PageHeader({ title, subtitle, titleSize = "lg" }: PageHeaderProps) {
  return (
    <div className={styles.header}>
      <h1 className={titleSize === "2xl" ? `${styles.title} ${styles.title2xl}` : styles.title}>{title}</h1>
      {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
    </div>
  );
}
