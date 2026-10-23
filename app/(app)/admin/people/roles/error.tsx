"use client";

import { useEffect } from "react";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";

// 07-21(U16 · UI-SPEC SC-09 ERROR · 공통 계약 4): 계급 화면 전용 실패 줄 + `다시 시도`(`projects/error.tsx` 꼴).
export default function RolesError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <DetailScreen title="계급">
      <ListEmpty message="계급 불러오기 실패" action={{ label: "다시 시도", onClick: retry }} tone="error" />
    </DetailScreen>
  );
}
