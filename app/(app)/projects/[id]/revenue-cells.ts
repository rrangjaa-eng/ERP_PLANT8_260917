export type RevenueCellErrors = Record<string, Record<string, string>>;

export function routeRejectedRevenueCells<Cell extends { rowId?: string; field: string; reason: string }>(
  cells: Cell[],
  ids: { issuedIds: string[]; paidIds: string[] },
): { issued: RevenueCellErrors; paid: RevenueCellErrors; rest: Cell[] } {
  void cells;
  void ids;
  return { issued: {}, paid: {}, rest: [] };
}

export function revenueTableErrorText(count: number): string | null {
  void count;
  return null;
}

export function otherCellsRejectedText(ownCount: number, otherCount: number): string | null {
  void ownCount;
  void otherCount;
  return null;
}
