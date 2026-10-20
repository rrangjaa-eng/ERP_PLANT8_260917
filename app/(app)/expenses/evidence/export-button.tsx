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

// emptyReasonId — 결과 0건이면 화면의 빈 줄(「조건에 맞는 증빙이 없습니다」) id. 머리줄뿐인 파일은 뜻이 없어 비활성(aria-disabled — 네이티브 disabled
// 아님 · §7-1 DR-11)이고, 이유는 이미 화면에 있는 그 줄을 가리킨다 — 버튼 옆에 같은 말을 또 쓰지 않는다(화면 사용성 원칙 · 검토 P3-5).
export function EvidenceExportButton({ query, emptyReasonId }: { query: EvidenceExportQuery; emptyReasonId?: string }) {
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
        disabled={emptyReasonId !== undefined}
        aria-describedby={emptyReasonId}
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
