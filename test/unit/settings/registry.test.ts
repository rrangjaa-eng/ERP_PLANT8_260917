import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import {
  getSettingValue,
  setSettingValue,
  addHistorizedValue,
  cancelHistorizedValue,
  listSettingHistory,
  ForbiddenError,
  SettingNotFoundError,
  SettingKindMismatchError,
  FutureCancelOnlyError,
  type SettingDef,
} from "@/domain/settings/registry";
import type { Viewer } from "@/domain/viewer";

const viewer: Viewer = { id: "u1", roleId: "role-sysadmin" };

const SIMPLE_DEF: SettingDef<number> = {
  key: "test.simple.value",
  kind: "simple",
  schema: z.number().min(0).max(1),
  label: "테스트 비율",
  namespace: "테스트",
  default: 0.5,
};

const SIMPLE_DEF_NO_DEFAULT: SettingDef<number> = {
  key: "test.simple.no-default",
  kind: "simple",
  schema: z.number(),
  label: "테스트 기본값 없음",
  namespace: "테스트",
};

const HISTORIZED_DEF: SettingDef<number> = {
  key: "test.historized.rate",
  kind: "historized",
  schema: z.number().min(0).max(1),
  label: "테스트 이력형 비율",
  namespace: "테스트",
  default: 0.1,
};

describe("getSettingValue (ADMN-05)", () => {
  it("비이력형: 저장된 값이 있으면 스키마로 검증해 그대로 돌려준다", async () => {
    const findSimpleValue = vi.fn().mockResolvedValue({
      key: SIMPLE_DEF.key,
      value: 0.3,
      updatedAt: new Date(),
      updatedBy: null,
    });
    const result = await getSettingValue(SIMPLE_DEF, undefined, { findSimpleValue });
    expect(result).toBe(0.3);
  });

  it("비이력형: 값이 없으면 레지스트리 기본값을 돌려준다", async () => {
    const findSimpleValue = vi.fn().mockResolvedValue(null);
    const result = await getSettingValue(SIMPLE_DEF, undefined, { findSimpleValue });
    expect(result).toBe(0.5);
  });

  it("비이력형: 값도 기본값도 없으면 예외를 던진다(fail-closed — 0으로 떨어지지 않는다)", async () => {
    const findSimpleValue = vi.fn().mockResolvedValue(null);
    await expect(getSettingValue(SIMPLE_DEF_NO_DEFAULT, undefined, { findSimpleValue })).rejects.toBeInstanceOf(
      SettingNotFoundError,
    );
  });

  it("이력형: 적용 시작일이 조회 기준일과 정확히 같은 행이 유효값이다(경계 포함)", async () => {
    const findEffectiveValue = vi.fn().mockResolvedValue({
      id: "h1",
      key: HISTORIZED_DEF.key,
      effectiveFrom: "2026-01-01",
      value: 0.2,
      createdAt: new Date(),
      createdBy: null,
    });
    const result = await getSettingValue(HISTORIZED_DEF, { asOf: new Date("2026-01-01T00:00:00Z") }, {
      findEffectiveValue,
    });
    expect(result).toBe(0.2);
    expect(findEffectiveValue).toHaveBeenCalledWith(expect.anything(), HISTORIZED_DEF.key, "2026-01-01");
  });

  it("이력형: 해당하는 행이 없으면(모든 행이 미래) 기본값으로 떨어진다", async () => {
    const findEffectiveValue = vi.fn().mockResolvedValue(null);
    const result = await getSettingValue(HISTORIZED_DEF, { asOf: new Date("2020-01-01") }, { findEffectiveValue });
    expect(result).toBe(0.1);
  });

  it("이력형: 기본값도 없으면 예외를 던진다", async () => {
    const noDefaultHistorized: SettingDef<number> = { ...HISTORIZED_DEF, default: undefined };
    const findEffectiveValue = vi.fn().mockResolvedValue(null);
    await expect(
      getSettingValue(noDefaultHistorized, undefined, { findEffectiveValue }),
    ).rejects.toBeInstanceOf(SettingNotFoundError);
  });

  it("레지스트리 스키마 범위를 벗어난 값은 파싱이 거부한다(1 초과 비율)", async () => {
    const findSimpleValue = vi.fn().mockResolvedValue({
      key: SIMPLE_DEF.key,
      value: 1.5,
      updatedAt: new Date(),
      updatedBy: null,
    });
    await expect(getSettingValue(SIMPLE_DEF, undefined, { findSimpleValue })).rejects.toThrow();
  });

  it("레지스트리가 값을 반올림·절사하지 않는다 — 넘어온 수치가 그대로 돌아온다", async () => {
    const oddDef: SettingDef<number> = { ...SIMPLE_DEF, schema: z.number() };
    const findSimpleValue = vi.fn().mockResolvedValue({
      key: oddDef.key,
      value: 0.123456789,
      updatedAt: new Date(),
      updatedBy: null,
    });
    const result = await getSettingValue(oddDef, undefined, { findSimpleValue });
    expect(result).toBe(0.123456789);
  });
});

