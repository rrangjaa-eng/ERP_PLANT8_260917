import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_LOCKOUT_THRESHOLD,
  AUTH_LOCKOUT_WINDOW_MINUTES,
  PAYMENT_CUTOFF_TIME,
  PAYMENT_TERM_DAYS,
  PAYMENT_WEEKDAY,
  PROJECT_COLLECTION_DUE_DAYS,
  PROJECT_COST_RATE_PCT,
  SETTING_DEFS,
} from "@/domain/settings/keys";
import { describeSettingField, getSettingValue } from "@/domain/settings/registry";
import { lockoutConfig } from "@/domain/auth/lockout";
import { koreanZodErrorMessage } from "@/lib/actions/zod-error-message";
import { log } from "@/lib/log";

function rejectionOf(schema: { safeParse: (value: unknown) => { success: boolean; error?: unknown } }, value: unknown): string {
  const result = schema.safeParse(value) as { success: boolean; error?: Parameters<typeof koreanZodErrorMessage>[0] };
  if (result.success || !result.error) throw new Error(`test setup 오류: ${String(value)}가 통과했다`);
  return koreanZodErrorMessage(result.error);
}

// 07-08 D-723 · U4 · C-P1-2 — 로그인 잠금 설정 범위(횟수 3~10, 시간 1~60분)와 범위 밖 옛 저장값 읽기.
describe("로그인 잠금 설정 범위 (D-723)", () => {
  it("잠금 횟수는 3~10만 받는다", () => {
    for (const value of [3, 10, "5"]) expect(AUTH_LOCKOUT_THRESHOLD.schema.safeParse(value).success).toBe(true);
    for (const value of [2, 11, 0, 1000, 5.5, ""]) expect(AUTH_LOCKOUT_THRESHOLD.schema.safeParse(value).success).toBe(false);
  });

  it("잠금 시간은 1~60분만 받는다", () => {
    for (const value of [1, 60, "15"]) expect(AUTH_LOCKOUT_WINDOW_MINUTES.schema.safeParse(value).success).toBe(true);
    for (const value of [0, 61, 1000, 2.5, ""]) expect(AUTH_LOCKOUT_WINDOW_MINUTES.schema.safeParse(value).success).toBe(false);
  });

  it("범위 오류는 「범위 a~b · 다시 입력」 한 줄이다", () => {
    expect(rejectionOf(AUTH_LOCKOUT_THRESHOLD.schema, 11)).toBe("범위 3~10 · 다시 입력");
    expect(rejectionOf(AUTH_LOCKOUT_THRESHOLD.schema, 2)).toBe("범위 3~10 · 다시 입력");
    expect(rejectionOf(AUTH_LOCKOUT_WINDOW_MINUTES.schema, 61)).toBe("범위 1~60 · 다시 입력");
    expect(rejectionOf(AUTH_LOCKOUT_WINDOW_MINUTES.schema, 0)).toBe("범위 1~60 · 다시 입력");
  });

  it("라벨 · 힌트는 SC-04대로 이름과 범위만이다", () => {
    expect(AUTH_LOCKOUT_THRESHOLD.label).toBe("잠금 횟수");
    expect(AUTH_LOCKOUT_THRESHOLD.hint).toBe("3~10");
    expect(AUTH_LOCKOUT_WINDOW_MINUTES.label).toBe("잠금 시간");
    expect(AUTH_LOCKOUT_WINDOW_MINUTES.hint).toBe("1~60분");
  });

  it("기본값은 각 스키마를 통과한다(시험 환경 env 기본값이 범위 안)", () => {
    expect(AUTH_LOCKOUT_THRESHOLD.schema.safeParse(AUTH_LOCKOUT_THRESHOLD.default).success).toBe(true);
    expect(AUTH_LOCKOUT_WINDOW_MINUTES.schema.safeParse(AUTH_LOCKOUT_WINDOW_MINUTES.default).success).toBe(true);
  });
});

