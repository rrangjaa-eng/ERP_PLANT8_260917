import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { changePersonRole, setHireDate, setResignationDate } from "@/domain/people";
import { RETIRED_EDIT_MESSAGE } from "@/domain/people/retired";
import { updatePersonPayoutAccount } from "@/domain/people/account";
import { addLeaveAdjustment } from "@/domain/leave/balance-service";
import { assignTeam, cancelFutureAssignment } from "@/domain/org";
import { listMemberships } from "@/repositories/team-memberships";
import { kstToday } from "@/lib/kst-date";
import { countRows, makePerson } from "./approvals-fixtures";
import { makeAdmin, makeAdminRole, makeOrgTeam } from "./admin-cap-fixtures";

// 사용자 결정 F24(카드 2026-10-23 10:02 KST): 퇴직한 사람은 지급 계좌까지 어떤 정보도 고치지 못한다 —
// 260907 `server/src/people.ts:792-797`(left_date가 있으면 409 「퇴사한 사원은 고칠 수 없습니다」)와 같은 판정.
// 퇴직 경계는 isRetiredOn(퇴직일 당일까지 재직, 다음 날부터 퇴직). 퇴직일 자체는 재입사 경로라 막지 않는다
// (260907 `/api/people/:id/rejoin` `people.ts:1155`).

function kstDayOffset(days: number): string {
  return kstToday(new Date(Date.now() + days * 86_400_000));
}

async function personResigned(resignationDate: string): Promise<string> {
  const person = await makePerson("대상 P", DEFAULT_ROLE_ID, null);
  await db.update(users).set({ resignationDate, hireDate: "2020-01-01" }).where(eq(users.id, person.id));
  return person.id;
}

async function readRow(userId: string) {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return row;
}

async function refusedRetired(promise: Promise<unknown>): Promise<void> {
  const outcome = await promise.then(
    () => new Error("거부되어야 하는데 성공함"),
    (caught: unknown) => caught,
  );
  expect((outcome as Error).message).toBe(RETIRED_EDIT_MESSAGE);
}

describe("퇴직자 정보 변경 잠금(F24)", () => {
  it("계급 변경 — 거부 · 계급 그대로", async () => {
    const id = await personResigned(kstDayOffset(-1));
    const otherRole = await makeAdminRole("다른 계급");
    await refusedRetired(changePersonRole(SYSTEM_VIEWER, id, otherRole));
    expect((await readRow(id))?.roleId).toBe(DEFAULT_ROLE_ID);
  });

  it("팀 발령 — 거부 · 발령 그대로", async () => {
    const id = await personResigned(kstDayOffset(-1));
    const { teamId } = await makeOrgTeam();
    await refusedRetired(assignTeam(SYSTEM_VIEWER, { userId: id, teamId, effectiveFrom: kstDayOffset(30) }));
    expect(await listMemberships(SYSTEM_VIEWER, id)).toEqual([]);
  });

  it("미래 발령 취소 — 거부 · 발령 남음", async () => {
    const person = await makePerson("대상 P", DEFAULT_ROLE_ID, null);
    const { teamId } = await makeOrgTeam();
    const effectiveFrom = kstDayOffset(30);
    await assignTeam(SYSTEM_VIEWER, { userId: person.id, teamId, effectiveFrom });
    await db.update(users).set({ resignationDate: kstDayOffset(-1) }).where(eq(users.id, person.id));
    await refusedRetired(cancelFutureAssignment(SYSTEM_VIEWER, { userId: person.id, effectiveFrom }));
    expect(await listMemberships(SYSTEM_VIEWER, person.id)).toHaveLength(1);
  });

  it("입사일 — 거부 · 입사일 그대로", async () => {
    const id = await personResigned(kstDayOffset(-1));
    await refusedRetired(setHireDate(SYSTEM_VIEWER, id, "2019-01-01"));
    expect((await readRow(id))?.hireDate).toBe("2020-01-01");
  });

  // 사용자 결정(카드 2026-10-23 11:14 KST) 「퇴직한 해 연차 조정만 허용」: 퇴직일이 든 해의 연차 조정만 받고, 다른 해 · 월차는 거부.
  describe("연차 조정 — 퇴직한 해만", () => {
    const thisYear = Number(kstDayOffset(0).slice(0, 4));
    const retiredYear = thisYear - 1;
    const adjust = (viewer: Awaited<ReturnType<typeof makeAdmin>>, userId: string, input: { bucket: string; fiscalYear: number | null }) =>
      addLeaveAdjustment(viewer, { userId, ...input, amountDays: 1, reason: "퇴직 정산" });

    it("퇴직한 해(연차) — 조정 행이 생긴다", async () => {
      const id = await personResigned(`${retiredYear}-06-30`);
      const admin = await makeAdmin("관리자 A");
      const before = await countRows("leave_adjustments");
      await adjust(admin, id, { bucket: "annual", fiscalYear: retiredYear });
      expect(await countRows("leave_adjustments")).toBe(before + 1);
    });

    it.each([
      { label: "퇴직 다음 해(올해)", bucket: "annual", fiscalYear: thisYear },
      { label: "퇴직 전 해", bucket: "annual", fiscalYear: retiredYear - 1 },
      { label: "월차(연도 없음)", bucket: "monthly", fiscalYear: null },
    ])("$label — 거부 · 조정 행 그대로", async ({ bucket, fiscalYear }) => {
      const id = await personResigned(`${retiredYear}-06-30`);
      const admin = await makeAdmin("관리자 A");
      const before = await countRows("leave_adjustments");
      await refusedRetired(adjust(admin, id, { bucket, fiscalYear }));
      expect(await countRows("leave_adjustments")).toBe(before);
    });
  });

  it("지급 계좌 — 거부 · 계좌 그대로", async () => {
    const id = await personResigned(kstDayOffset(-1));
    await refusedRetired(
      updatePersonPayoutAccount(SYSTEM_VIEWER, id, { accountBank: "신한", accountHolder: "대상", accountNumber: "110-123-456789" }),
    );
    const row = await readRow(id);
    expect(row?.accountBank).toBeNull();
    expect(row?.accountNumberEncrypted).toBeNull();
  });

  it("퇴직일 당일(KST)은 아직 재직 — 지급 계좌 · 입사일 변경 성공", async () => {
    const id = await personResigned(kstDayOffset(0));
    await updatePersonPayoutAccount(SYSTEM_VIEWER, id, { accountBank: "신한", accountHolder: "대상", accountNumber: "110-123-456789" });
    await setHireDate(SYSTEM_VIEWER, id, "2019-01-01");
    const row = await readRow(id);
    expect(row?.accountNumberLast4).toBe("6789");
    expect(row?.hireDate).toBe("2019-01-01");
  });

  it("퇴직일 지우기(재입사)는 막지 않는다", async () => {
    const id = await personResigned(kstDayOffset(-1));
    await setResignationDate(SYSTEM_VIEWER, id, null);
    expect((await readRow(id))?.resignationDate).toBeNull();
  });
});
