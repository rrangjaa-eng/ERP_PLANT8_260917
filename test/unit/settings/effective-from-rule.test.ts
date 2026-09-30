import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import {
  addHistorizedValue,
  cancelHistorizedValue,
  validateEffectiveFrom,
  FutureCancelOnlyError,
  type SettingDef,
} from "@/domain/settings/registry";
import type { Viewer } from "@/domain/viewer";

// 04.1-04(ENG-5 · B-NEW01): 이력형 키의 적용 시작일 규칙 — `year_start` 키는 실재하는
// YYYY-01-01만, 서울 기준 올해 이후만. 저장 · 취소 두 경로가 같은 검증을 거친다.

const viewer: Viewer = { id: "u1", roleId: "role-sysadmin" };

const YEAR_START_DEF: SettingDef<number> = {
  key: "test.historized.year_start",
  kind: "historized",
  schema: z.number().int().min(0),
  label: "테스트 연 단위 값",
  namespace: "테스트",
  default: 15,
  effectiveFromRule: "year_start",
};

const PLAIN_DEF: SettingDef<number> = {
  key: "test.historized.plain",
  kind: "historized",
  schema: z.number().min(0).max(1),
  label: "테스트 이력형 비율",
  namespace: "테스트",
  default: 0.1,
};

const FORMAT_MESSAGE = "적용 시작일은 1월 1일만 · 2027-01-01처럼 적기";
const PAST_YEAR_MESSAGE = "지난 연도 변경 불가 · 지난 잔고는 사람 상세의 연차 조정으로 고치기";
const CANONICAL_MESSAGE = "적용 시작일은 2027-01-01처럼 적기";

// 서울 2026-09-24 12:00.
const NOW = new Date("2026-09-24T03:00:00Z");

function writeDeps(now: Date = NOW) {
  return {
    now,
    can: vi.fn().mockResolvedValue(true),
    insertHistorizedValue: vi.fn().mockResolvedValue(undefined),
    deleteFutureHistorizedValue: vi.fn().mockResolvedValue(undefined),
    recordAction: vi.fn().mockResolvedValue(undefined),
  };
}

describe("validateEffectiveFrom (ENG-5)", () => {
  it.each([
    [PLAIN_DEF, "2027-03-01", null],
    [YEAR_START_DEF, "2027-03-01", "format"],
    [YEAR_START_DEF, "2025-01-01", "past_year"],
    [YEAR_START_DEF, "2026-01-01", null],
    [YEAR_START_DEF, "2027-01-01", null],
  ] as const)("%# %s", (def, effectiveFrom, reason) => {
    const result = validateEffectiveFrom(def, effectiveFrom, "2026-09-24");
    expect(result?.reason ?? null).toBe(reason);
  });
});

