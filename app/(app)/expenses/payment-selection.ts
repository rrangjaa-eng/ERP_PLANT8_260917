// 06-17(UI-SPEC S1 「이체액·차이 사유 편집」 · 「합계 줄」): 지급 대상 표의 선택 · 편집 상태 순수 함수. React · 서버 액션을 import하지 않는다 —
// 단위 테스트가 바로 부른다. 금액 셈은 없다(O-18) — 고른 id와 사람이 적은 글자만 다루고, 합 · 차이는 서버 액션(sumSelectedTransfersAction) 응답이다.

// 행마다 사람이 적은 값 — 이체액은 쉼표를 뗀 칸 글자, 사유는 칸 글자 그대로. page = 고친 쪽(지금 쪽 밖 칸 오류를 그 쪽에서 세운다 — 검토 M-1).
export type RowEdit = { transfer: string; reason: string; page?: number };

export type SelectionState = {
  // 고른 행 id(모든 쪽).
  selectedIds: readonly string[];
  edits: Readonly<Record<string, RowEdit>>;
};

// 칸 글자 → 정수 원. 숫자가 아니면 null(칸 오류는 화면이 정한다 — S5 transferNumber와 같은 규칙).
export function transferNumber(raw: string): number | null {
  return /^-?\d+$/.test(raw) ? Number(raw) : null;
}

// 고르지 않은 P4 행의 이체액을 고치면 그 행이 저절로 골라진다 — 서버가 준 selectable이 참일 때만(막힌 행은 편집 칸이 없다).
export function editTransfer(state: SelectionState, input: { id: string; transfer: string; selectable: boolean; page?: number }): SelectionState {
  const edits = { ...state.edits, [input.id]: withPage({ transfer: input.transfer, reason: state.edits[input.id]?.reason ?? "" }, input.page) };
  const selectedIds = input.selectable && !state.selectedIds.includes(input.id) ? [...state.selectedIds, input.id] : state.selectedIds;
  return { selectedIds, edits };
}

export function editReason(state: SelectionState, input: { id: string; reason: string; page?: number }): SelectionState {
  const current = state.edits[input.id];
  return { ...state, edits: { ...state.edits, [input.id]: withPage({ transfer: current?.transfer ?? "", reason: input.reason }, input.page ?? current?.page) } };
}

function withPage(edit: RowEdit, page: number | undefined): RowEdit {
  return page === undefined ? edit : { ...edit, page };
}

// 고친 칸 오류인가 — 이체액이 양의 정수가 아니거나, 지급 총액(아는 때만)과 다른데 사유가 비었다(같음 비교 — 금액 셈 아님, O-18).
function editHasIssue(edit: RowEdit | undefined, payableKrw: number | null | undefined): boolean {
  if (!edit) return false;
  const value = transferNumber(edit.transfer);
  if (value === null || value <= 0) return true;
  return typeof payableKrw === "number" && value !== payableKrw && edit.reason.trim() === "";
}

// 검토 M-1 — 지금 쪽 밖 고른 행의 칸 오류(첫 행과 그 행을 고친 쪽). 지급 총액은 마지막 합 응답(rowStates) 값 — 아직 모르면 차이는 판정하지 않는다.
export function firstOffPageIssue(
  state: SelectionState,
  pageIds: readonly string[],
  offPage: ReadonlyMap<string, { payableKrw?: number | null }>,
): { id: string; page: number | null } | null {
  const page = new Set(pageIds);
  const id = state.selectedIds.find((candidate) => !page.has(candidate) && editHasIssue(state.edits[candidate], offPage.get(candidate)?.payableKrw));
  return id === undefined ? null : { id, page: state.edits[id]?.page ?? null };
}

// 지금 쪽 밖 행의 마지막 서버 상태(합 응답 rowStates 꼴).
export type OffPageState = { id?: string; selectable?: boolean; version?: number; payableKrw?: number | null; quoteLineId?: string | null; prepaid?: boolean };

