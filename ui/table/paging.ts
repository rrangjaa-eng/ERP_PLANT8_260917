// 04-19(D-91 · SYSTEM.md §7-3 (자)) — 편집 표의 쪽 나눔은 화면 안 배열 자르기다(서버 페이지네이션이 아니다). 순수 함수,
// React 없음. 쪽 번호 보정과 쪽 크기는 lib/paging(04-29)의 clampPage · QUOTE_TABLE_PAGE_SIZE를 쓴다 — 여기서 다시 만들지 않는다.

/** 격자의 포커스·범위 앵커 — 인덱스가 아니라 줄 id와 열 키로 기억한다(엔지 리뷰 C §1 P2). */
export type FocusCell = { rowId: string; colKey: string };

/**
 * 표시 순서 id를 쪽 크기로 자른다. `pinned`(id → 쪽 번호, 1부터)에 든 새 줄은 만든 쪽에 남는다 — 그 쪽이 잠시 쪽
 * 크기를 넘을 수 있다(§7-3 (자)). 줄이 없으면 빈 쪽 하나.
 */
export function splitPages(ids: readonly string[], opts: { pageSize: number; pinned?: Readonly<Record<string, number>> }): string[][] {
  const pinned = opts.pinned ?? {};
  const pageById = new Map<string, number>();
  let unpinned = 0;
  let pageCount = 1;
  for (const id of ids) {
    const page = pinned[id] ?? Math.floor(unpinned++ / opts.pageSize) + 1;
    pageById.set(id, page);
    pageCount = Math.max(pageCount, page);
  }
  const pages: string[][] = Array.from({ length: pageCount }, () => []);
  for (const id of ids) pages[pageById.get(id)! - 1]!.push(id);
  return pages;
}

/** 줄 id가 있는 쪽(1부터). 없으면 null. */
export function pageOfRow(pages: readonly (readonly string[])[], rowId: string): number | null {
  const index = pages.findIndex((page) => page.includes(rowId));
  return index === -1 ? null : index + 1;
}

/**
 * DR-23 — 쪽을 바꾼 뒤 포커스할 셀: 새 쪽 첫 줄의 직전 활성 열(편집 열일 때), 아니면 첫 편집 열. 편집 열이 없으면(읽기 표)
 * null — 호출부가 섹션 제목(없으면 캡션)으로 보낸다.
 */
export function pageEntryFocus(input: {
  pageRowIds: readonly string[];
  lastColKey: string | undefined;
  editableColKeys: readonly string[];
}): FocusCell | null {
  const rowId = input.pageRowIds[0];
  const firstEditable = input.editableColKeys[0];
  if (rowId === undefined || firstEditable === undefined) return null;
  const colKey = input.lastColKey !== undefined && input.editableColKeys.includes(input.lastColKey) ? input.lastColKey : firstEditable;
  return { rowId, colKey };
}

// 04-19 Task 2 — RED 자리표시(구현 전).
export function crossPageTarget(input: {
  ids: readonly string[];
  fromId: string;
  direction: "up" | "down";
  pages: readonly (readonly string[])[];
}): { rowId: string; page: number } | null {
  void input;
  return null;
}

export function nextEditableCell(input: {
  rowIds: readonly string[];
  colKeys: readonly string[];
  isEditable: (rowId: string, colKey: string) => boolean;
  from: FocusCell;
  direction: "forward" | "backward";
}): FocusCell | { crossPage: "next" | "prev" } {
  void input;
  return { crossPage: "next" };
}

export function resolveFocus(input: {
  pageIds: readonly string[];
  colKeys: readonly string[];
  focus: FocusCell;
  fallback: { row: number; col: number };
}): { row: number; col: number } {
  void input;
  return { row: 0, col: 0 };
}
