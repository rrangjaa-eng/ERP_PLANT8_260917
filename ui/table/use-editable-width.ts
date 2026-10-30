"use client";

import { useSyncExternalStore } from "react";

// 04-49(DR-14 · DR-36 · 계약 6) — 표 폭 판정. 서버는 폭을 모르므로 서버 스냅숏은 참(PC 렌더가 기본)이고, 좁은 화면은
// 수화 뒤 한 번 바뀐다. 견적 표·매출 표(그리고 그룹 B의 리저브 대장)가 같은 기준을 쓴다.
export type TableBreakpoint = 1024 | 1280;

function subscribeTo(query: string) {
  return (onChange: () => void) => {
    const media = window.matchMedia(query);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  };
}

const SUBSCRIBE: Record<TableBreakpoint, (onChange: () => void) => () => void> = {
  1024: subscribeTo("(min-width: 1024px)"),
  1280: subscribeTo("(min-width: 1280px)"),
};

/** 뷰포트가 이 폭 이상인가(서버·수화 중에는 참). `collapseBelow` 열 숨김과 같은 판정이다. */
export function useMinWidth(breakpoint: TableBreakpoint): boolean {
  return useSyncExternalStore(
    SUBSCRIBE[breakpoint],
    () => window.matchMedia(`(min-width: ${breakpoint}px)`).matches,
    () => true,
  );
}

/** 표 편집 가능 폭(≥1024). 1024 미만에서 편집 표는 보기 전용이다(DR-36). */
export function useEditableWidth(): boolean {
  return useMinWidth(1024);
}
