// 06.2-12(S2 · 떼기 · 되돌리기): 참여자 섹션 화면 낱말 — 순수 함수(issue-request-word.ts 꼴).

// 서버 일반 문구(06.2-05) — 되돌리기를 치운 줄에서는 할 수 없는 「다시 시도」를 말하지 않는다(cards/delete-undo.tsx `IMPOSSIBLE_NEXT` 꼴).
const SERVER_GENERIC = "처리 실패 · 다시 시도";

export function memberRemovedLine(name: string): string {
  return `${name} 뗌`;
}

export function memberUndoFailedLine(serverError: string | null): string {
  if (serverError === null) return "되돌리기 실패 · 다시 시도";
  if (serverError === SERVER_GENERIC) return "되돌리기 실패";
  return `되돌리기 실패 · ${serverError}`;
}

export function memberAddedStatus(count: number): string {
  return `참여자 ${count}명 더함`;
}

// 고르기 결과 줄 — 검색으로 가려진 고름까지 센 이름 목록을 받는다(06.2-07 `resultLineMany`).
export function memberPickLine(names: string[]): string | null {
  const [first] = names;
  if (first === undefined) return null;
  return names.length === 1 ? `${first} 선택` : `${first} 외 ${names.length - 1}명 선택`;
}

export type MemberAddPlacement = { tertiary: "none" | "pc" | "all"; headerChild: boolean };

// 표 아래 3차 `참여자 더하기`와 폰 「더보기」 자식의 자리 — 서버 불린(`canEdit` ∧ `hasCandidates`)만 본다.
// 참여자 0(담당 PM 행만)이면 폰에도 3차가 보여 빈 상태의 첫 행동이 되고, 아니면 폰은 「더보기」 자식으로만 연다.
export function memberAddPlacement({ canEdit, hasCandidates, rowCount }: { canEdit: boolean; hasCandidates: boolean; rowCount: number }): MemberAddPlacement {
  if (!canEdit || !hasCandidates) return { tertiary: "none", headerChild: false };
  return { tertiary: rowCount === 0 ? "all" : "pc", headerChild: true };
}
