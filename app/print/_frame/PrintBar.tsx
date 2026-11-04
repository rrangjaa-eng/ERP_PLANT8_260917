"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/ui/button/Button";
import { recordDocumentPrintAction } from "./actions";
import styles from "./print-frame.module.css";

type Kind = "expense" | "leave" | "settlement";

// 닫히지 않는 창(로그인 리디렉트 등으로 열린 창)에서는 그 서류의 상세 화면으로 간다.
const DETAIL_HREF: Record<Kind, (id: string) => string> = {
  expense: (id) => `/expenses/${id}`,
  leave: (id) => `/leave/${id}`,
  settlement: (id) => `/projects/${id}/settlement`,
};

// 5초 안의 beforeprint 재발생 · 재클릭은 한 번의 인쇄로 합친다(D-7415). 모듈 변수라 한 탭 안에서만 유지된다.
const COALESCE_MS = 5000;
let lastRecordedAt: number | null = null;

// 인쇄 기록은 화면에 아무것도 띄우지 않는다 — 결과 · 오류를 읽지 않는다(UI-SPEC 재량 8).
function record(kind: Kind, id: string): void {
  const now = Date.now();
  if (lastRecordedAt !== null && now - lastRecordedAt < COALESCE_MS) return;
  lastRecordedAt = now;
  void recordDocumentPrintAction({ kind, id }).catch(() => undefined);
}

// 07.4-01 D-7409: 인쇄 시작 갈래 A — 열면 자동으로 한 번 인쇄한다(SYSTEM §6-6 트리거 줄). 서버 액션 요청이 인쇄 미리보기가
// 렌더러를 멈추기 전에 나가도록 window.print()는 동기로 부르지 않고 다음 틱에 부른다.
export function PrintBar({ kind, id }: { kind: Kind; id: string }) {
  const started = useRef(false);

  useEffect(() => {
    const onBeforePrint = () => record(kind, id);
    window.addEventListener("beforeprint", onBeforePrint);
    return () => window.removeEventListener("beforeprint", onBeforePrint);
  }, [kind, id]);

  // 개발 모드 이중 효과에도 한 번이다 — ref는 재마운트에도 남는다.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    record(kind, id);
    setTimeout(() => window.print(), 0);
  }, [kind, id]);

  function print() {
    record(kind, id);
    setTimeout(() => window.print(), 0);
  }

  function close() {
    window.close();
    setTimeout(() => {
      if (!window.closed) window.location.assign(DETAIL_HREF[kind](id));
    }, 0);
  }

  return (
    <div className={styles.bar}>
      <Button variant="tertiary" onClick={close}>
        닫기
      </Button>
      <Button variant="primary" onClick={print}>
        인쇄 · PDF 저장
      </Button>
    </div>
  );
}
