import { describe, expect, it } from "vitest";
import { effectiveRule, effectiveRules, eventWindowSince, type NotificationRuleRow } from "@/domain/notify/rules";
import type { ConditionKind } from "@/domain/notify/condition-kinds";

const kind: Pick<ConditionKind, "kind" | "defaults" | "daysRange"> = {
  kind: "sample",
  defaults: { enabled: true, days: 7, emailEnabled: true },
  daysRange: { min: 1, max: 30 },
};

const noDaysKind: Pick<ConditionKind, "kind" | "defaults" | "daysRange"> = {
  kind: "no-days",
  defaults: { enabled: true, emailEnabled: true },
};

function row(patch: Partial<NotificationRuleRow>): NotificationRuleRow {
  return { kind: "sample", enabled: null, days: null, extraRoleIds: [], emailEnabled: null, enabledAt: null, ...patch };
}

describe("effectiveRule", () => {
  it("행이 없으면 종류 기본값", () => {
    expect(effectiveRule(kind, null)).toEqual({ enabled: true, days: 7, extraRoleIds: [], emailEnabled: true, enabledAt: null });
  });

  it("enabled false 행은 끔", () => {
    expect(effectiveRule(kind, row({ enabled: false })).enabled).toBe(false);
  });

  it("범위 안 일수는 그대로, 범위 밖은 기본값", () => {
    expect(effectiveRule(kind, row({ days: 5 })).days).toBe(5);
    expect(effectiveRule(kind, row({ days: 99 })).days).toBe(7);
    expect(effectiveRule(kind, row({ days: 0 })).days).toBe(7);
  });

  it("일수 범위가 없는 종류는 일수를 쓰지 않는다", () => {
    expect(effectiveRule(noDaysKind, row({ kind: "no-days", days: 5 })).days).toBeUndefined();
  });

  it("받는 계급은 그대로, null 칸은 기본값", () => {
    const rule = effectiveRule(kind, row({ extraRoleIds: ["role-a"], emailEnabled: null }));
    expect(rule.extraRoleIds).toEqual(["role-a"]);
    expect(rule.emailEnabled).toBe(true);
    expect(effectiveRule(kind, row({ emailEnabled: false })).emailEnabled).toBe(false);
  });
});

describe("effectiveRules", () => {
  it("종류마다 해당 행을 붙이고 등록부에 없는 행은 무시한다", () => {
    const rules = effectiveRules([kind, noDaysKind], [row({ days: 3 }), row({ kind: "ghost", enabled: false })]);
    expect([...rules.keys()]).toEqual(["sample", "no-days"]);
    expect(rules.get("sample")?.days).toBe(3);
    expect(rules.get("no-days")?.enabled).toBe(true);
  });
});

describe("eventWindowSince", () => {
  it("규칙이 없으면 오늘 KST 00:00 - 14일", () => {
    expect(eventWindowSince("2026-11-16", null).toISOString()).toBe("2026-11-01T15:00:00.000Z");
  });

  it("enabled_at이 더 늦으면 enabled_at", () => {
    const enabledAt = new Date("2026-11-13T23:00:00Z");
    expect(eventWindowSince("2026-11-16", { enabledAt }).toISOString()).toBe(enabledAt.toISOString());
  });

  it("enabled_at이 더 이르면 14일 하한", () => {
    expect(eventWindowSince("2026-11-16", { enabledAt: new Date("2026-01-01T00:00:00Z") }).toISOString()).toBe("2026-11-01T15:00:00.000Z");
  });
});
