import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { settingsSimple, teams, users } from "@/db/schema";
import { can } from "@/domain/permissions/can";
import { FUND_DIVISION_SETTING_KEY } from "@/domain/permissions/fund-scope";
import { fundScopedWriters, paymentManagers } from "@/domain/notify/recipients";
import { seoulToday } from "@/lib/dates";
import { orgUnitIdByName } from "../approvals-fixtures";
import { buildFundWorld, grantAllFundKeys, makeFundPerson, makeFundRole, type FundWorld } from "../fixtures/fund-scope";

// 07.3-02(D-7312 · RESEARCH Q1 B1 · B2): 지급 · 임자 없는 증빙 알림 받는 사람 = 권한표 쓰기 보유자 ∩ (자금 본부 소속 ∨ 회사 전체 계급).
// can()과 같은 답이되 tick 잠금 tx 안에서 부르므로 모든 읽기가 넘긴 tx로 돈다.

function split(ids: readonly string[], w: FundWorld) {
  const has = (viewer: { id: string }) => ids.includes(viewer.id);
  return {
    mgmtHead: has(w.mgmtHead),
    mgmtStaff: has(w.mgmtStaff),
    ceo: has(w.ceo),
    sysadmin: has(w.sysadmin),
    planningHead: has(w.planningHead),
    planningStaff: has(w.planningStaff),
  };
}

const FUND_SIDE = { mgmtHead: true, mgmtStaff: true, ceo: true, sysadmin: true, planningHead: false, planningStaff: false };
const COMPANY_ONLY = { mgmtHead: false, mgmtStaff: false, ceo: true, sysadmin: true, planningHead: false, planningStaff: false };

describe("자금 알림 받는 사람 (07.3-02 D-7312)", () => {
  it("지급 처리 알림은 경영관리 책임자(팀 없음) · 경영관리 사원 · 대표 · 시스템 관리자이고 기획 쪽은 없다", async () => {
    const w = await buildFundWorld();
    expect(split(await paymentManagers(seoulToday()), w)).toEqual(FUND_SIDE);
  });

  it("임자 없는 증빙 받는 사람(evidence.intake 쓰기)도 같은 모양이다", async () => {
    const w = await buildFundWorld();
    expect(split(await fundScopedWriters("evidence.intake", seoulToday()), w)).toEqual(FUND_SIDE);
  });

  it("자금 본부 설정을 지우면 회사 전체 계급만 남는다(fail-closed)", async () => {
    const w = await buildFundWorld();
    await db.delete(settingsSimple).where(eq(settingsSimple.key, FUND_DIVISION_SETTING_KEY));
    expect(split(await paymentManagers(seoulToday()), w)).toEqual(COMPANY_ONLY);
    expect(split(await fundScopedWriters("evidence.intake", seoulToday()), w)).toEqual(COMPANY_ONLY);
  });

  it("관리자가 만든 company 계급 사람은 소속 없이도 받는다", async () => {
    const roleId = await makeFundRole("company");
    await grantAllFundKeys(roleId);
    const person = await makeFundPerson("전사 담당", roleId, null);
    expect(await paymentManagers(seoulToday())).toContain(person.id);
  });

  it("보관된 경영관리팀에 발령이 남은 사원도 can()처럼 받는다(viewerDivision — 팀 보관은 보지 않는다)", async () => {
    const w = await buildFundWorld();
    await db.update(teams).set({ archivedAt: new Date() }).where(eq(teams.name, "경영관리팀"));
    expect(await can(w.mgmtStaff, "evidence.intake", "write")).toBe(true);
    expect(split(await fundScopedWriters("evidence.intake", seoulToday()), w).mgmtStaff).toBe(true);
    expect(split(await paymentManagers(seoulToday()), w).mgmtStaff).toBe(true);
  });

  it("넘긴 tx로 읽는다 — tx 안에서 바꾼 소속 · 설정이 답에 보인다", async () => {
    const w = await buildFundWorld();
    const planning = await orgUnitIdByName("기획본부");
    await db.transaction(async (tx) => {
      await tx.update(users).set({ divisionId: planning }).where(eq(users.id, w.mgmtHead.id));
      expect(split(await paymentManagers(seoulToday(), tx), w).mgmtHead).toBe(false);
      await tx.delete(settingsSimple).where(eq(settingsSimple.key, FUND_DIVISION_SETTING_KEY));
      expect(split(await fundScopedWriters("evidence.intake", seoulToday(), tx), w)).toEqual(COMPANY_ONLY);
      tx.rollback();
    }).catch((error: unknown) => {
      if (!(error instanceof Error) || !/rollback/i.test(error.message)) throw error;
    });
    expect(split(await paymentManagers(seoulToday()), w)).toEqual(FUND_SIDE);
  });
});
