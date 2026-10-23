"use client";

import { useEffect } from "react";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";

// K18 — 규칙 조회가 실패하면 이 화면 전용 한 줄 + 3차 `다시 시도`(같은 조회 재요청). 예외 내용은 화면에 싣지 않는다(T-02-18) — 로그에만.
export default function NotificationRulesError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <DetailScreen title="알림 규칙">
      <ListEmpty message="불러오지 못했습니다 · 다시 시도" action={{ label: "다시 시도", onClick: retry }} tone="error" />
    </DetailScreen>
  );
}
