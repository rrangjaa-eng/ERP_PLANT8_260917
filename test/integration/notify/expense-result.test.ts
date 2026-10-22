import { and, desc, eq, isNotNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { approvalRoutes, approvalSteps, notificationLog, notificationRules } from "@/db/schema";
import { approveDocument } from "@/domain/approvals";
import { createExpenseFromLines } from "@/domain/expenses";
import { CONDITION_KINDS, type ConditionKind } from "@/domain/notify/condition-kinds";
import { expenseResultKind } from "@/domain/notify/kinds/expense-result";
import { runTick } from "@/domain/notify/tick";
import type { Viewer } from "@/domain/viewer";
import { setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "../fixtures/expenses";
import { approvedExpenseWithEvidence } from "../fixtures/payments";

// 07-14 결재 결과(N11 · N19 · D-716 · D-744) — 꺼 둔 사건 종류. 켠 규칙의 고정 되돌아보기 창(하한 enabled_at) 안 사건을 사건 id 키로 한 번.
// 2026-10-16 금 · 17 토 · 19 월 · 20 화.

function at(date: string): () => Date {
  return () => new Date(`${date}T09:00:00+09:00`);
}

async function tick(kinds: readonly ConditionKind[], date: string) {
  await runTick({ conditionKinds: kinds, now: at(date), emailSender: null });
}

async function rowsOf(user: Viewer) {
  const rows = await db.select().from(notificationLog).where(eq(notificationLog.recipientId, user.id)).orderBy(notificationLog.id);
  return rows.filter((row) => row.conditionKind === "expense-result");
}

async function enableRule(enabledAt: string) {
  await db.insert(notificationRules).values({ kind: "expense-result", enabled: true, enabledAt: new Date(enabledAt) });
}

// 마지막으로 처리된 단계(최종 승인 단계) — id와 처리 시각을 테스트 날짜로 옮긴다(서버 시각 칸이라 도메인 경로로는 날짜를 못 정한다).
async function lastActedStep(instanceId: string) {
  const [step] = await db
    .select({ id: approvalSteps.id })
    .from(approvalSteps)
    .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
    .where(and(eq(approvalRoutes.instanceId, instanceId), isNotNull(approvalSteps.actedAt)))
    .orderBy(desc(approvalSteps.stepIndex))
    .limit(1);
  if (!step) throw new Error("처리된 단계 없음");
  return step.id;
}

async function moveActedAt(instanceId: string, iso: string): Promise<string> {
  const stepId = await lastActedStep(instanceId);
  await db.update(approvalSteps).set({ actedAt: new Date(iso) }).where(eq(approvalSteps.id, stepId));
  return stepId;
}

const TITLE = "가을 팝업 · 무대 제작";

describe("등록부 (D-716 · D-744)", () => {
  it("결재 결과 종류는 기본 끔 · 일수 칸 없음 · 사다리 없음 · 받는 사람 글자 기안자", () => {
    const registered = CONDITION_KINDS.find((kind) => kind.kind === "expense-result");
    expect(registered).toBe(expenseResultKind);
    expect(expenseResultKind).toMatchObject({ label: "결재 결과", dateUnit: "calendar", defaults: { enabled: false, emailEnabled: true }, defaultRecipientLabel: "기안자" });
    expect(expenseResultKind.daysRange).toBeUndefined();
    expect(expenseResultKind.ladder).toBeFalsy();
  });
});

describe("결재 결과 — 최종 승인 (N11 · D-716)", () => {
  it("규칙 행이 없으면(기본 끔) 최종 승인 뒤 tick에 행이 없다", async () => {
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithEvidence(fx);
    await moveActedAt(doc.instanceId, "2026-10-16T15:00:00+09:00");
    await tick([expenseResultKind], "2026-10-19");
    expect(await rowsOf(fx.pm)).toHaveLength(0);
  });

  it("켠 규칙 — 금요일 최종 승인은 토요일 tick을 지나 월요일 tick에 기안자 한 행, 다음 tick에 다시 안 나간다", async () => {
    const fx = await setupExpenseProject();
    await enableRule("2026-10-01T00:00:00+09:00");
    const doc = await approvedExpenseWithEvidence(fx);
    const stepId = await moveActedAt(doc.instanceId, "2026-10-16T15:00:00+09:00");

    await tick([expenseResultKind], "2026-10-17");
    expect(await rowsOf(fx.pm)).toHaveLength(0);
    await tick([expenseResultKind], "2026-10-19");
    const rows = await rowsOf(fx.pm);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: "expense-result", entityId: `${doc.expenseId}:${stepId}`, round: 1, message: `승인 · ${TITLE}` });
    // 금액 숫자 없음(SC-07).
    expect(rows[0]?.message).not.toMatch(/[0-9]/);
    // 결재자(팀장 · 대표)에게는 가지 않는다.
    expect(await rowsOf(fx.lead)).toHaveLength(0);
    expect(await rowsOf(fx.ceo)).toHaveLength(0);

    await tick([expenseResultKind], "2026-10-20");
    expect(await rowsOf(fx.pm)).toHaveLength(1);
  });

  it("중간 단계 승인(최종 아님)은 사건이 아니다", async () => {
    const fx = await setupExpenseProject();
    await enableRule("2026-10-01T00:00:00+09:00");
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = created.created[0]?.expenseId;
    if (!expenseId) throw new Error("지출결의 없음");
    const submitted = await submitReadyDraft(fx.pm, expenseId);
    if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
    await approveDocument(fx.lead, { instanceId: submitted.instanceId, expectedVersion: submitted.version });
    await moveActedAt(submitted.instanceId, "2026-10-16T15:00:00+09:00");
    await tick([expenseResultKind], "2026-10-19");
    expect(await rowsOf(fx.pm)).toHaveLength(0);
  });

  it("규칙을 켜기 전(enabled_at 앞) 승인은 0행", async () => {
    const fx = await setupExpenseProject();
    await enableRule("2026-10-19T08:00:00+09:00");
    const doc = await approvedExpenseWithEvidence(fx);
    await moveActedAt(doc.instanceId, "2026-10-16T15:00:00+09:00");
    await tick([expenseResultKind], "2026-10-19");
    expect(await rowsOf(fx.pm)).toHaveLength(0);
  });

  it("15일 전 승인은 창 밖이라 0행", async () => {
    const fx = await setupExpenseProject();
    await enableRule("2026-09-01T00:00:00+09:00");
    const doc = await approvedExpenseWithEvidence(fx);
    await moveActedAt(doc.instanceId, "2026-10-05T10:00:00+09:00");
    await tick([expenseResultKind], "2026-10-20");
    expect(await rowsOf(fx.pm)).toHaveLength(0);
  });

  it("본인 승인(마지막 단계 처리자 = 기안자)은 알리지 않는다", async () => {
    const fx: ExpenseFixture = await setupExpenseProject();
    await enableRule("2026-10-01T00:00:00+09:00");
    const doc = await approvedExpenseWithEvidence(fx);
    const stepId = await moveActedAt(doc.instanceId, "2026-10-16T15:00:00+09:00");
    // 도메인 경로로 기안자가 최종 단계를 처리하는 결재선을 만들려면 대표 기안 프로젝트가 필요하다 — 처리자 칸만 기안자로 옮겨 같은 상태를 만든다.
    await db.update(approvalSteps).set({ actedBy: fx.pm.id, selfApproved: true }).where(eq(approvalSteps.id, stepId));
    await tick([expenseResultKind], "2026-10-19");
    expect(await rowsOf(fx.pm)).toHaveLength(0);
  });
});
