import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { expenseEvidenceReviews, expensePayments, expenses, files } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { ForbiddenError } from "@/domain/permissions/can";
import { completeExpensePayment, PayableChangedError, PaymentConflictError, previewPayable, saveScheduledPayDate } from "@/domain/payments";
import { BATCH_ROW_FAILED, batchRowOutcome, completePaymentsBatch } from "@/domain/payments/batch";
import { listPaymentTargets, parsePaymentEvidenceFilter, PAYMENT_EVIDENCE_FILTERS } from "@/domain/payments/targets";
import { EVIDENCE_UNCONFIRMED } from "@/domain/payments/action-row";
import { GateBlockedError } from "@/domain/rules/gate";
import { confirmEvidence } from "@/domain/evidence-reviews";
import { voidEvidence } from "@/domain/evidence";
import { approveDocument } from "@/domain/approvals";
import { createExpenseFromLines } from "@/domain/expenses";
import { loadTaxRates } from "@/domain/money/tax";
import { addHistorizedValue } from "@/domain/settings/registry";
import { PAYMENT_METHOD_EVIDENCE_PAIRS, TAX_VAT_RATE } from "@/domain/settings/keys";
import { seedCodeItem } from "@/repositories/code-tables";
import { upsertSimpleValue } from "@/repositories/settings";
import { insertVendor } from "@/repositories/vendors";
import { seoulToday } from "@/lib/dates";
import { addApprovedRevision, attachEvidence, makeEvidenceManager, setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";
import { approvedExpenseWithEvidence, approvedExpenseWithoutEvidence, makePaymentManager, setEvidenceRequired, type ApprovedExpense } from "./fixtures/payments";

// 06-15(EXP-09 · EXP-06 · AS1 · D-604) — 지급 대상 목록(S1)과 건별 트랜잭션 일괄 지급(S2). 통과를 기대하는 문서는 06-03 · 06-04처럼
// 증빙 0 · evidence.required = false로 만든다(P4). setup.ts가 매 테스트 전 TRUNCATE + 시드로 설정을 기본값으로 되돌린다.

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

beforeEach(async () => {
  await setEvidenceRequired(false);
});

async function makePayer(name?: string): Promise<Viewer> {
  const payer = await makePaymentManager(name);
  if (!payer.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: true });
  return payer;
}

async function livePayments(expenseId: string) {
  return db
    .select()
    .from(expensePayments)
    .where(and(eq(expensePayments.expenseId, expenseId), isNull(expensePayments.cancelledAt)));
}

async function payableNow(payer: Viewer, doc: ApprovedExpense, payDate = seoulToday()): Promise<number> {
  const preview = await previewPayable(payer, { expenseId: doc.expenseId, payDate });
  if (preview.payableKrw === undefined || preview.payableKrw === null) throw new Error("지급 총액을 셈할 수 없는 문서");
  return preview.payableKrw;
}

async function twoPayable(): Promise<{ fx: ExpenseFixture; a: ApprovedExpense; b: ApprovedExpense }> {
  const fx = await setupExpenseProject();
  const a = await approvedExpenseWithoutEvidence(fx, fx.lines.withVendor);
  const b = await approvedExpenseWithoutEvidence(fx, fx.lines.split);
  return { fx, a, b };
}

function rowsOf(list: Awaited<ReturnType<typeof listPaymentTargets>>) {
  return list.groups.flatMap((group) => group.rows);
}

