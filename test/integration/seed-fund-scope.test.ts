import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { orgUnits, settingsSimple } from "@/db/schema";
import { seedMasterData } from "@/domain/seed";
import { seedFundScope } from "@/domain/seed/fund-scope";
import { DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import {
  APPROVAL_ROUTE_EXPENSE_STEP3_ROLE_ID,
  APPROVAL_ROUTE_LEAVE_STEP3_ROLE_ID,
  APPROVAL_ROUTE_SETTLEMENT_STEP3_ROLE_ID,
  FUND_DIVISION_ORG_UNIT,
} from "@/domain/settings/keys";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { updateSimpleValueIfUnedited, upsertSimpleValue } from "@/repositories/settings";
import { makePerson, orgUnitIdByName } from "./approvals-fixtures";
import { makeFundPerson } from "./fixtures/fund-scope";

async function storedValue(): Promise<unknown> {
  const [row] = await db.select().from(settingsSimple).where(eq(settingsSimple.key, FUND_DIVISION_ORG_UNIT.key)).limit(1);
  return row ? row.value : undefined;
}

// 07.3-01(D-7310): 배포마다 도는 시드가 자금 본부 설정을 값이 없을 때만 경영관리본부 uuid로 채운다.
describe("seedFundScope (07.3-01)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("빈 DB 첫 시드 뒤 설정은 경영관리본부 id다", async () => {
    expect(await storedValue()).toBe(await orgUnitIdByName("경영관리본부"));
  });

  it("관리자가 다른 본부로 바꾼 값은 재시드가 덮지 않는다", async () => {
    const planning = await orgUnitIdByName("기획본부");
    await upsertSimpleValue(SYSTEM_VIEWER, FUND_DIVISION_ORG_UNIT.key, planning, null);
    await seedMasterData(SYSTEM_VIEWER);
    expect(await storedValue()).toBe(planning);
  });

  it("경영관리본부가 없으면 설정 행을 만들지 않고 경고 한 줄을 남긴다", async () => {
    await db.delete(settingsSimple).where(eq(settingsSimple.key, FUND_DIVISION_ORG_UNIT.key));
    await db.update(orgUnits).set({ name: "경영지원본부" }).where(eq(orgUnits.name, "경영관리본부"));
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: unknown) => {
      lines.push(String(line));
    });

    await seedFundScope(SYSTEM_VIEWER);

    expect(await storedValue()).toBeUndefined();
    const warnings = lines.filter((line) => line.includes("seed.fund_division_missing"));
    expect(warnings).toHaveLength(1);
    expect(JSON.parse(warnings[0] ?? "{}")).toMatchObject({ severity: "WARNING" });
  });

  it("경영관리본부가 보관됐으면 설정 행을 만들지 않고 같은 경고 한 줄을 남긴다", async () => {
    await db.delete(settingsSimple).where(eq(settingsSimple.key, FUND_DIVISION_ORG_UNIT.key));
    await db.update(orgUnits).set({ archivedAt: new Date() }).where(eq(orgUnits.name, "경영관리본부"));
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: unknown) => {
      lines.push(String(line));
    });

    await seedFundScope(SYSTEM_VIEWER);

    expect(await storedValue()).toBeUndefined();
    const warnings = lines.filter((line) => line.includes("seed.fund_division_missing"));
    expect(warnings).toHaveLength(1);
    expect(JSON.parse(warnings[0] ?? "{}")).toMatchObject({ severity: "WARNING", key: FUND_DIVISION_ORG_UNIT.key });
  });
});

// 07.3-02(D-7306 · D-7316 · D-E2): ③단 담당 계급 보정 — 옛 기본값("")이고 관리자가 저장한 적 없을 때만,
// 그리고 경영관리본부 책임자가 1명 이상일 때만 「본부 책임자」로 바꾼다. 관리자 값은 그대로 · 재시드 멱등.
const STEP3_KEYS = [APPROVAL_ROUTE_LEAVE_STEP3_ROLE_ID.key, APPROVAL_ROUTE_EXPENSE_STEP3_ROLE_ID.key, APPROVAL_ROUTE_SETTLEMENT_STEP3_ROLE_ID.key];

async function step3Row(key: string): Promise<{ value: unknown; updatedBy: string | null } | undefined> {
  const [row] = await db.select().from(settingsSimple).where(eq(settingsSimple.key, key)).limit(1);
  return row ? { value: row.value, updatedBy: row.updatedBy } : undefined;
}

async function step3Values(): Promise<unknown[]> {
  return Promise.all(STEP3_KEYS.map(async (key) => (await step3Row(key))?.value));
}

// 배포 전 DB 모사 — 세 키가 옛 기본값 "" · updated_by NULL.
async function simulateOldDefaults(): Promise<void> {
  for (const key of STEP3_KEYS) await upsertSimpleValue(SYSTEM_VIEWER, key, "", null);
}

async function addMgmtHead(): Promise<Viewer> {
  return makeFundPerson("경영관리 책임자", DIVISION_HEAD_ROLE_ID, { division: "경영관리본부" });
}

function captureLog(): string[] {
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
  return lines;
}

