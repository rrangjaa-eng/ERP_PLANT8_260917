"use client";

import { useCallback, useRef } from "react";
import { PickDialog, type PickManyOutcome, type PickResult, type PickRow } from "@/ui/pick-dialog/PickDialog";
import { attachEvidenceRecordAction, listAttachCandidatesAction } from "./attach/actions";

// 06.1-06 S4(RP-4): 붙일 문서 고르기 — 공용 PickDialog 단일 변형의 props만 채운다(검색 칸 · 현재 행 · 바닥 줄 · 폰 시트는 PickDialog 기본).
// 순위 · 고를 수 있음 · 이유는 서버가 정한다(SQL 순위 · 05 규칙표 위 권리 · 짝). 거부 글자는 서버 원문 그대로 바닥 거부 줄에 선다 —
// 경합 글자 끝 ` · 새로 고침`은 PickDialog가 3차 버튼으로 뺀다(재검토 2회차 Codex C).

const COPY = {
  title: "붙일 문서 고르기",
  searchLabel: "문서 번호 · 작성자 · 지급처",
  primary: "이 문서에 붙이기",
  failed: "붙이지 못함 · 다시 시도",
  inReview: "결재 중 문서 · 결재 끝까지 떼기 없음",
  // 06.1-09 D-6111: 경영관리가 값 바뀜 카드 사용 행을 고르면 붙이는 순간 카드 사용이 파일 값으로 덮인다.
  fileWins: "고르면 카드 사용 합계 · 카드가 파일 값으로",
} as const;

export type PickDocumentTarget = { recordId: string; subtitle: string };

export function PickDocumentDialog({ target, onClose, onAttached }: { target: PickDocumentTarget | null; onClose: () => void; onAttached: (recordId: string) => void }) {
  // 행 id → 문서 종류(지출결의 · 구매 요청 · 카드 사용) · 결재 중 · 값 바뀜 — PickRow에는 그 칸이 없어 마지막 결과로 기억한다.
  const kinds = useRef(new Map<string, { kind: "expense" | "purchase_request" | "corp_card_usage"; inReview: boolean; changes: boolean }>());
  const recordId = target?.recordId ?? null;

  const search = useCallback(
    async (query: string): Promise<PickResult | null> => {
      if (!recordId) return null;
      try {
        const result = await listAttachCandidatesAction({ recordId, query: query.trim() === "" ? undefined : query.trim() });
        const data = result?.data;
        if (!data) return null;
        kinds.current = new Map();
        const items = data.items.flatMap((item): PickRow[] => {
          if (!item.id || !item.kind || item.number === undefined || item.title === undefined) return [];
          kinds.current.set(item.id, { kind: item.kind, inReview: item.inReview === true, changes: item.valueChanges !== undefined && item.valueChanges !== null });
          return [
            {
              type: "row",
              id: item.id,
              number: item.number,
              title: item.title,
              subtitle: item.subtitle ?? null,
              amount: item.amountKrw === undefined || item.amountKrw === null ? null : { krw: item.amountKrw },
              selectable: item.selectable === true,
              reason: item.reason ?? null,
            },
          ];
        });
        return { items, truncated: data.truncated, subtitle: data.subtitle, preselect: data.preselect, limit: data.limit, noneSelectableReason: data.noneSelectableReason };
      } catch {
        return null;
      }
    },
    [recordId],
  );

  async function onPick(row: PickRow): Promise<boolean | PickManyOutcome> {
    const kind = kinds.current.get(row.id)?.kind;
    if (!recordId || !kind) return false;
    let result: Awaited<ReturnType<typeof attachEvidenceRecordAction>> | undefined;
    try {
      result = await attachEvidenceRecordAction({ recordId, ownerKind: kind, ownerId: row.id });
    } catch {
      return { ok: false, reason: COPY.failed, retryable: true };
    }
    if (result?.data) {
      onAttached(recordId);
      return { ok: true };
    }
    if (result?.serverError) return { ok: false, reason: result.serverError, retryable: false };
    return { ok: false, reason: COPY.failed, retryable: true };
  }

  return (
    <PickDialog
      open={target !== null}
      onClose={onClose}
      title={COPY.title}
      subtitle={target?.subtitle}
      searchLabel={COPY.searchLabel}
      search={search}
      primaryLabel={COPY.primary}
      noun="문서"
      emptyNextStep={null}
      resultLine={(row) => {
        const facts = row ? kinds.current.get(row.id) : undefined;
        if (facts?.inReview) return COPY.inReview;
        return facts?.changes ? COPY.fileWins : null;
      }}
      onPick={onPick}
    />
  );
}
