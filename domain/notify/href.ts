// 알림 착지 링크(N25 함수 · CONTEXT 「알림 클릭 착지」) — 새 칸 없이 알림 행의 entity · entityId에서 문서 URL을 만든다.
// 문서 id = entityId의 첫 `:` 앞(없으면 전체 — 모든 갈래 공통, 07-22 `{projectId}:{dueDate}`도 같다). 결재 단계만 entityId 전체가 단계 키다(대표 폴백 자리 `{차수 id}:fallback`).
// 판정은 그 화면이 쓰는 기존 보기 판정 그대로이고, 그 viewer가 볼 수 없는 문서면 undefined(T-07-14-01). 갈래별로 한 번씩 묶어 조회한다(N+1 금지 —
// 연차 · 정산 결재 단계만 문서마다 기존 판정 함수를 부른다: 묶음 판정 함수가 없고, 이 판정을 여기서 새로 쓰지 않는다).
// 계급 없는 viewer는 can()이 기본 거부하듯 모든 줄에 링크가 없다(세션도 못 만드는 상태 — fail-closed).
import { listVisibleCertEventIds } from "@/domain/certs/events";
import { EXPENSE_DOCUMENT_KIND, visibleExpenseScope } from "@/domain/expenses/access";
import { canSeeLeaveDocument, LEAVE_DOCUMENT_KIND } from "@/domain/leave/access";
import { can } from "@/domain/permissions/can";
import { projectRowScope } from "@/domain/projects/visibility";
import { canSeeSettlementDocument, SETTLEMENT_DOCUMENT_KIND } from "@/domain/settlements";
import type { Viewer } from "@/domain/viewer";
import { listExpenseIdsInScope } from "@/repositories/expenses";
import { listArchivedProjectIds, listStepDocuments } from "@/repositories/notify-sources";
import { listProjectIdsInScope } from "@/repositories/projects";

export type HrefRow = { entity: string; entityId: string };

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STEP_KEY_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:fallback)?$/i;
// 문서가 아니라 화면 하나로 가는 갈래(지급 주 · 임자 없는 증빙)의 묶음 키.
const SCREEN = "screen";

export function documentIdOf(entityId: string): string {
  const cut = entityId.indexOf(":");
  return cut === -1 ? entityId : entityId.slice(0, cut);
}

function uuidDocumentKey(entityId: string): string | null {
  const id = documentIdOf(entityId);
  return UUID_SHAPE.test(id) ? id : null;
}

type Branch = {
  entities: readonly string[];
  // 알림 행 → 묶음 키(null이면 링크 없음).
  keyOf: (entityId: string) => string | null;
  // 키 묶음 → 볼 수 있는 것만 { 키 → URL }.
  resolve: (viewer: Viewer, keys: string[]) => Promise<Map<string, string>>;
};

// 지출결의 — 상세 화면(app/(app)/expenses/[id])의 canSeeExpense와 같은 범위 조건(visibleExpenseScope · listExpenseIdsInScope)을 한 질의로.
async function expenseHrefs(viewer: Viewer, ids: string[]): Promise<Map<string, string>> {
  const scope = await visibleExpenseScope(viewer);
  const visible = await listExpenseIdsInScope(viewer, { ids, scope, documentKind: EXPENSE_DOCUMENT_KIND });
  return new Map([...visible].map((id) => [id, `/expenses/${id}`]));
}

// 프로젝트 — 상세 화면의 canOpenProject와 같은 조건(범위 안 · 보관이면 보관 보기 범위만)을 두 질의로.
async function projectHrefs(viewer: Viewer, ids: string[]): Promise<Map<string, string>> {
  const scope = await projectRowScope(viewer);
  const visible = await listProjectIdsInScope(viewer, scope, ids);
  const archived = scope.includeArchived ? new Set<string>() : await listArchivedProjectIds(viewer, [...visible]);
  return new Map([...visible].filter((id) => !archived.has(id)).map((id) => [id, `/projects/${id}`]));
}

