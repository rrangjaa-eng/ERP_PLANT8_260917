// 07-19 알림 규칙 화면 도메인(NOTI-03 · D-717 · D-719 · D-744) — 규칙 표 목록 · 켬/끔 저장. 판정은 07-10 병합(rules.ts)과 같은 `effectiveRule`을 쓴다.
// 화면에 종류 이름 · 순서를 두지 않는다(N1) — 등록부(`CONDITION_KINDS`) 순서 그대로. 지급 완료 · 취소는 결재 결과 종류 하나가 맡는다(D-744).
import { buildChanges } from "@/domain/action-log/changes";
import { recordAction } from "@/domain/action-log/record";
import { CONDITION_KINDS, type ConditionKind } from "@/domain/notify/condition-kinds";
import { effectiveRule, type EffectiveRule, type NotificationRuleRow } from "@/domain/notify/rules";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import type { Viewer } from "@/domain/viewer";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { withTransaction } from "@/lib/db-transaction";
import { listNotificationRuleRecords, lockNotificationRule, upsertNotificationRule, type NotificationRuleRecord } from "@/repositories/notification-rules";
import { listRoles } from "@/repositories/roles";

export const NOTIFICATION_RULES_MENU = "admin.notification-rules";
export const NOTIFICATION_RULE_INFO_ITEM = "notification_rule.value";

export class RuleConflictError extends UserFacingError {}
export class RuleInvalidError extends UserFacingError {}

export type RuleRoleView = { id: string; name: string };

export type RuleRowView = {
  kind: string;
  label: string;
  dateUnit: ConditionKind["dateUnit"];
  enabled: boolean;
  // 일수 칸이 없는 종류(사건 알림)는 null.
  days: number | null;
  daysRange: { min: number; max: number } | null;
  defaultRecipientLabel: string;
  extraRoleIds: string[];
  extraRoleNames: string[];
  emailEnabled: boolean;
  // 행이 아직 없으면 0 — 첫 저장이 삽입이다.
  version: number;
};

async function assertCanView(viewer: Viewer): Promise<void> {
  if (!(await can(viewer, NOTIFICATION_RULES_MENU, "view")) || !(await visible(viewer, NOTIFICATION_RULE_INFO_ITEM))) {
    throw new ForbiddenError("알림 규칙을 볼 수 없음");
  }
}

async function assertCanWrite(viewer: Viewer): Promise<void> {
  if (!(await can(viewer, NOTIFICATION_RULES_MENU, "write"))) throw new ForbiddenError("알림 규칙을 고칠 수 없음");
}

// 규칙 표 한 줄에 쓰는 계급 이름 표 — 활성 계급만(보관 계급은 받는 사람으로 고를 수 없다).
export async function listRuleRoles(viewer: Viewer): Promise<RuleRoleView[]> {
  await assertCanView(viewer);
  return (await listRoles(viewer)).map((role) => ({ id: role.id, name: role.name }));
}

function toView(kind: ConditionKind, record: NotificationRuleRecord | null, rule: EffectiveRule, roleNames: ReadonlyMap<string, string>): RuleRowView {
  return {
    kind: kind.kind,
    label: kind.label,
    dateUnit: kind.dateUnit,
    enabled: rule.enabled,
    days: kind.daysRange ? (rule.days ?? null) : null,
    daysRange: kind.daysRange ?? null,
    defaultRecipientLabel: kind.defaultRecipientLabel,
    extraRoleIds: rule.extraRoleIds,
    extraRoleNames: rule.extraRoleIds.flatMap((id) => {
      const name = roleNames.get(id);
      return name === undefined ? [] : [name];
    }),
    emailEnabled: rule.emailEnabled,
    version: record?.version ?? 0,
  };
}

export async function listRuleRows(viewer: Viewer): Promise<RuleRowView[]> {
  await assertCanView(viewer);
  const [records, roles] = await Promise.all([listNotificationRuleRecords(viewer), listRoles(viewer, { includeArchived: true })]);
  const byKind = new Map(records.map((record) => [record.kind, record]));
  const roleNames = new Map(roles.map((role) => [role.id, role.name]));
  return CONDITION_KINDS.map((kind) => {
    const record = byKind.get(kind.kind) ?? null;
    return toView(kind, record, effectiveRule(kind, record), roleNames);
  });
}

function findKind(kindName: string): ConditionKind {
  const kind = CONDITION_KINDS.find((candidate) => candidate.kind === kindName);
  if (!kind) throw new RuleInvalidError("알림 규칙 종류 없음 · 새로 불러오기");
  return kind;
}

function auditValues(kind: ConditionKind, rule: EffectiveRule): Record<string, unknown> {
  return {
    enabled: rule.enabled,
    days: kind.daysRange ? (rule.days ?? null) : null,
    extraRoleIds: rule.extraRoleIds,
    emailEnabled: rule.emailEnabled,
  };
}

export type RuleChange = {
  enabled?: boolean;
  days?: number | null;
  extraRoleIds?: string[];
  emailEnabled?: boolean;
};

// 한 tx — 잠그고 · version을 맞춰 보고 · upsert + `notification_rule_change`(바뀐 칸만). 바뀐 것이 없으면 쓰지 않는다.
// enabled_at: 저장 전 실효 켬이 거짓이고 저장 뒤 참일 때만 지금(07-10 사건 창 하한) — 받는 계급만 바꾸거나 켬 → 끔이면 그대로.
export async function writeRule(viewer: Viewer, kindName: string, expectedVersion: number, change: RuleChange): Promise<{ changed: boolean }> {
  await assertCanWrite(viewer);
  const kind = findKind(kindName);
  return withTransaction(async (tx) => {
    const record = await lockNotificationRule(viewer, kind.kind, tx);
    if ((record?.version ?? 0) !== expectedVersion) throw new RuleConflictError("다른 사람이 먼저 수정 · 새로 불러오기");
    const before = effectiveRule(kind, record);
    const row: NotificationRuleRow = {
      kind: kind.kind,
      enabled: change.enabled ?? record?.enabled ?? null,
      days: change.days !== undefined ? change.days : (record?.days ?? null),
      extraRoleIds: change.extraRoleIds ?? record?.extraRoleIds ?? [],
      emailEnabled: change.emailEnabled ?? record?.emailEnabled ?? null,
      enabledAt: record?.enabledAt ?? null,
    };
    const after = effectiveRule(kind, row);
    const changes = buildChanges(auditValues(kind, before), auditValues(kind, after));
    if (Object.keys(changes).length === 0) return { changed: false };
    if (!before.enabled && after.enabled) row.enabledAt = new Date();
    if (!(await upsertNotificationRule(viewer, row, expectedVersion, tx))) throw new RuleConflictError("다른 사람이 먼저 수정 · 새로 불러오기");
    await recordAction(
      viewer,
      { actionType: "notification_rule_change", entity: "notification_rule", entityId: kind.kind, detail: { kind: kind.kind, changes } },
      { tx },
    );
    return { changed: true };
  });
}

// 켬 체크박스 즉시 저장(N4) — 켬/끔만 바꾼다. 규칙 끄기가 곧 알림 끄기다(사람별 끄기 없음 — D-719).
export function setRuleEnabled(viewer: Viewer, input: { kind: string; enabled: boolean; version: number }): Promise<{ changed: boolean }> {
  return writeRule(viewer, input.kind, input.version, { enabled: input.enabled });
}