describe("범위 밖 옛 저장값 읽기 (C-P1-2 · T-07-08-04)", () => {
  afterEach(() => vi.restoreAllMocks());

  const stored = (key: string, value: unknown) => ({ key, value, updatedAt: new Date(), updatedBy: null });

  it("횟수 저장값 2 · 20은 예외 없이 기본값이고 log.error에 키와 오류 코드만 한 번 남는다", async () => {
    for (const raw of [2, 20]) {
      const spy = vi.spyOn(log, "error").mockImplementation(() => {});
      const findSimpleValue = vi.fn().mockResolvedValue(stored(AUTH_LOCKOUT_THRESHOLD.key, raw));

      const value = await getSettingValue(AUTH_LOCKOUT_THRESHOLD, undefined, { findSimpleValue });

      expect(value).toBe(AUTH_LOCKOUT_THRESHOLD.default);
      expect(spy).toHaveBeenCalledTimes(1);
      const [event, fields] = spy.mock.calls[0]!;
      expect(event).toBe("settings.invalid_stored_value");
      expect(fields).toEqual({ key: AUTH_LOCKOUT_THRESHOLD.key, issues: ["custom"] });
      spy.mockRestore();
    }
  });

  it("시간 저장값 0 · 61은 기본값이다", async () => {
    vi.spyOn(log, "error").mockImplementation(() => {});
    for (const raw of [0, 61]) {
      const findSimpleValue = vi.fn().mockResolvedValue(stored(AUTH_LOCKOUT_WINDOW_MINUTES.key, raw));
      expect(await getSettingValue(AUTH_LOCKOUT_WINDOW_MINUTES, undefined, { findSimpleValue })).toBe(AUTH_LOCKOUT_WINDOW_MINUTES.default);
    }
  });

  it("범위 안 저장값(7 · 30)은 그대로 읽고 log.error가 없다", async () => {
    const spy = vi.spyOn(log, "error").mockImplementation(() => {});
    const threshold = vi.fn().mockResolvedValue(stored(AUTH_LOCKOUT_THRESHOLD.key, 7));
    const windowMinutes = vi.fn().mockResolvedValue(stored(AUTH_LOCKOUT_WINDOW_MINUTES.key, 30));
    expect(await getSettingValue(AUTH_LOCKOUT_THRESHOLD, undefined, { findSimpleValue: threshold })).toBe(7);
    expect(await getSettingValue(AUTH_LOCKOUT_WINDOW_MINUTES, undefined, { findSimpleValue: windowMinutes })).toBe(30);
    expect(spy).not.toHaveBeenCalled();
  });

  it("lockoutConfig는 범위 밖 저장값에서 던지지 않고 기본값을 돌려준다(로그인 판정이 깨지지 않는다)", async () => {
    vi.spyOn(log, "error").mockImplementation(() => {});
    const findSimpleValue = vi.fn((_viewer: unknown, key: string) =>
      Promise.resolve(key === AUTH_LOCKOUT_THRESHOLD.key ? stored(key, 2) : stored(key, 0)),
    );
    const config = await lockoutConfig({
      getSettingValue: ((def: Parameters<typeof getSettingValue>[0]) =>
        getSettingValue(def, undefined, { findSimpleValue })) as typeof getSettingValue,
    });
    expect(config).toEqual({ threshold: AUTH_LOCKOUT_THRESHOLD.default, windowMinutes: AUTH_LOCKOUT_WINDOW_MINUTES.default });
  });
});

