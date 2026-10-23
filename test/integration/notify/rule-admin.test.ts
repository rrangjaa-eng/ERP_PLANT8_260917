import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { actionLog, notificationLog, notificationRules, roles } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { CONDITION_KINDS, type EvaluateContext } from "@/domain/notify/condition-kinds";
import { approvalWaitingKind } from "@/domain/notify/kinds/approval-waiting";
import { listRuleRoles, listRuleRows, saveNotificationRule, setRuleEnabled } from "@/domain/notify/rule-admin";
import { runTick } from "@/domain/notify/tick";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { insertRole } from "@/repositories/roles";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createTestConditionKind, testCandidate } from "@/test/support/notify-tick";

// 07-19 알림 규칙 화면 도메인(D-717 · D-719 · D-744): 목록 순서 · 켬/끔 저장 · 행동 로그 · version · enabled_at.

// SC-07 표 순서 열넷 — 등록된 것만 남긴 목록이 화면 순서다(07-22 · 07-23이 뒤에 붙여도 그대로 녹색).
const SC07_ORDER = [
  "project-end-no-expense",
  "pay-week-alert",
  "approval-waiting",
  "paid-no-evidence",
  "prepaid-evidence",
  "proxy-registered",
  "expense-result",
  "pre-cutoff-unapproved",
  "settle-nudge",
  "rejected-idle",
  "quote-nudge",
  "vendor-account-changed",
  "orphan-evidence",
  "collection-overdue",
];

async function person(roleId: string): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `rule-admin-${randomUUID()}@example.test`, name: "규칙 관리자", roleId });
  return { id: userId, roleId };
}

async function admin(): Promise<Viewer> {
  return person(SYSADMIN_ROLE_ID);
}

async function ruleRow(kind: string) {
  const [row] = await db.select().from(notificationRules).where(eq(notificationRules.kind, kind));
  return row;
}

async function ruleLogs(kind: string) {
  const rows = await db.select().from(actionLog).where(eq(actionLog.actionType, "notification_rule_change"));
  return rows.filter((row) => row.entityId === kind);
}

describe("listRuleRows — 등록부 순서 그대로 (N1 · C-P3-5 · D-744)", () => {
  it("규칙 kind 순서는 SC-07 표 순서에서 등록된 것만 남긴 목록과 같다", async () => {
    const rows = await listRuleRows(await admin());
    const registered = new Set(CONDITION_KINDS.map((kind) => kind.kind));
    expect(rows.map((row) => row.kind)).toEqual(SC07_ORDER.filter((kind) => registered.has(kind)));
    expect(rows.map((row) => row.kind)).toEqual(CONDITION_KINDS.map((kind) => kind.kind));
  });

  it("행 없는 종류는 코드 기본값 · 일수 칸은 종류 범위가 있을 때만 · 기본 받는 사람 글자는 종류 계약에서", async () => {
    const rows = await listRuleRows(await admin());
    const waiting = rows.find((row) => row.kind === "approval-waiting");
    expect(waiting).toMatchObject({ enabled: true, days: 3, daysRange: { min: 0, max: 10 }, dateUnit: "business", version: 0, extraRoleIds: [], emailEnabled: true });
    expect(waiting?.defaultRecipientLabel).toBe(approvalWaitingKind.defaultRecipientLabel);
    const result = rows.find((row) => row.kind === "expense-result");
    expect(result).toMatchObject({ enabled: false, days: null, daysRange: null });
  });

  it("D-744: 결재 결과 규칙 하나가 지급 완료 · 취소까지 맡고 지급으로 시작하는 별도 규칙이 없다 · 기본 끔", async () => {
    const rows = await listRuleRows(await admin());
    expect(rows.filter((row) => row.label.includes("지급 완료") || row.label.includes("지급 취소") || row.kind.includes("payment"))).toEqual([]);
    expect(rows.find((row) => row.label === "결재 결과")?.enabled).toBe(false);
  });

  it("알림 규칙 보기 권한이 없는 viewer는 거부한다", async () => {
    await expect(listRuleRows(await person(DEFAULT_ROLE_ID))).rejects.toThrow();
  });
});

