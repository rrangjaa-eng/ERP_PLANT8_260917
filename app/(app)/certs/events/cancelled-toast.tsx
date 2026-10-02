"use client";

import { useEffect, useState } from "react";
import { Toast } from "@/ui/toast/Toast";
import { clearCertCancelledToastAction } from "./actions";

// 04.3-17 검토 X4 — 「신청 취소」 착지 토스트. 이름은 서버가 쿠키에서 읽어 넘기고(주소에 없다), 뜬 뒤 그 쿠키를 지운다.
// 쿠키를 지우는 액션이 이 화면을 다시 그려 name이 비어도 토스트는 제 시간(§7-6 4초)을 채운다 — 상태가 처음 값을 들고 있다.
export function CancelledToast({ name }: { name: string | null }) {
  const [message, setMessage] = useState(name ? `신청 취소 · ${name}` : null);
  useEffect(() => {
    if (name) void clearCertCancelledToastAction();
  }, [name]);
  if (!message) return null;
  return <Toast message={message} onDismiss={() => setMessage(null)} />;
}
