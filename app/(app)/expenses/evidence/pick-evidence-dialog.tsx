"use client";

import { useCallback, useRef, useState } from "react";
import { PickDialog, type PickManyOutcome, type PickResult, type PickRow } from "@/ui/pick-dialog/PickDialog";
import { attachEvidenceAsAuthorAction, attachEvidenceBatchAction, attachEvidenceRecordAction, listEvidencePoolAction } from "./attach/actions";

// 06.1-08 S5(RP-4 · DB-1): 문서에 붙일 증빙 고르기 — 공용 PickDialog 다중 변형의 props만 채운다(검색 칸 · 체크 · 결과 줄 · 바닥 줄 · 폰 시트 ·
// 키 흐름은 PickDialog 기본). 후보 · 순위 · 고를 수 있음 · 이유 · 상한은 서버가 정한다 — 이 파일은 숫자도 권한도 판정하지 않는다.
// 거부 글자는 서버 원문 그대로 바닥 거부 줄에 선다(끝 ` · 새로 고침`은 PickDialog가 3차로 뺀다).

const COPY = {
  title: "증빙 고르기",
  searchLabel: "거래처 · 금액",
  primary: "증빙 붙이기",
  // 06.1-09: 카드 사용은 증빙 하나만 붙는다(단일 — 카드 명세 한 줄 = 카드 사용 하나).
  primarySingle: "이 증빙 붙이기",
  fileWins: "고르면 카드 사용 합계 · 카드가 파일 값으로",
  failed: "붙이지 못함 · 다시 시도",
} as const;

export type PickEvidenceTarget = { ownerKind: "expense" | "purchase_request" | "corp_card_usage"; ownerId: string; mode: "registrar" | "author"; subtitle: string };

export function PickEvidenceDialog({ target, onClose, onAttached }: { target: PickEvidenceTarget | null; onClose: () => void; onAttached: () => void }) {
  // 상한은 서버 풀 결과의 값 — 첫 결과가 오기 전에는 막지 않는다(PickDialog 기본).
  const [cap, setCap] = useState<{ count: number; reason: string } | null>(null);
  const ownerKind = target?.ownerKind ?? null;
  const ownerId = target?.ownerId ?? null;
  const mode = target?.mode ?? null;
  // 행 id → 경영관리가 고르면 카드 사용 값이 바뀌는 줄(서버 판정) — PickRow에 그 칸이 없어 마지막 결과로 기억한다.
  const changes = useRef(new Set<string>());

  const search = useCallback(
    async (query: string): Promise<PickResult | null> => {
      if (!ownerKind || !ownerId) return null;
      try {
        const result = await listEvidencePoolAction({ ownerKind, ownerId, query: query.trim() === "" ? undefined : query.trim() });
        const data = result?.data;
        if (!data) return null;
        setCap({ count: data.cap, reason: data.capLine });
        changes.current = new Set();
        const items = data.items.flatMap((item): PickRow[] => {
          if (!item.id || item.title === undefined) return [];
          if (item.changesCardUsage === true) changes.current.add(item.id);
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
    if (!ownerKind || ownerKind === "corp_card_usage" || !ownerId || !mode) return { ok: false, reason: COPY.failed, retryable: true };
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

  async function onPickCard(row: PickRow): Promise<PickManyOutcome> {
    if (!ownerId || !mode) return { ok: false, reason: COPY.failed, retryable: true };
    let result: Awaited<ReturnType<typeof attachEvidenceRecordAction>> | Awaited<ReturnType<typeof attachEvidenceAsAuthorAction>> | undefined;
    try {
      result =
        mode === "author"
          ? await attachEvidenceAsAuthorAction({ evidenceIds: [row.id], ownerKind: "corp_card_usage", ownerId })
          : await attachEvidenceRecordAction({ recordId: row.id, ownerKind: "corp_card_usage", ownerId });
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

  if (ownerKind === "corp_card_usage") {
    return (
      <PickDialog
        open={target !== null}
        onClose={onClose}
        title={COPY.title}
        subtitle={target?.subtitle}
        searchLabel={COPY.searchLabel}
        search={search}
        primaryLabel={COPY.primarySingle}
        noun="증빙"
        emptyNextStep={null}
        resultLine={(row) => (row && mode === "registrar" && changes.current.has(row.id) ? COPY.fileWins : null)}
        onPick={onPickCard}
      />
    );
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