// 07-08 D-734 · D-735 — 원가율(비움 ≠ 0)과 수금 기한 일수 키, null 허용 숫자 칸 서술.
describe("원가율 키 (D-734 · C-P2-10)", () => {
  it("기본값은 null(비움)이고 프로젝트 섹션 · % · 힌트 0~100이다", () => {
    expect(PROJECT_COST_RATE_PCT.key).toBe("project.cost_rate_pct");
    expect(PROJECT_COST_RATE_PCT.default).toBeNull();
    expect(PROJECT_COST_RATE_PCT.namespace).toBe("프로젝트");
    expect(PROJECT_COST_RATE_PCT.label).toBe("원가율");
    expect(PROJECT_COST_RATE_PCT.unitLabel).toBe("%");
    expect(PROJECT_COST_RATE_PCT.hint).toBe("0~100");
  });

  it("빈 문자열 · null은 null로 저장되고 0은 0으로 저장된다(비움과 0은 다르다)", () => {
    expect(PROJECT_COST_RATE_PCT.schema.parse("")).toBeNull();
    expect(PROJECT_COST_RATE_PCT.schema.parse(null)).toBeNull();
    expect(PROJECT_COST_RATE_PCT.schema.parse(0)).toBe(0);
    expect(PROJECT_COST_RATE_PCT.schema.parse("0")).toBe(0);
  });

  it("0~100을 0.1 단위로 받는다(12.5 · 12.3 · 100 통과)", () => {
    for (const value of [12.5, 12.3, "12.3", 100, 0.1, 99.9]) {
      expect(PROJECT_COST_RATE_PCT.schema.safeParse(value).success, String(value)).toBe(true);
    }
  });

  it("-1 · 100.1 · 12.55는 「범위 0~100 · 다시 입력」으로 거부한다", () => {
    for (const value of [-1, 100.1, 12.55, 0.05]) {
      expect(rejectionOf(PROJECT_COST_RATE_PCT.schema, value), String(value)).toBe("범위 0~100 · 다시 입력");
    }
  });

  it("설정 화면은 null 허용 숫자 키를 숫자 칸으로 서술한다 — 기존 키 서술은 그대로", () => {
    expect(describeSettingField(PROJECT_COST_RATE_PCT)).toEqual({ kind: "number", numberKind: undefined });
    expect(describeSettingField(AUTH_LOCKOUT_THRESHOLD)).toEqual({ kind: "number", numberKind: undefined });
    expect(describeSettingField(PAYMENT_CUTOFF_TIME)).toEqual({ kind: "string" });
    expect(describeSettingField(PAYMENT_WEEKDAY)).toEqual({ kind: "enum", options: ["mon", "tue", "wed", "thu", "fri"] });
  });

  it("두 키가 설정 목록에 들어 있다", () => {
    expect(SETTING_DEFS).toContain(PROJECT_COST_RATE_PCT);
    expect(SETTING_DEFS).toContain(PROJECT_COLLECTION_DUE_DAYS);
  });
});

describe("수금 기한 일수 키 (D-735)", () => {
  it("기본 60 · 1~365 · 단위 일 · 프로젝트 섹션이다", () => {
    expect(PROJECT_COLLECTION_DUE_DAYS.key).toBe("project.collection_due_days");
    expect(PROJECT_COLLECTION_DUE_DAYS.default).toBe(60);
    expect(PROJECT_COLLECTION_DUE_DAYS.namespace).toBe("프로젝트");
    expect(PROJECT_COLLECTION_DUE_DAYS.label).toBe("수금 기한 일수");
    expect(PROJECT_COLLECTION_DUE_DAYS.unitLabel).toBe("일");
    expect(PROJECT_COLLECTION_DUE_DAYS.hint).toBe("1~365");
    for (const value of [1, 365, "60"]) expect(PROJECT_COLLECTION_DUE_DAYS.schema.safeParse(value).success).toBe(true);
    for (const value of [0, 366, 1.5, ""]) expect(PROJECT_COLLECTION_DUE_DAYS.schema.safeParse(value).success).toBe(false);
  });
});

describe("기한 일수 범위 오류 문구 (감사 C2)", () => {
  it("수금 기한 일수 · 지급 기한 일수 범위 밖은 잠금 · 원가율과 같은 「범위 a~b · 다시 입력」 꼴이다", () => {
    for (const value of [0, 366, -1]) {
      expect(rejectionOf(PROJECT_COLLECTION_DUE_DAYS.schema, value), String(value)).toBe("범위 1~365 · 다시 입력");
      expect(rejectionOf(PAYMENT_TERM_DAYS.schema, value), String(value)).toBe("범위 1~365 · 다시 입력");
    }
  });
});

describe("지급 섹션 첫 칸 (SC-04 · J2)", () => {
  it("지급 기한 일수가 지급 섹션의 첫 키이고 지급 요일 · 결재 마감 시각이 같은 섹션에 있다", () => {
    const payment = SETTING_DEFS.filter((def) => def.namespace === "지급");
    expect(payment[0]).toBe(PAYMENT_TERM_DAYS);
    expect(payment).toContain(PAYMENT_WEEKDAY);
    expect(payment).toContain(PAYMENT_CUTOFF_TIME);
    expect(PAYMENT_TERM_DAYS.label).toBe("지급 기한 일수");
    expect(PAYMENT_WEEKDAY.label).toBe("지급 요일");
    expect(PAYMENT_CUTOFF_TIME.label).toBe("결재 마감 시각");
  });
});
