import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import {
  approvalInstances,
  approvalRoutes,
  approvalSteps,
  corpCardUsages,
  corpCards,
  expenseEvidenceReviews,
  expensePayments,
  expenses,
  files,
  notificationLog,
  notificationRules,
  projects,
  users,
} from "@/db/schema";
import { approveDocument, listMyInbox, rejectDocument } from "@/domain/approvals";
import { voidEvidence } from "@/domain/evidence";
import { createExpenseFromLines } from "@/domain/expenses";
import { CONDITION_KINDS, type ConditionKind } from "@/domain/notify/condition-kinds";
import { approvalWaitingKind } from "@/domain/notify/kinds/approval-waiting";
import { paidNoEvidenceKind } from "@/domain/notify/kinds/paid-no-evidence";
import { prepaidEvidenceKind } from "@/domain/notify/kinds/prepaid-evidence";
import { projectEndNoExpenseKind } from "@/domain/notify/kinds/project-end-no-expense";
import { proxyRegisteredKind } from "@/domain/notify/kinds/proxy-registered";
import { runTick } from "@/domain/notify/tick";
import { DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import type { Viewer } from "@/domain/viewer";
import { makePerson } from "../approvals-fixtures";
import { createCardUsage, precheckCardUsage, type CardUsageInput } from "@/domain/corp-card-usages";
import { createCorpCard } from "@/domain/corp-cards";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { attachEvidence, makeEvidenceManager, setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "../fixtures/expenses";
import { approvedExpenseWithEvidence, approvedExpenseWithoutEvidence } from "../fixtures/payments";

// 07-10 Task 2·3: 켜진 기본 종류 여섯 — 결재 차례(열린 시각 · 후보 전원 · N=0 · 다시 올림 · 사다리) 외.

function at(date: string): () => Date {
  return () => new Date(`${date}T09:00:00+09:00`);
}

async function rowsOf(user: Viewer, kind?: string) {
  const rows = await db.select().from(notificationLog).where(eq(notificationLog.recipientId, user.id)).orderBy(notificationLog.id);
  return kind ? rows.filter((row) => row.conditionKind === kind) : rows;
}

async function tick(kinds: readonly ConditionKind[], date: string) {
  await runTick({ conditionKinds: kinds, now: at(date), emailSender: null });
}

describe("등록부", () => {
  it("켜진 기본 종류가 SC-07 표 순서이고 결재 도착 별도 종류가 없다(K17)", () => {
    const names = CONDITION_KINDS.map((kind) => kind.kind);
    expect(names).toEqual(["project-end-no-expense", "pay-week-alert", "approval-waiting", "paid-no-evidence", "prepaid-evidence", "proxy-registered"]);
    expect(names).not.toContain("approval-arrived");
  });
});

// 2026-10-05 월(개천절 대체공휴일) · 06 화 · 08 목 · 09 금(한글날) · 12 월 · 13 화 · 14 수 · 16 금 · 19 월.
describe("결재 차례 (N6 · K17 · C-P2-4)", () => {
  async function submitOne(fx: ExpenseFixture, line = fx.lines.withVendor) {
    const created = await createExpenseFromLines(fx.pm, { lineIds: [line] });
    const expenseId = created.created[0]?.expenseId;
    if (!expenseId) throw new Error("지출결의를 만들지 못했다");
    const submitted = await submitReadyDraft(fx.pm, expenseId);
    if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
    return { expenseId, instanceId: submitted.instanceId, version: submitted.version };
  }

  async function setSubmittedAt(instanceId: string, iso: string): Promise<void> {
    await db.update(approvalRoutes).set({ submittedAt: new Date(iso) }).where(eq(approvalRoutes.instanceId, instanceId));
  }

  async function setStepActedAt(instanceId: string, stepIndex: number, iso: string, selfApproved = false): Promise<void> {
    const [route] = await db.select().from(approvalRoutes).where(eq(approvalRoutes.instanceId, instanceId));
    if (!route) throw new Error("차수 없음");
    await db
      .update(approvalSteps)
      .set({ actedAt: new Date(iso), selfApproved })
      .where(and(eq(approvalSteps.routeId, route.id), eq(approvalSteps.stepIndex, stepIndex)));
  }

  const MESSAGE = "결재 차례 · 가을 팝업 · 무대 제작 · 3영업일";

  it("상신 3영업일 뒤 팀장에게 1회차 — 그 전 tick은 0행", async () => {
    const fx = await setupExpenseProject();
    const doc = await submitOne(fx);
    await setSubmittedAt(doc.instanceId, "2026-10-05T10:00:00+09:00");
    await tick([approvalWaitingKind], "2026-10-07");
    expect(await rowsOf(fx.lead)).toHaveLength(0);
    await tick([approvalWaitingKind], "2026-10-08");
    const rows = await rowsOf(fx.lead);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ message: MESSAGE, entity: "approval-step", round: 1 });
    expect(await rowsOf(fx.pm)).toHaveLength(0);
    expect(await rowsOf(fx.ceo)).toHaveLength(0);
  });

  it("9영업일 밀린 건은 정확히 한 행(round 3), 사다리가 끝난 지 14일 넘은 건은 0행", async () => {
    const fx = await setupExpenseProject();
    const doc = await submitOne(fx);
    await setSubmittedAt(doc.instanceId, "2026-10-05T10:00:00+09:00");
    await tick([approvalWaitingKind], "2026-10-23");
    const rows = await rowsOf(fx.lead);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ round: 3, message: `${MESSAGE} · 3회차` });

    const late = await setupExpenseProject();
    const lateDoc = await submitOne(late);
    await setSubmittedAt(lateDoc.instanceId, "2026-10-05T10:00:00+09:00");
    await tick([approvalWaitingKind], "2026-11-20");
    expect(await rowsOf(late.lead)).toHaveLength(0);
  });

  it("1회차를 이미 보낸 건이 2회차 기한이면 2회차 한 행만 더해진다", async () => {
    const fx = await setupExpenseProject();
    const doc = await submitOne(fx);
    await setSubmittedAt(doc.instanceId, "2026-10-05T10:00:00+09:00");
    await tick([approvalWaitingKind], "2026-10-08");
    await tick([approvalWaitingKind], "2026-10-14");
    expect((await rowsOf(fx.lead)).map((row) => row.round)).toEqual([1, 2]);
  });

  it("앞 단계 승인 시각이 열린 시각 — 상신일이 아니라 수요일 승인 기준", async () => {
    const fx = await setupExpenseProject();
    const head = await makePerson("본부장", DIVISION_HEAD_ROLE_ID, "기획1팀");
    const doc = await submitOne(fx);
    await approveDocument(fx.lead, { instanceId: doc.instanceId, expectedVersion: doc.version });
    await setSubmittedAt(doc.instanceId, "2026-10-05T10:00:00+09:00");
    await setStepActedAt(doc.instanceId, 1, "2026-10-07T10:00:00+09:00");
    await tick([approvalWaitingKind], "2026-10-08");
    expect(await rowsOf(head)).toHaveLength(0);
    await tick([approvalWaitingKind], "2026-10-13");
    const rows = await rowsOf(head);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.message).toBe(MESSAGE);
    // 이미 처리한 팀장은 후보가 아니다.
    expect(await rowsOf(fx.lead)).toHaveLength(0);
  });

  it("첫 단계가 자기 결재로 넘어가면 열린 시각은 상신 시각", async () => {
    const fx = await setupExpenseProject();
    const head = await makePerson("본부장", DIVISION_HEAD_ROLE_ID, "기획1팀");
    const doc = await submitOne(fx);
    await approveDocument(fx.lead, { instanceId: doc.instanceId, expectedVersion: doc.version });
    await setSubmittedAt(doc.instanceId, "2026-10-05T10:00:00+09:00");
    await setStepActedAt(doc.instanceId, 1, "2026-10-07T10:00:00+09:00", true);
    await tick([approvalWaitingKind], "2026-10-08");
    expect(await rowsOf(head)).toHaveLength(1);
  });

  it("단계 후보가 둘이면 둘 다 한 행씩", async () => {
    const fx = await setupExpenseProject();
    const second = await makePerson("팀장2", TEAM_LEAD_ROLE_ID, "기획1팀");
    const doc = await submitOne(fx);
    await setSubmittedAt(doc.instanceId, "2026-10-05T10:00:00+09:00");
    await tick([approvalWaitingKind], "2026-10-08");
    expect(await rowsOf(fx.lead)).toHaveLength(1);
    expect(await rowsOf(second)).toHaveLength(1);
  });

  it("2회차부터 팀장이 더해지고, 결재자가 팀장 본인이면 추가 없음", async () => {
    const fx = await setupExpenseProject();
    const head = await makePerson("본부장", DIVISION_HEAD_ROLE_ID, "기획1팀");
    const doc = await submitOne(fx);
    await approveDocument(fx.lead, { instanceId: doc.instanceId, expectedVersion: doc.version });
    await setSubmittedAt(doc.instanceId, "2026-10-05T10:00:00+09:00");
    await setStepActedAt(doc.instanceId, 1, "2026-10-07T10:00:00+09:00");
    await tick([approvalWaitingKind], "2026-10-13");
    await tick([approvalWaitingKind], "2026-10-16");
    expect((await rowsOf(head)).map((row) => row.round)).toEqual([1, 2]);
    expect((await rowsOf(fx.lead)).map((row) => row.round)).toEqual([2]);

    const solo = await setupExpenseProject();
    const soloDoc = await submitOne(solo);
    await setSubmittedAt(soloDoc.instanceId, "2026-10-05T10:00:00+09:00");
    await tick([approvalWaitingKind], "2026-10-14");
    expect(await rowsOf(solo.lead)).toHaveLength(1);
  });

  it("대표 단계는 회차가 올라도 팀장 · 대표를 더하지 않는다", async () => {
    const fx = await setupExpenseProject();
    const doc = await submitOne(fx);
    await approveDocument(fx.lead, { instanceId: doc.instanceId, expectedVersion: doc.version });
    await setSubmittedAt(doc.instanceId, "2026-10-05T10:00:00+09:00");
    await setStepActedAt(doc.instanceId, 1, "2026-10-05T11:00:00+09:00");
    await tick([approvalWaitingKind], "2026-10-23");
    const ceoRows = await rowsOf(fx.ceo);
    expect(ceoRows).toHaveLength(1);
    expect(ceoRows[0]?.round).toBe(3);
    expect(await rowsOf(fx.lead)).toHaveLength(0);
  });

  it("N=0(결재 도착) — 토요일 도착은 월요일 tick에 1회차", async () => {
    const fx = await setupExpenseProject();
    await db.insert(notificationRules).values({ kind: "approval-waiting", days: 0 });
    const doc = await submitOne(fx);
    await setSubmittedAt(doc.instanceId, "2026-10-17T20:00:00+09:00");
    await tick([approvalWaitingKind], "2026-10-19");
    const rows = await rowsOf(fx.lead);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.message).toBe("결재 차례 · 가을 팝업 · 무대 제작 · 0영업일");
  });

  it("반려 뒤 다시 올린 결재는 새 단계라 N=0 규칙 다음 영업일 tick에 같은 문장 한 행(K17)", async () => {
    const fx = await setupExpenseProject();
    await db.insert(notificationRules).values({ kind: "approval-waiting", days: 0 });
    const doc = await submitOne(fx);
    await setSubmittedAt(doc.instanceId, "2026-10-06T10:00:00+09:00");
    await tick([approvalWaitingKind], "2026-10-06");
    expect(await rowsOf(fx.lead)).toHaveLength(1);
    await rejectDocument(fx.lead, { instanceId: doc.instanceId, expectedVersion: doc.version, reason: "자료 보강" });
    const [row] = await db.select({ version: approvalInstances.version }).from(approvalInstances).where(eq(approvalInstances.id, doc.instanceId));
    expect(row).toBeDefined();
    const again = await submitReadyDraft(fx.pm, doc.expenseId);
    expect(again.kind).toBe("submitted");
    await setSubmittedAt(doc.instanceId, "2026-10-07T10:00:00+09:00");
    await tick([approvalWaitingKind], "2026-10-08");
    const rows = await rowsOf(fx.lead);
    expect(rows).toHaveLength(2);
    expect(rows[1]?.message).toBe("결재 차례 · 가을 팝업 · 무대 제작 · 0영업일");
    expect(rows[1]?.entityId).not.toBe(rows[0]?.entityId);
  });

  it("설정 단계가 전부 빈 자리라 결재함이 대표 폴백 단계를 처리 가능으로 보면, 대표에게 차례 알림이 간다", async () => {
    const fx = await setupExpenseProject();
    const doc = await submitOne(fx);
    // 설정 단계의 역할을 아무도 갖지 않은 역할로 바꿔 전 단계를 빈 자리로 → 대표 폴백(행 없음, 대표가 처리할 때 삽입).
    const [route] = await db.select().from(approvalRoutes).where(eq(approvalRoutes.instanceId, doc.instanceId));
    if (!route) throw new Error("차수 없음");
    await db.update(approvalSteps).set({ roleId: DIVISION_HEAD_ROLE_ID }).where(eq(approvalSteps.routeId, route.id));
    await setSubmittedAt(doc.instanceId, "2026-10-05T10:00:00+09:00");
    const inbox = await listMyInbox(fx.ceo);
    expect(inbox.mine.map((item) => item.instanceId)).toContain(doc.instanceId);
    await tick([approvalWaitingKind], "2026-10-07");
    expect(await rowsOf(fx.ceo)).toHaveLength(0);
    await tick([approvalWaitingKind], "2026-10-08");
    const rows = await rowsOf(fx.ceo);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ message: MESSAGE, entity: "approval-step", round: 1 });
    expect(await rowsOf(fx.lead)).toHaveLength(0);
  });

  it("결재선이 막힌(blocked) 인스턴스는 후보 없음", async () => {
    const fx = await setupExpenseProject();
    const doc = await submitOne(fx);
    await approveDocument(fx.lead, { instanceId: doc.instanceId, expectedVersion: doc.version });
    await setSubmittedAt(doc.instanceId, "2026-10-05T10:00:00+09:00");
    await setStepActedAt(doc.instanceId, 1, "2026-10-05T11:00:00+09:00");
    await db.update(users).set({ archivedAt: new Date("2026-10-01T00:00:00Z") }).where(eq(users.id, fx.ceo.id));
    await tick([approvalWaitingKind], "2026-10-23");
    expect(await db.select().from(notificationLog)).toHaveLength(0);
  });
});

