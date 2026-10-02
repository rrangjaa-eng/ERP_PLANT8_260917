// 04.6 스킨 A 이관 전: 화면 틀
"use client";

import { useEffect } from "react";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { PageHeader } from "@/ui/page-header/PageHeader";

// 04-42 — Copywriting 「Error — 리저브」 한 줄 + 2차 「다시 시도」(§7-7 ERROR). 문구는 명사형(DECISIONS 2026-09-26).
export default function ReservesError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <PageHeader title="리저브 대장" />
      <ListEmpty message="리저브 대장 불러오기 실패" action={{ label: "다시 시도", onClick: retry }} tone="error" />
    </>
  );
}
