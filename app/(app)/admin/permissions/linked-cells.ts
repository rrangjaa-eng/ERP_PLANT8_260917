// 07-21(R7 화면 · SYSTEM 개정 8 · K4): 권한표 딸린 칸 — 07-15 `GridDto.requires`(열 id → 켤 때 같이 켜질 열 id, 끝까지 닫힌 지도)만 읽는
// 순수 함수. 클라이언트 번들에 들어가므로 서버 모듈을 import하지 않는다 — 07-15 `dependentCells`와의 동치는 단위 시험이 지킨다.
// 저장 · 상한 · 자기 잠금 · 정의 밖 칸 거부는 서버가 호출마다 하고 응답 `changed`가 최종이다 — 여기는 표시와 호출 순서뿐이다.

export type RequiresMap = Readonly<Record<string, readonly string[]>>;

export type LinkedChange = { columnId: string; before: boolean; after: boolean };

export type LinkedStep = { columnId: string; next: boolean };

// 켬이면 그 열이 필요로 하는 열(위로 끝까지), 끔이면 그 열을 필요로 하는 열(아래로 끝까지) — 요청 열 자신은 뺀다.
export function linkedCells(requires: RequiresMap, columnId: string, next: boolean): string[] {
  if (next) return [...(requires[columnId] ?? [])];
  return Object.keys(requires).filter((candidate) => requires[candidate]?.includes(columnId));
}

// 결과 줄 `되돌리기`의 호출 순서 — 그 누름으로 실제 바뀐 칸(`changed`)만 이전 값으로. 끔으로 돌릴 칸은 딸린 쪽 먼저, 켬으로 돌릴 칸은
// 필요한 쪽 먼저 — 그래야 서버 연쇄가 원래 켜져 있던 칸을 건드리지 않는다. 지도가 닫혀 있어 A가 B를 필요로 하면 A의 필요 수가 더 많다.
export function revertSteps(requires: RequiresMap, changed: readonly LinkedChange[]): LinkedStep[] {
  const depth = (columnId: string) => requires[columnId]?.length ?? 0;
  const offs = changed.filter((change) => !change.before).sort((a, b) => depth(b.columnId) - depth(a.columnId));
  const ons = changed.filter((change) => change.before).sort((a, b) => depth(a.columnId) - depth(b.columnId));
  return [...offs, ...ons].map((change) => ({ columnId: change.columnId, next: change.before }));
}
