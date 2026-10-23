import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { approvalInstances, approvalRoutes, approvalSteps, expenses } from "@/db/schema";
import { approveDocument } from "@/domain/approvals";
import { createExpenseFromLines, saveExpenseDraft, submitExpense } from "@/domain/expenses";
import { gate } from "@/domain/rules/gate";
import { listPaymentTargets, nextUnreviewedTarget, type PaymentTargetList } from "@/domain/payments/targets";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { setupExpenseProject, type ExpenseFixture } from "../fixtures/expenses";
import { createInReviewExpenseFixture, insertLinkFixture, insertRecordFixture } from "../fixtures/evidence";
import { makePaymentManager } from "../fixtures/payments";

// 07-01 Task 2(D-703 · K30 · J11 · B-P2-2 · B-P1-4): 로더(승인 시각 = 지금 차수 acted_at) → 순수 함수 → gate `payment.cutoff` → DTO · 지급 주 묶음.
// 공휴일이 없는 주로 고정: 오늘 2026-08-06(목) · 기준(증빙 작성일) 2026-06-08 + 60 = 2026-08-07(금) · 마감 2026-08-06(목) 14:00 KST.
const TODAY = "2026-08-06";
const kst = (at: string) => new Date(`${at}:00+09:00`);
const AFTER_CUTOFF = kst("2026-08-06T15:00");
const BEFORE_CUTOFF = kst("2026-08-06T10:00");

async function makePayer(): Promise<Viewer> {
  const payer = await makePaymentManager(`지급주-${randomUUID().slice(0, 6)}`);
  if (!payer.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: true });
  return payer;
}

async function instanceOf(instanceId: string): Promise<{ version: number; status: string }> {
  const [row] = await db.select({ version: approvalInstances.version, status: approvalInstances.status }).from(approvalInstances).where(eq(approvalInstances.id, instanceId));
  if (!row) throw new Error("결재 인스턴스 없음");
  return row;
}

// 증빙 기록(issued_on) 붙임으로 제출 → 결재 중 문서. 견적 줄 하나에 지출결의 하나라 문서마다 픽스처 프로젝트를 새로 만든다.
async function inReview(payer: Viewer, issuedOn: string): Promise<{ expenseId: string; instanceId: string; fx: ExpenseFixture }> {
  const fx = await setupExpenseProject();
  const recordId = await insertRecordFixture(payer, { issuedOn });
  return { ...(await createInReviewExpenseFixture(fx, { linkRecordId: recordId, linkedBy: payer.id })), fx };
}

// 결재 통과 + 지금 차수 승인 단계 acted_at을 정확한 KST 시각으로 맞춘다. manual이면 저장 칸에 직접 쓴다(D-740 — 저장값 = 수동 지정).
async function approved(payer: Viewer, input: { issuedOn: string; actedAt: Date; manual?: string }): Promise<string> {
  const doc = await inReview(payer, input.issuedOn);
  const { fx } = doc;
  let { version } = await instanceOf(doc.instanceId);
  for (const approver of [fx.lead, fx.ceo]) version = (await approveDocument(approver, { instanceId: doc.instanceId, expectedVersion: version })).version;
  if ((await instanceOf(doc.instanceId)).status !== "approved") throw new Error("결재 통과 안 됨");
  const routes = await db.select({ id: approvalRoutes.id }).from(approvalRoutes).where(and(eq(approvalRoutes.instanceId, doc.instanceId), eq(approvalRoutes.round, 1)));
  await db.update(approvalSteps).set({ actedAt: input.actedAt }).where(inArray(approvalSteps.routeId, routes.map((route) => route.id)));
  if (input.manual) await db.update(expenses).set({ scheduledPaymentDate: input.manual }).where(eq(expenses.id, doc.expenseId));
  return doc.expenseId;
}

function rowsOf(list: PaymentTargetList) {
  return list.groups.flatMap((group) => group.rows);
}

function rowOf(list: PaymentTargetList, id: string) {
  const row = rowsOf(list).find((candidate) => candidate.id === id);
  if (!row) throw new Error(`행 없음 ${id}`);
  return row;
}

