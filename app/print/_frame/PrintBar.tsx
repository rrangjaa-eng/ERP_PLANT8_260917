"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PrintDocumentKind } from "@/domain/print/record";
import { Button } from "@/ui/button/Button";
import { Toast } from "@/ui/toast/Toast";
import { recordDocumentPrintAction } from "./actions";
import styles from "./print-frame.module.css";

// 닫히지 않는 창(로그인 리디렉트 등으로 열린 창)에서는 그 서류의 상세 화면으로 간다.
const DETAIL_HREF: Record<Exclude<PrintDocumentKind, "quote">, (id: string) => string> = {
  expense: (id) => `/expenses/${id}`,
  leave: (id) => `/leave/${id}`,
  settlement: (id) => `/projects/${id}/settlement`,
};

// 07.2-10: 견적서는 라우트 id가 차수 id라 상세 주소를 id로 만들 수 없다 — 닫기 대체 주소를 호출부가 준다(kind="quote"면 필수).
// autoPrint(기본 true)가 false면 열 때 기록 · 인쇄를 하지 않는다(D-7227 열기만으로는 보냄 아님) — 버튼 · beforeprint만 남는다.
// failureToast(기본 false)가 true면 기록 실패를 오류 토스트로 알린다(견적서 — 보냄 배지는 사용자가 보는 업무 기록이라 D-7228). 세 서류는 결과를 읽지 않는다.
type PrintBarProps = { id: string; autoPrint?: boolean; failureToast?: boolean } & ({ kind: Exclude<PrintDocumentKind, "quote">; closeHref?: string } | { kind: "quote"; closeHref: string });

// 5초 안의 beforeprint 재발생 · 재클릭은 한 번의 인쇄로 합친다(D-7415). 모듈 변수라 한 탭 안에서만 유지된다.
const COALESCE_MS = 5000;
let lastRecordedAt: number | null = null;

// 인쇄 기록은 기본으로 화면에 아무것도 띄우지 않는다 — 결과 · 오류를 읽지 않는다(UI-SPEC 재량 8). onFail을 주면(견적서) 실패를 알린다:
// 서버 오류 · 검증 오류 · 호출이 던진 경우 합치기 시각을 비워 「인쇄 다시」가 바로 다시 기록할 수 있게 한다. 기록을 기다려 인쇄를 늦추지 않는다.
function record(kind: PrintDocumentKind, id: string, onFail?: () => void): void {
  const now = Date.now();
  if (lastRecordedAt !== null && now - lastRecordedAt < COALESCE_MS) return;
  lastRecordedAt = now;
  const failed = () => {
    lastRecordedAt = null;
    onFail?.();
  };
  void recordDocumentPrintAction({ kind, id })
    .then((result) => {
      if (onFail && (result?.serverError !== undefined || result?.validationErrors !== undefined)) failed();
    })
    .catch(() => {
      if (onFail) failed();
    });
}

// 07.4-01 D-7409: 인쇄 시작 갈래 A — 열면 자동으로 한 번 인쇄한다(SYSTEM §6-6 트리거 줄). 서버 액션 요청이 인쇄 미리보기가
// 렌더러를 멈추기 전에 나가도록 window.print()는 동기로 부르지 않고 다음 틱에 부른다.
export function PrintBar({ kind, id, autoPrint = true, failureToast = false, closeHref }: PrintBarProps) {
  const started = useRef(false);
  const [failed, setFailed] = useState(false);
  const markFailed = useCallback(() => setFailed(true), []);
  const onFail = failureToast ? markFailed : undefined;

  useEffect(() => {
    const onBeforePrint = () => record(kind, id, onFail);
    window.addEventListener("beforeprint", onBeforePrint);
    return () => window.removeEventListener("beforeprint", onBeforePrint);
  }, [kind, id, onFail]);

  // 개발 모드 이중 효과에도 한 번이다 — ref는 재마운트에도 남는다.
  useEffect(() => {
    if (!autoPrint || started.current) return;
    started.current = true;
    record(kind, id);
    setTimeout(() => window.print(), 0);
  }, [kind, id, autoPrint]);

  function print() {
    setFailed(false);
    record(kind, id, onFail);
    setTimeout(() => window.print(), 0);
  }

  function close() {
    window.close();
    setTimeout(() => {
      if (!window.closed) window.location.assign(closeHref ?? (kind === "quote" ? "/" : DETAIL_HREF[kind](id)));
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
      {failed ? <Toast tone="error" message="보냄 기록 실패" actionLabel="인쇄 다시" onAction={print} onDismiss={() => setFailed(false)} /> : null}
    </div>
  );
}
