import { beforeEach, describe, expect, it } from "vitest";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { setHireDate } from "@/domain/people";
import {
  LeaveAdjustmentValidationError,
  addLeaveAdjustment,
  getLeaveBalanceForUser,
} from "@/domain/leave/balance-service";
import { submitLeave } from "@/domain/leave";
import { countRows, makePerson } from "./approvals-fixtures";

// 07.2-04 PU13(D-7262 · D-7263): 연차·월차 조정이 남음을 0 아래로 내리면 거부한다 — 잠금 뒤 재조회 값으로 판정.
// 신청은 지금처럼 경고만(잔여 초과 허용).

const NOW = new Date("2026-09-24T03:00:00Z");

async function floorError(promise: Promise<unknown>): Promise<LeaveAdjustmentValidationError> {
  const error = await promise.then(
    () => null,
    (cause: unknown) => cause,
  );
  expect(error).toBeInstanceOf(LeaveAdjustmentValidationError);
  return error as LeaveAdjustmentValidationError;
}

// 2020 입사 · 연차 설정 기본 15 → 2026 부여는 근속 6년이라 17일. 먼저 -14로 남음 3일을 만든다.
async function targetWithRemaining3(): Promise<{ admin: Viewer; userId: string }> {
  const admin = await makePerson("관리자", SYSADMIN_ROLE_ID, null);
  const target = await makePerson("대상", DEFAULT_ROLE_ID, null);
  await setHireDate(SYSTEM_VIEWER, target.id, "2020-03-02");
  await addLeaveAdjustment(admin, { userId: target.id, bucket: "annual", fiscalYear: 2026, amountDays: -14, reason: "정산" }, { now: NOW });
  return { admin, userId: target.id };
}

async function annualRemainingDays(admin: Viewer, userId: string): Promise<number | undefined> {
  const balance = await getLeaveBalanceForUser(admin, userId, { fiscalYear: 2026 }, { now: NOW });
  return balance.annual === undefined ? undefined : balance.annual.remainingQuarters / 4;
}

describe("연차 조정 마이너스 거부(PU13)", () => {
  let admin: Viewer;
  let userId: string;
  beforeEach(async () => {
    ({ admin, userId } = await targetWithRemaining3());
  });

  it("남음 3일 사람에게 -4 → 남음 3일 · -3까지 · 행 0 추가", async () => {
    expect(await annualRemainingDays(admin, userId)).toBe(3);
    const rows = await countRows("leave_adjustments");
    const error = await floorError(
      addLeaveAdjustment(admin, { userId, bucket: "annual", fiscalYear: 2026, amountDays: -4, reason: "초과" }, { now: NOW }),
    );
    expect(error.field).toBe("amountDays");
    expect(error.message).toBe("남음 3일 · -3까지");
    expect(await countRows("leave_adjustments")).toBe(rows);
  });

  it("경계 -3은 저장 · 남음 0", async () => {
    await addLeaveAdjustment(admin, { userId, bucket: "annual", fiscalYear: 2026, amountDays: -3, reason: "경계" }, { now: NOW });
    expect(await annualRemainingDays(admin, userId)).toBe(0);
  });

  it("동시에 -2 두 건 → 하나만 저장 · 하나는 남음 1일 · -1까지(잠금 뒤 재조회)", async () => {
    const attempt = () =>
      addLeaveAdjustment(admin, { userId, bucket: "annual", fiscalYear: 2026, amountDays: -2, reason: "동시" }, { now: NOW });
    const rows = await countRows("leave_adjustments");
    const results = await Promise.allSettled([attempt(), attempt()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.status === "rejected" ? (rejected.reason as Error).message : "").toBe("남음 1일 · -1까지");
    expect(await countRows("leave_adjustments")).toBe(rows + 1);
    expect(await annualRemainingDays(admin, userId)).toBe(1);
  });

  it("양수 조정은 남음과 관계없이 저장", async () => {
    await addLeaveAdjustment(admin, { userId, bucket: "annual", fiscalYear: 2026, amountDays: 1, reason: "보상" }, { now: NOW });
    expect(await annualRemainingDays(admin, userId)).toBe(4);
  });
});

describe("월차 조정 바닥 — 오늘 회계연도 월차 남음으로 판정(월차 줄 없음 = 0)", () => {
  it("월차 남음 2일에 -3 → 남음 2일 · -2까지", async () => {
    const admin = await makePerson("관리자", SYSADMIN_ROLE_ID, null);
    const target = await makePerson("월차대상", DEFAULT_ROLE_ID, null);
    // 입사 2026-07-10 → 2026-09-24 기준 적립 2건(08-10 · 09-10) = 2일.
    await setHireDate(SYSTEM_VIEWER, target.id, "2026-07-10");
    const error = await floorError(
      addLeaveAdjustment(admin, { userId: target.id, bucket: "monthly", fiscalYear: null, amountDays: -3, reason: "초과" }, { now: NOW }),
    );
    expect(error.message).toBe("남음 2일 · -2까지");
    await addLeaveAdjustment(admin, { userId: target.id, bucket: "monthly", fiscalYear: null, amountDays: -2, reason: "경계" }, { now: NOW });
  });

  it("월차 줄이 없는 사람(입사일이 오늘 뒤라 적립 0)에 -1 → 남음 0일 · -0까지", async () => {
    const admin = await makePerson("관리자", SYSADMIN_ROLE_ID, null);
    const target = await makePerson("미래입사", DEFAULT_ROLE_ID, null);
    await setHireDate(SYSTEM_VIEWER, target.id, "2026-12-01");
    const error = await floorError(
      addLeaveAdjustment(admin, { userId: target.id, bucket: "monthly", fiscalYear: null, amountDays: -1, reason: "없음" }, { now: NOW }),
    );
    expect(error.message).toBe("남음 0일 · -0까지");
  });
});

describe("신청은 경고만(D-7262 회귀)", () => {
  it("남음 3일 사람이 5일 신청해도 신청은 성공(잔여 초과는 경고)", async () => {
    const admin = await makePerson("관리자", SYSADMIN_ROLE_ID, null);
    await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    await makePerson("최대표", CEO_ROLE_ID, null);
    const target = await makePerson("신청자", DEFAULT_ROLE_ID, "기획1팀");
    await setHireDate(SYSTEM_VIEWER, target.id, "2020-03-02");
    await addLeaveAdjustment(admin, { userId: target.id, bucket: "annual", fiscalYear: 2026, amountDays: -14, reason: "정산" }, { now: NOW });
    const result = await submitLeave(
      target,
      { kind: "full_day", startDate: "2026-10-05", endDate: "2026-10-09", half: "" },
      { now: NOW },
    );
    expect(result).toBeDefined();
  });
});
