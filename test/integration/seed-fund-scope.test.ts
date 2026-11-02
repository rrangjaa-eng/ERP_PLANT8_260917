import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { orgUnits, settingsSimple } from "@/db/schema";
import { seedMasterData } from "@/domain/seed";
import { seedFundScope } from "@/domain/seed/fund-scope";
import { FUND_DIVISION_ORG_UNIT } from "@/domain/settings/keys";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { upsertSimpleValue } from "@/repositories/settings";
import { orgUnitIdByName } from "./approvals-fixtures";

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
