import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, pool, type DbOrTx } from "@/db/client";
import {
  actionLog,
  approvalInstances,
  evidenceImportBatches,
  evidenceRecordLinks,
  evidenceRecords,
  expenseEvidenceReviews,
  expensePayments,
  expenses,
  files,
  projects,
} from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { deleteReviewByExpense, upsertReview } from "@/repositories/expense-evidence-reviews";
import { bumpExpenseVersion } from "@/repositories/expense-payments";
import { approveDocument, rejectDocument } from "@/domain/approvals";
import { createExpenseFromLines, saveExpenseDraft, submitExpense, type SubmitExpenseResult } from "@/domain/expenses";
import { autoConfirmOnAttach, confirmEvidence, waiveEvidence } from "@/domain/evidence-reviews";
import { expenseCostBasis } from "@/domain/evidence-reviews/cost-basis";
import { evidenceSourcesOf, hasEvidence } from "@/domain/evidence/has-evidence";
import { completeExpensePayment, getPaymentView, PaymentConflictError, previewPayable } from "@/domain/payments";
import { listPaidPayments, listPaymentTargets } from "@/domain/payments/targets";
import { getPreSettleCheck } from "@/domain/pre-settle-check";
import { createOrgUnit, createTeam } from "@/domain/org";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createCorpCard } from "@/domain/corp-cards";
import { createCardUsage, listCardUsages, precheckCardUsage, type CardUsageInput } from "@/domain/corp-card-usages";
import { completeEvidenceUpload, requestEvidenceUpload, voidEvidence } from "@/domain/evidence";
import { listEvidenceVoidSignals } from "@/domain/evidence/signals";
import { listExpenseEvidenceSignals } from "@/domain/expenses/evidence-signals";
import { GateBlockedError } from "@/domain/rules/gate";
import { PAYMENT_METHOD_EVIDENCE_PAIRS } from "@/domain/settings/keys";
import { upsertSimpleValue } from "@/repositories/settings";
import { withTransaction } from "@/lib/db-transaction";
import { seoulToday } from "@/lib/dates";
import { attachEvidence, makeEvidenceManager, setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";
import { makePaymentManager, setEvidenceRequired } from "./fixtures/payments";
import { makePerson } from "./approvals-fixtures";
import { createMemoryStorage } from "./fakes/memory-storage";
import { readKeys } from "@/domain/evidence-records/attach";
import { deferred, waitForLockWaiter } from "./lock-race";

// 06.1-12(EVID-08 · EVID-09 · D-6104 · D-6105 · RP-4): 「증빙 있음」 = 살아 있는 05 파일 OR 살아 있는 증빙 기록 붙임(detached_at IS NULL).
// 판정은 domain/evidence/has-evidence.ts 한 곳 — 제출 ⑧ · 증빙 확인 · 지급 게이트가 같은 답을 낸다. 붙임 행은 이 파일 안 지역 도우미로 넣는다
// (06.1-04 fixtures/evidence.ts는 같은 웨이브 다른 플랜 몫 · 붙이기 화면 06.1-06은 아직 없다).

type LinkOwnerKind = "expense" | "purchase_request" | "corp_card_usage";
type AttachMode = "registrar" | "author" | "reconcile";

const DOC_SUPPLY = 12_400_000;

beforeEach(async () => {
  await setEvidenceRequired(false);
});

// 지급 권한자 + 금액 · 값 정보 항목 노출(06 evidence-reviews 통합과 같은 꼴).
async function makePayer(name?: string): Promise<Viewer> {
  const payer = await makePaymentManager(name);
  if (!payer.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: true });
  return payer;
}

// 등록 묶음 · 증빙 기록 · 붙임 한 벌(06.1-01 스키마). 합계 = 공급가 + 세액(CHECK) — 세액 0.
async function insertRecordAndLink(
  by: Viewer,
  input: { ownerKind?: LinkOwnerKind; ownerId: string; attachMode: AttachMode; supplyKrw: number; evidenceType?: string },
  tx: DbOrTx = db,
): Promise<{ recordId: string; linkId: string }> {
  const [batch] = await tx
    .insert(evidenceImportBatches)
    .values({
      format: "hometax-tax-invoice",
      originalName: "매입 세금계산서.xls",
      fileSha256: randomBytes(32).toString("hex"),
      rowCount: 1,
      registeredCount: 1,
      skippedDuplicateCount: 0,
      uploadedBy: by.id,
    })
    .returning({ id: evidenceImportBatches.id });
  if (!batch) throw new Error("등록 묶음 없음");
  const [record] = await tx
    .insert(evidenceRecords)
    .values({
      batchId: batch.id,
      format: "hometax-tax-invoice",
      evidenceType: input.evidenceType ?? "tax_invoice",
      dedupeKey: `test:${randomUUID()}`,
      issuedOn: "2026-09-20",
      supplyKrw: input.supplyKrw,
      vatKrw: 0,
      totalKrw: input.supplyKrw,
      createdBy: by.id,
    })
    .returning({ id: evidenceRecords.id });
  if (!record) throw new Error("증빙 기록 없음");
  const [link] = await tx
    .insert(evidenceRecordLinks)
    .values({ evidenceRecordId: record.id, ownerKind: input.ownerKind ?? "expense", ownerId: input.ownerId, attachMode: input.attachMode, attachedBy: by.id })
    .returning({ id: evidenceRecordLinks.id });
  if (!link) throw new Error("붙임 없음");
  return { recordId: record.id, linkId: link.id };
}

async function detachLinkRow(linkId: string, by: Viewer): Promise<void> {
  await db.update(evidenceRecordLinks).set({ detachedAt: new Date(), detachedBy: by.id, detachReason: "다른 건 증빙" }).where(eq(evidenceRecordLinks.id, linkId));
}

async function versionOf(expenseId: string): Promise<number> {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row.version;
}

async function aliveFileCount(expenseId: string): Promise<number> {
  const rows = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, expenseId), isNull(files.removedAt), isNull(files.voidedAt)));
  return rows.length;
}

async function newDraft(fx: ExpenseFixture, lineId: string = fx.lines.withVendor): Promise<string> {
  const created = await createExpenseFromLines(fx.pm, { lineIds: [lineId], fields: { note: "행사 운영비" } });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("지출결의를 만들지 못했다");
  return expenseId;
}

// 파일 없이 제출 — submitReadyDraft는 05 파일을 붙이므로 같은 꼴에서 붙이기만 뺐다.
async function submitWithoutFile(viewer: Viewer, expenseId: string): Promise<SubmitExpenseResult> {
  return submitExpense(viewer, { expenseId, expectedVersion: await versionOf(expenseId) });
}

async function approveAll(fx: ExpenseFixture, submitted: SubmitExpenseResult): Promise<void> {
  if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
  const first = await approveDocument(fx.lead, { instanceId: submitted.instanceId, expectedVersion: submitted.version });
  const final = await approveDocument(fx.ceo, { instanceId: submitted.instanceId, expectedVersion: first.version });
  if (final.status !== "approved") throw new Error(`결재 통과 안 됨: ${final.status}`);
}

async function payableOf(payer: Viewer, expenseId: string): Promise<number> {
  const preview = await previewPayable(payer, { expenseId, payDate: seoulToday() });
  if (preview.payableKrw === undefined || preview.payableKrw === null) throw new Error("지급 총액을 셈할 수 없는 문서");
  return preview.payableKrw;
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

async function reviewOf(expenseId: string) {
  const [row] = await db.select().from(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, expenseId));
  return row ?? null;
}