describe("addHistorizedValue — 적용 시작일 규칙", () => {
  it.each(["2027-03-01", "garbage-01-01", "2027-1-1", "0000-01-01"])("year_start 키의 %s는 1월 1일 문구로 거부되고 저장이 불리지 않는다", async (date) => {
    const deps = writeDeps();
    await expect(addHistorizedValue(viewer, YEAR_START_DEF, { effectiveFrom: date, value: 16 }, deps)).rejects.toThrow(FORMAT_MESSAGE);
    expect(deps.insertHistorizedValue).not.toHaveBeenCalled();
  });

  it("지난 연도(서울 2026년에 2025-01-01)는 거부되고 저장이 불리지 않는다", async () => {
    const deps = writeDeps();
    await expect(addHistorizedValue(viewer, YEAR_START_DEF, { effectiveFrom: "2025-01-01", value: 16 }, deps)).rejects.toThrow(
      PAST_YEAR_MESSAGE,
    );
    expect(deps.insertHistorizedValue).not.toHaveBeenCalled();
  });

  it.each(["2026-01-01", "2027-01-01"])("올해 이후 1월 1일 %s는 저장된다", async (date) => {
    const deps = writeDeps();
    await addHistorizedValue(viewer, YEAR_START_DEF, { effectiveFrom: date, value: 16 }, deps);
    expect(deps.insertHistorizedValue).toHaveBeenCalledTimes(1);
  });

  it("서울 연도 경계 — 2026-12-31T15:00Z(서울 2027-01-01)면 2026-01-01 거부, 14:59:59Z면 통과", async () => {
    const newYear = writeDeps(new Date("2026-12-31T15:00:00Z"));
    await expect(addHistorizedValue(viewer, YEAR_START_DEF, { effectiveFrom: "2026-01-01", value: 16 }, newYear)).rejects.toThrow(
      PAST_YEAR_MESSAGE,
    );
    expect(newYear.insertHistorizedValue).not.toHaveBeenCalled();

    const lastSecond = writeDeps(new Date("2026-12-31T14:59:59Z"));
    await addHistorizedValue(viewer, YEAR_START_DEF, { effectiveFrom: "2026-01-01", value: 16 }, lastSecond);
    expect(lastSecond.insertHistorizedValue).toHaveBeenCalledTimes(1);
  });

  it("규칙 없는 이력형 키는 어떤 날짜든 기존대로 저장된다", async () => {
    const deps = writeDeps();
    await addHistorizedValue(viewer, PLAIN_DEF, { effectiveFrom: "2020-03-01", value: 0.2 }, deps);
    expect(deps.insertHistorizedValue).toHaveBeenCalledTimes(1);
  });
});

describe("cancelHistorizedValue — 같은 검증 · 정규형 · 서울 기준 오늘(B-NEW01)", () => {
  it.each(["January 1, 2025", "2999-1-1", "2999-02-30"])("규칙 없는 키의 비정규 날짜 %s는 거부되고 삭제 · 로그가 불리지 않는다", async (date) => {
    const deps = writeDeps();
    await expect(cancelHistorizedValue(viewer, PLAIN_DEF, date, deps)).rejects.toThrow(CANONICAL_MESSAGE);
    expect(deps.deleteFutureHistorizedValue).not.toHaveBeenCalled();
    expect(deps.recordAction).not.toHaveBeenCalled();
  });

  it("규칙 없는 키의 2999-01-01은 기존대로 삭제된다", async () => {
    const deps = writeDeps();
    await cancelHistorizedValue(viewer, PLAIN_DEF, "2999-01-01", deps);
    expect(deps.deleteFutureHistorizedValue).toHaveBeenCalledWith(viewer, PLAIN_DEF.key, "2999-01-01");
  });

  it("year_start 키의 2027-03-01 · 2025-01-01은 각각 1월 1일 · 지난 연도 문구로 거부되고 삭제가 불리지 않는다", async () => {
    const deps = writeDeps();
    await expect(cancelHistorizedValue(viewer, YEAR_START_DEF, "2027-03-01", deps)).rejects.toThrow(FORMAT_MESSAGE);
    await expect(cancelHistorizedValue(viewer, YEAR_START_DEF, "2025-01-01", deps)).rejects.toThrow(PAST_YEAR_MESSAGE);
    expect(deps.deleteFutureHistorizedValue).not.toHaveBeenCalled();
  });

  it("서울 연초 경계 — 서울 2027-01-01 00:00에 2027-01-01 취소는 이미 적용됨, 서울 2026-12-31이면 삭제된다", async () => {
    const newYear = writeDeps(new Date("2026-12-31T15:00:00Z"));
    await expect(cancelHistorizedValue(viewer, YEAR_START_DEF, "2027-01-01", newYear)).rejects.toBeInstanceOf(FutureCancelOnlyError);
    expect(newYear.deleteFutureHistorizedValue).not.toHaveBeenCalled();

    const lastSecond = writeDeps(new Date("2026-12-31T14:59:59Z"));
    await cancelHistorizedValue(viewer, YEAR_START_DEF, "2027-01-01", lastSecond);
    expect(lastSecond.deleteFutureHistorizedValue).toHaveBeenCalledTimes(1);
  });
});
