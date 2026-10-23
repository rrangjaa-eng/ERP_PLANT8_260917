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
// 퇴직 경계는 isRetiredOn(퇴직일 당일까지 재직, 다음 날부터 퇴직). 퇴직일은 지우기(재입사)만 받는다
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

  // 사용자 결정(카드 2026-10-23 12:34 KST) 「퇴직한 사람의 퇴직일은 비우기만 허용」: 퇴직자의 퇴직일은 지우기(재입사)만 받는다 —
  // 다른 과거 · 미래 날짜로 옮기기는 같은 거부. 아직 퇴직 전(퇴직일 없음 · 미래)이면 그대로 넣고 바꾼다.
  describe("퇴직일 — 퇴직자는 비우기만", () => {
    it.each([
      { label: "다른 과거 날짜", days: -400 },
      { label: "미래 날짜", days: 30 },
    ])("퇴직자 → $label — 거부 · 퇴직일 그대로", async ({ days }) => {
      const stored = kstDayOffset(-1);
      const id = await personResigned(stored);
      await refusedRetired(setResignationDate(SYSTEM_VIEWER, id, kstDayOffset(days)));
      expect((await readRow(id))?.resignationDate).toBe(stored);
    });

    it("퇴직자 → 비운 뒤 다시 넣기(두 단계) — 성공", async () => {
      const id = await personResigned(kstDayOffset(-1));
      await setResignationDate(SYSTEM_VIEWER, id, null);
      await setResignationDate(SYSTEM_VIEWER, id, kstDayOffset(10));
      expect((await readRow(id))?.resignationDate).toBe(kstDayOffset(10));
    });

    it("미래 퇴직일인 재직자 → 다른 날짜 — 성공", async () => {
      const id = await personResigned(kstDayOffset(30));
      await setResignationDate(SYSTEM_VIEWER, id, kstDayOffset(60));
      expect((await readRow(id))?.resignationDate).toBe(kstDayOffset(60));
    });

    it("퇴직일 없는 재직자 → 퇴직일 넣기 — 성공", async () => {
      const person = await makePerson("대상 P", DEFAULT_ROLE_ID, null);
      await setResignationDate(SYSTEM_VIEWER, person.id, kstDayOffset(20));
      expect((await readRow(person.id))?.resignationDate).toBe(kstDayOffset(20));
    });

    it("연말 경계 — 12-31 퇴직자는 1-1(KST)부터 옮기기 거부, 12-31 당일은 성공", async () => {
      const lastDayEmployed = () => new Date("2025-12-31T05:00:00+09:00");
      const firstDayRetired = () => new Date("2026-01-01T00:30:00+09:00");
      const id = await personResigned("2025-12-31");
      await refusedRetired(setResignationDate(SYSTEM_VIEWER, id, "2025-12-30", { now: firstDayRetired }));
      expect((await readRow(id))?.resignationDate).toBe("2025-12-31");
      await setResignationDate(SYSTEM_VIEWER, id, "2026-01-15", { now: lastDayEmployed });
      expect((await readRow(id))?.resignationDate).toBe("2026-01-15");
    });
  });
});