async function instanceOf(expenseId: string): Promise<{ id: string; version: number }> {
  const [row] = await db.select({ id: approvalInstances.id, version: approvalInstances.version }).from(approvalInstances).where(eq(approvalInstances.documentId, expenseId));
  if (!row) throw new Error("결재 인스턴스 없음");
  return row;
}

async function documentUpdateDetails(expenseId: string): Promise<Record<string, unknown>[]> {
  const rows = await db.select({ detail: actionLog.detail }).from(actionLog).where(and(eq(actionLog.documentId, expenseId), eq(actionLog.actionType, "document_update")));
  return rows.map((row) => row.detail as Record<string, unknown>);
}

async function reviewLogs(expenseId: string): Promise<Record<string, unknown>[]> {
  return (await documentUpdateDetails(expenseId)).filter((detail) => detail.field === "evidenceReview");
}

async function evidenceAddLogs(expenseId: string): Promise<Record<string, unknown>[]> {
  return (await documentUpdateDetails(expenseId)).filter((detail) => detail.change === "evidence_add");
}

// D-6520 — 문서 금액 칸(공급가 네 칸 · 세액 · 원천 · 회사 부담 · 지급액). 자동 확인은 이 칸을 쓰지 않는다.
async function moneyColumnsOf(expenseId: string) {
  const [row] = await db
    .select({
      supplyCurrency: expenses.supplyCurrency,
      supplyForeignAmount: expenses.supplyForeignAmount,
      supplyFxRate: expenses.supplyFxRate,
      supplyAmountKrw: expenses.supplyAmountKrw,
      vatKrw: expenses.vatKrw,
      withholdingKrw: expenses.withholdingKrw,
      companyBorneKrw: expenses.companyBorneKrw,
      payableKrw: expenses.payableKrw,
    })
    .from(expenses)
    .where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row;
}

// 결재 인스턴스의 지금 version으로 끝까지 통과(결재 중 증빙 올림이 인스턴스 version을 올린다 — 05 X-1).
async function approveFresh(fx: ExpenseFixture, expenseId: string): Promise<void> {
  const instance = await instanceOf(expenseId);
  const first = await approveDocument(fx.lead, { instanceId: instance.id, expectedVersion: instance.version });
  const final = await approveDocument(fx.ceo, { instanceId: instance.id, expectedVersion: first.version });
  if (final.status !== "approved") throw new Error(`결재 통과 안 됨: ${final.status}`);
}

async function rejectFresh(fx: ExpenseFixture, expenseId: string): Promise<void> {
  const instance = await instanceOf(expenseId);
  await rejectDocument(fx.lead, { instanceId: instance.id, expectedVersion: instance.version, reason: "공급가 다시" });
}

type LinkSpec = { by?: Viewer; attachMode: AttachMode; supplyKrw: number; evidenceType?: string };

// 붙임과 함께 제출(⑧ — 증빙이 있어야 올라간다). 붙임은 작성 중에 넣고, 결재 중 · 승인 뒤의 「붙이는 순간」은 테스트가 그 상태에서
// autoConfirmOnAttach를 같은 tx로 불러 흉내 낸다(붙이기 화면 06.1-06 · 08이 같은 순서로 부른다).
async function inReviewDoc(fx: ExpenseFixture, by: Viewer, links: LinkSpec[], lineId?: string): Promise<{ expenseId: string; linkIds: string[] }> {
  const expenseId = await newDraft(fx, lineId);
  const linkIds: string[] = [];
  for (const link of links) {
    linkIds.push((await insertRecordAndLink(link.by ?? by, { ownerId: expenseId, attachMode: link.attachMode, supplyKrw: link.supplyKrw, evidenceType: link.evidenceType })).linkId);
  }
  const submitted = await submitWithoutFile(fx.pm, expenseId);
  if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
  return { expenseId, linkIds };
}

async function approvedDoc(fx: ExpenseFixture, by: Viewer, links: LinkSpec[], lineId?: string): Promise<{ expenseId: string; linkIds: string[] }> {
  const doc = await inReviewDoc(fx, by, links, lineId);
  await approveFresh(fx, doc.expenseId);
  return doc;
}

// 붙이는 쪽 트랜잭션 꼴(06.1-06 · 08이 같은 tx에서 부른다): 붙임 행 → autoConfirmOnAttach. canConfirm은 트랜잭션 전에 읽은 지급 권한 자리.
async function attachAndAutoConfirm(by: Viewer, input: { expenseId: string; links: LinkSpec[]; canConfirm: boolean }) {
  return withTransaction(async (tx) => {
    const linkIds: string[] = [];
    for (const link of input.links) {
      linkIds.push((await insertRecordAndLink(link.by ?? by, { ownerId: input.expenseId, attachMode: link.attachMode, supplyKrw: link.supplyKrw, evidenceType: link.evidenceType }, tx)).linkId);
    }
    const outcome = await autoConfirmOnAttach(by, { expenseId: input.expenseId, canConfirm: input.canConfirm }, tx);
    return { outcome, linkIds };
  });
}

const REGISTRAR_FULL: LinkSpec = { attachMode: "registrar", supplyKrw: DOC_SUPPLY };

async function payNow(payer: Viewer, expenseId: string): Promise<{ version: number }> {
  return completeExpensePayment(payer, { expenseId, expectedPayableKrw: await payableOf(payer, expenseId), version: await versionOf(expenseId) });
}

