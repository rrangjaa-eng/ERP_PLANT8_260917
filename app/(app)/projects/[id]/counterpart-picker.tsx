"use client";

import { useCallback, useRef } from "react";
import { PickDialog, type PickResult, type PickRow } from "@/ui/pick-dialog/PickDialog";
import type { CounterpartProject } from "@/domain/quotes/adjustment-pair";
import { listCounterpartProjectsAction } from "../actions";

// 07.2-12(D7298-B · UI-SPEC S11) — 조정 줄 추가 전에 상대 프로젝트를 하나 고른다. 목록은 서버가 조정 쓰기 행 범위로 거른 것(완료는
// 고를 수 없는 행 + 이유)이고, 열 때 한 번 받아 검색은 그 안에서 한다. 빈 목록의 다음 한 수는 새 탭의 프로젝트 목록(저장 안 한 표를 떠나지 않는다).

export type PickedCounterpart = { projectId: string; number: string; name: string };

const PICK_LIMIT = 50;

export function CounterpartPicker({
  open,
  projectId,
  onClose,
  onPick,
}: {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onPick: (picked: PickedCounterpart) => void;
}) {
  const loaded = useRef<CounterpartProject[] | null>(null);

  const search = useCallback(
    async (query: string): Promise<PickResult | null> => {
      if (!loaded.current) {
        const result = await listCounterpartProjectsAction({ projectId });
        if (!result?.data) return null;
        loaded.current = result.data;
      }
      const needle = query.trim().toLowerCase();
      const matched = loaded.current.filter((row) => needle === "" || `${row.number} ${row.name}`.toLowerCase().includes(needle));
      return {
        items: matched.slice(0, PICK_LIMIT).map((row) => ({
          type: "row" as const,
          id: row.id,
          number: row.number,
          title: row.name,
          subtitle: row.teamName,
          selectable: row.selectable === true,
          reason: row.selectable === true ? null : row.selectable.reason,
        })),
        truncated: matched.length > PICK_LIMIT,
        emptyDefault: "고를 프로젝트가 없습니다",
      };
    },
    [projectId],
  );

  return (
    <PickDialog
      open={open}
      onClose={() => {
        loaded.current = null;
        onClose();
      }}
      title="상대 프로젝트 고르기"
      subtitle="조정 줄 추가"
      searchLabel="프로젝트 검색"
      search={search}
      primaryLabel="이 프로젝트로"
      noun="프로젝트"
      emptyNextStep={{ label: "프로젝트 목록 보기", onSelect: () => window.open("/projects", "_blank", "noopener") }}
      onPick={(row: PickRow) => {
        loaded.current = null;
        onPick({ projectId: row.id, number: row.number ?? "", name: row.title });
      }}
    />
  );
}
