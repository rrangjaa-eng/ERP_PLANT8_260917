"use client";

import { useSyncExternalStore } from "react";

// 폰 폭(<700) 판정 — 서버 · 수화 중에는 PC(거짓). 폰 고정 행동 줄(문서 화면 행동 줄 · 신청 폼 제출 줄)은 보이는 순서를
// CSS order가 처음부터 맞추고, 수화 뒤 DOM · Tab 순서도 2차 → 1차로 바꾼다(사용자 결정 2026-09-29 · SYSTEM §10
// 포커스 순서 = 보이는 순서). PC는 1차 → 2차.
const PHONE_QUERY = "(max-width: 699.98px)";

function subscribePhone(onChange: () => void): () => void {
  const media = window.matchMedia(PHONE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function usePhoneWidth(): boolean {
  return useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false);
}
