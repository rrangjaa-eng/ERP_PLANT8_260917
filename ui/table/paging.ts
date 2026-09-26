// 04-19(D-91 · SYSTEM.md §7-3 (자)) — 편집 표의 쪽 나눔은 화면 안 배열 자르기다(서버 페이지네이션이 아니다). 순수 함수,
// React 없음. 쪽 번호 보정과 쪽 크기는 lib/paging(04-29)의 clampPage · QUOTE_TABLE_PAGE_SIZE를 쓴다 — 여기서 다시 만들지 않는다.
import { formatCount } from "@/lib/format-number";

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

/**
 * 04-47(§7-3 (자)) — 직전 분할에 없던 줄 id(새 줄 — Ctrl+Enter·Ctrl+D·붙여넣기·줄 추가)를 만들어질 때의 쪽(`page`)에 고정한다.
 * 이미 고정된 줄은 그대로다. 새 줄이 없으면 받은 객체를 그대로 돌려준다(호출부가 상태를 바꾸지 않는다).
 */
export function pinNewRows(input: {
  ids: readonly string[];
  known: ReadonlySet<string>;
  pinned: Readonly<Record<string, number>>;
  page: number;
}): Readonly<Record<string, number>> {
  const fresh = input.ids.filter((id) => !input.known.has(id) && input.pinned[id] === undefined);
  if (fresh.length === 0) return input.pinned;
  return { ...input.pinned, ...Object.fromEntries(fresh.map((id) => [id, input.page])) };
}

/** 04-47(§7-3 (자)) — 범위 글자를 실제 분할로 센다(새 줄 고정으로 한 쪽이 쪽 크기를 넘는 동안에도 맞다). */
export function splitPageRangeText(input: { pages: readonly (readonly string[])[]; page: number; unit: string }): string {
  const start = input.pages.slice(0, input.page - 1).reduce((count, ids) => count + ids.length, 0) + 1;
  const end = start + (input.pages[input.page - 1]?.length ?? 0) - 1;
  const total = input.pages.reduce((count, ids) => count + ids.length, 0);
  return `${formatCount(start)}–${formatCount(end)} / ${formatCount(total)}${input.unit}`;
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

/**
 * C-18 — 쪽 경계를 넘는 ↑↓의 대상. 표시 순서(`ids`)에서 바로 앞·뒤 줄과 그 줄이 있는 쪽. 표 끝이면 null(멈춘다). 고정된 새
 * 줄이 쪽 크기를 넘겨 있어도 표시 순서를 따르므로 제자리에 머물지 않는다.
 */
export function crossPageTarget(input: {
  ids: readonly string[];
  fromId: string;
  direction: "up" | "down";
  pages: readonly (readonly string[])[];
}): { rowId: string; page: number } | null {
  const index = input.ids.indexOf(input.fromId);
  if (index === -1) return null;
  const rowId = input.ids[input.direction === "down" ? index + 1 : index - 1];
  if (rowId === undefined) return null;
  const page = pageOfRow(input.pages, rowId);
  return page === null ? null : { rowId, page };
}

/**
 * 편집 중 Tab/Shift+Tab의 대상 — 지금 쪽 안에서 같은 줄 오른쪽(왼쪽) 편집 셀, 줄 끝이면 다음(이전) 줄의 첫(끝) 편집 셀.
 * 쪽 안에 더 없으면 `{ crossPage }` — 호출부가 옆 쪽으로 넘긴다.
 */
export function nextEditableCell(input: {
  rowIds: readonly string[];
  colKeys: readonly string[];
  isEditable: (rowId: string, colKey: string) => boolean;
  from: FocusCell;
  direction: "forward" | "backward";
}): FocusCell | { crossPage: "next" | "prev" } {
  const step = input.direction === "forward" ? 1 : -1;
  const width = input.colKeys.length;
  const start = input.rowIds.indexOf(input.from.rowId) * width + input.colKeys.indexOf(input.from.colKey);
  for (let at = start + step; at >= 0 && at < input.rowIds.length * width; at += step) {
    const rowId = input.rowIds[Math.floor(at / width)]!;
    const colKey = input.colKeys[at % width]!;
    if (input.isEditable(rowId, colKey)) return { rowId, colKey };
  }
  return { crossPage: input.direction === "forward" ? "next" : "prev" };
}

/**
 * 엔지 리뷰 C §1 P2 — 기억한 `{ rowId, colKey }`를 렌더마다 지금 쪽의 인덱스로. 줄이 사라졌으면(삭제·다른 쪽) 직전 인덱스를
 * 쪽 안으로 보정한 자리(같은 자리 = 다음 줄, 끝이었으면 이전 줄).
 */
export function resolveFocus(input: {
  pageIds: readonly string[];
  colKeys: readonly string[];
  focus: FocusCell;
  fallback: { row: number; col: number };
}): { row: number; col: number } {
  const clamp = (value: number, length: number) => Math.max(0, Math.min(length - 1, value));
  const row = input.pageIds.indexOf(input.focus.rowId);
  const col = input.colKeys.indexOf(input.focus.colKey);
  return {
    row: row === -1 ? clamp(input.fallback.row, input.pageIds.length) : row,
    col: col === -1 ? clamp(input.fallback.col, input.colKeys.length) : col,
  };
}
