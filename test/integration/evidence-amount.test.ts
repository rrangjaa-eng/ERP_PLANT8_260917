import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import { actionLog, approvalInstances, corpCardUsages, evidenceRecordLinks, evidenceRecords, expenseEvidenceReviews, expenses, projects, purchaseRequests } from "@/db/schema";
import { createCorpCard } from "@/domain/corp-cards";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { approveDocument } from "@/domain/approvals";
import { attachEvidenceRecord, detachEvidenceRecord } from "@/domain/evidence-records/attach";
import { queryActionLog } from "@/domain/action-log";
import { getEvidenceDetail, getEvidenceRecord } from "@/domain/evidence-records";
import {
  CARD_USAGE_AMOUNT_LOCKED,
  clearRecordNeedsCheck,
  EvidenceAmountConflictError,
  previewEvidenceAmount,
  updateEvidenceAmount,
} from "@/domain/evidence-records/amount";
import { confirmEvidence } from "@/domain/evidence-reviews";
import { submitExpense } from "@/domain/expenses";
import { completeExpensePayment, previewPayable } from "@/domain/payments";
import { ForbiddenError } from "@/domain/permissions/can";
import { PAYMENT_METHOD_EVIDENCE_PAIRS } from "@/domain/settings/keys";
import { seoulToday } from "@/lib/dates";
import { markActionLogRowsPruned } from "@/repositories/action-log";
import { AUTO_DETACH_REASONS } from "@/repositories/evidence-record-links";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertOrgUnit } from "@/repositories/org-units";
import { upsertSimpleValue } from "@/repositories/settings";
import { insertTeam } from "@/repositories/teams";
import { setupExpenseProject, type ExpenseFixture } from "./fixtures/expenses";
import { makePerson } from "./approvals-fixtures";
import {
  createCardUsageFixture,
  createDraftExpenseFixture,
  createInReviewExpenseFixture,
  createIntakeManager,
  createIntakeViewer,
  createPmInTeam,
  createReturnedExpenseFixture,
  insertLinkFixture,
  insertRecordFixture,
  setRecordArchivedFixture,
  setRecordVisibilityFixture,
} from "./fixtures/evidence";
import { makePaymentManager, setEvidenceRequired } from "./fixtures/payments";
import { purchaseProject, request as createRequest } from "./fixtures/purchase-requests";
import { deferred, waitForLockWaiter } from "./lock-race";

// 06.1-07(EVID-12 · EVID-09 · D-6106 · D-6520 · RP-1 · RP-2 · RP-6 · E7 · E26 · C8): 증빙 기록 공급가 고침 · 확인 필요 풀기.
// 합계 고정 · 세액 = 합계 − 공급가 · 끌 수 없는 evidence_record_amount_change · 붙은 문서 잠김 · 문서 칸 불변 · 잠금 뒤 재판정 · 경합(제출 · 붙이기 · 떼기).

const CONFLICT = /^다른 사람이 \d{2}:\d{2}에 바꿈 · 새로 고침$/;

beforeEach(async () => {
  await setEvidenceRequired(false);
  await upsertSimpleValue(SYSTEM_VIEWER, PAYMENT_METHOD_EVIDENCE_PAIRS.key, [], null);
});

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

async function messageOf(promise: Promise<unknown>): Promise<string> {
  const error = await caught(promise);
  if (!(error instanceof Error)) throw new Error("거부되지 않았다");
  return error.message;
}

async function recordRow(id: string) {
  const [row] = await db
    .select({ supplyKrw: evidenceRecords.supplyKrw, vatKrw: evidenceRecords.vatKrw, totalKrw: evidenceRecords.totalKrw, version: evidenceRecords.version, needsCheck: evidenceRecords.needsCheck })
    .from(evidenceRecords)
    .where(eq(evidenceRecords.id, id));
  if (!row) throw new Error("증빙 기록 없음");
  return row;
}

async function logsOf(recordId: string, actionType: string) {
  return db
    .select({ entity: actionLog.entity, entityId: actionLog.entityId, documentId: actionLog.documentId, detail: actionLog.detail })
    .from(actionLog)
    .where(and(eq(actionLog.entityId, recordId), eq(actionLog.actionType, actionType)));
}

async function moneyOf(expenseId: string) {
  const [row] = await db
    .select({ supply: expenses.supplyAmountKrw, vat: expenses.vatKrw, payable: expenses.payableKrw, version: expenses.version })
    .from(expenses)
    .where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row;
}

