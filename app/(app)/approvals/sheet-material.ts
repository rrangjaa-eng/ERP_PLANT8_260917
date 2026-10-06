import type { ApprovalInboxItemDto, DocumentMeasure, DocumentSummary } from "@/domain/approvals";
import { formatKrw } from "@/lib/format-number";
import { routeListSteps, withdrawResultLines } from "@/app/(app)/leave/status-display";
import type { ApprovalSheetItem, SheetDetailRow } from "./approval-sheet";
import type { DecisionTarget } from "./decision-dialogs";

// 결재함(`page.tsx`)과 첫 화면 「내 차례」(`app/(app)/page.tsx`)가 같은 결재 시트 · 반려 확인 재료를 만든다(05-10 — 두 번째 사용처).
// 서버가 준 투영 뒤 값만 옮긴다 — 종류 이름으로 분기하지 않는다.

// 확인 창 부제의 숫자 조각 — 숫자 칸 1행과 같은 글자.
export function measureText(measure: DocumentMeasure | null | undefined): string | null {
  if (!measure) return null;
  return measure.kind === "days" ? measure.text : formatKrw(measure.money.amountKrw);
}

// 반려 · 회수 확인 재료(S6) — 부제는 서버 값으로만(번호 · 기안자 · 종류 대상 · 숫자, 빠진 조각은 뺀다).
export function toDecision(item: Partial<ApprovalInboxItemDto>, summary: DocumentSummary): DecisionTarget | null {
  if (!item.instanceId || item.version === undefined || !item.kindLabel) return null;
  const measure = measureText(summary.measure);
  return {
    instanceId: item.instanceId,
    version: item.version,
    kindLabel: item.kindLabel,
    subtitle: [summary.number, item.drafterName, summary.documentText, measure].filter(Boolean).join(" · "),
    withdrawSubtitle: [summary.number, summary.documentText, measure].filter(Boolean).join(" · "),
    drafterName: item.drafterName ?? null,
    withdrawLines: withdrawResultLines(item.steps),
  };
}

// 종류가 준 상세 행(같은 라벨이 이어지면 한 칸의 여러 줄 — 잔고 1행 · 2행 · 잔여 초과)을 라벨 · 값 목록으로.
// 증빙 갈래(files)는 묶지 않고 그대로 시트 행 갈래로 옮긴다(05-10 D9).
export function sheetRows(rows: NonNullable<ApprovalInboxItemDto["detail"]>["rows"]): SheetDetailRow[] {
  const grouped: SheetDetailRow[] = [];
  for (const row of rows) {
    if (row.files) {
      grouped.push({ label: row.label, lines: [], files: row.files });
      continue;
    }
    const last = grouped[grouped.length - 1];
    if (last && !last.files && last.label === row.label) last.lines.push({ text: row.value, tone: row.tone });
    else grouped.push({ label: row.label, lines: [{ text: row.value, tone: row.tone }] });
  }
  return grouped;
}

// 04.1-05(S5): `내 결재` 항목의 결재 시트 재료 — 서버가 준 상세 · 결재선 · 가능 행동을 그대로 옮긴다.
export function toSheet(item: Partial<ApprovalInboxItemDto>): ApprovalSheetItem | null {
  if (!item.instanceId || item.version === undefined || !item.detail || !item.actions) return null;
  return {
    instanceId: item.instanceId,
    version: item.version,
    title: item.detail.title,
    subtitle: item.detail.subtitle,
    rows: sheetRows(item.detail.rows),
    steps: routeListSteps(item.steps),
    endLines: item.endLines ?? [],
    actions: item.actions,
    href: item.href ?? null,
    approveBlockedReason: item.approveBlockedReason ?? null,
  };
}
