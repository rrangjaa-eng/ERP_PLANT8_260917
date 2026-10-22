import { describe, expect, it } from "vitest";
import type { HolidayLookup } from "@/domain/holidays/business-day";
import {
  payOffWeekdayText,
  payRuleLine,
  payWeekdayChar,
  payWeekGroupLabel,
  resolvePaySchedule,
  resolvePayScheduleSafe,
  thisWeekPayDate,
  type PayScheduleConfig,
  type PayScheduleInput,
} from "@/domain/payments/pay-schedule";

// 07-01 Task 2(D-701 · D-703 · D-704 첫 절 · D-741 · D-749 · D-742 · D-731 · R15): 결재 마감 = 지급일 전 영업일 14:00 KST, 승인 시각이 마감을
// 1분이라도 넘기면 다음 지급 가능 금요일 · cutoff. 기준 2026-05-11(월) + 60 = 2026-07-10(금).
const CFG: PayScheduleConfig = { termDays: 60, payWeekday: "fri", cutoffHHmm: "14:00" };
const kst = (at: string) => new Date(`${at}:00+09:00`);

function holidays(dates: readonly string[] = []): HolidayLookup {
  return (year) => new Set(dates.filter((date) => date.startsWith(`${year}-`)));
}

class EveryDay extends Set<string> {
  override has(): boolean {
    return true;
  }
}

function input(over: Partial<PayScheduleInput> & { approvedAt: Date | null }): PayScheduleInput {
  return { baseDate: "2026-05-11", termDays: 60, manualDate: null, now: kst("2026-07-01T09:00"), lookup: holidays(), cfg: CFG, ...over };
}

