import { and, desc, eq, isNotNull } from "drizzle-orm";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { actionLog, approvalRoutes, approvalSteps, expensePayments, expenses, notificationLog, notificationRules } from "@/db/schema";
import { approveDocument, rejectDocument } from "@/domain/approvals";
import { confirmEvidence, waiveEvidence } from "@/domain/evidence-reviews";
import { cancelExpensePayment, completeExpensePayment, previewPayable } from "@/domain/payments";
import { preCutoffUnapprovedKind } from "@/domain/notify/kinds/pre-cutoff-unapproved";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { upsertVisibility } from "@/repositories/permissions";
import { createExpenseFromLines } from "@/domain/expenses";
import { CONDITION_KINDS, type ConditionKind } from "@/domain/notify/condition-kinds";
import { expenseResultKind } from "@/domain/notify/kinds/expense-result";
import { runTick } from "@/domain/notify/tick";
import type { Viewer } from "@/domain/viewer";
import { setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "../fixtures/expenses";
import { approvedExpenseWithEvidence, approvedExpenseWithoutEvidence, makePaymentManager, setEvidenceRequired } from "../fixtures/payments";
import { backdateActionLog } from "@/test/support/action-log-backdate";

// 07-14 결재 결과(N11 · N19 · D-716 · D-744) — 꺼 둔 사건 종류. 켠 규칙의 고정 되돌아보기 창(하한 enabled_at) 안 사건을 사건 id 키로 한 번.
// 2026-10-16 금 · 17 토 · 19 월 · 20 화.

function at(date: string): () => Date {
  return () => new Date(`${date}T09:00:00+09:00`);
}

async function tick(kinds: readonly ConditionKind[], date: string) {
  await runTick({ conditionKinds: kinds, now: at(date), emailSender: null });
}

async function rowsOf(user: Viewer, kind = "expense-result") {
  const rows = await db.select().from(notificationLog).where(eq(notificationLog.recipientId, user.id)).orderBy(notificationLog.id);
  return rows.filter((row) => row.conditionKind === kind);
}

async function enableRule(enabledAt: string, kind = "expense-result", days?: number) {
  await db.insert(notificationRules).values({ kind, enabled: true, enabledAt: new Date(enabledAt), ...(days === undefined ? {} : { days }) });
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

// ── Task 2: 반려 · 금액 바뀜 · 지급 완료 · 지급 취소 갈래(D-744 · K13 · AQ-24) ──────────────

async function submitOne(fx: ExpenseFixture) {
  const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("지출결의 없음");
  const submitted = await submitReadyDraft(fx.pm, expenseId);
  if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
  return { expenseId, instanceId: submitted.instanceId, version: submitted.version };
}

// 지급 권한자 + 금액 · 값 정보 항목 노출(evidence-reviews.test.ts와 같은 꼴).
async function makePayer(): Promise<Viewer> {
  const payer = await makePaymentManager();
  if (!payer.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: true });
  return payer;
}

async function versionOf(expenseId: string): Promise<number> {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row.version;
}

async function payNow(payer: Viewer, expenseId: string, correctedSupplyAmount?: number) {
  const confirmed = await confirmEvidence(payer, { expenseId, version: await versionOf(expenseId), ...(correctedSupplyAmount === undefined ? {} : { correctedSupplyAmount }) });
  const preview = await previewPayable(payer, { expenseId, payDate: seoulToday() });
  if (preview.payableKrw === undefined || preview.payableKrw === null) throw new Error("지급 총액 없음");
  await completeExpensePayment(payer, { expenseId, expectedPayableKrw: preview.payableKrw, version: confirmed.version });
}

const byWord = (rows: Awaited<ReturnType<typeof rowsOf>>, word: string) => rows.filter((row) => row.message.startsWith(`${word} · `));

describe("결재 결과 — 반려 · 금액 바뀜 · 지급 완료 · 지급 취소 (N11 · N19 · D-744 · K13)", () => {
  it("반려 사건 → 기안자 `반려 · {문서 제목}` 한 번", async () => {
    const fx = await setupExpenseProject();
    await enableRule("2026-10-01T00:00:00+09:00");
    const doc = await submitOne(fx);
    await rejectDocument(fx.lead, { instanceId: doc.instanceId, expectedVersion: doc.version, reason: "견적 다시" });
    const stepId = await moveActedAt(doc.instanceId, "2026-10-16T15:00:00+09:00");
    await tick([expenseResultKind], "2026-10-19");
    await tick([expenseResultKind], "2026-10-20");
    const rows = await rowsOf(fx.pm);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entityId: `${doc.expenseId}:${stepId}`, message: `반려 · ${TITLE}` });
  });

  it("금액 바뀜(경영관리가 공급가액을 고쳐 확인 — 끌 수 없는 evidence_amount_change) → `금액 바뀜 · {문서 제목}` 한 번 · 금액 숫자 없음", async () => {
    await setEvidenceRequired(false);
    const fx = await setupExpenseProject();
    await enableRule("2026-10-01T00:00:00+09:00");
    const doc = await approvedExpenseWithEvidence(fx);
    await moveActedAt(doc.instanceId, "2026-10-10T15:00:00+09:00");
    const payer = await makePayer();
    await confirmEvidence(payer, { expenseId: doc.expenseId, version: await versionOf(doc.expenseId), correctedSupplyAmount: 12_000_000 });
    // 07-13 action_log 불변 트리거 — 시각 당기기는 시험 전용 backdateActionLog로만.
    const [logged] = await db.select({ seq: actionLog.seq }).from(actionLog).where(and(eq(actionLog.actionType, "evidence_amount_change"), eq(actionLog.entityId, doc.expenseId)));
    await backdateActionLog(logged!.seq, new Date("2026-10-16T15:00:00+09:00"));
    await tick([expenseResultKind], "2026-10-19");
    await tick([expenseResultKind], "2026-10-20");
    const changed = byWord(await rowsOf(fx.pm), "금액 바뀜");
    expect(changed).toHaveLength(1);
    expect(changed[0]?.message).toBe(`금액 바뀜 · ${TITLE}`);
    expect(changed[0]?.entityId.startsWith(`${doc.expenseId}:`)).toBe(true);
  });

  it("증빙 없이 닫힘(경영관리 증빙 면제 — 끌 수 없는 evidence_waive) → 기안자 `증빙 없이 닫힘 · {문서 제목}` 한 번(사용자 결정 2026-10-23 · 260907 expenses.ts:6330-6362)", async () => {
    await setEvidenceRequired(false);
    const fx = await setupExpenseProject();
    await enableRule("2026-10-01T00:00:00+09:00");
    const doc = await approvedExpenseWithoutEvidence(fx);
    await moveActedAt(doc.instanceId, "2026-10-10T15:00:00+09:00");
    const payer = await makePayer();
    await waiveEvidence(payer, { expenseId: doc.expenseId, version: await versionOf(doc.expenseId), reason: "현장 영수증 분실" });
    // 07-13 action_log 불변 트리거 — 시각 당기기는 시험 전용 backdateActionLog로만.
    const [logged] = await db.select({ seq: actionLog.seq }).from(actionLog).where(and(eq(actionLog.actionType, "evidence_waive"), eq(actionLog.entityId, doc.expenseId)));
    await backdateActionLog(logged!.seq, new Date("2026-10-16T15:00:00+09:00"));
    await tick([expenseResultKind], "2026-10-19");
    await tick([expenseResultKind], "2026-10-20");
    const closed = byWord(await rowsOf(fx.pm), "증빙 없이 닫힘");
    expect(closed.map((row) => row.message)).toEqual([`증빙 없이 닫힘 · ${TITLE}`]);
    expect(closed[0]?.entityId.startsWith(`${doc.expenseId}:`)).toBe(true);
  });

  it("지급 완료 → `지급 완료 · {문서 제목}` · 지급 취소 → `지급 취소 · {문서 제목}` — 각 한 번, `지급됨` 없음", async () => {
    await setEvidenceRequired(false);
    const fx = await setupExpenseProject();
    await enableRule("2026-10-01T00:00:00+09:00");
    const doc = await approvedExpenseWithEvidence(fx);
    await moveActedAt(doc.instanceId, "2026-10-10T15:00:00+09:00");
    const payer = await makePayer();
    await payNow(payer, doc.expenseId);
    await db.update(expensePayments).set({ processedAt: new Date("2026-10-15T15:00:00+09:00") }).where(eq(expensePayments.expenseId, doc.expenseId));
    await cancelExpensePayment(payer, { expenseId: doc.expenseId, reason: "계좌 틀림", version: await versionOf(doc.expenseId) });
    await db.update(expensePayments).set({ cancelledAt: new Date("2026-10-16T15:00:00+09:00") }).where(eq(expensePayments.expenseId, doc.expenseId));
    await tick([expenseResultKind], "2026-10-19");
    await tick([expenseResultKind], "2026-10-20");
    const rows = await rowsOf(fx.pm);
    expect(byWord(rows, "지급 완료").map((row) => row.message)).toEqual([`지급 완료 · ${TITLE}`]);
    expect(byWord(rows, "지급 취소").map((row) => row.message)).toEqual([`지급 취소 · ${TITLE}`]);
    for (const row of rows) {
      expect(row.message).not.toContain("지급됨");
      expect(row.message).not.toMatch(/[0-9]/);
    }
  });

  it("규칙 끔(행 없음)이면 지급 완료 · 지급 취소도 0 — 합친 종류 하나가 끔(D-744)", async () => {
    await setEvidenceRequired(false);
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithEvidence(fx);
    const payer = await makePayer();
    await payNow(payer, doc.expenseId);
    await db.update(expensePayments).set({ processedAt: new Date("2026-10-16T15:00:00+09:00") }).where(eq(expensePayments.expenseId, doc.expenseId));
    await tick([expenseResultKind], "2026-10-19");
    expect(await rowsOf(fx.pm)).toHaveLength(0);
  });

  it("지급 · 취소는 따로 된 종류 파일이 없다(D-744)", () => {
    const files = readdirSync("domain/notify/kinds");
    expect(files.filter((name) => /payment/i.test(name))).toEqual([]);
    expect(readFileSync("domain/notify/kinds/expense-result.ts", "utf8")).not.toContain("지급됨");
  });
});