async function instanceOf(expenseId: string): Promise<{ id: string; version: number }> {
  const [row] = await db.select({ id: approvalInstances.id, version: approvalInstances.version }).from(approvalInstances).where(eq(approvalInstances.documentId, expenseId));
  if (!row) throw new Error("결재 인스턴스 없음");
  return row;
}

async function approveFresh(fx: ExpenseFixture, expenseId: string): Promise<void> {
  const instance = await instanceOf(expenseId);
  const first = await approveDocument(fx.lead, { instanceId: instance.id, expectedVersion: instance.version });
  const final = await approveDocument(fx.ceo, { instanceId: instance.id, expectedVersion: first.version });
  if (final.status !== "approved") throw new Error(`결재 통과 안 됨: ${final.status}`);
}

async function makePayer(): Promise<Viewer> {
  const payer = await makePaymentManager("지급담당");
  if (!payer.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: true });
  return payer;
}

async function payNow(payer: Viewer, expenseId: string): Promise<void> {
  const confirmed = await confirmEvidence(payer, { expenseId, version: (await moneyOf(expenseId)).version });
  const preview = await previewPayable(payer, { expenseId, payDate: seoulToday() });
  if (preview.payableKrw === undefined || preview.payableKrw === null) throw new Error("지급 총액 없음");
  await completeExpensePayment(payer, { expenseId, expectedPayableKrw: preview.payableKrw, version: confirmed.version });
}

async function setProjectCompleted(projectId: string): Promise<void> {
  await db.update(projects).set({ status: "completed" }).where(eq(projects.id, projectId));
}

async function setNeedsCheck(recordId: string, reason: string): Promise<void> {
  await db.update(evidenceRecords).set({ needsCheck: reason }).where(eq(evidenceRecords.id, recordId));
}

async function liveLinkId(recordId: string): Promise<string> {
  const [row] = await db
    .select({ id: evidenceRecordLinks.id })
    .from(evidenceRecordLinks)
    .where(and(eq(evidenceRecordLinks.evidenceRecordId, recordId), isNull(evidenceRecordLinks.detachedAt)));
  if (!row) throw new Error("붙임 없음");
  return row.id;
}

// 합계 1,100,000(공급가 1,000,000 · 세액 100,000) 기록 한 줄.
async function record(by: Viewer): Promise<string> {
  return insertRecordFixture(by, { supplyKrw: 1_000_000, vatKrw: 100_000 });
}

