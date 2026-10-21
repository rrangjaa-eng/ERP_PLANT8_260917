import { randomUUID } from "node:crypto";
import { z } from "zod";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { settingsSimple } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { ACTION_LOG_OPTIONAL_TYPES } from "@/domain/settings/keys";
import {
  addHistorizedValue,
  cancelHistorizedValue,
  getSettingValue,
  setSettingValue,
  type SettingDef,
} from "@/domain/settings/registry";
import { queryActionLog } from "@/repositories/action-log";

// 07-04(D7 · R4 · R5): 설정 · 사람 계급 변경이 끌 수 없는 기록으로 전후 값과 함께, 저장과 한 트랜잭션으로 남는다.

function simpleDef(): SettingDef<number> {
  return {
    key: `test.action-log-changes.simple.${randomUUID()}`,
    kind: "simple",
    schema: z.number().min(0).max(100),
    label: "행동 로그 전후 값 시험",
    namespace: "테스트",
  };
}

function historizedDef(defaultValue?: number): SettingDef<number> {
  return {
    key: `test.action-log-changes.historized.${randomUUID()}`,
    kind: "historized",
    schema: z.number().min(0).max(100),
    label: "행동 로그 전후 값 시험(이력형)",
    namespace: "테스트",
    default: defaultValue,
  };
}

async function settingsLogsFor(key: string) {
  const logs = await queryActionLog(SYSTEM_VIEWER, { actionType: "settings_change" });
  return logs.filter((entry) => entry.entityId === key);
}

type Detail = { key?: string; effectiveFrom?: string; cancelled?: boolean; changes?: Record<string, [unknown, unknown]> };

afterEach(async () => {
  await db.delete(settingsSimple).where(eq(settingsSimple.key, ACTION_LOG_OPTIONAL_TYPES.key));
});

describe("설정 저장 — settings_change 전후 값 (Task 1)", () => {
  it("행동 로그를 전부 꺼도 단순 설정 저장이 settings_change 한 행과 changes {value:[이전,이후]}를 남긴다", async () => {
    await setSettingValue(SYSTEM_VIEWER, ACTION_LOG_OPTIONAL_TYPES, []);
    const def = simpleDef();
    await setSettingValue(SYSTEM_VIEWER, def, 10);
    await setSettingValue(SYSTEM_VIEWER, def, 25);

    const logs = await settingsLogsFor(def.key);
    expect(logs).toHaveLength(2);
    const details = logs.map((entry) => entry.detail as Detail);
    expect(details).toContainEqual({ key: def.key, changes: { value: [null, 10] } });
    expect(details).toContainEqual({ key: def.key, changes: { value: [10, 25] } });
  });

  it("기록 단계가 실패하면 설정 값도 바뀌지 않는다(같은 트랜잭션)", async () => {
    const def = simpleDef();
    await setSettingValue(SYSTEM_VIEWER, def, 10);

    await expect(
      setSettingValue(SYSTEM_VIEWER, def, 50, { recordAction: () => Promise.reject(new Error("로그 쓰기 실패 흉내")) }),
    ).rejects.toThrow("로그 쓰기 실패 흉내");

    expect(await getSettingValue(def)).toBe(10);
  });
});

describe("이력형 추가 · 취소 — 전후 값 (Task 2)", () => {
  it("이력형 추가: changes {value:[직전 유효값, 새 값]} + effectiveFrom", async () => {
    const def = historizedDef(5);
    await addHistorizedValue(SYSTEM_VIEWER, def, { effectiveFrom: "2999-01-01", value: 30 });
    await addHistorizedValue(SYSTEM_VIEWER, def, { effectiveFrom: "2999-06-01", value: 40 });

    const details = (await settingsLogsFor(def.key)).map((entry) => entry.detail as Detail);
    expect(details).toContainEqual({ key: def.key, effectiveFrom: "2999-01-01", changes: { value: [5, 30] } });
    expect(details).toContainEqual({ key: def.key, effectiveFrom: "2999-06-01", changes: { value: [30, 40] } });
  });

  it("이력형 추가: 기록이 실패하면 이력 행도 남지 않는다", async () => {
    const def = historizedDef(5);
    await expect(
      addHistorizedValue(SYSTEM_VIEWER, def, { effectiveFrom: "2999-01-01", value: 30 }, { recordAction: () => Promise.reject(new Error("로그 쓰기 실패 흉내")) }),
    ).rejects.toThrow("로그 쓰기 실패 흉내");
    expect(await getSettingValue(def, { asOf: new Date("2999-02-01T00:00:00Z") })).toBe(5);
  });

  it("이력형 취소: changes {value:[취소한 행 값, 취소 뒤 그 날짜의 유효값]}", async () => {
    const def = historizedDef(5);
    await addHistorizedValue(SYSTEM_VIEWER, def, { effectiveFrom: "2999-01-01", value: 30 });
    await addHistorizedValue(SYSTEM_VIEWER, def, { effectiveFrom: "2999-06-01", value: 40 });
    await cancelHistorizedValue(SYSTEM_VIEWER, def, "2999-06-01");

    const cancelled = (await settingsLogsFor(def.key)).map((entry) => entry.detail as Detail).filter((detail) => detail.cancelled);
    expect(cancelled).toEqual([{ key: def.key, effectiveFrom: "2999-06-01", cancelled: true, changes: { value: [40, 30] } }]);
  });
});