describe("증빙 기록 붙임 = 증빙 있음 (06.1-12 Task 1 트레이서)", () => {
  it("파일 0 · 경영관리 붙임 하나 → 증빙 필수 제출 통과 → 결재 통과 → 증빙 확인(공급가액과 같음) → 지급 완료", async () => {
    await setEvidenceRequired(true);
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const expenseId = await newDraft(fx);
    await insertRecordAndLink(payer, { ownerId: expenseId, attachMode: "registrar", supplyKrw: DOC_SUPPLY });

    const submitted = await submitWithoutFile(fx.pm, expenseId);
    expect(submitted.kind).toBe("submitted");
    await approveAll(fx, submitted);
    expect(await aliveFileCount(expenseId)).toBe(0);

    const confirmed = await confirmEvidence(payer, { expenseId, version: await versionOf(expenseId) });
    expect(confirmed.evidenceStatus).toBe("확인됨");
    const paid = await completeExpensePayment(payer, { expenseId, expectedPayableKrw: await payableOf(payer, expenseId), version: confirmed.version });
    expect(paid.version).toBe(confirmed.version + 1);
  });

  it("뗀 붙임만 → 제출이 ⑧로 막힌다 · 결재 통과 뒤 떼면 지급 게이트가 「증빙 없음 · 기안자 박서연」으로 막는다", async () => {
    await setEvidenceRequired(true);
    const fx = await setupExpenseProject();
    const payer = await makePayer();

    const detachedOnly = await newDraft(fx);
    const early = await insertRecordAndLink(payer, { ownerId: detachedOnly, attachMode: "registrar", supplyKrw: DOC_SUPPLY });
    await detachLinkRow(early.linkId, payer);
    const versionBefore = await versionOf(detachedOnly);
    const refused = await caught(submitWithoutFile(fx.pm, detachedOnly));
    expect(refused).toBeInstanceOf(GateBlockedError);
    expect((refused as Error).message).toBe("증빙 없음 · 증빙 올리기 Ctrl+U");
    expect(await versionOf(detachedOnly)).toBe(versionBefore);

    const approvedId = await newDraft(fx, fx.lines.split);
    const late = await insertRecordAndLink(payer, { ownerId: approvedId, attachMode: "registrar", supplyKrw: 10_000_000 });
    await approveAll(fx, await submitWithoutFile(fx.pm, approvedId));
    const expectedPayableKrw = await payableOf(payer, approvedId);
    await detachLinkRow(late.linkId, payer);
    const blocked = await caught(completeExpensePayment(payer, { expenseId: approvedId, expectedPayableKrw, version: await versionOf(approvedId) }));
    expect(blocked).toBeInstanceOf(GateBlockedError);
    expect((blocked as Error).message).toBe("증빙 없음 · 기안자 박서연");
  });

  // 07.1-03 D-7101 — 같은 뗀 붙임 문서라도 프로젝트가 완료면 기안자가 붙일 수 없다 → 경영관리 갈래(단건 지급 · 지급 행 미리보기 같은 글자).
  it("뗀 붙임만 남은 승인 문서 · 완료 프로젝트 → 지급 게이트 · 지급 행이 「증빙 없음 · 경영관리 등록」", async () => {
    await setEvidenceRequired(true);
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const approvedId = await newDraft(fx, fx.lines.split);
    const late = await insertRecordAndLink(payer, { ownerId: approvedId, attachMode: "registrar", supplyKrw: 10_000_000 });
    await approveAll(fx, await submitWithoutFile(fx.pm, approvedId));
    const expectedPayableKrw = await payableOf(payer, approvedId);
    await detachLinkRow(late.linkId, payer);
    // 테스트 준비 전용 — 프로젝트를 완료 상태로(프로덕션 경로 아님).
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, fx.projectId));
    const blocked = await caught(completeExpensePayment(payer, { expenseId: approvedId, expectedPayableKrw, version: await versionOf(approvedId) }));
    expect(blocked).toBeInstanceOf(GateBlockedError);
    expect((blocked as Error).message).toBe("증빙 없음 · 경영관리 등록");
    expect((await getPaymentView(payer, approvedId))?.row?.blockReason).toBe("증빙 없음 · 경영관리 등록");
  });

  it("evidenceSourcesOf — 파일 1 · 붙임 2(경영관리 1 · 작성자 1) · 뗀 붙임만인 셋을 한 번에(질의 둘) · 증빙 0인 주인은 맵에 없다", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const withFile = await newDraft(fx, fx.lines.withVendor);
    await attachEvidence(fx.pm, withFile);
    const withLinks = await newDraft(fx, fx.lines.split);
    await insertRecordAndLink(payer, { ownerId: withLinks, attachMode: "registrar", supplyKrw: 7_000_000 });
    await insertRecordAndLink(fx.pm, { ownerId: withLinks, attachMode: "author", supplyKrw: 3_000_000 });
    const detachedOnly = await newDraft(await setupExpenseProject());
    const gone = await insertRecordAndLink(payer, { ownerId: detachedOnly, attachMode: "registrar", supplyKrw: 1_000_000 });
    await detachLinkRow(gone.linkId, payer);

    let selects = 0;
    const counted = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === "select") selects += 1;
        return Reflect.get(target, prop, receiver) as unknown;
      },
    });
    const sources = await evidenceSourcesOf(SYSTEM_VIEWER, { ownerKind: "expense", ownerIds: [withFile, withLinks, detachedOnly] }, counted);

    expect(selects).toBe(2);
    expect(sources.get(withFile)).toMatchObject({ fileCount: 1, linkCount: 0 });
    expect(sources.get(withLinks)).toMatchObject({ fileCount: 0, linkCount: 2, authorLinkCount: 1, recordSupplyKrw: 10_000_000 });
    expect(sources.has(detachedOnly)).toBe(false);
    expect([...sources.keys()].sort()).toEqual([withFile, withLinks].sort());
  });

  it("hasEvidence · evidenceSourcesOf는 받은 tx로 붙임을 읽는다 — 트랜잭션 안에서 넣은 붙임을 같은 tx 읽기만 본다", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const expenseId = await newDraft(fx);
    const owner = { ownerKind: "expense", ownerId: expenseId };
    const rollback = new Error("되돌림");

    const seen = await caught(
      withTransaction(async (tx) => {
        await insertRecordAndLink(payer, { ownerId: expenseId, attachMode: "registrar", supplyKrw: DOC_SUPPLY }, tx);
        expect(await hasEvidence(SYSTEM_VIEWER, owner, tx)).toBe(true);
        expect((await evidenceSourcesOf(SYSTEM_VIEWER, { ownerKind: "expense", ownerIds: [expenseId] }, tx)).get(expenseId)).toMatchObject({ fileCount: 0, linkCount: 1 });
        expect(await hasEvidence(SYSTEM_VIEWER, owner)).toBe(false);
        throw rollback;
      }),
    );
    expect(seen).toBe(rollback);
    expect(await hasEvidence(SYSTEM_VIEWER, owner)).toBe(false);
  });

  it("비용 기준(D-6520 · EVID-09) — 붙임만 있으면 같은 공급가가 확정, 떼면 예상", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const expenseId = await newDraft(fx);
    const { linkId } = await insertRecordAndLink(payer, { ownerId: expenseId, attachMode: "registrar", supplyKrw: 9_000_000 });
    const owner = { ownerKind: "expense", ownerId: expenseId };
    const basis = async () => expenseCostBasis({ hasEvidence: await hasEvidence(SYSTEM_VIEWER, owner), supplyKrw: DOC_SUPPLY, lineExecutionKrw: 12_400_000 });

    expect(await basis()).toEqual({ kind: "confirmed", amountKrw: DOC_SUPPLY });
    await detachLinkRow(linkId, payer);
    expect(await basis()).toEqual({ kind: "expected", amountKrw: DOC_SUPPLY });
  });
});


