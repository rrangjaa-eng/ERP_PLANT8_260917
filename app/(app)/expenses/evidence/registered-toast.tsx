"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/ui/toast/Toast";

// 06.1-09 S8 대리 등록 착지(`?registered={카드 사용 id}`) — 06 토스트 글자 `카드 사용 등록 · {합계}`(UI-SPEC Copywriting). 닫히면 쿼리를 걷는다.
export function RegisteredToast({ message, href }: { message: string; href: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <Toast
      message={message}
      onDismiss={() => {
        setOpen(false);
        router.replace(href, { scroll: false });
      }}
    />
  );
}
