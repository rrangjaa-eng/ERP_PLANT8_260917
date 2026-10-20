import type { EvidenceRecordVisibility } from "@/domain/evidence-records";
import type { PasteCell } from "@/ui/table/use-clipboard-paste";

// 06.1-13(SP-6104 · G-2) — 공개 칸 붙여넣기 대조(순수). 표는 공개 열을 문자 열로 `applyPaste`에 넘기고(공유 `ui/table`의 「잠김 셀 = 오류
// 셀」은 그대로 — PA-G2-NOUI), 이 함수가 줄마다 그 줄의 선택지(06.1-05 공개 select와 같은 목록 — 묶음 「다른 팀」의 보관 아닌 팀 포함)와
// 라벨 글자로만 맞춘다. 선택지를 여기서 짓지 않는다 — 갈라지면 붙여넣기와 select가 다른 답을 낸다(본부 이름 · 팀 목록은 화면이 넘긴다).
// 잠긴 줄(줄 단위 — 그 사람이 바꿀 수 없는 줄)은 오류가 아니라 건너뛰고 센다(§7-3 (가) DR-22와 같은 결 · RP-9).

export type PublishValue = { visibility: EvidenceRecordVisibility; teamId?: string };

export type PublishPasteRow = { choices: readonly { label: string; value: PublishValue }[]; locked: boolean };

export type PublishPasteResult = {
  values: { rowIndex: number; value: PublishValue }[];
  errors: { rowIndex: number; reason: string }[];
  /** droppedBelow — 표 아래를 넘쳐 버린 줄 수(조용히 버리지 않는다 — §7-3, 합계 행 요약에 센다). */
  counts: { unknown: number; skippedLocked: number; droppedBelow: number };
};

export function resolvePublishPaste({ cells, rows }: { cells: readonly PasteCell[]; rows: readonly PublishPasteRow[] }): PublishPasteResult {
  const result: PublishPasteResult = { values: [], errors: [], counts: { unknown: 0, skippedLocked: 0, droppedBelow: 0 } };
  const droppedRows = new Set<number>();
  for (const cell of cells) {
    const row = rows[cell.rowIndex];
    // 표 아래를 넘친 줄은 버린다 — 증빙 목록은 붙여넣기로 줄을 만들지 않는다. 버린 줄은 세어 요약에 남긴다.
    if (!row) {
      droppedRows.add(cell.rowIndex);
      continue;
    }
    if (row.locked) {
      result.counts.skippedLocked += 1;
      continue;
    }
    // 공개 열은 문자 열로 펼치므로 칸은 늘 글자다(오류 칸이 오면 빈 글자로 본다).
    const text = cell.result.status === "ok" ? cell.result.value.trim() : "";
    const matches = row.choices.filter((choice) => choice.label === text);
    if (matches.length === 1 && matches[0]) {
      result.values.push({ rowIndex: cell.rowIndex, value: matches[0].value });
      continue;
    }
    // 같은 라벨이 여럿이면 고르지 않는다 — 공유 select 붙여넣기(`applyPaste`)와 같은 규칙 · 같은 글자.
    if (matches.length > 1) {
      result.errors.push({ rowIndex: cell.rowIndex, reason: "같은 이름 여럿 · 목록에서 고르기" });
      continue;
    }
    // 이유 글자는 공유 select 붙여넣기(`applyPaste`)와 같다.
    result.errors.push({ rowIndex: cell.rowIndex, reason: `목록에 없는 값 · ${text || "(빈 값)"}` });
    result.counts.unknown += 1;
  }
  result.counts.droppedBelow = droppedRows.size;
  return result;
}
