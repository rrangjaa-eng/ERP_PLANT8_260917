"use client";

import { useEffect } from "react";
import { Button } from "@/ui/button/Button";
import styles from "./print-frame.module.css";

// 07.4-01: 인쇄 라우트 서버 렌더 실패 오류 경계(확인증 error.tsx와 같은 꼴). 예외 내용은 화면에 싣지 않고 로그에만 남긴다(T-02-18).
// 준비 표시를 붙이지 않으므로 인쇄 미디어에는 준비 전 한 줄만 찍힌다. document.title은 건드리지 않는다.
export function PrintError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className={styles.root}>
      <div className={styles.errorLine}>
        <h1 className={styles.errorTitle}>인쇄물 만들기 실패 ·</h1>
        <Button variant="secondary" onClick={retry}>
          다시 시도
        </Button>
      </div>
      <p className={styles.notReady}>인쇄물이 아직 준비되지 않았습니다 · 화면이 다 뜬 뒤 다시 인쇄해 주세요</p>
    </main>
  );
}