describe("자동 확인 — 지급 권한자가 결재 중 · 승인 문서에 붙이는 순간 저장 (06.1-12 Task 2 · RP-1 × 카드 R2)", () => {
  it("저장(승인) — 확인 기록 confirmed · 확인자 = 붙인 사람 · 전후 금액 = 문서 공급가 · 문서 version + 1 · 로그 한 줄(auto) · 금액 칸 그대로 → 확인됨 · 클릭 없이 지급(다섯 자리 ①②)", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const { expenseId } = await approvedDoc(fx, payer, [REGISTRAR_FULL]);
    const versionBefore = await versionOf(expenseId);
    const moneyBefore = await moneyColumnsOf(expenseId);

    expect((await attachAndAutoConfirm(payer, { expenseId, links: [], canConfirm: true })).outcome).toBe("stored");

    expect(await reviewOf(expenseId)).toMatchObject({ status: "confirmed", reviewedBy: payer.id, amountBeforeKrw: DOC_SUPPLY, amountAfterKrw: DOC_SUPPLY, waiveReason: null });
    expect(await versionOf(expenseId)).toBe(versionBefore + 1);
    expect(await reviewLogs(expenseId)).toEqual([{ field: "evidenceReview", status: "confirmed", auto: true }]);
    expect(await moneyColumnsOf(expenseId)).toEqual(moneyBefore);

    const view = await getPaymentView(payer, expenseId);
    expect(view?.evidenceStatus).toBe("확인됨");
    expect(view?.reviewLine?.byName).toBe("경영관리");
    const paid = await payNow(payer, expenseId);
    expect(paid.version).toBe(versionBefore + 2);
  });

  it("저장(결재 중) — 확인 기록 confirmed · 문서 version 그대로(05 X-1) → 결재 끝까지 통과 → 확인됨 · 클릭 없이 지급(다섯 자리 ①②)", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const { expenseId } = await inReviewDoc(fx, payer, [REGISTRAR_FULL]);
    const versionBefore = await versionOf(expenseId);
    const instanceBefore = (await instanceOf(expenseId)).version;

    expect((await attachAndAutoConfirm(payer, { expenseId, links: [], canConfirm: true })).outcome).toBe("stored");
    expect(await reviewOf(expenseId)).toMatchObject({ status: "confirmed", reviewedBy: payer.id, amountBeforeKrw: DOC_SUPPLY, amountAfterKrw: DOC_SUPPLY });
    expect(await versionOf(expenseId)).toBe(versionBefore);
    expect((await instanceOf(expenseId)).version).toBe(instanceBefore);

    await approveFresh(fx, expenseId);
    const view = await getPaymentView(payer, expenseId);
    expect(view?.evidenceStatus).toBe("확인됨");
    expect(view?.reviewLine?.byName).toBe("경영관리");
    await expect(payNow(payer, expenseId)).resolves.toMatchObject({ version: versionBefore + 1 });
  });

  it("(N-1) 결재 중 자동 확인 뒤 증빙 붙이기 권한자가 05 파일을 올리면 확인 기록이 풀린다 — 로그 reviewReleased · 문서 version 그대로 → 승인 뒤 확인 전 · 지급은 증빙 확인 전", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const manager = await makeEvidenceManager();
    const { expenseId } = await inReviewDoc(fx, payer, [REGISTRAR_FULL]);
    expect((await attachAndAutoConfirm(payer, { expenseId, links: [], canConfirm: true })).outcome).toBe("stored");
    const versionBefore = await versionOf(expenseId);
    const instanceBefore = (await instanceOf(expenseId)).version;

    const file = await attachEvidence(manager, expenseId);

    expect(await reviewOf(expenseId)).toBeNull();
    expect(await evidenceAddLogs(expenseId)).toContainEqual({ change: "evidence_add", fileId: file.id, reviewReleased: "confirmed" });
    expect(await versionOf(expenseId)).toBe(versionBefore);
    expect((await instanceOf(expenseId)).version).toBe(instanceBefore + 1);

    await approveFresh(fx, expenseId);
    expect((await getPaymentView(payer, expenseId))?.evidenceStatus).toBe("확인 전");
    const blocked = await caught(payNow(payer, expenseId));
    expect(blocked).toBeInstanceOf(GateBlockedError);
    expect((blocked as Error).message).toBe("증빙 확인 전 · 증빙 확인");
  });

  it("결재 중 파일 올림(확인 기록 없음 — 회귀) — 로그에 reviewReleased 칸 없음 · 문서 version 그대로", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const manager = await makeEvidenceManager();
    const { expenseId } = await inReviewDoc(fx, payer, [REGISTRAR_FULL]);
    const versionBefore = await versionOf(expenseId);

    const file = await attachEvidence(manager, expenseId);

    expect(await evidenceAddLogs(expenseId)).toEqual([{ change: "evidence_add", fileId: file.id }]);
    expect(await versionOf(expenseId)).toBe(versionBefore);
    expect(await reviewOf(expenseId)).toBeNull();
  });

  describe("건너뜀 — 쓰기 0 · 확인 기록 · version 그대로", () => {
    async function expectSkipped(by: Viewer, expenseId: string, links: LinkSpec[], canConfirm: boolean): Promise<void> {
      const versionBefore = await versionOf(expenseId);
      const reviewBefore = await reviewOf(expenseId);
      const logsBefore = await reviewLogs(expenseId);
      expect((await attachAndAutoConfirm(by, { expenseId, links, canConfirm })).outcome).toBe("skipped");
      expect(await reviewOf(expenseId)).toEqual(reviewBefore);
      expect(await versionOf(expenseId)).toBe(versionBefore);
      expect(await reviewLogs(expenseId)).toEqual(logsBefore);
    }

    it("지급 권한 없음(canConfirm: false · 앞선 확인 기록 없음)", async () => {
      const fx = await setupExpenseProject();
      const manager = await makeEvidenceManager();
      const { expenseId } = await approvedDoc(fx, manager, [REGISTRAR_FULL]);
      await expectSkipped(manager, expenseId, [], false);
    });

    it("반려 문서", async () => {
      const fx = await setupExpenseProject();
      const payer = await makePayer();
      const { expenseId } = await inReviewDoc(fx, payer, [REGISTRAR_FULL]);
      await rejectFresh(fx, expenseId);
      await expectSkipped(payer, expenseId, [], true);
    });

    it("지급 완료 문서", async () => {
      const fx = await setupExpenseProject();
      const payer = await makePayer();
      const { expenseId, linkIds } = await approvedDoc(fx, payer, [REGISTRAR_FULL]);
      // 증빙 필수 off — 붙임을 떼고(증빙 0 · 확인 게이트 없음) 지급한 뒤 다시 붙인다.
      await detachLinkRow(linkIds[0] ?? "", payer);
      await payNow(payer, expenseId);
      await expectSkipped(payer, expenseId, [REGISTRAR_FULL], true);
    });

    it("기록 공급가 ≠ 문서 공급가액", async () => {
      const fx = await setupExpenseProject();
      const payer = await makePayer();
      const { expenseId } = await approvedDoc(fx, payer, [{ attachMode: "registrar", supplyKrw: 12_000_000 }]);
      await expectSkipped(payer, expenseId, [], true);
    });

    it("작성자 붙임 섞임(합은 공급가와 같음)", async () => {
      const fx = await setupExpenseProject();
      const payer = await makePayer();
      const { expenseId } = await approvedDoc(fx, payer, [{ attachMode: "registrar", supplyKrw: 12_000_000 }, { by: fx.pm, attachMode: "author", supplyKrw: 400_000 }]);
      await expectSkipped(payer, expenseId, [], true);
    });

    it("05 파일 있음(합은 공급가와 같음)", async () => {
      const fx = await setupExpenseProject();
      const payer = await makePayer();
      const expenseId = await newDraft(fx);
      await insertRecordAndLink(payer, { ownerId: expenseId, attachMode: "registrar", supplyKrw: DOC_SUPPLY });
      expect((await submitReadyDraft(fx.pm, expenseId)).kind).toBe("submitted");
      await approveFresh(fx, expenseId);
      expect(await aliveFileCount(expenseId)).toBe(1);
      await expectSkipped(payer, expenseId, [], true);
    });

    it("면제 기록 있음", async () => {
      const fx = await setupExpenseProject();
      const payer = await makePayer();
      const { expenseId, linkIds } = await approvedDoc(fx, payer, [REGISTRAR_FULL]);
      await detachLinkRow(linkIds[0] ?? "", payer);
      await waiveEvidence(payer, { expenseId, version: await versionOf(expenseId), reason: "영수증 분실 확인" });
      expect((await reviewOf(expenseId))?.status).toBe("waived");
      await expectSkipped(payer, expenseId, [REGISTRAR_FULL], true);
    });
  });

  it("풀림(결재 중) — 공급가가 다른 기록을 더 붙이면 released · 확인 기록 없음 · 로그 released 한 줄 → 승인 뒤 확인 전", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const manager = await makeEvidenceManager();
    const { expenseId } = await inReviewDoc(fx, payer, [REGISTRAR_FULL]);
    expect((await attachAndAutoConfirm(payer, { expenseId, links: [], canConfirm: true })).outcome).toBe("stored");

    expect((await attachAndAutoConfirm(manager, { expenseId, links: [{ attachMode: "registrar", supplyKrw: 500_000 }], canConfirm: false })).outcome).toBe("released");
    expect(await reviewOf(expenseId)).toBeNull();
    expect((await reviewLogs(expenseId)).filter((detail) => detail.status === "released")).toEqual([{ field: "evidenceReview", status: "released", auto: true }]);

    await approveFresh(fx, expenseId);
    expect((await getPaymentView(payer, expenseId))?.evidenceStatus).toBe("확인 전");
  });

  it("풀림(권한 없음 · 조건 그대로 — N-2) — 지급 권한 없는 사람이 같은 금액의 다른 기록으로 바꾼 tx는 앞선 확인을 남기지 않는다", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const manager = await makeEvidenceManager();
    const { expenseId, linkIds } = await inReviewDoc(fx, payer, [REGISTRAR_FULL]);
    expect((await attachAndAutoConfirm(payer, { expenseId, links: [], canConfirm: true })).outcome).toBe("stored");
    await detachLinkRow(linkIds[0] ?? "", manager);

    expect((await attachAndAutoConfirm(manager, { expenseId, links: [REGISTRAR_FULL], canConfirm: false })).outcome).toBe("released");
    expect(await reviewOf(expenseId)).toBeNull();
  });

  it("풀림(승인) — 저장된 자동 확인 문서에 작성자 붙임 + 05 훅과 같은 두 쓰기 뒤 autoConfirmOnAttach는 skipped · 상태 확인 전", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const { expenseId } = await approvedDoc(fx, payer, [REGISTRAR_FULL]);
    expect((await attachAndAutoConfirm(payer, { expenseId, links: [], canConfirm: true })).outcome).toBe("stored");

    const outcome = await withTransaction(async (tx) => {
      await insertRecordAndLink(fx.pm, { ownerId: expenseId, attachMode: "author", supplyKrw: 400_000 }, tx);
      // 06.1-06 내보냄 전 — 05 훅(승인 문서)과 같은 순서: 확인 기록 지움 → 문서 version + 1.
      await deleteReviewByExpense(fx.pm, expenseId, tx);
      const bumped = await bumpExpenseVersion(fx.pm, { expenseId, expectedVersion: await versionOf(expenseId), updatedBy: fx.pm.id }, tx);
      if (bumped === null) throw new Error("version 못 올림");
      return autoConfirmOnAttach(payer, { expenseId, canConfirm: true }, tx);
    });
    expect(outcome).toBe("skipped");
    expect(await reviewOf(expenseId)).toBeNull();
    expect((await getPaymentView(payer, expenseId))?.evidenceStatus).toBe("확인 전");
  });

  describe("다시 올림(N-2) — 제출 tx가 앞 회차 자동 확인을 지운다", () => {
    async function rejectedAfterAutoConfirm(): Promise<{ fx: ExpenseFixture; payer: Viewer; expenseId: string; linkId: string }> {
      const fx = await setupExpenseProject();
      const payer = await makePayer();
      const { expenseId, linkIds } = await inReviewDoc(fx, payer, [REGISTRAR_FULL]);
      expect((await attachAndAutoConfirm(payer, { expenseId, links: [], canConfirm: true })).outcome).toBe("stored");
      await rejectFresh(fx, expenseId);
      expect((await reviewOf(expenseId))?.status).toBe("confirmed");
      return { fx, payer, expenseId, linkId: linkIds[0] ?? "" };
    }

    it("작성자가 공급가를 고쳐 다시 제출 → 확인 기록이 지워진다", async () => {
      const { fx, expenseId } = await rejectedAfterAutoConfirm();
      await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: await versionOf(expenseId), fields: { supply: { currency: "KRW", amount: 12_000_000, fxRate: 1 } } });
      expect((await submitWithoutFile(fx.pm, expenseId)).kind).toBe("submitted");
      expect(await reviewOf(expenseId)).toBeNull();
    });

    it("공급가 · 붙임 그대로 다시 제출 → 확인 기록이 지워진다 · 로그 released 한 줄", async () => {
      const { fx, expenseId } = await rejectedAfterAutoConfirm();
      expect((await submitWithoutFile(fx.pm, expenseId)).kind).toBe("submitted");
      expect(await reviewOf(expenseId)).toBeNull();
      expect((await reviewLogs(expenseId)).filter((detail) => detail.status === "released")).toEqual([{ field: "evidenceReview", status: "released", auto: true }]);
    });

    it("반려 중 지급 권한 없는 사람이 같은 금액의 다른 기록으로 바꾼 뒤 제출 → 확인 기록 없음", async () => {
      const { fx, payer, expenseId, linkId } = await rejectedAfterAutoConfirm();
      const manager = await makeEvidenceManager();
      await detachLinkRow(linkId, manager);
      expect((await attachAndAutoConfirm(manager, { expenseId, links: [REGISTRAR_FULL], canConfirm: false })).outcome).toBe("skipped");
      // 반려 중에는 붙임이 앞선 확인 기록을 건드리지 않는다 — 원래 확인자 이름이 남은 채 다시 올라온다(조건만 재면 이대로 남는다).
      expect(await reviewOf(expenseId)).toMatchObject({ status: "confirmed", reviewedBy: payer.id });
      expect((await submitWithoutFile(fx.pm, expenseId)).kind).toBe("submitted");
      expect(await reviewOf(expenseId)).toBeNull();
    });

    it("면제 기록은 제출이 건드리지 않는다", async () => {
      const fx = await setupExpenseProject();
      const payer = await makePayer();
      const expenseId = await newDraft(fx);
      await insertRecordAndLink(payer, { ownerId: expenseId, attachMode: "registrar", supplyKrw: DOC_SUPPLY });
      await upsertReview(SYSTEM_VIEWER, { expenseId, status: "waived", amountBeforeKrw: null, amountAfterKrw: null, waiveReason: "테스트 준비 — 면제 줄", reviewedBy: payer.id }, db);
      expect((await submitWithoutFile(fx.pm, expenseId)).kind).toBe("submitted");
      expect(await reviewOf(expenseId)).toMatchObject({ status: "waived", waiveReason: "테스트 준비 — 면제 줄" });
      expect(await reviewLogs(expenseId)).toEqual([]);
    });
  });

  it("수동 닫기 — 공급가 불일치 → 확인 전 · 지급은 증빙 확인 전 → 06 증빙 확인(공급가액 고침) → 확인됨 · 지급 · 문서 공급가 = 고친 값(D-6520)", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const { expenseId } = await approvedDoc(fx, payer, [{ attachMode: "registrar", supplyKrw: 12_000_000 }]);
    expect((await attachAndAutoConfirm(payer, { expenseId, links: [], canConfirm: true })).outcome).toBe("skipped");
    expect((await getPaymentView(payer, expenseId))?.evidenceStatus).toBe("확인 전");
    const blocked = await caught(payNow(payer, expenseId));
    expect(blocked).toBeInstanceOf(GateBlockedError);
    expect((blocked as Error).message).toBe("증빙 확인 전 · 증빙 확인");

    const confirmed = await confirmEvidence(payer, { expenseId, version: await versionOf(expenseId), correctedSupplyAmount: 12_100_000 });
    expect(confirmed.evidenceStatus).toBe("확인됨");
    expect((await moneyColumnsOf(expenseId)).supplyAmountKrw).toBe(12_100_000);
    await expect(payNow(payer, expenseId)).resolves.toMatchObject({ version: confirmed.version + 1 });
    expect((await moneyColumnsOf(expenseId)).supplyAmountKrw).toBe(12_100_000);
  });
});

