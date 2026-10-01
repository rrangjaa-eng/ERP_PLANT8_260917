"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/ui/button/Button";
import { splitRefreshTail } from "@/ui/confirm-dialog/ConfirmDialog";
import styles from "./inbox-table.module.css";

// 04.1-05(UI-SPEC 거부 — 동시 처리): 누른 자리 옆 한 줄 — 서버가 만든 문구 + 3차 `새로 고침`(router.refresh()).
// 버튼은 ui/button 3차(폰 44 터치 · hover — /review 디자인, 손으로 만든 복제 제거). 서버 문구가 이미 `… · 새로 고침`으로 끝나면 그 끝 낱말이 버튼이다(같은 말을 두 번 쓰지 않는다). 자동 재시도 없음.
export function ConflictLine({ message }: { message: string }) {
  const router = useRouter();
  const head = splitRefreshTail(message).reason;
  return (
    <span className={styles.conflict} role="alert">
      {head} ·{" "}
      <Button variant="tertiary" onClick={() => router.refresh()}>
        새로 고침
      </Button>
    </span>
  );
}
