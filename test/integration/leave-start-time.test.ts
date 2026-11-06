import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { leaveRequests } from "@/db/schema";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { rejectDocument } from "@/domain/approvals";
import { submitLeave, LeaveValidationError } from "@/domain/leave";
import { resubmitLeave } from "@/domain/leave/resubmit";
import { countRows, makePerson, NOW_2026 } from "./approvals-fixtures";

// PR #368 리뷰 P2-1 ⑥(PU11 · D-7257 · D-7258): 반반차 시작 시각은 서버 입구(제출 · 다시 신청)가 막는다 — 시각 없음 · 형식 오류는
// LeaveValidationError(시작 시각 칸)이고 행이 늘지 않는다. 반반차가 아닌 종류에 온 시각은 버려 start_time = null로 저장한다.
const deps = { now: NOW_2026 };
const TIME_ERROR = [{ field: "startTime", message: "시작 시각 형식 오류 · 14:00처럼" }];

async function storedStartTime(leaveId: string): Promise<string | null | undefined> {
  const [row] = await db.select({ startTime: leaveRequests.startTime }).from(leaveRequests).where(eq(leaveRequests.id, leaveId));
  return row?.startTime;
}

async function org() {
  const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
  const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
  await makePerson("최대표", CEO_ROLE_ID, null);
  return { drafter, lead };
}

describe("반반차 시작 시각 — 서버 입구", () => {
  it("제출: 시각 없음 · 빈 값 · 형식 오류(25:00 · 9:00 · 14:00:00)는 시작 시각 칸 오류이고 행이 늘지 않는다", async () => {
    const { drafter } = await org();
    const before = await countRows("leave_requests");
    for (const startTime of [undefined, null, "", "25:00", "9:00", "14:00:00"]) {
      const error = await submitLeave(drafter, { kind: "quarter_day", startDate: "2026-09-22", endDate: "2026-09-22", half: "", startTime }, deps).catch(
        (caught: unknown) => caught,
      );
      expect(error, String(startTime)).toBeInstanceOf(LeaveValidationError);
      expect((error as LeaveValidationError).fieldErrors).toEqual(TIME_ERROR);
    }
    expect(await countRows("leave_requests")).toBe(before);
  });

  it("제출: 반반차는 시각을 저장하고, 종일 · 반차 · 재택에 온 시각은 null로 저장한다", async () => {
    const { drafter } = await org();
    const quarter = await submitLeave(drafter, { kind: "quarter_day", startDate: "2026-09-22", endDate: "2026-09-22", half: "am", startTime: "14:00" }, deps);
    expect(await storedStartTime(quarter.leaveId)).toMatch(/^14:00/);
    const full = await submitLeave(drafter, { kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-21", half: "", startTime: "14:00" }, deps);
    const half = await submitLeave(drafter, { kind: "half_day", startDate: "2026-09-23", endDate: "2026-09-23", half: "pm", startTime: "14:00" }, deps);
    const remote = await submitLeave(drafter, { kind: "remote", startDate: "2026-10-06", endDate: "2026-10-06", half: "", startTime: "14:00" }, deps);
    for (const doc of [full, half, remote]) expect(await storedStartTime(doc.leaveId)).toBeNull();
  });

  it("다시 신청: 형식 오류는 시작 시각 칸 오류 · 새 시각을 저장하고, 종일로 바꾸면 null", async () => {
    const { drafter, lead } = await org();
    const doc = await submitLeave(drafter, { kind: "quarter_day", startDate: "2026-09-22", endDate: "2026-09-22", half: "", startTime: "09:00" }, deps);
    const rejected = await rejectDocument(lead, { instanceId: doc.instanceId, expectedVersion: doc.version, reason: "시각 확인" }, deps);

    for (const startTime of [undefined, "", "24:00"]) {
      const error = await resubmitLeave(
        drafter,
        { leaveId: doc.leaveId, expectedVersion: rejected.version, input: { kind: "quarter_day", startDate: "2026-09-22", endDate: "2026-09-22", half: "", startTime } },
        deps,
      ).catch((caught: unknown) => caught);
      expect(error, String(startTime)).toBeInstanceOf(LeaveValidationError);
      expect((error as LeaveValidationError).fieldErrors).toEqual(TIME_ERROR);
    }
    expect(await storedStartTime(doc.leaveId)).toMatch(/^09:00/);

    const again = await resubmitLeave(
      drafter,
      { leaveId: doc.leaveId, expectedVersion: rejected.version, input: { kind: "quarter_day", startDate: "2026-09-22", endDate: "2026-09-22", half: "", startTime: "15:30" } },
      deps,
    );
    expect(await storedStartTime(doc.leaveId)).toMatch(/^15:30/);

    const rejectedAgain = await rejectDocument(lead, { instanceId: again.instanceId, expectedVersion: again.version, reason: "종일로" }, deps);
    await resubmitLeave(
      drafter,
      { leaveId: doc.leaveId, expectedVersion: rejectedAgain.version, input: { kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-21", half: "", startTime: "15:30" } },
      deps,
    );
    expect(await storedStartTime(doc.leaveId)).toBeNull();
  });
});
