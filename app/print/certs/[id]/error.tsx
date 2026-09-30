"use client";

import { useEffect } from "react";
import { Button } from "@/ui/button/Button";
import styles from "./print-cert.module.css";

// 04.3-11 — 인쇄 라우트의 서버 렌더 실패 오류 경계(codex r2 C8). 셸 밖 라우트라 app/(app)/error.tsx가 닿지 않는다.
// 예외 내용은 화면에 싣지 않고 로그에만 남긴다(T-02-18). 준비 표시를 붙이지 않으므로 인쇄 미디어에는 준비 전 한 줄만 찍힌다.
// 실패 문장은 사용자 결정 A(04.3-07 문구 대응표) — 명사형 「원인 · 다음 행동」.
export default function CertPrintError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className={styles.root}>
      <p className={styles.errorLine}>
        인쇄물 만들기 실패 ·{" "}
        <Button variant="secondary" onClick={retry}>
          다시 시도
        </Button>
      </p>
      <p className={styles.notReady}>인쇄물이 아직 준비되지 않았습니다 · 화면이 다 뜬 뒤 다시 인쇄해 주세요</p>
    </main>
  );
}
