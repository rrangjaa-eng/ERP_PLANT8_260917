// 07.2-07 X3(D-7287 · D-7288) — 사유 고르기의 순수 규칙. 저장은 글만이라 선택 상태는 화면 안에서만 산다.

export const OTHER_LABEL = "기타";

export type ReasonState = { text: string; prevLabel: string | null };

// 항목을 고르면 글이 그 문구로 채워진다. 이미 이전 시작말로 시작하는 글이면 시작말만 바꾸고 덧붙인 뒤쪽은 둔다.
// 직접 쓴 글이면 글은 두고 선택만 바뀐다. `기타`는 자동으로 넣은 시작말만 지우고 직접 쓴 글은 남긴다(사용자 결정 2026-11-10).
// 글이 maxLength를 넘으면 상한까지 자른다(항목 문구에는 길이 상한이 없다).
export function pickReason(state: ReasonState, label: string, maxLength?: number): ReasonState {
  if (label === OTHER_LABEL) {
    if (state.prevLabel !== null && state.text.startsWith(state.prevLabel)) {
      return { text: state.text.slice(state.prevLabel.length).trimStart(), prevLabel: null };
    }
    return { text: state.text, prevLabel: null };
  }
  let next: ReasonState;
  if (state.text === "") next = { text: label, prevLabel: label };
  else if (state.prevLabel !== null && state.text.startsWith(state.prevLabel)) {
    next = { text: label + state.text.slice(state.prevLabel.length), prevLabel: label };
  } else next = { text: state.text, prevLabel: label };
  if (maxLength !== undefined && next.text.length > maxLength) {
    const text = next.text.slice(0, maxLength);
    return { text, prevLabel: next.prevLabel !== null && !text.startsWith(next.prevLabel) ? text : next.prevLabel };
  }
  return next;
}

// 다시 열기: 저장된 글이 항목 문구와 같으면 그 항목, 글이 있는데 아니면 `기타`, 비었으면 자리표시(""). 완전 일치만.
export function selectedOptionOf(text: string, labels: readonly string[]): string {
  if (text === "") return "";
  return labels.includes(text) ? text : OTHER_LABEL;
}
