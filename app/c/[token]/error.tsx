"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/ui/button/Button";
import styles from "./intake.module.css";

// 04.3-03 Task 2a ⑥ — UI-SPEC E1 「첫 진입 실패」(서버 5xx). 상단 바는 같은
// 세그먼트의 layout.tsx가 그린다. E6-c(404 · not-found)와 섞지 않는다 — 토큰이
// 틀린 것이 아니라 서버가 답하지 못한 것이다. 오류 메시지 · digest를 화면에
// 그리지 않는다. 다시 시도는 같은 URL을 다시 불러온다(reset/retry가 아니다).
export default function CertIntakeError() {
  const leadRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    document.title = "오류 · 기타소득 지급 확인";
    leadRef.current?.focus();
  }, []);

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>기타소득 지급 확인</h1>
      <section className={styles.resultBlock}>
        <p ref={leadRef} tabIndex={-1} className={styles.resultLead}>
          확인증 화면을 불러오지 못했습니다 · 잠시 뒤 다시 시도해 주세요
        </p>
        <Button variant="tertiary" onClick={() => location.reload()}>
          다시 시도
        </Button>
      </section>
    </main>
  );
}