describe("금액 고침 트레이서 (06.1-07 Task 1 — 안 붙은 기록)", () => {
  it("공급가 · 세액 바뀜 · 합계 그대로 · version + 1 · 같은 tx에서 evidence_record_amount_change 한 줄(entity evidence_record · document_id = 기록 id · 전 · 후) · evidence_amount_change 0", async () => {
    const manager = await createIntakeManager();
    const recordId = await record(manager);

    const result = await updateEvidenceAmount(manager, { id: recordId, version: 1, supplyKrw: 1_050_000 });

    expect(result).toEqual({ id: recordId, version: 2 });
    expect(await recordRow(recordId)).toMatchObject({ supplyKrw: 1_050_000, vatKrw: 50_000, totalKrw: 1_100_000, version: 2 });
    const logs = await logsOf(recordId, "evidence_record_amount_change");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      entity: "evidence_record",
      documentId: recordId,
      detail: { before: { supplyKrw: 1_000_000, vatKrw: 100_000, totalKrw: 1_100_000 }, after: { supplyKrw: 1_050_000, vatKrw: 50_000, totalKrw: 1_100_000 } },
    });
    expect(await logsOf(recordId, "evidence_amount_change")).toHaveLength(0);
  });

  it("행동 로그 설정에서 종류를 꺼도(isActionTypeEnabled 거짓) evidence_record_amount_change 한 줄(RP-2 · always-on)", async () => {
    const manager = await createIntakeManager();
    const recordId = await record(manager);
    await updateEvidenceAmount(manager, { id: recordId, version: 1, supplyKrw: 990_000 }, { isActionTypeEnabled: () => Promise.resolve(false) });
    expect(await logsOf(recordId, "evidence_record_amount_change")).toHaveLength(1);
  });

  it("낡은 version → 「다른 사람이 {HH:mm}에 바꿈 · 새로 고침」 · 값 그대로 / evidence.intake 없는 계급 → 거부 / 없는 · 범위 밖 id → 없음", async () => {
    const manager = await createIntakeManager();
    const recordId = await record(manager);
    const stale = await caught(updateEvidenceAmount(manager, { id: recordId, version: 7, supplyKrw: 900_000 }));
    expect(stale).toBeInstanceOf(EvidenceAmountConflictError);
    expect((stale as Error).message).toMatch(CONFLICT);
    expect(await recordRow(recordId)).toMatchObject({ supplyKrw: 1_000_000, vatKrw: 100_000, version: 1 });

    const pm = await createPmInTeam(null);
    expect(await caught(updateEvidenceAmount(pm, { id: recordId, version: 1, supplyKrw: 900_000 }))).toBeInstanceOf(ForbiddenError);
    expect(await messageOf(updateEvidenceAmount(manager, { id: randomUUID(), version: 1, supplyKrw: 900_000 }))).toBe("없는 증빙 · 새로 고침");
    expect(await recordRow(recordId)).toMatchObject({ supplyKrw: 1_000_000, version: 1 });
  });

  it("공급가가 합계보다 크면 거부 · 값 그대로(PA-AMT)", async () => {
    const manager = await createIntakeManager();
    const recordId = await record(manager);
    expect(await messageOf(updateEvidenceAmount(manager, { id: recordId, version: 1, supplyKrw: 1_100_001 }))).toBe("공급가가 합계보다 큼");
    expect(await recordRow(recordId)).toMatchObject({ supplyKrw: 1_000_000, version: 1 });
  });

  it("previewEvidenceAmount: 쓰지 않고 { vatKrw, totalKrw } 또는 이유 한 줄", async () => {
    const manager = await createIntakeManager();
    const recordId = await record(manager);
    expect(await previewEvidenceAmount(manager, { id: recordId, supplyKrw: 1_020_000 })).toEqual({ ok: true, vatKrw: 80_000, totalKrw: 1_100_000 });
    expect(await previewEvidenceAmount(manager, { id: recordId, supplyKrw: 2_000_000 })).toEqual({ ok: false, reason: "공급가가 합계보다 큼" });
    expect(await recordRow(recordId)).toMatchObject({ supplyKrw: 1_000_000, version: 1 });
    expect(await logsOf(recordId, "evidence_record_amount_change")).toHaveLength(0);
  });

  it("잠금 뒤 붙임 재확인(E26 · C-F5): 붙이기가 증빙 행을 쥔 채 멈춘 동안 금액 고침 출발 → 붙이기 커밋 → 금액 고침은 낡음 거부 · 값 그대로", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const doc = await createReturnedExpenseFixture(fx);
    const recordId = await record(manager);
    const gate = deferred();
    const reached = deferred();
    const attach = attachEvidenceRecord(manager, { recordId, owner: { kind: "expense", id: doc.expenseId } }, { afterLock: () => (reached.resolve(), gate.promise) });
    await reached.promise;
    const change = caught(updateEvidenceAmount(manager, { id: recordId, version: 1, supplyKrw: 1_050_000 }));
    await waitForLockWaiter(pool);
    gate.resolve();
    expect(await attach).toEqual({ created: true });
    const refused = await change;
    expect(refused).toBeInstanceOf(EvidenceAmountConflictError);
    expect((refused as Error).message).toMatch(CONFLICT);
    expect(await recordRow(recordId)).toMatchObject({ supplyKrw: 1_000_000, vatKrw: 100_000 });
  });
});

