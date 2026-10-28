import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { approvalInstances, approvalRoutes, approvalSteps, expensePayments, expenses, vendors } from "@/db/schema";
import { approveDocument } from "@/domain/approvals";
import { createExpenseFromLines, getExpense, previewExpense, saveExpenseDraft, submitExpense } from "@/domain/expenses";
import { computeExpenseTax } from "@/domain/expenses/tax";
import { loadKindDetails } from "@/domain/approvals";
import { completeExpensePayment, previewPayable } from "@/domain/payments";
import { confirmEvidence } from "@/domain/evidence-reviews";
import { listPaymentTargets } from "@/domain/payments/targets";
import { listPhase6NextTurnItems } from "@/domain/next-turn/phase6-items";
import { addHistorizedValue, cancelHistorizedValue } from "@/domain/settings/registry";
import { TAX_VAT_RATE } from "@/domain/settings/keys";
import { visible } from "@/domain/permissions/visible";
import { seedCodeItem } from "@/repositories/code-tables";
import { seoulToday } from "@/lib/dates";
import { addDays } from "@/lib/kst-date";
import { loadHolidayLookup } from "@/domain/holidays/calendar";
import { payRuleLine, resolvePaySchedule } from "@/domain/payments/pay-schedule";
import { loadPayScheduleConfig } from "@/domain/payments/pay-schedule-load";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "../fixtures/expenses";
import { createDraftExpenseFixture, createInReviewExpenseFixture, insertLinkFixture, insertRecordFixture } from "../fixtures/evidence";
import { makePaymentManager } from "../fixtures/payments";

// 07-06(D-715 · D-714 · D-740 · D-742): 지출결의 DTO의 지급 예정일 = 유효 예정일(수동 ?? 자동). 자동값은 어떤 저장으로도 칸에 굳지 않는다.
// 공휴일이 없는 주로 고정: 기준(증빙 작성일) 2026-06-08 + 60 = 2026-08-07(금) · 승인 2026-08-01 10:00 → 마감 2026-08-06(목) 14:00 안 → 밀림 없음.
const kst = (at: string) => new Date(`${at}:00+09:00`);

async function makePayer(): Promise<Viewer> {
  const payer = await makePaymentManager(`유효일-${randomUUID().slice(0, 6)}`);
  if (!payer.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: true });
  return payer;
}

async function columnsOf(expenseId: string) {
  const [row] = await db
    .select({ date: expenses.scheduledPaymentDate, setBy: expenses.scheduledPaymentSetBy, setAt: expenses.scheduledPaymentSetAt, version: expenses.version })
    .from(expenses)
    .where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row;
}

// 결재 통과 + 지금 차수 승인 단계 acted_at 고정. manual이면 저장 칸에 직접(D-740 — 기록 칸 없는 기존 값 = 수동 지정).
async function approved(payer: Viewer, input: { issuedOn: string; actedAt: Date; manual?: string; fx?: ExpenseFixture }): Promise<{ expenseId: string; fx: ExpenseFixture }> {
  const fx = input.fx ?? (await setupExpenseProject());
  const doc = await createInReviewExpenseFixture(fx, { linkRecordId: await insertRecordFixture(payer, { issuedOn: input.issuedOn }), linkedBy: payer.id });
  const [instance] = await db.select({ version: approvalInstances.version }).from(approvalInstances).where(eq(approvalInstances.id, doc.instanceId));
  let version = instance?.version ?? 0;
  for (const approver of [fx.lead, fx.ceo]) version = (await approveDocument(approver, { instanceId: doc.instanceId, expectedVersion: version })).version;
  const routes = await db.select({ id: approvalRoutes.id }).from(approvalRoutes).where(and(eq(approvalRoutes.instanceId, doc.instanceId), eq(approvalRoutes.round, 1)));
  await db.update(approvalSteps).set({ actedAt: input.actedAt }).where(inArray(approvalSteps.routeId, routes.map((route) => route.id)));
  if (input.manual) await db.update(expenses).set({ scheduledPaymentDate: input.manual }).where(eq(expenses.id, doc.expenseId));
  return { expenseId: doc.expenseId, fx };
}

