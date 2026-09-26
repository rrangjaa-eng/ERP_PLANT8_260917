// D-55 · CEO 리뷰 B-33 — 이전 차수 줄의 연결 문서를 계보(copied_from_line_id) 사슬로 현재 차수(최신 순번) 줄에 잇는다.
// 문서 행을 옮기지 않는다. 사슬에 닿지 않는 줄(새 차수에서 빠진 줄)의 문서는 `detached`로 따로 돌려준다 — 견적 외
// 비용처럼 프로젝트에 남는다. 문서 출처가 Phase 5라 이 페이즈에는 순수 함수와 빈 결과뿐이다.
export type LineageLine = { id: string; revisionSeq: number; copiedFromLineId: string | null };

export function resolveLinkedDocumentsByLineage<Doc>(
  lines: readonly LineageLine[],
  docsByLineId: ReadonlyMap<string, readonly Doc[]>,
): { byCurrentLine: Map<string, Doc[]>; detached: Doc[] } {
  const byId = new Map(lines.map((line) => [line.id, line]));
  const latestSeq = Math.max(...lines.map((line) => line.revisionSeq));
  const reached = new Set<string>();
  const byCurrentLine = new Map<string, Doc[]>();
  for (const line of lines) {
    if (line.revisionSeq !== latestSeq) continue;
    const docs: Doc[] = [];
    for (let cursor: LineageLine | undefined = line; cursor; cursor = cursor.copiedFromLineId ? byId.get(cursor.copiedFromLineId) : undefined) {
      reached.add(cursor.id);
      docs.push(...(docsByLineId.get(cursor.id) ?? []));
    }
    if (docs.length > 0) byCurrentLine.set(line.id, docs);
  }
  const detached = [...docsByLineId].filter(([lineId]) => !reached.has(lineId)).flatMap(([, docs]) => docs);
  return { byCurrentLine, detached };
}
