import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import { actionLog, approvalInstances, corpCardUsages, evidenceRecordLinks, evidenceRecords, expenses } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createCorpCard } from "@/domain/corp-cards";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { approveDocument } from "@/domain/approvals";
import { attachEvidenceRecord, detachEvidenceRecord, previewDetach } from "@/domain/evidence-records/attach";
import { hasEvidence } from "@/domain/evidence/has-evidence";
import { submitExpense } from "@/domain/expenses";
import { PAYMENT_METHOD_EVIDENCE_PAIRS } from "@/domain/settings/keys";
import { upsertSimpleValue } from "@/repositories/settings";
import { makePerson } from "./approvals-fixtures";
import { setupExpenseProject, type ExpenseFixture } from "./fixtures/expenses";
import { createCardUsageFixture, createInReviewExpenseFixture, createIntakeManager, createReturnedExpenseFixture, insertLinkFixture, insertRecordFixture } from "./fixtures/evidence";
import { setEvidenceRequired } from "./fixtures/payments";
import { deferred, waitForLockWaiter } from "./lock-race";

// 06.1-06(S7 · D-6110 · 05 X-1): 떼기 — 반려 · 회수는 경영관리 떼기(문서 version 그대로), 결재 중은 아무도, 승인은 무효 담당의 무효 처리
// (사유 · 05 onApprovedEvidenceChange만 — 인스턴스 version 그대로). 이미 뗀 붙임은 멱등 성공.

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

async function linkOf(recordId: string) {
  const [row] = await db.select().from(evidenceRecordLinks).where(eq(evidenceRecordLinks.evidenceRecordId, recordId));
  if (!row) throw new Error("붙임 없음");
  return row;
}

async function versionOf(expenseId: string): Promise<number> {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row.version;
}

async function instanceOf(expenseId: string): Promise<{ id: string; version: number }> {
  const [row] = await db.select({ id: approvalInstances.id, version: approvalInstances.version }).from(approvalInstances).where(eq(approvalInstances.documentId, expenseId));
  if (!row) throw new Error("결재 인스턴스 없음");
  return row;
}

async function detachLogs(recordId: string) {
  return db
    .select({ seq: actionLog.seq })
    .from(actionLog)
    .where(and(eq(actionLog.entity, "evidence_record"), eq(actionLog.entityId, recordId), eq(actionLog.actionType, "document_update")));
}

async function approveFresh(fx: ExpenseFixture, expenseId: string): Promise<void> {
  const instance = await instanceOf(expenseId);
  const first = await approveDocument(fx.lead, { instanceId: instance.id, expectedVersion: instance.version });
  const final = await approveDocument(fx.ceo, { instanceId: instance.id, expectedVersion: first.version });
  if (final.status !== "approved") throw new Error(`결재 통과 안 됨: ${final.status}`);
}

// 반려 문서 + 경영관리 붙임 하나(05 파일 0 — 붙임으로 올린 문서).
async function returnedWithRecord(fx: ExpenseFixture, manager: Viewer): Promise<{ expenseId: string; recordId: string; linkId: string }> {
  const recordId = await insertRecordFixture(manager);
  const doc = await createReturnedExpenseFixture(fx, { linkRecordId: recordId, linkedBy: manager.id });
  return { expenseId: doc.expenseId, recordId, linkId: (await linkOf(recordId)).id };
}

