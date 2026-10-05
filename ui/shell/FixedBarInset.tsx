"use client";

import { useLayoutEffect } from "react";

// 05-13 게이트 감사 D1(WCAG 2.2 2.4.11) — 폰에서 하단 탭 위에 고정된 행동 줄(`data-fixed-bar`)이 있으면 문서의
// scroll-padding-bottom을 「줄 위 끝 ~ 화면 아래 끝」(줄 높이 + 하단 탭)으로 둔다. Tab 포커스가 가는 칸이 줄 밑으로 들어가지 않는다.
// 줄 높이는 막힘 이유 · 충돌 줄로 바뀌므로 실측한다(Toast의 fixedBarTop과 같은 잣대). PC에서는 그 줄이 fixed가 아니라 0.
// 처음 그리기 전(수화 전)은 globals.css의 var() 기본값이 덮는다.
const INSET_VAR = "--fixed-bar-inset";

export function FixedBarInset() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const observed = new Set<Element>();
    const resizer = new ResizeObserver(() => measure());

    function measure(): void {
      let inset = 0;
      for (const bar of document.querySelectorAll("[data-fixed-bar]")) {
        if (!observed.has(bar)) {
          observed.add(bar);
          resizer.observe(bar);
        }
        if (getComputedStyle(bar).position !== "fixed") continue;
        const rect = bar.getBoundingClientRect();
        if (rect.height === 0) continue;
        inset = Math.max(inset, root.clientHeight - rect.top);
      }
      for (const bar of observed) {
        if (!bar.isConnected) {
          resizer.unobserve(bar);
          observed.delete(bar);
        }
      }
      const value = inset > 0 ? `${Math.ceil(inset)}px` : "";
      if (root.style.getPropertyValue(INSET_VAR) === value) return;
      if (value) root.style.setProperty(INSET_VAR, value);
      else root.style.removeProperty(INSET_VAR);
    }

    measure();
    const mutations = new MutationObserver(measure);
    mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", measure);
    return () => {
      mutations.disconnect();
      resizer.disconnect();
      window.removeEventListener("resize", measure);
      root.style.removeProperty(INSET_VAR);
    };
  }, []);

  return null;
}
