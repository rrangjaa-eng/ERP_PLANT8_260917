"use client";

import { useEffect } from "react";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";

// 07-21(U16 · UI-SPEC SC-13 ERROR · 공통 계약 4): 조직 화면 전용 실패 줄 + `다시 시도`(`projects/error.tsx` 꼴).
export default function OrgError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <DetailScreen title="조직">
      <ListEmpty message="불러오지 못했습니다 · 다시 시도" action={{ label: "다시 시도", onClick: retry }} tone="error" />
    </DetailScreen>
  );
}
