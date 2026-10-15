import { randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { actionLog, codeItems, expenses, files, projects, quoteLines, quoteRevisions } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { archiveQuoteLines, restoreQuoteLineRow, setQuoteLineArchived, updateQuoteLineIfVersionMatches, type QuoteLineRow } from "@/repositories/quote-lines";
import { cancelExpensePayment, completeExpensePayment } from "@/domain/payments";
import { completePaymentsBatch } from "@/domain/payments/batch";
import { syncTaxAdjustmentLine } from "@/domain/payments/adjustment-line";
import { createRevisionFromCurrent } from "@/domain/quotes/revisions";
import { approveDocument } from "@/domain/approvals";
import { createTeamExpenseDraft, listExpenseFormOptions, saveExpenseDraft } from "@/domain/expenses";
import { can } from "@/domain/permissions/can";
import { insertVendor } from "@/repositories/vendors";
import { withTransaction } from "@/lib/db-transaction";
import { seoulToday } from "@/lib/dates";
import { voidEvidence } from "@/domain/evidence";
import { makeEvidenceManager, setupExpenseProject, submitReadyDraft, type ExpenseFixture, testVendorAccount } from "./fixtures/expenses";
import { approvedExpenseWithoutEvidence, makePaymentManager, setEvidenceRequired, type ApprovedExpense } from "./fixtures/payments";

// 06.5 D-6502 — 지급 완료 때 회사 대납 기타소득 세액을 그 프로젝트 현재 차수에 조정 줄 「기타소득세 대납 · {문서번호}」로 세운다.
// 시드에 기대지 않는다 — 증빙 종류 other_income 코드 항목을 06.5-01 정본 jsonb(company_borne)로 직접 둔다.

const COMPANY_BORNE = { ruleKind: "company_borne", roundingUnit: 10, roundingMethod: "truncate", minWithholdingAmount: 0, basisDate: "payment_date" };

beforeEach(async () => {
  await setEvidenceRequired(false);
  await db
    .update(codeItems)
    .set({ taxRule: COMPANY_BORNE })
    .where(and(eq(codeItems.tableKey, "evidence_type"), eq(codeItems.value, "other_income")));
});

async function makePayer(): Promise<Viewer> {
  const payer = await makePaymentManager();
  if (!payer.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: true });
  return payer;
}

// 결재 통과 · 증빙 0 문서를 기타소득(회사 대납) · 원화 공급가로 바꾼다.
async function otherIncomeExpense(fx: ExpenseFixture, supplyKrw: number, lineId: string = fx.lines.withVendor): Promise<ApprovedExpense> {
  const doc = await approvedExpenseWithoutEvidence(fx, lineId);
  await db
    .update(expenses)
    .set({ evidenceType: "other_income", supplyCurrency: "KRW", supplyForeignAmount: null, supplyFxRate: "1", supplyAmountKrw: supplyKrw })
    .where(eq(expenses.id, doc.expenseId));
  return doc;
}

async function linkedLines(expenseId: string) {
  return db.select().from(quoteLines).where(eq(quoteLines.sourceExpenseId, expenseId));
}

async function latestRevisionId(projectId: string): Promise<string> {
  const [row] = await db.select({ id: quoteRevisions.id }).from(quoteRevisions).where(eq(quoteRevisions.projectId, projectId)).orderBy(desc(quoteRevisions.seq)).limit(1);
  if (!row) throw new Error("차수 없음");
  return row.id;
}

async function lastDetail(expenseId: string, actionType: string): Promise<Record<string, unknown>> {
  const [row] = await db
    .select({ detail: actionLog.detail })
    .from(actionLog)
    .where(and(eq(actionLog.entityId, expenseId), eq(actionLog.actionType, actionType)))
    .orderBy(desc(actionLog.occurredAt))
    .limit(1);
  if (!row) throw new Error(`기록 없음: ${actionType}`);
  return row.detail as Record<string, unknown>;
}

async function versionOf(expenseId: string): Promise<number> {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row.version;
}

