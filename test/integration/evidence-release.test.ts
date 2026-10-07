import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { actionLog, approvalInstances, expenseEvidenceReviews, expenses } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { completeExpensePayment, previewPayable } from "@/domain/payments";
import { confirmEvidence, EvidenceReviewConflictError, waiveEvidence } from "@/domain/evidence-reviews";
import { rejectDocument } from "@/domain/approvals";
import { createExpenseFromLines } from "@/domain/expenses";
import { removeEvidence } from "@/domain/evidence";
import { seoulToday } from "@/lib/dates";
import { attachEvidence, makeEvidenceManager, setupExpenseProject, submitReadyDraft } from "./fixtures/expenses";
import { approvedExpenseWithEvidence, makePaymentManager, setEvidenceRequired, type ApprovedExpense } from "./fixtures/payments";

// 06-11(EVID-02 · EVID-03 · EVID-04 · C4 · B-1 · U-4 · X-12 · E-49) — 증빙 수명 주기: 결재 통과 문서의 증빙 추가 · 무효가 확인을 풀고 문서 version을 올린다.
// 06-06 · 06-10 · 05가 이 파일의 `it` 이름으로 다시 본다(이름을 바꾸지 않는다).

beforeEach(async () => {
  await setEvidenceRequired(false);
});

async function makePayer(name?: string): Promise<Viewer> {
  const payer = await makePaymentManager(name);
  if (!payer.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: true });
  return payer;
}

async function docRow(expenseId: string) {
  const [row] = await db.select({ version: expenses.version, evidenceAmount: expenses.evidenceAmount, evidenceDate: expenses.evidenceDate }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row;
}

async function reviewOf(expenseId: string) {
  const [row] = await db.select().from(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, expenseId));
  return row ?? null;
}

async function instanceVersion(expenseId: string): Promise<number> {
  const [row] = await db.select({ version: approvalInstances.version }).from(approvalInstances).where(eq(approvalInstances.documentId, expenseId));
  if (!row) throw new Error("결재 인스턴스 없음");
  return row.version;
}

async function evidenceLogs(expenseId: string, change: string) {
  const rows = await db.select({ detail: actionLog.detail }).from(actionLog).where(and(eq(actionLog.documentId, expenseId), eq(actionLog.actionType, "document_update")));
  return rows.map((row) => row.detail as Record<string, unknown>).filter((detail) => detail.change === change);
}

// 테스트 준비 전용 — 기안자 입력(06-10)이 있는 문서처럼 증빙 금액을 이 문서 행에만 적는다(version은 그대로).
async function withEvidenceAmount(doc: ApprovedExpense, amountKrw: number, evidenceDate = "2026-09-20"): Promise<ApprovedExpense> {
  await db.update(expenses).set({ evidenceAmount: amountKrw, evidenceDate }).where(eq(expenses.id, doc.expenseId));
  return doc;
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe("증빙 수명 주기 트레이서 (06-11 Task 1)", () => {
  it("승인 뒤 기안자가 증빙을 더하면 확인됨 → 확인 전 · 확인 기록 지움 · 문서 version + 1 · 결재 인스턴스 version + 1 · 로그 reviewReleased", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(fx), 12_400_000);
    const confirmed = await confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version });
    expect(await reviewOf(doc.expenseId)).toMatchObject({ status: "confirmed" });
    const instanceBefore = await instanceVersion(doc.expenseId);

    const file = await attachEvidence(fx.pm, doc.expenseId);

    expect(await reviewOf(doc.expenseId)).toBeNull();
    expect((await docRow(doc.expenseId)).version).toBe(confirmed.version + 1);
    expect(await instanceVersion(doc.expenseId)).toBe(instanceBefore + 1);
    expect(await evidenceLogs(doc.expenseId, "evidence_add")).toContainEqual({ change: "evidence_add", fileId: file.id, reviewReleased: "confirmed" });
  });

  it("증빙 변경 뒤 옛 version 확인 거부 — 확인 기록이 없던 문서여도 열어 둔 화면의 옛 version 확인 · 면제 · 지급 완료가 거부되고 새 version은 통과한다", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(fx), 12_400_000);
    const preview = await previewPayable(payer, { expenseId: doc.expenseId, payDate: seoulToday() });
    if (preview.payableKrw === null || preview.payableKrw === undefined) throw new Error("지급 총액 없음");

    await attachEvidence(fx.pm, doc.expenseId);
    const fresh = (await docRow(doc.expenseId)).version;
    expect(fresh).toBe(doc.version + 1);

    expect(await caught(confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version }))).toBeInstanceOf(EvidenceReviewConflictError);
    expect(await caught(waiveEvidence(payer, { expenseId: doc.expenseId, version: doc.version, reason: "사유" }))).toBeInstanceOf(EvidenceReviewConflictError);
    expect(await caught(completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw: preview.payableKrw, version: doc.version }))).toBeDefined();
    expect(await reviewOf(doc.expenseId)).toBeNull();

    const confirmed = await confirmEvidence(payer, { expenseId: doc.expenseId, version: fresh });
    expect(confirmed.evidenceStatus).toBe("확인됨");
  });

  it("결재 중 추가는 문서 version 그대로 — 인스턴스 version만 + 1 · 작성 중 · 반려 문서의 추가 · 삭제도 문서 version 그대로", async () => {
    const fx = await setupExpenseProject();
    const manager = await makeEvidenceManager();

    // 결재 중 — 붙이기 권한자.
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const inReviewId = created.created[0]?.expenseId ?? "";
    const submitted = await submitReadyDraft(fx.pm, inReviewId);
    if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
    const versionBefore = (await docRow(inReviewId)).version;
    const instanceBefore = await instanceVersion(inReviewId);
    await attachEvidence(manager, inReviewId);
    expect((await docRow(inReviewId)).version).toBe(versionBefore);
    expect(await instanceVersion(inReviewId)).toBe(instanceBefore + 1);

    // 작성 중 · 반려 — 기안자 추가 · 삭제.
    const draft = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.split] });
    const draftId = draft.created[0]?.expenseId ?? "";
    const draftBefore = (await docRow(draftId)).version;
    const added = await attachEvidence(fx.pm, draftId);
    expect((await docRow(draftId)).version).toBe(draftBefore);
    const draftSubmitted = await submitReadyDraft(fx.pm, draftId);
    if (draftSubmitted.kind !== "submitted") throw new Error("제출 안 됨");
    await rejectDocument(fx.lead, { instanceId: draftSubmitted.instanceId, expectedVersion: draftSubmitted.version, reason: "금액 확인" });
    const rejectedBefore = (await docRow(draftId)).version;
    await attachEvidence(fx.pm, draftId);
    await removeEvidence(fx.pm, { fileId: added.id });
    expect((await docRow(draftId)).version).toBe(rejectedBefore);
  });
});
