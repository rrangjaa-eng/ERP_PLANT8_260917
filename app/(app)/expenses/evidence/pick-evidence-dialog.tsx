"use client";

import { useCallback, useState } from "react";
import { PickDialog, type PickManyOutcome, type PickResult, type PickRow } from "@/ui/pick-dialog/PickDialog";
import { attachEvidenceAsAuthorAction, attachEvidenceBatchAction, listEvidencePoolAction } from "./attach/actions";

// 06.1-08 S5(RP-4 · DB-1): 문서에 붙일 증빙 고르기 — 공용 PickDialog 다중 변형의 props만 채운다(검색 칸 · 체크 · 결과 줄 · 바닥 줄 · 폰 시트 ·
// 키 흐름은 PickDialog 기본). 후보 · 순위 · 고를 수 있음 · 이유 · 상한은 서버가 정한다 — 이 파일은 숫자도 권한도 판정하지 않는다.
// 거부 글자는 서버 원문 그대로 바닥 거부 줄에 선다(끝 ` · 새로 고침`은 PickDialog가 3차로 뺀다).

const COPY = {
  title: "증빙 고르기",
  searchLabel: "거래처 · 금액",
  primary: "증빙 붙이기",
  failed: "붙이지 못함 · 다시 시도",
} as const;

export type PickEvidenceTarget = { ownerKind: "expense" | "purchase_request"; ownerId: string; mode: "registrar" | "author"; subtitle: string };

export function PickEvidenceDialog({ target, onClose, onAttached }: { target: PickEvidenceTarget | null; onClose: () => void; onAttached: () => void }) {
  // 상한은 서버 풀 결과의 값 — 첫 결과가 오기 전에는 막지 않는다(PickDialog 기본).
  const [cap, setCap] = useState<{ count: number; reason: string } | null>(null);
  const ownerKind = target?.ownerKind ?? null;
  const ownerId = target?.ownerId ?? null;
  const mode = target?.mode ?? null;

  const search = useCallback(
    async (query: string): Promise<PickResult | null> => {
      if (!ownerKind || !ownerId) return null;
      try {
        const result = await listEvidencePoolAction({ ownerKind, ownerId, query: query.trim() === "" ? undefined : query.trim() });
        const data = result?.data;
        if (!data) return null;
        setCap({ count: data.cap, reason: data.capLine });
        const items = data.items.flatMap((item): PickRow[] => {
          if (!item.id || item.title === undefined) return [];
          return [
            {
              type: "row",
              id: item.id,
              number: item.number ?? null,
              title: item.title,
              subtitle: item.subtitle ?? null,
              amount: item.amountKrw === undefined ? null : { krw: item.amountKrw },
              selectable: item.selectable === true,
              reason: item.reason ?? null,
            },
          ];
        });
        return { items, truncated: data.truncated, preselect: data.preselect, limit: data.limit };
      } catch {
        return null;
      }
    },
    [ownerKind, ownerId],
  );

  async function onPickMany(rows: PickRow[]): Promise<PickManyOutcome> {
    if (!ownerKind || !ownerId || !mode) return { ok: false, reason: COPY.failed, retryable: true };
    const input = { evidenceIds: rows.map((row) => row.id), ownerKind, ownerId };
    let result: Awaited<ReturnType<typeof attachEvidenceAsAuthorAction>> | undefined;
    try {
      result = mode === "author" ? await attachEvidenceAsAuthorAction(input) : await attachEvidenceBatchAction(input);
    } catch {
      return { ok: false, reason: COPY.failed, retryable: true };
    }
    if (result?.data) {
      onAttached();
      return { ok: true };
    }
    if (result?.serverError) return { ok: false, reason: result.serverError, retryable: false };
    return { ok: false, reason: COPY.failed, retryable: true };
  }

  return (
    <PickDialog
      mode="multiple"
      open={target !== null}
      onClose={onClose}
      title={COPY.title}
      subtitle={target?.subtitle}
      searchLabel={COPY.searchLabel}
      search={search}
      primaryLabel={COPY.primary}
      noun="증빙"
      emptyNextStep={null}
      resultLineMany={(rows) => (rows.length > 0 ? `고른 ${rows.length}건` : null)}
      onPickMany={onPickMany}
      maxSelected={cap ?? undefined}
    />
  );
}
