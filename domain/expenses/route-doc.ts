import { z } from "zod";
import type { Viewer } from "@/domain/viewer";
import { previewRoute, type RoutePreviewDTO } from "@/domain/approvals";
import { EXPENSE_DOCUMENT_KIND, ExpenseNotFoundError } from "@/domain/expenses/access";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { findExpenseById } from "@/repositories/expenses";
import { findProjectById } from "@/repositories/projects";

// 06.2(D-6215): 지출결의 결재선의 문서 팀 — 견적 줄 문서 = 프로젝트 팀(projects.team_id), 팀 비용 = 귀속 팀(attributed_team_id).
// 서버가 문서 행에서 계산한다(기안자가 고를 수 없다). 260907 `O: server/src/expenses.ts:1012-1024` RouteDoc.
export function expenseRouteDocTeamId(projectTeamId: string | null, attributedTeamId: string | null): string | null {
  return projectTeamId ?? attributedTeamId ?? null;
}

// 06.2(D-6224): 문서 id로 부르는 결재선 미리보기 — 문서 팀을 풀어 행사 담당 팀 단계의 담당자 이름까지 낸다.
// 기안자 본인 문서만(작성 중 폼 화면이 부르는 자리) — 남의 문서 · 없는 id는 존재를 새지 않고 없는 문서다.
// 프로젝트 행은 원시 읽기 — 기안자 본인 문서라 D-6205 ①로 보인다(row-scope-disposition 처분표).
// 06.2-09(/review R-3 · /cso CSO-4): 제출(submitExpense)과 같은 판정 순서 — 기안자 본인 → 지출결의 쓰기 → 프로젝트 행(팀 비용 문서만 없어도 된다).
export async function previewExpenseRoute(viewer: Viewer, input: { expenseId: string }): Promise<RoutePreviewDTO> {
  const row = z.string().uuid().safeParse(input.expenseId).success ? await findExpenseById(viewer, input.expenseId) : null;
  if (!row || row.drafterId !== viewer.id) throw new ExpenseNotFoundError();
  if (!(await can(viewer, "expenses", "write"))) throw new ForbiddenError("지출결의 작성 권한 없음");
  const projectRow = row.projectId ? await findProjectById(viewer, row.projectId) : null;
  // 팀 비용 문서 = 프로젝트 · 견적 줄 둘 다 없음(domain/expenses/index.ts isTeamCostRow와 같은 조건 — 그 파일이 이 파일을 import해 함수로 가져오지 않는다).
  if (!projectRow && !(row.projectId === null && row.quoteLineId === null)) throw new ExpenseNotFoundError();
  return previewRoute(viewer, { kind: EXPENSE_DOCUMENT_KIND, doc: { teamId: expenseRouteDocTeamId(projectRow?.teamId ?? null, row.attributedTeamId) } });
}
