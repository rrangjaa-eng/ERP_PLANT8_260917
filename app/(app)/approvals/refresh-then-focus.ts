"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

// 05-16 승인한 줄이 새로 고침으로 사라지면 그 줄의 DOM이 다음 줄에 재사용되어 포커스가 다음 줄의 `승인`에 남는다 — Enter를 한 번 더 누르면 다음 문서가
// 승인된다. 새로 고침이 끝난 뒤(전환 종료) 호출부가 가리킨 요소로 포커스를 옮긴다(결재함 = 다음 줄 문서 칸의 열기, 첫 화면 = 다음 줄 대상 글자 · 폰 열기).
// 가리킬 요소가 없으면 아무것도 하지 않는다(기존 동작 유지).
export function useRefreshThenFocus(): (resolveTarget: () => HTMLElement | null) => void {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const resolveRef = useRef<(() => HTMLElement | null) | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (isPending) {
      startedRef.current = true;
      return;
    }
    if (!startedRef.current) return;
    startedRef.current = false;
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.()?.focus();
  }, [isPending]);

  return (resolveTarget) => {
    resolveRef.current = resolveTarget;
    startTransition(() => router.refresh());
  };
}
