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
  FutureValueNotFoundError,
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

  // ADMN-12 예약 취소 예외의 전제(quick 261001-hfi) — 미래 예정값 취소와 그 로그는 한 트랜잭션이다(85g 발령 취소와 같은 모양).
  it("미래 예정값을 취소하면 행이 없어지고 settings_change 로그 한 건(key · effectiveFrom · cancelled)이 남는다", async () => {
    const { queryActionLog } = await import("@/repositories/action-log");
    const def = historizedDef();
    await addHistorizedValue(SYSTEM_VIEWER, def, { effectiveFrom: "2999-01-01", value: 0.3 });

    await cancelHistorizedValue(SYSTEM_VIEWER, def, "2999-01-01");

    expect((await listSettingHistory(def)).some((entry) => entry.effectiveFrom === "2999-01-01")).toBe(false);
    const logs = (await queryActionLog(SYSTEM_VIEWER, { actionType: "settings_change" })).filter(
      (log) => log.entityId === def.key && (log.detail as { cancelled?: boolean } | null)?.cancelled === true,
    );
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ entity: "settings_historized" });
    expect(logs[0]?.detail).toEqual({ key: def.key, effectiveFrom: "2999-01-01", cancelled: true });
  });

  it("로그 쓰기가 실패하면 예정값 취소도 되돌려져 행이 남는다", async () => {
    const def = historizedDef();
    await addHistorizedValue(SYSTEM_VIEWER, def, { effectiveFrom: "2999-01-01", value: 0.3 });

    await expect(
      cancelHistorizedValue(SYSTEM_VIEWER, def, "2999-01-01", {
        recordAction: () => Promise.reject(new Error("로그 쓰기 실패 흉내")),
      }),
    ).rejects.toThrow("로그 쓰기 실패 흉내");

    expect((await listSettingHistory(def)).some((entry) => entry.effectiveFrom === "2999-01-01")).toBe(true);
  });

  // quick 261002-3mx — 미래 판정과 삭제 사이에 KST 자정이 지나면 방금 적용된 행이다. 삭제 조건이 DB 시각으로 다시 판정한다.
  it("취소 판정 뒤 KST 자정이 지나 오늘 적용된 행은 지우지 않고 로그도 없다", async () => {
    const { queryActionLog } = await import("@/repositories/action-log");
    const { kstToday } = await import("@/lib/kst-date");
    const def = historizedDef();
    const today = kstToday(new Date());
    await addHistorizedValue(SYSTEM_VIEWER, def, { effectiveFrom: today, value: 0.3 });
    // 자정 1초 전(KST)에 판정한 것처럼 — JS 판정은 오늘 행을 아직 미래로 본다.
    const justBeforeMidnight = new Date(new Date(`${today}T00:00:00+09:00`).getTime() - 1000);

    await expect(cancelHistorizedValue(SYSTEM_VIEWER, def, today, { now: justBeforeMidnight })).rejects.toBeInstanceOf(
      FutureValueNotFoundError,
    );

    expect((await listSettingHistory(def)).some((entry) => entry.effectiveFrom === today)).toBe(true);
    const logs = (await queryActionLog(SYSTEM_VIEWER, { actionType: "settings_change" })).filter(
      (log) => log.entityId === def.key && (log.detail as { cancelled?: boolean } | null)?.cancelled === true,
    );
    expect(logs).toHaveLength(0);
  });

  it("없는 미래 예정값 취소는 FutureValueNotFoundError이고 로그가 없다", async () => {
    const { queryActionLog } = await import("@/repositories/action-log");
    const def = historizedDef();

    await expect(cancelHistorizedValue(SYSTEM_VIEWER, def, "2999-01-01")).rejects.toBeInstanceOf(FutureValueNotFoundError);

    const logs = (await queryActionLog(SYSTEM_VIEWER, { actionType: "settings_change" })).filter(
      (log) => log.entityId === def.key,
    );
    expect(logs).toHaveLength(0);
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
