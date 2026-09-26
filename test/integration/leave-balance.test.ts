import { beforeEach, describe, expect, it } from "vitest";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { approveDocument } from "@/domain/approvals";
import { submitLeave } from "@/domain/leave";
import { getMyLeaveBalance } from "@/domain/leave/balance-service";
import { setHireDate, setResignationDate } from "@/domain/people";
import { listOrgSnapshot } from "@/repositories/org-snapshot";
import { makePerson } from "./approvals-fixtures";

// 04.1-03: 잔고는 저장하지 않고 부여 목록 · 신청 · 조정에서 매번 계산한다(LEAV-01).

type Org = { drafter: Viewer; lead: Viewer; ceo: Viewer };

async function leaveOrg(): Promise<Org> {
  const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
  const lead = await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
  const ceo = await makePerson("최대표", CEO_ROLE_ID, null);
  return { drafter, lead, ceo };
}

// 팀장 → (2·3단 빈 자리) → 대표 승인으로 최종 승인한다.
async function approveFully(org: Org, instanceId: string, now: Date): Promise<void> {
  await approveDocument(org.lead, { instanceId, expectedVersion: 1 }, { now });
  const done = await approveDocument(org.ceo, { instanceId, expectedVersion: 2 }, { now });
  expect(done.status).toBe("approved");
}

// 2026-09-24 12:00 서울.
const NOW_0924 = new Date("2026-09-24T03:00:00Z");

describe("트레이서 — 월차 적립 → 연차 최종 승인 → 월차부터 차감 → 잔고 조회", () => {
  let org: Org;
  beforeEach(async () => {
    org = await leaveOrg();
  });

  it("입사 2026-03-10 직원 — 월차 6일 적립, 2일 승인 뒤 월차 사용 2 · 남음 4, 연차 그대로 · 반복 조회와 재승인 시도에도 같다", async () => {
    await setHireDate(SYSTEM_VIEWER, org.drafter.id, "2026-03-10");

    const before = await getMyLeaveBalance(org.drafter, { fiscalYear: 2026 }, { now: NOW_0924 });
    expect(before.monthly).toEqual({
      status: "active",
      accruedQuarters: 24,
      usedQuarters: 0,
      pendingQuarters: 0,
      remainingQuarters: 24,
      expiresOn: "2027-12-31",
    });
    expect(before.annual?.grantQuarters).toBe(0);

    const submitted = await submitLeave(
      org.drafter,
      { kind: "full_day", startDate: "2026-09-28", endDate: "2026-09-29", half: "" },
      { now: NOW_0924 },
    );
    await approveFully(org, submitted.instanceId, NOW_0924);

    const after = await getMyLeaveBalance(org.drafter, {}, { now: NOW_0924 });
    expect(after.monthly).toMatchObject({ accruedQuarters: 24, usedQuarters: 8, pendingQuarters: 0, remainingQuarters: 16 });
    expect(after.annual).toEqual(before.annual);

    // 같은 문서를 몇 번 조회하든 · 최종 승인을 한 번 더 시도(거부)해도 이중 차감이 없다.
    await expect(
      approveDocument(org.ceo, { instanceId: submitted.instanceId, expectedVersion: 3 }, { now: NOW_0924 }),
    ).rejects.toThrow();
    for (let i = 0; i < 3; i++) {
      expect(await getMyLeaveBalance(org.drafter, { fiscalYear: 2026 }, { now: NOW_0924 })).toEqual(after);
    }
  });

  it("입사일이 없는 직원 — 2026 연차 = 기본값 15일, 월차는 입사일 없음", async () => {
    const balance = await getMyLeaveBalance(org.drafter, { fiscalYear: 2026 }, { now: NOW_0924 });
    expect(balance.annual).toEqual({
      grantQuarters: 60,
      adjustmentQuarters: 0,
      usedQuarters: 0,
      pendingQuarters: 0,
      remainingQuarters: 60,
    });
    expect(balance.monthly).toEqual({ status: "no_hire_date" });
  });

  it("퇴직일 2026-09-20인 팀장은 2026-09-24 결재선 후보가 아니고, 퇴직일 2026-09-24이면 후보다", async () => {
    await setResignationDate(SYSTEM_VIEWER, org.lead.id, "2026-09-20");
    expect((await listOrgSnapshot(SYSTEM_VIEWER, "2026-09-24")).map((row) => row.id)).not.toContain(org.lead.id);

    await setResignationDate(SYSTEM_VIEWER, org.lead.id, "2026-09-24");
    expect((await listOrgSnapshot(SYSTEM_VIEWER, "2026-09-24")).map((row) => row.id)).toContain(org.lead.id);
  });

  it("입사 2026-03-10 · 퇴직 2026-06-15 직원은 2026-09-24 기준 월차 적립 3일(07-10 이후 없음)", async () => {
    await setHireDate(SYSTEM_VIEWER, org.drafter.id, "2026-03-10");
    await setResignationDate(SYSTEM_VIEWER, org.drafter.id, "2026-06-15");
    const balance = await getMyLeaveBalance(org.drafter, { fiscalYear: 2026 }, { now: NOW_0924 });
    expect(balance.monthly).toMatchObject({ status: "active", accruedQuarters: 12 });
  });
});