describe("07-06 Task 1 — 상세 DTO 유효 예정일 (D-715 · D-714)", () => {
  it("B-P1-1: 상세 DTO의 유효 예정일을 그대로 되돌려 보내는 임시 저장 · 제출 뒤에도 칸은 NULL이고 DTO는 여전히 자동값", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const expenseId = await createDraftExpenseFixture(fx);
    await insertLinkFixture({ recordId: await insertRecordFixture(payer, { issuedOn: "2026-10-12" }), ownerId: expenseId, attachedBy: fx.pm.id });

    const first = await getExpense(fx.pm, { expenseId });
    expect(first?.scheduledPaymentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(first?.scheduledPaymentManual).toBe(false);

    const { version } = await columnsOf(expenseId);
    // 07-16(D-714): 작성자 입력에는 지급 예정일 키가 없다 — 되돌려 보낼 길 자체가 없어 저장은 다른 칸만 싣는다.
    await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: version, fields: { note: "왕복" } });
    expect(await columnsOf(expenseId)).toMatchObject({ date: null, setBy: null, setAt: null });
    const again = await getExpense(fx.pm, { expenseId });
    expect(again).toMatchObject({ scheduledPaymentDate: first?.scheduledPaymentDate, scheduledPaymentManual: false, note: "왕복" });

    const submitted = await submitExpense(fx.pm, { expenseId, expectedVersion: (await columnsOf(expenseId)).version });
    expect(submitted.kind).toBe("submitted");
    expect(await columnsOf(expenseId)).toMatchObject({ date: null, setBy: null, setAt: null });
  }, 30_000);

  it("상세 DTO가 자동 예정일 · 밀림 사유 · 규칙 줄(07-01 payRuleLine 결과)을 싣는다", async () => {
    const payer = await makePayer();
    const { expenseId } = await approved(payer, { issuedOn: "2026-06-08", actedAt: kst("2026-08-01T10:00") });
    const cfg = await loadPayScheduleConfig();
    const lookup = await loadHolidayLookup([2026, 2027]);
    const expected = resolvePaySchedule({ baseDate: "2026-06-08", termDays: cfg.termDays, manualDate: null, approvedAt: kst("2026-08-01T10:00"), now: new Date(), lookup, cfg });
    expect(expected.payDate).toBe("2026-08-07");

    const doc = await getExpense(payer, { expenseId });
    expect(doc).toMatchObject({
      scheduledPaymentDate: "2026-08-07",
      scheduledPaymentManual: false,
      autoPaymentDate: "2026-08-07",
      paymentPushReason: null,
      paymentRuleLine: payRuleLine(expected, cfg.termDays, cfg),
      paymentOffWeekday: null,
    });
    expect(await columnsOf(expenseId)).toMatchObject({ date: null });
  }, 30_000);

  it("수동 지정 날짜의 요일이 설정 지급 요일과 다를 때만 `{요일}요일 아님`(C6 — 자동 · 지급 요일 수동은 null)", async () => {
    const payer = await makePayer();
    const cfg = await loadPayScheduleConfig();
    expect(cfg.payWeekday).toBe("fri");
    const thursday = await approved(payer, { issuedOn: "2026-06-08", actedAt: kst("2026-08-01T10:00"), manual: "2026-08-06" });
    const friday = await approved(payer, { issuedOn: "2026-06-08", actedAt: kst("2026-08-01T10:00"), manual: "2026-08-07" });

    expect(await getExpense(payer, { expenseId: thursday.expenseId })).toMatchObject({
      scheduledPaymentDate: "2026-08-06",
      scheduledPaymentManual: true,
      autoPaymentDate: "2026-08-07",
      paymentRuleLine: "결재 마감 면제",
      paymentOffWeekday: "금요일 아님",
    });
    expect(await getExpense(payer, { expenseId: friday.expenseId })).toMatchObject({ scheduledPaymentManual: true, paymentOffWeekday: null });
  }, 60_000);
});

