"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/ui/toast/Toast";

// 04.3-17 — 화면 이동이 따르는 행동(「신청 취소」 → 목록 · 「대조 제외」 → I′3)의 토스트는 착지 화면이 띄운다(§7-6 · 연차
// SubmittedToast 선례). 닫히면 주소에서 표시 인자를 떼어 새로 고침 · 뒤로 가기가 다시 띄우지 않게 한다.
export function LandingToast({ message, href }: { message: string; href: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <Toast
      message={message}
      onDismiss={() => {
        setOpen(false);
        router.replace(href);
      }}
    />
  );
}