// ── Task 3: 나머지 넷 ────────────────────────────────────────────────

describe("종료 후 지출결의 없음 (N4)", () => {
  async function endedProject(endDate = "2026-10-01") {
    const fx = await setupExpenseProject();
    await db.update(projects).set({ endDate }).where(eq(projects.id, fx.projectId));
    return fx;
  }
  const MESSAGE = "지출결의 없음 · 가을 팝업 · 종료 7일";

  it("종료일 +7일에 담당 PM 1회차 — 그 전 tick은 0행", async () => {
    const fx = await endedProject();
    await tick([projectEndNoExpenseKind], "2026-10-07");
    expect(await rowsOf(fx.pm)).toHaveLength(0);
    await tick([projectEndNoExpenseKind], "2026-10-08");
    const rows = await rowsOf(fx.pm);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ message: MESSAGE, entity: "project", entityId: fx.projectId, round: 1 });
    expect(await rowsOf(fx.lead)).toHaveLength(0);
  });

  it("보관 · 미수주 · 완료 프로젝트는 제외", async () => {
    for (const patch of [{ archivedAt: new Date("2026-10-02T00:00:00Z") }, { status: "lost" }, { status: "completed" }]) {
      const fx = await endedProject();
      await db.update(projects).set(patch).where(eq(projects.id, fx.projectId));
      await tick([projectEndNoExpenseKind], "2026-10-08");
      expect(await rowsOf(fx.pm)).toHaveLength(0);
    }
  });

  it("수주중(bidding) 프로젝트는 종료일이 지나고 지출결의가 없어도 알리지 않는다(사용자 결정 2026-10-22)", async () => {
    const fx = await endedProject();
    await db.update(projects).set({ status: "bidding" }).where(eq(projects.id, fx.projectId));
    await tick([projectEndNoExpenseKind], "2026-10-08");
    await tick([projectEndNoExpenseKind], "2026-10-14");
    expect(await rowsOf(fx.pm)).toHaveLength(0);
    expect(await rowsOf(fx.lead)).toHaveLength(0);
  });

  it("지출결의가 하나라도 있으면 0행", async () => {
    const fx = await endedProject();
    await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    await tick([projectEndNoExpenseKind], "2026-10-08");
    expect(await rowsOf(fx.pm)).toHaveLength(0);
  });

  it("규칙 days 10이면 +10일", async () => {
    const fx = await endedProject();
    await db.insert(notificationRules).values({ kind: "project-end-no-expense", days: 10 });
    await tick([projectEndNoExpenseKind], "2026-10-09");
    expect(await rowsOf(fx.pm)).toHaveLength(0);
    await tick([projectEndNoExpenseKind], "2026-10-12");
    expect((await rowsOf(fx.pm))[0]?.message).toBe("지출결의 없음 · 가을 팝업 · 종료 10일");
  });

  it("사다리 — 2회차부터 본인 + 팀장, 밀린 건은 최고 회차 한 행, 끝난 지 14일 넘으면 0행", async () => {
    const fx = await endedProject();
    await tick([projectEndNoExpenseKind], "2026-10-08");
    await tick([projectEndNoExpenseKind], "2026-10-14");
    expect((await rowsOf(fx.pm)).map((row) => row.round)).toEqual([1, 2]);
    expect((await rowsOf(fx.lead)).map((row) => row.round)).toEqual([2]);

    const backlog = await endedProject();
    await tick([projectEndNoExpenseKind], "2026-10-23");
    const backlogRows = (await rowsOf(backlog.pm)).filter((row) => row.entityId === backlog.projectId);
    expect(backlogRows.map((row) => row.round)).toEqual([3]);

    const old = await endedProject("2026-09-01");
    await tick([projectEndNoExpenseKind], "2026-10-30");
    expect((await rowsOf(old.pm)).filter((row) => row.entityId === old.projectId)).toHaveLength(0);
  });

  it("비영업일 tick에는 평가하지 않는다", async () => {
    const fx = await endedProject();
    await tick([projectEndNoExpenseKind], "2026-10-10");
    expect(await rowsOf(fx.pm)).toHaveLength(0);
  });
});