describe("붙은 증빙 금액 고침 · 잠김 (06.1-07 Task 2)", () => {
  it("결재 중 지출결의에 붙은 기록 → 「결재 중 문서에 붙음 · 금액 잠김」 · 값 · version 그대로 · 지출결의 금액 칸 그대로", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const recordId = await record(manager);
    const doc = await createInReviewExpenseFixture(fx, { linkRecordId: recordId, linkedBy: manager.id });
    const before = await moneyOf(doc.expenseId);
    expect(await messageOf(updateEvidenceAmount(manager, { id: recordId, version: 1, supplyKrw: 1_050_000 }))).toBe("결재 중 문서에 붙음 · 금액 잠김");
    expect(await recordRow(recordId)).toMatchObject({ supplyKrw: 1_000_000, version: 1 });
    expect(await moneyOf(doc.expenseId)).toEqual(before);
  });

  it("승인 → 「승인됨 문서에 붙음 · 금액 잠김」 · 승인 + 지급 → 「지급 완료 문서에 붙음 · 금액 잠김」 · 금액 칸 그대로", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const recordId = await record(manager);
    const doc = await createInReviewExpenseFixture(fx, { linkRecordId: recordId, linkedBy: manager.id });
    await approveFresh(fx, doc.expenseId);
    expect(await messageOf(updateEvidenceAmount(manager, { id: recordId, version: 1, supplyKrw: 1_050_000 }))).toBe("승인됨 문서에 붙음 · 금액 잠김");
    await payNow(await makePayer(), doc.expenseId);
    const before = await moneyOf(doc.expenseId);
    expect(await messageOf(updateEvidenceAmount(manager, { id: recordId, version: 1, supplyKrw: 1_050_000 }))).toBe("지급 완료 문서에 붙음 · 금액 잠김");
    expect(await recordRow(recordId)).toMatchObject({ supplyKrw: 1_000_000, version: 1 });
    expect(await moneyOf(doc.expenseId)).toEqual(before);
  });

  it("(사용자 결정 2026-10-05) 완료 프로젝트의 반려 지출결의에 붙은 기록 → 고침 성공 + 기록 한 줄 / 완료 프로젝트의 승인 지출결의 → 「승인됨 문서에 붙음 · 금액 잠김」", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const returnedRecord = await record(manager);
    await createReturnedExpenseFixture(fx, { linkRecordId: returnedRecord, linkedBy: manager.id });
    const approvedRecord = await record(manager);
    const approved = await createInReviewExpenseFixture(fx, { lineId: fx.lines.split, linkRecordId: approvedRecord, linkedBy: manager.id });
    await approveFresh(fx, approved.expenseId);
    await setProjectCompleted(fx.projectId);

    await updateEvidenceAmount(manager, { id: returnedRecord, version: 1, supplyKrw: 1_050_000 });
    expect(await recordRow(returnedRecord)).toMatchObject({ supplyKrw: 1_050_000, vatKrw: 50_000 });
    expect(await logsOf(returnedRecord, "evidence_record_amount_change")).toHaveLength(1);
    expect(await messageOf(updateEvidenceAmount(manager, { id: approvedRecord, version: 1, supplyKrw: 1_050_000 }))).toBe("승인됨 문서에 붙음 · 금액 잠김");
  });

  it("반려 지출결의(번호 있음 — RP-8)에 붙은 기록 → 고침 성공 · 지출결의 공급가액 · 부가세 · 지급액 · version 그대로(D-6520 · 05 X-1) · 다시 올리면 확인 기록 없음(06.1-12 N-2)", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const recordId = await record(manager);
    const doc = await createReturnedExpenseFixture(fx, { linkRecordId: recordId, linkedBy: manager.id });
    const before = await moneyOf(doc.expenseId);
    await updateEvidenceAmount(manager, { id: recordId, version: 1, supplyKrw: 1_050_000 });
    expect(await recordRow(recordId)).toMatchObject({ supplyKrw: 1_050_000, vatKrw: 50_000, totalKrw: 1_100_000 });
    expect(await moneyOf(doc.expenseId)).toEqual(before);
    expect(await db.select().from(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, doc.expenseId))).toHaveLength(0);
    const resubmitted = await submitExpense(fx.pm, { expenseId: doc.expenseId, expectedVersion: before.version });
    expect(resubmitted.kind).toBe("submitted");
    expect(await db.select().from(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, doc.expenseId))).toHaveLength(0);
  });

  it("경합(결정적): 제출(반려 문서 다시 올림)이 지출결의 행을 쥔 채 멈춘 동안 금액 고침 출발 → 제출 커밋 → 잠금 뒤 재판정에서 결재 중으로 거부", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const recordId = await record(manager);
    const doc = await createReturnedExpenseFixture(fx, { linkRecordId: recordId, linkedBy: manager.id });
    const gate = deferred();
    const reached = deferred();
    const submit = submitExpense(fx.pm, { expenseId: doc.expenseId, expectedVersion: (await moneyOf(doc.expenseId)).version }, { afterLock: () => (reached.resolve(), gate.promise) });
    await reached.promise;
    const change = caught(updateEvidenceAmount(manager, { id: recordId, version: 1, supplyKrw: 1_050_000 }));
    await waitForLockWaiter(pool);
    gate.resolve();
    expect((await submit).kind).toBe("submitted");
    expect(((await change) as Error).message).toBe("결재 중 문서에 붙음 · 금액 잠김");
    expect(await recordRow(recordId)).toMatchObject({ supplyKrw: 1_000_000, version: 1 });
  });

  it("구매 요청(requested)에 붙은 기록 → 고침 성공 · 구매 요청 견적 칸 그대로", async () => {
    const pfx = await purchaseProject();
    const manager = await createIntakeManager();
    if (!manager.roleId) throw new Error("계급 없음");
    await upsertPermission(SYSTEM_VIEWER, { roleId: manager.roleId, menu: "projects", action: "view", allowed: true });
    const created = await createRequest(pfx, pfx.onlineLine, 110_000);
    const recordId = await insertRecordFixture(manager, { supplyKrw: 100_000, vatKrw: 10_000 });
    await attachEvidenceRecord(manager, { recordId, owner: { kind: "purchase_request", id: created.id } });
    const [before] = await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, created.id));
    await updateEvidenceAmount(manager, { id: recordId, version: 2, supplyKrw: 105_000 });
    expect(await recordRow(recordId)).toMatchObject({ supplyKrw: 105_000, vatKrw: 5_000, totalKrw: 110_000 });
    const [after] = await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, created.id));
    expect(after).toEqual(before);
  });

  // 06.1-09 C8 · PA-AMT-CU: 카드 사용에 붙은 기록의 금액 고침은 기록만 바꾼다(카드 사용 행은 잠그기만 · 쓰기 0). 보관된 카드 사용이면 금액 잠김.
  async function cardUsageWithRecord(manager: Viewer): Promise<{ usageId: string; recordId: string }> {
    const holder = await makePerson("카드 보유자", DEFAULT_ROLE_ID, "기획1팀");
    const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `카드사-${randomUUID().slice(0, 6)}`, numberLast4: String(1000 + Math.floor(Math.random() * 9000)), label: "금액 고침", kind: "personal", holderUserId: holder.id });
    if (!card.id) throw new Error("카드 없음");
    const usage = await createCardUsageFixture(holder, { corpCardId: card.id, usedOn: "2026-04-30", totalKrw: 1_100_000 });
    const recordId = await record(manager);
    await insertLinkFixture({ recordId, ownerKind: "corp_card_usage", ownerId: usage.id, attachedBy: manager.id });
    return { usageId: usage.id, recordId };
  }

  it("(C8) 카드 사용에 붙은 기록 → 성공 · 기록 공급가 · 세액 바뀜 · 카드 사용 합계 · 공급가 · 세액 · version 그대로 · evidence_record_amount_change(entity evidence_record) 한 줄", async () => {
    const manager = await createIntakeManager();
    const { usageId, recordId } = await cardUsageWithRecord(manager);
    const [before] = await db.select().from(corpCardUsages).where(eq(corpCardUsages.id, usageId));
    await updateEvidenceAmount(manager, { id: recordId, version: 1, supplyKrw: 1_050_000 });
    expect(await recordRow(recordId)).toMatchObject({ supplyKrw: 1_050_000, vatKrw: 50_000, totalKrw: 1_100_000, version: 2 });
    const [after] = await db.select().from(corpCardUsages).where(eq(corpCardUsages.id, usageId));
    expect(after).toEqual(before);
    const logs = await db.select().from(actionLog).where(and(eq(actionLog.entityId, recordId), eq(actionLog.actionType, "evidence_record_amount_change")));
    expect(logs).toHaveLength(1);
    expect(logs[0]?.entity).toBe("evidence_record");
  });

  it("(C8) 보관된 카드 사용에 붙은 기록 → 「카드 사용에 붙음 · 금액 잠김」 · 값 그대로", async () => {
    const manager = await createIntakeManager();
    const { usageId, recordId } = await cardUsageWithRecord(manager);
    await db.update(corpCardUsages).set({ archivedAt: new Date(), archivedBy: manager.id }).where(eq(corpCardUsages.id, usageId));
    expect(await messageOf(updateEvidenceAmount(manager, { id: recordId, version: 1, supplyKrw: 1_050_000 }))).toBe(CARD_USAGE_AMOUNT_LOCKED);
    expect(await recordRow(recordId)).toMatchObject({ supplyKrw: 1_000_000, version: 1 });
  });

  it("(Round 2 eng B-P2) 번호 없는 임시 지출결의에 붙은 기록(작성자 붙임) → 금액 고침 · 공급가를 실은 풀기 둘 다 「작성 중 문서에 붙음 · 금액 잠김」 · 상세에 문서 id · 번호 없음 · 이력 자리 「작성 중 문서」", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const recordId = await record(manager);
    const draftId = await createDraftExpenseFixture(fx);
    await insertLinkFixture({ recordId, ownerId: draftId, attachMode: "author", attachedBy: fx.pm.id });
    await setNeedsCheck(recordId, "사업자번호 틀림 · 거래처 확인");

    expect(await messageOf(updateEvidenceAmount(manager, { id: recordId, version: 1, supplyKrw: 1_050_000 }))).toBe("작성 중 문서에 붙음 · 금액 잠김");
    expect(await messageOf(clearRecordNeedsCheck(manager, { id: recordId, version: 1, supplyKrw: 1_050_000 }))).toBe("작성 중 문서에 붙음 · 금액 잠김");
    expect(await recordRow(recordId)).toMatchObject({ supplyKrw: 1_000_000, version: 1, needsCheck: "사업자번호 틀림 · 거래처 확인" });

    const detail = await getEvidenceDetail(manager, recordId);
    expect(detail?.amountLock).toBe("작성 중 문서에 붙음 · 금액 잠김");
    expect(detail?.attachedId).toBeNull();
    expect(detail?.attachedNumber).toBeNull();
    expect(JSON.stringify(detail)).not.toContain(draftId);
    expect(detail?.history?.some((line) => line.endsWith("붙임 작성 중 문서"))).toBe(true);
  });

  it("(Round 2 eng B-P3) 경합(결정적): 떼기가 지출결의 행을 쥔 채 멈춘 동안 금액 고침 출발 → 떼기 커밋 → 붙임이 사전 판독과 달라 낡음 거부 · 값 그대로", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const doc = await createReturnedExpenseFixture(fx);
    const recordId = await record(manager);
    await attachEvidenceRecord(manager, { recordId, owner: { kind: "expense", id: doc.expenseId } });
    const linkId = await liveLinkId(recordId);
    const gate = deferred();
    const reached = deferred();
    const detach = detachEvidenceRecord(manager, { linkId, reason: "다른 문서 증빙" }, { afterLock: () => (reached.resolve(), gate.promise) });
    await reached.promise;
    const change = caught(updateEvidenceAmount(manager, { id: recordId, version: 1, supplyKrw: 1_050_000 }));
    await waitForLockWaiter(pool);
    gate.resolve();
    expect(await detach).toEqual({ detached: true });
    const refused = await change;
    expect(refused).toBeInstanceOf(EvidenceAmountConflictError);
    expect((refused as Error).message).toMatch(CONFLICT);
    expect(await recordRow(recordId)).toMatchObject({ supplyKrw: 1_000_000, vatKrw: 100_000 });
  });
});

