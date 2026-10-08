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
