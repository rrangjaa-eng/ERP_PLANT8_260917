"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/ui/toast/Toast";

// 04.3-04 Task 3 (f) — 만들기 성공은 이동 + 토스트 하나(§7-6). 닫히면 주소에서 `created`를 떼어
// 새로 고침 · 뒤로 가기가 토스트를 다시 띄우지 않게 한다(app/(app)/admin/holidays/added-toast.tsx 선례).
export function CreatedToast({ eventId, message }: { eventId: string; message: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <Toast
      message={message}
      onDismiss={() => {
        setOpen(false);
        router.replace(`/certs/events/${eventId}`);
      }}
    />
  );
}