describe("확인 필요 풀기 (RP-6 · DA-13)", () => {
  it("확인 필요 칸 null · version + 1 · 상태 글자가 공개 범위 낱말 · document_update 한 줄 / 낡은 version 거부 / intake 없는 계급 거부", async () => {
    const manager = await createIntakeManager();
    const recordId = await record(manager);
    await setNeedsCheck(recordId, "사업자번호 틀림 · 거래처 확인");
    expect((await getEvidenceRecord(manager, recordId))?.statusWord).toBe("확인 필요");

    expect((await caught(clearRecordNeedsCheck(manager, { id: recordId, version: 3 })) as Error).message).toMatch(CONFLICT);
    const viewer = await createIntakeViewer();
    if (!viewer.roleId) throw new Error("계급 없음");
    await upsertPermission(SYSTEM_VIEWER, { roleId: viewer.roleId, menu: "evidence.intake", action: "write", allowed: false });
    expect(await caught(clearRecordNeedsCheck(viewer, { id: recordId, version: 1 }))).toBeInstanceOf(ForbiddenError);

    expect(await clearRecordNeedsCheck(manager, { id: recordId, version: 1 })).toEqual({ id: recordId, version: 2 });
    expect(await recordRow(recordId)).toMatchObject({ needsCheck: null, version: 2, supplyKrw: 1_000_000 });
    expect((await getEvidenceRecord(manager, recordId))?.statusWord).toBe("미공개");
    // 07.1-05 D-7115 — 풀기는 끌 수 없는 전용 종류로 남는다(document_update 아님). 무엇을 풀었는지는 detail.needsCheck.
    expect(await logsOf(recordId, "document_update")).toHaveLength(0);
    const cleared = await logsOf(recordId, "evidence_record_needs_check_clear");
    expect(cleared).toHaveLength(1);
    expect(cleared[0]?.detail).toEqual({ needsCheck: "사업자번호 틀림 · 거래처 확인" });
    expect(await logsOf(recordId, "evidence_record_amount_change")).toHaveLength(0);
  });

  it("07.1-05 D-7115 이전에 document_update로 쌓인 풀기 행은 조회에서 그대로 보인다(옛 종류 이름 · 마이그레이션 없음)", async () => {
    const manager = await createIntakeManager();
    const recordId = await record(manager);
    await db.insert(actionLog).values({ actorId: manager.id, actionType: "document_update", entity: "evidence_record", entityId: recordId, documentId: recordId, detail: { change: "evidence_record_needs_check_clear", needsCheck: "옛 사유" } });
    const rows = await queryActionLog(SYSTEM_VIEWER, { documentId: recordId });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actionType).toBe("document_update");
    expect(rows[0]?.actionTypeLabel).toBe("문서 수정");
  });

  it("공급가가 함께 오면 한 트랜잭션에서 확인 필요 null + 공급가 · 세액 + 기록 두 줄 · 붙은 문서가 잠겼으면 둘 다 안 바뀜", async () => {
    const manager = await createIntakeManager();
    const recordId = await record(manager);
    await setNeedsCheck(recordId, "사업자번호 틀림 · 거래처 확인");
    await clearRecordNeedsCheck(manager, { id: recordId, version: 1, supplyKrw: 1_050_000 });
    expect(await recordRow(recordId)).toMatchObject({ needsCheck: null, supplyKrw: 1_050_000, vatKrw: 50_000, version: 2 });
    expect(await logsOf(recordId, "document_update")).toHaveLength(0);
    expect(await logsOf(recordId, "evidence_record_needs_check_clear")).toHaveLength(1);
    expect(await logsOf(recordId, "evidence_record_amount_change")).toHaveLength(1);

    const fx = await setupExpenseProject();
    const locked = await record(manager);
    await createInReviewExpenseFixture(fx, { linkRecordId: locked, linkedBy: manager.id });
    await setNeedsCheck(locked, "취소 표시 줄 · 원거래 확인");
    expect(await messageOf(clearRecordNeedsCheck(manager, { id: locked, version: 1, supplyKrw: 1_050_000 }))).toBe("결재 중 문서에 붙음 · 금액 잠김");
    expect(await recordRow(locked)).toMatchObject({ needsCheck: "취소 표시 줄 · 원거래 확인", supplyKrw: 1_000_000, version: 1 });
    expect(await logsOf(locked, "document_update")).toHaveLength(0);
  });
});