describe("setRuleEnabled — 즉시 저장 · 행동 로그 · version · enabled_at (D-717 · D-719)", () => {
  it("끔 → 행 저장 · notification_rule_change 한 줄에 changes.enabled = [true, false]", async () => {
    const viewer = await admin();
    await setRuleEnabled(viewer, { kind: "approval-waiting", enabled: false, version: 0 });
    const row = await ruleRow("approval-waiting");
    expect(row).toMatchObject({ enabled: false, version: 1, updatedBy: viewer.id });
    const logs = await ruleLogs("approval-waiting");
    expect(logs).toHaveLength(1);
    expect(logs[0]?.entity).toBe("notification_rule");
    expect(logs[0]?.detail).toMatchObject({ changes: { enabled: [true, false] } });
    const after = (await listRuleRows(viewer)).find((r) => r.kind === "approval-waiting");
    expect(after).toMatchObject({ enabled: false, version: 1 });
  });

  it("끈 규칙은 다음 tick에서 그 종류 후보가 0이다", async () => {
    const viewer = await admin();
    const recipient = await person(DEFAULT_ROLE_ID);
    const source = createTestConditionKind([testCandidate({ recipientId: recipient.id, entityId: "T-1", referenceDate: "2026-10-05" })], { kind: "approval-waiting" });
    const kind = { ...approvalWaitingKind, evaluate: (ctx: EvaluateContext) => source.evaluate(ctx) };
    const now = () => new Date("2026-10-07T09:00:00+09:00");
    await setRuleEnabled(viewer, { kind: "approval-waiting", enabled: false, version: 0 });
    await runTick({ conditionKinds: [kind], now, emailSender: null });
    expect(await db.select().from(notificationLog).where(eq(notificationLog.recipientId, recipient.id))).toEqual([]);
    await setRuleEnabled(viewer, { kind: "approval-waiting", enabled: true, version: 1 });
    await runTick({ conditionKinds: [kind], now, emailSender: null });
    expect(await db.select().from(notificationLog).where(eq(notificationLog.recipientId, recipient.id))).toHaveLength(1);
  });

  it("오래된 version이면 충돌 오류 — 행은 그대로", async () => {
    const viewer = await admin();
    await setRuleEnabled(viewer, { kind: "approval-waiting", enabled: false, version: 0 });
    await expect(setRuleEnabled(viewer, { kind: "approval-waiting", enabled: true, version: 0 })).rejects.toThrow("다른 사람이 먼저 수정 · 새로 불러오기");
    expect((await ruleRow("approval-waiting"))?.enabled).toBe(false);
    expect(await ruleLogs("approval-waiting")).toHaveLength(1);
  });

  it("등록부에 없는 종류 · 쓰기 권한 없는 viewer는 거부한다", async () => {
    await expect(setRuleEnabled(await admin(), { kind: "payment-complete", enabled: true, version: 0 })).rejects.toThrow();
    await expect(setRuleEnabled(await person(DEFAULT_ROLE_ID), { kind: "approval-waiting", enabled: false, version: 0 })).rejects.toThrow();
    expect(await ruleRow("approval-waiting")).toBeUndefined();
  });

  it("enabled_at: 기본 끔 종류를 켬 → 저장 시각 · 켬 → 끔 → 그대로", async () => {
    const viewer = await admin();
    const before = Date.now();
    await setRuleEnabled(viewer, { kind: "expense-result", enabled: true, version: 0 });
    const turnedOn = (await ruleRow("expense-result"))?.enabledAt;
    expect(turnedOn).toBeInstanceOf(Date);
    expect(turnedOn!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(turnedOn!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    await setRuleEnabled(viewer, { kind: "expense-result", enabled: false, version: 1 });
    expect((await ruleRow("expense-result"))?.enabledAt?.getTime()).toBe(turnedOn!.getTime());
  });

  it("enabled_at: 다시 켜면 그 시각으로 바뀐다(꺼 있던 동안의 사건을 몰아 보내지 않음)", async () => {
    const viewer = await admin();
    await setRuleEnabled(viewer, { kind: "expense-result", enabled: true, version: 0 });
    const first = (await ruleRow("expense-result"))!.enabledAt!;
    await setRuleEnabled(viewer, { kind: "expense-result", enabled: false, version: 1 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    await setRuleEnabled(viewer, { kind: "expense-result", enabled: true, version: 2 });
    expect((await ruleRow("expense-result"))!.enabledAt!.getTime()).toBeGreaterThan(first.getTime());
  });
});

describe("saveNotificationRule — 일수 · 받는 계급 추가 · 이메일(D-717 · D-748 · N3)", () => {
  const base = { enabled: undefined, extraRoleIds: [] as string[], emailEnabled: undefined };

  it("종류 범위 밖 일수는 `일수 범위 {min}~{max} · 다시 입력` — 결재 차례 11 · 종료 후 지출결의 없음 31", async () => {
    const viewer = await admin();
    await expect(saveNotificationRule(viewer, { ...base, kind: "approval-waiting", days: 11, version: 0 })).rejects.toThrow("일수 범위 0~10 · 다시 입력");
    await expect(saveNotificationRule(viewer, { ...base, kind: "project-end-no-expense", days: 31, version: 0 })).rejects.toThrow("일수 범위 1~30 · 다시 입력");
    expect(await ruleRow("approval-waiting")).toBeUndefined();
  });

  it("범위 없는 종류에 일수를 보내면 거부 · 보관 계급 · 없는 계급 id도 거부", async () => {
    const viewer = await admin();
    await expect(saveNotificationRule(viewer, { ...base, kind: "expense-result", days: 3, version: 0 })).rejects.toThrow();
    const archived = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `보관-${randomUUID().slice(0, 8)}` });
    await db.update(roles).set({ archivedAt: new Date() }).where(eq(roles.id, archived.id));
    await expect(saveNotificationRule(viewer, { ...base, kind: "project-end-no-expense", days: 7, extraRoleIds: [archived.id], version: 0 })).rejects.toThrow("받는 계급");
    await expect(saveNotificationRule(viewer, { ...base, kind: "project-end-no-expense", days: 7, extraRoleIds: ["role-없음"], version: 0 })).rejects.toThrow("받는 계급");
    expect(await ruleRow("project-end-no-expense")).toBeUndefined();
  });

  it("정상 저장 — 행 · 행동 로그 changes는 바뀐 칸만 · 목록에 받는 계급 이름", async () => {
    const viewer = await admin();
    await saveNotificationRule(viewer, { ...base, kind: "project-end-no-expense", days: 10, extraRoleIds: [TEAM_LEAD_ROLE_ID], emailEnabled: false, version: 0 });
    const row = await ruleRow("project-end-no-expense");
    expect(row).toMatchObject({ days: 10, extraRoleIds: [TEAM_LEAD_ROLE_ID], emailEnabled: false, version: 1 });
    const logs = await ruleLogs("project-end-no-expense");
    expect(logs).toHaveLength(1);
    const changes = (logs[0]?.detail as { changes: Record<string, unknown> }).changes;
    expect(Object.keys(changes).sort()).toEqual(["days", "emailEnabled", "extraRoleIds"]);
    expect(changes.days).toEqual([7, 10]);
    const listed = (await listRuleRows(viewer)).find((r) => r.kind === "project-end-no-expense");
    expect(listed).toMatchObject({ days: 10, extraRoleIds: [TEAM_LEAD_ROLE_ID], emailEnabled: false });
    expect(listed?.extraRoleNames).toHaveLength(1);
  });

  it("받는 계급만 바꾼 저장은 켠 규칙의 enabled_at을 그대로 둔다", async () => {
    const viewer = await admin();
    await setRuleEnabled(viewer, { kind: "expense-result", enabled: true, version: 0 });
    const turnedOn = (await ruleRow("expense-result"))!.enabledAt!.getTime();
    await saveNotificationRule(viewer, { ...base, kind: "expense-result", days: undefined, extraRoleIds: [TEAM_LEAD_ROLE_ID], version: 1 });
    expect((await ruleRow("expense-result"))!.enabledAt!.getTime()).toBe(turnedOn);
  });

  it("두 관리자가 같은 version으로 저장하면 두 번째는 충돌", async () => {
    const first = await admin();
    const second = await admin();
    await saveNotificationRule(first, { ...base, kind: "project-end-no-expense", days: 9, version: 0 });
    await expect(saveNotificationRule(second, { ...base, kind: "project-end-no-expense", days: 12, version: 0 })).rejects.toThrow("다른 사람이 먼저 수정 · 새로 불러오기");
    expect((await ruleRow("project-end-no-expense"))?.days).toBe(9);
  });

  it("쓰기 권한이 없으면 거부", async () => {
    await expect(saveNotificationRule(await person(DEFAULT_ROLE_ID), { ...base, kind: "project-end-no-expense", days: 8, version: 0 })).rejects.toThrow();
  });
  it("이미 받는 계급에 있던 보관 계급은 저장해도 유지 · 새로 보관 계급을 더하는 것은 거부 (사용자 결정 2026-10-23)", async () => {
    const viewer = await admin();
    const kept = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `유지-${randomUUID().slice(0, 8)}` });
    const added = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `신규-${randomUUID().slice(0, 8)}` });
    await saveNotificationRule(viewer, { ...base, kind: "settle-nudge", extraRoleIds: [kept.id, TEAM_LEAD_ROLE_ID], version: 0 });
    await db.update(roles).set({ archivedAt: new Date() }).where(eq(roles.id, kept.id));
    await db.update(roles).set({ archivedAt: new Date() }).where(eq(roles.id, added.id));
    // 패널은 보관 계급 체크를 그대로 보내 — 저장이 성공하고 계급이 남는다.
    await saveNotificationRule(viewer, { ...base, kind: "settle-nudge", extraRoleIds: [kept.id, TEAM_LEAD_ROLE_ID], emailEnabled: false, version: 1 });
    expect((await ruleRow("settle-nudge"))?.extraRoleIds.sort()).toEqual([kept.id, TEAM_LEAD_ROLE_ID].sort());
    // 새로 보관 계급을 더하면 거부.
    await expect(saveNotificationRule(viewer, { ...base, kind: "settle-nudge", extraRoleIds: [kept.id, added.id], version: 2 })).rejects.toThrow("받는 계급");
    // 체크를 풀면 빠진다.
    await saveNotificationRule(viewer, { ...base, kind: "settle-nudge", extraRoleIds: [TEAM_LEAD_ROLE_ID], version: 2 });
    expect((await ruleRow("settle-nudge"))?.extraRoleIds).toEqual([TEAM_LEAD_ROLE_ID]);
  });

  it("받는 계급 활성 확인은 저장 트랜잭션 안에서 잠근다 — 확인과 저장 사이 보관(TOCTOU)이 새지 않는다", async () => {
    const viewer = await admin();
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `경합-${randomUUID().slice(0, 8)}` });
    let release: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let archivedInTx: () => void = () => undefined;
    const archiving = new Promise<void>((resolve) => {
      archivedInTx = resolve;
    });
    // 보관이 아직 커밋되지 않은 채 열려 있는 tx.
    const archiver = db.transaction(async (tx) => {
      await tx.update(roles).set({ archivedAt: new Date() }).where(eq(roles.id, role.id));
      archivedInTx();
      await hold;
    });
    await archiving;
    const saving = saveNotificationRule(viewer, { ...base, kind: "quote-nudge", extraRoleIds: [role.id], version: 0 }).then(
      () => "saved",
      (error: unknown) => (error instanceof Error ? error.message : "error"),
    );
    // 잠금이 있으면 저장은 보관 커밋을 기다린다 — 잠금이 없으면 옛 활성 목록으로 먼저 끝난다.
    const early = await Promise.race([saving, new Promise<string>((resolve) => setTimeout(() => resolve("waiting"), 500))]);
    release();
    await archiver;
    expect(early).toBe("waiting");
    expect(await saving).toContain("받는 계급");
    expect(await ruleRow("quote-nudge")).toBeUndefined();
  });
  it("패널 계급 목록은 활성 계급 + 이미 받는 계급에 있는 보관 계급(archived 표시)만 보인다", async () => {
    const viewer = await admin();
    const kept = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `표시-${randomUUID().slice(0, 8)}` });
    const other = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `숨김-${randomUUID().slice(0, 8)}` });
    await db.update(roles).set({ archivedAt: new Date() }).where(eq(roles.id, kept.id));
    await db.update(roles).set({ archivedAt: new Date() }).where(eq(roles.id, other.id));
    const listed = await listRuleRoles(viewer, [kept.id]);
    expect(listed.find((role) => role.id === kept.id)).toMatchObject({ name: kept.name, archived: true });
    expect(listed.some((role) => role.id === other.id)).toBe(false);
    expect(listed.find((role) => role.id === TEAM_LEAD_ROLE_ID)?.archived).toBeFalsy();
    expect((await listRuleRoles(viewer)).some((role) => role.id === kept.id)).toBe(false);
  });
});