async function payOn(expenseId: string, payDate: string, processedBy: string): Promise<void> {
  await db.insert(expensePayments).values({
    expenseId,
    payDate,
    transferKrw: 1_000_000,
    payableKrw: 1_000_000,
    diffKrw: 0,
    paymentMethod: "bank_transfer",
    processedBy,
  });
}

describe("증빙 없음 재촉 (N7)", () => {
  const MESSAGE = "증빙 없음 · 가을 팝업 · 무대 제작 · 지급 후 7일";

  it("지급일 +7일 · 붙은 증빙 0 → 기안자 1회차, 증빙이 붙으면 다음 tick부터 후보 없음", async () => {
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithoutEvidence(fx);
    await payOn(doc.expenseId, "2026-10-01", fx.ceo.id);
    await tick([paidNoEvidenceKind], "2026-10-07");
    expect(await rowsOf(fx.pm)).toHaveLength(0);
    await tick([paidNoEvidenceKind], "2026-10-08");
    const rows = await rowsOf(fx.pm);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ message: MESSAGE, entity: "expense", entityId: doc.expenseId, round: 1 });
    await attachEvidence(fx.pm, doc.expenseId);
    await tick([paidNoEvidenceKind], "2026-10-14");
    expect(await rowsOf(fx.pm)).toHaveLength(1);
  });

  it("증빙이 있으면 · 지급 취소된 건은 0행", async () => {
    const fx = await setupExpenseProject();
    const withEvidence = await approvedExpenseWithEvidence(fx, fx.lines.withVendor);
    await payOn(withEvidence.expenseId, "2026-10-01", fx.ceo.id);
    const cancelled = await approvedExpenseWithoutEvidence(fx, fx.lines.split);
    await payOn(cancelled.expenseId, "2026-10-01", fx.ceo.id);
    await db.update(expensePayments).set({ cancelledAt: new Date("2026-10-02T00:00:00Z"), cancelledBy: fx.ceo.id, cancelReason: "취소" }).where(eq(expensePayments.expenseId, cancelled.expenseId));
    await tick([paidNoEvidenceKind], "2026-10-08");
    expect(await rowsOf(fx.pm)).toHaveLength(0);

  });

  it("증빙이 무효 처리돼 0이 된 건은 재촉한다(SUMMARY 결정 3)", async () => {
    const fx = await setupExpenseProject();
    const voider = await makeEvidenceManager();
    const doc = await approvedExpenseWithEvidence(fx);
    await payOn(doc.expenseId, "2026-10-01", fx.ceo.id);
    await tick([paidNoEvidenceKind], "2026-10-08");
    expect(await rowsOf(fx.pm)).toHaveLength(0);
    const alive = await db.select({ id: files.id }).from(files).where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, doc.expenseId), isNull(files.removedAt), isNull(files.voidedAt)));
    expect(alive.length).toBeGreaterThan(0);
    for (const file of alive) await voidEvidence(voider, { fileId: file.id, reason: "다른 건 영수증" });
    await tick([paidNoEvidenceKind], "2026-10-12");
    const rows = await rowsOf(fx.pm);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: "expense", entityId: doc.expenseId, round: 1 });
  });

  it("증빙 면제된 건은 0행", async () => {
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithoutEvidence(fx);
    await payOn(doc.expenseId, "2026-10-01", fx.ceo.id);
    await db.insert(expenseEvidenceReviews).values({ expenseId: doc.expenseId, status: "waived", waiveReason: "소액", reviewedBy: fx.ceo.id });
    await tick([paidNoEvidenceKind], "2026-10-08");
    expect(await rowsOf(fx.pm)).toHaveLength(0);
  });

  it("선결제 문서는 이 종류가 아니라 선결제 독촉이 맡는다", async () => {
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithoutEvidence(fx);
    await db.update(expenses).set({ prepaid: true, prepaidReason: "선입금 요구" }).where(eq(expenses.id, doc.expenseId));
    await payOn(doc.expenseId, "2026-10-01", fx.ceo.id);
    await tick([paidNoEvidenceKind], "2026-10-08");
    expect(await rowsOf(fx.pm)).toHaveLength(0);
  });

  it("2회차부터 기안자 + 결재 경로 팀장 단계 보유자", async () => {
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithoutEvidence(fx);
    await payOn(doc.expenseId, "2026-10-01", fx.ceo.id);
    await tick([paidNoEvidenceKind], "2026-10-14");
    expect((await rowsOf(fx.pm)).map((row) => row.round)).toEqual([2]);
    expect((await rowsOf(fx.lead)).map((row) => row.round)).toEqual([2]);
    expect((await rowsOf(fx.pm))[0]?.message).toBe(`${MESSAGE} · 2회차`);
  });
});

