"use client";

import type { ReactNode } from "react";
import { usePhoneWidth } from "@/app/(app)/leave/use-phone-width";

// 폰(<700)은 읽기만(사용자 결정 2026-10-03 14:57 KST 카드 · SYSTEM §7-3 「폰에서 셀 편집 없음」) — 편집 행동은 폰에서 DOM에도 없다.
export function PcOnly({ children }: { children: ReactNode }) {
  return usePhoneWidth() ? null : <>{children}</>;
}