describe("상세 이력 (DB-15 · PA-HISTORY)", () => {
  it("등록 · 붙임 · 뗌(사람 = 이름 · 사유) · 자동 떼기(문서 번호 · 문서 종결) · 금액 전 → 후가 시각 순 · 금액 줄은 행동 로그 정리 뒤에도 남는다", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager("이과장");
    const recordId = await record(manager);
    const doc = await createReturnedExpenseFixture(fx);
    await attachEvidenceRecord(manager, { recordId, owner: { kind: "expense", id: doc.expenseId } });
    await detachEvidenceRecord(manager, { linkId: await liveLinkId(recordId), reason: "다른 문서 증빙" });
    await updateEvidenceAmount(manager, { id: recordId, version: 2, supplyKrw: 1_050_000 });
    // 자동 떼기 줄 — 종결 tx의 detachLiveLinksForOwner와 같은 칸(사유 = AUTO_DETACH_REASONS)을 붙임 행에 직접 만든다.
    const other = await createReturnedExpenseFixture(fx, { lineId: fx.lines.split });
    await insertLinkFixture({ recordId, ownerId: other.expenseId, attachedBy: manager.id });
    await db
      .update(evidenceRecordLinks)
      .set({ detachedAt: new Date(), detachedBy: manager.id, detachReason: AUTO_DETACH_REASONS.expenseClose })
      .where(and(eq(evidenceRecordLinks.evidenceRecordId, recordId), isNull(evidenceRecordLinks.detachedAt)));

    await markActionLogRowsPruned(SYSTEM_VIEWER, { documentId: recordId });
    const history = (await getEvidenceDetail(manager, recordId))?.history ?? [];
    const texts = history.map((line) => line.slice("MM-DD HH:mm ".length));
    expect(texts).toEqual([
      "이과장 등록",
      `이과장 붙임 ${doc.number}`,
      "이과장 뗌 · 다른 문서 증빙",
      "이과장 금액 1,000,000 → 1,050,000",
      `이과장 붙임 ${other.number}`,
      `${other.number} 뗌 · 문서 종결`,
    ]);
    expect(history.every((line) => /^\d{2}-\d{2} \d{2}:\d{2} /.test(line))).toBe(true);
  });
});

