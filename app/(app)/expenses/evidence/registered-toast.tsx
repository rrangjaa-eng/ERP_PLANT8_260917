"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { evidenceReturnHref } from "@/lib/evidence-return";
import { Toast } from "@/ui/toast/Toast";

// 06.1-09 S8 대리 등록 착지(`?registered={카드 사용 id}`) — 06 토스트 글자 `카드 사용 등록 · {합계}`(UI-SPEC Copywriting). 닫히면 주소창 글자 그대로에서 registered만 걷는다.
export function RegisteredToast({ message }: { message: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <Toast
      message={message}
      onDismiss={() => {
        setOpen(false);
        router.replace(evidenceReturnHref(window.location.pathname + window.location.search), { scroll: false });
      }}
    />
  );
}