describe("트레이서 (06-15 Task 1)", () => {
  it("지급 권한자의 지급 대상 = 결재 통과 · 지급 전 · 종결 아님 행만, 행마다 selectable · payableKrw · version / 지급 권한 없음 → ForbiddenError", async () => {
    const payer = await makePayer();
    const { fx, a, b } = await twoPayable();

    const list = await listPaymentTargets(payer, {});
    const rows = rowsOf(list);
    expect(rows.map((row) => row.id).sort()).toEqual([a.expenseId, b.expenseId].sort());
    for (const doc of [a, b]) {
      const row = rows.find((candidate) => candidate.id === doc.expenseId);
      expect(row?.selectable).toBe(true);
      expect(row?.reason).toBeNull();
      expect(row?.version).toBe(doc.version);
      expect(row?.payableKrw).toBe(await payableNow(payer, doc));
    }
    expect(list.total?.count).toBe(2);

    await expect(listPaymentTargets(fx.pm, {})).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("completePaymentsBatch — 두 스냅숏을 건마다 처리해 살아 있는 지급 기록이 하나씩 · 결과 processed 2 · blocked 없음", async () => {
    const payer = await makePayer();
    const { a, b } = await twoPayable();
    const rows = await Promise.all(
      [a, b].map(async (doc) => ({ expenseId: doc.expenseId, expenseVersion: doc.version, expectedPayableKrw: await payableNow(payer, doc) })),
    );

    const result = await completePaymentsBatch(payer, { payDate: seoulToday(), rows });
    expect(result.processed).toBe(2);
    expect(result.blocked).toEqual([]);
    expect(await livePayments(a.expenseId)).toHaveLength(1);
    expect(await livePayments(b.expenseId)).toHaveLength(1);
    expect(rowsOf(await listPaymentTargets(payer, {}))).toHaveLength(0);
  });
});

// ── Task 2 도우미 ──────────────────────────────────────────────────────

function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

async function versionOf(expenseId: string): Promise<number> {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row.version;
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

// 「무대 제작」과 같은 거래처(세금계산서)로 줄 n개를 2차에 더해 결재 통과 · 증빙 0(P4) 문서 n건을 만든다.
async function extraLines(fx: ExpenseFixture, count: number, vendorId: string = fx.stageOneId): Promise<string[]> {
  const names = Array.from({ length: count }, (_, index) => `추가 줄 ${index + 1}-${randomUUID().slice(0, 4)}`);
  const { lineIds } = await addApprovedRevision(
    fx,
    names.map((itemName, index) => ({ itemName, vendorId, execution: { currency: "KRW" as const, amount: 1_000_000 + index * 10_000, fxRate: 1 } })),
  );
  return names.map((name) => {
    const id = lineIds.get(name);
    if (!id) throw new Error(`줄 없음: ${name}`);
    return id;
  });
}

// 줄 묶음 → 결재 통과 문서들(한 번에 만들고 제출 · 승인). withEvidence가 거짓이면 증빙을 무효 처리해 증빙 0.
async function approvedMany(fx: ExpenseFixture, lineIds: readonly string[], withEvidence: boolean): Promise<ApprovedExpense[]> {
  const created = await createExpenseFromLines(fx.pm, { lineIds: [...lineIds] });
  const voider = withEvidence ? null : await makeEvidenceManager("증빙무효", { attach: false, void: true });
  const docs: ApprovedExpense[] = [];
  for (const item of created.created) {
    const submitted = await submitReadyDraft(fx.pm, item.expenseId);
    if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
    const first = await approveDocument(fx.lead, { instanceId: submitted.instanceId, expectedVersion: submitted.version });
    await approveDocument(fx.ceo, { instanceId: submitted.instanceId, expectedVersion: first.version });
    if (voider) {
      const alive = await db
        .select({ id: files.id })
        .from(files)
        .where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, item.expenseId), isNull(files.removedAt), isNull(files.voidedAt)));
      for (const file of alive) await voidEvidence(voider, { fileId: file.id, reason: "다른 건 영수증" });
    }
    docs.push({ expenseId: item.expenseId, instanceId: submitted.instanceId, number: submitted.number, version: await versionOf(item.expenseId) });
  }
  return docs;
}

async function snapshotOf(payer: Viewer, doc: ApprovedExpense, payDate = seoulToday()) {
  return { expenseId: doc.expenseId, expenseVersion: await versionOf(doc.expenseId), expectedPayableKrw: await payableNow(payer, doc, payDate) };
}

// 테스트 준비 전용 — 기안자 입력(06-10)이 있는 문서처럼 증빙 금액을 이 문서 행에만 적는다(version 그대로, evidence-release 전례).
async function withEvidenceAmount(doc: ApprovedExpense, amountKrw: number): Promise<ApprovedExpense> {
  await db.update(expenses).set({ evidenceAmount: amountKrw, evidenceDate: seoulToday() }).where(eq(expenses.id, doc.expenseId));
  return doc;
}

