"use client";

import { useCallback } from "react";
import { PickDialog, type PickItem, type PickResult, type PickRow } from "@/ui/pick-dialog/PickDialog";
import { searchLinesForPickAction } from "../actions";

// 05-07 골라내기 견적 줄 변형(`견적 줄 바꾸기` · `견적 줄 고르기`) — 서버 검색 결과(PickLineOptionDto 행 · PickLineGroupDto 그룹)를 `ui/pick-dialog`의
// 항목으로 옮긴다. 고를 수 있음 · 이유는 서버가 정한 값 그대로다(이 파일은 판정하지 않는다). 바꾸기는 한 프로젝트라 머리글 없이 부제 한 줄,
// 고르기는 프로젝트 그룹 머리글(접힌 그룹은 사유 한 줄).

export type LinePickMode = "change" | "pick";

export function LinePickDialog({
  open,
  mode,
  expenseId,
  teamValues,
  onClose,
  onPick,
}: {
  open: boolean;
  mode: LinePickMode;
  /** 바꾸기에서 그 문서의 프로젝트를 알려 주는 문서 id — 고르기에서는 없다. */
  expenseId: string | null;
  /** 고르기에서 지워질 팀 비용 칸 값(종류 · 내용)이 적혀 있는지 — 결과 줄에 한 번 말한다. */
  teamValues: boolean;
  onClose: () => void;
  onPick: (lineId: string) => void | boolean | Promise<void | boolean>;
}) {
  const search = useCallback(
    async (query: string): Promise<PickResult | null> => {
      const data = (await searchLinesForPickAction({ mode, ...(expenseId ? { expenseId } : {}), query }))?.data;
      if (!data) return null;
      const items: PickItem[] = [];
      let notice: string | null = null;
      let subtitle: string | null = null;
      for (const group of data.groups) {
        if (group.projectId === undefined) continue;
        const projectRows = data.rows.filter((row) => row.projectId === group.projectId);
        const pickRows: PickRow[] = projectRows.flatMap((row) =>
          row.id === undefined || row.itemName === undefined
            ? []
            : [
                {
                  type: "row" as const,
                  id: row.id,
                  number: row.lineNo === undefined ? null : String(row.lineNo),
                  title: row.itemName,
                  subtitle: [row.vendorName, row.installmentText].filter(Boolean).join(" · ") || null,
                  amount: row.execution
                    ? {
                        krw: row.execution.amountKrw,
                        ...(row.execution.currency === "KRW" ? {} : { fx: { currency: row.execution.currency, amount: row.execution.amount, rate: row.execution.fxRate } }),
                      }
                    : null,
                  selectable: row.selectable ?? false,
                  reason: row.reason ?? null,
                  current: row.current ?? false,
                },
              ],
        );
        if (mode === "change") {
          // 한 프로젝트 — 머리글 없이 부제(`프로젝트 · 견적 줄 N · 고를 수 있는 줄 M`), 표 전체 게이트는 목록 위 한 줄.
          notice = group.note ?? null;
          subtitle = `${group.label ?? ""} · 견적 줄 ${pickRows.length} · 고를 수 있는 줄 ${pickRows.filter((row) => row.selectable).length}`;
        } else {
          items.push({ type: "group", id: group.projectId, label: group.label ?? "", note: group.note ?? null });
        }
        items.push(...pickRows);
      }
      return {
        items,
        truncated: data.truncated,
        subtitle,
        notice,
        emptyDefault: mode === "pick" ? "담당 프로젝트 줄이 없습니다" : null,
      };
    },
    [mode, expenseId],
  );

  return (
    <PickDialog
      open={open}
      onClose={onClose}
      title={mode === "change" ? "견적 줄 바꾸기" : "견적 줄 고르기"}
      searchLabel="견적 줄 검색"
      noun="줄"
      primaryLabel="이 줄로"
      search={search}
      resultLine={(row) => {
        if (!row) return null;
        const filled = `거래처 · 증빙 종류 · 공급가액이 그 줄 값으로 ${expenseId ? "바뀜" : "채워짐"}`;
        return mode === "pick" && teamValues ? `${filled} · 팀 비용 칸 지워짐` : filled;
      }}
      onPick={(row) => onPick(row.id)}
    />
  );
}