// 결재 단계 — 단계 → 문서를 한 질의로 찾고 문서 종류별 상세 화면 판정으로.
async function stepHrefs(viewer: Viewer, keys: string[]): Promise<Map<string, string>> {
  const docs = await listStepDocuments(viewer, keys);
  const found = new Map<string, string>();
  const expenseKeys = docs.filter((doc) => doc.documentKind === EXPENSE_DOCUMENT_KIND);
  if (expenseKeys.length > 0) {
    const expenses = await expenseHrefs(viewer, [...new Set(expenseKeys.map((doc) => doc.documentId))]);
    for (const doc of expenseKeys) {
      const url = expenses.get(doc.documentId);
      if (url) found.set(doc.key, url);
    }
  }
  for (const doc of docs) {
    if (doc.documentKind === LEAVE_DOCUMENT_KIND && (await canSeeLeaveDocument(viewer, { id: doc.documentId, drafterId: doc.drafterId }))) {
      found.set(doc.key, `/leave/${doc.documentId}`);
    }
    if (doc.documentKind === SETTLEMENT_DOCUMENT_KIND && doc.projectId && (await canSeeSettlementDocument(viewer, { projectId: doc.projectId }))) {
      found.set(doc.key, `/projects/${doc.projectId}/settlement`);
    }
  }
  return found;
}

// 화면 하나 갈래 — 그 화면의 메뉴 판정 한 번.
function screenBranch(entity: string, menu: string, url: string): Branch {
  return {
    entities: [entity],
    keyOf: () => SCREEN,
    resolve: async (viewer) => new Map((await can(viewer, menu, "write")) ? [[SCREEN, url]] : []),
  };
}

// 확인증 행사 — 상세 화면(getEventDetail)과 같은 범위.
async function certEventHrefs(viewer: Viewer, ids: string[]): Promise<Map<string, string>> {
  const visible = await listVisibleCertEventIds(viewer, ids);
  return new Map([...visible].map((id) => [id, `/certs/events/${id}`]));
}

const BRANCHES: readonly Branch[] = [
  { entities: ["expense", "expense-result"], keyOf: uuidDocumentKey, resolve: expenseHrefs },
  { entities: ["approval-step"], keyOf: (entityId) => (STEP_KEY_SHAPE.test(entityId) ? entityId : null), resolve: stepHrefs },
  { entities: ["project"], keyOf: uuidDocumentKey, resolve: projectHrefs },
  // 지출결의 목록 「지급 대상」 보기 — 지급 권한자(expenses.payments 쓰기)에게만 있는 보기 값(06-15 V-1).
  screenBranch("pay-week", "expenses.payments", `/expenses?status=${encodeURIComponent("지급 대상")}`),
  // 증빙 목록 「공개」(공개됐는데 붙임 0) 거르개 — 증빙 등록 권한자(evidence.intake 쓰기 = 전체 범위).
  screenBranch("evidence-orphans", "evidence.intake", "/expenses/evidence?state=published"),
  { entities: ["cert_event"], keyOf: uuidDocumentKey, resolve: certEventHrefs },
];

export async function notificationHref(viewer: Viewer, rows: readonly HrefRow[]): Promise<(string | undefined)[]> {
  const hrefs: (string | undefined)[] = rows.map(() => undefined);
  if (!viewer.roleId) return hrefs;
  for (const branch of BRANCHES) {
    const keyed = rows.flatMap((row, index) => {
      if (!branch.entities.includes(row.entity)) return [];
      const key = branch.keyOf(row.entityId);
      return key === null ? [] : [{ index, key }];
    });
    if (keyed.length === 0) continue;
    const found = await branch.resolve(viewer, [...new Set(keyed.map((item) => item.key))]);
    for (const item of keyed) hrefs[item.index] = found.get(item.key);
  }
  return hrefs;
}
