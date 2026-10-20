import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, pool } from "@/db/client";
import { actionLog, approvalInstances, evidenceRecordLinks, expenseEvidenceReviews, expenses, projects } from "@/db/schema";
import { approveDocument } from "@/domain/approvals";
import { EVIDENCE_COMPLETED_PROJECT_LOCKED, EVIDENCE_LOCKED_IN_REVIEW } from "@/domain/evidence";
import { ATTACH_BATCH_CAP_LINE, ATTACH_BATCH_MAX, attachEvidenceAsAuthor, attachEvidenceBatch, attachEvidenceRecord } from "@/domain/evidence-records/attach";
import { listEvidencePool } from "@/domain/evidence-records/pool";
import { confirmEvidence } from "@/domain/evidence-reviews";
import { completeExpensePayment, previewPayable } from "@/domain/payments";
import { PAYMENT_METHOD_EVIDENCE_PAIRS } from "@/domain/settings/keys";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { upsertVisibility } from "@/repositories/permissions";
import { upsertSimpleValue } from "@/repositories/settings";
import { teamIdByName } from "./approvals-fixtures";
import { addApprovedRevision, setupExpenseProject, type ExpenseFixture } from "./fixtures/expenses";
import { getEvidenceRecord, listEvidenceRecordsByIds } from "@/domain/evidence-records";
import { createInReviewExpenseFixture, createIntakeManager, createReturnedExpenseFixture, insertRecordFixture, setRecordArchivedFixture, setRecordVisibilityFixture } from "./fixtures/evidence";
import { makePaymentManager, setEvidenceRequired } from "./fixtures/payments";
import { deferred, waitForLockWaiter } from "./lock-race";

// 06.1-08 Task 2(RP-4 · RP-8 · E45 · D-6520): 경영관리 여러 장 붙이기 — 05 훅 · 자동 확인은 반복문 밖 한 번, 전부-아니면-전무,
// 상한 20, 결정적 경합(deps.afterLock + waitForLockWaiter — setTimeout · sleep 없음).

// 사전 판독 질의 수(PR-C /review P3-3) — 실제 함수를 그대로 부르되 몇 번 불렸는지 센다.
vi.mock("@/domain/evidence-records", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/evidence-records")>();
  return { ...actual, getEvidenceRecord: vi.fn(actual.getEvidenceRecord), listEvidenceRecordsByIds: vi.fn(actual.listEvidenceRecordsByIds) };
});

const DOC_SUPPLY = 12_400_000;
let fx: ExpenseFixture;

