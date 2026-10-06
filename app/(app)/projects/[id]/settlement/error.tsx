"use client";

import { useEffect } from "react";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";

// 05-11 §7-7 ERROR(UI-SPEC Copywriting 「Error — 로드」 `정산 결재 불러오기 실패 · 다시 시도`) — 본문 자리 위험색 한 줄 + 2차 `다시 시도`(retry). 연차 선례.
export default function SettlementError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <DetailScreen title="정산 결재">
      <ListEmpty message="정산 결재 불러오기 실패" action={{ label: "다시 시도", onClick: retry }} tone="error" />
    </DetailScreen>
  );
}
