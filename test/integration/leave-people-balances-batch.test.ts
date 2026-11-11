import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { submitLeave } from "@/domain/leave";
import { getLeaveBalanceForUser, listPeopleLeaveBalances } from "@/domain/leave/balance-service";
import { insertLeaveAdjustment } from "@/repositories/leave-adjustments";
import { makePerson, NOW_2026 } from "./approvals-fixtures";
import { makeDelegatedRole } from "./admin-cap-fixtures";

// 07.2-15 CI 실패(leave-list.spec 「전체」 이동 5초 초과): /leave?view=all은 사람마다 사용 · 조정 쿼리를 직렬로 불러
// 사람 수(CI 공유 DB 1,700명)에 비례해 느려졌다. 사람별 잔여는 사용 · 조정을 사람 수와 무관한 묶음 읽기로 가져와야 한다 —
// 한 사람 읽기(listLeaveUsage · listLeaveAdjustments)는 부르지 않고, 숫자는 getLeaveBalanceForUser와 같다.
const calls = vi.hoisted(() => ({ usage: 0, adjustments: 0 }));
vi.mock("@/repositories/leave-usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/repositories/leave-usage")>();
  return { ...actual, listLeaveUsage: (...args: Parameters<typeof actual.listLeaveUsage>) => (calls.usage++, actual.listLeaveUsage(...args)) };
});
vi.mock("@/repositories/leave-adjustments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/repositories/leave-adjustments")>();
  return {
    ...actual,
    listLeaveAdjustments: (...args: Parameters<typeof actual.listLeaveAdjustments>) => (calls.adjustments++, actual.listLeaveAdjustments(...args)),
  };
});

const deps = { now: NOW_2026 };

async function peopleAdmin(name: string): Promise<Viewer> {
  const roleId = await makeDelegatedRole({ name: "경영관리", menus: [{ menu: "admin.people", action: "view" }] });
  return makePerson(name, roleId, "경영관리팀");
}

describe("사람별 연차 잔여 — 묶음 읽기", () => {
  it("사람마다 사용 · 조정을 따로 읽지 않는다 · 숫자(사용 · 결재 중 · 조정 · 근속 여러 해)는 getLeaveBalanceForUser와 같다", async () => {
    const admin = await peopleAdmin("정경영");
    await makePerson("김팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    await makePerson("최대표", CEO_ROLE_ID, null);
    const fresh = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    await db.update(users).set({ hireDate: "2026-03-02" }).where(eq(users.id, fresh.id));
    const veteran = await makePerson("오고참", DEFAULT_ROLE_ID, "기획1팀");
    await db.update(users).set({ hireDate: "2019-01-02" }).where(eq(users.id, veteran.id));
    await submitLeave(fresh, { kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-22", half: "" }, deps);
    await submitLeave(veteran, { kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-21", half: "" }, deps);
    await insertLeaveAdjustment(admin, { userId: veteran.id, bucket: "annual", fiscalYear: 2026, amountQuarters: 6, reason: "포상", createdBy: admin.id });
    await insertLeaveAdjustment(admin, { userId: fresh.id, bucket: "monthly", fiscalYear: null, amountQuarters: 4, reason: "보정", createdBy: admin.id });

    calls.usage = 0;
    calls.adjustments = 0;
    const { rows, count } = await listPeopleLeaveBalances(admin, 2026, deps);
    expect(count).toBeGreaterThan(2);
    expect(calls).toEqual({ usage: 0, adjustments: 0 });

    for (const person of [fresh, veteran]) {
      const row = rows.find((candidate) => candidate.userId === person.id);
      const balance = await getLeaveBalanceForUser(admin, person.id, { fiscalYear: 2026 }, deps);
      const annual = balance.annual;
      if (!annual) throw new Error("잔고 없음");
      expect(row?.grantedQuarters).toBe(annual.grantQuarters + annual.adjustmentQuarters);
      expect(row?.usedQuarters).toBe(annual.usedQuarters);
      expect(row?.pendingQuarters).toBe(annual.pendingQuarters);
      expect(row?.remainingQuarters).toBe(annual.remainingQuarters);
      expect(row?.monthlyRemainingQuarters).toBe(balance.monthly?.status === "active" ? balance.monthly.remainingQuarters : null);
    }
    expect(rows.find((row) => row.userId === veteran.id)?.pendingQuarters).toBe(4);
  });
});
