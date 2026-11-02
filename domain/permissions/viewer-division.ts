import type { Viewer } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { findMembershipAtDate as defaultFindMembershipAtDate } from "@/repositories/team-memberships";
import { findTeamById as defaultFindTeamById } from "@/repositories/teams";
import { findUserDivision as defaultFindUserDivision } from "@/repositories/users";
import { findOrgUnitById as defaultFindOrgUnitById } from "@/repositories/org-units";

// 07.3-01(D-7311): 사람의 소속 본부 — 07.1-07이 evidenceScopeFor 안에 둔 규칙을 옮겼다(evidenceScopeFor · fundGate가 함께 쓴다).
// 오늘 서울 발령 팀이 있으면 그 팀과 팀의 본부(팀이 이긴다 — 팀 · 본부 보관은 보지 않는다), 없으면 사람의 본부 칸(보관된 본부면 null).
export type ViewerDivisionDeps = {
  findMembershipAtDate: (viewer: Viewer, userId: string, date: string) => Promise<{ teamId: string } | null>;
  findTeamById: (viewer: Viewer, id: string) => Promise<{ orgUnitId: string } | null>;
  findUserDivision: (viewer: Viewer, id: string) => Promise<{ divisionId: string | null } | null>;
  findOrgUnitById: (viewer: Viewer, id: string) => Promise<{ archivedAt: Date | null } | null>;
  today: () => string;
};

export async function viewerDivision(
  viewer: Viewer,
  deps?: Partial<ViewerDivisionDeps>,
): Promise<{ teamId: string | null; orgUnitId: string | null }> {
  const findMembershipAtDate = deps?.findMembershipAtDate ?? defaultFindMembershipAtDate;
  const membership = await findMembershipAtDate(viewer, viewer.id, (deps?.today ?? seoulToday)());
  const teamId = membership?.teamId ?? null;
  if (teamId) {
    const team = await (deps?.findTeamById ?? defaultFindTeamById)(viewer, teamId);
    return { teamId, orgUnitId: team?.orgUnitId ?? null };
  }
  const divisionId = (await (deps?.findUserDivision ?? defaultFindUserDivision)(viewer, viewer.id))?.divisionId ?? null;
  const division = divisionId ? await (deps?.findOrgUnitById ?? defaultFindOrgUnitById)(viewer, divisionId) : null;
  return { teamId: null, orgUnitId: division && division.archivedAt === null ? divisionId : null };
}
