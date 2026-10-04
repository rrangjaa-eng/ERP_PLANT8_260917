import type { Viewer } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { can } from "@/domain/permissions/can";
import { loadActorTeamScope } from "@/domain/projects/status";
import { listCurrentSteps, type CurrentStep } from "@/domain/approvals";
import { isExpenseInScope, type ExpenseScope } from "@/repositories/expenses";

// 05-08(사용자 결정 2026-09-26 #5 · D-17): 지출결의가 보이는 사람 — 한 규칙, 두 모양.
//   기안자 ∪ 결재 관련자(처리한 사람 · 지금 단계 후보) ∪ (`expenses.team` 보기 ∧ 문서의 팀 = 내 지금 팀) ∪ (계급 업무 범위 company ∧ `expenses` 보기).
//   작성 중(번호 없음)은 기안자만. 그 밖은 없는 문서(404).
// visibleExpenseScope는 이 규칙을 리포지토리 조건(repositories/expenses.ts scopeCondition)의 입력으로 만들고, 목록 · 합계 · 문서 하나
// (canSeeExpense) 판정이 그 조건 하나를 쓴다. 판정은 메뉴 권한과 계급 업무 범위로만 한다 — 역할 이름 조건이 없다.

// 결재 문서 종류 키 — domain/expenses/index.ts가 이 값을 다시 내보낸다(index → access 한 방향, 순환 없음).
export const EXPENSE_DOCUMENT_KIND = "expense";

export type ExpenseAccessDeps = { today?: string };

export type VisibleExpenseScope = ExpenseScope & {
  // 진행 중 인스턴스의 지금 단계(목록의 `{단계} 결재 중` 재료) — 같은 walk 결과를 다시 계산하지 않게 함께 돌려준다.
  currentSteps: Map<string, CurrentStep>;
};

// 「내 지금 팀」 · 업무 범위는 권한 판정 사실이라 정보 노출 투영을 거치지 않는 loadActorTeamScope로 읽는다(Phase 4 판정과 같은 입구).
export async function visibleExpenseScope(viewer: Viewer, deps?: ExpenseAccessDeps): Promise<VisibleExpenseScope> {
  const today = deps?.today ?? seoulToday();
  const [canView, canTeam, teamScope, currentSteps] = await Promise.all([
    can(viewer, "expenses", "view"),
    can(viewer, "expenses.team", "view"),
    loadActorTeamScope(viewer, { todayKst: today }),
    listCurrentSteps(viewer, { kind: EXPENSE_DOCUMENT_KIND }),
  ]);
  const company = canView && teamScope.workScope === "company";
  const currentHolderInstanceIds = [...currentSteps].filter(([, step]) => step.viewerIsCandidate).map(([instanceId]) => instanceId);
  return {
    drafterId: viewer.id,
    company,
    // 팀 갈래도 `expenses` 보기를 요구한다 — 목록(메뉴 보기)과 문서 · 증빙 GET이 같은 답을 내게(05-08 검토 #2).
    teamIds: canView && canTeam && teamScope.teamId ? [teamScope.teamId] : [],
    actedByUserId: viewer.id,
    currentHolderInstanceIds,
    currentSteps,
  };
}

// 문서 하나 — 목록과 같은 범위 조건. 기안자 · 작성 중은 조회 없이 가른다.
export async function canSeeExpense(
  viewer: Viewer,
  expense: { id: string; drafterId: string; number: string | null },
  deps?: ExpenseAccessDeps,
): Promise<boolean> {
  if (expense.drafterId === viewer.id) return true;
  if (expense.number === null) return false;
  const scope = await visibleExpenseScope(viewer, deps);
  return isExpenseInScope(viewer, { id: expense.id, scope, documentKind: EXPENSE_DOCUMENT_KIND });
}
