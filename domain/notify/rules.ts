// D-717 규칙 병합 — 종류 코드 기본값 ⊕ notification_rules 행(NULL 칸 = 기본값). 범위 밖 일수는 버리고 기본값을 쓴다.
import type { ConditionKind } from "@/domain/notify/condition-kinds";
import { NOTIFY_EVENT_LOOKBACK_DAYS } from "@/domain/notify/limits";

export type NotificationRuleRow = {
  kind: string;
  enabled: boolean | null;
  days: number | null;
  extraRoleIds: string[];
  emailEnabled: boolean | null;
  enabledAt: Date | null;
};

export type EffectiveRule = {
  enabled: boolean;
  days: number | undefined;
  extraRoleIds: string[];
  emailEnabled: boolean;
  enabledAt: Date | null;
};

type RuleKind = Pick<ConditionKind, "kind" | "defaults" | "daysRange">;

export function effectiveRule(kind: Pick<ConditionKind, "defaults" | "daysRange">, row: NotificationRuleRow | null): EffectiveRule {
  const range = kind.daysRange;
  const rowDays = row?.days ?? null;
  const days = range && rowDays !== null && rowDays >= range.min && rowDays <= range.max ? rowDays : kind.defaults.days;
  return {
    enabled: row?.enabled ?? kind.defaults.enabled,
    days: range ? days : undefined,
    extraRoleIds: row?.extraRoleIds ?? [],
    emailEnabled: row?.emailEnabled ?? kind.defaults.emailEnabled,
    enabledAt: row?.enabledAt ?? null,
  };
}

// 등록부에 없는 종류의 행은 무시한다(코드에서 종류를 뺀 뒤 남은 행).
export function effectiveRules(kinds: readonly RuleKind[], rows: readonly NotificationRuleRow[]): Map<string, EffectiveRule> {
  const byKind = new Map(rows.map((row) => [row.kind, row]));
  return new Map(kinds.map((kind) => [kind.kind, effectiveRule(kind, byKind.get(kind.kind) ?? null)]));
}

// D-716 사건 창 하한 = max(오늘 KST 00:00 - 14일, 규칙 enabled_at). 지난 tick 시각을 쓰지 않는다(C-P1-1).
export function eventWindowSince(today: string, rule: { enabledAt: Date | null } | null): Date {
  const floor = new Date(`${today}T00:00:00+09:00`);
  floor.setUTCDate(floor.getUTCDate() - NOTIFY_EVENT_LOOKBACK_DAYS);
  const enabledAt = rule?.enabledAt ?? null;
  return enabledAt && enabledAt.getTime() > floor.getTime() ? enabledAt : floor;
}
