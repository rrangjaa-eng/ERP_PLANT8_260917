"use client";

import { useRef, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/ui/button/Button";
import { useEditableWidth } from "@/ui/table/use-editable-width";
import type { VendorSide } from "@/domain/vendors/kind";
import { exportVendorsCsvAction } from "./actions";
import styles from "./vendors.module.css";

// 07-20 V1 · K12 · D-736 — 거래처 목록 필터 줄 끝 2차 `파일 받기`(SYSTEM §6-1 필터 줄 · 증빙 `파일 받기` 꼴). 편집 폭(≥1024)에서만 그린다 —
// 폰 · 태블릿 세로에는 없다(K12). 서버가 지금 거르개 전체를 다시 읽어 CSV 하나를 돌려준다(domain/vendors/export.ts).
// 상태(SC-16 · Round 2 U16 · U6): 생성 중 = 그 버튼 aria-busy · aria-disabled(다시 누름 무시), 성공 = 브라우저 내려받기뿐(결과 줄 · 토스트 없음),
// 실패 = 버튼 바로 아래 오류 한 줄(토스트 아님 — 증빙 export-button.tsx의 실패 토스트는 따르지 않는다).
export type VendorExportFilter = { includeHidden: boolean; kind: VendorSide | null; q: string };

const LIMIT = 5000;
const TOO_MANY_ID = "vendors-export-limit";
const ERROR_ID = "vendors-export-error";

export function VendorExportButton({ filter, count }: { filter: VendorExportFilter; count: number }) {
  const editable = useEditableWidth();
  const [failed, setFailed] = useState(false);
  // 같은 틱의 두 번째 누름(연타)을 막는 동기 잠금 — isExecuting은 다음 렌더에야 참이 된다(공통 계약 10).
  const lockRef = useRef(false);
  const { execute, isExecuting } = useAction(exportVendorsCsvAction, {
    onSuccess: ({ data }) => {
      if (!data) {
        setFailed(true);
        return;
      }
      // React Flight가 긴 글자의 맨 앞 BOM을 떼어 낼 수 있다 — 없으면 다시 붙인다(Excel 한글).
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
    onSettled: () => {
      lockRef.current = false;
    },
  });

  if (!editable) return null;
  const tooMany = count > LIMIT;

  return (
    <div className={styles.exportGroup}>
      <div className={styles.exportRow}>
        <Button
          type="button"
          variant="secondary"
          pending={isExecuting}
          aria-busy={isExecuting ? "true" : undefined}
          disabled={tooMany}
          aria-describedby={tooMany ? TOO_MANY_ID : failed ? ERROR_ID : undefined}
          onClick={() => {
            if (lockRef.current) return;
            lockRef.current = true;
            setFailed(false);
            execute(filter);
          }}
        >
          파일 받기
        </Button>
        {tooMany ? (
          <span id={TOO_MANY_ID} className={styles.exportLimit}>
            5,000곳 넘음 · 갈래나 검색으로 줄이기
          </span>
        ) : null}
      </div>
      {failed ? (
        <p id={ERROR_ID} role="alert" className={styles.exportError}>
          파일 받기 실패 · 다시 시도
        </p>
      ) : null}
    </div>
  );
}