describe("목록 · 묶음 자리 — 같은 판정 · 저장된 자동 확인 그대로 (06.1-12 Task 3)", () => {
  async function storedApproved(fx: ExpenseFixture, payer: Viewer, lineId?: string): Promise<string> {
    const { expenseId } = await approvedDoc(fx, payer, [REGISTRAR_FULL], lineId);
    expect((await attachAndAutoConfirm(payer, { expenseId, links: [], canConfirm: true })).outcome).toBe("stored");
    return expenseId;
  }

  it("지급 대상(다섯 자리 ③) — 자동 확인 저장 → P4 · 확인됨 / 기록만 · 확인 기록 없음 → P2 확인 전 / 붙임 뗌 → 증빙 없음(증빙 필수 켬)", async () => {
    await setEvidenceRequired(true);
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const stored = await storedApproved(fx, payer);
    const unconfirmed = (await approvedDoc(fx, payer, [{ attachMode: "registrar", supplyKrw: 9_000_000 }], fx.lines.split)).expenseId;
    const other = await setupExpenseProject();
    const detached = await approvedDoc(other, payer, [REGISTRAR_FULL]);
    await detachLinkRow(detached.linkIds[0] ?? "", payer);

    const rows = (await listPaymentTargets(payer, {})).groups.flatMap((group) => group.rows);
    expect(rows.find((row) => row.id === stored)).toMatchObject({ selectable: true, reason: null, evidenceStatus: "확인됨" });
    expect(rows.find((row) => row.id === unconfirmed)).toMatchObject({ selectable: false, reason: "증빙 확인 전 · 증빙 확인", evidenceStatus: "확인 전" });
    expect(rows.find((row) => row.id === detached.expenseId)).toMatchObject({ selectable: false, reason: "증빙 없음 · 기안자 박서연", evidenceStatus: "증빙 없음" });
  });

  it("지급 완료 목록(다섯 자리 ④) — 저장된 자동 확인으로 지급한 문서의 상태 낱말이 확인됨", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const expenseId = await storedApproved(fx, payer);
    await payNow(payer, expenseId);

    const rows = (await listPaidPayments(payer, {})).groups.flatMap((group) => group.rows);
    expect(rows.find((row) => row.id === expenseId)?.evidenceStatus).toBe("확인됨");
  });

  it("완료 전 점검(다섯 자리 ⑤) — 자동 확인 저장 · 기록만 붙은 결재 통과 문서는 세지 않는다 · 결재 중 기록만 → 결재 중 · 뗀 붙임만 → 증빙 없음", async () => {
    const payer = await makePayer();
    const pendingOf = async (fx: ExpenseFixture) => {
      const check = await getPreSettleCheck(fx.pm, fx.projectId);
      return { open: check.openExpenses.rows.map((row) => ({ id: row.id, state: row.state })), pending: check.evidencePending.rows.map((row) => ({ id: row.id, state: row.state })) };
    };

    // 저장된 자동 확인(withVendor) · 기록만 · 확인 기록 없음(split) — 06-36: 결재 통과 · 증빙 있음은 확인 여부와 상관없이 세지 않는다.
    const approvedFx = await setupExpenseProject();
    await storedApproved(approvedFx, payer);
    await approvedDoc(approvedFx, payer, [{ attachMode: "registrar", supplyKrw: 9_000_000 }], approvedFx.lines.split);
    expect(await pendingOf(approvedFx)).toEqual({ open: [], pending: [] });

    // 결재 중 기록만 — 증빙 있음이라 `in_review`(증빙 없음 아님).
    const inReviewFx = await setupExpenseProject();
    const inReview = await inReviewDoc(inReviewFx, payer, [REGISTRAR_FULL]);
    expect(await pendingOf(inReviewFx)).toEqual({ open: [{ id: inReview.expenseId, state: "in_review" }], pending: [] });

    // 뗀 붙임만 남은 결재 통과 문서 — 증빙 대기 `no_evidence`.
    const detachedFx = await setupExpenseProject();
    const detached = await approvedDoc(detachedFx, payer, [REGISTRAR_FULL]);
    await detachLinkRow(detached.linkIds[0] ?? "", payer);
    expect(await pendingOf(detachedFx)).toEqual({ open: [], pending: [{ id: detached.expenseId, state: "no_evidence" }] });
  });

  it("카드 사용 목록 `증빙` 열 — 붙임 한 행 → 참 · 떼면 거짓 · 전표 파일만 → 참(불변)", async () => {
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `증빙본부-${randomUUID()}` });
    const teamName = `증빙팀-${randomUUID()}`;
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: teamName });
    const staff = await makePerson("직원", DEFAULT_ROLE_ID, teamName);
    const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `카드사-${randomUUID().slice(0, 6)}`, numberLast4: String(1000 + Math.floor(Math.random() * 9000)), label: "팀 카드", kind: "team", teamId: team.id });
    if (!card.id) throw new Error("카드 id 없음");
    const input: CardUsageInput = {
      corpCardId: card.id,
      usedOn: seoulToday(),
      merchantVendorId: null,
      total: { currency: "KRW", amount: 33_000, fxRate: 1 },
      evidenceTypeCode: "card_receipt",
      linkKind: "team_cost",
      memo: null,
    };
    const linked = await createCardUsage(staff, input, await precheckCardUsage(staff, input));
    const fileInput: CardUsageInput = { ...input, total: { currency: "KRW", amount: 44_000, fxRate: 1 } };
    const withFile = await createCardUsage(staff, fileInput, await precheckCardUsage(staff, fileInput));
    const slipOf = async (id: string) =>
      (await listCardUsages(staff, { month: seoulToday().slice(0, 7) }, seoulToday())).rows.find((row) => row.id === id)?.hasCardSlip;

    expect(await slipOf(linked.id)).toBe(false);
    const { linkId } = await insertRecordAndLink(staff, { ownerKind: "corp_card_usage", ownerId: linked.id, attachMode: "registrar", supplyKrw: 30_000, evidenceType: "card_receipt" });
    expect(await slipOf(linked.id)).toBe(true);
    await detachLinkRow(linkId, staff);
    expect(await slipOf(linked.id)).toBe(false);

    const storage = createMemoryStorage();
    const declared = { size: 180_000, contentType: "image/png", sha256: randomBytes(32).toString("hex"), name: "카드 전표.png" };
    const intent = await requestEvidenceUpload(staff, { ownerKind: "corp_card_usage", ownerId: withFile.id, ...declared }, { storage });
    storage.put(intent.url, { size: declared.size, contentType: declared.contentType, sha256: declared.sha256 });
    await completeEvidenceUpload(staff, { intentId: intent.intentId }, { storage });
    expect(await slipOf(withFile.id)).toBe(true);
  });

  it("무효 신호 — 무효 파일 + 살아 있는 붙임이면 신호 없음 · 붙임을 떼면 다시 · 붙임 없는 무효 문서는 그대로", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const voider = await makeEvidenceManager("증빙무효", { attach: false, void: true });
    const voidOnlyFile = async (expenseId: string) => {
      const [file] = await db.select({ id: files.id }).from(files).where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, expenseId), isNull(files.voidedAt)));
      if (!file) throw new Error("파일 없음");
      await voidEvidence(voider, { fileId: file.id, reason: "다른 건 영수증" });
    };
    const withLink = await newDraft(fx, fx.lines.withVendor);
    expect((await submitReadyDraft(fx.pm, withLink)).kind).toBe("submitted");
    await approveFresh(fx, withLink);
    const { linkId } = await insertRecordAndLink(payer, { ownerId: withLink, attachMode: "registrar", supplyKrw: DOC_SUPPLY });
    await voidOnlyFile(withLink);
    const noLink = await newDraft(fx, fx.lines.split);
    expect((await submitReadyDraft(fx.pm, noLink)).kind).toBe("submitted");
    await approveFresh(fx, noLink);
    await voidOnlyFile(noLink);

    const signalsOf = () => listEvidenceVoidSignals(fx.pm, { ownerKind: "expense", ownerIds: [withLink, noLink] });
    expect(await signalsOf()).toEqual([noLink]);
    await detachLinkRow(linkId, payer);
    expect((await signalsOf()).sort()).toEqual([withLink, noLink].sort());
  });

  it("홈 「내 차례」 증빙 신호 — 기록만 붙은 결재 통과 문서에 신호 없음 · 떼면 「증빙 없음 · 지급 대기」(회귀 고정)", async () => {
    await setEvidenceRequired(true);
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const { expenseId, linkIds } = await approvedDoc(fx, payer, [{ attachMode: "registrar", supplyKrw: 9_000_000 }]);
    const signalOf = async () => (await listExpenseEvidenceSignals(fx.pm, { ids: [expenseId], today: seoulToday() })).get(expenseId)?.situation;

    expect(await signalOf()).toBeUndefined();
    await detachLinkRow(linkIds[0] ?? "", payer);
    expect(await signalOf()).toBe("증빙 없음 · 지급 대기");
  });
});