async function pay(payer: Viewer, doc: { expenseId: string }, payableKrw: number) {
  return completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw: payableKrw, version: await versionOf(doc.expenseId) });
}

async function cancel(payer: Viewer, doc: { expenseId: string }) {
  return cancelExpensePayment(payer, { expenseId: doc.expenseId, reason: "잘못 지급", version: await versionOf(doc.expenseId) });
}

async function lineOf(id: string): Promise<QuoteLineRow> {
  const [row] = await db.select().from(quoteLines).where(eq(quoteLines.id, id));
  if (!row) throw new Error("줄 없음");
  return row;
}

async function onlyLinked(expenseId: string): Promise<QuoteLineRow> {
  const lines = await linkedLines(expenseId);
  if (lines.length !== 1 || !lines[0]) throw new Error(`연결 줄이 ${lines.length}개`);
  return lines[0];
}

function countLinked(lines: QuoteLineRow[]) {
  return { live: lines.filter((row) => row.archivedAt === null).length, archived: lines.filter((row) => row.archivedAt !== null).length };
}

// 사람이 견적 표에서 실행가를 고친 것과 같은 저수준 갱신 — version만 +1(동기 버전은 그대로 → 손 편집).
async function handEdit(line: QuoteLineRow, executionKrw: number): Promise<QuoteLineRow> {
  const { customFields: _customFields, ...rest } = line;
  void _customFields;
  const updated = await updateQuoteLineIfVersionMatches(SYSTEM_VIEWER, line.id, line.version, { revisionId: line.revisionId }, {
    ...rest,
    executionAmountKrw: executionKrw,
    profitKrw: -executionKrw,
  });
  if (!updated) throw new Error("손 편집 실패");
  return updated;
}

// 결재 통과 팀 비용(프로젝트 없음) — 같은 문서를 기타소득(회사 대납)으로 바꾼다.
async function approvedTeamOtherIncome(fx: ExpenseFixture, supplyKrw: number): Promise<{ expenseId: string }> {
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: "강사", normalizedName: `강사-${randomUUID()}`, defaultEvidenceType: "tax_invoice", ...testVendorAccount() });
  const { expenseId } = await createTeamExpenseDraft(fx.lead, { idempotencyKey: randomUUID(), fields: { teamExpenseKind: "team_overhead", usageDate: "2026-09-26", content: "팀 강의" } });
  const payment = (await listExpenseFormOptions(fx.lead)).payment[0]?.value ?? null;
  await saveExpenseDraft(fx.lead, {
    expenseId,
    expectedVersion: await versionOf(expenseId),
    fields: { vendorId: vendor.id, evidenceType: "tax_invoice", paymentMethod: payment, supply: { currency: "KRW", amount: supplyKrw, fxRate: 1 } },
  });
  const submitted = await submitReadyDraft(fx.lead, expenseId);
  if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
  const first = await approveDocument(fx.lead, { instanceId: submitted.instanceId, expectedVersion: submitted.version });
  const final = await approveDocument(fx.ceo, { instanceId: submitted.instanceId, expectedVersion: first.version });
  if (final.status !== "approved") throw new Error(`결재 통과 안 됨: ${final.status}`);
  // 증빙 0(증빙 필수 꺼짐) — approvedExpenseWithoutEvidence와 같은 꼴로 붙인 증빙을 무효 처리한다(확인 게이트를 비켜 간다).
  const voider = await makeEvidenceManager("증빙무효", { attach: false, void: true });
  const alive = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, expenseId), isNull(files.removedAt), isNull(files.voidedAt)));
  for (const file of alive) await voidEvidence(voider, { fileId: file.id, reason: "다른 건 영수증" });
  await db.update(expenses).set({ evidenceType: "other_income" }).where(eq(expenses.id, expenseId));
  return { expenseId };
}

