"use client";

import { useEffect } from "react";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";

// 04-UI-SPEC Copywriting Contract "Error — 목록" — 전역 app/(app)/error.tsx의
// 일반 문구 대신 이 화면 전용 문구를 쓴다(같은 패턴, §7-7 ERROR 행). 틀은 `DetailScreen`(UI Considerations error).
export default function ProjectsError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <DetailScreen title="프로젝트">
      <ListEmpty
        message="프로젝트 목록 불러오기 실패"
        action={{ label: "다시 시도", onClick: retry }}
        tone="error"
      />
    </DetailScreen>
  );
}
