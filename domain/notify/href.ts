// 알림 착지 링크(N25 함수 · CONTEXT 「알림 클릭 착지」) — 새 칸 없이 알림 행의 entity · entityId에서 문서 URL을 만든다.
// 문서 id = entityId의 첫 `:` 앞(없으면 전체 — 모든 갈래 공통, 07-22 `{projectId}:{dueDate}`도 같다).
// 판정은 그 화면이 쓰는 기존 보기 판정 그대로이고, 그 viewer가 볼 수 없는 문서면 undefined(T-07-14-01). 갈래별로 한 번씩 묶어 조회한다(N+1 금지).
// 계급 없는 viewer는 can()이 기본 거부하듯 모든 줄에 링크가 없다(세션도 못 만드는 상태 — fail-closed).
import { EXPENSE_DOCUMENT_KIND, visibleExpenseScope } from "@/domain/expenses/access";
import type { Viewer } from "@/domain/viewer";
import { listExpenseIdsInScope } from "@/repositories/expenses";

export type HrefRow = { entity: string; entityId: string };

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function documentIdOf(entityId: string): string {
  const cut = entityId.indexOf(":");
  return cut === -1 ? entityId : entityId.slice(0, cut);
}

type Branch = {
  entities: readonly string[];
  // 문서 id 묶음 → 볼 수 있는 것만 { 문서 id → URL }.
  resolve: (viewer: Viewer, ids: string[]) => Promise<Map<string, string>>;
};

// 지출결의 — 상세 화면(app/(app)/expenses/[id])의 canSeeExpense와 같은 범위 조건(visibleExpenseScope · listExpenseIdsInScope)을 한 질의로.
async function expenseHrefs(viewer: Viewer, ids: string[]): Promise<Map<string, string>> {
  const scope = await visibleExpenseScope(viewer);
  const visible = await listExpenseIdsInScope(viewer, { ids, scope, documentKind: EXPENSE_DOCUMENT_KIND });
  return new Map([...visible].map((id) => [id, `/expenses/${id}`]));
}

const BRANCHES: readonly Branch[] = [{ entities: ["expense", "expense-result"], resolve: expenseHrefs }];

export async function notificationHref(viewer: Viewer, rows: readonly HrefRow[]): Promise<(string | undefined)[]> {
  const hrefs: (string | undefined)[] = rows.map(() => undefined);
  if (!viewer.roleId) return hrefs;
  for (const branch of BRANCHES) {
    const indexes = rows.flatMap((row, index) => (branch.entities.includes(row.entity) ? [index] : []));
    const ids = [...new Set(indexes.map((index) => documentIdOf(rows[index]?.entityId ?? "")).filter((id) => UUID_SHAPE.test(id)))];
    if (ids.length === 0) continue;
    const found = await branch.resolve(viewer, ids);
    for (const index of indexes) hrefs[index] = found.get(documentIdOf(rows[index]?.entityId ?? ""));
  }
  return hrefs;
}
