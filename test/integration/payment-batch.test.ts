import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { expenseEvidenceReviews, expensePayments, expenses, files, quoteLines, users, vendors } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { ForbiddenError } from "@/domain/permissions/can";
import { cancelExpensePayment, completeExpensePayment, FUTURE_PAY_DATE, FuturePayDateError, getPaymentView, PayableChangedError, PaymentConflictError, previewPayable, saveScheduledPayDate } from "@/domain/payments";
import { BATCH_ROW_FAILED, batchRowOutcome, completePaymentsBatch } from "@/domain/payments/batch";
import { getEvidenceConfirmView, listPaidPayments, listPaymentTargets, nextUnreviewedTarget, paidViewAllowed, parsePaymentEvidenceFilter, parsePayReturn, PAYMENT_EVIDENCE_FILTERS, sumSelectedTransfers } from "@/domain/payments/targets";
import { DIFF_REASON_REQUIRED, EVIDENCE_UNCONFIRMED } from "@/domain/payments/action-row";
import { diffKrw, sumKrw } from "@/domain/money";
import { GateBlockedError } from "@/domain/rules/gate";
import { confirmEvidence, loadPrepaidDueDays } from "@/domain/evidence-reviews";
import { voidEvidence } from "@/domain/evidence";
import { approveDocument } from "@/domain/approvals";
import { listExpenses } from "@/domain/expenses/list";
import { changeExpensePayeeUser, createExpenseFromLines } from "@/domain/expenses";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { loadTaxRates } from "@/domain/money/tax";
import { addHistorizedValue } from "@/domain/settings/registry";
import { PAYMENT_METHOD_EVIDENCE_PAIRS, TAX_VAT_RATE } from "@/domain/settings/keys";
import { seedCodeItem } from "@/repositories/code-tables";
import { upsertSimpleValue } from "@/repositories/settings";
import { insertVendor } from "@/repositories/vendors";
import { seoulToday } from "@/lib/dates";
import { insertRole } from "@/repositories/roles";
import { upsertPermission } from "@/repositories/permissions";
import { TAX_UNAVAILABLE } from "@/domain/expenses/gate";
import { DATE_FORMAT_ERROR } from "@/domain/expenses/draft-fields";
import { completePaymentsBatchAction } from "@/app/(app)/expenses/actions";
import { confirmEvidenceAction } from "@/app/(app)/expenses/[id]/actions";
import { makePerson } from "./approvals-fixtures";
import { addApprovedRevision, attachEvidence, makeEvidenceManager, setupExpenseProject, submitReadyDraft, type ExpenseFixture, testVendorAccount } from "./fixtures/expenses";
import { approvedExpenseWithEvidence, approvedExpenseWithoutEvidence, makePaymentManager, setEvidenceRequired, type ApprovedExpense } from "./fixtures/payments";

// 06-15(EXP-09 · EXP-06 · AS1 · D-604) — 지급 대상 목록(S1)과 건별 트랜잭션 일괄 지급(S2). 통과를 기대하는 문서는 06-03 · 06-04처럼
// 증빙 0 · evidence.required = false로 만든다(P4). setup.ts가 매 테스트 전 TRUNCATE + 시드로 설정을 기본값으로 되돌린다.

