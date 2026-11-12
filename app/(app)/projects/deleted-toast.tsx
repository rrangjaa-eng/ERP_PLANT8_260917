"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/ui/toast/Toast";
import { undoProjectDeleteAction } from "./actions";

// 07.2-17(S1 · D-7211) — 상세 `프로젝트 삭제` 착지(`/projects?deleted={id}`) — `프로젝트 삭제 · {번호}` + 3차 `되돌리기`(즉시 복원 · 목록에 복귀).
// 지출결의 삭제 착지(expenses/deleted-toast.tsx)와 같은 꼴. 실패는 오류 토스트 `되돌리기 실패`(닫을 때까지).
export function ProjectDeletedToast({ projectId, number }: { projectId: string; number: string }) {
  const router = useRouter();
  const busyRef = useRef(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(true);
  // DOM 감사 ② — 착지 첫 포커스를 `되돌리기`로(토스트는 4초 — Tab으로는 닿지 못한다). 공용 Toast는 그대로 두고 감싸개에서 찾는다.
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    wrapRef.current?.querySelector("button")?.focus();
  }, []);

  async function undo() {
    if (busyRef.current) return;
    busyRef.current = true;
    let result: Awaited<ReturnType<typeof undoProjectDeleteAction>> | undefined;
    try {
      result = await undoProjectDeleteAction({ projectId });
    } catch {
      result = undefined;
    }
    if (result?.data) {
      setOpen(false);
      router.replace("/projects");
      router.refresh();
      return;
    }
    busyRef.current = false;
    setFailed(true);
  }

  if (!open) return null;
  return (
    <div ref={wrapRef}>
      <Toast
        message={failed ? "되돌리기 실패" : `프로젝트 삭제 · ${number}`}
        tone={failed ? "error" : "default"}
        actionLabel="되돌리기"
        onAction={() => void undo()}
        onDismiss={() => {
          setOpen(false);
          router.replace("/projects");
        }}
      />
    </div>
  );
}
