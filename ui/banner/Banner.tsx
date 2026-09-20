import type { ReactNode } from "react";
import styles from "./Banner.module.css";

// SYSTEM.md §7-11 배너. 위치(화면 제목 위, D③)·개수 상한(화면당 1개, D②)은
// 호출부 책임 — 이 컴포넌트는 등급별 색과 ARIA 역할만 고정한다. 닫기 버튼 없음
// (D①, 조건이 사라질 때까지 지속). §7-11 등급 대조표:
//   등급 "안내"(role="status") — 예: 임시 비밀번호 사용 중(§6-3/§6-7 이후 내
//     계정 화면). 이전 app/(app)/account/page.tsx가 쓰던 role="status"와 대응.
//   등급 "경고"(role="alert", --warning/--warning-weak) — 예: DB 커넥션 한도
//     초과(§6-8). 이전 app/admin/system-status/page.tsx가 쓰던 role="alert"와
//     대응.
export type BannerKind = "info" | "warning";

const ROLE: Record<BannerKind, "status" | "alert"> = {
  info: "status",
  warning: "alert",
};

export type BannerProps = {
  kind: BannerKind;
  children: ReactNode;
};

export function Banner({ kind, children }: BannerProps) {
  return (
    <p role={ROLE[kind]} className={[styles.banner, styles[kind]].join(" ")}>
      {children}
    </p>
  );
}