beforeEach(async () => {
  await setEvidenceRequired(false);
  await upsertSimpleValue(SYSTEM_VIEWER, PAYMENT_METHOD_EVIDENCE_PAIRS.key, [], null);
  fx = await setupExpenseProject();
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

async function liveLinks(recordId: string) {
  return db
    .select()
    .from(evidenceRecordLinks)
    .where(and(eq(evidenceRecordLinks.evidenceRecordId, recordId), isNull(evidenceRecordLinks.detachedAt)));
}

async function moneyOf(expenseId: string) {
  const [row] = await db.select({ supply: expenses.supplyAmountKrw, vat: expenses.vatKrw, payable: expenses.payableKrw, version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row;
}

async function instanceOf(expenseId: string): Promise<{ id: string; version: number }> {
  const [row] = await db.select({ id: approvalInstances.id, version: approvalInstances.version }).from(approvalInstances).where(eq(approvalInstances.documentId, expenseId));
  if (!row) throw new Error("결재 인스턴스 없음");
  return row;
}

async function attachLogs(expenseId: string) {
  return db
    .select({ detail: actionLog.detail })
    .from(actionLog)
    .where(and(eq(actionLog.entity, "evidence_record"), eq(actionLog.documentId, expenseId), eq(actionLog.actionType, "document_update")));
}

async function approveFresh(expenseId: string): Promise<void> {
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

async function payNow(payer: Viewer, expenseId: string) {
  const confirmed = await confirmEvidence(payer, { expenseId, version: (await moneyOf(expenseId)).version });
  const preview = await previewPayable(payer, { expenseId, payDate: seoulToday() });
  if (preview.payableKrw === undefined || preview.payableKrw === null) throw new Error("지급 총액 없음");
  return completeExpensePayment(payer, { expenseId, expectedPayableKrw: preview.payableKrw, version: confirmed.version });
}

async function extraLines(count: number): Promise<string[]> {
  const names = Array.from({ length: count }, (_, index) => `여러장 후보 ${index + 1}`);
  const added = await addApprovedRevision(
    fx,
    names.map((itemName) => ({ itemName, vendorId: fx.stageOneId, execution: { currency: "KRW" as const, amount: DOC_SUPPLY, fxRate: 1 } })),
  );
  return names.map((name) => {
    const id = added.lineIds.get(name);
    if (!id) throw new Error(`견적 줄 없음: ${name}`);
    return id;
  });
}

const owner = (id: string) => ({ kind: "expense" as const, id });

async function records(by: Viewer, count: number): Promise<string[]> {
  const out: string[] = [];
  for (let index = 0; index < count; index += 1) out.push(await insertRecordFixture(by, { supplyKrw: 1_000_000 + index }));
  return out;
}

describe("attachEvidenceBatch — 05 훅 한 번 (RP-8)", () => {
  it("반려 문서 2건 → 붙임 2행(registrar) · 문서 version 그대로(05 X-1) · 행동 로그 한 줄 · 금액 칸 그대로", async () => {
    const manager = await createIntakeManager();
    const doc = await createReturnedExpenseFixture(fx);
    const ids = await records(manager, 2);
    const before = await moneyOf(doc.expenseId);
    expect(await attachEvidenceBatch(manager, { evidenceIds: ids, owner: owner(doc.expenseId) })).toEqual({ attached: 2 });
    for (const id of ids) expect((await liveLinks(id))[0]).toMatchObject({ attachMode: "registrar", attachedBy: manager.id });
    expect(await moneyOf(doc.expenseId)).toEqual(before);
    const logs = await attachLogs(doc.expenseId);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.detail).toMatchObject({ change: "evidence_record_attach", attachMode: "registrar" });
  });

  it("결재 중 문서 + 붙이기 키 → 붙임 2행 · 결재 인스턴스 version + 1 한 번(2건이어도) · 옛 인스턴스 version 승인은 05 문구로 거부", async () => {
    const manager = await createIntakeManager("붙인담당");
    const doc = await createInReviewExpenseFixture(fx);
    const instanceBefore = await instanceOf(doc.expenseId);
    const moneyBefore = await moneyOf(doc.expenseId);
    const ids = await records(manager, 2);
    await attachEvidenceBatch(manager, { evidenceIds: ids, owner: owner(doc.expenseId) });
    expect((await instanceOf(doc.expenseId)).version).toBe(instanceBefore.version + 1);
    expect(await moneyOf(doc.expenseId)).toEqual(moneyBefore);
    expect(await messageOf(approveDocument(fx.lead, { instanceId: instanceBefore.id, expectedVersion: instanceBefore.version }))).toMatch(/^붙인담당.*이 \d{2}:\d{2}에 증빙을 바꿈 · 새로 고침$/);
  });

  it("결재 중 + 붙이기 키 없음 → 05 거부 `결재 중 · 증빙 잠김` · 붙임 0", async () => {
    const keyless = await createIntakeManager("등록만", { attach: false });
    const doc = await createInReviewExpenseFixture(fx);
    const ids = await records(keyless, 2);
    expect(await messageOf(attachEvidenceBatch(keyless, { evidenceIds: ids, owner: owner(doc.expenseId) }))).toBe(EVIDENCE_LOCKED_IN_REVIEW);
    for (const id of ids) expect(await liveLinks(id)).toHaveLength(0);
  });

  it("승인 · 완료 프로젝트 + 붙이기 권한자 → 붙임 2행 · 문서 version + 1 한 번(2건이어도) · 작성자는 같은 문서에서 거부", async () => {
    const manager = await createIntakeManager();
    const doc = await createInReviewExpenseFixture(fx);
    await approveFresh(doc.expenseId);
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, fx.projectId));
    const before = await moneyOf(doc.expenseId);
    await attachEvidenceBatch(manager, { evidenceIds: await records(manager, 2), owner: owner(doc.expenseId) });
    const after = await moneyOf(doc.expenseId);
    expect(after.version).toBe(before.version + 1);
    expect({ supply: after.supply, vat: after.vat, payable: after.payable }).toEqual({ supply: before.supply, vat: before.vat, payable: before.payable });

    const teamRecord = await insertRecordFixture(manager);
    await setRecordVisibilityFixture(teamRecord, { visibility: "team", teamId: await teamIdByName("기획1팀") });
    expect(await messageOf(attachEvidenceAsAuthor(fx.pm, { evidenceIds: [teamRecord], owner: owner(doc.expenseId) }))).toBe(EVIDENCE_COMPLETED_PROJECT_LOCKED);
  });
});

describe("attachEvidenceBatch — 카드 R1(승인 · 지급 전) · R2(지급 권한자만 자동 확인)", () => {
  it("R1: 승인 · 완료 아님 · 지급 전 → 성공 · 지급 뒤 → `결재 중 아님 · 증빙은 작성자` · 사전 판독 뒤 지급이 커밋돼도 잠금 뒤 재판독으로 같은 거부", async () => {
    const manager = await createIntakeManager();
    const payer = await makePayer();
    const lines = await extraLines(2);
    const first = await createInReviewExpenseFixture(fx, { lineId: lines[0] });
    await approveFresh(first.expenseId);
    const before = await moneyOf(first.expenseId);
    await attachEvidenceBatch(manager, { evidenceIds: await records(manager, 2), owner: owner(first.expenseId) });
    expect((await moneyOf(first.expenseId)).version).toBe(before.version + 1);
    await payNow(payer, first.expenseId);
    const afterPay = await records(manager, 2);
    expect(await messageOf(attachEvidenceBatch(manager, { evidenceIds: afterPay, owner: owner(first.expenseId) }))).toBe("결재 중 아님 · 증빙은 작성자");

    const second = await createInReviewExpenseFixture(fx, { lineId: lines[1] });
    await approveFresh(second.expenseId);
    const late = await records(manager, 2);
    const message = await messageOf(attachEvidenceBatch(manager, { evidenceIds: late, owner: owner(second.expenseId) }, { afterPreRead: async () => void (await payNow(payer, second.expenseId)) }));
    expect(message).toBe("결재 중 아님 · 증빙은 작성자");
    for (const id of [...afterPay, ...late]) expect(await liveLinks(id)).toHaveLength(0);
  });

  it("R2: 지급 권한 있는 경영관리가 붙여 공급가 합 = 문서 공급가 → 확인 기록 confirmed 한 줄(여러 장이어도 한 번) · 지급 권한 없으면 없음 · 반려 문서는 없음", async () => {
    const payerManager = await createIntakeManager("지급경영", { payments: true });
    const plain = await createIntakeManager("비지급경영");
    const lines = await extraLines(3);
    const inReview = async (lineId: string | undefined) => createInReviewExpenseFixture(fx, { lineId, linkRecordId: await insertRecordFixture(payerManager, { supplyKrw: 10_000_000 }) });
    const restTwo = async (by: Viewer) => [await insertRecordFixture(by, { supplyKrw: 1_000_000 }), await insertRecordFixture(by, { supplyKrw: DOC_SUPPLY - 11_000_000 })];

    const withPay = await inReview(lines[0]);
    await attachEvidenceBatch(payerManager, { evidenceIds: await restTwo(payerManager), owner: owner(withPay.expenseId) });
    const confirmed = await db.select().from(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, withPay.expenseId));
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]).toMatchObject({ status: "confirmed", reviewedBy: payerManager.id });

    const withoutPay = await inReview(lines[1]);
    await attachEvidenceBatch(plain, { evidenceIds: await restTwo(plain), owner: owner(withoutPay.expenseId) });
    expect(await db.select().from(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, withoutPay.expenseId))).toHaveLength(0);

    const returned = await createReturnedExpenseFixture(fx, { lineId: lines[2], linkRecordId: await insertRecordFixture(payerManager, { supplyKrw: 10_000_000 }) });
    await attachEvidenceBatch(payerManager, { evidenceIds: await restTwo(payerManager), owner: owner(returned.expenseId) });
    expect(await db.select().from(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, returned.expenseId))).toHaveLength(0);
  });
});

