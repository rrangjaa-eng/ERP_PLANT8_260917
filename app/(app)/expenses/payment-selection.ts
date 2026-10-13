// 06-17(UI-SPEC S1 「이체액·차이 사유 편집」 · 「합계 줄」): 지급 대상 표의 선택 · 편집 상태 순수 함수. React · 서버 액션을 import하지 않는다 —
// 단위 테스트가 바로 부른다. 금액 셈은 없다(O-18) — 고른 id와 사람이 적은 글자만 다루고, 합 · 차이는 서버 액션(sumSelectedTransfersAction) 응답이다.

// 행마다 사람이 적은 값 — 이체액은 쉼표를 뗀 칸 글자, 사유는 칸 글자 그대로.
export type RowEdit = { transfer: string; reason: string };

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
export function editTransfer(state: SelectionState, input: { id: string; transfer: string; selectable: boolean }): SelectionState {
  const edits = { ...state.edits, [input.id]: { transfer: input.transfer, reason: state.edits[input.id]?.reason ?? "" } };
  const selectedIds = input.selectable && !state.selectedIds.includes(input.id) ? [...state.selectedIds, input.id] : state.selectedIds;
  return { selectedIds, edits };
}

export function editReason(state: SelectionState, input: { id: string; reason: string }): SelectionState {
  const current = state.edits[input.id];
  return { ...state, edits: { ...state.edits, [input.id]: { transfer: current?.transfer ?? "", reason: input.reason } } };
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
