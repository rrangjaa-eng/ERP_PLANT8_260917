import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { actionLog, notificationLog, notificationRules } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { CONDITION_KINDS, type EvaluateContext } from "@/domain/notify/condition-kinds";
import { approvalWaitingKind } from "@/domain/notify/kinds/approval-waiting";
import { listRuleRows, setRuleEnabled } from "@/domain/notify/rule-admin";
import { runTick } from "@/domain/notify/tick";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
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