describe("독립 검토 지적 (06.1-07 고침 — P2-1 · P2-2 · P3-1 · P3-2)", () => {
  it("(P2-1) 증빙 등록 쓰기 없는 공개 범위 열람자(PM) → 상세 거부 — 화면 등록표(registry)가 아니라 domain이 막는다", async () => {
    const manager = await createIntakeManager();
    const recordId = await record(manager);
    const division = await insertOrgUnit(SYSTEM_VIEWER, { name: `상세범위본부-${randomUUID().slice(0, 8)}` });
    const team = await insertTeam(SYSTEM_VIEWER, { orgUnitId: division.id, name: `상세범위팀-${randomUUID().slice(0, 8)}` });
    await setRecordVisibilityFixture(recordId, { visibility: "team", teamId: team.id });
    const pm = await createPmInTeam(team.id);
    expect(await getEvidenceRecord(pm, recordId)).not.toBeNull();
    expect(await caught(getEvidenceDetail(pm, recordId))).toBeInstanceOf(ForbiddenError);
  });

  it("(P2-1) 붙은 문서를 못 보는 등록자 → 이력 붙임 · 뗌 줄에 문서 번호 · 붙인/뗀 사람 이름 없음(번호 없는 작성 중 낱말은 그대로)", async () => {
    const fx = await setupExpenseProject();
    const registrar = await createIntakeViewer();
    const recordId = await record(registrar);
    const doc = await createReturnedExpenseFixture(fx);
    await insertLinkFixture({ recordId, ownerId: doc.expenseId, attachedBy: fx.pm.id });
    await db
      .update(evidenceRecordLinks)
      .set({ detachedAt: new Date(), detachedBy: fx.pm.id, detachReason: "다른 문서 증빙" })
      .where(and(eq(evidenceRecordLinks.evidenceRecordId, recordId), isNull(evidenceRecordLinks.detachedAt)));
    const draftId = await createDraftExpenseFixture(fx, fx.lines.split);
    await insertLinkFixture({ recordId, ownerId: draftId, attachMode: "author", attachedBy: fx.pm.id });

    const history = (await getEvidenceDetail(registrar, recordId))?.history ?? [];
    const texts = history.map((line) => line.slice("MM-DD HH:mm ".length));
    expect(texts).toEqual(["증빙 등록자 등록", "붙임", "뗌 · 다른 문서 증빙", "붙임 작성 중 문서"]);
    expect(JSON.stringify(history)).not.toContain(doc.number);
  });

  it("(P2-2) evidence.amount를 못 보는 등록자 → 공급가가 오는 쓰기는 금액 판정 전에 거부(합계를 캐는 거부 글자 없음) · 값 그대로 / 공급가 없는 풀기는 된다", async () => {
    const registrar = await createIntakeViewer();
    if (!registrar.roleId) throw new Error("계급 없음");
    await upsertVisibility(SYSTEM_VIEWER, { roleId: registrar.roleId, infoItem: "evidence.amount", visible: false });
    const recordId = await record(registrar);
    const tooLarge = await caught(updateEvidenceAmount(registrar, { id: recordId, version: 1, supplyKrw: 1_100_001 }));
    expect(tooLarge).toBeInstanceOf(ForbiddenError);
    expect((tooLarge as Error).message).toBe("증빙 금액 보기 권한 없음");
    expect(await caught(updateEvidenceAmount(registrar, { id: recordId, version: 1, supplyKrw: 900_000 }))).toBeInstanceOf(ForbiddenError);
    await setNeedsCheck(recordId, "사업자번호 틀림 · 거래처 확인");
    expect(await caught(clearRecordNeedsCheck(registrar, { id: recordId, version: 1, supplyKrw: -1 }))).toBeInstanceOf(ForbiddenError);
    expect(await recordRow(recordId)).toMatchObject({ supplyKrw: 1_000_000, vatKrw: 100_000, version: 1 });
    expect(await clearRecordNeedsCheck(registrar, { id: recordId, version: 1 })).toEqual({ id: recordId, version: 2 });
  });

  it("(P3-1) 공급가가 지금 값과 같고 풀기도 아니면 트랜잭션 전에 「바뀐 칸 없음」 · version 그대로", async () => {
    const manager = await createIntakeManager();
    const recordId = await record(manager);
    expect(await messageOf(updateEvidenceAmount(manager, { id: recordId, version: 1, supplyKrw: 1_000_000 }))).toBe("바뀐 칸 없음");
    expect(await recordRow(recordId)).toMatchObject({ supplyKrw: 1_000_000, version: 1 });
  });

  it("(P3-2) 보관된 증빙 → 금액 고침 거부 「보관됨」 · 값 그대로", async () => {
    const manager = await createIntakeManager();
    const recordId = await record(manager);
    await setRecordArchivedFixture(recordId, manager.id);
    expect(await messageOf(updateEvidenceAmount(manager, { id: recordId, version: 1, supplyKrw: 900_000 }))).toBe("보관됨");
    expect(await recordRow(recordId)).toMatchObject({ supplyKrw: 1_000_000, version: 1 });
    expect(await logsOf(recordId, "evidence_record_amount_change")).toHaveLength(0);
  });
});
