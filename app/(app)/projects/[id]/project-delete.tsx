"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RowAction } from "@/ui/row-actions/RowActions";
import { Toast } from "@/ui/toast/Toast";
import { deleteProjectAction } from "../actions";
import styles from "./project-detail.module.css";

// 07.2-17(S1 · D-7210~7212) — 머리 행동 묶음 맨 끝 위험 3차 `프로젝트 삭제`. 되돌릴 수 있는 일이라 확인 창이 없다(착지 토스트 `되돌리기`).
// 돈 문서가 붙으면 서버가 이유를 보내 aria-disabled + 옆 이유 한 줄(RowAction 규약). 판정은 서버(archiveProject)가 다시 한다.
export type ProjectDeleteProps = { projectId: string; blockedReason: string | null };

export function ProjectDelete({ projectId, blockedReason }: ProjectDeleteProps) {
  const router = useRouter();
  const busyRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function remove() {
    if (busyRef.current) return;
    busyRef.current = true;
    setPending(true);
    setFailure(null);
    let result: Awaited<ReturnType<typeof deleteProjectAction>> | undefined;
    try {
      result = await deleteProjectAction({ projectId });
    } catch {
      result = undefined;
    }
    if (result?.data) {
      router.push(`/projects?deleted=${projectId}`);
      return;
    }
    busyRef.current = false;
    setPending(false);
    // /review #2: 서버가 거부한 말(돈 문서 N건 연결 · 삭제 불가 등)은 그대로 — 네트워크 실패만 다시 시도를 시킨다.
    setFailure(result?.serverError ?? "삭제 실패 · 다시 시도");
  }

  return (
    <span className={styles.deleteSlot}>
      {blockedReason ? (
        <RowAction danger disabled disabledReason={blockedReason} onClick={() => undefined}>
          프로젝트 삭제
        </RowAction>
      ) : (
        <RowAction danger pending={pending} onClick={() => void remove()}>
          프로젝트 삭제
        </RowAction>
      )}
      {failure ? <Toast message={failure} tone="error" onDismiss={() => setFailure(null)} /> : null}
    </span>
  );
}
