"use client";

import { useEffect } from "react";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { PageHeader } from "@/ui/page-header/PageHeader";

// 04-UI-SPEC Copywriting Contract "Error — 목록" — 전역 app/(app)/error.tsx의
// 일반 문구 대신 이 화면 전용 문구를 쓴다(같은 패턴, §7-7 ERROR 행).
export default function ProjectsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <PageHeader title="프로젝트" subtitle="진행 중인 프로젝트 원장" />
      <ListEmpty
        message="프로젝트 목록을 불러오지 못했습니다"
        action={{ label: "다시 시도", onClick: retry }}
        tone="error"
      />
    </>
  );
}