// 검토 L-1 · D-2 — 스냅숏의 지금 쪽 밖 행: 합 응답이 지금 고를 수 있다(selectable 참)고 한 id만, 그 응답의 version · 지급 총액 · 견적 줄 · 선결제로.
export function offPageSnapshotRows(
  ids: readonly string[],
  pageIds: readonly string[],
  offPage: ReadonlyMap<string, OffPageState>,
): { id: string; version: number; payableKrw: number | null; quoteLineId: string | null; prepaid: boolean }[] {
  const page = new Set(pageIds);
  return ids.flatMap((id) => {
    const state = offPage.get(id);
    if (page.has(id) || state?.selectable !== true || typeof state.version !== "number") return [];
    return [{ id, version: state.version, payableKrw: state.payableKrw ?? null, quoteLineId: state.quoteLineId ?? null, prepaid: state.prepaid === true }];
  });
}

// S2 결과 줄 ① 서로 다른 견적 줄 수 · ② 선결제 건수 — 모든 쪽 고른 행(개수 — 금액 아님).
export function snapshotCounts(rows: readonly { quoteLineId?: string | null; prepaid?: boolean }[]): { lineCount: number; prepaidCount: number } {
  return {
    lineCount: new Set(rows.flatMap((row) => (row.quoteLineId ? [row.quoteLineId] : []))).size,
    prepaidCount: rows.filter((row) => row.prepaid === true).length,
  };
}

// 합 요청 행 — 고른 행마다 id, 이체액은 고친 칸이 양의 정수일 때만(아니면 서버가 지급 총액을 쓴다).
export function sumRequestRows(state: SelectionState): { id: string; transferKrw?: number }[] {
  return state.selectedIds.map((id) => {
    const raw = state.edits[id]?.transfer;
    const value = raw === undefined ? null : transferNumber(raw);
    return value !== null && value > 0 ? { id, transferKrw: value } : { id };
  });
}

// 합의 입력 열쇠 — 고른 id 집합(순서 무관) + 고른 행 이체액(+ 합의 세율 기준일). 사유는 들지 않는다.
export function sumKeyOf(state: SelectionState, payDate = ""): string {
  const rows = sumRequestRows(state).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return JSON.stringify([payDate, rows]);
}

// 합계 번호 — 열쇠가 바뀔 때만 1 는다.
export function nextSumSeq(prev: { seq: number; key: string }, key: string): { seq: number; key: string } {
  return prev.key === key ? prev : { seq: prev.seq + 1, key };
}

// 처리 결과 적용(H-3) — 처리된 id는 모든 쪽 선택 · 편집에서 지운다. 막힌 행은 응답이 다시 판정한 selectable을 따른다:
// 거짓(게이트로 막혀 이제 고를 수 없음)이면 선택 · 편집을 풀고(편집 칸이 사라지므로 보관값도 버린다), 참이면 둘 다 남긴다(새 판정 없음).
export function applyBatchResult(state: SelectionState, result: { processedIds: readonly string[]; blocked: readonly { expenseId: string; selectable: boolean }[] }): SelectionState {
  const dropped = new Set([...result.processedIds, ...result.blocked.filter((row) => !row.selectable).map((row) => row.expenseId)]);
  return {
    selectedIds: state.selectedIds.filter((id) => !dropped.has(id)),
    edits: Object.fromEntries(Object.entries(state.edits).filter(([id]) => !dropped.has(id))),
  };
}

// H-5 결과 줄 ③의 두 개수 — 금액이 아니라 건수다(O-18 밖).
export function otherPageCount(selectedIds: readonly string[], pageIds: readonly string[]): number {
  const page = new Set(pageIds);
  return selectedIds.filter((id) => !page.has(id)).length;
}

export function diffCount(selectedIds: readonly string[], diffs: Readonly<Record<string, number>>): number {
  return selectedIds.filter((id) => (diffs[id] ?? 0) !== 0).length;
}

