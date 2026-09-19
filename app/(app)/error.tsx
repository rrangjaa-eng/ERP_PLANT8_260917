"use client";

import { useEffect } from "react";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";

// SYSTEM.md §6-9 오류 페이지 — 오류 경계(예외) 변종, 셸 안에서 렌더된다(C②).
// §7-7 ERROR 행: 한 줄(무엇이 안 됐다) + 다음 행동. 예외 메시지·스택은 화면에
// 노출하지 않는다(T-02-18) — 로그에만 남긴다. Next.js 16.3부터 재시도는
// retry()가 표준 API다(reset()은 남아 있지만 문서가 retry()를 권장).
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <h1>문제가 생겼습니다</h1>
      <ListEmpty message="화면을 불러오지 못했습니다" action={{ label: "다시 시도", onClick: retry }} tone="error" />
    </>
  );
}