describe("지급 주 묶음 · 마감 gate (07-01 Task 2)", () => {
  it("K30: 마감 정각 승인 → 이번 주 · gate 통과 / +1분 → 다음 주 · cutoff · 마감 지나 밀림(DTO와 gate 일치) / 수동 · 지난 날짜 · 표 밖 해", async () => {
    const payer = await makePayer();
    const onTime = await approved(payer, { issuedOn: "2026-06-08", actedAt: kst("2026-08-06T14:00") });
    const late = await approved(payer, { issuedOn: "2026-06-08", actedAt: kst("2026-08-06T14:01") });
    const manual = await approved(payer, { issuedOn: "2026-06-08", actedAt: kst("2026-08-01T10:00"), manual: "2026-08-12" });
    const past = await approved(payer, { issuedOn: "2026-06-08", actedAt: kst("2026-07-20T10:00"), manual: "2026-08-03" });
    // B-P1-4: 음력 표(2025~2035) 밖 해 — 2024 기준(2025-02-28 → 마감 지나 다음 지급 가능 금요일) · 2035-12-01 + 60 = 2036-01-30(수) → 그 주 앞 금요일(주말만 뺌).
    const old = await approved(payer, { issuedOn: "2024-12-30", actedAt: kst("2026-08-01T10:00") });
    const far = await approved(payer, { issuedOn: "2035-12-01", actedAt: kst("2026-08-01T10:00") });

    const list = await listPaymentTargets(payer, {}, { today: TODAY, now: AFTER_CUTOFF });

    expect(list.groups.map((group) => [group.label, group.tone ?? null, group.rows.map((row) => row.id).sort()])).toEqual([
      ["예정일 지남", "warning", [past]],
      ["이번 주 금 08-07 · 마감 08-06 14:00", null, [onTime, old].sort()],
      ["다음 주 수 08-12 · 마감 08-11 14:00", null, [manual]],
      ["다음 주 금 08-14 · 마감 08-13 14:00", null, [late]],
      ["그 뒤", null, [far]],
    ]);

    expect(rowOf(list, onTime)).toMatchObject({
      scheduledPaymentDate: "2026-08-07",
      autoPaymentDate: "2026-08-07",
      scheduledPaymentManual: false,
      paymentCutoffAt: kst("2026-08-06T14:00").toISOString(),
      paymentPushReason: null,
      paymentScheduleFailed: false,
      paymentCutoffReason: null,
    });
    expect(rowOf(list, late)).toMatchObject({ scheduledPaymentDate: "2026-08-14", paymentPushReason: "cutoff", paymentCutoffReason: "마감 지나 밀림" });
    // 같은 행의 gate 판정과 DTO가 일치(판정 경로 하나 — EXP-12).
    await expect(gate({}, "payment.cutoff", { manual: false, approvedAt: kst("2026-08-06T14:01"), pushReason: rowOf(list, late).paymentPushReason ?? null })).resolves.toEqual({
      allowed: false,
      reason: "마감 지나 밀림",
    });
    expect(rowOf(list, manual)).toMatchObject({ scheduledPaymentDate: "2026-08-12", autoPaymentDate: "2026-08-07", scheduledPaymentManual: true, paymentPushReason: null, paymentCutoffReason: null });
    expect(rowOf(list, past)).toMatchObject({ scheduledPaymentDate: "2026-08-03", scheduledPaymentManual: true });
    expect(rowOf(list, old)).toMatchObject({ scheduledPaymentDate: "2026-08-07", paymentPushReason: "cutoff", paymentCutoffReason: "마감 지나 밀림" });
    expect(rowOf(list, far)).toMatchObject({ scheduledPaymentDate: "2036-01-25", paymentPushReason: null });
    expect(list.total?.count).toBe(6);
  }, 30_000);

  it("결재 중 건은 approvingByWeek에만(합계 · groups 제외) — 지금 승인되면 들어갈 주, 그 뒤 주 건은 싣지 않음", async () => {
    const payer = await makePayer();
    const target = await approved(payer, { issuedOn: "2026-06-08", actedAt: kst("2026-08-05T10:00") });
    const approving = await inReview(payer, "2026-06-08");
    await inReview(payer, "2026-07-20");

    const before = await listPaymentTargets(payer, {}, { today: TODAY, now: BEFORE_CUTOFF });
    expect(rowsOf(before).map((row) => row.id)).toEqual([target]);
    expect(before.total?.count).toBe(1);
    expect(before.approvingByWeek).toHaveLength(1);
    expect(before.approvingByWeek[0]).toMatchObject({ label: "이번 주 금 08-07 · 마감 08-06 14:00", count: 1 });
    expect(before.approvingByWeek[0]?.rows).toEqual([expect.objectContaining({ id: approving.expenseId, status: "결재 중" })]);
    expect(before.approvingByWeek[0]?.sumKrw).toBe(before.approvingByWeek[0]?.rows[0]?.payableKrw ?? 0);

    // 마감(08-06 14:00)이 지난 뒤면 같은 건은 다음 주 칸.
    const after = await listPaymentTargets(payer, {}, { today: TODAY, now: AFTER_CUTOFF });
    expect(after.approvingByWeek.map((week) => [week.label, week.rows.map((row) => row.id)])).toEqual([["다음 주 금 08-14 · 마감 08-13 14:00", [approving.expenseId]]]);
  }, 30_000);

  // 감사 #4(P2): 그 주 그룹이 두 쪽에 걸치면 결재 중 하위 그룹이 쪽마다 되풀이됐다 — 그 주 그룹이 실제로 끝나는 쪽 하나(그룹이 없으면 첫 쪽)를 서버가 정한다.
  it("결재 중 하위 그룹이 설 쪽(page) — 그 주 그룹의 마지막 행이 있는 쪽 · 그 주 지급 대상이 없으면 1쪽, 어느 쪽을 읽어도 같다", async () => {
    const payer = await makePayer();
    await approved(payer, { issuedOn: "2026-06-08", actedAt: kst("2026-08-05T10:00") });
    await approved(payer, { issuedOn: "2026-06-08", actedAt: kst("2026-08-05T11:00") });
    await inReview(payer, "2026-06-08");
    await inReview(payer, "2026-06-15");

    const first = await listPaymentTargets(payer, { page: 1 }, { today: TODAY, now: BEFORE_CUTOFF, pageSize: 1 });
    const second = await listPaymentTargets(payer, { page: 2 }, { today: TODAY, now: BEFORE_CUTOFF, pageSize: 1 });
    expect(first.page.pageCount).toBe(2);
    const expected = [
      ["이번 주 금 08-07 · 마감 08-06 14:00", 2],
      ["다음 주 금 08-14 · 마감 08-13 14:00", 1],
    ];
    expect(first.approvingByWeek.map((week) => [week.label, week.page])).toEqual(expected);
    expect(second.approvingByWeek.map((week) => [week.label, week.page])).toEqual(expected);
  }, 30_000);

  it("「다음 확인 전」은 유효 예정일 순서를 따른다(저장 칸 순서 아님 — B-P2-2)", async () => {
    const payer = await makePayer();
    await approved(payer, { issuedOn: "2026-06-08", actedAt: kst("2026-08-05T10:00") });
    await approved(payer, { issuedOn: "2026-06-08", actedAt: kst("2026-08-06T14:01") });
    await approved(payer, { issuedOn: "2026-06-08", actedAt: kst("2026-08-01T10:00"), manual: "2026-08-12" });
    const past = await approved(payer, { issuedOn: "2026-06-08", actedAt: kst("2026-07-20T10:00"), manual: "2026-08-03" });
    const deps = { today: TODAY, now: AFTER_CUTOFF };

    const order = rowsOf(await listPaymentTargets(payer, {}, deps)).map((row) => row.id);
    expect(order[0]).toBe(past);
    for (let index = 0; index < order.length - 1; index += 1) {
      const next = await nextUnreviewedTarget(payer, { afterExpenseId: order[index] ?? "" }, deps);
      expect(next?.id).toBe(order[index + 1]);
    }
    expect(await nextUnreviewedTarget(payer, { afterExpenseId: order.at(-1) ?? "" }, deps)).toBeNull();
  }, 30_000);

  it("수동 지정일이 기준일 · 오늘보다 몇 해 뒤여도 그 해 공휴일을 읽어 수동 값 그대로(예정일 계산 실패 아님 — D-742)", async () => {
    const payer = await makePayer();
    const manual = await approved(payer, { issuedOn: "2026-06-08", actedAt: kst("2026-08-01T10:00"), manual: "2029-08-10" });

    const list = await listPaymentTargets(payer, {}, { today: TODAY, now: AFTER_CUTOFF });
    expect(rowOf(list, manual)).toMatchObject({
      scheduledPaymentDate: "2029-08-10",
      scheduledPaymentManual: true,
      paymentScheduleFailed: false,
      paymentCutoffAt: kst("2029-08-09T14:00").toISOString(),
      paymentCutoffReason: null,
    });
  }, 30_000);

  it("D-742 · NB P1-2: 작성자가 저장한 날짜(이번 주 금)는 수동 면제를 받지 못한다 — 마감 뒤 승인 → cutoff · 마감 지나 밀림", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    // 07-16(D-714 · B-P1-1): 작성자 입력에는 지급 예정일 키가 없다 — 실어 보내면 거부되고(strict), 저장 칸에 날짜를 둘 길이 없다.
    const authorDate: Record<string, unknown> = { scheduledPaymentDate: "2026-08-07" };
    await expect(createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor], fields: authorDate })).rejects.toThrow();
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = created.created[0]?.expenseId ?? "";
    const [draft] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
    await expect(saveExpenseDraft(fx.pm, { expenseId, expectedVersion: draft?.version ?? 0, fields: authorDate })).rejects.toThrow();
    const saved = { version: draft?.version ?? 0 };
    await insertLinkFixture({ recordId: await insertRecordFixture(payer, { issuedOn: "2026-06-08" }), ownerId: expenseId, attachedBy: payer.id });
    const submitted = await submitExpense(fx.pm, { expenseId, expectedVersion: saved.version });
    if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
    let { version } = await instanceOf(submitted.instanceId);
    for (const approver of [fx.lead, fx.ceo]) version = (await approveDocument(approver, { instanceId: submitted.instanceId, expectedVersion: version })).version;
    const routes = await db.select({ id: approvalRoutes.id }).from(approvalRoutes).where(eq(approvalRoutes.instanceId, submitted.instanceId));
    await db.update(approvalSteps).set({ actedAt: kst("2026-08-06T14:01") }).where(inArray(approvalSteps.routeId, routes.map((route) => route.id)));

    const list = await listPaymentTargets(payer, {}, { today: TODAY, now: AFTER_CUTOFF });
    expect(rowOf(list, expenseId)).toMatchObject({
      scheduledPaymentDate: "2026-08-14",
      scheduledPaymentManual: false,
      paymentPushReason: "cutoff",
      paymentCutoffReason: "마감 지나 밀림",
    });
  }, 30_000);
});
