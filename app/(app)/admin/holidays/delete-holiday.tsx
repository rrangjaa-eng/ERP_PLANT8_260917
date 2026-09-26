"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/button/Button";
import { deleteHolidayAction } from "./actions";
import { useDeleteUndo } from "./delete-undo";
import styles from "./holidays.module.css";

// 04.2-UI-SPEC S2-f — 행 동작 칸의 3차 `삭제` 하나. 누르면 바로 지운다(확인 단계 없음).
// 성공하면 서버가 표·상태 줄을 다시 그리고(옮겨진 대체공휴일 포함, 토스트 없음) 결과
// 줄이 선다. 실패하면 그 행에만 실패 문구. 되돌리기로 돌아온 행이면 포커스를 받는다.
export function DeleteHoliday({ id, date }: { id: string; date: string }) {
  const router = useRouter();
  const { show, focusDate, clearFocus } = useDeleteUndo();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [restored] = useState(() => focusDate === date);

  // 되돌린 행이 포커스를 받았으면 표식을 지운다(다른 행이 다시 받지 않게).
  useEffect(() => {
    if (restored) clearFocus();
  }, [restored, clearFocus]);

  async function handleDelete() {
    setPending(true);
    setFailed(false);
    try {
      const result = await deleteHolidayAction({ id });
      if (result?.data) {
        if (result.data.deleted) {
          show({ date: result.data.date, name: result.data.name, kind: result.data.kind });
        }
        router.refresh();
        return;
      }
    } catch {
      // 연결이 끊긴 경우 — 아래에서 실패 줄을 보인다.
    }
    setPending(false);
    setFailed(true);
  }

  return (
    <span className={styles.rowAction}>
      <Button variant="tertiary" pending={pending} autoFocus={restored} onClick={() => void handleDelete()}>
        삭제
      </Button>
      {failed ? <span className={styles.rowError}>삭제하지 못했습니다 · 다시 시도</span> : null}
    </span>
  );
}