describe("지급 완료 → 기타소득세 대납 조정 줄(06.5 D-6502)", () => {
  it("프로젝트에 매인 회사 대납 문서를 지급 완료하면 현재 차수 끝에 「기타소득세 대납 · {번호}」 조정 줄이 하나 선다(견적가 0 · 실행가 = 세액 · 차익 서버 계산)", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const doc = await otherIncomeExpense(fx, 100_000);
    const revisionId = await latestRevisionId(fx.projectId);
    const before = await db.select({ sortOrder: quoteLines.sortOrder }).from(quoteLines).where(and(eq(quoteLines.revisionId, revisionId), isNull(quoteLines.archivedAt)));
    const maxSort = Math.max(...before.map((row) => row.sortOrder));

    await pay(payer, doc, 100_000);

    const lines = await linkedLines(doc.expenseId);
    expect(lines).toHaveLength(1);
    const [line] = lines;
    if (!line) throw new Error("줄 없음");
    expect({
      revisionId: line.revisionId,
      lineKind: line.lineKind,
      subcategory: line.subcategory,
      itemName: line.itemName,
      quantity: line.quantity,
      unitPriceAmountKrw: line.unitPriceAmountKrw,
      quoteAmountKrw: line.quoteAmountKrw,
      executionCurrency: line.executionCurrency,
      executionAmountKrw: line.executionAmountKrw,
      profitKrw: line.profitKrw,
      lineStatus: line.lineStatus,
      archivedAt: line.archivedAt,
      sourceSyncedVersion: line.sourceSyncedVersion,
      sortOrder: line.sortOrder,
    }).toEqual({
      revisionId,
      lineKind: "adjustment",
      subcategory: "adjustment",
      itemName: `기타소득세 대납 · ${doc.number}`,
      quantity: "1.00",
      unitPriceAmountKrw: 0,
      quoteAmountKrw: 0,
      executionCurrency: "KRW",
      executionAmountKrw: 28_200,
      profitKrw: -28_200,
      lineStatus: "not_started",
      archivedAt: null,
      sourceSyncedVersion: line.version,
      sortOrder: maxSort + 1,
    });
  });

  it("그 지급의 payment_process 기록 detail에 조정 줄 id · 세액 · 손 편집 건너뜀 여부가 실린다", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const doc = await otherIncomeExpense(fx, 100_000);

    await pay(payer, doc, 100_000);

    const [line] = await linkedLines(doc.expenseId);
    const detail = await lastDetail(doc.expenseId, "payment_process");
    expect({ adjustmentLineId: detail.adjustmentLineId, adjustmentKrw: detail.adjustmentKrw, handEditedSkip: detail.handEditedSkip }).toEqual({
      adjustmentLineId: line?.id,
      adjustmentKrw: 28_200,
      handEditedSkip: false,
    });
  });
});

