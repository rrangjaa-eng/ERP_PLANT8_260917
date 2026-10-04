"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/ui/toast/Toast";
import { restoreExpenseDraftAction } from "./actions";

// 05-09(UI-SPEC Copywriting 「SUCCESS — 토스트」): 작성 중 삭제 착지(`/expenses?deleted={id}`) — `지출결의 삭제` + 3차 `되돌리기`(되살려 폼으로).
// 그 사이 같은 줄에 새 작성 중 문서가 생겼으면 서버가 그 문서 id를 준다(그 문서를 연다). 실패는 오류 토스트 `되돌리기 실패 · 되돌리기`.
export function DeletedToast({ expenseId, href }: { expenseId: string; href: string }) {
  const router = useRouter();
  const busyRef = useRef(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(true);

  async function restore() {
    if (busyRef.current) return;
    busyRef.current = true;
    let result: Awaited<ReturnType<typeof restoreExpenseDraftAction>> | undefined;
    try {
      result = await restoreExpenseDraftAction({ expenseId });
    } catch {
      result = undefined;
    }
    if (result?.data) {
      router.push(`/expenses/${result.data.expenseId}`);
      return;
    }
    busyRef.current = false;
    setFailed(true);
  }

  if (!open) return null;
  return (
    <Toast
      message={failed ? "되돌리기 실패" : "지출결의 삭제"}
      tone={failed ? "error" : "default"}
      actionLabel="되돌리기"
      onAction={() => void restore()}
      onDismiss={() => {
        setOpen(false);
        router.replace(href);
      }}
    />
  );
}