describe("③단 담당 계급 시드 보정 (07.3-02 D-7316)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("빈 DB 첫 시드 뒤 세 키 = 본부 책임자", async () => {
    expect(await step3Values()).toEqual([DIVISION_HEAD_ROLE_ID, DIVISION_HEAD_ROLE_ID, DIVISION_HEAD_ROLE_ID]);
  });

  it("옛 기본값 · 손대지 않음 + 경영관리본부 책임자(팀 없음) 있음 → 재시드 뒤 본부 책임자 · 두 번 재시드해도 같다", async () => {
    await simulateOldDefaults();
    await addMgmtHead();
    const lines = captureLog();
    await seedMasterData(SYSTEM_VIEWER);
    expect(await step3Values()).toEqual([DIVISION_HEAD_ROLE_ID, DIVISION_HEAD_ROLE_ID, DIVISION_HEAD_ROLE_ID]);
    expect(lines.filter((line) => line.includes("seed.step3_role_default_fixed"))).toHaveLength(3);
    for (const key of STEP3_KEYS) expect((await step3Row(key))?.updatedBy).toBeNull();
    await seedMasterData(SYSTEM_VIEWER);
    expect(await step3Values()).toEqual([DIVISION_HEAD_ROLE_ID, DIVISION_HEAD_ROLE_ID, DIVISION_HEAD_ROLE_ID]);
  });

  it("경영관리팀 발령 본부 책임자도 책임자로 센다", async () => {
    await simulateOldDefaults();
    await makeFundPerson("경영관리 책임자", DIVISION_HEAD_ROLE_ID, "경영관리팀");
    await seedFundScope(SYSTEM_VIEWER);
    expect(await step3Values()).toEqual([DIVISION_HEAD_ROLE_ID, DIVISION_HEAD_ROLE_ID, DIVISION_HEAD_ROLE_ID]);
  });

  it("경영관리본부 책임자가 없으면 그대로 · 미룸 로그 한 줄 → 책임자를 넣고 재시드하면 보정된다(D-E2)", async () => {
    await simulateOldDefaults();
    // 기획본부 책임자 · 경영관리 사원은 세지 않는다.
    await makeFundPerson("기획 책임자", DIVISION_HEAD_ROLE_ID, { division: "기획본부" });
    await makeFundPerson("경영관리 사원", DEFAULT_ROLE_ID, "경영관리팀");
    const lines = captureLog();
    await seedFundScope(SYSTEM_VIEWER);
    expect(await step3Values()).toEqual(["", "", ""]);
    const deferred = lines.filter((line) => line.includes("seed.step3_role_default_deferred"));
    expect(deferred).toHaveLength(1);
    expect(lines.filter((line) => line.includes("seed.step3_role_default_fixed"))).toHaveLength(0);

    await addMgmtHead();
    await seedFundScope(SYSTEM_VIEWER);
    expect(await step3Values()).toEqual([DIVISION_HEAD_ROLE_ID, DIVISION_HEAD_ROLE_ID, DIVISION_HEAD_ROLE_ID]);
  });

  it("관리자가 저장한 「계급 무관」(빈 값) · 팀장 계급은 책임자 있음 · 없음 모두 그대로", async () => {
    const admin = await makePerson("관리자", DEFAULT_ROLE_ID, null);
    const [leaveKey, expenseKey, settlementKey] = STEP3_KEYS as [string, string, string];
    await upsertSimpleValue(SYSTEM_VIEWER, leaveKey, "", admin.id);
    await upsertSimpleValue(SYSTEM_VIEWER, expenseKey, TEAM_LEAD_ROLE_ID, admin.id);
    await upsertSimpleValue(SYSTEM_VIEWER, settlementKey, "", admin.id);

    await seedFundScope(SYSTEM_VIEWER);
    expect(await step3Values()).toEqual(["", TEAM_LEAD_ROLE_ID, ""]);

    await addMgmtHead();
    await seedMasterData(SYSTEM_VIEWER);
    expect(await step3Values()).toEqual(["", TEAM_LEAD_ROLE_ID, ""]);
    expect((await step3Row(leaveKey))?.updatedBy).toBe(admin.id);
  });

  it("경영관리본부가 없어도(자금 본부 경고 갈래) 보정은 그 앞에서 돈다 — 자금 본부 설정이 없으면 미룬다", async () => {
    await simulateOldDefaults();
    await db.delete(settingsSimple).where(eq(settingsSimple.key, FUND_DIVISION_ORG_UNIT.key));
    await db.update(orgUnits).set({ name: "경영지원본부" }).where(eq(orgUnits.name, "경영관리본부"));
    const lines = captureLog();
    await seedFundScope(SYSTEM_VIEWER);
    expect(await step3Values()).toEqual(["", "", ""]);
    expect(lines.filter((line) => line.includes("seed.step3_role_default_deferred"))).toHaveLength(1);
  });
});

describe("updateSimpleValueIfUnedited (07.3-02 D-7316)", () => {
  it("값이 from이고 updated_by NULL일 때만 바꾸고 참을 돌려준다", async () => {
    const key = APPROVAL_ROUTE_LEAVE_STEP3_ROLE_ID.key;
    await upsertSimpleValue(SYSTEM_VIEWER, key, "", null);
    expect(await updateSimpleValueIfUnedited(SYSTEM_VIEWER, key, "", DIVISION_HEAD_ROLE_ID)).toBe(true);
    expect((await step3Row(key))?.value).toBe(DIVISION_HEAD_ROLE_ID);
    // 값이 from이 아니면 거짓
    expect(await updateSimpleValueIfUnedited(SYSTEM_VIEWER, key, "", DIVISION_HEAD_ROLE_ID)).toBe(false);

    const admin = await makePerson("관리자", DEFAULT_ROLE_ID, null);
    await upsertSimpleValue(SYSTEM_VIEWER, key, "", admin.id);
    expect(await updateSimpleValueIfUnedited(SYSTEM_VIEWER, key, "", DIVISION_HEAD_ROLE_ID)).toBe(false);
    expect(await step3Row(key)).toEqual({ value: "", updatedBy: admin.id });

    expect(await updateSimpleValueIfUnedited(SYSTEM_VIEWER, "no.such.key", "", DIVISION_HEAD_ROLE_ID)).toBe(false);
  });
});
