"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/button/Button";
import { confirmHolidayYearAction } from "./actions";
import styles from "./holidays.module.css";

// UI-SPEC S2-e: 확인 모달 없는 1차 버튼 하나. 성공하면 화면 그대로 다시 그려 버튼이
// 사라지고 상태 줄이 「확정」으로 바뀐다(토스트 없음, §7-6). 실패하면 원래 라벨 옆에
// 한 줄(§7-1 비활성 이유와 같은 자리).
export function ConfirmYear({ year }: { year: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleConfirm() {
    setPending(true);
    setFailed(false);
    try {
      const result = await confirmHolidayYearAction({ year });
      if (result?.data?.ok) {
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
    <span className={styles.confirm}>
      <Button variant="primary" pending={pending} onClick={() => void handleConfirm()}>
        {`${year}년 공휴일 확정`}
      </Button>
      {failed ? <span className={styles.confirmError}>확정 실패 · 다시 시도</span> : null}
    </span>
  );
}