describe("선결제 증빙 독촉 (N8)", () => {
  async function prepaidDoc(fx: ExpenseFixture, payDate: string) {
    const doc = await approvedExpenseWithoutEvidence(fx);
    await db.update(expenses).set({ prepaid: true, prepaidReason: "선입금 요구" }).where(eq(expenses.id, doc.expenseId));
    await payOn(doc.expenseId, payDate, fx.ceo.id);
    return doc;
  }

  it("기준 지급일 + 설정 14일에 기안자 — 그 전에는 0행", async () => {
    const fx = await setupExpenseProject();
    await prepaidDoc(fx, "2026-09-23");
    await tick([prepaidEvidenceKind], "2026-10-05");
    await tick([prepaidEvidenceKind], "2026-10-06");
    expect(await rowsOf(fx.pm)).toHaveLength(0);
    await tick([prepaidEvidenceKind], "2026-10-07");
    const rows = await rowsOf(fx.pm);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.message).toBe("선결제 증빙 없음 · 가을 팝업 · 무대 제작 · 14일");
  });

  it("규칙 days 20이면 20일", async () => {
    const fx = await setupExpenseProject();
    await prepaidDoc(fx, "2026-09-23");
    await db.insert(notificationRules).values({ kind: "prepaid-evidence", days: 20 });
    await tick([prepaidEvidenceKind], "2026-10-07");
    expect(await rowsOf(fx.pm)).toHaveLength(0);
    await tick([prepaidEvidenceKind], "2026-10-13");
    expect((await rowsOf(fx.pm))[0]?.message).toBe("선결제 증빙 없음 · 가을 팝업 · 무대 제작 · 20일");
  });
});