describe("떼기 (06.1-06 Task 2 · S7)", () => {
  it("반려 문서 × 경영관리 → 뗀 칸 셋 채움 · 증빙 공개 범위 그대로 · 문서 version 그대로(05 X-1) · 사유 빈 글자는 거부", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const doc = await returnedWithRecord(fx, manager);
    const before = await versionOf(doc.expenseId);
    expect(await messageOf(detachEvidenceRecord(manager, { linkId: doc.linkId, reason: "   " }))).toBe("사유 없음 · 사유 적기");

    expect(await detachEvidenceRecord(manager, { linkId: doc.linkId, reason: "다른 건 증빙" })).toEqual({ detached: true });
    const link = await linkOf(doc.recordId);
    expect(link.detachedAt).not.toBeNull();
    expect(link).toMatchObject({ detachedBy: manager.id, detachReason: "다른 건 증빙" });
    const [record] = await db.select({ visibility: evidenceRecords.visibility }).from(evidenceRecords).where(eq(evidenceRecords.id, doc.recordId));
    expect(record?.visibility).toBe("private");
    expect(await versionOf(doc.expenseId)).toBe(before);
  });

  it("멱등: 같은 떼기 두 번(두 탭) → 둘째도 성공 · 행동 로그 수 · 문서 version 그대로", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const doc = await returnedWithRecord(fx, manager);
    await detachEvidenceRecord(manager, { linkId: doc.linkId, reason: "다른 건 증빙" });
    const logs = (await detachLogs(doc.recordId)).length;
    const version = await versionOf(doc.expenseId);
    expect(await detachEvidenceRecord(manager, { linkId: doc.linkId, reason: "다른 건 증빙" })).toEqual({ detached: false });
    expect((await detachLogs(doc.recordId)).length).toBe(logs);
    expect(await versionOf(doc.expenseId)).toBe(version);
  });

  it("결재 중 문서 → 경영관리 · 무효 담당 · 작성자 모두 거부 「결재 중 · 증빙 잠김」 · 붙임 그대로(D-6110)", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const recordId = await insertRecordFixture(manager);
    await createInReviewExpenseFixture(fx, { linkRecordId: recordId, linkedBy: manager.id });
    const linkId = (await linkOf(recordId)).id;
    const voider = await createIntakeManager("무효담당", { attach: false, void: true });
    for (const who of [manager, voider, fx.pm]) {
      expect(await messageOf(detachEvidenceRecord(who, { linkId, reason: "다른 건 증빙" }))).toBe("결재 중 · 증빙 잠김");
    }
    expect((await linkOf(recordId)).detachedAt).toBeNull();
  });

  it("승인 문서: 무효 담당 무효 처리 → 뗀 기록 · 인스턴스 version 그대로 · 문서 version + 1(확인 기록 훅) / evidence.intake만 → 「승인 뒤 · 증빙 삭제 잠김」", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager("등록만", { attach: false, void: false });
    const voider = await createIntakeManager("무효담당", { attach: false, void: true });
    const recordId = await insertRecordFixture(manager);
    const doc = await createInReviewExpenseFixture(fx, { linkRecordId: recordId, linkedBy: manager.id });
    await approveFresh(fx, doc.expenseId);
    const linkId = (await linkOf(recordId)).id;

    expect(await messageOf(detachEvidenceRecord(manager, { linkId, reason: "다른 건 증빙" }))).toBe("승인 뒤 · 증빙 삭제 잠김");
    const instance = await instanceOf(doc.expenseId);
    await detachEvidenceRecord(voider, { linkId, reason: "다른 건 증빙" });
    expect((await linkOf(recordId)).detachedAt).not.toBeNull();
    expect((await instanceOf(doc.expenseId)).version).toBe(instance.version);
    // 마지막 기록을 무효 처리했다 — 05 파일도 없으니 증빙 없음(06.1-12 hasEvidence가 붙임을 센다).
    expect(await hasEvidence(SYSTEM_VIEWER, { ownerKind: "expense", ownerId: doc.expenseId })).toBe(false);
  });

  it("행동 로그를 끈 상태(isActionTypeEnabled 거짓)에서 떼어도 붙임 행의 뗀 칸은 채워진다", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const doc = await returnedWithRecord(fx, manager);
    await detachEvidenceRecord(manager, { linkId: doc.linkId, reason: "다른 건 증빙" }, { isActionTypeEnabled: () => Promise.resolve(false) });
    expect((await linkOf(doc.recordId)).detachedAt).not.toBeNull();
    expect(await detachLogs(doc.recordId)).toHaveLength(0);
  });

  it("떼기 ↔ 결재 올리기 경합(E32): 제출이 문서 행을 쥔 채 멈춘 동안 떼기 출발(waitForLockWaiter) → 제출 커밋 뒤 떼기는 결재 중을 보고 거부 · 붙임 그대로", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager("등록만", { attach: false, void: false });
    const doc = await returnedWithRecord(fx, manager);
    const gate = deferred();
    const reached = deferred();
    const submit = submitExpense(fx.pm, { expenseId: doc.expenseId, expectedVersion: await versionOf(doc.expenseId) }, { afterLock: () => (reached.resolve(), gate.promise) });
    await reached.promise;
    const detach = caught(detachEvidenceRecord(manager, { linkId: doc.linkId, reason: "다른 건 증빙" }));
    await waitForLockWaiter(pool);
    gate.resolve();
    expect((await submit).kind).toBe("submitted");
    expect(((await detach) as Error).message).toBe("결재 중 · 증빙 잠김");
    expect((await linkOf(doc.recordId)).detachedAt).toBeNull();
  });
});

