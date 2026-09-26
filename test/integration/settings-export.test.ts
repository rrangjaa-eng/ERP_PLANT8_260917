import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { settingsSimple, settingsHistorized } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { queryActionLog } from "@/repositories/action-log";
import {
  SETTING_DEFS,
  AUTH_LOCKOUT_THRESHOLD,
  TAX_VAT_RATE,
  LEAVE_ANNUAL_DAYS,
  APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID,
} from "@/domain/settings/keys";
import { getSettingValue, setSettingValue, addHistorizedValue, listSettingHistory } from "@/domain/settings/registry";
import { exportSettings, importSettings, ImportValidationError } from "@/domain/settings/export";

async function snapshot(): Promise<Record<string, unknown>> {
  const state: Record<string, unknown> = {};
  for (const def of SETTING_DEFS) {
    state[def.key] = def.kind === "historized" ? await listSettingHistory(def) : await getSettingValue(def);
  }
  return state;
}

describe("설정 JSON 내보내기·가져오기 (ADMN-06, 실제 Postgres)", () => {
  it("(a) 내보내고 빈 환경에 가져오면 모든 키의 조회 결과가 원래 환경과 같다", async () => {
    await setSettingValue(SYSTEM_VIEWER, AUTH_LOCKOUT_THRESHOLD, 9);
    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: "2026-01-01", value: 0.12 });

    const before = await snapshot();
    const exported = await exportSettings(SYSTEM_VIEWER);

    // 빈 환경 시뮬레이션 — 설정 두 표를 완전히 비운다.
    await db.delete(settingsHistorized);
    await db.delete(settingsSimple);

    await importSettings(SYSTEM_VIEWER, exported);
    const after = await snapshot();

    expect(after).toEqual(before);
  });

  it("(b) 같은 JSON을 두 번 가져오면 두 번째가 상태를 바꾸지 않는다(멱등)", async () => {
    await setSettingValue(SYSTEM_VIEWER, AUTH_LOCKOUT_THRESHOLD, 8);
    const exported = await exportSettings(SYSTEM_VIEWER);

    await importSettings(SYSTEM_VIEWER, exported);
    const afterFirst = await snapshot();
    await importSettings(SYSTEM_VIEWER, exported);
    const afterSecond = await snapshot();

    expect(afterSecond).toEqual(afterFirst);
  });

  it("(c) 가져오기 항목 중 하나라도 검증에 실패하면 아무것도 적용되지 않는다", async () => {
    await setSettingValue(SYSTEM_VIEWER, AUTH_LOCKOUT_THRESHOLD, 7);
    const before = await snapshot();

    const badPayload = {
      schemaVersion: "1",
      exportedAt: new Date().toISOString(),
      settings: {
        [AUTH_LOCKOUT_THRESHOLD.key]: 3, // 유효한 값
        "action_log.optional_types": "이건 배열이 아니라 문자열이다", // 스키마 위반
      },
    };

    await expect(importSettings(SYSTEM_VIEWER, badPayload)).rejects.toBeInstanceOf(ImportValidationError);

    const after = await snapshot();
    expect(after).toEqual(before);
  });

  it("(d) 내보내기가 excel_export 행동 로그 행 하나를 남긴다", async () => {
    const beforeLogs = await queryActionLog(SYSTEM_VIEWER, { actionType: "excel_export" });
    await exportSettings(SYSTEM_VIEWER);
    const afterLogs = await queryActionLog(SYSTEM_VIEWER, { actionType: "excel_export" });
    expect(afterLogs.length).toBe(beforeLogs.length + 1);
  });

  // 04.1-04(ENG-5 · B-NEW02): 가져오기도 적용 시작일 공통 검증을 거친다 — 지난 연도는
  // 그날 이미 유효한 값과 같은 무변화 행만 통과. 서울 2026-09-24 12:00 기준.
  const importDeps = { now: new Date("2026-09-24T03:00:00Z") };

  function payload(settings: Record<string, unknown>) {
    return { schemaVersion: "1", exportedAt: new Date().toISOString(), settings };
  }

  async function annualAndThreshold() {
    return { annual: await listSettingHistory(LEAVE_ANNUAL_DAYS), threshold: await getSettingValue(AUTH_LOCKOUT_THRESHOLD) };
  }

  it("(e) 값이 다른 지난 연도 항목은 전체 거부 — 함께 넣은 단순 키도 그대로", async () => {
    const before = await annualAndThreshold();
    const error = await importSettings(
      SYSTEM_VIEWER,
      payload({ [LEAVE_ANNUAL_DAYS.key]: [{ effectiveFrom: "2025-01-01", value: 20 }], [AUTH_LOCKOUT_THRESHOLD.key]: 3 }),
      importDeps,
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ImportValidationError);
    expect((error as ImportValidationError).issues.join("\n")).toContain("지난 연도");
    expect(await annualAndThreshold()).toEqual(before);
  });

  it("(e2) 지난 연도 비교 조회가 DB 오류로 실패하면 검증 오류로 바꾸지 않고 그 오류를 그대로 올린다", async () => {
    const before = await annualAndThreshold();
    const outage = new Error("connection terminated");
    const error = await importSettings(
      SYSTEM_VIEWER,
      payload({ [LEAVE_ANNUAL_DAYS.key]: [{ effectiveFrom: "2025-01-01", value: 20 }] }),
      { ...importDeps, getSettingValue: () => Promise.reject(outage) },
    ).catch((caught: unknown) => caught);
    expect(error).toBe(outage);
    expect(await annualAndThreshold()).toEqual(before);
  });

  it("(f) 무변화 지난 행(2000-01-01 · 시드 15) + 미래 행은 통과하고 미래 행만 늘어난다", async () => {
    const before = await listSettingHistory(LEAVE_ANNUAL_DAYS);
    await importSettings(
      SYSTEM_VIEWER,
      payload({
        [LEAVE_ANNUAL_DAYS.key]: [
          { effectiveFrom: "2000-01-01", value: 15 },
          { effectiveFrom: "2027-01-01", value: 16 },
        ],
      }),
      importDeps,
    );
    expect(await listSettingHistory(LEAVE_ANNUAL_DAYS)).toEqual([{ effectiveFrom: "2027-01-01", value: 16 }, ...before]);
  });

  it("(g) 1월 1일이 아닌 항목은 1월 1일 문구로 거부", async () => {
    const before = await listSettingHistory(LEAVE_ANNUAL_DAYS);
    const error = await importSettings(
      SYSTEM_VIEWER,
      payload({ [LEAVE_ANNUAL_DAYS.key]: [{ effectiveFrom: "2026-03-01", value: 16 }] }),
      importDeps,
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ImportValidationError);
    expect((error as ImportValidationError).issues.join("\n")).toContain("적용 시작일은 1월 1일");
    expect(await listSettingHistory(LEAVE_ANNUAL_DAYS)).toEqual(before);
  });

  it("(h) 올해 1월 1일은 통과", async () => {
    await importSettings(SYSTEM_VIEWER, payload({ [LEAVE_ANNUAL_DAYS.key]: [{ effectiveFrom: "2026-01-01", value: 16 }] }), importDeps);
    expect((await listSettingHistory(LEAVE_ANNUAL_DAYS))[0]).toEqual({ effectiveFrom: "2026-01-01", value: 16 });
  });

  it("(i) 비uuid 특정 부서는 전체 거부 — 함께 넣은 단순 키도 그대로, 빈 값은 통과(B-NEW02)", async () => {
    const orgUnitBefore = await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID);
    const thresholdBefore = await getSettingValue(AUTH_LOCKOUT_THRESHOLD);
    const error = await importSettings(
      SYSTEM_VIEWER,
      payload({ [APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID.key]: "not-a-uuid", [AUTH_LOCKOUT_THRESHOLD.key]: 3 }),
      importDeps,
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ImportValidationError);
    expect((error as ImportValidationError).issues.join("\n")).toContain(APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID.key);
    expect(await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID)).toBe(orgUnitBefore);
    expect(await getSettingValue(AUTH_LOCKOUT_THRESHOLD)).toBe(thresholdBefore);

    await importSettings(SYSTEM_VIEWER, payload({ [APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID.key]: "" }), importDeps);
    expect(await getSettingValue(APPROVAL_ROUTE_LEAVE_STEP3_ORG_UNIT_ID)).toBe("");
  });
});