describe("조정 줄 갈래 — 취소 · 재지급 · 손 편집 · 사람이 지운 줄(06.5 D-6502 · EP1-5 · EP2-A1 · OI-12)", () => {
  it("손 편집 없는 줄 + 지급 취소 → 그 줄 보관 · payment_cancel detail에 줄 id · 0 · 손 편집 아님", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const doc = await otherIncomeExpense(fx, 100_000);
    await pay(payer, doc, 100_000);
    const line = await onlyLinked(doc.expenseId);

    await cancel(payer, doc);

    expect((await lineOf(line.id)).archivedAt).not.toBeNull();
    const detail = await lastDetail(doc.expenseId, "payment_cancel");
    expect({ adjustmentLineId: detail.adjustmentLineId, adjustmentKrw: detail.adjustmentKrw, handEditedSkip: detail.handEditedSkip }).toEqual({
      adjustmentLineId: line.id,
      adjustmentKrw: 0,
      handEditedSkip: false,
    });
  });

  it("취소 뒤 다시 지급 → 새 줄 하나(살아 있는 줄 1 · 보관 줄 1)", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const doc = await otherIncomeExpense(fx, 100_000);
    await pay(payer, doc, 100_000);
    await cancel(payer, doc);

    await pay(payer, doc, 100_000);

    expect(countLinked(await linkedLines(doc.expenseId))).toEqual({ live: 1, archived: 1 });
  });

  it("(EP1-5) 지급 → 새 차수(조정 줄 이동) → 동기 버전이 version과 같이 오른다 → 취소하면 보관 → 재지급이 새 줄을 만든다(유일 색인에 막히지 않음)", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const doc = await otherIncomeExpense(fx, 100_000);
    await pay(payer, doc, 100_000);
    const before = await onlyLinked(doc.expenseId);

    const created = await createRevisionFromCurrent(fx.pm, { projectId: fx.projectId, fromRevisionId: before.revisionId });

    const moved = await lineOf(before.id);
    expect({ revisionId: moved.revisionId, version: moved.version, synced: moved.sourceSyncedVersion }).toEqual({
      revisionId: created.revisionId,
      version: before.version + 1,
      synced: before.version + 1,
    });
    await cancel(payer, doc);
    expect((await lineOf(before.id)).archivedAt).not.toBeNull();
    await pay(payer, doc, 100_000);
    expect(countLinked(await linkedLines(doc.expenseId))).toEqual({ live: 1, archived: 1 });
  });

  it("(EP1-5) 사람이 고친 줄은 새 차수 뒤에도 손 편집이다 → 취소해도 그대로 · detail handEditedSkip", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const doc = await otherIncomeExpense(fx, 100_000);
    await pay(payer, doc, 100_000);
    const edited = await handEdit(await onlyLinked(doc.expenseId), 30_000);

    await createRevisionFromCurrent(fx.pm, { projectId: fx.projectId, fromRevisionId: edited.revisionId });
    const moved = await lineOf(edited.id);
    expect(moved.version).not.toBe(moved.sourceSyncedVersion);

    await cancel(payer, doc);

    expect(await lineOf(edited.id)).toMatchObject({ archivedAt: null, executionAmountKrw: 30_000, version: moved.version });
    expect((await lastDetail(doc.expenseId, "payment_cancel")).handEditedSkip).toBe(true);
  });

  it("사람이 고친 줄 → 취소해도 그대로 · 다시 지급해도 새 줄 없이 그 줄 그대로(살아 있는 연결 줄 1)", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const doc = await otherIncomeExpense(fx, 100_000);
    await pay(payer, doc, 100_000);
    const edited = await handEdit(await onlyLinked(doc.expenseId), 30_000);

    await cancel(payer, doc);
    const cancelDetail = await lastDetail(doc.expenseId, "payment_cancel");
    expect({ id: cancelDetail.adjustmentLineId, krw: cancelDetail.adjustmentKrw, skip: cancelDetail.handEditedSkip }).toEqual({ id: null, krw: 0, skip: true });
    await pay(payer, doc, 100_000);

    const lines = await linkedLines(doc.expenseId);
    expect(lines.map((row) => ({ id: row.id, archivedAt: row.archivedAt, executionAmountKrw: row.executionAmountKrw, version: row.version }))).toEqual([
      { id: edited.id, archivedAt: null, executionAmountKrw: 30_000, version: edited.version },
    ]);
    expect((await lastDetail(doc.expenseId, "payment_process")).handEditedSkip).toBe(true);
  });

  it("(OI-12 · EP2-A6 ③) 사람이 규칙 줄을 지운 뒤 취소 → 아무 일 없음 · detail 줄 id 없음 · 그 줄 version이 보관 때 +1", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const doc = await otherIncomeExpense(fx, 100_000);
    await pay(payer, doc, 100_000);
    const line = await onlyLinked(doc.expenseId);

    expect(await archiveQuoteLines(SYSTEM_VIEWER, { ids: [line.id], revisionId: line.revisionId, archivedBy: fx.pm.id, archivedAt: new Date() })).toBe(1);
    const archived = await lineOf(line.id);
    expect({ version: archived.version, synced: archived.sourceSyncedVersion }).toEqual({ version: line.version + 1, synced: line.sourceSyncedVersion });

    await cancel(payer, doc);

    expect(await lineOf(line.id)).toMatchObject({ version: archived.version, archivedAt: archived.archivedAt });
    const detail = await lastDetail(doc.expenseId, "payment_cancel");
    expect({ id: detail.adjustmentLineId, krw: detail.adjustmentKrw, skip: detail.handEditedSkip }).toEqual({ id: null, krw: 0, skip: false });
  });

  it("(OI-12) 견적 줄 삭제 경로로 사람이 지운 규칙 줄 → 취소 → 다시 지급해도 새로 서지 않는다(살아 있는 0 · 보관 1) · detail 손 편집 건너뜀", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const doc = await otherIncomeExpense(fx, 100_000);
    await pay(payer, doc, 100_000);
    const line = await onlyLinked(doc.expenseId);
    await archiveQuoteLines(SYSTEM_VIEWER, { ids: [line.id], revisionId: line.revisionId, archivedBy: fx.pm.id, archivedAt: new Date() });

    await cancel(payer, doc);
    await pay(payer, doc, 100_000);

    expect(countLinked(await linkedLines(doc.expenseId))).toEqual({ live: 0, archived: 1 });
    const detail = await lastDetail(doc.expenseId, "payment_process");
    expect({ id: detail.adjustmentLineId, krw: detail.adjustmentKrw, skip: detail.handEditedSkip }).toEqual({ id: null, krw: 0, skip: true });
  });

  it("(OI-12) 보관함 범용 보관도 같다 · 연결 없는 일반 줄을 사람이 지우면 version 그대로", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const doc = await otherIncomeExpense(fx, 100_000);
    await pay(payer, doc, 100_000);
    const line = await onlyLinked(doc.expenseId);
    expect(await setQuoteLineArchived(fx.pm, line.id, true)).toBe(true);
    expect((await lineOf(line.id)).version).toBe(line.version + 1);

    await cancel(payer, doc);
    await pay(payer, doc, 100_000);
    expect(countLinked(await linkedLines(doc.expenseId))).toEqual({ live: 0, archived: 1 });
    expect((await lastDetail(doc.expenseId, "payment_process")).handEditedSkip).toBe(true);

    const plain = await lineOf(fx.lines.noVendor);
    expect(await setQuoteLineArchived(fx.pm, plain.id, true)).toBe(true);
    expect((await lineOf(plain.id)).version).toBe(plain.version);
    const other = await lineOf(fx.lines.split);
    expect(await archiveQuoteLines(SYSTEM_VIEWER, { ids: [other.id], revisionId: other.revisionId, archivedBy: fx.pm.id, archivedAt: new Date() })).toBe(1);
    expect((await lineOf(other.id)).version).toBe(other.version);
  });

  it("(EP2-A1) 취소된 지급의 보관 줄 복원 → 0행 · 재지급 뒤 옛 줄 복원 → 0행 · 23505 없음 · 지급이 살아 있고 형제 없는 사람 보관 줄은 복원된다", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const doc = await otherIncomeExpense(fx, 100_000);
    await pay(payer, doc, 100_000);
    const first = await onlyLinked(doc.expenseId);
    await cancel(payer, doc);

    expect(await restoreQuoteLineRow(SYSTEM_VIEWER, first.id)).toBeNull();
    expect(await setQuoteLineArchived(fx.pm, first.id, false)).toBe(false);
    expect((await lineOf(first.id)).archivedAt).not.toBeNull();

    await pay(payer, doc, 100_000);
    expect(await restoreQuoteLineRow(SYSTEM_VIEWER, first.id)).toBeNull();
    expect(await setQuoteLineArchived(fx.pm, first.id, false)).toBe(false);
    expect(countLinked(await linkedLines(doc.expenseId))).toEqual({ live: 1, archived: 1 });

    const second = (await linkedLines(doc.expenseId)).find((row) => row.archivedAt === null);
    if (!second) throw new Error("살아 있는 줄 없음");
    await setQuoteLineArchived(fx.pm, second.id, true);
    expect((await restoreQuoteLineRow(SYSTEM_VIEWER, second.id))?.id).toBe(second.id);
    await setQuoteLineArchived(fx.pm, second.id, true);
    expect(await setQuoteLineArchived(fx.pm, second.id, false)).toBe(true);
    expect(countLinked(await linkedLines(doc.expenseId))).toEqual({ live: 1, archived: 1 });
  });

  it("(EP2-A6 ⑤) 쓰기 0행(잠금 전 읽은 줄이 그사이 보관됨) → 실패하지 않고 줄 갱신 없음 · 줄 id 없음 / 손 편집 없는 살아 있는 줄은 세액 · 항목 · 차익을 고치고 동기 버전을 같이 올린다", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const doc = await otherIncomeExpense(fx, 100_000);
    await pay(payer, doc, 100_000);
    const line = await onlyLinked(doc.expenseId);
    const input = (liveLine: QuoteLineRow) => ({ projectId: fx.projectId, expenseId: doc.expenseId, documentNumber: doc.number, companyBorneKrw: 50_000, liveLine });

    const updated = await withTransaction((tx) => syncTaxAdjustmentLine(payer, input(line), tx));
    expect(updated).toEqual({ adjustmentLineId: line.id, adjustmentKrw: 50_000, handEditedSkip: false });
    const synced = await lineOf(line.id);
    expect({ execution: synced.executionAmountKrw, profit: synced.profitKrw, version: synced.version, synced: synced.sourceSyncedVersion }).toEqual({
      execution: 50_000,
      profit: -50_000,
      version: line.version + 1,
      synced: line.version + 1,
    });

    await db.update(quoteLines).set({ archivedAt: new Date(), archivedBy: fx.pm.id }).where(eq(quoteLines.id, line.id));
    const stale = await withTransaction((tx) => syncTaxAdjustmentLine(payer, input(synced), tx));
    expect(stale).toEqual({ adjustmentLineId: null, adjustmentKrw: 0, handEditedSkip: false });
    expect((await lineOf(line.id)).executionAmountKrw).toBe(50_000);
  });

  it("공급가 39,000(면제 — 세전 50,000) → 지급 뒤 연결 줄 0 · detail 0 · 줄 id 없음", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const doc = await otherIncomeExpense(fx, 39_000);

    await pay(payer, doc, 39_000);

    expect(await linkedLines(doc.expenseId)).toHaveLength(0);
    const detail = await lastDetail(doc.expenseId, "payment_process");
    expect({ id: detail.adjustmentLineId, krw: detail.adjustmentKrw }).toEqual({ id: null, krw: 0 });
  });

  it("팀 비용 문서(프로젝트 없음 · 회사 대납) → 줄 0", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const doc = await approvedTeamOtherIncome(fx, 100_000);

    await pay(payer, doc, 100_000);

    expect(await linkedLines(doc.expenseId)).toHaveLength(0);
  });

  it("완료 프로젝트 문서 · 조정 줄 권한 없는 지급자 → 줄이 선다", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const doc = await otherIncomeExpense(fx, 100_000);
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, fx.projectId));
    expect(await can(payer, "projects.adjustment", "write")).toBe(false);

    await pay(payer, doc, 100_000);

    expect(await linkedLines(doc.expenseId)).toHaveLength(1);
  });

  it("일괄 지급 두 건 → 문서마다 줄 하나씩", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const docA = await otherIncomeExpense(fx, 100_000);
    const docB = await otherIncomeExpense(fx, 200_000, fx.lines.split);

    const result = await completePaymentsBatch(payer, {
      payDate: seoulToday(),
      rows: [
        { expenseId: docA.expenseId, expectedPayableKrw: 100_000, expenseVersion: await versionOf(docA.expenseId) },
        { expenseId: docB.expenseId, expectedPayableKrw: 200_000, expenseVersion: await versionOf(docB.expenseId) },
      ],
    });

    expect(result.blocked).toEqual([]);
    const live = await db.select({ sourceExpenseId: quoteLines.sourceExpenseId, executionAmountKrw: quoteLines.executionAmountKrw }).from(quoteLines).where(and(isNotNull(quoteLines.sourceExpenseId), isNull(quoteLines.archivedAt)));
    expect(live.filter((row) => row.sourceExpenseId === docA.expenseId)).toEqual([{ sourceExpenseId: docA.expenseId, executionAmountKrw: 28_200 }]);
    expect(live.filter((row) => row.sourceExpenseId === docB.expenseId)).toEqual([{ sourceExpenseId: docB.expenseId, executionAmountKrw: 56_410 }]);
  });
});
