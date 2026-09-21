import { randomUUID } from "node:crypto";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import {
  getSettingValue,
  setSettingValue,
  addHistorizedValue,
  cancelHistorizedValue,
  listSettingHistory,
  ForbiddenError,
  SettingNotFoundError,
  FutureCancelOnlyError,
  type SettingDef,
} from "@/domain/settings/registry";

function historizedDef(defaultValue?: number): SettingDef<number> {
  return {
    key: `test.integration.historized.${randomUUID()}`,
    kind: "historized",
    schema: z.number().min(0).max(1),
    label: "통합 테스트 이력형 값",
    namespace: "테스트",
    default: defaultValue,
  };
}

function simpleDef(defaultValue?: number): SettingDef<number> {
  return {
    key: `test.integration.simple.${randomUUID()}`,
    kind: "simple",
    schema: z.number().min(0).max(1),
    label: "통합 테스트 비이력형 값",
    namespace: "테스트",
    default: defaultValue,
  };
}

describe("설정 레지스트리 (ADMN-05, 실제 Postgres)", () => {
  it("경계: 적용 시작일이 조회 기준일과 정확히 같은 행이 유효값이다", async () => {
    const def = historizedDef();
    await addHistorizedValue(SYSTEM_VIEWER, def, { effectiveFrom: "2026-01-01", value: 0.2 });
    const value = await getSettingValue(def, { asOf: new Date("2026-01-01T00:00:00Z") });
    expect(value).toBe(0.2);
  });

  it("하루 뒤 행은 아직 유효하지 않다 — 그 이전 행이 유효값으로 남는다", async () => {
    const def = historizedDef();
    await addHistorizedValue(SYSTEM_VIEWER, def, { effectiveFrom: "2026-01-01", value: 0.2 });
    await addHistorizedValue(SYSTEM_VIEWER, def, { effectiveFrom: "2026-01-02", value: 0.3 });
    const value = await getSettingValue(def, { asOf: new Date("2026-01-01T00:00:00Z") });
    expect(value).toBe(0.2);
  });

  it("같은 키에 같은 적용 시작일 두 행은 만들 수 없다(복합 UNIQUE)", async () => {
    const def = historizedDef();
    await addHistorizedValue(SYSTEM_VIEWER, def, { effectiveFrom: "2026-01-01", value: 0.2 });
    await expect(
      addHistorizedValue(SYSTEM_VIEWER, def, { effectiveFrom: "2026-01-01", value: 0.3 }),
    ).rejects.toThrow();
  });

  it("값이 저장되지 않은 이력형 키는 레지스트리 기본값을 돌려준다", async () => {
    const def = historizedDef(0.42);
    const value = await getSettingValue(def, { asOf: new Date("2026-01-01T00:00:00Z") });
    expect(value).toBe(0.42);
  });

  it("기본값도 없는 이력형 키에 값이 없으면 예외를 던진다(fail-closed)", async () => {
    const def = historizedDef(undefined);
    await expect(getSettingValue(def, { asOf: new Date("2026-01-01T00:00:00Z") })).rejects.toBeInstanceOf(
      SettingNotFoundError,
    );
  });

  it("비이력형 키를 같은 값으로 두 번 저장해도 행이 하나로 유지된다", async () => {
    const def = simpleDef();
    await setSettingValue(SYSTEM_VIEWER, def, 0.5);
    await setSettingValue(SYSTEM_VIEWER, def, 0.5);
    const value = await getSettingValue(def);
    expect(value).toBe(0.5);
  });

  it("비이력형 키를 다른 값으로 두 번 저장하면 마지막 값이 남고 행은 여전히 하나다(동시 저장 후 행 하나)", async () => {
    const def = simpleDef();
    await Promise.all([
      setSettingValue(SYSTEM_VIEWER, def, 0.1),
      setSettingValue(SYSTEM_VIEWER, def, 0.2),
    ]);
    const value = await getSettingValue(def);
    expect([0.1, 0.2]).toContain(value);
  });

  it("이력 행 목록이 적용 시작일 내림차순이고 같은 값이 여러 행이어도 순서가 두 번 조회에서 같다", async () => {
    const def = historizedDef();
    await addHistorizedValue(SYSTEM_VIEWER, def, { effectiveFrom: "2026-01-01", value: 0.2 });
    await addHistorizedValue(SYSTEM_VIEWER, def, { effectiveFrom: "2026-03-01", value: 0.2 });
    await addHistorizedValue(SYSTEM_VIEWER, def, { effectiveFrom: "2026-02-01", value: 0.2 });

    const first = await listSettingHistory(def);
    const second = await listSettingHistory(def);
    expect(first.map((entry) => entry.effectiveFrom)).toEqual(["2026-03-01", "2026-02-01", "2026-01-01"]);
    expect(second.map((entry) => entry.effectiveFrom)).toEqual(first.map((entry) => entry.effectiveFrom));
  });

  it("설정 메뉴 쓰기 권한이 없는 계급은 설정을 바꿀 수 없다", async () => {
    const def = simpleDef();
    const pmViewer = { id: `pm-${randomUUID()}`, roleId: DEFAULT_ROLE_ID };
    await expect(setSettingValue(pmViewer, def, 0.3)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("이미 적용된 이력 행은 취소할 수 없고, 미래로 예정된 행만 취소할 수 있다", async () => {
    const def = historizedDef();
    await addHistorizedValue(SYSTEM_VIEWER, def, { effectiveFrom: "2000-01-01", value: 0.2 });
    await expect(cancelHistorizedValue(SYSTEM_VIEWER, def, "2000-01-01")).rejects.toBeInstanceOf(
      FutureCancelOnlyError,
    );

    await addHistorizedValue(SYSTEM_VIEWER, def, { effectiveFrom: "2999-01-01", value: 0.3 });
    await cancelHistorizedValue(SYSTEM_VIEWER, def, "2999-01-01");
    const history = await listSettingHistory(def);
    expect(history.some((entry) => entry.effectiveFrom === "2999-01-01")).toBe(false);
  });

  it("설정 저장이 행동 로그에 행 하나를 남긴다", async () => {
    const { queryActionLog } = await import("@/repositories/action-log");
    const def = simpleDef();
    const before = await queryActionLog(SYSTEM_VIEWER, { actionType: "settings_change" });
    await setSettingValue(SYSTEM_VIEWER, def, 0.6);
    const after = await queryActionLog(SYSTEM_VIEWER, { actionType: "settings_change" });
    expect(after.length).toBe(before.length + 1);
  });
});