describe("attachEvidenceBatch — 상한 · 전부-아니면-전무 · 결정적 경합 (E45 · PA-MULTI-CONFLICT)", () => {
  it(`${ATTACH_BATCH_MAX}건은 붙고 ${ATTACH_BATCH_MAX + 1}건은 트랜잭션 전에 상한 글자로 거부 · 붙임 0`, async () => {
    const manager = await createIntakeManager();
    const doc = await createReturnedExpenseFixture(fx);
    const ids = await records(manager, ATTACH_BATCH_MAX + 1);
    expect(await messageOf(attachEvidenceBatch(manager, { evidenceIds: ids, owner: owner(doc.expenseId) }))).toBe(ATTACH_BATCH_CAP_LINE);
    for (const id of ids) expect(await liveLinks(id)).toHaveLength(0);
    expect(await attachEvidenceBatch(manager, { evidenceIds: ids.slice(0, ATTACH_BATCH_MAX), owner: owner(doc.expenseId) })).toEqual({ attached: ATTACH_BATCH_MAX });
    expect(await attachLogs(doc.expenseId)).toHaveLength(1);
  });

  it("다른 문서가 증빙 하나를 잠근 채 멈춘 동안 3건 출발 → waitForLockWaiter → 앞 커밋 → 3건 전부 거부 `다른 사람이 먼저 붙임 · {거래처} · 새로 고침` · 붙임 0", async () => {
    const manager = await createIntakeManager();
    const a = await createReturnedExpenseFixture(fx);
    const b = await createReturnedExpenseFixture(fx, { lineId: fx.lines.split });
    const contested = await insertRecordFixture(manager, { nameOnDocument: "경합상회" });
    const others = await records(manager, 2);
    const gate = deferred();
    const reached = deferred();
    const first = attachEvidenceRecord(manager, { recordId: contested, owner: { kind: "expense", id: a.expenseId } }, { afterLock: () => (reached.resolve(), gate.promise) });
    await reached.promise;
    const second = caught(attachEvidenceBatch(manager, { evidenceIds: [...others, contested], owner: owner(b.expenseId) }));
    await waitForLockWaiter(pool);
    gate.resolve();
    expect(await first).toEqual({ created: true });
    expect((await second) as Error).toMatchObject({ message: "다른 사람이 먼저 붙임 · 경합상회 · 새로 고침" });
    for (const id of others) expect(await liveLinks(id)).toHaveLength(0);
    expect(await liveLinks(contested)).toHaveLength(1);
    expect(await attachLogs(b.expenseId)).toHaveLength(0);
  });

  it("작성자 3건이 같은 경합에 걸려도 같은 글자로 전부 거부 · 작성자 쪽 붙임 0", async () => {
    const manager = await createIntakeManager();
    const draftOwnerDoc = await createReturnedExpenseFixture(fx);
    const a = await createReturnedExpenseFixture(fx, { lineId: fx.lines.split });
    const team1 = await teamIdByName("기획1팀");
    const contested = await insertRecordFixture(manager, { nameOnDocument: "경합상회" });
    await setRecordVisibilityFixture(contested, { visibility: "team", teamId: team1 });
    const others = await records(manager, 2);
    for (const id of others) await setRecordVisibilityFixture(id, { visibility: "team", teamId: team1 });
    const gate = deferred();
    const reached = deferred();
    const first = attachEvidenceRecord(manager, { recordId: contested, owner: { kind: "expense", id: a.expenseId } }, { afterLock: () => (reached.resolve(), gate.promise) });
    await reached.promise;
    const second = caught(attachEvidenceAsAuthor(fx.pm, { evidenceIds: [...others, contested], owner: owner(draftOwnerDoc.expenseId) }));
    await waitForLockWaiter(pool);
    gate.resolve();
    await first;
    expect(((await second) as Error).message).toBe("다른 사람이 먼저 붙임 · 경합상회 · 새로 고침");
    for (const id of others) expect(await liveLinks(id)).toHaveLength(0);
  });

  it("먼저 붙은 증빙이 둘이면 id 오름차순 첫 거래처 + ` 외 1건`", async () => {
    const manager = await createIntakeManager();
    const a = await createReturnedExpenseFixture(fx);
    const b = await createReturnedExpenseFixture(fx, { lineId: fx.lines.split });
    const one = await insertRecordFixture(manager, { nameOnDocument: "가나상회" });
    const two = await insertRecordFixture(manager, { nameOnDocument: "다라상회" });
    const free = await insertRecordFixture(manager);
    const names = new Map([[one, "가나상회"], [two, "다라상회"]]);
    const firstName = names.get([one, two].sort()[0] ?? one);
    const message = await messageOf(
      attachEvidenceBatch(manager, { evidenceIds: [free, one, two], owner: owner(b.expenseId) }, {
        afterPreRead: async () => {
          await attachEvidenceRecord(manager, { recordId: one, owner: { kind: "expense", id: a.expenseId } });
          await attachEvidenceRecord(manager, { recordId: two, owner: { kind: "expense", id: a.expenseId } });
        },
      }),
    );
    expect(message).toBe(`다른 사람이 먼저 붙임 · ${firstName} 외 1건 · 새로 고침`);
    expect(await liveLinks(free)).toHaveLength(0);
  });
});

