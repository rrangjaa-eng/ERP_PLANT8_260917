import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { settingsSimple } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { PROJECT_COST_RATE_PCT } from "@/domain/settings/keys";
import { getSettingValue, type SettingDef } from "@/domain/settings/registry";
import { setSimpleSettingValue } from "@/domain/document-numbering";
import { findSimpleValue } from "@/repositories/settings";

// 07-08 D-734 · C-P2-10 — 원가율 비움 ≠ 0. 설정 화면이 쓰는 저장 경로(setSimpleSettingValue)로 실제 Postgres에 넣고 다시 읽는다.
const def = PROJECT_COST_RATE_PCT as SettingDef<unknown>;

afterEach(async () => {
  await db.delete(settingsSimple).where(eq(settingsSimple.key, PROJECT_COST_RATE_PCT.key));
});

describe("원가율 저장 · 읽기 (D-734, 실제 Postgres)", () => {
  it("저장값이 없으면 null(비움)이다 — 시드는 행을 만들지 않는다", async () => {
    expect(await getSettingValue(PROJECT_COST_RATE_PCT)).toBeNull();
    expect(await findSimpleValue(SYSTEM_VIEWER, PROJECT_COST_RATE_PCT.key)).toBeNull();
  });

  it("12.5를 저장하면 12.5, 비운 칸(빈 문자열)을 저장하면 null로 저장된다", async () => {
    await setSimpleSettingValue(SYSTEM_VIEWER, def, "12.5", new Date());
    expect(await getSettingValue(PROJECT_COST_RATE_PCT)).toBe(12.5);
    await setSimpleSettingValue(SYSTEM_VIEWER, def, "", new Date());
    expect(await getSettingValue(PROJECT_COST_RATE_PCT)).toBeNull();
    const [row] = await db.select().from(settingsSimple).where(eq(settingsSimple.key, PROJECT_COST_RATE_PCT.key));
    expect(row?.value).toBeNull();
  });

  it("0은 비움과 다른 값 0으로 저장된다", async () => {
    await setSimpleSettingValue(SYSTEM_VIEWER, def, "0", new Date());
    expect(await getSettingValue(PROJECT_COST_RATE_PCT)).toBe(0);
  });

  it("범위 밖 값은 거부하고 저장값은 그대로다", async () => {
    await setSimpleSettingValue(SYSTEM_VIEWER, def, "12.5", new Date());
    await expect(setSimpleSettingValue(SYSTEM_VIEWER, def, "100.1", new Date())).rejects.toThrow();
    expect(await getSettingValue(PROJECT_COST_RATE_PCT)).toBe(12.5);
  });
});
