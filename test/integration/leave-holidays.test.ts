import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { leaveRequests } from "@/db/schema";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { rejectDocument } from "@/domain/approvals";
import { submitLeave, LeaveValidationError } from "@/domain/leave";
import { resubmitLeave } from "@/domain/leave/resubmit";
import { getLeaveBalancesForRequests, previewLeaveBalance } from "@/domain/leave/balance-service";
import { countRows, makePerson, NOW_2026 } from "./approvals-fixtures";

// 06.3-01(D-6301 · D-6304): 연차 일수는 주말뿐 아니라 04.2 공휴일 표의 쉬는 날도 뺀다 — 서비스 직접 호출.

const deps = { now: NOW_2026 };

async function world() {
  const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
  const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
  await makePerson("최대표", CEO_ROLE_ID, null);
  return { drafter, lead };
}

describe("제출 — 휴일 제외(06.3-01 Task 1)", () => {
  it("종일 2026-09-23~28은 추석 연휴와 주말을 빼 영업일 2일 = 8쿼터로 저장된다", async () => {
    const { drafter } = await world();
    const doc = await submitLeave(drafter, { kind: "full_day", startDate: "2026-09-23", endDate: "2026-09-28", half: "" }, deps);
    const [row] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, doc.leaveId));
    expect(row?.daysQuarters).toBe(8);
  });

  it("반차 추석 당일 · 반반차 선거일(수동 행 2026-06-03)은 시작일 칸 `휴일 · 다른 날 고르기`이고 행이 생기지 않는다", async () => {
    const { drafter } = await world();
    const before = await countRows("leave_requests");
    const half = await submitLeave(drafter, { kind: "half_day", startDate: "2026-09-25", endDate: "2026-09-25", half: "am" }, deps).catch(
      (error: unknown) => error,
    );
    const quarter = await submitLeave(drafter, { kind: "quarter_day", startDate: "2026-06-03", endDate: "2026-06-03", half: "pm" }, deps).catch(
      (error: unknown) => error,
    );
    for (const error of [half, quarter]) {
      expect(error).toBeInstanceOf(LeaveValidationError);
      expect((error as LeaveValidationError).fieldErrors).toEqual([{ field: "startDate", message: "휴일 · 다른 날 고르기" }]);
    }
    expect(await countRows("leave_requests")).toBe(before);
  });

  it("종일 2026-09-24~27(휴일 + 주말뿐)은 `휴일만 고른 기간 · 평일 넣기`이고 행이 생기지 않는다", async () => {
    const { drafter } = await world();
    const before = await countRows("leave_requests");
    const error = await submitLeave(drafter, { kind: "full_day", startDate: "2026-09-24", endDate: "2026-09-27", half: "" }, deps).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(LeaveValidationError);
    expect((error as LeaveValidationError).fieldErrors).toEqual([{ field: "startDate", message: "휴일만 고른 기간 · 평일 넣기" }]);
    expect(await countRows("leave_requests")).toBe(before);
  });
});

describe("다시 신청 · 미리보기 잔고 · 결재 옆판 — 같은 휴일 판정(06.3-01 Task 3)", () => {
  const CHUSEOK_RANGE = { kind: "full_day", startDate: "2026-09-23", endDate: "2026-09-28", half: "" };

  it("반려된 신청을 추석 낀 종일로 다시 신청하면 저장 days_quarters가 8이다", async () => {
    const { drafter, lead } = await world();
    const doc = await submitLeave(drafter, { kind: "full_day", startDate: "2026-10-06", endDate: "2026-10-06", half: "" }, deps);
    const rejected = await rejectDocument(lead, { instanceId: doc.instanceId, expectedVersion: doc.version, reason: "날짜 확인" }, deps);
    await resubmitLeave(drafter, { leaveId: doc.leaveId, expectedVersion: rejected.version, input: CHUSEOK_RANGE }, deps);
    const [row] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, doc.leaveId));
    expect(row?.daysQuarters).toBe(8);
  });

  it("⑤ 같은 입력의 미리보기 잔고 thisRequest = 저장 days_quarters = 결재 옆판 thisRequest", async () => {
    const { drafter } = await world();
    const preview = await previewLeaveBalance(drafter, CHUSEOK_RANGE, deps);
    const doc = await submitLeave(drafter, CHUSEOK_RANGE, deps);
    const [row] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, doc.leaveId));
    const side = (await getLeaveBalancesForRequests(drafter, [doc.leaveId], deps)).get(doc.leaveId);
    expect(row?.daysQuarters).toBe(8);
    expect(preview?.thisRequest).toBe(8);
    expect(side?.thisRequest).toBe(8);
  });
});