describe("attachEvidenceBatch — 사전 판독 묶음 읽기 (PR-C /review P3-3)", () => {
  it("3건 붙이기 → 사전 판독은 listEvidenceRecordsByIds 한 번 · 건마다 getEvidenceRecord 0번", async () => {
    const manager = await createIntakeManager();
    const doc = await createReturnedExpenseFixture(fx);
    const ids = await records(manager, 3);
    vi.mocked(getEvidenceRecord).mockClear();
    vi.mocked(listEvidenceRecordsByIds).mockClear();
    expect(await attachEvidenceBatch(manager, { evidenceIds: ids, owner: owner(doc.expenseId) })).toEqual({ attached: 3 });
    expect(vi.mocked(getEvidenceRecord)).not.toHaveBeenCalled();
    expect(vi.mocked(listEvidenceRecordsByIds)).toHaveBeenCalledTimes(1);
  });

  it("거부 차례 그대로: id 오름차순으로 먼저 오는 줄의 거부(없는 증빙 / 보관됨) · 붙임 0", async () => {
    const manager = await createIntakeManager();
    const doc = await createReturnedExpenseFixture(fx);
    const archived = await insertRecordFixture(manager);
    await setRecordArchivedFixture(archived, manager.id);
    const missing = randomUUID();
    const expected = [missing, archived].sort()[0] === missing ? "없는 증빙 · 새로 고침" : "보관됨";
    expect(await messageOf(attachEvidenceBatch(manager, { evidenceIds: [archived, missing], owner: owner(doc.expenseId) }))).toBe(expected);
    expect(await liveLinks(archived)).toHaveLength(0);
  });
});

describe("listEvidencePool — 경영관리 미리 고름 (DB-5)", () => {
  it("결재 중 문서에서 열면 preselect가 비고, 반려 문서에서 열면 1위가 미리 골라진다", async () => {
    const manager = await createIntakeManager();
    const inReview = await createInReviewExpenseFixture(fx);
    const returned = await createReturnedExpenseFixture(fx, { lineId: fx.lines.split });
    await records(manager, 2);
    expect((await listEvidencePool(manager, { owner: owner(inReview.expenseId) })).preselect).toEqual([]);
    const pool2 = await listEvidencePool(manager, { owner: owner(returned.expenseId) });
    expect(pool2.mode).toBe("registrar");
    expect(pool2.preselect).toHaveLength(1);
  });
});
