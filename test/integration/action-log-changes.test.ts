import { randomUUID } from "node:crypto";
import { z } from "zod";
import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { settingsSimple, users } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { LEAVE_DOCUMENT_KIND, LEAVE_ROUTE_SETTINGS } from "@/domain/leave";
import { saveRouteStepSettings } from "@/domain/approvals/route-step-settings";
import { changePersonRole, registerPerson } from "@/domain/people";
import { importSettings } from "@/domain/settings/export";
import {
  ACTION_LOG_OPTIONAL_TYPES,
  AUTH_LOCKOUT_THRESHOLD,
  AUTH_LOCKOUT_WINDOW_MINUTES,
  TAX_VAT_RATE,
} from "@/domain/settings/keys";
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

describe("결재선 단계 설정 · 설정 가져오기 — 전후 값 (Task 2)", () => {
  const STEP2 = LEAVE_ROUTE_SETTINGS.steps[1]!;
  const CEO_COMPANY = { enabled: true, roleId: CEO_ROLE_ID, scope: "company", orgUnitId: "" };

  it("결재선 단계 저장: 칸마다 settings_change 한 줄에 changes {value:[이전,이후]}, 바뀌지 않은 칸은 빈 changes", async () => {
    await db.delete(settingsSimple).where(eq(settingsSimple.key, STEP2.roleId.key));
    const previousRoleId = await getSettingValue(STEP2.roleId);
    const previousScope = await getSettingValue(STEP2.scope);
    const before = (await settingsLogsFor(STEP2.roleId.key)).length;

    await saveRouteStepSettings(SYSTEM_VIEWER, { kind: LEAVE_DOCUMENT_KIND, stepIndex: 2, values: CEO_COMPANY });

    const roleLogs = (await settingsLogsFor(STEP2.roleId.key)).map((entry) => entry.detail as Detail);
    expect(roleLogs).toHaveLength(before + 1);
    expect(roleLogs).toContainEqual({ key: STEP2.roleId.key, changes: { value: [previousRoleId, CEO_ROLE_ID] } });
    const scopeLogs = (await settingsLogsFor(STEP2.scope.key)).map((entry) => entry.detail as Detail);
    expect(scopeLogs).toContainEqual({
      key: STEP2.scope.key,
      changes: previousScope === "company" ? {} : { value: [previousScope, "company"] },
    });
  });

  it("결재선 단계 저장: 기록이 실패하면 네 칸 모두 그대로다", async () => {
    const previousRoleId = await getSettingValue(STEP2.roleId);
    await expect(
      saveRouteStepSettings(
        SYSTEM_VIEWER,
        { kind: LEAVE_DOCUMENT_KIND, stepIndex: 2, values: { ...CEO_COMPANY, roleId: DIVISION_HEAD_ROLE_ID } },
        { recordAction: () => Promise.reject(new Error("로그 쓰기 실패 흉내")) },
      ),
    ).rejects.toThrow("로그 쓰기 실패 흉내");
    expect(await getSettingValue(STEP2.roleId)).toBe(previousRoleId);
  });

  it("설정 가져오기: 로그 한 행에 바뀐 키만 changes {키:[이전,이후]}, 이력형은 「키@적용 시작일」", async () => {
    await setSettingValue(SYSTEM_VIEWER, AUTH_LOCKOUT_THRESHOLD, 6);
    await setSettingValue(SYSTEM_VIEWER, AUTH_LOCKOUT_WINDOW_MINUTES, 15);
    const importLogs = async () =>
      (await queryActionLog(SYSTEM_VIEWER, { actionType: "settings_change" })).filter((entry) => entry.entity === "settings");
    const logsBefore = (await importLogs()).length;
    const previousVat = await getSettingValue(TAX_VAT_RATE, { asOf: new Date("2999-01-01T00:00:00Z") });

    await importSettings(SYSTEM_VIEWER, {
      schemaVersion: "1",
      exportedAt: new Date().toISOString(),
      settings: {
        [AUTH_LOCKOUT_THRESHOLD.key]: 9,
        [AUTH_LOCKOUT_WINDOW_MINUTES.key]: 15, // 같은 값 — changes에 없다
        [TAX_VAT_RATE.key]: [{ effectiveFrom: "2999-01-01", value: 0.2 }],
      },
    });

    const imports = await importLogs();
    expect(imports).toHaveLength(logsBefore + 1);
    const latest = imports
      .map((entry) => entry.detail as Detail)
      .filter((detail) => detail.changes?.[AUTH_LOCKOUT_THRESHOLD.key]);
    expect(latest.at(-1)).toEqual({
      format: "json",
      scope: "import",
      changes: {
        [AUTH_LOCKOUT_THRESHOLD.key]: [6, 9],
        [`${TAX_VAT_RATE.key}@2999-01-01`]: [previousVat, 0.2],
      },
    });
  });

  it("설정 가져오기: 기록이 실패하면 값도 적용되지 않는다(같은 트랜잭션)", async () => {
    await setSettingValue(SYSTEM_VIEWER, AUTH_LOCKOUT_THRESHOLD, 4);
    await expect(
      importSettings(
        SYSTEM_VIEWER,
        { schemaVersion: "1", exportedAt: new Date().toISOString(), settings: { [AUTH_LOCKOUT_THRESHOLD.key]: 8 } },
        { recordAction: () => Promise.reject(new Error("로그 쓰기 실패 흉내")) },
      ),
    ).rejects.toThrow("로그 쓰기 실패 흉내");
    expect(await getSettingValue(AUTH_LOCKOUT_THRESHOLD)).toBe(4);
  });
});

describe("사람 계급 바꾸기 — permission_change 전후 값 (Task 3)", () => {
  async function newPerson() {
    const { userId } = await registerPerson(SYSTEM_VIEWER, {
      name: "계급전후값",
      email: `${randomUUID()}@test.local`,
      roleId: DEFAULT_ROLE_ID,
    });
    return userId;
  }

  async function roleLogsFor(userId: string) {
    const logs = await queryActionLog(SYSTEM_VIEWER, { actionType: "permission_change" });
    return logs.filter((entry) => entry.entity === "user" && entry.entityId === userId);
  }

  it("계급을 바꾸면 permission_change 한 행에 changes {roleId:[이전,이후]}", async () => {
    const userId = await newPerson();
    await changePersonRole(SYSTEM_VIEWER, userId, SYSADMIN_ROLE_ID);

    const logs = await roleLogsFor(userId);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.detail).toEqual({ changes: { roleId: [DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID] } });
  });

  it("같은 계급으로 바꾸면 changes가 빈 객체이고 행은 기존처럼 남는다", async () => {
    const userId = await newPerson();
    await changePersonRole(SYSTEM_VIEWER, userId, DEFAULT_ROLE_ID);

    const logs = await roleLogsFor(userId);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.detail).toEqual({ changes: {} });
  });

  it("기록이 실패하면 계급도 그대로다(같은 트랜잭션)", async () => {
    const userId = await newPerson();
    await expect(
      changePersonRole(SYSTEM_VIEWER, userId, SYSADMIN_ROLE_ID, {
        recordAction: () => Promise.reject(new Error("로그 쓰기 실패 흉내")),
      }),
    ).rejects.toThrow("로그 쓰기 실패 흉내");

    const [row] = await db.select({ roleId: users.roleId }).from(users).where(eq(users.id, userId));
    expect(row?.roleId).toBe(DEFAULT_ROLE_ID);
    expect(await roleLogsFor(userId)).toHaveLength(0);
  });
});
