"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/ui/toast/Toast";

// 04.2-UI-SPEC S2-d SUCCESS — 화면이 바뀌는 폼이라 이동 + 토스트 한 개(§7-6). 닫히면
// 주소에서 `added`를 떼어 새로 고침·뒤로 가기가 토스트를 다시 띄우지 않게 한다.
export function AddedToast({ date, year }: { date: string; year: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <Toast
      message={`공휴일 추가 · ${date} 추가됨`}
      onDismiss={() => {
        setOpen(false);
        router.replace(`/admin/holidays?year=${year}`);
      }}
    />
  );
}
