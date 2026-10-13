"use client";

import { useEffect } from "react";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { ListScreen } from "@/ui/list-screen/ListScreen";

// 06-21(UI-SPEC S17 error · Copywriting 「Error — 목록 로드」 · C13 명사형) — 목록 자리 한 줄 + 2차 `다시 시도`.
// Next.js 16 오류 경계 props `{ error, retry }`(node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md).
export default function IssueRequestsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ListScreen title="발행 요청">
      <ListEmpty message="발행 요청 목록 불러오지 못함" action={{ label: "다시 시도", onClick: retry }} tone="error" />
    </ListScreen>
  );
}
