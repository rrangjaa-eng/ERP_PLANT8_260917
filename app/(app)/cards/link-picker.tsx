"use client";

import { useCallback, useRef } from "react";
import { PickDialog, type PickResult, type PickRow } from "@/ui/pick-dialog/PickDialog";
import { searchLinesForCardLinkAction, searchProjectsForCardLinkAction } from "./actions";

// 06-07(UI-SPEC S10 · SP-8 · C11): 패널 위 연결 고르기 — 프로젝트 · 견적 줄 두 단계를 05 `PickDialog`로 한 번에 하나만 연다.
// 줄마다 고를 수 있음 · 이유 · 남은 실행가는 서버가 정해 보낸다(이 파일은 셈하지 않는다). `mode`는 부른 폼(06-08이 `purchase`를 더한다).
// 줄 0 · 고를 수 있는 줄 0의 다음 한 수는 `견적 외 비용으로`(UI-SPEC 「Empty — 연결 고르기 목록」) — 라디오를 바꾸는 일은 폼 몫.

export type PickedProject = { id: string; label: string };
export type PickedLine = { id: string; itemName: string; remainingKrw: number; hint: string };

export function LinkPicker({
  mode,
  step,
  projectId,
  currentLineId,
  onClose,
  onPickProject,
  onPickLine,
  onOutOfQuote,
}: {
  mode: "card";
  step: "project" | "line" | null;
  projectId: string | null;
  currentLineId: string | null;
  onClose: () => void;
  onPickProject: (project: PickedProject) => void;
  onPickLine: (line: PickedLine) => void;
  onOutOfQuote: () => void;
}) {
  void mode;
  const knownProjects = useRef(new Map<string, PickedProject>());
  const knownLines = useRef(new Map<string, PickedLine>());

  const searchProjects = useCallback(async (query: string): Promise<PickResult | null> => {
    const data = (await searchProjectsForCardLinkAction({ query }))?.data;
    if (!data) return null;
    const items: PickRow[] = [];
    for (const row of data.rows) {
      if (!row.id || row.name === undefined || row.number === undefined) continue;
      knownProjects.current.set(row.id, { id: row.id, label: `${row.number} ${row.name}` });
      items.push({ type: "row", id: row.id, number: row.number, title: row.name, reason: row.note ?? null, selectable: row.selectable === true });
    }
    return { items, truncated: data.truncated, subtitle: data.subtitle };
  }, []);

  const searchLines = useCallback(
    async (query: string): Promise<PickResult | null> => {
      if (!projectId) return null;
      const data = (await searchLinesForCardLinkAction({ projectId, query, currentLineId }))?.data;
      if (!data) return null;
      const items: PickRow[] = [];
      for (const row of data.rows) {
        if (!row.id || row.itemName === undefined) continue;
        const selectable = row.selectable === true;
        if (row.remainingKrw !== undefined && row.hint !== undefined) {
          knownLines.current.set(row.id, { id: row.id, itemName: row.itemName, remainingKrw: row.remainingKrw, hint: row.hint });
        }
        const fx = row.execution && row.execution.currency !== "KRW" ? { currency: row.execution.currency, amount: row.execution.amount, rate: row.execution.fxRate } : undefined;
        items.push({
          type: "row",
          id: row.id,
          number: row.lineNo === undefined ? null : String(row.lineNo),
          title: row.itemName,
          subtitle: row.vendorName ?? null,
          amount: row.execution ? { krw: row.execution.amountKrw, ...(fx ? { fx } : {}) } : null,
          selectable,
          reason: selectable ? (row.hint ?? null) : (row.reason ?? null),
          current: row.current === true,
        });
      }
      return {
        items,
        truncated: data.truncated,
        subtitle: data.subtitle,
        emptyDefault: "이 프로젝트에 견적 줄이 없습니다",
        noneSelectableReason: "이을 수 있는 줄 없음",
      };
    },
    [projectId, currentLineId],
  );

  return (
    <>
      <PickDialog
        open={step === "project"}
        onClose={onClose}
        title="프로젝트 고르기"
        searchLabel="프로젝트 번호 · 이름 · 클라이언트 검색"
        noun="프로젝트"
        primaryLabel="이 프로젝트로"
        failedLine="프로젝트 불러오지 못함"
        search={searchProjects}
        onPick={(row) => {
          const project = knownProjects.current.get(row.id);
          if (!project) return false;
          onPickProject(project);
        }}
      />
      <PickDialog
        open={step === "line"}
        onClose={onClose}
        title="견적 줄 고르기"
        searchLabel="항목 · 거래처 검색"
        noun="줄"
        primaryLabel="이 줄로"
        failedLine="견적 줄 불러오지 못함"
        search={searchLines}
        emptyNextStep={{ label: "견적 외 비용으로", onSelect: onOutOfQuote }}
        onPick={(row) => {
          const line = knownLines.current.get(row.id);
          if (!line) return false;
          onPickLine(line);
        }}
      />
    </>
  );
}