// ── Task 2: 마감 전 미승인(N12 · C-P2-1 · D-715) ──────────────
// 수동 지정일 2026-10-23(금) → 마감 = 10-22(목) 14:00(resolvePaySchedule). 10-21 수 · 22 목 · 29 목.

async function setManualPayDate(fx: ExpenseFixture, expenseId: string, date: string) {
  await db
    .update(expenses)
    .set({ scheduledPaymentDate: date, scheduledPaymentSetBy: fx.pm.id, scheduledPaymentSetAt: new Date() })
    .where(eq(expenses.id, expenseId));
}

describe("마감 전 미승인 (N12 · C-P2-1)", () => {
  it("등록부 — 기본 끔 · 영업일 · 일수 0 · 범위 0~3 · 기안자", () => {
    expect(CONDITION_KINDS).toContain(preCutoffUnapprovedKind);
    expect(preCutoffUnapprovedKind).toMatchObject({
      kind: "pre-cutoff-unapproved",
      label: "마감 전 미승인",
      dateUnit: "business",
      defaults: { enabled: false, days: 0, emailEnabled: true },
      daysRange: { min: 0, max: 3 },
      defaultRecipientLabel: "기안자",
    });
  });

  it("켬(일수 0) — 결재 중 지출결의는 마감 날 9시 tick에 기안자 `마감 전 미승인 · {문서 제목} · MM-DD HH:MM` 한 번 · 전날 tick은 없음", async () => {
    const fx = await setupExpenseProject();
    await enableRule("2026-10-01T00:00:00+09:00", "pre-cutoff-unapproved");
    const doc = await submitOne(fx);
    await setManualPayDate(fx, doc.expenseId, "2026-10-23");
    await tick([preCutoffUnapprovedKind], "2026-10-21");
    expect(await rowsOf(fx.pm, "pre-cutoff-unapproved")).toHaveLength(0);
    await tick([preCutoffUnapprovedKind], "2026-10-22");
    await tick([preCutoffUnapprovedKind], "2026-10-22");
    const rows = await rowsOf(fx.pm, "pre-cutoff-unapproved");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: "expense", entityId: `${doc.expenseId}:2026-10-22`, referenceDate: "2026-10-22", message: `마감 전 미승인 · ${TITLE} · 10-22 14:00` });
    expect(await rowsOf(fx.lead, "pre-cutoff-unapproved")).toHaveLength(0);
  });

  it("규칙 없음(끔) · 최종 승인된 건 · 다른 주 건은 없음", async () => {
    const fx = await setupExpenseProject();
    const doc = await submitOne(fx);
    await setManualPayDate(fx, doc.expenseId, "2026-10-23");
    await tick([preCutoffUnapprovedKind], "2026-10-22");
    expect(await rowsOf(fx.pm, "pre-cutoff-unapproved")).toHaveLength(0);

    await enableRule("2026-10-01T00:00:00+09:00", "pre-cutoff-unapproved");
    const approved = await approvedExpenseWithEvidence(fx, fx.lines.split);
    await setManualPayDate(fx, approved.expenseId, "2026-10-23");
    const other = await setupExpenseProject();
    const later = await submitOne(other);
    await setManualPayDate(other, later.expenseId, "2026-10-30");
    await tick([preCutoffUnapprovedKind], "2026-10-22");
    const ids = (await rowsOf(fx.pm, "pre-cutoff-unapproved")).map((row) => row.entityId);
    expect(ids).toEqual([`${doc.expenseId}:2026-10-22`]);
    expect(await rowsOf(other.pm, "pre-cutoff-unapproved")).toHaveLength(0);
  });

  it("일수 1 — 마감 전 영업일 tick에 한 번 · 그날 tick을 놓치면 마감 날 tick에 한 번 · 두 날 다 돌아도 합 한 번", async () => {
    const fx = await setupExpenseProject();
    await enableRule("2026-10-01T00:00:00+09:00", "pre-cutoff-unapproved", 1);
    const both = await submitOne(fx);
    await setManualPayDate(fx, both.expenseId, "2026-10-23");
    await tick([preCutoffUnapprovedKind], "2026-10-20");
    expect(await rowsOf(fx.pm, "pre-cutoff-unapproved")).toHaveLength(0);
    await tick([preCutoffUnapprovedKind], "2026-10-21");
    expect((await rowsOf(fx.pm, "pre-cutoff-unapproved")).map((row) => row.entityId)).toEqual([`${both.expenseId}:2026-10-22`]);
    await tick([preCutoffUnapprovedKind], "2026-10-22");
    expect(await rowsOf(fx.pm, "pre-cutoff-unapproved")).toHaveLength(1);

    const missed = await setupExpenseProject();
    const doc = await submitOne(missed);
    await setManualPayDate(missed, doc.expenseId, "2026-10-23");
    await tick([preCutoffUnapprovedKind], "2026-10-22");
    expect((await rowsOf(missed.pm, "pre-cutoff-unapproved")).map((row) => row.entityId)).toEqual([`${doc.expenseId}:2026-10-22`]);
  });

  it("마감이 다음 주로 밀리면 새 마감에 다시 한 번", async () => {
    const fx = await setupExpenseProject();
    await enableRule("2026-10-01T00:00:00+09:00", "pre-cutoff-unapproved");
    const doc = await submitOne(fx);
    await setManualPayDate(fx, doc.expenseId, "2026-10-23");
    await tick([preCutoffUnapprovedKind], "2026-10-22");
    await setManualPayDate(fx, doc.expenseId, "2026-10-30");
    await tick([preCutoffUnapprovedKind], "2026-10-29");
    expect((await rowsOf(fx.pm, "pre-cutoff-unapproved")).map((row) => row.entityId)).toEqual([`${doc.expenseId}:2026-10-22`, `${doc.expenseId}:2026-10-29`]);
  });
});
