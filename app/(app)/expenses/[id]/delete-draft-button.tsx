"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/button/Button";
import { deleteExpenseDraftAction } from "../actions";
import styles from "./expense.module.css";

// 05-09(UI-SPEC S3 「머리 줄」 · Assumptions #10): 작성 중 폼 머리 줄 오른쪽 2차 `지출결의 삭제` — 확인 창 없이 즉시 소프트 삭제하고 목록으로
// 간다(되돌리기는 목록 착지 토스트). 실패는 버튼 옆 한 줄(버튼은 살아 있다). 폰에서는 머리 줄 버튼을 숨긴다(CSS 미디어 쿼리).
export function DeleteDraftButton({ expenseId, version }: { expenseId: string; version: number }) {
  const router = useRouter();
  const busyRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function remove() {
    if (busyRef.current) return;
    busyRef.current = true;
    setPending(true);
    setFailure(null);
    let result: Awaited<ReturnType<typeof deleteExpenseDraftAction>> | undefined;
    try {
      result = await deleteExpenseDraftAction({ expenseId, expectedVersion: version });
    } catch {
      result = undefined;
    }
    if (result?.data) {
      router.push(`/expenses?deleted=${result.data.expenseId}`);
      return;
    }
    busyRef.current = false;
    setPending(false);
    setFailure(result?.serverError ?? "지출결의 삭제 실패 · 다시 시도");
  }

  return (
    <span className={styles.headDelete}>
      {failure ? <span className={styles.blockedReason}>{failure}</span> : null}
      <Button variant="secondary" pending={pending} onClick={() => void remove()}>
        지출결의 삭제
      </Button>
    </span>
  );
}
