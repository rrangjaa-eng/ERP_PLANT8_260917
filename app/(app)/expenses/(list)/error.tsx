"use client";

import { useEffect } from "react";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";

// 05-08(UI-SPEC Copywriting 「Error — 로드」) — 지출결의 목록 전용 오류 한 줄 + 2차 `다시 시도`(projects/error.tsx 선례).
export default function ExpensesError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <DetailScreen title="지출결의">
      <ListEmpty message="지출결의 불러오기 실패" action={{ label: "다시 시도", onClick: retry }} tone="error" />
    </DetailScreen>
  );
}
