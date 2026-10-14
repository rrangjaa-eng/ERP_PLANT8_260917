import { and, desc, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { actionLog, codeItems, expenses, quoteLines, quoteRevisions } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { completeExpensePayment } from "@/domain/payments";
import { setupExpenseProject, type ExpenseFixture } from "./fixtures/expenses";
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
async function otherIncomeExpense(fx: ExpenseFixture, supplyKrw: number): Promise<ApprovedExpense> {
  const doc = await approvedExpenseWithoutEvidence(fx);
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

async function pay(payer: Viewer, doc: ApprovedExpense, payableKrw: number) {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, doc.expenseId));
  if (!row) throw new Error("지출결의 없음");
  return completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw: payableKrw, version: row.version });
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
