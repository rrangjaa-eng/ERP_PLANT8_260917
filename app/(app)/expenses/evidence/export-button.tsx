"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/ui/button/Button";
import { Toast } from "@/ui/toast/Toast";
import { exportEvidenceRecordsAction } from "./actions";

// 06.1-13 G6(RP-16) — 증빙 목록 필터 줄 2차 `파일 받기`(SYSTEM §6-1 필터 줄 · SP-65-2). 확인 창 없이 바로 받는다(되돌릴 일이 없는 읽기).
// 서버가 지금 거르개 · 범위 안 전체를 다시 읽어 CSV 하나를 돌려준다 — 화면이 가진 줄로 짓지 않는다. 실패는 토스트(06.5 `이체 파일 받기` 꼴).
export type EvidenceExportQuery = { state: string; type: string; period: string; batch?: string };

const FAILED = "파일 받기 · 실패 · 다시 시도";

export function EvidenceExportButton({ query }: { query: EvidenceExportQuery }) {
  const [failed, setFailed] = useState(false);
  const { execute, isExecuting } = useAction(exportEvidenceRecordsAction, {
    onSuccess: ({ data }) => {
      if (!data) {
        setFailed(true);
        return;
      }
      // React Flight가 긴 글자의 맨 앞 BOM을 떼어 낼 수 있다 — 없으면 다시 붙인다(행동 로그 내보내기 꼴 · Excel 한글).
      const body = data.body.startsWith("﻿") ? data.body : `﻿${data.body}`;
      const url = URL.createObjectURL(new Blob([body], { type: data.contentType }));
      const link = document.createElement("a");
      link.href = url;
      link.download = data.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
    onError: () => setFailed(true),
  });

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        pending={isExecuting}
        onClick={() => {
          setFailed(false);
          execute(query);
        }}
      >
        파일 받기
      </Button>
      {failed ? <Toast message={FAILED} tone="error" onDismiss={() => setFailed(false)} /> : null}
    </>
  );
}