describe("제출 짝 단계 — 지급 방식 × 문서 증빙 종류 · 붙은 기록 종류 (06.1-12 Task 4 · E06 · 카드 R4)", () => {
  // 짝 설정은 전역 값이다 — 케이스마다 끝에서 빈 목록(검사 없음, 기본값)으로 되돌린다.
  async function setPairs(pairs: { method: string; evidence: string }[]): Promise<void> {
    await upsertSimpleValue(SYSTEM_VIEWER, PAYMENT_METHOD_EVIDENCE_PAIRS.key, pairs, null);
  }

  async function submitStateOf(expenseId: string) {
    const [row] = await db.select({ number: expenses.number, version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
    const instances = await db.select({ id: approvalInstances.id }).from(approvalInstances).where(eq(approvalInstances.documentId, expenseId));
    return { number: row?.number ?? null, version: row?.version ?? null, instances: instances.length };
  }

  it("짝 설정에서 (계좌이체 · 현금영수증)을 빼면 제출이 지급 때와 같은 글로 막힌다 · 번호 · 결재 · version 그대로 — 짝을 되돌리면 제출된다", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const expenseId = await newDraft(fx);
    await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: await versionOf(expenseId), fields: { evidenceType: "cash_receipt", paymentMethod: "bank_transfer" } });
    await insertRecordAndLink(payer, { ownerId: expenseId, attachMode: "registrar", supplyKrw: DOC_SUPPLY, evidenceType: "cash_receipt" });
    try {
      await setPairs([{ method: "bank_transfer", evidence: "tax_invoice" }]);
      const before = await submitStateOf(expenseId);
      expect(before).toMatchObject({ number: null, instances: 0 });
      const error = await caught(submitWithoutFile(fx.pm, expenseId));
      expect(error).toBeInstanceOf(GateBlockedError);
      expect((error as Error).message).toBe("계좌이체 · 현금영수증 짝 아님 · 짝 설정은 관리자");
      expect(await submitStateOf(expenseId)).toEqual(before);

      await setPairs([
        { method: "bank_transfer", evidence: "tax_invoice" },
        { method: "bank_transfer", evidence: "cash_receipt" },
      ]);
      expect((await submitWithoutFile(fx.pm, expenseId)).kind).toBe("submitted");
    } finally {
      await setPairs([]);
    }
  });

  it("(카드 R4) 카드 전표 기록을 붙인 반려 문서의 지급 방식을 계좌이체로 바꾸면 그 기록 종류 이름으로 막힌다 · 붙임을 떼면 제출된다", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const expenseId = await newDraft(fx);
    await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: await versionOf(expenseId), fields: { paymentMethod: "cash" } });
    const { linkId } = await insertRecordAndLink(payer, { ownerId: expenseId, attachMode: "registrar", supplyKrw: 33_000, evidenceType: "card_receipt" });
    try {
      // 계좌이체만 짝이 있다 — 현금은 짝이 하나도 없어 검사 없음. 05 파일(세금계산서 칸) + 카드 전표 기록으로 올라간다.
      await setPairs([{ method: "bank_transfer", evidence: "tax_invoice" }]);
      expect((await submitReadyDraft(fx.pm, expenseId)).kind).toBe("submitted");
      await rejectFresh(fx, expenseId);
      await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: await versionOf(expenseId), fields: { paymentMethod: "bank_transfer" } });

      const before = await submitStateOf(expenseId);
      const error = await caught(submitWithoutFile(fx.pm, expenseId));
      expect(error).toBeInstanceOf(GateBlockedError);
      expect((error as Error).message).toBe("계좌이체 · 카드 전표 짝 아님 · 짝 설정은 관리자");
      expect(await submitStateOf(expenseId)).toEqual(before);

      await detachLinkRow(linkId, payer);
      expect((await submitWithoutFile(fx.pm, expenseId)).kind).toBe("submitted");
    } finally {
      await setPairs([]);
    }
  });
});