describe("setSettingValue (비이력형 전용)", () => {
  it("설정 메뉴 쓰기 권한이 없으면 ForbiddenError를 던지고 저장을 시도하지 않는다", async () => {
    const upsertSimpleValue = vi.fn();
    const can = vi.fn().mockResolvedValue(false);
    await expect(setSettingValue(viewer, SIMPLE_DEF, 0.4, { can, upsertSimpleValue })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(upsertSimpleValue).not.toHaveBeenCalled();
  });

  it("이력형 키에 부르면 거부한다", async () => {
    const can = vi.fn().mockResolvedValue(true);
    await expect(setSettingValue(viewer, HISTORIZED_DEF, 0.2, { can })).rejects.toBeInstanceOf(
      SettingKindMismatchError,
    );
  });

  it("권한이 있으면 upsert하고 행동 로그를 남긴다", async () => {
    const can = vi.fn().mockResolvedValue(true);
    const upsertSimpleValue = vi.fn().mockResolvedValue(undefined);
    const recordAction = vi.fn().mockResolvedValue(undefined);
    await setSettingValue(viewer, SIMPLE_DEF, 0.4, { can, upsertSimpleValue, recordAction });
    expect(upsertSimpleValue).toHaveBeenCalledWith(viewer, SIMPLE_DEF.key, 0.4, viewer.id);
    expect(recordAction).toHaveBeenCalledTimes(1);
    expect(recordAction.mock.calls[0]?.[1]).toMatchObject({ actionType: "settings_change" });
  });

  it("스키마 범위를 벗어난 값은 저장 전에 거부된다", async () => {
    const can = vi.fn().mockResolvedValue(true);
    const upsertSimpleValue = vi.fn();
    await expect(setSettingValue(viewer, SIMPLE_DEF, 5, { can, upsertSimpleValue })).rejects.toThrow();
    expect(upsertSimpleValue).not.toHaveBeenCalled();
  });
});

describe("addHistorizedValue / cancelHistorizedValue (이력형 전용)", () => {
  it("비이력형 키에 addHistorizedValue를 부르면 거부한다", async () => {
    const can = vi.fn().mockResolvedValue(true);
    await expect(
      addHistorizedValue(viewer, SIMPLE_DEF, { effectiveFrom: "2026-01-01", value: 0.2 }, { can }),
    ).rejects.toBeInstanceOf(SettingKindMismatchError);
  });

  it("권한이 있으면 insert하고 행동 로그를 남긴다", async () => {
    const can = vi.fn().mockResolvedValue(true);
    const insertHistorizedValue = vi.fn().mockResolvedValue({
      id: "h2",
      key: HISTORIZED_DEF.key,
      effectiveFrom: "2026-06-01",
      value: 0.15,
      createdAt: new Date(),
      createdBy: viewer.id,
    });
    const recordAction = vi.fn().mockResolvedValue(undefined);
    await addHistorizedValue(
      viewer,
      HISTORIZED_DEF,
      { effectiveFrom: "2026-06-01", value: 0.15 },
      { can, insertHistorizedValue, recordAction },
    );
    expect(insertHistorizedValue).toHaveBeenCalledWith(viewer, {
      key: HISTORIZED_DEF.key,
      effectiveFrom: "2026-06-01",
      value: 0.15,
      by: viewer.id,
    });
    expect(recordAction).toHaveBeenCalledTimes(1);
  });

  it("같은 (키, 적용 시작일) 재삽입은 리포지토리가 던지는 예외를 그대로 전파한다(복합 UNIQUE)", async () => {
    const can = vi.fn().mockResolvedValue(true);
    const insertHistorizedValue = vi.fn().mockRejectedValue(new Error("duplicate key value violates unique"));
    await expect(
      addHistorizedValue(
        viewer,
        HISTORIZED_DEF,
        { effectiveFrom: "2026-06-01", value: 0.15 },
        { can, insertHistorizedValue },
      ),
    ).rejects.toThrow(/duplicate/);
  });

  it("미래로 예정된 행만 취소할 수 있다 — 오늘 이전 적용 시작일은 거부한다", async () => {
    const can = vi.fn().mockResolvedValue(true);
    const deleteFutureHistorizedValue = vi.fn();
    await expect(
      cancelHistorizedValue(viewer, HISTORIZED_DEF, "2000-01-01", { can, deleteFutureHistorizedValue }),
    ).rejects.toBeInstanceOf(FutureCancelOnlyError);
    expect(deleteFutureHistorizedValue).not.toHaveBeenCalled();
  });

  it("미래 적용 시작일은 취소가 성공하고 행동 로그를 남긴다", async () => {
    const can = vi.fn().mockResolvedValue(true);
    const deleteFutureHistorizedValue = vi.fn().mockResolvedValue(undefined);
    const recordAction = vi.fn().mockResolvedValue(undefined);
    const farFuture = "2999-01-01";
    await cancelHistorizedValue(viewer, HISTORIZED_DEF, farFuture, {
      can,
      deleteFutureHistorizedValue,
      recordAction,
    });
    expect(deleteFutureHistorizedValue).toHaveBeenCalledWith(viewer, HISTORIZED_DEF.key, farFuture);
    expect(recordAction).toHaveBeenCalledTimes(1);
  });
});

describe("listSettingHistory", () => {
  it("이력 행 목록이 적용 시작일 내림차순으로 안정적이다(리포지토리 순서를 그대로 통과)", async () => {
    const listHistory = vi.fn().mockResolvedValue([
      { id: "h3", key: HISTORIZED_DEF.key, effectiveFrom: "2026-06-01", value: 0.15, createdAt: new Date(), createdBy: null },
      { id: "h2", key: HISTORIZED_DEF.key, effectiveFrom: "2026-01-01", value: 0.1, createdAt: new Date(), createdBy: null },
    ]);
    const result = await listSettingHistory(HISTORIZED_DEF, { listHistory });
    expect(result.map((entry) => entry.effectiveFrom)).toEqual(["2026-06-01", "2026-01-01"]);
    expect(result.map((entry) => entry.value)).toEqual([0.15, 0.1]);
  });

  it("비이력형 키는 빈 배열을 돌려준다", async () => {
    const result = await listSettingHistory(SIMPLE_DEF);
    expect(result).toEqual([]);
  });
});