describe("previewDetach (PA-PREVIEW)", () => {
  it("붙은 증빙 하나뿐 · 05 파일 없음 → expected + 문서 공급가액 / 다른 붙임이 남음 → null / 못 보는 사람 → 문서 읽기와 같은 거부", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const doc = await returnedWithRecord(fx, manager);
    expect(await previewDetach(manager, { linkId: doc.linkId })).toEqual({ result: "expected", amountKrw: 12_400_000 });

    await attachEvidenceRecord(manager, { recordId: await insertRecordFixture(manager), owner: { kind: "expense", id: doc.expenseId } });
    expect(await previewDetach(manager, { linkId: doc.linkId })).toEqual({ result: null, amountKrw: null });

    const stranger = await makePerson("남팀", "role-pm", null);
    expect(await messageOf(previewDetach(stranger, { linkId: doc.linkId }))).toBe("없는 붙임 · 새로 고침");
  });

  it("05 파일이 남는 문서 → null", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const doc = await createReturnedExpenseFixture(fx);
    await attachEvidenceRecord(manager, { recordId: await insertRecordFixture(manager), owner: { kind: "expense", id: doc.expenseId } });
    const [link] = await db.select({ id: evidenceRecordLinks.id }).from(evidenceRecordLinks).where(eq(evidenceRecordLinks.ownerId, doc.expenseId));
    if (!link) throw new Error("붙임 없음");
    expect(await previewDetach(manager, { linkId: link.id })).toEqual({ result: null, amountKrw: null });
  });
});

