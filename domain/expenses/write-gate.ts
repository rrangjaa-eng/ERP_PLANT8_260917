import { coversProjectTeam, type ActorTeamScope } from "@/domain/projects/status";

// 06.2(D-6214): 지출결의 쓰기 = 담당 PM ∨ 업무 범위가 덮음 ∨ 살아 있는 참여 — 네 입구가 이 함수 하나를 쓴다.
// 보임은 호출 전에 `findProjectInScope`가 정한다(없음이 권한 없음보다 먼저 — 260907 `O: server/src/expenses.ts:1834` 「없는 것과 같게 답한다」).
// 프로젝트 쓰기(원장 · 상태 · 참여자)는 이 함수와 무관하다(D-6213).
export function canWriteExpenseOnProject(
  project: { id: string; pmUserId: string; teamId: string },
  actor: { viewerId: string; teamScope: ActorTeamScope; memberProjectIds: ReadonlySet<string> },
): boolean {
  return project.pmUserId === actor.viewerId || coversProjectTeam(actor.teamScope, project.teamId) || actor.memberProjectIds.has(project.id);
}
