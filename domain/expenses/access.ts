import type { Viewer } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { rowScopeFor, type RowScope } from "@/domain/permissions/scope-for";
import { listCurrentSteps, type CurrentStep } from "@/domain/approvals";
import { isExpenseInScope, type ExpenseScope } from "@/repositories/expenses";

// 05-08(사용자 결정 2026-09-26 #5 · D-17) · 06.2(D-6202 · D-6205 · D-6217 · D-6218): 지출결의가 보이는 사람 — 한 규칙.
//   기안자 ∪ 결재 관련자(처리한 사람 · 지금 단계 후보) ∪ 보는 범위(view_scope — 문서 팀 · 담당 PM · 참여자, `expenses` 보기 전제).
//   `expenses.team`은 판정에 쓰지 않는다(D-6217) · 업무 범위도(D-6202). 작성 중(번호 없음)은 기안자만. 그 밖은 없는 문서(404).
// visibleExpenseScope는 이 규칙을 리포지토리 조건(repositories/expenses.ts scopeCondition)의 입력으로 만들고, 목록 · 합계 · 문서 하나
// (canSeeExpense) 판정이 그 조건 하나를 쓴다. 역할 이름 조건이 없다.

// 결재 문서 종류 키 — domain/expenses/index.ts가 이 값을 다시 내보낸다(index → access 한 방향, 순환 없음).
export const EXPENSE_DOCUMENT_KIND = "expense";

// 없는 문서와 같은 답 — index.ts가 다시 내보낸다. 06.2-02: route-doc.ts도 index를 거치지 않고 쓰도록 여기 둔다(런타임 순환 금지 — test/unit/import-cycles).
export class ExpenseNotFoundError extends UserFacingError {
  constructor() {
    super("없는 지출결의 · 새로 고침");
  }
}

export type ExpenseAccessDeps = {
  today?: string;
  // 진행 중 인스턴스 walk — 테스트가 호출 여부를 세려고 주입한다(05-08 검토 #4).
  listCurrentSteps?: typeof listCurrentSteps;
};

export type VisibleExpenseScope = ExpenseScope & {
  // 진행 중 인스턴스의 지금 단계(목록의 `{단계} 결재 중` 재료) — 같은 walk 결과를 다시 계산하지 않게 함께 돌려준다.
  currentSteps: Map<string, CurrentStep>;
};

// 보는 범위 서술자(06.2-01 rowScopeFor — `expenses` 보기가 없으면 none: 목록(메뉴 보기)과 문서 · 증빙 GET이 같은 답, 05-08 검토 #2).
// 기준일을 주입받은 호출(테스트 · 목록 · 지급 대상)은 요청 memo를 건너뛴다 — 오늘(KST)이면 요청 안 memo를 그대로 쓴다.
function expenseRowScope(viewer: Viewer, injectedToday: string | undefined): Promise<RowScope> {
  return injectedToday === undefined ? rowScopeFor(viewer, "expense") : rowScopeFor(viewer, "expense", { today: () => injectedToday });
}

// 지금 단계 후보 갈래(walk가 드는 것)만 빼고 나머지 갈래 — 기안자 · 보는 범위 · 처리 기록(EXISTS).
async function scopeWithoutCandidates(viewer: Viewer, injectedToday: string | undefined): Promise<ExpenseScope> {
  return {
    drafterId: viewer.id,
    rowScope: await expenseRowScope(viewer, injectedToday),
    actedByUserId: viewer.id,
    currentHolderInstanceIds: [],
  };
}

function candidateInstanceIds(currentSteps: Map<string, CurrentStep>): string[] {
  return [...currentSteps].filter(([, step]) => step.viewerIsCandidate).map(([instanceId]) => instanceId);
}

export async function visibleExpenseScope(viewer: Viewer, deps?: ExpenseAccessDeps): Promise<VisibleExpenseScope> {
  const today = deps?.today ?? seoulToday();
  const [scope, currentSteps] = await Promise.all([
    scopeWithoutCandidates(viewer, deps?.today),
    (deps?.listCurrentSteps ?? listCurrentSteps)(viewer, { kind: EXPENSE_DOCUMENT_KIND }, { today }),
  ]);
  return { ...scope, currentHolderInstanceIds: candidateInstanceIds(currentSteps), currentSteps };
}

// 문서 하나 — 목록과 같은 범위 조건. 순서: 기안자 · 작성 중(조회 없음) → 보는 범위 · 처리 기록(한 줄 조회) → 그래도 아니면 그때만
// 진행 중 인스턴스를 walk해 지금 단계 후보(05-08 검토 #4 — 문서 화면 한 번에 판정이 여러 번 돌아 walk 비용을 필요할 때만 낸다).
export async function canSeeExpense(
  viewer: Viewer,
  expense: { id: string; drafterId: string; number: string | null },
  deps?: ExpenseAccessDeps,
): Promise<boolean> {
  if (expense.drafterId === viewer.id) return true;
  if (expense.number === null) return false;
  const today = deps?.today ?? seoulToday();
  const scope = await scopeWithoutCandidates(viewer, deps?.today);
  if (await isExpenseInScope(viewer, { id: expense.id, scope, documentKind: EXPENSE_DOCUMENT_KIND })) return true;
  const holderIds = candidateInstanceIds(await (deps?.listCurrentSteps ?? listCurrentSteps)(viewer, { kind: EXPENSE_DOCUMENT_KIND }, { today }));
  if (holderIds.length === 0) return false;
  return isExpenseInScope(viewer, { id: expense.id, scope: { ...scope, currentHolderInstanceIds: holderIds }, documentKind: EXPENSE_DOCUMENT_KIND });
}