const cutoffKst = (date: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" }).format(date);

describe("결재 마감 시각 (D-701)", () => {
  it("지급일 금 → 마감 목 14:00 KST", () => {
    expect(cutoffKst(resolvePaySchedule(input({ approvedAt: kst("2026-07-01T09:00") })).cutoffAt)).toBe("2026-07-09 14:00");
  });

  it("금 공휴일 → 지급일 목 · 마감 수 14:00", () => {
    const schedule = resolvePaySchedule(input({ approvedAt: kst("2026-07-01T09:00"), lookup: holidays(["2026-07-10"]) }));
    expect(schedule.payDate).toBe("2026-07-09");
    expect(cutoffKst(schedule.cutoffAt)).toBe("2026-07-08 14:00");
  });

  it("월요일 휴일 직후 주는 그대로(지급일 금 · 마감 목)", () => {
    const schedule = resolvePaySchedule(input({ approvedAt: kst("2026-07-01T09:00"), lookup: holidays(["2026-07-06"]) }));
    expect(schedule.payDate).toBe("2026-07-10");
    expect(cutoffKst(schedule.cutoffAt)).toBe("2026-07-09 14:00");
  });

  it("마감 전날(목)이 휴일이면 그 앞 영업일(수)", () => {
    expect(cutoffKst(resolvePaySchedule(input({ approvedAt: kst("2026-07-01T09:00"), lookup: holidays(["2026-07-09"]) })).cutoffAt)).toBe("2026-07-08 14:00");
  });

  it("alertDate = 마감 날짜의 전 영업일(지급일 2영업일 전)", () => {
    expect(resolvePaySchedule(input({ approvedAt: kst("2026-07-01T09:00") })).alertDate).toBe("2026-07-08");
  });

  it("마감 시각은 설정을 읽는다", () => {
    expect(cutoffKst(resolvePaySchedule(input({ approvedAt: kst("2026-07-01T09:00"), cfg: { ...CFG, cutoffHHmm: "09:30" } })).cutoffAt)).toBe("2026-07-09 09:30");
  });
});

describe("마감 넘김 밀림 (D-703 · D-704 첫 절)", () => {
  it("승인 시각 = 마감 정각이면 그 날(≤)", () => {
    expect(resolvePaySchedule(input({ approvedAt: kst("2026-07-09T14:00") }))).toMatchObject({ payDate: "2026-07-10", pushReason: null });
  });

  it("마감 + 1분이면 다음 지급 가능 금요일 · cutoff", () => {
    const schedule = resolvePaySchedule(input({ approvedAt: kst("2026-07-09T14:01") }));
    expect(schedule).toMatchObject({ payDate: "2026-07-17", autoPayDate: "2026-07-17", pushReason: "cutoff" });
    expect(cutoffKst(schedule.cutoffAt)).toBe("2026-07-16 14:00");
  });

  it("다음 주 금요일이 공휴일이면 그 주 목요일과 그 마감으로 판정", () => {
    const schedule = resolvePaySchedule(input({ approvedAt: kst("2026-07-09T14:01"), lookup: holidays(["2026-07-17"]) }));
    expect(schedule).toMatchObject({ payDate: "2026-07-16", pushReason: "cutoff" });
    expect(cutoffKst(schedule.cutoffAt)).toBe("2026-07-15 14:00");
  });

  it("다음 주 월~금 전부 공휴일이면 그 주를 건너뜀(앞 후보와 같거나 이른 날짜는 고르지 않음)", () => {
    const week = ["2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17"];
    expect(resolvePaySchedule(input({ approvedAt: kst("2026-07-09T14:01"), lookup: holidays(week) })).payDate).toBe("2026-07-24");
  });

  it("승인 전(approvedAt null)이면 지금 기준으로 「지금 승인되면 들어갈 날」", () => {
    expect(resolvePaySchedule(input({ approvedAt: null, now: kst("2026-07-09T15:00") }))).toMatchObject({ payDate: "2026-07-17", pushReason: "cutoff" });
    expect(resolvePaySchedule(input({ approvedAt: null, now: kst("2026-07-09T13:00") }))).toMatchObject({ payDate: "2026-07-10", pushReason: null });
  });

  it("기준일이 오래돼도(2024 증빙 · 2026 승인) 다음 지급 가능 금요일을 찾는다 — 상한 가드에 걸리지 않음", () => {
    expect(resolvePaySchedule(input({ baseDate: "2024-12-30", approvedAt: kst("2026-10-21T10:00") }))).toMatchObject({ payDate: "2026-10-23", pushReason: "cutoff" });
  });
});

describe("D-741 · D-749 + 마감", () => {
  it("기한 6일 · 기준 07-03(금) · 승인 07-06 10:00 → 07-09(목) · 마감 07-08 14:00 · no-slot", () => {
    const schedule = resolvePaySchedule(input({ baseDate: "2026-07-03", termDays: 6, approvedAt: kst("2026-07-06T10:00") }));
    expect(schedule).toMatchObject({ payDate: "2026-07-09", pushReason: "no-slot" });
    expect(cutoffKst(schedule.cutoffAt)).toBe("2026-07-08 14:00");
  });

  it("같은 건 승인 07-08 14:01 → 다음 지급 가능 금요일 07-10 · cutoff(기한을 넘겨도 밀고 no-slot 표지는 남기지 않음)", () => {
    expect(resolvePaySchedule(input({ baseDate: "2026-07-03", termDays: 6, approvedAt: kst("2026-07-08T14:01") }))).toMatchObject({ payDate: "2026-07-10", pushReason: "cutoff" });
  });

  it("D-749: 기준 07-03 · 기한 2 → 지급일 07-03 · 마감 07-02 14:00, 정각 승인이면 07-03 · no-slot", () => {
    const schedule = resolvePaySchedule(input({ baseDate: "2026-07-03", termDays: 2, approvedAt: kst("2026-07-02T14:00") }));
    expect(schedule).toMatchObject({ payDate: "2026-07-03", pushReason: "no-slot" });
    expect(cutoffKst(schedule.cutoffAt)).toBe("2026-07-02 14:00");
  });

  it("D-749: 기준 07-03 · 기한 2 · 승인 07-03 09:00(그날 마감 뒤) → 2026-07-10 · 마감 07-09 14:00 · cutoff", () => {
    const schedule = resolvePaySchedule(input({ baseDate: "2026-07-03", termDays: 2, approvedAt: kst("2026-07-03T09:00") }));
    expect(schedule).toMatchObject({ payDate: "2026-07-10", pushReason: "cutoff" });
    expect(cutoffKst(schedule.cutoffAt)).toBe("2026-07-09 14:00");
  });
});

describe("수동 지정 (D-742)", () => {
  it("수동 값은 밀지 않음 · pushReason null · cutoffAt은 표시용(승인이 마감 한참 뒤여도)", () => {
    const schedule = resolvePaySchedule(input({ manualDate: "2026-07-10", approvedAt: kst("2026-07-20T10:00") }));
    expect(schedule).toMatchObject({ payDate: "2026-07-10", manual: true, pushReason: null });
    expect(cutoffKst(schedule.cutoffAt)).toBe("2026-07-09 14:00");
  });
});

describe("규칙 줄 payRuleLine (D-731)", () => {
  it("자동 → `결재 마감 MM-DD HH:MM · 기한 N일 안 마지막 금요일`", () => {
    expect(payRuleLine(resolvePaySchedule(input({ approvedAt: kst("2026-07-01T09:00") })), 60, CFG)).toBe("결재 마감 07-09 14:00 · 기한 60일 안 마지막 금요일");
  });

  it("no-slot → `… · 기한 6일 안 마지막 영업일`", () => {
    const schedule = resolvePaySchedule(input({ baseDate: "2026-07-03", termDays: 6, approvedAt: kst("2026-07-06T10:00") }));
    expect(payRuleLine(schedule, 6, CFG)).toBe("결재 마감 07-08 14:00 · 기한 6일 안 마지막 영업일");
  });

  it("cutoff → 민 날의 마감만", () => {
    expect(payRuleLine(resolvePaySchedule(input({ approvedAt: kst("2026-07-09T14:01") })), 60, CFG)).toBe("결재 마감 07-16 14:00");
  });

  it("수동 → `결재 마감 면제`", () => {
    expect(payRuleLine(resolvePaySchedule(input({ manualDate: "2026-07-10", approvedAt: null })), 60, CFG)).toBe("결재 마감 면제");
  });
});

describe("지급 주 머리글 payWeekGroupLabel", () => {
  const today = "2026-07-06";

  it("실제 지급일 요일 글자 — 같은 주 화(no-slot) · 금 건은 머리글 둘", () => {
    const tuesday = resolvePaySchedule(input({ baseDate: "2026-07-03", termDays: 4, approvedAt: kst("2026-07-06T10:00") }));
    const friday = resolvePaySchedule(input({ approvedAt: kst("2026-07-06T10:00") }));
    expect(payWeekGroupLabel(tuesday, today)).toEqual({ label: "이번 주 화 07-07 · 마감 07-06 14:00" });
    expect(payWeekGroupLabel(friday, today)).toEqual({ label: "이번 주 금 07-10 · 마감 07-09 14:00" });
  });

  it("다음 주 · 그 뒤 · 지난 날짜", () => {
    expect(payWeekGroupLabel(resolvePaySchedule(input({ approvedAt: kst("2026-07-09T14:01") })), today)).toEqual({ label: "다음 주 금 07-17 · 마감 07-16 14:00" });
    expect(payWeekGroupLabel(resolvePaySchedule(input({ manualDate: "2026-07-24", approvedAt: null })), today)).toEqual({ label: "그 뒤" });
    expect(payWeekGroupLabel(resolvePaySchedule(input({ manualDate: "2026-07-03", approvedAt: null })), today)).toEqual({ label: "예정일 지남", tone: "warning" });
  });
});

describe("thisWeekPayDate · 요일 글자", () => {
  it("오늘이 든 주(월~일)의 지급 요일을 영업일로", () => {
    expect(thisWeekPayDate("2026-07-08", CFG, holidays())).toBe("2026-07-10");
    expect(thisWeekPayDate("2026-07-08", CFG, holidays(["2026-07-10"]))).toBe("2026-07-09");
    expect(thisWeekPayDate("2026-07-11", CFG, holidays())).toBe("2026-07-10");
  });

  it("payWeekdayChar · payOffWeekdayText (D-715 · K7)", () => {
    expect(payWeekdayChar("2026-10-22")).toBe("목");
    expect(payWeekdayChar("2026-10-25")).toBe("일");
    expect(payOffWeekdayText("2026-10-22", CFG)).toBe("금요일 아님");
    expect(payOffWeekdayText("2026-10-23", CFG)).toBeNull();
    expect(payOffWeekdayText("2026-10-23", { ...CFG, payWeekday: "wed" })).toBe("수요일 아님");
  });
});

describe("행 단위 격리 resolvePayScheduleSafe (R15)", () => {
  const broken: HolidayLookup = () => new EveryDay();

  it("모든 날이 공휴일이면 resolvePaySchedule은 상한 가드 오류를 던진다", () => {
    expect(() => resolvePaySchedule(input({ approvedAt: null, lookup: broken }))).toThrow();
  });

  it("Safe는 던지지 않고 failed · payDate = limit(수동이면 수동) · 다른 행은 정상", () => {
    const rows = [input({ approvedAt: null, lookup: broken }), input({ approvedAt: null, lookup: broken, manualDate: "2026-07-17" }), input({ approvedAt: kst("2026-07-01T09:00") })];
    const [failed, failedManual, ok] = rows.map((row) => resolvePayScheduleSafe(row));
    expect(failed).toMatchObject({ failed: true, payDate: "2026-07-10", pushReason: null });
    expect(failedManual).toMatchObject({ failed: true, payDate: "2026-07-17", manual: true });
    expect(ok).toMatchObject({ payDate: "2026-07-10", pushReason: null });
    expect(ok?.failed).toBeUndefined();
    if (!failed) throw new Error("행 없음");
    expect(payWeekGroupLabel(failed, "2026-07-06")).toEqual({ label: "예정일 계산 실패", tone: "warning" });
    expect(payRuleLine(failed, 60, CFG)).toBe("예정일 계산 실패");
  });
});
