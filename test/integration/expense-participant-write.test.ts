import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createExpenseFromLines } from "@/domain/expenses";
import { reviveOrInsertMembers } from "@/repositories/project-members";
import { makePerson, teamIdByName } from "./approvals-fixtures";
import { setupApprovedProject, setupExpenseProject, type ExpenseFixture } from "./fixtures/expenses";

// 06.2-10(D-6214 — 사용자 답 대기, 추천 「올리기 허용」으로 진행): 프로젝트의 살아 있는 참여자는 담당 PM · 업무 범위가 덮는 사람과
// 똑같이 그 프로젝트 견적 줄에서 지출결의를 쓴다(260907 `O: server/src/expenses.ts:1823-1836`). 보임이 먼저 — 참여자 아닌 사람은 없는 줄.
// 세계: 기획1팀 P1(PM 박서연 · setupExpenseProject) · 경영관리팀 P3(PM 타팀PM, 진행 · 고객 승인 · 거래처 있는 줄) · P3 참여자(기획1팀).

type World = ExpenseFixture & {
  otherTeamPm: Viewer;
  member: Viewer;
  p3: { id: string; name: string; lineId: string };
};

async function setup(): Promise<World> {
  const fx = await setupExpenseProject();
  const otherTeamPm = await makePerson("타팀PM", DEFAULT_ROLE_ID, "경영관리팀");
  const member = await makePerson("참여자", DEFAULT_ROLE_ID, "기획1팀");
  const p3Name = `경영 행사 ${randomUUID().slice(0, 8)}`;
  const p3 = { ...(await setupApprovedProject(p3Name, await teamIdByName("경영관리팀"), otherTeamPm, fx.stageOneId)), name: p3Name };
  // 픽스처라 참여자 후보 규칙(addProjectMembers)을 거치지 않고 리포지토리로 붙인다 — 이 파일이 재는 것은 지출결의 게이트다.
  await reviveOrInsertMembers(SYSTEM_VIEWER, { projectId: p3.id, userIds: [member.id], addedBy: otherTeamPm.id });
  return { ...fx, otherTeamPm, member, p3 };
}

describe("참여자 지출결의 쓰기 — 만들기 (06.2-10 D-6214)", () => {
  it("다른 팀 참여자는 그 프로젝트 견적 줄로 작성 중 지출결의를 만든다 — 기안자 참여자 · 프로젝트 P3", async () => {
    const w = await setup();
    const result = await createExpenseFromLines(w.member, { lineIds: [w.p3.lineId] });
    expect(result.blocked).toEqual([]);
    expect(result.created).toHaveLength(1);
    const [row] = await db
      .select({ drafterId: expenses.drafterId, projectId: expenses.projectId, number: expenses.number })
      .from(expenses)
      .where(eq(expenses.id, result.created[0]?.expenseId ?? ""));
    expect(row).toEqual({ drafterId: w.member.id, projectId: w.p3.id, number: null });
  });

  it("같은 계급 · 같은 팀의 참여자 아닌 사람에게 그 줄은 없는 줄이다(권한 문구가 아니다 — 보임이 먼저)", async () => {
    const w = await setup();
    const missing = await createExpenseFromLines(w.otherPm, { lineIds: [randomUUID()] });
    const outside = await createExpenseFromLines(w.otherPm, { lineIds: [w.p3.lineId] });
    expect(outside.created).toEqual([]);
    expect(outside.blocked).toEqual([{ lineId: w.p3.lineId, reason: missing.blocked[0]?.reason }]);
  });
});
