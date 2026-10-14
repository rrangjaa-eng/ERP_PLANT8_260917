// 새 건 첫 저장(파일 올리기) 뒤 제출 판정 — 고친 값이 있으면 저장된 건에 다시 저장한다.
export type SavedSlip = { version: number; lineId: string | null; projectId: string | null; snapshot: string };

type OutOfQuoteLink = { kind: "out_of_quote"; projectId: string; itemName: string | null };

/** 첫 저장 입력 + 사용한 사람 — 제출 때 같은 모양으로 비교한다. */
export function slipSnapshot(payload: object, usedByUserId: string | null): string {
  return JSON.stringify({ ...payload, usedByUserId });
}

/** 견적 외 비용은 같은 프로젝트면 첫 저장이 만든 줄 id로 보낸다(새 줄을 또 만들지 않는다) — 프로젝트를 바꿨으면 수정 경로처럼 그대로. */
export function resaveLink<T extends { kind: string } | null>(link: T, saved: Pick<SavedSlip, "lineId" | "projectId">): T | { kind: "line"; lineId: string } {
  if (link?.kind === "out_of_quote" && saved.lineId && (link as unknown as OutOfQuoteLink).projectId === saved.projectId) return { kind: "line", lineId: saved.lineId };
  return link;
}
