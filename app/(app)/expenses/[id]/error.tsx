"use client";

import { useEffect } from "react";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";

// 05-05 §7-7 ERROR — 본문 자리 위험색 한 줄 + 2차 `다시 시도`(retry — 서버 데이터를 다시 가져온다).
export default function ExpenseError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <DetailScreen title="지출결의">
      <ListEmpty message="지출결의 불러오기 실패" action={{ label: "다시 시도", onClick: retry }} tone="error" />
    </DetailScreen>
  );
}