async function approveAll(fx: ExpenseFixture, instanceId: string): Promise<void> {
  const [instance] = await db.select({ version: approvalInstances.version }).from(approvalInstances).where(eq(approvalInstances.id, instanceId));
  let version = instance?.version ?? 0;
  for (const approver of [fx.lead, fx.ceo]) version = (await approveDocument(approver, { instanceId, expectedVersion: version })).version;
}

describe("07-06 Task 2 — 세금 기준일 · 홈 지급 묶음 = 유효 예정일 (P1 · B-P1-3)", () => {
  it("기준일 「지급 예정일」 규칙: 세율이 바뀌는 날을 사이에 둬도 제출 스냅숏 · 미리보기 · 상세 · 결재 시트 · 지급 대상이 모두 유효 예정일 세율(오늘 기준과 다름)", async () => {
    const payer = await makePayer();
    const evidenceType = `t0706_${randomUUID().slice(0, 8)}`;
    await seedCodeItem(SYSTEM_VIEWER, {
      tableKey: "evidence_type",
      value: evidenceType,
      label: `예정일 부가세 ${evidenceType}`,
      sortOrder: 99,
      taxRule: { ruleKind: "vat_surcharge", roundingUnit: 1, roundingMethod: "round", minWithholdingAmount: 0, basisDate: "scheduled_payment_date" },
    });
    const fx = await setupExpenseProject();
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = created.created[0]?.expenseId;
    if (!expenseId) throw new Error("작성 중 문서 없음");
    await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: 1, fields: { evidenceType } });
    await insertLinkFixture({ recordId: await insertRecordFixture(payer, { issuedOn: addDays(seoulToday(), -10) }), ownerId: expenseId, attachedBy: fx.pm.id });
    const effective = (await getExpense(fx.pm, { expenseId }))?.scheduledPaymentDate;
    if (!effective || effective <= seoulToday()) throw new Error(`유효 예정일이 미래가 아님: ${effective}`);

    // 유효 예정일부터 17%(오늘은 그 전 세율). 공급가 12,400,000 → 부가세 2,108,000 · 지급 총액 14,508,000.
    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: effective, value: 0.17 });
    try {
      const preview = await previewExpense(fx.pm, { expenseId, fields: {} });
      expect(preview.taxLine?.text).toContain("지급 총액 14,508,000");

      const submitted = await submitReadyDraft(fx.pm, expenseId);
      if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
      const [snapshot] = await db.select().from(expenses).where(eq(expenses.id, expenseId));
      expect(snapshot).toMatchObject({ taxRate: "0.170000", vatKrw: 2_108_000, payableKrw: 14_508_000, scheduledPaymentDate: null });
      if (!snapshot) throw new Error("행 없음");
      const todayBased = await computeExpenseTax(fx.pm, { ...snapshot, scheduledPaymentDate: null });
      if (todayBased.unavailable) throw new Error("오늘 기준 계산 불가");
      expect(todayBased.payableKrw).not.toBe(14_508_000);

      await approveAll(fx, submitted.instanceId);
      const doc = await getExpense(payer, { expenseId });
      expect(doc?.scheduledPaymentDate).toBe(effective);
      expect(doc?.taxLine?.text).toContain("지급 총액 14,508,000");
      expect(doc?.taxDrift).toBeNull();

      const sheet = (await loadKindDetails(payer, "expense", [expenseId], { visible })).get(expenseId);
      const supplyRows = sheet?.rows.filter((row) => row.label === "공급가액") ?? [];
      expect(supplyRows.filter((row) => row.tone === "warning")).toEqual([]);
      expect(supplyRows.some((row) => row.value.includes("지급 총액 14,508,000"))).toBe(true);
      expect(sheet?.rows.find((row) => row.label === "지급 예정일")?.value).toBe(effective);

      const targets = await listPaymentTargets(payer, {}, { pageSize: 10_000 });
      expect(targets.groups.flatMap((group) => group.rows).find((row) => row.id === expenseId)).toMatchObject({ scheduledPaymentDate: effective, payableKrw: 14_508_000 });

      // Task 3(P1 짝): 지급 처리 미리보기 · 잠금 뒤 판정도 유효 예정일 세율 — 오늘 지급해도 지급 총액은 승인 스냅숏과 같다.
      expect((await previewPayable(payer, { expenseId, payDate: seoulToday() })).payableKrw).toBe(14_508_000);
      const confirmed = await confirmEvidence(payer, { expenseId, version: (await columnsOf(expenseId)).version });
      await completeExpensePayment(payer, { expenseId, expectedPayableKrw: 14_508_000, version: confirmed.version });
      const [payment] = await db.select({ payableKrw: expensePayments.payableKrw }).from(expensePayments).where(eq(expensePayments.expenseId, expenseId));
      expect(payment?.payableKrw).toBe(14_508_000);
      expect(await columnsOf(expenseId)).toMatchObject({ date: null, setBy: null, setAt: null });
    } finally {
      await cancelHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, effective);
    }
  }, 60_000);

  it("거래처 지급 기한(J5): 협력사 기한 30일이면 자동 예정일 · 규칙 줄 N이 30, 칸이 비면 회사 기본", async () => {
    const payer = await makePayer();
    const cfg = await loadPayScheduleConfig();
    const vendorOf = async (paymentTermDays: number | null) => {
      const name = `기한-${randomUUID()}`;
      const [row] = await db.insert(vendors).values({ name, normalizedName: name, kind: "supplier", paymentTermDays }).returning({ id: vendors.id });
      if (!row) throw new Error("거래처 없음");
      return row.id;
    };
    // 기준 2026-06-08 + 30 = 07-08(수) → 그 이하 마지막 금요일 07-03 · 승인 06-10이라 밀림 없음.
    const termed = await approved(payer, { issuedOn: "2026-06-08", actedAt: kst("2026-06-10T10:00") });
    const blank = await approved(payer, { issuedOn: "2026-06-08", actedAt: kst("2026-06-10T10:00") });
    await db.update(expenses).set({ vendorId: await vendorOf(30), payeeUserId: null }).where(eq(expenses.id, termed.expenseId));
    await db.update(expenses).set({ vendorId: await vendorOf(null), payeeUserId: null }).where(eq(expenses.id, blank.expenseId));

    const termedDoc = await getExpense(payer, { expenseId: termed.expenseId });
    expect(termedDoc).toMatchObject({ scheduledPaymentDate: "2026-07-03", autoPaymentDate: "2026-07-03", scheduledPaymentManual: false });
    expect(termedDoc?.paymentRuleLine).toContain("기한 30일 안");
    const blankDoc = await getExpense(payer, { expenseId: blank.expenseId });
    expect(blankDoc).toMatchObject({ scheduledPaymentDate: "2026-08-07", autoPaymentDate: "2026-08-07" });
    expect(blankDoc?.paymentRuleLine).toContain(`기한 ${cfg.termDays}일 안`);
    for (const id of [termed.expenseId, blank.expenseId]) expect(await columnsOf(id)).toMatchObject({ date: null, setBy: null, setAt: null });
  }, 30_000);

  it("홈 「내 차례」 지급 묶음이 예정일을 적지 않은 승인 건을 유효 예정일로 센다(지남 · 오늘)", async () => {
    const payer = await makePayer();
    const count = async () => {
      const entry = (await listPhase6NextTurnItems(payer, seoulToday())).find((item) => item.key === "phase6-payment");
      const match = entry && entry.reason.startsWith("예정일 지남·오늘") ? /^지급 (\d+)건$/.exec(entry.label) : null;
      return match ? Number(match[1]) : 0;
    };
    const before = await count();
    await approved(payer, { issuedOn: "2026-06-08", actedAt: kst("2026-08-01T10:00") });
    expect(await count()).toBe(before + 1);
  }, 60_000);
});
