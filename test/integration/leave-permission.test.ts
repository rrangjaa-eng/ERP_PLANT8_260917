import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalInstances, approvalRoutes } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID, createRole } from "@/domain/permissions/roles";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { ForbiddenError } from "@/domain/permissions/can";
import { getApprovalView, rejectDocument, withdrawDocument } from "@/domain/approvals";
import { submitLeave, LEAVE_DOCUMENT_KIND } from "@/domain/leave";
import { resubmitLeave } from "@/domain/leave/resubmit";
import { previewLeaveBalance } from "@/domain/leave/balance-service";
import { countRows, makePerson, NOW_2026 } from "./approvals-fixtures";

// 04.1-02 Task 2 ③(Codex HIGH 02): leave write 판정은 페이지만이 아니라 도메인 첫 줄에서도 한다 —
// authedActionClient는 로그인 · 크기만 보므로, 로그인만 한 사용자가 서버 액션을 직접 불러도 막혀야 한다.
// 회수는 기안자 본인 판정만(계획 가정 4), 반려 문서의 `다시 신청`은 같은 판정 함수가 참일 때만(CX-W1).

const FULL_DAY = { kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-23", half: "" };
const deps = { now: NOW_2026 };

async function counts() {
  return {
    leave: await countRows("leave_requests"),
    instances: await countRows("approval_instances"),
    counters: await countRows("document_counters"),
  };
}

async function actionsOf(viewer: Viewer, leaveId: string) {
  return (await getApprovalView(viewer, { kind: LEAVE_DOCUMENT_KIND, documentId: leaveId }, deps))?.actions;
}

async function setLeaveWrite(allowed: boolean) {
  await setPermissionCell(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "leave", action: "write", allowed });
}

describe("연차 쓰기 권한의 도메인 강제(Codex HIGH 02)", () => {
  it("권한 행 없는 계급의 submitLeave · previewLeaveBalance 직접 호출은 ForbiddenError이고 행 · 번호 카운터가 그대로다", async () => {
    const role = await createRole(SYSTEM_VIEWER, { name: "권한없는계급" });
    const viewer = await makePerson("새계급직원", role.id, "기획1팀");
    await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    const before = await counts();

    const submitError = await submitLeave(viewer, FULL_DAY, deps).catch((error: unknown) => error);
    expect(submitError).toBeInstanceOf(ForbiddenError);
    expect((submitError as Error).message).toBe("연차 신청 권한 없음");
    await expect(previewLeaveBalance(viewer, FULL_DAY, deps)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await counts()).toEqual(before);
  });

  it("write를 끈 뒤: 반려 문서 다시 신청은 ForbiddenError · 차수 2 없음 · 가능 행동 [] · 진행 중 문서는 [회수] 그대로 회수 성공 · 다시 켜면 [다시 신청]", async () => {
    const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    await makePerson("최대표", CEO_ROLE_ID, null);
    const rejected = await submitLeave(drafter, FULL_DAY, deps);
    const afterReject = await rejectDocument(lead, { instanceId: rejected.instanceId, expectedVersion: 1, reason: "일정 겹침" }, deps);
    const inProgress = await submitLeave(drafter, FULL_DAY, deps);
    expect(await actionsOf(drafter, rejected.leaveId)).toEqual(["resubmit"]);

    await setLeaveWrite(false);
    await expect(
      resubmitLeave(drafter, { leaveId: rejected.leaveId, expectedVersion: afterReject.version, input: FULL_DAY }, deps),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const routes = await db.select().from(approvalRoutes).where(eq(approvalRoutes.instanceId, rejected.instanceId));
    expect(routes).toHaveLength(1);
    expect(await actionsOf(drafter, rejected.leaveId)).toEqual([]);
    expect(await actionsOf(drafter, inProgress.leaveId)).toEqual(["withdraw"]);

    await withdrawDocument(drafter, { instanceId: inProgress.instanceId, expectedVersion: 1 }, deps);
    const [withdrawn] = await db.select().from(approvalInstances).where(eq(approvalInstances.id, inProgress.instanceId));
    expect(withdrawn?.status).toBe("withdrawn");

    await setLeaveWrite(true);
    expect(await actionsOf(drafter, rejected.leaveId)).toEqual(["resubmit"]);
  });
});
