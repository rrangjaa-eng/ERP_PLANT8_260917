"use client";

import { useEffect, useState } from "react";
import { Button } from "@/ui/button/Button";
import { QR_SECTION_LABEL_ID } from "./prize-table-rules";
import styles from "./event-detail.module.css";

// 04.3-04 Task 4 ② — I3 QR 섹션. 접수 중이면 서버가 만든 SVG(currentColor — 토큰 --text-strong · --surface-base만) + 전체 링크 +
// 3차 「링크 복사」(라벨 자리 `링크 복사됨` 4초, 토스트 없음). 닫힘이면 QR · 링크를 그리지 않고 사유 한 줄.
// 인라인 SVG는 서버가 서버 토큰 링크로만 만든 문자열이다 — 사용자 입력이 섞이지 않는다(T-04.3-31).
// QR 내려받기 · 인쇄 버튼 없음(A8).
const COPIED_MS = 4000;

export function QrSection(props: { eventName: string; qrSvg: string; link: string } | { closedLine: string }) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (copy !== "copied") return;
    const timer = setTimeout(() => setCopy("idle"), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copy]);

  if ("closedLine" in props) {
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>QR</h2>
        <p className={styles.closedLine}>{props.closedLine}</p>
      </section>
    );
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  return (
    <section className={styles.section}>
      <h2 id={QR_SECTION_LABEL_ID} tabIndex={-1} className={styles.sectionLabel}>
        QR
      </h2>
      <div role="img" aria-label={`${props.eventName} 확인증 QR`} className={styles.qr} dangerouslySetInnerHTML={{ __html: props.qrSvg }} />
      <div className={styles.linkRow}>
        <span className={styles.link}>{props.link}</span>
        {/* 버튼은 그대로 두고 라벨 자리만 바꾼다 — 누른 뒤 포커스가 버튼에 남는다. status는 처음부터 빈 채로 둔다. */}
        <Button variant="tertiary" onClick={() => void copyLink(props.link)}>
          {copy === "copied" ? <span className={styles.copied}>링크 복사됨</span> : "링크 복사"}
        </Button>
        <span role="status" className={copy === "failed" ? styles.copyFailed : "sr-only"}>
          {copy === "copied" ? "링크 복사됨" : copy === "failed" ? "복사 실패 · 링크를 길게 눌러 복사" : ""}
        </span>
      </div>
    </section>
  );
}
