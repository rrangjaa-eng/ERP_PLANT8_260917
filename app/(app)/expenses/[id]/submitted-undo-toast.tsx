"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/ui/toast/Toast";
import { withdrawExpenseAction } from "../actions";

// 05-09(UI-SPEC 확정 #2 · Copywriting 「SUCCESS — 토스트」 · 「거부 — 늦은 되돌리기」 · 「Error — 행동 실패」): 제출 · 다시 제출 착지 토스트의
// 3차 `되돌리기` = 확인 없는 즉시 회수(토스트가 가진 차수만 보낸다). 성공하면 같은 주소가 폼으로 다시 그려지고 `되돌리기 · 결재 멈춤`.
// 서버 거부는 문구의 마지막 ` · ` 뒤가 3차(`문서에서 회수` → 문서 화면 · `새로 고침`)인 오류 토스트, 네트워크 · 서버 실패는 `되돌리기 실패 · 되돌리기`.

// 3차가 하는 일 — 되돌리기(회수 한 번 더) 또는 서버가 말한 다음 행동(문서 화면으로 · 새로 고침 — 둘 다 이 문서 주소를 새로 그린다).
type Shown = { message: string; tone: "default" | "error"; actionLabel: string; does: "undo" | "reload" };

export function SubmittedUndoToast({ expenseId, round, message }: { expenseId: string; round: number; message: string }) {
  const router = useRouter();
  const here = `/expenses/${expenseId}`;
  const [shown, setShown] = useState<Shown | null>({ message, tone: "default", actionLabel: "되돌리기", does: "undo" });
  // 누른 즉시 켜는 동기 ref — 연타가 회수를 두 번 보내지 않는다(첫 렌더의 클로저도 같은 ref를 본다).
  const busyRef = useRef(false);

  function failed() {
    setShown({ message: "되돌리기 실패", tone: "error", actionLabel: "되돌리기", does: "undo" });
  }

  async function undo() {
    if (busyRef.current) return;
    busyRef.current = true;
    let result: Awaited<ReturnType<typeof withdrawExpenseAction>>;
    try {
      result = await withdrawExpenseAction({ expenseId, undo: true, round });
    } catch {
      busyRef.current = false;
      failed();
      return;
    }
    if (result?.data) {
      router.replace(`${here}?undone=1`);
      return;
    }
    busyRef.current = false;
    const text = result?.serverError;
    const cut = text ? text.lastIndexOf(" · ") : -1;
    if (!text || cut < 0) {
      failed();
      return;
    }
    setShown({ message: text.slice(0, cut), tone: "error", actionLabel: text.slice(cut + 3), does: "reload" });
  }

  function reload() {
    setShown(null);
    router.replace(here);
    router.refresh();
  }

  if (!shown) return null;
  return (
    <Toast
      message={shown.message}
      tone={shown.tone}
      actionLabel={shown.actionLabel}
      onAction={shown.does === "undo" ? () => void undo() : reload}
      onDismiss={() => {
        setShown(null);
        router.replace(here);
      }}
    />
  );
}