describe("대리 등록 (N9 · D-716 사건 창)", () => {
  async function proxyFixture(options: { pmRegisters?: boolean; teamCost?: boolean } = {}) {
    const orgUnit = await (await import("@/domain/org")).createOrgUnit(SYSTEM_VIEWER, { name: `대리본부-${randomUUID()}` });
    const team = await (await import("@/domain/org")).createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `대리팀-${randomUUID()}` });
    const visible = ["team.value", "card_usage.value", "card_usage.amount", "project.value", "quote.amount"];
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `대리-${randomUUID().slice(0, 8)}`, workScope: "team" });
    for (const menu of ["cards.proxy"]) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu, action: "write", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
    if (options.pmRegisters) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "write", allowed: true });
    for (const infoItem of visible) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
    const pm = await makePerson("박서연", options.pmRegisters ? role.id : DEFAULT_ROLE_ID, team.name);
    const proxy = options.pmRegisters ? pm : await makePerson("경영관리", role.id, team.name);
    const holder = options.pmRegisters ? await makePerson("카드주인", DEFAULT_ROLE_ID, team.name) : pm;
    const card = await createCorpCard(SYSTEM_VIEWER, { issuer: "카드사", numberLast4: String(Math.floor(1000 + Math.random() * 9000)), label: "개인 카드", kind: "personal", holderUserId: holder.id });
    if (!card.id) throw new Error("카드 id 없음");
    const client = await (await import("@/repositories/vendors")).insertVendor(SYSTEM_VIEWER, { name: `클라이언트-${randomUUID()}`, normalizedName: `클라이언트-${randomUUID()}` });
    const { createProject } = await import("@/domain/projects");
    const project = await createProject(pm, { clientId: client.id, teamId: team.id, pmUserId: pm.id, name: "대리 프로젝트", startDate: "2026-09-01", endDate: "2026-12-31" });
    const { getCurrentQuoteRevision, saveQuoteLines } = await import("@/domain/quotes/lines");
    const { firstSelectableSubcategory } = await import("@/test/support/quote-subcategory");
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("1차 차수 없음");
    const lineId = randomUUID();
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
      rows: [
        {
          id: lineId,
          isNew: true as const,
          subcategory: (await firstSelectableSubcategory()).value,
          itemName: "줄1",
          vendorId: null,
          unitPrice: { currency: "KRW" as const, amount: 1_500_000, fxRate: 1 },
          execution: { currency: "KRW" as const, amount: 1_000_000, fxRate: 1 },
        },
      ],
    });
    const input: CardUsageInput = {
      corpCardId: card.id,
      usedOn: "2026-10-16",
      merchantVendorId: null,
      total: { currency: "KRW", amount: 300_000, fxRate: 1 },
      evidenceTypeCode: "invoice",
      ...(options.teamCost ? { linkKind: "team_cost" as const } : { linkKind: "quote_line" as const, lineId }),
      memo: null,
    };
    const created = await createCardUsage(proxy, input, await precheckCardUsage(proxy, input));
    return { pm, proxy, holder, cardId: card.id, usageId: created.id };
  }

  async function setCreatedAt(usageId: string, iso: string): Promise<void> {
    await db.update(corpCardUsages).set({ createdAt: new Date(iso) }).where(eq(corpCardUsages.id, usageId));
  }

  it("금요일 저녁 대리 등록 → 월요일 tick에 담당 PM 한 건, 다음 tick에 다시 안 나간다", async () => {
    const fx = await proxyFixture();
    await setCreatedAt(fx.usageId, "2026-10-16T19:00:00+09:00");
    await tick([proxyRegisteredKind], "2026-10-19");
    const rows = await rowsOf(fx.pm);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: "card-usage", entityId: fx.usageId });
    expect(rows[0]?.message.startsWith("대리 등록 · 대리 프로젝트 · ")).toBe(true);
    await tick([proxyRegisteredKind], "2026-10-20");
    expect(await rowsOf(fx.pm)).toHaveLength(1);
    expect(await rowsOf(fx.proxy)).toHaveLength(0);
  });

  it("담당 PM이 직접 한 대리 등록은 자기 행동이라 알리지 않는다", async () => {
    const fx = await proxyFixture({ pmRegisters: true });
    await setCreatedAt(fx.usageId, "2026-10-16T19:00:00+09:00");
    await tick([proxyRegisteredKind], "2026-10-19");
    expect(await rowsOf(fx.pm)).toHaveLength(0);
  });

  it("팀 비용 대리 등록은 담당 PM이 없어 카드 보유자에게 알린다(사용자 결정 2026-10-22)", async () => {
    const fx = await proxyFixture({ teamCost: true });
    await setCreatedAt(fx.usageId, "2026-10-16T19:00:00+09:00");
    await tick([proxyRegisteredKind], "2026-10-19");
    const rows = await rowsOf(fx.holder);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: "card-usage", entityId: fx.usageId });
    expect(rows[0]?.message.startsWith("대리 등록 · ")).toBe(true);
    expect(await rowsOf(fx.proxy)).toHaveLength(0);
  });

  it("팀 비용 대리 등록을 카드 보유자가 직접 했으면 알리지 않는다(등록자 제외)", async () => {
    const fx = await proxyFixture({ teamCost: true, pmRegisters: true });
    await setCreatedAt(fx.usageId, "2026-10-16T19:00:00+09:00");
    await db.update(corpCards).set({ holderUserId: fx.proxy.id }).where(eq(corpCards.id, fx.cardId));
    await tick([proxyRegisteredKind], "2026-10-19");
    expect(await db.select().from(notificationLog)).toHaveLength(0);
  });

  it("팀 비용 대리 등록인데 카드에 보유자가 없으면(공용 카드) 아무에게도 알리지 않는다", async () => {
    const fx = await proxyFixture({ teamCost: true });
    await setCreatedAt(fx.usageId, "2026-10-16T19:00:00+09:00");
    await db.update(corpCards).set({ kind: "shared", holderUserId: null, teamId: null }).where(eq(corpCards.id, fx.cardId));
    await tick([proxyRegisteredKind], "2026-10-19");
    expect(await db.select().from(notificationLog)).toHaveLength(0);
  });

  it("15일 전 대리 등록은 0행", async () => {
    const fx = await proxyFixture();
    await setCreatedAt(fx.usageId, "2026-10-05T10:00:00+09:00");
    await tick([proxyRegisteredKind], "2026-10-20");
    expect(await rowsOf(fx.pm)).toHaveLength(0);
  });
});