// 지급일 기준 부가세 증빙 종류(기준일 = 지급일 / 지급 예정일) — 세율이 바뀌는 날짜를 테스트가 고른다(06-04 전례).
async function vatEvidenceType(value: string, basisDate: "payment_date" | "scheduled_payment_date"): Promise<string> {
  await seedCodeItem(SYSTEM_VIEWER, {
    tableKey: "evidence_type",
    value,
    label: value,
    sortOrder: 99,
    taxRule: { ruleKind: "vat_surcharge", roundingUnit: 1, roundingMethod: "round", minWithholdingAmount: 0, basisDate },
  });
  return value;
}

function countingLoadTaxRates() {
  const calls: string[] = [];
  const load: typeof loadTaxRates = (asOf) => {
    calls.push(asOf);
    return loadTaxRates(asOf);
  };
  return { calls, load };
}

describe("순수", () => {
  it("오류 → 행 결과 표 — 게이트 이유 · 동시성 문구 · 지급일 세율(새 지급 총액) · 모르는 오류는 한 문구", () => {
    expect(batchRowOutcome(new GateBlockedError("증빙 없음 · 기안자 박서연"))).toEqual({ reason: "증빙 없음 · 기안자 박서연", newPayableKrw: null });
    expect(batchRowOutcome(new PaymentConflictError("다른 사람이 14:01에 바꿈 · 새로 고침"))).toEqual({ reason: "다른 사람이 14:01에 바꿈 · 새로 고침", newPayableKrw: null });
    expect(batchRowOutcome(new PayableChangedError(13_640_000, "2026-09-19"))).toEqual({ reason: "지급일 09-19 기준 지급 총액 바뀜 · 이체액 확인", newPayableKrw: 13_640_000 });
    expect(batchRowOutcome(new Error("relation does not exist"))).toEqual({ reason: BATCH_ROW_FAILED, newPayableKrw: null });
    expect(BATCH_ROW_FAILED).toBe("처리 실패 · 새로 고침");
  });

  it("증빙 필터 — unreviewed = P2 · missing = P3 · payable = P4, 모르는 값은 필터 없음", () => {
    expect(parsePaymentEvidenceFilter("unreviewed")).toBe("unreviewed");
    expect(PAYMENT_EVIDENCE_FILTERS.map((filter) => [filter.value, filter.row, filter.label])).toEqual([
      ["unreviewed", "P2", "확인 전"],
      ["missing", "P3", "증빙 없음"],
      ["payable", "P4", "지급 가능"],
    ]);
    expect(parsePaymentEvidenceFilter("all")).toBeNull();
    expect(parsePaymentEvidenceFilter(undefined)).toBeNull();
  });
});