// 보관 · 기억 키 — 보기 + 필터(지급 대상 · 팀 · 증빙 · 검색어 값). 쪽은 들지 않는다(쪽을 넘겨도 같은 키).
// 06.5-08(DM-3 · OI-11): 검색도 필터라 키에 든다 — 검색하면 다른 키라 보관한 선택 · 이체액 편집을 되살리지 않는다.
export function selectionKey(query: Readonly<Record<string, string>>): string {
  return ["pay", query.status ?? "", query.team ?? "", query.evidence ?? "", query.q ?? ""].join("|");
}

// 되살리기(r2 F-2) — 보관한 선택 · 편집 중 서버 rowStates가 「지금 고를 수 있음」인 행 것만 남긴다(지금 쪽 밖 id 포함).
// rowStates에 없거나(범위 밖 · 처리됨 · 지워짐) selectable이 참이 아니면 버린다 — 그 행 증빙 칸 글자가 이유를 말한다.
export function restoreSelection(state: SelectionState, rowStates: readonly { id?: string; selectable?: boolean }[]): SelectionState {
  const open = new Set(rowStates.flatMap((row) => (row.id && row.selectable === true ? [row.id] : [])));
  return {
    selectedIds: state.selectedIds.filter((id) => open.has(id)),
    edits: Object.fromEntries(Object.entries(state.edits).filter(([id]) => open.has(id))),
  };
}

// 다른 쪽 id 유지 — 지금 쪽에 있는 id는 그 쪽 행 판정으로, 지금 쪽 밖 id는 마지막 합 응답(rowStates)이 거짓이라 할 때만 뺀다.
// 응답 전의 지금 쪽 밖 id는 남는다(다음 합 응답이 판정한다).
export function reconcileAcrossPages(
  selectedIds: readonly string[],
  pageRows: readonly { id: string; selectable: boolean }[],
  offPage: ReadonlyMap<string, boolean>,
): string[] {
  const page = new Map(pageRows.map((row) => [row.id, row.selectable]));
  return selectedIds.filter((id) => (page.has(id) ? page.get(id) === true : offPage.get(id) !== false));
}

// 보관(sessionStorage, 탭 수명 — C-1): 행 id · 사람이 적은 이체액 · 차이 사유 · 지금 쪽만. 계좌 · 이름 · 계산 금액은 싣지 않는다.
export type StoredSelection = SelectionState & { page: number };

type SelectionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const KEY_PREFIX = "pay|";

export function readStoredSelection(storage: SelectionStorage, key: string): StoredSelection | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { selectedIds, edits, page } = value as Record<string, unknown>;
    if (!Array.isArray(selectedIds) || !selectedIds.every((id) => typeof id === "string")) return null;
    if (typeof edits !== "object" || edits === null) return null;
    const storedPage = positivePage(page) ?? 1;
    const cleanEdits: Record<string, RowEdit> = {};
    for (const [id, edit] of Object.entries(edits as Record<string, unknown>)) {
      const { transfer, reason, page: editPage } = (edit ?? {}) as Record<string, unknown>;
      // 쪽이 없는 편집(옛 보관)은 보관한 쪽에서 고친 것으로 읽는다.
      if (typeof transfer === "string" && typeof reason === "string") cleanEdits[id] = { transfer, reason, page: positivePage(editPage) ?? storedPage };
    }
    return { selectedIds, edits: cleanEdits, page: storedPage };
  } catch {
    return null;
  }
}

function positivePage(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

// 같은 보기의 다른 필터 키는 지운다(필터를 바꾸면 비운다). 고른 것도 편집도 없으면 이 키도 지운다.
export function writeStoredSelection(storage: SelectionStorage, key: string, state: SelectionState, page: number): void {
  try {
    const others: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const candidate = storage.key(index);
      if (candidate && candidate.startsWith(KEY_PREFIX) && candidate !== key) others.push(candidate);
    }
    for (const candidate of others) storage.removeItem(candidate);
    if (state.selectedIds.length === 0 && Object.keys(state.edits).length === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify({ selectedIds: state.selectedIds, edits: state.edits, page }));
  } catch {
    // 저장소를 쓸 수 없는 브라우저(SecurityError · 용량) — 보관 없이 지금 화면만.
  }
}
