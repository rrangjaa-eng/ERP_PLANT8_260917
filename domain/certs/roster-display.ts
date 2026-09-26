import { maskName, normalizeName } from "./format";

// 04.3-02 Task 2 ⑥-b — 공개 목록과 담당자 저장 검사가 같은 판정을 쓰는
// 자리. 순수 함수, `./format` 말고는 아무것도 import하지 않는다(선례
// domain/action-log/filter-keys.ts).
export type WinnerForDisplay = {
  id: string;
  name: string | null; // null = 파기된 자리
  prizeName: string;
  quantity: number;
  distinguishLabel: string | null;
  sortOrder: number;
};

export type PublicRosterEntry = { rowId: string; maskedName: string; prizeLine?: string; label?: string };

type ActiveWinner = WinnerForDisplay & { name: string };

function activeWinners(winners: WinnerForDisplay[]): ActiveWinner[] {
  return winners.filter((w): w is ActiveWinner => w.name !== null);
}

function sortedByActualName<T extends { name: string; sortOrder: number }>(winners: T[]): T[] {
  return [...winners].sort((a, b) => {
    const byName = normalizeName(a.name).localeCompare(normalizeName(b.name), "ko");
    return byName !== 0 ? byName : a.sortOrder - b.sortOrder;
  });
}

function prizeLineOf(w: WinnerForDisplay): string {
  return `${w.prizeName} ${w.quantity}개`;
}

// 내부 편집 표 미리보기 열 — hasCollision 여부는 호출자가 판정해 넘긴다.
export function publicShape(
  winner: WinnerForDisplay,
  hasCollision: boolean,
): { maskedName: string; secondLine?: string } {
  const maskedName = maskName(normalizeName(winner.name ?? ""));
  const show = hasCollision || Boolean(winner.distinguishLabel);
  if (!show) return { maskedName };
  const prizeLine = prizeLineOf(winner);
  const secondLine = winner.distinguishLabel ? `${prizeLine} · ${winner.distinguishLabel}` : prizeLine;
  return { maskedName, secondLine };
}

// 수령자 화면 DTO — 실제 이름 가나다순 정렬 → 가림 → 겹침·구별 표시가
// 있을 때만 2행(prizeLine · label)을 붙인다. 파기된 자리는 뺀다.
export function buildPublicRows(winners: WinnerForDisplay[]): PublicRosterEntry[] {
  const active = sortedByActualName(activeWinners(winners));
  const maskedNames = active.map((w) => maskName(normalizeName(w.name)));
  const nameCounts = new Map<string, number>();
  for (const name of maskedNames) nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);

  return active.map((w, i) => {
    const maskedName = maskedNames[i]!;
    const hasCollision = (nameCounts.get(maskedName) ?? 0) > 1;
    if (!hasCollision && !w.distinguishLabel) return { rowId: w.id, maskedName };
    const row: PublicRosterEntry = { rowId: w.id, maskedName, prizeLine: prizeLineOf(w) };
    if (w.distinguishLabel) row.label = w.distinguishLabel;
    return row;
  });
}

// 공개 모양(가린 이름 + 실제로 보일 2행 문자열)이 같은 당첨자 id 묶음 —
// 가린 이름이 같은 두 사람은 (겹침으로) 2행이 함께 드러나므로, 그 2행
// 문자열까지 같으면 화면에서 서로 구별할 수 없다.
export function findIndistinguishable(winners: WinnerForDisplay[]): string[][] {
  const active = activeWinners(winners);
  const groups = new Map<string, string[]>();
  for (const w of active) {
    const maskedName = maskName(normalizeName(w.name));
    const label = w.distinguishLabel ? ` · ${w.distinguishLabel}` : "";
    const signature = `${maskedName}\u0000${prizeLineOf(w)}${label}`;
    const group = groups.get(signature) ?? [];
    group.push(w.id);
    groups.set(signature, group);
  }
  return [...groups.values()].filter((ids) => ids.length > 1);
}