describe("막힘 · 재판정 · 스냅숏 (06-15 Task 2)", () => {
  it("부분 성공 — 세 건 중 B를 다른 사람이 먼저 지급하면 A · C는 처리되고 B는 `이미 지급됨 · {사람} · {시:분} · 새로 고침` · selectable false", async () => {
    const payer = await makePayer();
    const other = await makePayer("다른경영");
    const fx = await setupExpenseProject();
    const [a, b, c] = await approvedMany(fx, await extraLines(fx, 3), false);
    if (!a || !b || !c) throw new Error("문서 셋이 필요하다");
    const rows = [await snapshotOf(payer, a), await snapshotOf(payer, b), await snapshotOf(payer, c)];
    await completeExpensePayment(other, { expenseId: b.expenseId, expectedPayableKrw: rows[1]?.expectedPayableKrw ?? 0, version: b.version });

    const result = await completePaymentsBatch(payer, { payDate: seoulToday(), rows });
    expect(result.processedIds.sort()).toEqual([a.expenseId, c.expenseId].sort());
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0]).toMatchObject({ expenseId: b.expenseId, selectable: false, selectableReason: "지급 완료" });
    expect(result.blocked[0]?.reason).toMatch(/^이미 지급됨 · 다른경영\S* · \d{2}:\d{2} · 새로 고침$/);
    expect(await livePayments(b.expenseId)).toHaveLength(1);
  });

  it("막힌 행 고를 수 있음 재판정 — 확인 기록이 지워진 B는 selectable false, 지급일 세율로 지급 총액만 바뀐 C는 selectable true + newPayableKrw", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const b = await withEvidenceAmount(await approvedExpenseWithEvidence(fx, fx.lines.withVendor), 12_400_000);
    await confirmEvidence(payer, { expenseId: b.expenseId, version: b.version });
    const c = await approvedExpenseWithoutEvidence(fx, fx.lines.split);
    const today = seoulToday();
    const payDate = addDays(today, 40);
    await db.update(expenses).set({ evidenceType: await vatEvidenceType("test_vat_paydate", "payment_date") }).where(eq(expenses.id, c.expenseId));
    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: addDays(today, 30), value: 0.12 });
    // 화면이 오늘 기준으로 본 지급 총액(목록 값)을 들고, 고른 지급일은 세율이 바뀐 뒤.
    const rows = [await snapshotOf(payer, b), await snapshotOf(payer, c)];
    await attachEvidence(fx.pm, b.expenseId);

    const result = await completePaymentsBatch(payer, { payDate, rows });
    expect(result.processed).toBe(0);
    const blockedB = result.blocked.find((row) => row.expenseId === b.expenseId);
    const blockedC = result.blocked.find((row) => row.expenseId === c.expenseId);
    expect(blockedB).toMatchObject({ selectable: false, selectableReason: EVIDENCE_UNCONFIRMED });
    expect(blockedB?.reason).toMatch(/^다른 사람이 \d{2}:\d{2}에 바꿈 · 새로 고침$/);
    expect(blockedC).toMatchObject({ selectable: true, reason: `지급일 ${payDate.slice(5)} 기준 지급 총액 바뀜 · 이체액 확인` });
    expect(blockedC?.newPayableKrw).toBe(await payableNow(payer, c, payDate));
    expect(blockedC?.newPayableKrw).not.toBe(rows[1]?.expectedPayableKrw);
  });

  it("C4 확인 기록 있음 — `확인됨` 문서에 기안자가 증빙을 더하면 확인 기록 지움 · version + 1 → 옛 스냅숏은 동시성 막힘 · 지급 0건 · selectable false(P2)", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(fx), 12_400_000);
    const confirmed = await confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version });
    const row = await snapshotOf(payer, doc);
    expect(row.expenseVersion).toBe(confirmed.version);

    await attachEvidence(fx.pm, doc.expenseId);
    expect(await db.select().from(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, doc.expenseId))).toHaveLength(0);
    expect(await versionOf(doc.expenseId)).toBe(confirmed.version + 1);

    const result = await completePaymentsBatch(payer, { payDate: seoulToday(), rows: [row] });
    expect(result.processed).toBe(0);
    expect(result.blocked[0]).toMatchObject({ expenseId: doc.expenseId, selectable: false, selectableReason: EVIDENCE_UNCONFIRMED });
    expect(result.blocked[0]?.reason).toMatch(/^다른 사람이 \d{2}:\d{2}에 바꿈 · 새로 고침$/);
    expect(await livePayments(doc.expenseId)).toHaveLength(0);
  });

  it("C4 확인 기록 없음 — 증빙 필수 off · 증빙 0인 P4 문서에 기안자가 증빙을 더하면 version + 1 → 옛 스냅숏 동시성 막힘 · 지급 0건 · selectable false · 다시 받은 목록 P2", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithoutEvidence(fx);
    const row = await snapshotOf(payer, doc);
    expect(rowsOf(await listPaymentTargets(payer, {}))[0]).toMatchObject({ id: doc.expenseId, selectable: true });

    await attachEvidence(fx.pm, doc.expenseId);
    expect(await versionOf(doc.expenseId)).toBe(row.expenseVersion + 1);

    const result = await completePaymentsBatch(payer, { payDate: seoulToday(), rows: [row] });
    expect(result.processed).toBe(0);
    expect(result.blocked[0]?.reason).toMatch(/^다른 사람이 \d{2}:\d{2}에 바꿈 · 새로 고침$/);
    expect(result.blocked[0]).toMatchObject({ selectable: false, selectableReason: EVIDENCE_UNCONFIRMED });
    expect(await livePayments(doc.expenseId)).toHaveLength(0);
    expect(rowsOf(await listPaymentTargets(payer, {}))[0]).toMatchObject({ id: doc.expenseId, selectable: false, reason: EVIDENCE_UNCONFIRMED, evidenceStatus: "확인 전" });
  });

  it("일괄 처리 사전 읽기 한 번 — 같은 지급일 · 같은 증빙 종류 P4 세 행이 모두 처리되고 loadTaxRates는 1번(E-34)", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const docs = await approvedMany(fx, await extraLines(fx, 3), false);
    const rows = await Promise.all(docs.map((doc) => snapshotOf(payer, doc)));
    const counter = countingLoadTaxRates();

    const result = await completePaymentsBatch(payer, { payDate: seoulToday(), rows }, { loadTaxRates: counter.load });
    expect(result.processed).toBe(3);
    expect(counter.calls).toHaveLength(1);
  });

  it(
    "쪽 = 필터 뒤 자르기 — P4 52행 + 예정일이 가장 이른 P2 3행: payable 1쪽 50 · 총 52 · 쪽 2 / 2쪽 2 / 필터 없음 1쪽 50 · 총 55(E-25)",
    async () => {
      const payer = await makePayer();
      const fx = await setupExpenseProject();
      const lines = await extraLines(fx, 55);
      await approvedMany(fx, lines.slice(0, 52), false);
      const unreviewed = await approvedMany(fx, lines.slice(52), true);
      for (const doc of unreviewed) await saveScheduledPayDate(payer, { expenseId: doc.expenseId, scheduledPayDate: addDays(seoulToday(), -10), version: doc.version });

      const first = await listPaymentTargets(payer, { evidence: "payable", page: 1 });
      expect(rowsOf(first)).toHaveLength(50);
      expect(first.page).toMatchObject({ total: 52, pageCount: 2, pageSize: 50 });
      expect(first.total?.count).toBe(52);
      expect(rowsOf(await listPaymentTargets(payer, { evidence: "payable", page: 2 }))).toHaveLength(2);
      const all = await listPaymentTargets(payer, { page: 1 });
      expect(rowsOf(all)).toHaveLength(50);
      expect(all.page.total).toBe(55);
      expect(rowsOf(all).slice(0, 3).map((row) => row.reason)).toEqual([EVIDENCE_UNCONFIRMED, EVIDENCE_UNCONFIRMED, EVIDENCE_UNCONFIRMED]);
    },
    240_000,
  );

  it("같은 요청 재전송 → 0건 추가 지급 — 둘째 응답은 전부 막힘 · 살아 있는 지급 수 그대로(E-5)", async () => {
    const payer = await makePayer();
    const { a, b } = await twoPayable();
    const rows = [await snapshotOf(payer, a), await snapshotOf(payer, b)];
    const first = await completePaymentsBatch(payer, { payDate: seoulToday(), rows });
    expect(first.processed).toBe(2);

    const second = await completePaymentsBatch(payer, { payDate: seoulToday(), rows });
    expect(second.processed).toBe(0);
    expect(second.blocked.map((row) => row.selectable)).toEqual([false, false]);
    for (const row of second.blocked) expect(row.reason).toMatch(/새로 고침$/);
    expect(await livePayments(a.expenseId)).toHaveLength(1);
    expect(await livePayments(b.expenseId)).toHaveLength(1);
  });

  it("짝 막힘 — 계좌이체 · 카드 전표가 짝 목록 밖이면 목록 selectable false + 이유, 조작 요청으로 보내도 같은 문구로 거부", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const cardVendor = await insertVendor(SYSTEM_VIEWER, { name: "카드가맹", normalizedName: `카드가맹-${randomUUID()}`, defaultEvidenceType: "card_receipt" });
    const [doc] = await approvedMany(fx, await extraLines(fx, 1, cardVendor.id), false);
    if (!doc) throw new Error("문서 없음");
    const [row] = await db.select({ method: expenses.paymentMethod, evidenceType: expenses.evidenceType }).from(expenses).where(eq(expenses.id, doc.expenseId));
    expect(row).toEqual({ method: "bank_transfer", evidenceType: "card_receipt" });
    const snapshot = await snapshotOf(payer, doc);
    await upsertSimpleValue(SYSTEM_VIEWER, PAYMENT_METHOD_EVIDENCE_PAIRS.key, [{ method: "bank_transfer", evidence: "tax_invoice" }], null);

    const reason = "계좌이체 · 카드 전표 짝 아님 · 짝 설정은 관리자";
    expect(rowsOf(await listPaymentTargets(payer, {}))[0]).toMatchObject({ id: doc.expenseId, selectable: false, reason });
    const result = await completePaymentsBatch(payer, { payDate: seoulToday(), rows: [snapshot] });
    expect(result.blocked[0]).toMatchObject({ reason, selectable: false });
    expect(await livePayments(doc.expenseId)).toHaveLength(0);
  });

  it("목록 지급 총액 = 단건 재계산 — 증빙일과 예정일 사이 부가세율이 바뀐 문서의 목록 payableKrw가 처리된 지급 기록 payable_krw와 같다", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithoutEvidence(fx);
    const today = seoulToday();
    await db
      .update(expenses)
      .set({ evidenceType: await vatEvidenceType("test_vat_scheduled", "scheduled_payment_date"), evidenceDate: today })
      .where(eq(expenses.id, doc.expenseId));
    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: addDays(today, 30), value: 0.12 });
    await saveScheduledPayDate(payer, { expenseId: doc.expenseId, scheduledPayDate: addDays(today, 40), version: doc.version });

    const [listed] = rowsOf(await listPaymentTargets(payer, {}));
    if (typeof listed?.payableKrw !== "number" || typeof listed.version !== "number") throw new Error("목록 값 없음");
    const result = await completePaymentsBatch(payer, {
      payDate: today,
      rows: [{ expenseId: doc.expenseId, expenseVersion: listed.version, expectedPayableKrw: listed.payableKrw }],
    });
    expect(result.blocked).toEqual([]);
    expect((await livePayments(doc.expenseId))[0]?.payableKrw).toBe(listed.payableKrw);
  });

  it("세율 읽기 횟수 — 기준일이 서로 다른 두 날짜에 걸친 행 목록은 loadTaxRates 2번", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const docs = await approvedMany(fx, await extraLines(fx, 3), false);
    const type = await vatEvidenceType("test_vat_scheduled2", "scheduled_payment_date");
    const today = seoulToday();
    for (const [index, doc] of docs.entries()) {
      await db.update(expenses).set({ evidenceType: type }).where(eq(expenses.id, doc.expenseId));
      await saveScheduledPayDate(payer, { expenseId: doc.expenseId, scheduledPayDate: addDays(today, index === 0 ? 3 : 9), version: doc.version });
    }
    const counter = countingLoadTaxRates();
    const list = await listPaymentTargets(payer, {}, { loadTaxRates: counter.load });
    expect(rowsOf(list)).toHaveLength(3);
    expect(counter.calls.sort()).toEqual([addDays(today, 3), addDays(today, 9)]);
  });

  it("선택 불가 행 조작 요청 — P2 행을 스냅숏에 넣어 보내면 그 행만 `증빙 확인 전 · 증빙 확인`으로 막힌다", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const p2 = await approvedExpenseWithEvidence(fx, fx.lines.withVendor);
    const p4 = await approvedExpenseWithoutEvidence(fx, fx.lines.split);
    const listed = rowsOf(await listPaymentTargets(payer, {}));
    expect(listed.find((row) => row.id === p2.expenseId)).toMatchObject({ selectable: false, reason: EVIDENCE_UNCONFIRMED });

    const result = await completePaymentsBatch(payer, { payDate: seoulToday(), rows: [await snapshotOf(payer, p2), await snapshotOf(payer, p4)] });
    expect(result.processedIds).toEqual([p4.expenseId]);
    expect(result.blocked).toEqual([{ expenseId: p2.expenseId, reason: EVIDENCE_UNCONFIRMED, newPayableKrw: null, selectable: false, selectableReason: EVIDENCE_UNCONFIRMED }]);
    expect(await livePayments(p2.expenseId)).toHaveLength(0);
  });

  it("지급 권한 없는 계정 → completePaymentsBatch ForbiddenError · 지급 기록 0", async () => {
    const { fx, a } = await twoPayable();
    const payer = await makePayer();
    const row = await snapshotOf(payer, a);
    expect(await caught(completePaymentsBatch(fx.pm, { payDate: seoulToday(), rows: [row] }))).toBeInstanceOf(ForbiddenError);
    expect(await livePayments(a.expenseId)).toHaveLength(0);
  });
});