// 07.1-04 PE1 · E-P2-16 · CG-03: 카드 사용에 붙은 증빙도 서버에서 뗀다 — 권한은 붙이기와 같은 키(경영관리 = 등록 ∧ 범위 안 ∧ 보관 아님),
// 트랜잭션 안에서 카드 사용 행을 잠근 뒤 다시 판정한다. 카드 사용 금액 · 사용일 · 승인번호는 되돌리지 않는다(덮은 기록은 로그에 있다).
describe("카드 사용 증빙 떼기 (07.1-04 PE1)", () => {
  async function cardUsageWithRecord(): Promise<{ manager: Viewer; pm: Viewer; usageId: string; recordId: string; linkId: string }> {
    const pm = await makePerson("떼기PM", DEFAULT_ROLE_ID, "기획1팀");
    const manager = await createIntakeManager("경영관리", { payments: true });
    const last4 = String(4000 + Math.floor(Math.random() * 4000));
    const card = await createCorpCard(SYSTEM_VIEWER, { issuer: "롯데카드", numberLast4: last4, label: `떼기 ${last4}`, kind: "personal", holderUserId: pm.id });
    if (!card.id) throw new Error("카드 id 없음");
    const usage = await createCardUsageFixture(pm, { corpCardId: card.id, usedOn: "2026-04-30", totalKrw: 200_000, approvalNo: "55500011" });
    const recordId = await insertRecordFixture(manager, { evidenceType: "card_receipt", supplyKrw: 181_818, vatKrw: 18_182, issuedOn: "2026-04-30" });
    const linkId = await insertLinkFixture({ recordId, ownerKind: "corp_card_usage", ownerId: usage.id, attachedBy: manager.id });
    return { manager, pm, usageId: usage.id, recordId, linkId };
  }

  async function usageValues(id: string) {
    const [row] = await db.select({ usedOn: corpCardUsages.usedOn, totalAmountKrw: corpCardUsages.totalAmountKrw, approvalNo: corpCardUsages.approvalNo }).from(corpCardUsages).where(eq(corpCardUsages.id, id));
    return row;
  }

  async function cardDetachLogs(recordId: string) {
    const rows = await db
      .select({ detail: actionLog.detail })
      .from(actionLog)
      .where(and(eq(actionLog.entity, "evidence_record"), eq(actionLog.entityId, recordId), eq(actionLog.actionType, "document_update")));
    return rows.filter((row) => (row.detail as { change?: string } | null)?.change === "evidence_record_detach");
  }

  it("경영관리가 떼면 detached · 카드 사용 값 그대로 · 떼기 로그 한 행(ownerKind corp_card_usage · 사유 길이) · 다시 떼면 detached 거짓 · 로그 그대로", async () => {
    const fx = await cardUsageWithRecord();
    const before = await usageValues(fx.usageId);
    expect(await detachEvidenceRecord(fx.manager, { linkId: fx.linkId, reason: "다른 건 증빙" })).toEqual({ detached: true });
    expect((await linkOf(fx.recordId)).detachedAt).not.toBeNull();
    expect(await usageValues(fx.usageId)).toEqual(before);
    const logs = await cardDetachLogs(fx.recordId);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.detail).toMatchObject({ ownerKind: "corp_card_usage", ownerId: fx.usageId, linkId: fx.linkId, reasonLength: "다른 건 증빙".length });

    expect(await detachEvidenceRecord(fx.manager, { linkId: fx.linkId, reason: "다른 건 증빙" })).toEqual({ detached: false });
    expect(await cardDetachLogs(fx.recordId)).toHaveLength(1);
  });

  it("붙이기 권한 없는 사람(등록 키 없음 · 범위 밖) → `없는 붙임 · 새로 고침` · 붙임 그대로", async () => {
    const fx = await cardUsageWithRecord();
    const narrow = await createIntakeManager("범위 좁음");
    for (const who of [fx.pm, narrow]) {
      expect(await messageOf(detachEvidenceRecord(who, { linkId: fx.linkId, reason: "다른 건 증빙" }))).toBe("없는 붙임 · 새로 고침");
      expect(await messageOf(previewDetach(who, { linkId: fx.linkId }))).toBe("없는 붙임 · 새로 고침");
    }
    expect((await linkOf(fx.recordId)).detachedAt).toBeNull();
  });

  it("(E-P2-16) 사전 판독 뒤 카드 사용이 보관되면 잠금 뒤 재판정으로 거부 · 붙임 살아 있음 · 떼기 로그 0", async () => {
    const fx = await cardUsageWithRecord();
    const message = await messageOf(
      detachEvidenceRecord(fx.manager, { linkId: fx.linkId, reason: "다른 건 증빙" }, {
        afterPreRead: async () => {
          await db.update(corpCardUsages).set({ archivedAt: new Date(), archivedBy: fx.pm.id }).where(eq(corpCardUsages.id, fx.usageId));
        },
      }),
    );
    expect(message).toBe("없는 붙임 · 새로 고침");
    expect((await linkOf(fx.recordId)).detachedAt).toBeNull();
    expect(await cardDetachLogs(fx.recordId)).toHaveLength(0);
  });

  it("previewDetach — 권한 있으면 빈 미리 보기(결과 없음)", async () => {
    const fx = await cardUsageWithRecord();
    expect(await previewDetach(fx.manager, { linkId: fx.linkId })).toEqual({ result: null, amountKrw: null });
  });
});
