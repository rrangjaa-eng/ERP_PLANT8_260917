"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { revealVendorAccountNumberAction } from "./actions";
import { Button } from "@/ui/button/Button";
import styles from "./vendors.module.css";

// 03-UI-SPEC.md 「마스킹된 값의 표시와 해제」. 기본은 뒤 4자리만(masked
// prop — 서버가 lib/crypto.maskTail4로 미리 만든 문자열). 해제 가능 여부
// (canReveal)는 서버가 계산해 행마다 실어 보낸 값이다 — 권한이 없으면
// 「번호 보기」가 이유 있는 비활성이 아니라 처음부터 렌더되지 않는다(권한이
// 없다는 사실 자체를 화면에 노출하지 않는다).
export function AccountNumberCell({
  vendorId,
  masked,
  canReveal,
}: {
  vendorId: string;
  masked: string;
  canReveal: boolean;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const { execute, isExecuting, result } = useAction(revealVendorAccountNumberAction, {
    onSuccess: ({ data }) => {
      if (data) setRevealed(data.value);
    },
  });

  if (!masked) {
    return <span className={styles.masked}>—</span>;
  }

  const display = revealed ?? masked;

  return (
    <div className={styles.accountCell}>
      <span className={styles.masked}>{display}</span>
      {canReveal ? (
        <Button
          variant="tertiary"
          pending={isExecuting}
          onClick={() => {
            if (revealed !== null) {
              // 「가리기」는 클라이언트 상태만 되돌린다 — 서버를 다시 부르지
              // 않는다(재호출하면 그때마다 새 기록이 쌓인다).
              setRevealed(null);
              return;
            }
            execute({ id: vendorId });
          }}
        >
          {revealed !== null ? "가리기" : "번호 보기"}
        </Button>
      ) : null}
      {result.serverError ? <p className={styles.revealError}>번호 불러오기 실패 · 다시 시도</p> : null}
    </div>
  );
}
