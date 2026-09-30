"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/ui/toast/Toast";

// 04.1-06 DOM 감사 #3(UI-SPEC S2 「성공하면 `/leave/[id]`로 이동 + 토스트」): 신청 폼은 화면이 바뀌므로 토스트를
// 착지 화면이 띄운다(공휴일 추가 AddedToast 선례). 닫히면 주소에서 `submitted`를 떼어 새로 고침·뒤로 가기가 다시
// 띄우지 않게 한다.
export function SubmittedToast({ message, href }: { message: string; href: string }) {
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
