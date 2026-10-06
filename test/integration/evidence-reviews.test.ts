import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { actionLog, expenseEvidenceReviews, expenses } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { completeExpensePayment, getPaymentView, previewPayable } from "@/domain/payments";
import { confirmEvidence } from "@/domain/evidence-reviews";
import { ForbiddenError } from "@/domain/permissions/can";
import { seoulToday } from "@/lib/dates";
import { confirmEvidenceAction } from "@/app/(app)/expenses/[id]/actions";
import { setupExpenseProject } from "./fixtures/expenses";
import { approvedExpenseWithEvidence, makePaymentManager, setEvidenceRequired, type ApprovedExpense } from "./fixtures/payments";

// 06-06(EVID-02 · EVID-03 · D-601 · D-602 · O-2) — 경영관리의 증빙 확인(S4). 확인 기록(06-27 expense_evidence_reviews) · 금액 고쳐 확인 ·
// 확인 전 지급 막힘 · 증빙 지문 · Q-F 초과 한 줄(표시만) · EA-1. 06-11 · 06-15 · 06-17이 아래 `it` 이름으로 다시 본다.

const session = vi.hoisted(() => ({ viewer: null as Viewer | null }));
vi.mock("@/lib/viewer", () => ({
  getSession: () => Promise.resolve(session.viewer ? { viewer: session.viewer, user: { id: session.viewer.id } } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

beforeEach(async () => {
  await setEvidenceRequired(false);
});

// 지급 권한자 + 금액 · 값 정보 항목 노출.
async function makePayer(name?: string): Promise<Viewer> {
  const payer = await makePaymentManager(name);
  if (!payer.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: true });
  return payer;
}

async function docRow(expenseId: string) {
  const [row] = await db
    .select({ version: expenses.version, evidenceAmount: expenses.evidenceAmount, supplyAmountKrw: expenses.supplyAmountKrw })
    .from(expenses)
    .where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row;
}

async function reviewOf(expenseId: string) {
  const [row] = await db.select().from(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, expenseId));
  return row ?? null;
}

async function logsOf(expenseId: string, actionType: string) {
  return db
    .select({ detail: actionLog.detail, actorId: actionLog.actorId })
    .from(actionLog)
    .where(and(eq(actionLog.entityId, expenseId), eq(actionLog.actionType, actionType)))
    .orderBy(actionLog.occurredAt);
}

// 테스트 준비 전용 — 기안자 입력(06-10)이 아직 없어 증빙 금액을 이 문서 행에만 직접 적는다(version은 그대로).
async function withEvidenceAmount(doc: ApprovedExpense, amountKrw: number): Promise<ApprovedExpense> {
  await db.update(expenses).set({ evidenceAmount: amountKrw }).where(eq(expenses.id, doc.expenseId));
  return doc;
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe("증빙 확인 트레이서 (06-06 Task 1)", () => {
  it("금액 고침 없는 확인 → 확인 기록 confirmed · document_update · version + 1 · 응답 { version, evidenceStatus: 확인됨, actionRow: P4 }", async () => {
    const payer = await makePayer();
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(await setupExpenseProject()), 12_400_000);

    const result = await confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version });

    const row = await docRow(doc.expenseId);
    expect(result.version).toBe(doc.version + 1);
    expect(row.version).toBe(result.version);
    expect(result.evidenceStatus).toBe("확인됨");
    expect(result.actionRow).toMatchObject({ row: "P4", primary: "pay" });
    const review = await reviewOf(doc.expenseId);
    expect(review).toMatchObject({ status: "confirmed", amountBeforeKrw: null, amountAfterKrw: null, reviewedBy: payer.id, waiveReason: null });
    expect((await logsOf(doc.expenseId, "document_update")).at(-1)).toMatchObject({ actorId: payer.id, detail: { field: "evidenceReview", status: "confirmed" } });
    expect(row.evidenceAmount).toBe(12_400_000);
  });

  it("확인한 문서는 이어서 지급 완료된다 — 증빙 금액이 지급 총액의 기준", async () => {
    const payer = await makePayer();
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(await setupExpenseProject()), 12_000_000);
    const confirmed = await confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version });
    const preview = await previewPayable(payer, { expenseId: doc.expenseId, payDate: seoulToday() });
    if (preview.payableKrw === null || preview.payableKrw === undefined) throw new Error("지급 총액 없음");

    const paid = await completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw: preview.payableKrw, version: confirmed.version });
    expect(paid.version).toBe(confirmed.version + 1);
  });

  it("confirmEvidenceAction — 액션이 도메인 응답 { version, evidenceStatus, actionRow }를 그대로 돌려준다", async () => {
    const payer = await makePayer();
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(await setupExpenseProject()), 12_400_000);
    session.viewer = payer;

    const result = await confirmEvidenceAction({ expenseId: doc.expenseId, version: doc.version });
    expect(result?.serverError).toBeUndefined();
    expect(result?.data).toMatchObject({ version: doc.version + 1, evidenceStatus: "확인됨", actionRow: { row: "P4" } });
  });

  it("getPaymentView — 확인 전 문서는 P2(1차 `증빙 확인` · 3차 `바꾸기`)와 증빙 상태 · 증빙 금액 · 입력자를 싣는다", async () => {
    const payer = await makePayer();
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(await setupExpenseProject()), 12_400_000);

    const view = await getPaymentView(payer, doc.expenseId);
    expect(view?.row).toMatchObject({ row: "P2", primary: "confirm", tertiary: "change" });
    expect(view?.evidenceStatus).toBe("확인 전");
    expect(view?.evidenceAmountKrw).toBe(12_400_000);
    expect(view?.evidenceAmountDisplay).toMatchObject({ valueKrw: 12_400_000, enteredByName: "박서연" });

    const confirmed = await confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version });
    const after = await getPaymentView(payer, doc.expenseId);
    expect(after?.version).toBe(confirmed.version);
    expect(after?.evidenceStatus).toBe("확인됨");
    expect(after?.row).toMatchObject({ row: "P4", primary: "pay" });
    expect(after?.reviewLine).toMatchObject({ byName: "경영관리" });
  });

  it("지급 권한 없는 기안자 → 확인 거부 · 확인 기록 없음 · version 그대로(D-601)", async () => {
    const fx = await setupExpenseProject();
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(fx), 12_400_000);
    const error = await caught(confirmEvidence(fx.pm, { expenseId: doc.expenseId, version: doc.version }));
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(await reviewOf(doc.expenseId)).toBeNull();
    expect((await docRow(doc.expenseId)).version).toBe(doc.version);
  });

  it("확인 기록 upsert는 문서당 한 줄(ON CONFLICT) — 다시 확인해도 줄이 늘지 않고 기록 version이 오른다", async () => {
    const payer = await makePayer();
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(await setupExpenseProject()), 12_400_000);
    const first = await confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version });
    await confirmEvidence(payer, { expenseId: doc.expenseId, version: first.version });
    const [count] = await db
      .select({ n: sql<number>`count(*)::int`, version: sql<number>`max(${expenseEvidenceReviews.version})::int` })
      .from(expenseEvidenceReviews)
      .where(eq(expenseEvidenceReviews.expenseId, doc.expenseId));
    expect(count).toEqual({ n: 1, version: 2 });
  });
});
