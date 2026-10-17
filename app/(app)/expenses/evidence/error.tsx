"use client";

import { useEffect } from "react";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";

// 06.1-05 — UI-SPEC Copywriting 「Error — 목록」 한 줄 + 2차 `다시 시도`(§7-7 ERROR). 틀은 `DetailScreen`(리저브 대장 · 지출결의 목록 선례).
export default function EvidenceError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <DetailScreen title="증빙">
      <ListEmpty message="증빙 목록을 불러오지 못했습니다" action={{ label: "다시 시도", onClick: retry }} tone="error" />
    </DetailScreen>
  );
}