const session = vi.hoisted(() => ({ viewer: null as Viewer | null }));
vi.mock("@/lib/viewer", () => ({
  getSession: () => Promise.resolve(session.viewer ? { viewer: session.viewer, user: { id: session.viewer.id } } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

beforeEach(async () => {
  await setEvidenceRequired(false);
});

async function makePayer(name?: string): Promise<Viewer> {
  const payer = await makePaymentManager(name);
  if (!payer.roleId) throw new Error("계급 없음");
  // 06-20 — 계좌 칸(account)은 03 정보 항목 vendor.value에 걸린다(새 계급은 노출 행이 없으면 숨김).
  for (const infoItem of ["expense.value", "expense.amount", "vendor.value"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: true });
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
    const payDate = addDays(today, -1);
    await db.update(expenses).set({ evidenceType: await vatEvidenceType("test_vat_paydate", "payment_date") }).where(eq(expenses.id, c.expenseId));
    // 06.5 D-6518(지급일 오늘까지): 세율 행 적용일 = 오늘 · 지급일 = 어제 — 정리는 매 테스트 TRUNCATE + 시드(오늘 적용 행은 취소 불가).
    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: today, value: 0.12 });
    // 화면이 오늘 기준으로 본 지급 총액(목록 값 — 새 세율)을 들고, 고른 지급일은 세율이 바뀌기 전.
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
    const cardVendor = await insertVendor(SYSTEM_VIEWER, { name: "카드가맹", normalizedName: `카드가맹-${randomUUID()}`, defaultEvidenceType: "card_receipt", ...testVendorAccount() });
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

// ── 06-15 독립 검토 반영(I-2 · S-1 ~ S-5) ─────────────────────────────────

// 팀 업무 범위 지급 권한자(지출결의 보기 + 팀 보기 + 지급 쓰기 + 금액 보임) — teamName 팀에 발령한다.
async function makeTeamPayer(teamName: string): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `팀지급-${randomUUID().slice(0, 8)}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.team", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.payments", action: "write", allowed: true });
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return makePerson("팀경영", role.id, teamName);
}

describe("검토 반영 (06-15 독립 검토)", () => {
  it("I-2 목록 범위 — 작성 중 · 결재 진행 중 · 종결(결재 통과) 문서는 지급 대상 · 합계 건수 · 지급 총액에 들지 않는다", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const target = await approvedExpenseWithoutEvidence(fx);
    const [draftLine, submittedLine, closedLine] = await extraLines(fx, 3);
    if (!draftLine || !submittedLine || !closedLine) throw new Error("줄 셋이 필요하다");
    const draft = await createExpenseFromLines(fx.pm, { lineIds: [draftLine] });
    expect(draft.created).toHaveLength(1);
    const pending = await createExpenseFromLines(fx.pm, { lineIds: [submittedLine] });
    const pendingId = pending.created[0]?.expenseId;
    if (!pendingId) throw new Error("진행 중 문서 없음");
    expect((await submitReadyDraft(fx.pm, pendingId)).kind).toBe("submitted");
    const [closed] = await approvedMany(fx, [closedLine], false);
    if (!closed) throw new Error("종결 문서 없음");
    await db.update(expenses).set({ closedAt: new Date(), closedBy: fx.pm.id, closedReason: "테스트 종결" }).where(eq(expenses.id, closed.expenseId));

    const list = await listPaymentTargets(payer, {});
    expect(rowsOf(list).map((row) => row.id)).toEqual([target.expenseId]);
    expect(list.total).toEqual({ count: 1, sumKrw: await payableNow(payer, target) });
  });

  it("S-1 목록 증빙 게이트(P3) — 증빙 필수 on · 증빙 0 문서는 목록에서 selectable false · 이유 `증빙 없음 · 기안자 …`", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithoutEvidence(fx);
    await setEvidenceRequired(true);

    const [row] = rowsOf(await listPaymentTargets(payer, {}));
    expect(row).toMatchObject({ id: doc.expenseId, selectable: false });
    expect(row?.reason).toMatch(/^증빙 없음 · 기안자 /);
    expect(rowsOf(await listPaymentTargets(payer, { evidence: "missing" })).map((candidate) => candidate.id)).toEqual([doc.expenseId]);
  });

  it("S-2 세율 없음 — 세금 규칙을 찾을 수 없는 증빙 종류의 행은 selectable false · 이유 TAX_UNAVAILABLE · payableKrw null", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithoutEvidence(fx);
    await db.update(expenses).set({ evidenceType: null }).where(eq(expenses.id, doc.expenseId));

    const [row] = rowsOf(await listPaymentTargets(payer, {}));
    expect(row).toMatchObject({ id: doc.expenseId, selectable: false, reason: TAX_UNAVAILABLE, payableKrw: null });
  });

  it("S-3 보임 범위 — 팀 범위 지급 권한자는 다른 팀 문서를 지급 대상에서 보지 못하고, 같은 팀 지급 권한자는 본다", async () => {
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithoutEvidence(fx);
    const otherTeam = await makeTeamPayer("경영관리팀");
    const sameTeam = await makeTeamPayer("기획1팀");

    const hidden = await listPaymentTargets(otherTeam, {});
    expect(rowsOf(hidden)).toEqual([]);
    expect(hidden.total?.count).toBe(0);
    expect(rowsOf(await listPaymentTargets(sameTeam, {})).map((row) => row.id)).toEqual([doc.expenseId]);
  });

  it("S-4 요청 안 중복 — 같은 문서를 두 번 실은 요청은 한 번만 처리 · 막힌 행 없음 · 살아 있는 지급 1", async () => {
    const payer = await makePayer();
    const { a } = await twoPayable();
    const row = await snapshotOf(payer, a);

    const result = await completePaymentsBatch(payer, { payDate: seoulToday(), rows: [row, { ...row }] });
    expect(result.processedIds).toEqual([a.expenseId]);
    expect(result.blocked).toEqual([]);
    expect(await livePayments(a.expenseId)).toHaveLength(1);
  });

  it("S-5 지급일 검증(서버 zod) — 액션에 `2026-02-30` · `2026-13-01`을 보내면 payDate 오류 `날짜 형식 오류 · 2026-09-19처럼` · 지급 0건", async () => {
    const payer = await makePayer();
    const { a } = await twoPayable();
    const row = await snapshotOf(payer, a);
    session.viewer = payer;

    for (const payDate of ["2026-02-30", "2026-13-01"]) {
      const result = await completePaymentsBatchAction({ payDate, rows: [row] });
      expect(result?.data).toBeUndefined();
      expect(result?.validationErrors?.payDate?._errors).toEqual([DATE_FORMAT_ERROR]);
    }
    expect(await livePayments(a.expenseId)).toHaveLength(0);
  });
});

// ── 06-17 이체액 편집 · 서버 합(합계 번호) · rowStates ──────────────────────

describe("이체액 편집 · 서버 합 (06-17 Task 1)", () => {
  it("sumSelectedTransfers — 합 = sumKrw(이체액 편집값 · 없으면 지급 총액), 행별 차이 = diffKrw(이체액, 지급 총액), 선택 불가 행은 합에서 빠지고 rowStates selectable false / 지급 권한 없음 → ForbiddenError", async () => {
    const payer = await makePayer();
    const { fx, a, b } = await twoPayable();
    const [p2Line] = await extraLines(fx, 1);
    if (!p2Line) throw new Error("줄 없음");
    const [p2] = await approvedMany(fx, [p2Line], true);
    if (!p2) throw new Error("P2 문서 없음");
    const payableA = await payableNow(payer, a);
    const payableB = await payableNow(payer, b);

    const result = await sumSelectedTransfers(payer, {
      seq: 7,
      rows: [{ id: a.expenseId, transferKrw: payableA - 3_300 }, { id: b.expenseId }, { id: p2.expenseId, transferKrw: 1_000 }],
    });
    expect(result.seq).toBe(7);
    expect(result.totalKrw).toBe(sumKrw([diffKrw(payableA, 3_300), payableB]));
    expect(result.diffs).toEqual({ [a.expenseId]: -3_300, [b.expenseId]: 0 });
    expect(result.rowStates.find((row) => row.id === p2.expenseId)).toMatchObject({ selectable: false });

    expect(await caught(sumSelectedTransfers(fx.pm, { seq: 1, rows: [{ id: a.expenseId }] }))).toBeInstanceOf(ForbiddenError);
  });

  it("고른 행 상태 일괄 조회 — 두 쪽에 걸친 id · 처리된 id · 게이트로 막힌 id는 행마다 { id, selectable, version, payableKrw }(P4만 selectable), 없는 id · 지급 대상이 아닌 문서는 싣지 않는다(r2 F-2)", async () => {
    const payer = await makePayer();
    const { fx, a, b } = await twoPayable();
    const [thirdLine, p2Line, draftLine] = await extraLines(fx, 3);
    if (!thirdLine || !p2Line || !draftLine) throw new Error("줄 셋이 필요하다");
    const [third] = await approvedMany(fx, [thirdLine], false);
    const [p2] = await approvedMany(fx, [p2Line], true);
    if (!third || !p2) throw new Error("문서 없음");
    const draft = (await createExpenseFromLines(fx.pm, { lineIds: [draftLine] })).created[0]?.expenseId;
    if (!draft) throw new Error("작성 중 문서 없음");
    // 쪽 크기 2 — P4 세 행 중 하나는 둘째 쪽(지금 쪽 밖)에 있다(51번째 행과 같은 처지 — 쪽 크기만 줄였다).
    const pageOne = rowsOf(await listPaymentTargets(payer, { evidence: "payable", page: 1 }, { pageSize: 2 })).map((row) => row.id);
    const pageTwo = rowsOf(await listPaymentTargets(payer, { evidence: "payable", page: 2 }, { pageSize: 2 })).map((row) => row.id);
    expect(pageOne).toHaveLength(2);
    expect(pageTwo).toHaveLength(1);
    const [offPage] = pageTwo;
    const [paidId, keptId] = pageOne;
    if (!offPage || !paidId || !keptId) throw new Error("쪽 행 없음");
    const docOf = (id: string) => [a, b, third].find((doc) => doc.expenseId === id) ?? a;
    const paid = await completePaymentsBatch(payer, { payDate: seoulToday(), rows: [await snapshotOf(payer, docOf(paidId))] });
    expect(paid.processedIds).toEqual([paidId]);

    const result = await sumSelectedTransfers(payer, {
      seq: 3,
      rows: [keptId, offPage, paidId, p2.expenseId, draft, randomUUID()].map((id) => ({ id })),
    });
    expect(result.seq).toBe(3);
    const states = new Map(result.rowStates.map((row) => [row.id, row]));
    expect([...states.keys()].sort()).toEqual([keptId, offPage, paidId, p2.expenseId].sort());
    // 검토 반영(D-2) — 결과 줄 ① · ②가 지금 쪽 밖 행도 세도록 견적 줄 · 선결제를 함께 싣는다(06-15 paymentTargetRow 같은 칸).
    const [offDoc] = await db.select({ quoteLineId: expenses.quoteLineId }).from(expenses).where(eq(expenses.id, offPage));
    expect(typeof offDoc?.quoteLineId).toBe("string");
    expect(states.get(offPage)).toEqual({
      id: offPage,
      selectable: true,
      version: await versionOf(offPage),
      payableKrw: await payableNow(payer, docOf(offPage)),
      quoteLineId: offDoc?.quoteLineId,
      prepaid: false,
    });
    expect(states.get(keptId)).toMatchObject({ selectable: true, version: await versionOf(keptId) });
    expect(states.get(paidId)).toMatchObject({ selectable: false });
    expect(states.get(p2.expenseId)).toMatchObject({ selectable: false, version: await versionOf(p2.expenseId) });
    expect(Object.keys(result.diffs).sort()).toEqual([keptId, offPage].sort());
  });

  it("처리 요청 zod — 이체액 ≠ 기대 지급 총액인데 차이 사유가 비면 그 행 차이 사유 칸 오류 `차이 사유 없음 · 사유 적기` · 지급 0건", async () => {
    const payer = await makePayer();
    const { a } = await twoPayable();
    const row = await snapshotOf(payer, a);
    session.viewer = payer;

    for (const diffReason of [undefined, "  "]) {
      const result = await completePaymentsBatchAction({ payDate: seoulToday(), rows: [{ ...row, transferKrw: row.expectedPayableKrw - 3_300, ...(diffReason === undefined ? {} : { diffReason }) }] });
      expect(result?.data).toBeUndefined();
      expect(result?.validationErrors).toMatchObject({ rows: { 0: { diffReason: { _errors: [DIFF_REASON_REQUIRED] } } } });
    }
    const same = await completePaymentsBatchAction({ payDate: seoulToday(), rows: [{ ...row, transferKrw: row.expectedPayableKrw }] });
    expect(same?.data?.processedIds).toEqual([a.expenseId]);
  });

  it("이체액 · 사유가 실린 스냅숏 → 지급 기록에 이체액 · 차이 · 사유(06-04 단건 경로)", async () => {
    const payer = await makePayer();
    const { a } = await twoPayable();
    const row = await snapshotOf(payer, a);

    const result = await completePaymentsBatch(payer, { payDate: seoulToday(), rows: [{ ...row, transferKrw: row.expectedPayableKrw - 3_300, diffReason: "이체 수수료" }] });
    expect(result.processedIds).toEqual([a.expenseId]);
    const [record] = await livePayments(a.expenseId);
    expect(record).toMatchObject({ transferKrw: row.expectedPayableKrw - 3_300, payableKrw: row.expectedPayableKrw, diffKrw: -3_300, diffReason: "이체 수수료" });
  });
});

// ── 06-17 Task 2 — 지급일 세율로 바뀐 지급 총액 · 재시도 · 지급 뒤 정본(E-22) ─────────

// 세율이 바뀌는 날을 사이에 둔 지급일 — 기준일이 지급일인 증빙 종류 문서 하나와 보통 문서 하나. 06.5 D-6518(지급일 오늘까지) 뒤로는
// 세율 행 적용일 = 오늘 · 지급일 = 어제(둘 다 오늘 이하): 스냅숏(오늘 기준 — 새 세율)과 지급일(어제 — 옛 세율)이 세율 행의 양쪽에 선다.
// 오늘 적용 행은 cancelHistorizedValue가 지우지 못한다(FutureCancelOnlyError) — 정리는 통합 공통 setup의 매 테스트 TRUNCATE + 시드가 한다.
async function taxBoundary(payer: Viewer, label: string) {
  const fx = await setupExpenseProject();
  const shifted = await approvedExpenseWithoutEvidence(fx, fx.lines.withVendor);
  const plain = await approvedExpenseWithoutEvidence(fx, fx.lines.split);
  const today = seoulToday();
  const payDate = addDays(today, -1);
  await db.update(expenses).set({ evidenceType: await vatEvidenceType(label, "payment_date") }).where(eq(expenses.id, shifted.expenseId));
  await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: today, value: 0.12 });
  // 화면이 오늘 기준으로 본 지급 총액(목록 값)을 든 스냅숏.
  const rows = [await snapshotOf(payer, shifted), await snapshotOf(payer, plain)];
  return { shifted, plain, payDate, rows };
}

describe("지급일 재계산 막힘 · 재시도 (06-17 Task 2)", () => {
  it("세율 경계 지급일 → 막힘 + 새 값 — 지급일 세율로 지급 총액이 바뀐 행은 처리되지 않고 newPayableKrw · 이유, 다른 행은 처리", async () => {
    const payer = await makePayer();
    const { shifted, plain, payDate, rows } = await taxBoundary(payer, "test_vat_boundary1");
    const result = await completePaymentsBatch(payer, { payDate, rows });
    expect(result.processedIds).toEqual([plain.expenseId]);
    expect(result.blocked).toEqual([
      { expenseId: shifted.expenseId, reason: `지급일 ${payDate.slice(5)} 기준 지급 총액 바뀜 · 이체액 확인`, newPayableKrw: await payableNow(payer, shifted, payDate), selectable: true, selectableReason: null },
    ]);
    expect(result.blocked[0]?.newPayableKrw).not.toBe(rows[0]?.expectedPayableKrw);
    expect(await livePayments(shifted.expenseId)).toHaveLength(0);
  });

  it("새 값 재시도 → 처리 — 합 요청이 같은 지급일로 셈한 rowStates 지급 총액 = newPayableKrw(차이 0)이고, 그 값으로 다시 보내면 같은 이유로 막히지 않는다", async () => {
    const payer = await makePayer();
    const { shifted, payDate, rows } = await taxBoundary(payer, "test_vat_boundary2");
    const first = await completePaymentsBatch(payer, { payDate, rows });
    const newPayable = first.blocked[0]?.newPayableKrw;
    if (typeof newPayable !== "number") throw new Error("새 지급 총액 없음");

    const sum = await sumSelectedTransfers(payer, { seq: 1, rows: [{ id: shifted.expenseId }], payDate });
    const [shiftedDoc] = await db.select({ quoteLineId: expenses.quoteLineId }).from(expenses).where(eq(expenses.id, shifted.expenseId));
    expect(sum.rowStates).toEqual([
      { id: shifted.expenseId, selectable: true, version: await versionOf(shifted.expenseId), payableKrw: newPayable, quoteLineId: shiftedDoc?.quoteLineId, prepaid: false },
    ]);
    expect(sum.diffs).toEqual({ [shifted.expenseId]: 0 });

    const retry = await completePaymentsBatch(payer, {
      payDate,
      rows: [{ expenseId: shifted.expenseId, expenseVersion: await versionOf(shifted.expenseId), expectedPayableKrw: newPayable }],
    });
    expect(retry.processedIds).toEqual([shifted.expenseId]);
    expect(retry.blocked).toEqual([]);
  });

  it("지급된 문서 보기 = 지급 기록(E-22) — 어제 지급일 · 새 지급 총액으로 처리된 문서의 getPaymentView는 지급 기록 값(오늘 기준 재계산이 아님)", async () => {
    const payer = await makePayer();
    const { shifted, payDate, rows } = await taxBoundary(payer, "test_vat_boundary3");
    const first = await completePaymentsBatch(payer, { payDate, rows });
    const newPayable = first.blocked[0]?.newPayableKrw;
    if (typeof newPayable !== "number") throw new Error("새 지급 총액 없음");
    const transfer = newPayable - 3_300;
    await completePaymentsBatch(payer, {
      payDate,
      rows: [{ expenseId: shifted.expenseId, expenseVersion: await versionOf(shifted.expenseId), expectedPayableKrw: newPayable, transferKrw: transfer, diffReason: "이체 수수료" }],
    });
    const todayPayable = rows[0]?.expectedPayableKrw;
    expect(todayPayable).not.toBe(newPayable);

    const view = await getPaymentView(payer, shifted.expenseId);
    expect(view).toMatchObject({ payDate, payableKrw: newPayable, transferKrw: transfer, diffKrw: -3_300, diffReason: "이체 수수료" });
  });
});

// ── 06-17 Task 4 — 제자리 증빙 확인 보기(DR-4) ──────────────────────────────

// 결재 통과 · 증빙 한 장 · 확인 기록 없음(확인 전 P2) 문서에 증빙 금액을 둔다(픽스처가 expenses.evidence_amount를 직접 — 기안자 저장 경로 없음).
async function unreviewedWithAmount(fx: ExpenseFixture, evidenceAmount: number): Promise<ApprovedExpense> {
  const doc = await approvedExpenseWithEvidence(fx);
  await db.update(expenses).set({ evidenceAmount }).where(eq(expenses.id, doc.expenseId));
  return { ...doc, version: await versionOf(doc.expenseId) };
}

describe("제자리 증빙 확인 보기 (06-17 Task 4)", () => {
  it("증빙 확인 보기 — 권한 · 확인 전만: 파일 행 · 증빙 금액 · 서버 계산 한 줄 · 지금 version · 지문 / 행 version 다름 → 같은 보기 + 동시성 이유 / 지급 권한 없음 · 확인 전 아님 → 거부", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const doc = await unreviewedWithAmount(fx, 1_000_000);
    const paymentView = await getPaymentView(payer, doc.expenseId);
    expect(paymentView?.row?.row).toBe("P2");

    const view = await getEvidenceConfirmView(payer, { expenseId: doc.expenseId, rowVersion: doc.version });
    expect(view.version).toBe(doc.version);
    expect(view.number).toBe(doc.number);
    expect("evidenceAmountKrw" in view).toBe(false);
    expect(view.files).toHaveLength(1);
    expect(view.files?.[0]?.name).not.toBe("");
    expect(view.evidenceStamp).toBe(paymentView?.evidenceStamp);
    expect(view.taxLine).toEqual(paymentView?.evidenceTaxLine);
    expect(view.taxLine?.length).toBeGreaterThan(0);
    expect(view.conflict).toBeNull();

    const stale = await getEvidenceConfirmView(payer, { expenseId: doc.expenseId, rowVersion: doc.version - 1 });
    expect(stale.version).toBe(doc.version);
    expect(stale.conflict).toMatch(/^.+이 \d{2}:\d{2}에 바꿈 · 새로 고침$/);

    await expect(getEvidenceConfirmView(fx.pm, { expenseId: doc.expenseId, rowVersion: doc.version })).rejects.toBeInstanceOf(ForbiddenError);
    const confirmed = await confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version });
    await expect(getEvidenceConfirmView(payer, { expenseId: doc.expenseId, rowVersion: confirmed.version })).rejects.toThrow("확인 전 아님 · 새로 고침");
  });

  it("증빙 확인 보기 — 공급가(06.5-07 S1 부제 끝 · 문서 통화): 원화 문서 → KRW 공급가액 / 외화 문서 → USD 1,000(원화 환산액 아님)", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const doc = await unreviewedWithAmount(fx, 1_000_000);
    const [row] = await db.select({ supplyAmountKrw: expenses.supplyAmountKrw }).from(expenses).where(eq(expenses.id, doc.expenseId));
    expect(row?.supplyAmountKrw).toBeGreaterThan(0);
    const view = await getEvidenceConfirmView(payer, { expenseId: doc.expenseId, rowVersion: doc.version });
    expect(view.supply).toEqual({ currency: "KRW", amount: row?.supplyAmountKrw });

    await db.update(expenses).set({ supplyCurrency: "USD", supplyForeignAmount: "1000.00", supplyFxRate: "1350.0000", supplyAmountKrw: 1_350_000 }).where(eq(expenses.id, doc.expenseId));
    const foreign = await getEvidenceConfirmView(payer, { expenseId: doc.expenseId, rowVersion: doc.version });
    expect(foreign.supply).toEqual({ currency: "USD", amount: 1000 });
  }, 30_000);

  it("증빙 확인 보기 — 넘침 줄 없음(06.5 D-6520): 증빙 금액이 승인액 · 실행가를 넘어도 넘침 칸이 없고 세금 한 줄은 공급가 기준이다", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const doc = await unreviewedWithAmount(fx, 12_400_000);
    await db.update(expenses).set({ supplyAmountKrw: 12_000_000 }).where(eq(expenses.id, doc.expenseId));
    await db.update(quoteLines).set({ executionAmountKrw: 12_250_000 }).where(eq(quoteLines.id, fx.lines.withVendor));

    const view = await getEvidenceConfirmView(payer, { expenseId: doc.expenseId, rowVersion: doc.version });
    expect("evidenceOverrun" in view).toBe(false);
    const paymentView = await getPaymentView(payer, doc.expenseId);
    expect(view.taxLine).toEqual(paymentView?.evidenceTaxLine);

    // 증빙 금액만 바꿔도 지급 금액 · 세금 한 줄 · 지문이 그대로다 — 금액은 공급가액 하나에서 나온다.
    await db.update(expenses).set({ evidenceAmount: 11_000_000 }).where(eq(expenses.id, doc.expenseId));
    const after = await getEvidenceConfirmView(payer, { expenseId: doc.expenseId, rowVersion: doc.version });
    const paymentAfter = await getPaymentView(payer, doc.expenseId);
    expect({ taxLine: after.taxLine, stamp: after.evidenceStamp, payableKrw: paymentAfter?.payableKrw }).toEqual({
      taxLine: view.taxLine,
      stamp: view.evidenceStamp,
      payableKrw: paymentView?.payableKrw,
    });
  });

  it("증빙 지문 다름 → 확인 거부: 보기 뒤 기안자가 증빙 하나 더 → 지금 DB version + 옛 지문으로 확인 → 동시성 거부 · 확인 기록 없음 / 다시 받은 보기 version + 지문 → 확인됨", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const doc = await unreviewedWithAmount(fx, 1_000_000);
    const view = await getEvidenceConfirmView(payer, { expenseId: doc.expenseId, rowVersion: doc.version });
    await attachEvidence(fx.pm, doc.expenseId);
    session.viewer = payer;

    const refused = await confirmEvidenceAction({ expenseId: doc.expenseId, version: await versionOf(doc.expenseId), evidenceStamp: view.evidenceStamp });
    expect(refused?.serverError).toMatch(/증빙을 바꿈 · 새로 고침$/);
    expect(await db.select().from(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, doc.expenseId))).toHaveLength(0);

    const again = await getEvidenceConfirmView(payer, { expenseId: doc.expenseId, rowVersion: await versionOf(doc.expenseId) });
    expect(again.files).toHaveLength(2);
    const done = await confirmEvidenceAction({ expenseId: doc.expenseId, version: again.version ?? 0, evidenceStamp: again.evidenceStamp });
    expect(done?.data?.evidenceStatus).toBe("확인됨");
  });
});

// ── 06-20 「지급 완료」 보기(S3) · 계좌 투영 · 문서 화면 왕복 · Phase 5 상태 열 ─────────────────────────

// 결재 통과 · 증빙 0(P4) 문서를 지급 권한자가 처리한다 — 지급일은 오늘(지급 총액 = 단건 재계산과 같은 날).
async function paidDocs(payer: Viewer, fx: ExpenseFixture, lineIds: readonly string[]): Promise<ApprovedExpense[]> {
  const docs = await approvedMany(fx, lineIds, false);
  const rows = await Promise.all(docs.map((doc) => snapshotOf(payer, doc)));
  const result = await completePaymentsBatch(payer, { payDate: seoulToday(), rows });
  if (result.processed !== docs.length) throw new Error(`지급 안 됨: ${JSON.stringify(result.blocked)}`);
  return docs;
}

// 테스트 준비 전용 — 지급 기록의 지급일만 옮긴다(주 그룹 · 월 필터 경계).
async function movePayDate(expenseId: string, payDate: string): Promise<void> {
  await db
    .update(expensePayments)
    .set({ payDate })
    .where(and(eq(expensePayments.expenseId, expenseId), isNull(expensePayments.cancelledAt)));
}

function paidRowsOf(list: Awaited<ReturnType<typeof listPaidPayments>>) {
  return list.groups.flatMap((group) => group.rows);
}

const ACCOUNT_KEY = /account|bank|holder|masked|last4/i;

describe("지급 완료 보기 (06-20 Task 1)", () => {
  it("지급 완료 목록 — 보임 · 취소 제외 · 합계: 지급 권한자 · 대표는 살아 있는 지급만 · 지급 방식 낱말 · 계좌 키 없음 · 합계 = sumKrw(이체액) / PM · 직원 → ForbiddenError", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const [a, b, c] = await paidDocs(payer, fx, await extraLines(fx, 3));
    if (!a || !b || !c) throw new Error("문서 셋 필요");
    await cancelExpensePayment(payer, { expenseId: c.expenseId, reason: "잘못 지급", version: await versionOf(c.expenseId) });

    for (const reader of [payer, fx.ceo]) {
      const list = await listPaidPayments(reader, {});
      const rows = paidRowsOf(list);
      expect(rows.map((row) => row.id).sort()).toEqual([a.expenseId, b.expenseId].sort());
      for (const row of rows) {
        expect(row.paymentMethodName).toBe("계좌이체");
        expect(Object.keys(row).filter((key) => ACCOUNT_KEY.test(key))).toEqual([]);
      }
      const transfers = (await livePayments(a.expenseId)).concat(await livePayments(b.expenseId)).map((payment) => payment.transferKrw);
      expect(list.total).toEqual({ count: 2, sumKrw: sumKrw(transfers) });
      expect(list.month).toBe(seoulToday().slice(0, 7));
    }

    for (const outsider of [fx.pm, fx.otherPm, fx.lead]) {
      await expect(listPaidPayments(outsider, {})).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("지급 완료 주 그룹 — 오늘(KST) 뒤 = `예정 지급` 맨 앞 → `이번 주`(월요일 시작) → `지난주` → `MM-DD ~ MM-DD`, 월 필터는 지급일 달", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const docs = await paidDocs(payer, fx, await extraLines(fx, 5));
    const dates = ["2026-10-20", "2026-10-12", "2026-10-06", "2026-10-01", "2026-09-25"];
    for (const [index, doc] of docs.entries()) await movePayDate(doc.expenseId, dates[index] ?? "");

    const list = await listPaidPayments(payer, { month: "2026-10" }, { today: "2026-10-14" });
    expect(list.groups.map((group) => [group.label, group.rows.map((row) => row.id)])).toEqual([
      ["예정 지급", [docs[0]?.expenseId]],
      ["이번 주", [docs[1]?.expenseId]],
      ["지난주", [docs[2]?.expenseId]],
      ["09-28 ~ 10-04", [docs[3]?.expenseId]],
    ]);
    expect(list.total?.count).toBe(4);
    expect(list.months).toEqual(["2026-10", "2026-09"]);

    const september = await listPaidPayments(payer, { month: "2026-09" }, { today: "2026-10-14" });
    expect(paidRowsOf(september).map((row) => row.id)).toEqual([docs[4]?.expenseId]);
    // 모르는 월 값은 이번 달(KST).
    expect((await listPaidPayments(payer, { month: "2026-13" }, { today: "2026-10-14" })).month).toBe("2026-10");
  });

  it("paidViewAllowed — 지급 권한자 참 · 대표(전사 보는 범위) 참 · PM 거짓 · 팀장 거짓", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    expect(await paidViewAllowed(payer)).toBe(true);
    expect(await paidViewAllowed(fx.ceo)).toBe(true);
    expect(await paidViewAllowed(fx.pm)).toBe(false);
    expect(await paidViewAllowed(fx.lead)).toBe(false);
  });
});

// ── 06-20 Task 2 도우미 ──────────────────────────────────────────────

const REVEAL_ITEM = "vendor.account_number_unmasked";

async function giveAccount(vendorId: string, last4: string): Promise<{ bank: string; holder: string }> {
  const account = { bank: "신한", holder: `예금주-${randomUUID().slice(0, 4)}` };
  await db.update(vendors).set({ accountBank: account.bank, accountHolder: account.holder, accountNumberLast4: last4 }).where(eq(vendors.id, vendorId));
  return account;
}

async function setReveal(viewer: Viewer, visible: boolean): Promise<void> {
  if (!viewer.roleId) throw new Error("계급 없음");
  await upsertVisibility(SYSTEM_VIEWER, { roleId: viewer.roleId, infoItem: REVEAL_ITEM, visible });
}

describe("계좌 투영 (06-20 Task 2)", () => {
  it("계좌 투영 — 권한자만: 지급 권한자의 S1 행 · 지급 보기에 account(은행 · 마스킹 · 예금주 · canReveal), 대표 · PM · 직원의 지급 보기 키 목록에 account 없음", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const { bank, holder } = await giveAccount(fx.stageOneId, "4321");
    const [doc] = await approvedMany(fx, await extraLines(fx, 1), false);
    if (!doc) throw new Error("문서 필요");

    const row = rowsOf(await listPaymentTargets(payer, {})).find((candidate) => candidate.id === doc.expenseId);
    expect(row?.account).toEqual({ status: "registered", ownerKind: "vendor", ownerId: fx.stageOneId, bank, masked: "****-**-4321", holder, canReveal: false });
    const payerView = await getPaymentView(payer, doc.expenseId);
    expect(payerView?.account).toEqual(row?.account);

    for (const reader of [fx.ceo, fx.pm, fx.otherPm]) {
      const view = await getPaymentView(reader, doc.expenseId);
      expect(Object.keys(view ?? {})).not.toContain("account");
      expect(JSON.stringify(view ?? {})).not.toContain("4321");
    }
    expect(Object.keys((await getPaymentView(fx.ceo, doc.expenseId)) ?? {})).toContain("payDate");
  });

  it("계좌 없음 행 고를 수 있음 — 계좌 없는 거래처의 계좌이체 P4 행은 account 「없음」 · selectable 참(M-7)", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    // 06.5 D-6507: 계좌 없는 계좌이체는 제출에서 막히므로 결재 통과 뒤 계좌가 지워진 거래처로 만든다(지급 단계 「없음」 갈래는 그대로 남는다).
    const bare = await insertVendor(SYSTEM_VIEWER, { name: "계좌없는곳", normalizedName: `계좌없는곳-${randomUUID()}`, defaultEvidenceType: "tax_invoice", ...testVendorAccount() });
    const [doc] = await approvedMany(fx, await extraLines(fx, 1, bare.id), false);
    if (!doc) throw new Error("문서 필요");
    await db.update(vendors).set({ accountBank: null, accountHolder: null, accountNumberEncrypted: null, accountNumberLast4: null }).where(eq(vendors.id, bare.id));

    const row = rowsOf(await listPaymentTargets(payer, {})).find((candidate) => candidate.id === doc.expenseId);
    expect(row?.account).toEqual({ status: "none" });
    expect(row?.selectable).toBe(true);
    expect((await getPaymentView(payer, doc.expenseId))?.account).toEqual({ status: "none" });
  });

  it("계좌 해제 — 노출표 따름: 지급 권한자 계급의 해제 항목을 끄면 canReveal 거짓 · 켜면 참, 나머지 칸은 같다(E-50)", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    await giveAccount(fx.stageOneId, "8765");
    const [doc] = await approvedMany(fx, await extraLines(fx, 1), false);
    if (!doc) throw new Error("문서 필요");

    await setReveal(payer, false);
    const off = rowsOf(await listPaymentTargets(payer, {})).find((candidate) => candidate.id === doc.expenseId)?.account;
    const offView = (await getPaymentView(payer, doc.expenseId))?.account;
    await setReveal(payer, true);
    const on = rowsOf(await listPaymentTargets(payer, {})).find((candidate) => candidate.id === doc.expenseId)?.account;
    const onView = (await getPaymentView(payer, doc.expenseId))?.account;

    expect(off).toMatchObject({ status: "registered", canReveal: false });
    expect(offView).toMatchObject({ status: "registered", canReveal: false });
    expect(on).toEqual({ ...off, canReveal: true });
    expect(onView).toEqual({ ...offView, canReveal: true });
  });
});

// ── 06-20 Task 3 — 문서 화면 왕복(C-1) ─────────────────────────────────

describe("순수", () => {
  it("되돌림 쿼리 — from=pay만 · 허용 키(team uuid · evidence 열거 · page 1~999)만 남기고 backHref는 늘 `/expenses?status=지급 대상`으로 새로 만든다", () => {
    const team = randomUUID();
    expect(parsePayReturn({})).toBeNull();
    expect(parsePayReturn({ from: "list", team })).toBeNull();

    const kept = parsePayReturn({ from: "pay", status: "지급 대상", team, evidence: "unreviewed", page: "2", extra: "x" });
    expect(kept).toEqual({
      backHref: `/expenses?${new URLSearchParams({ status: "지급 대상", team, evidence: "unreviewed", page: "2" })}`,
      docQuery: new URLSearchParams({ from: "pay", status: "지급 대상", team, evidence: "unreviewed", page: "2" }).toString(),
      team,
      evidence: "unreviewed",
      q: null,
    });

    // 06.5-08(검토 P2-2): 검색어가 문서 왕복에서 유지된다 — 정규화(공백 자름 · 100자) 뒤 backHref · docQuery에 싣고 q로 돌려준다.
    const withQ = parsePayReturn({ from: "pay", q: "  더테이블  ", page: "2" });
    expect(withQ).toEqual({
      backHref: `/expenses?${new URLSearchParams({ status: "지급 대상", q: "더테이블", page: "2" })}`,
      docQuery: new URLSearchParams({ from: "pay", status: "지급 대상", q: "더테이블", page: "2" }).toString(),
      team: null,
      evidence: null,
      q: "더테이블",
    });
    expect(parsePayReturn({ from: "pay", q: "   " })?.q).toBeNull();
    expect(parsePayReturn({ from: "pay", q: "x".repeat(150) })?.q).toBe("x".repeat(100));

    for (const bad of [
      { from: "pay", team: "//evil.example", evidence: "javascript:alert(1)", page: "0" },
      { from: "pay", team: "https://evil.example/x", evidence: "all", page: "1000" },
      { from: "pay", page: "2x", next: "//evil.example", status: "https://evil.example" },
      { from: ["pay", "pay"], team: [team, team] },
    ]) {
      const parsed = parsePayReturn(bad);
      if (parsed === null) continue;
      expect(parsed.backHref).toBe(`/expenses?${new URLSearchParams({ status: "지급 대상" })}`);
      expect(parsed.docQuery).toBe(new URLSearchParams({ from: "pay", status: "지급 대상" }).toString());
      expect(parsed.backHref).not.toMatch(/evil|javascript/);
    }
  });
});

describe("다음 확인 전 (06-20 Task 3)", () => {
  it("다음 확인 전 번호 — 지급 대상과 같은 조회 · 판정 · 정렬에서 그 문서 뒤 첫 확인 전(P2), 필터에서 빠진 문서도 정렬 키로 / 없으면 null / 지급 권한 없음 → null", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const [lineA, lineB, lineC] = await extraLines(fx, 3);
    if (!lineA || !lineB || !lineC) throw new Error("줄 셋 필요");
    const [first] = await approvedMany(fx, [lineA], true);
    const [middle] = await approvedMany(fx, [lineB], false);
    const [last] = await approvedMany(fx, [lineC], true);
    if (!first || !middle || !last) throw new Error("문서 셋 필요");
    const rows = rowsOf(await listPaymentTargets(payer, {}));
    expect(rows.map((row) => row.id)).toEqual([first.expenseId, middle.expenseId, last.expenseId]);
    expect(rows.map((row) => row.evidenceStatus)).toEqual(["확인 전", expect.anything(), "확인 전"]);

    expect(await nextUnreviewedTarget(payer, { afterExpenseId: first.expenseId })).toEqual({ id: last.expenseId, number: last.number });
    // middle(P4)은 unreviewed 필터 목록에 없다 — 정렬 키로 그 뒤를 찾는다.
    expect(await nextUnreviewedTarget(payer, { afterExpenseId: middle.expenseId, evidence: "unreviewed" })).toEqual({ id: last.expenseId, number: last.number });
    expect(await nextUnreviewedTarget(payer, { afterExpenseId: last.expenseId })).toBeNull();
    expect(await nextUnreviewedTarget(payer, { afterExpenseId: first.expenseId, evidence: "missing" })).toBeNull();
    expect(await nextUnreviewedTarget(fx.ceo, { afterExpenseId: first.expenseId })).toBeNull();
    expect(await nextUnreviewedTarget(fx.pm, { afterExpenseId: first.expenseId })).toBeNull();
    // 06.5-08(검토 P2-2): 검색어가 걸리면 그 검색 결과 안에서만 다음 확인 전을 찾는다 — 검색에 안 걸린 마지막 문서로 건너뛰지 않는다.
    expect(await nextUnreviewedTarget(payer, { afterExpenseId: first.expenseId, q: last.number })).toEqual({ id: last.expenseId, number: last.number });
    expect(await nextUnreviewedTarget(payer, { afterExpenseId: first.expenseId, q: middle.number })).toBeNull();
  });
});

// ── 06-20 Task 4 — Phase 5 목록 상태 열(UA-605) ─────────────────────────

describe("Phase 5 상태 열 (06-20 Task 4)", () => {
  it("Phase 5 상태 열 — 지급 기록 → `지급 완료` · 지급일 / 취소만 → `승인` / 기한 지난 선결제 → `증빙 {N}일 경과` / 면제 · 지급 전은 없음", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const today = seoulToday();
    const dueDays = await loadPrepaidDueDays();
    const [lineA, lineB, lineC, lineD, lineE] = await extraLines(fx, 5);
    if (!lineA || !lineB || !lineC || !lineD || !lineE) throw new Error("줄 다섯 필요");
    const [paid, cancelled, overdue, waived] = await paidDocs(payer, fx, [lineA, lineB, lineC, lineD]);
    const [unpaidPrepaid] = await approvedMany(fx, [lineE], false);
    if (!paid || !cancelled || !overdue || !waived || !unpaidPrepaid) throw new Error("문서 다섯 필요");
    await cancelExpensePayment(payer, { expenseId: cancelled.expenseId, reason: "잘못 지급", version: await versionOf(cancelled.expenseId) });
    const past = addDays(today, -(dueDays + 3));
    for (const doc of [overdue, waived, unpaidPrepaid]) await db.update(expenses).set({ prepaid: true, prepaidReason: "해외 결제 선결제" }).where(eq(expenses.id, doc.expenseId));
    for (const doc of [overdue, waived]) await movePayDate(doc.expenseId, past);
    await db.insert(expenseEvidenceReviews).values({ expenseId: waived.expenseId, status: "waived", waiveReason: "해외 결제", reviewedBy: payer.id });

    const rows = (await listExpenses(fx.pm, { status: "approved" })).groups.flatMap((group) => group.rows);
    const rowOf = (doc: ApprovedExpense) => rows.find((row) => row.id === doc.expenseId);
    expect(rowOf(paid)).toMatchObject({ statusWord: "지급 완료", statusDate: today.slice(5) });
    expect(rowOf(paid)?.statusNote ?? null).toBeNull();
    expect(rowOf(cancelled)?.statusWord).toBe("승인");
    expect(rowOf(overdue)).toMatchObject({ statusWord: "지급 완료", statusDate: past.slice(5), statusNote: "증빙 3일 경과" });
    expect(rowOf(waived)).toMatchObject({ statusWord: "지급 완료", statusDate: past.slice(5) });
    expect(rowOf(waived)?.statusNote ?? null).toBeNull();
    expect(rowOf(unpaidPrepaid)?.statusWord).toBe("승인");
    expect(rowOf(unpaidPrepaid)?.statusNote ?? null).toBeNull();
  });
});

// 06.5 D-6520(사용자 카드 10/13 23:44 KST): 일괄 지급도 단건 · 미리보기와 같은 공급가 하나로 셈한다.
describe("일괄 지급 금액 = 공급가 (06.5-07 D-6520)", () => {
  it("증빙 금액 칸에 공급가와 다른 값이 남은 확인됨 문서 — 공급가 기준 스냅숏으로 처리되고 지급 공급가 = 문서 공급가", async () => {
    const payer = await makePayer();
    const doc = await approvedExpenseWithEvidence(await setupExpenseProject());
    const [before] = await db.select({ supplyAmountKrw: expenses.supplyAmountKrw }).from(expenses).where(eq(expenses.id, doc.expenseId));
    const supply = before?.supplyAmountKrw ?? null;
    if (supply === null) throw new Error("공급가 없음");
    const supplyPayable = await payableNow(payer, doc);
    await db.update(expenses).set({ evidenceAmount: supply - 400_000 }).where(eq(expenses.id, doc.expenseId));
    const confirmed = await confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version });

    const result = await completePaymentsBatch(payer, {
      payDate: seoulToday(),
      rows: [{ expenseId: doc.expenseId, expenseVersion: confirmed.version, expectedPayableKrw: supplyPayable }],
    });
    expect(result.blocked).toEqual([]);
    expect(result.processed).toBe(1);
    const [row] = await livePayments(doc.expenseId);
    expect([row?.grossSupplyKrw, row?.payableKrw]).toEqual([supply, supplyPayable]);
  });
});

// 06.5 D-6517(PR-C 독립 검토 P2-1): 두 목록의 머리글이 「지급처」인데 셀이 거래처 이름만 읽어 직원 지급처가 「—」였다.
// 직원 이름은 사람 정보(person.value) — 그 항목이 꺼진 계급에는 키가 실리지 않는다.
describe("지급 대상 · 지급 완료 목록의 직원 지급처 이름 (06.5 D-6517)", () => {
  async function employeePayeeDoc(fx: ExpenseFixture, name: string): Promise<{ doc: ApprovedExpense; payeeUserId: string }> {
    const person = await makePerson(name, DEFAULT_ROLE_ID, "기획1팀");
    await db.update(users).set(testVendorAccount()).where(eq(users.id, person.id));
    const [lineId] = await extraLines(fx, 1);
    const expenseId = (await createExpenseFromLines(fx.pm, { lineIds: [lineId ?? ""] })).created[0]?.expenseId;
    if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
    await changeExpensePayeeUser(fx.pm, { expenseId, userId: person.id, expectedVersion: await versionOf(expenseId) });
    const submitted = await submitReadyDraft(fx.pm, expenseId);
    if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
    const first = await approveDocument(fx.lead, { instanceId: submitted.instanceId, expectedVersion: submitted.version });
    await approveDocument(fx.ceo, { instanceId: submitted.instanceId, expectedVersion: first.version });
    const voider = await makeEvidenceManager("증빙무효", { attach: false, void: true });
    const alive = await db
      .select({ id: files.id })
      .from(files)
      .where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, expenseId), isNull(files.removedAt), isNull(files.voidedAt)));
    for (const file of alive) await voidEvidence(voider, { fileId: file.id, reason: "다른 건 영수증" });
    return { doc: { expenseId, instanceId: submitted.instanceId, number: submitted.number, version: await versionOf(expenseId) }, payeeUserId: person.id };
  }

  it("직원 지급처 문서 — 지급 대상 · 지급 완료 행에 직원 이름(거래처 이름 없음), person.value가 꺼진 계급에는 이름 키가 없다", async () => {
    const payer = await makePayer();
    const blind = await makePayer("사람안보임");
    if (!payer.roleId) throw new Error("계급 없음");
    await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem: "person.value", visible: true });
    const fx = await setupExpenseProject();
    const { doc } = await employeePayeeDoc(fx, "김직원지급");

    const target = rowsOf(await listPaymentTargets(payer, {})).find((row) => row.id === doc.expenseId);
    expect(target).toMatchObject({ vendorName: null, payeeUserName: "김직원지급" });
    const hiddenTarget = rowsOf(await listPaymentTargets(blind, {})).find((row) => row.id === doc.expenseId);
    expect(hiddenTarget).toBeDefined();
    expect(hiddenTarget && "payeeUserName" in hiddenTarget).toBe(false);

    const result = await completePaymentsBatch(payer, { payDate: seoulToday(), rows: [await snapshotOf(payer, doc)] });
    expect(result.processed).toBe(1);
    const paid = paidRowsOf(await listPaidPayments(payer, {})).find((row) => row.id === doc.expenseId);
    expect(paid).toMatchObject({ vendorName: null, payeeUserName: "김직원지급" });
    const hiddenPaid = paidRowsOf(await listPaidPayments(blind, {})).find((row) => row.id === doc.expenseId);
    expect(hiddenPaid).toBeDefined();
    expect(hiddenPaid && "payeeUserName" in hiddenPaid).toBe(false);
  });

  // 06.5 D-6517(PR-C 리뷰): 직원 지급처 계좌이체 행은 거래처 id가 없어 「계좌 없음」으로 보였다. 직원 계좌는 D-6505 게이트
  // (canManagePayoutAccount — 지급 쓰기 ∧ admin.people 보기 ∧ person.value)를 통과한 사람에게만 — 아니면 account 키 자체가 없다.
  it("직원 지급처 계좌 — 게이트 통과자는 S1 행 · 지급 보기에 직원 계좌(마스킹), admin.people 보기가 없는 지급 권한자는 account 키 없음", async () => {
    const manager = await makePayer();
    const payerOnly = await makePayer("사람관리없음");
    if (!manager.roleId || !payerOnly.roleId) throw new Error("계급 없음");
    for (const roleId of [manager.roleId, payerOnly.roleId]) await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "person.value", visible: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId: manager.roleId, menu: "admin.people", action: "view", allowed: true });
    const fx = await setupExpenseProject();
    const { doc, payeeUserId } = await employeePayeeDoc(fx, "김직원계좌");

    const expected = { status: "registered", ownerKind: "user", ownerId: payeeUserId, bank: "신한은행", masked: "****-**-6789", holder: "테스트 예금주", canReveal: false };
    expect(rowsOf(await listPaymentTargets(manager, {})).find((row) => row.id === doc.expenseId)?.account).toEqual(expected);
    expect((await getPaymentView(manager, doc.expenseId))?.account).toEqual(expected);

    const hidden = rowsOf(await listPaymentTargets(payerOnly, {})).find((row) => row.id === doc.expenseId);
    expect(hidden).toBeDefined();
    expect(hidden && "account" in hidden).toBe(false);
    expect(Object.keys((await getPaymentView(payerOnly, doc.expenseId)) ?? {})).not.toContain("account");
  });
});

// 06.5 D-6518(UI-SPEC V13 · 옛 O: server/src/payments.ts:855-866): 일괄 지급은 날짜가 묶음에 하나라 미래 지급일이면 묶음 맨 앞에서 한 번 거절한다 —
// 한 건도 처리하지 않는다(부분 상태 없음). 같은 행을 오늘로 보내면 처리된다.
describe("지급일 오늘까지 — 일괄 (06.5 D-6518)", () => {
  it("내일 지급일 · 3건 → 반복 전에 FuturePayDateError · 처리 0 · 지급 기록 0 / 오늘로 같은 3건 → 3건 처리", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const docs = await approvedMany(fx, await extraLines(fx, 3), false);
    const rows = await Promise.all(docs.map((doc) => snapshotOf(payer, doc)));
    const tomorrow = addDays(seoulToday(), 1);

    const error = await caught(completePaymentsBatch(payer, { payDate: tomorrow, rows }));
    expect(error).toBeInstanceOf(FuturePayDateError);
    expect((error as Error).message).toBe(FUTURE_PAY_DATE);
    for (const doc of docs) {
      expect(await livePayments(doc.expenseId)).toHaveLength(0);
      expect(await versionOf(doc.expenseId)).toBe(doc.version);
    }

    const result = await completePaymentsBatch(payer, { payDate: seoulToday(), rows });
    expect(result.processed).toBe(3);
    expect(result.blocked).toEqual([]);
  });

  // 06.5-11(검토 P3-2): 단건(expense-payments.test.ts)과 같은 주입 시계 경계 — KST 2026-10-13 23:59 = UTC 14:59 · KST 10-14 00:00 = UTC 10-13 15:00(UTC 날짜는 아직 10-13).
  it("주입 시계 KST 경계 — 10-13 23:59엔 지급일 10-14 거절(0건)·10-13 허용, UTC 15:00(= KST 10-14 00:00)엔 10-14 허용", async () => {
    const kstLateNight = new Date("2026-10-13T14:59:00Z");
    const kstMidnight = new Date("2026-10-13T15:00:00Z");
    const payer = await makePayer();
    const { a, b } = await twoPayable();
    const rowsAt = async (payDate: string, now: Date) =>
      Promise.all(
        [a, b].map(async (doc) => {
          const preview = await previewPayable(payer, { expenseId: doc.expenseId, payDate }, { now });
          if (preview.payableKrw === undefined || preview.payableKrw === null) throw new Error("지급 총액을 셈할 수 없는 문서");
          return { expenseId: doc.expenseId, expenseVersion: doc.version, expectedPayableKrw: preview.payableKrw };
        }),
      );

    const refused = await caught(completePaymentsBatch(payer, { payDate: "2026-10-14", rows: await rowsAt("2026-10-13", kstLateNight) }, { now: kstLateNight }));
    expect(refused).toBeInstanceOf(FuturePayDateError);
    for (const doc of [a, b]) {
      expect(await livePayments(doc.expenseId)).toHaveLength(0);
      expect(await versionOf(doc.expenseId)).toBe(doc.version);
    }

    const midnight = await completePaymentsBatch(payer, { payDate: "2026-10-14", rows: await rowsAt("2026-10-14", kstMidnight) }, { now: kstMidnight });
    expect(midnight.processed).toBe(2);
    expect(midnight.blocked).toEqual([]);
  });

  it("주입 시계 KST 10-13 23:59에 지급일 = 오늘(10-13) → 일괄 지급된다", async () => {
    const kstLateNight = new Date("2026-10-13T14:59:00Z");
    const payer = await makePayer();
    const { a, b } = await twoPayable();
    const rows = await Promise.all(
      [a, b].map(async (doc) => ({ expenseId: doc.expenseId, expenseVersion: doc.version, expectedPayableKrw: await payableNow(payer, doc, "2026-10-13") })),
    );
    const result = await completePaymentsBatch(payer, { payDate: "2026-10-13", rows }, { now: kstLateNight });
    expect(result.processed).toBe(2);
    expect(result.blocked).toEqual([]);
  });

  it("액션 — 내일 지급일은 서버 오류 `미래 지급일 · 오늘까지 날짜 고르기`(대화상자가 지급일 칸 오류로 세우는 글자) · 지급 0건", async () => {
    const payer = await makePayer();
    const { a, b } = await twoPayable();
    const rows = [await snapshotOf(payer, a), await snapshotOf(payer, b)];
    session.viewer = payer;

    const result = await completePaymentsBatchAction({ payDate: addDays(seoulToday(), 1), rows });
    expect(result?.data).toBeUndefined();
    expect(result?.serverError).toBe(FUTURE_PAY_DATE);
    expect(await livePayments(a.expenseId)).toHaveLength(0);
    expect(await livePayments(b.expenseId)).toHaveLength(0);
  });
});
