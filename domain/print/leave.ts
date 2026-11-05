import type { Viewer } from "@/domain/viewer";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { canSeeLeaveDocument, LEAVE_DOCUMENT_KIND } from "@/domain/leave/access";
import { getLeaveBalancesForRequests } from "@/domain/leave/balance-service";
import type { LeaveRequestBalanceDto } from "@/domain/leave/dto";
import { currentApprovalRound } from "@/domain/print/current-round";
import { seoulToday } from "@/lib/dates";
import { findLeaveRequestById } from "@/repositories/leave-requests";
import { findOrgUnitById } from "@/repositories/org-units";
import { findRoleById } from "@/repositories/roles";
import { findTeamById } from "@/repositories/teams";
import { findUserById } from "@/repositories/users";

// 07.4-02 D-7413: 연차 신청서 종이 재료 — 결재자가 읽는 기안자의 소속 · 상신일 · 잔고. 입사일 · 퇴직일 · 부여 · 적립 칸은 애초에 없다.
// 잔고는 연차 상세 화면 잔고 행과 같은 함수(getLeaveBalancesForRequests)의 값이고 진행 중 문서에만 있다(카드 E1 · E2).
export type LeavePrintDto = {
  submittedAt: Date | null;
  divisionName: string | null;
  teamName: string | null;
  roleName: string | null;
  balance: Partial<LeaveRequestBalanceDto> | null;
};

export const LEAVE_PRINT_DTO_SPEC: DtoSpec<LeavePrintDto, LeavePrintDto> = {
  fields: [
    { key: "submittedAt", from: "submittedAt", infoItem: "leave.value" },
    { key: "divisionName", from: "divisionName", infoItem: "org_unit.value" },
    { key: "teamName", from: "teamName", infoItem: "team.value" },
    { key: "roleName", from: "roleName", infoItem: "role.value" },
    { key: "balance", from: "balance", infoItem: "leave.value" },
  ],
};

registerDto({
  name: "leavePrint",
  fields: LEAVE_PRINT_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

const IN_PROGRESS: readonly string[] = ["submitted", "in_review"];

// getLeave와 같은 문서 보임 판정을 먼저 한다 — 거짓이면 사람 행 · 잔고를 읽지 않고 null(결재자 아닌 사람이 기안자 재료를 읽는 길이 없다).
// 사람 행은 roleId · divisionId 두 칸만 쓰고 함수 밖으로 내지 않는다.
export async function getLeavePrint(viewer: Viewer, leaveId: string, deps?: { now?: Date }): Promise<Partial<LeavePrintDto> | null> {
  const row = await findLeaveRequestById(viewer, { id: leaveId, documentKind: LEAVE_DOCUMENT_KIND });
  if (!row) return null;
  if (!(await canSeeLeaveDocument(viewer, row, { today: seoulToday(deps?.now) }))) return null;
  const drafter = await findUserById(viewer, row.drafterId);
  if (!drafter) return null;

  // 판정을 지난 이 행 하나만 deps.leaves로 넘겨 다시 판정하지 않는다. 승인 · 반려 · 회수 문서는 읽지도 않는다(화면 CXF-B-F03과 같은 조건).
  const balance =
    row.status !== null && IN_PROGRESS.includes(row.status)
      ? ((await getLeaveBalancesForRequests(viewer, [leaveId], { now: deps?.now, leaves: [row] })).get(leaveId) ?? null)
      : null;

  // 소속은 지금 차수 결재선의 상신 당시 스냅숏이 출처다(발령 이력으로 날짜를 다시 맞추지 않는다). 팀이 없던 기안자는 사람의 본부 칸(보관 본부는 없음).
  const round = await currentApprovalRound(viewer, { kind: LEAVE_DOCUMENT_KIND, documentId: leaveId });
  let teamName: string | null = null;
  let divisionName: string | null = null;
  if (round?.drafterTeamId) {
    teamName = (await findTeamById(viewer, round.drafterTeamId))?.name ?? null;
    divisionName = round.drafterOrgUnitId ? ((await findOrgUnitById(viewer, round.drafterOrgUnitId))?.name ?? null) : null;
  } else if (drafter.divisionId) {
    const division = await findOrgUnitById(viewer, drafter.divisionId);
    divisionName = division && division.archivedAt === null ? division.name : null;
  }
  const roleName = drafter.roleId ? ((await findRoleById(viewer, drafter.roleId))?.name ?? null) : null;

  return project(viewer, { submittedAt: round?.submittedAt ?? null, divisionName, teamName, roleName, balance }, LEAVE_PRINT_DTO_SPEC);
}
