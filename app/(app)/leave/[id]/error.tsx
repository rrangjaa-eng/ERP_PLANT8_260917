"use client";

import { useEffect } from "react";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { PageHeader } from "@/ui/page-header/PageHeader";

// 04.1-05 §7-7 ERROR — 본문 자리 --danger 한 줄 + 2차 `다시 시도`(retry — 서버 데이터를 다시 가져온다, B-C3).
export default function LeaveDocumentError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <PageHeader title="연차" />
      <ListEmpty message="연차 문서 불러오기 실패" action={{ label: "다시 시도", onClick: retry }} tone="error" />
    </>
  );
}
