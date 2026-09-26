// 04-19 — RED 자리표시(구현 전). 시그니처만 둔다.
export type FocusCell = { rowId: string; colKey: string };

export function splitPages(ids: readonly string[], opts: { pageSize: number; pinned?: Readonly<Record<string, number>> }): string[][] {
  void ids;
  void opts;
  return [];
}

export function pageOfRow(pages: readonly (readonly string[])[], rowId: string): number | null {
  void pages;
  void rowId;
  return null;
}

export function pageEntryFocus(input: {
  pageRowIds: readonly string[];
  lastColKey: string | undefined;
  editableColKeys: readonly string[];
}): FocusCell | null {
  void input;
  return null;
}
