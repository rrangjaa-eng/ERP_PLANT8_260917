// 04-16(B3 · UI-SPEC rev 5 후속 결정 R2) — 04-28 거부 봉투의 칸을 표별로 나누고 합계 행 오른쪽 글자를 만든다. 순수 함수.

// 매출 줄 id → { 열 키: 이유 }.
export type RevenueCellErrors = Record<string, Record<string, string>>;

// 도메인 필드 → 매출 표 열 키. 대응 표 밖 필드(fxRate 등)는 그 줄의 금액 칸에 붙여 좌표를 잃지 않는다.
const REVENUE_COLUMNS = new Set(["entryDate", "amount", "note"]);

function columnOf(field: string): string {
  return REVENUE_COLUMNS.has(field) ? field : "amount";
}

export function routeRejectedRevenueCells<Cell extends { rowId?: string; field: string; reason: string }>(
  cells: Cell[],
  ids: { issuedIds: string[]; paidIds: string[] },
): { issued: RevenueCellErrors; paid: RevenueCellErrors; rest: Cell[] } {
  const issued: RevenueCellErrors = {};
  const paid: RevenueCellErrors = {};
  const rest: Cell[] = [];
  for (const cell of cells) {
    const rowId = cell.rowId;
    const target = rowId === undefined ? null : ids.issuedIds.includes(rowId) ? issued : ids.paidIds.includes(rowId) ? paid : null;
    if (rowId === undefined || target === null) {
      rest.push(cell);
      continue;
    }
    target[rowId] = { ...target[rowId], [columnOf(cell.field)]: cell.reason };
  }
  return { issued, paid, rest };
}

// UI-SPEC rev 5 Copywriting `Error — 표 배치 저장 실패` — 그 표의 오류 칸 수.
export function revenueTableErrorText(count: number): string | null {
  return count > 0 ? `오류 ${count}칸 · 전부 거부` : null;
}

// 후속 결정 R2 — 제 오류가 0칸인 표는 다른 표·표 밖 칸 오류 수로 전부 거부를 알린다.
export function otherCellsRejectedText(ownCount: number, otherCount: number): string | null {
  return ownCount === 0 && otherCount > 0 ? `전부 거부 · 다른 칸 오류 ${otherCount}칸` : null;
}

function countCells(errors: RevenueCellErrors): number {
  return Object.values(errors).reduce((sum, row) => sum + Object.keys(row).length, 0);
}

// 04-41(04-16 검토 S-4) — 견적 줄 표 합계 행 글자. 봉투 칸 중 견적 줄 칸(매출 줄 id가 아닌 칸)이 없으면 다른 칸 글자다.
export function quoteTableRejectionText<Cell extends { rowId?: string; field: string; reason: string; kind: "conflict" | "error" }>(
  envelope: { summary: string; cells: Cell[] },
  ids: { issuedIds: string[]; paidIds: string[] },
  outsideCount: number,
): string | null {
  const routed = routeRejectedRevenueCells(envelope.cells, ids);
  if (routed.rest.length === 0) return otherCellsRejectedText(0, countCells(routed.issued) + countCells(routed.paid) + outsideCount);
  // SaveRejectedError 요약과 같은 규칙 — 충돌은 줄 수, 오류는 칸 수. 매출 칸은 그 표의 합계 행이 센다.
  const conflictRows = new Set(routed.rest.filter((cell) => cell.kind === "conflict").map((cell) => cell.rowId)).size;
  const errorCells = routed.rest.filter((cell) => cell.kind === "error").length;
  const parts: string[] = [];
  if (conflictRows > 0) parts.push(`충돌 ${conflictRows}줄 · 전부 거부`);
  if (errorCells > 0) parts.push(`오류 ${errorCells}칸 · 전부 거부`);
  return parts.join(" · ");
}
