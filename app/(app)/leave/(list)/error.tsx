"use client";

import { useEffect } from "react";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";

// 04.1-06 §7-7 ERROR(S1) — 본문 자리 위험색 한 줄 + 2차 `다시 시도`. retry(Next 16.3)는 서버 데이터를 다시
// 가져온다(04.1-05 approvals/error.tsx 선례, B-C3). 문구는 명사형(SYSTEM §8-3 — UI-SPEC의 옛 문체를 옮기지 않는다). 틀은 `DetailScreen`(UI Considerations error).
export default function LeaveListError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <DetailScreen title="연차">
      <ListEmpty message="연차 불러오기 실패" action={{ label: "다시 시도", onClick: retry }} tone="error" />
    </DetailScreen>
  );
}