// 07.1-03 PE15(C-81 P3-6) — 자동 확인 돈 경계. ⓐ 붙이기(autoConfirmOnAttach) × 지급 완료 동시 실행 ⓑ 첫 단계 전(submitted) 저장 · 권한은 부르는 쪽 ⓒ 외화 문서.
describe("PE15 자동 확인 돈 경계 (07.1-03)", () => {
  async function livePaymentCount(expenseId: string): Promise<number> {
    const rows = await db
      .select({ id: expensePayments.id })
      .from(expensePayments)
      .where(and(eq(expensePayments.expenseId, expenseId), isNull(expensePayments.cancelledAt)));
    return rows.length;
  }

  // 불변식 — 살아 있는 지급이 있으면 확인 기록 confirmed · 확인 기록 없이 지급 0.
  async function expectPaymentInvariant(expenseId: string): Promise<void> {
    const live = await livePaymentCount(expenseId);
    const review = await reviewOf(expenseId);
    if (live > 0) expect(review?.status).toBe("confirmed");
    if (review === null) expect(live).toBe(0);
  }

  // 픽스처(E-P2-13): 증빙 필수 on · 미완료 프로젝트 · 승인 문서 · 처음 증빙 0 · 붙일 기록은 공급가가 문서와 같은 원화 기록 1건 · 지급 권한자가 붙인다.
  async function approvedWithoutEvidence() {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const { expenseId, linkIds } = await approvedDoc(fx, payer, [REGISTRAR_FULL]);
    const expectedPayableKrw = await payableOf(payer, expenseId);
    await detachLinkRow(linkIds[0] ?? "", payer);
    await setEvidenceRequired(true);
    return { payer, expenseId, expectedPayableKrw, version: await versionOf(expenseId) };
  }

  it("PE15 ⓐ 지급이 먼저 잠그면 — 지급 `증빙 없음 · 기안자 박서연` 거부 · 붙이기 stored(confirmed) · 지급 0", async () => {
    const { payer, expenseId, expectedPayableKrw, version } = await approvedWithoutEvidence();
    const paymentLocked = deferred();
    const releasePayment = deferred();
    const pay = caught(
      completeExpensePayment(payer, { expenseId, expectedPayableKrw, version }, { afterLock: async () => { paymentLocked.resolve(); await releasePayment.promise; } }),
    );
    await paymentLocked.promise;
    const attach = attachAndAutoConfirm(payer, { expenseId, links: [REGISTRAR_FULL], canConfirm: true });
    await waitForLockWaiter(pool);
    releasePayment.resolve();
    const [payError, attached] = await Promise.all([pay, attach]);
    expect(payError).toBeInstanceOf(GateBlockedError);
    expect((payError as Error).message).toBe("증빙 없음 · 기안자 박서연");
    expect(attached.outcome).toBe("stored");
    expect((await reviewOf(expenseId))?.status).toBe("confirmed");
    expect(await livePaymentCount(expenseId)).toBe(0);
    await expectPaymentInvariant(expenseId);
  });

  it("PE15 ⓐ 붙이기가 먼저 잠그면 — 붙이기 stored(문서 version + 1) · 지급 PaymentConflictError · 지급 0", async () => {
    const { payer, expenseId, expectedPayableKrw, version } = await approvedWithoutEvidence();
    const attachedInTx = deferred();
    const releaseAttach = deferred();
    const attach = withTransaction(async (tx) => {
      await insertRecordAndLink(payer, { ownerId: expenseId, attachMode: "registrar", supplyKrw: DOC_SUPPLY }, tx);
      const outcome = await autoConfirmOnAttach(payer, { expenseId, canConfirm: true }, tx);
      attachedInTx.resolve();
      await releaseAttach.promise;
      return outcome;
    });
    await attachedInTx.promise;
    const pay = caught(completeExpensePayment(payer, { expenseId, expectedPayableKrw, version }));
    await waitForLockWaiter(pool);
    releaseAttach.resolve();
    const [outcome, payError] = await Promise.all([attach, pay]);
    expect(outcome).toBe("stored");
    expect(payError).toBeInstanceOf(PaymentConflictError);
    expect(await versionOf(expenseId)).toBe(version + 1);
    expect((await reviewOf(expenseId))?.status).toBe("confirmed");
    expect(await livePaymentCount(expenseId)).toBe(0);
    await expectPaymentInvariant(expenseId);
  });

  it("PE15 ⓐ 장벽 없이 동시에 — 결과는 허용 둘 중 하나 · 불변식(살아 있는 지급 ⇒ confirmed)", async () => {
    const { payer, expenseId, expectedPayableKrw, version } = await approvedWithoutEvidence();
    const [payError, attached] = await Promise.all([
      caught(completeExpensePayment(payer, { expenseId, expectedPayableKrw, version })),
      attachAndAutoConfirm(payer, { expenseId, links: [REGISTRAR_FULL], canConfirm: true }),
    ]);
    expect(attached.outcome).toBe("stored");
    const conflict = payError instanceof PaymentConflictError;
    const refused = payError instanceof GateBlockedError && /^증빙 없음 · /.test(payError.message);
    expect(conflict || refused, String(payError)).toBe(true);
    expect(await livePaymentCount(expenseId)).toBe(0);
    await expectPaymentInvariant(expenseId);
  });

  it("PE15 ⓑ 첫 단계 전(submitted) — 지급 권한자가 붙이면 stored, 지급 권한 없는 사람이 붙이면 skipped(canConfirm은 부르는 쪽 readKeys)", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const manager = await makeEvidenceManager();
    const [payerKeys, managerKeys] = await Promise.all([readKeys(payer), readKeys(manager)]);
    expect(payerKeys.canConfirm).toBe(true);
    expect(managerKeys.canConfirm).toBe(false);

    const byPayer = await inReviewDoc(fx, payer, [REGISTRAR_FULL]);
    const [instance] = await db.select({ status: approvalInstances.status }).from(approvalInstances).where(eq(approvalInstances.documentId, byPayer.expenseId));
    expect(instance?.status).toBe("submitted");
    expect((await attachAndAutoConfirm(payer, { expenseId: byPayer.expenseId, links: [], canConfirm: payerKeys.canConfirm })).outcome).toBe("stored");
    expect((await reviewOf(byPayer.expenseId))?.status).toBe("confirmed");

    const byManager = await inReviewDoc(fx, manager, [REGISTRAR_FULL], fx.lines.split);
    expect((await attachAndAutoConfirm(manager, { expenseId: byManager.expenseId, links: [], canConfirm: managerKeys.canConfirm })).outcome).toBe("skipped");
    expect(await reviewOf(byManager.expenseId)).toBeNull();
  });

  it("PE15 ⓒ 외화 문서 — 붙은 원화 기록 합 ≠ 원화 환산 공급가면 skipped · 증빙 상태 확인 전, 같으면 stored", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const usd = { currency: "USD", amount: 7_000, fxRate: 1_350 } as const;
    const usdKrw = 9_450_000;

    async function foreignApproved(recordSupplyKrw: number, lineId: string): Promise<string> {
      const expenseId = await newDraft(fx, lineId);
      await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: await versionOf(expenseId), fields: { supply: usd } });
      expect((await moneyColumnsOf(expenseId)).supplyAmountKrw).toBe(usdKrw);
      await insertRecordAndLink(payer, { ownerId: expenseId, attachMode: "registrar", supplyKrw: recordSupplyKrw });
      await approveAll(fx, await submitWithoutFile(fx.pm, expenseId));
      return expenseId;
    }

    // 기록 공급가를 문서 통화 숫자(7,000)로 — 원화 환산(9,450,000)과 다르다.
    const mismatched = await foreignApproved(usd.amount, fx.lines.withVendor);
    expect((await attachAndAutoConfirm(payer, { expenseId: mismatched, links: [], canConfirm: true })).outcome).toBe("skipped");
    expect(await reviewOf(mismatched)).toBeNull();
    expect((await getPaymentView(payer, mismatched))?.evidenceStatus).toBe("확인 전");

    const matched = await foreignApproved(usdKrw, fx.lines.split);
    expect((await attachAndAutoConfirm(payer, { expenseId: matched, links: [], canConfirm: true })).outcome).toBe("stored");
    expect((await getPaymentView(payer, matched))?.evidenceStatus).toBe("확인됨");
  });
});
