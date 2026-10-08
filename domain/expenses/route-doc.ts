// 06.2(D-6215): 지출결의 결재선의 문서 팀 — 견적 줄 문서 = 프로젝트 팀(projects.team_id), 팀 비용 = 귀속 팀(attributed_team_id).
// 서버가 문서 행에서 계산한다(기안자가 고를 수 없다). 260907 `O: server/src/expenses.ts:1012-1024` RouteDoc.
export function expenseRouteDocTeamId(projectTeamId: string | null, attributedTeamId: string | null): string | null {
  return projectTeamId ?? attributedTeamId ?? null;
}
