import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import { actionLog, approvalInstances, evidenceRecordLinks, evidenceRecords, expenseEvidenceReviews, expensePayments, expenses, projects, vendors } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { approveDocument } from "@/domain/approvals";
import { createCorpCard } from "@/domain/corp-cards";
import { CANCEL_REGISTERED_CHECK } from "@/domain/evidence-import/cards";
import { EVIDENCE_UNCONFIRMED } from "@/domain/payments/action-row";
import { lotteFixture } from "@/test/fixtures/evidence-import/build";
import { getEvidenceActions, evidenceRecordRights, readEvidenceOwner } from "@/domain/evidence";
import { attachEvidenceRecord, detachEvidenceRecord, listAttachCandidates } from "@/domain/evidence-records/attach";
import { listLinkedEvidence } from "@/domain/evidence-records/linked";
import { archiveEvidenceRecord, EvidenceArchiveConflictError, getEvidenceRecord } from "@/domain/evidence-records";
import { rankCandidates } from "@/domain/evidence-records/score";
import { confirmEvidence } from "@/domain/evidence-reviews";
import { submitExpense } from "@/domain/expenses";
import { completeExpensePayment, previewPayable } from "@/domain/payments";
import { createTeam } from "@/domain/org";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { PAYMENT_METHOD_EVIDENCE_PAIRS } from "@/domain/settings/keys";
import { seoulToday } from "@/lib/dates";
import { upsertReview } from "@/repositories/expense-evidence-reviews";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { upsertSimpleValue } from "@/repositories/settings";
import { CANDIDATE_LIMIT, listExpenseAttachCandidates } from "@/repositories/expenses";
import { visibleExpenseScope } from "@/domain/expenses/access";
import { insertVendor } from "@/repositories/vendors";
import { makePerson, orgUnitIdByName } from "./approvals-fixtures";
import { addApprovedRevision, setupExpenseProject, testVendorAccount, type ExpenseFixture } from "./fixtures/expenses";
import {
  createDraftExpenseFixture,
  createInReviewExpenseFixture,
  createIntakeManager,
  createReturnedExpenseFixture,
  insertLinkFixture,
  insertRecordFixture,
  registerFixtureFile,
  setRecordArchivedFixture,
} from "./fixtures/evidence";
import { makePaymentManager, setEvidenceRequired } from "./fixtures/payments";
import { deferred, waitForLockWaiter } from "./lock-race";
import { purchaseProject, request as createRequest } from "./fixtures/purchase-requests";

// 06.1-06(RP-4 · RP-5 · E-49 · D-6520): 증빙 기록 붙이기 — 반려 · 회수(경영관리) · 결재 중(두 키) · 승인(카드 R1 지급 전 · 완료 프로젝트) ·
// 구매 요청. 금액 칸은 어느 갈래에서도 그대로, 결재 중 붙이기는 인스턴스 version(사유 evidence)을 올려 옛 화면 승인을 05 문구로 막는다.

const DOC_SUPPLY = 12_400_000;

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

async function liveLinks(recordId: string) {
  return db
    .select()
    .from(evidenceRecordLinks)
    .where(and(eq(evidenceRecordLinks.evidenceRecordId, recordId), isNull(evidenceRecordLinks.detachedAt)));
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

async function attachLogs(recordId: string) {
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

async function approvedExpense(fx: ExpenseFixture, lineId?: string): Promise<string> {
  const doc = await createInReviewExpenseFixture(fx, { lineId });
  await approveFresh(fx, doc.expenseId);
  return doc.expenseId;
}

// 지급 직전 상태 — 증빙 확인(06 확인 게이트) 뒤의 지급 총액 · 문서 version.
async function readyToPay(payer: Viewer, expenseId: string): Promise<{ expectedPayableKrw: number; version: number }> {
  const confirmed = await confirmEvidence(payer, { expenseId, version: (await moneyOf(expenseId)).version });
  const preview = await previewPayable(payer, { expenseId, payDate: seoulToday() });
  if (preview.payableKrw === undefined || preview.payableKrw === null) throw new Error("지급 총액 없음");
  return { expectedPayableKrw: preview.payableKrw, version: confirmed.version };
}

async function payNow(payer: Viewer, expenseId: string) {
  return completeExpensePayment(payer, { expenseId, ...(await readyToPay(payer, expenseId)) });
}

async function makePayer(): Promise<Viewer> {
  const payer = await makePaymentManager("지급담당");
  if (!payer.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: true });
  return payer;
}

// 같은 견적 줄로는 지출결의를 하나만 만든다 — 문서가 여럿 필요한 시험은 2차 차수에 줄을 더한다(실행가 = 문서 공급가 DOC_SUPPLY · 거래처 스테이지원).
async function extraLines(fx: ExpenseFixture, count: number): Promise<string[]> {
  const names = Array.from({ length: count }, (_, index) => `붙이기 후보 ${index + 1}`);
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

async function setProjectCompleted(projectId: string): Promise<void> {
  await db.update(projects).set({ status: "completed" }).where(eq(projects.id, projectId));
}

describe("붙이기 트레이서 (06.1-06 Task 1)", () => {
  it("경영관리가 번호 있는 반려 지출결의에 붙임 → 붙임 1행(registrar) · 상태 붙음 · 행동 로그 · 금액 · version 그대로(D-6520 · 05 X-1)", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const doc = await createReturnedExpenseFixture(fx);
    const recordId = await insertRecordFixture(manager);
    const before = await moneyOf(doc.expenseId);

    const result = await attachEvidenceRecord(manager, { recordId, owner: { kind: "expense", id: doc.expenseId } });

    expect(result).toEqual({ created: true });
    const links = await liveLinks(recordId);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ ownerKind: "expense", ownerId: doc.expenseId, attachMode: "registrar", attachedBy: manager.id });
    expect((await getEvidenceRecord(manager, recordId))?.statusWord).toBe("붙음");
    expect(await attachLogs(recordId)).toHaveLength(1);
    expect(await moneyOf(doc.expenseId)).toEqual(before);
  });

  it("evidence.intake 쓰기 없는 계급 → 거부 · 붙임 0", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const doc = await createReturnedExpenseFixture(fx);
    const recordId = await insertRecordFixture(manager);
    const noIntake = await makePayer();
    expect(await caught(attachEvidenceRecord(noIntake, { recordId, owner: { kind: "expense", id: doc.expenseId } }))).toBeInstanceOf(ForbiddenError);
    expect(await liveLinks(recordId)).toHaveLength(0);
  });

  it("보관된 증빙은 붙지 않는다 · 확인 필요 줄도(잠금 뒤 재검사 — 뒤 파일 취소가 원래 줄을 확인 필요로 바꾼 경우와 같은 칸)", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const doc = await createReturnedExpenseFixture(fx);
    const archived = await insertRecordFixture(manager);
    await setRecordArchivedFixture(archived, manager.id);
    expect(await messageOf(attachEvidenceRecord(manager, { recordId: archived, owner: { kind: "expense", id: doc.expenseId } }))).toBe("보관됨");

    const flagged = await insertRecordFixture(manager);
    const flag = deferred();
    const result = attachEvidenceRecord(manager, { recordId: flagged, owner: { kind: "expense", id: doc.expenseId } }, { afterPreRead: () => flag.promise });
    await db.execute(sql`update evidence_records set needs_check = '취소 줄 있음' where id = ${flagged}`);
    flag.resolve();
    expect(await messageOf(result)).toBe("확인 필요 · 패널에서 확인 필요 풀기");
    expect(await liveLinks(flagged)).toHaveLength(0);
  });

  it("멱등: 같은 기록을 같은 문서에 다시 붙임 → 성공 · 붙임 1행 · 행동 로그 수 그대로", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const doc = await createReturnedExpenseFixture(fx);
    const recordId = await insertRecordFixture(manager);
    await attachEvidenceRecord(manager, { recordId, owner: { kind: "expense", id: doc.expenseId } });
    const again = await attachEvidenceRecord(manager, { recordId, owner: { kind: "expense", id: doc.expenseId } });
    expect(again).toEqual({ created: false });
    expect(await liveLinks(recordId)).toHaveLength(1);
    expect(await attachLogs(recordId)).toHaveLength(1);
  });

  it("listLinkedEvidence: 문서를 읽는 사람은 붙은 행을 받고, 못 읽는 사람은 문서 읽기와 같은 거부(행 0이 아니라 거부)", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const doc = await createReturnedExpenseFixture(fx);
    const recordId = await insertRecordFixture(manager, { nameOnDocument: "스테이지원" });
    await attachEvidenceRecord(manager, { recordId, owner: { kind: "expense", id: doc.expenseId } });

    const linked = await listLinkedEvidence(fx.pm, { kind: "expense", id: doc.expenseId });
    expect(linked.items).toHaveLength(1);
    expect(linked.items[0]).toMatchObject({ recordId, counterparty: "스테이지원", attachMode: "registrar", pickedBy: null });

    const stranger = await makePerson("남팀", "role-pm", null);
    expect(await messageOf(listLinkedEvidence(stranger, { kind: "expense", id: doc.expenseId }))).toBe("없는 지출결의 · 새로 고침");
  });
});

describe("붙일 문서 후보 (E34 · RP-5 · G3)", () => {
  it("보는 범위 밖 · 번호 없는 임시 문서는 후보에 없다 · 점수 1위가 첫 행이고 고를 수 있으면 preselect", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const returned = await createReturnedExpenseFixture(fx);
    const draft = await createDraftExpenseFixture(fx, fx.lines.split);
    const recordId = await insertRecordFixture(manager, { supplyKrw: DOC_SUPPLY, issuedOn: seoulToday() });

    const result = await listAttachCandidates(manager, { recordId });
    const ids = result.items.map((item) => item.id);
    expect(ids).toContain(returned.expenseId);
    expect(ids).not.toContain(draft);
    expect(result.limit).toBe(CANDIDATE_LIMIT);

    // 범위 밖 — 팀 범위 계급(다른 팀 발령)은 기획1팀 문서를 보지 못한다(06.2 scopeCondition 그대로).
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: await orgUnitIdByName("기획본부"), name: `붙이기범위-${randomUUID().slice(0, 6)}` });
    const roleId = `role-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: roleId, name: `팀 등록-${roleId.slice(-6)}`, workScope: "team", viewScope: "team" });
    for (const menu of ["expenses"]) await upsertPermission(SYSTEM_VIEWER, { roleId, menu, action: "view", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "evidence.intake", action: "write", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "evidence", action: "view", allowed: true });
    const teamViewer = await makePerson("다른팀등록", roleId, team.name);
    const scoped = await listAttachCandidates(teamViewer, { recordId });
    expect(scoped.items.map((item) => item.id)).not.toContain(returned.expenseId);
  });

  it("SQL 순위 대조: 같은 거래처 지출결의 25건 → 20행 · truncated · 순서 = 순수 rankCandidates 상위 20(짝 첫 키 포함)", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const vendorName = `순위거래처-${randomUUID().slice(0, 8)}`;
    const digits = String(Math.floor(1_000_000_000 + Math.random() * 8_999_999_999));
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: vendorName, normalizedName: vendorName, businessNo: digits, ...testVendorAccount() });
    const docs: string[] = [];
    const lines = await extraLines(fx, 25);
    for (let index = 0; index < 25; index += 1) {
      const doc = await createInReviewExpenseFixture(fx, { lineId: lines[index] });
      docs.push(doc.expenseId);
      await db
        .update(expenses)
        .set({
          vendorId: vendor.id,
          evidenceType: index % 3 === 0 ? "tax_invoice" : "cash_receipt",
          supplyAmountKrw: index % 4 === 0 ? 1_000_000 : 2_000_000 + index,
          usageDate: `2026-09-${String(1 + index).padStart(2, "0")}`,
          paymentMethod: index % 5 === 0 ? "card" : "transfer",
        })
        .where(eq(expenses.id, doc.expenseId));
    }
    const record = { evidenceType: "tax_invoice", businessNoDigits: digits, supplyKrw: 1_000_000, totalKrw: 1_000_000, issuedOn: "2026-09-12" };
    // 짝: card는 tax_invoice와 짝 없음(card ↔ card_slip만) — 짝 아닌 문서가 뒤로 간다(G3).
    const pairs = [{ method: "card", evidence: "card_slip" }];
    const rows = await listExpenseAttachCandidates(manager, {
      scope: await visibleExpenseScope(manager),
      documentKind: "expense",
      record,
      query: vendorName,
      constrainedMethodCodes: ["card"],
      pairedMethodCodes: pairs.filter((pair) => pair.evidence === record.evidenceType).map((pair) => pair.method),
    });
    expect(rows).toHaveLength(CANDIDATE_LIMIT + 1);

    const facts = await db
      .select({ id: expenses.id, evidenceType: expenses.evidenceType, supply: expenses.supplyAmountKrw, usageDate: expenses.usageDate, paymentMethod: expenses.paymentMethod, businessNo: vendors.businessNo })
      .from(expenses)
      .innerJoin(vendors, eq(vendors.id, expenses.vendorId))
      .where(eq(expenses.vendorId, vendor.id));
    const pure = rankCandidates(
      record,
      facts.map((row) => ({
        kind: "expense" as const,
        id: row.id,
        evidenceType: row.evidenceType,
        businessNo: row.businessNo,
        amountKrw: row.supply,
        date: row.usageDate,
        pairOk: row.paymentMethod !== "card",
      })),
    );
    expect(rows.slice(0, CANDIDATE_LIMIT).map((row) => row.id)).toEqual(pure.slice(0, CANDIDATE_LIMIT).map((row) => row.id));
    expect(rows.slice(0, CANDIDATE_LIMIT).map((row) => row.score)).toEqual(pure.slice(0, CANDIDATE_LIMIT).map((row) => row.score));

    const viaDomain = await listAttachCandidates(manager, { recordId: await insertRecordFixture(manager, { supplyKrw: 1_000_000, businessNoDigits: digits, issuedOn: "2026-09-12" }), query: vendorName });
    expect(viaDomain.items).toHaveLength(CANDIDATE_LIMIT);
    expect(viaDomain.truncated).toBe(true);
    expect(docs).toHaveLength(25);
  });

  it("5건이면 truncated 거짓 · 다 막혔으면 noneSelectableReason", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager("경영관리", { attach: false });
    const vendorName = `적은거래처-${randomUUID().slice(0, 8)}`;
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: vendorName, normalizedName: vendorName, ...testVendorAccount() });
    const lines = await extraLines(fx, 5);
    for (const lineId of lines) {
      const doc = await createInReviewExpenseFixture(fx, { lineId });
      await db.update(expenses).set({ vendorId: vendor.id }).where(eq(expenses.id, doc.expenseId));
    }
    const result = await listAttachCandidates(manager, { recordId: await insertRecordFixture(manager), query: vendorName });
    expect(result.items).toHaveLength(5);
    expect(result.truncated).toBe(false);
    // 결재 중 문서 × 붙이기 키 없는 경영관리 = 05 결재 중 잠김(행마다 이유) · 다 막힘.
    expect(result.items.every((item) => item.selectable === false && item.reason === "결재 중 · 증빙 잠김")).toBe(true);
    expect(result.noneSelectableReason).toBe("붙일 수 있는 문서 없음");
    expect(result.preselect).toEqual([]);
  });
});

describe("결재 중 · 승인 붙이기 (06.1-06 Task 2)", () => {
  it("결재 중 × 두 키 → 성공 · 인스턴스 version + 1 · 금액 그대로 · 옛 version 승인은 「{붙인 사람}이 HH:MM에 증빙을 바꿈 · 새로 고침」(E25)", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager("붙인담당");
    const doc = await createInReviewExpenseFixture(fx);
    const instanceBefore = await instanceOf(doc.expenseId);
    const moneyBefore = await moneyOf(doc.expenseId);
    const recordId = await insertRecordFixture(manager);

    await attachEvidenceRecord(manager, { recordId, owner: { kind: "expense", id: doc.expenseId } });

    expect((await instanceOf(doc.expenseId)).version).toBe(instanceBefore.version + 1);
    expect(await moneyOf(doc.expenseId)).toEqual(moneyBefore);
    const stale = await messageOf(approveDocument(fx.lead, { instanceId: instanceBefore.id, expectedVersion: instanceBefore.version }));
    expect(stale).toMatch(/^붙인담당이 \d{2}:\d{2}에 증빙을 바꿈 · 새로 고침$/);
  });

  it("결재 중 × evidence.intake만 → 거부 「결재 중 · 증빙 잠김」 · 붙임 0", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager("등록만", { attach: false });
    const doc = await createInReviewExpenseFixture(fx);
    const recordId = await insertRecordFixture(manager);
    expect(await messageOf(attachEvidenceRecord(manager, { recordId, owner: { kind: "expense", id: doc.expenseId } }))).toBe("결재 중 · 증빙 잠김");
    expect(await liveLinks(recordId)).toHaveLength(0);
  });

  it("R1 갈래: 승인 · 완료 아님 · 지급 전 → 두 키 경영관리 붙이기 성공 · 문서 version + 1 / 지급 뒤 → 「결재 중 아님 · 증빙은 작성자」 · 붙임 0", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const payer = await makePayer();
    const expenseId = await approvedExpense(fx);
    const before = await moneyOf(expenseId);
    const first = await insertRecordFixture(manager);
    await attachEvidenceRecord(manager, { recordId: first, owner: { kind: "expense", id: expenseId } });
    const after = await moneyOf(expenseId);
    expect(after.version).toBe(before.version + 1);
    expect({ supply: after.supply, vat: after.vat, payable: after.payable }).toEqual({ supply: before.supply, vat: before.vat, payable: before.payable });

    await payNow(payer, expenseId);
    const second = await insertRecordFixture(manager);
    expect(await messageOf(attachEvidenceRecord(manager, { recordId: second, owner: { kind: "expense", id: expenseId } }))).toBe("결재 중 아님 · 증빙은 작성자");
    expect(await liveLinks(second)).toHaveLength(0);
  });

  it("R1 갈래: 사전 판독은 지급 전 · afterPreRead에서 지급이 커밋되면 잠금 뒤 재판정으로 거부 · 붙임 0", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const payer = await makePayer();
    const expenseId = await approvedExpense(fx);
    const recordId = await insertRecordFixture(manager);
    const message = await messageOf(attachEvidenceRecord(manager, { recordId, owner: { kind: "expense", id: expenseId } }, { afterPreRead: async () => void (await payNow(payer, expenseId)) }));
    expect(message).toBe("결재 중 아님 · 증빙은 작성자");
    expect(await liveLinks(recordId)).toHaveLength(0);
  });

  it("완료 프로젝트 승인 문서 → 두 키 경영관리 붙이기 성공(05 addOpen 권한자 갈래) · 문서 version + 1", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const expenseId = await approvedExpense(fx);
    await setProjectCompleted(fx.projectId);
    const before = await moneyOf(expenseId);
    await attachEvidenceRecord(manager, { recordId: await insertRecordFixture(manager), owner: { kind: "expense", id: expenseId } });
    expect((await moneyOf(expenseId)).version).toBe(before.version + 1);
  });

  it("05 규칙표 대조: 결재 중 · 승인(완료 · 완료 아님) 문서에서 05 canAdd가 참인 칸은 attach도 참 · voidableFileIds ↔ detach void · 05와 다른 칸은 R1(승인 · 완료 아님 · 지급 전)뿐", async () => {
    const fx = await setupExpenseProject();
    const people = [await createIntakeManager("두키"), await createIntakeManager("등록만", { attach: false, void: false }), await createIntakeManager("무효만", { attach: false, void: true })];
    const inReview = (await createInReviewExpenseFixture(fx)).expenseId;
    const approved = await approvedExpense(fx, fx.lines.split);
    const cells: Array<{ who: string; doc: string; canAdd: boolean; attach: boolean; voidable: boolean; detach: string }> = [];
    for (const [label, expenseId] of [
      ["결재 중", inReview],
      ["승인", approved],
    ] as const) {
      for (const person of people) {
        const owner = await readEvidenceOwner(person, { ownerKind: "expense", ownerId: expenseId });
        const actions = await getEvidenceActions(person, { ownerKind: "expense", ownerId: expenseId });
        const flags = {
          intake: true,
          attachKey: await can(person, "expenses.evidence_attach", "write"),
          voidKey: await can(person, "expenses.evidence_void", "write"),
          isDrafter: false,
          paid: false,
        };
        const rights = evidenceRecordRights(owner, flags);
        cells.push({ who: label, doc: expenseId, canAdd: actions.canAdd, attach: rights.attach, voidable: actions.voidableFileIds.length > 0, detach: rights.detach });
      }
    }
    for (const cell of cells) {
      if (cell.canAdd) expect(cell.attach).toBe(true);
      expect(cell.voidable).toBe(cell.detach === "void");
    }
    const differs = cells.filter((cell) => cell.attach && !cell.canAdd);
    expect(differs.every((cell) => cell.who === "승인")).toBe(true);
    expect(differs).toHaveLength(1);
  });

  it("카드 R2: 지급 권한 있는 두 키 경영관리가 붙여 기록 공급가 합 = 문서 공급가가 되면 결재 중 문서 확인 기록 confirmed · 지급 권한 없으면 없음 · 반려 문서는 없음", async () => {
    const fx = await setupExpenseProject();
    const payerManager = await createIntakeManager("지급경영", { payments: true });
    const plain = await createIntakeManager("비지급경영");
    // 05 파일 0 문서(자동 확인 조건 — 파일 0): 기록 하나(공급가 10,000,000)를 붙여 올리고, 붙이기로 나머지 2,400,000을 채운다.
    const lines = await extraLines(fx, 3);
    const inReview = async (lineId: string | undefined) => createInReviewExpenseFixture(fx, { lineId, linkRecordId: await insertRecordFixture(payerManager, { supplyKrw: 10_000_000 }) });
    const rest = (by: Viewer) => insertRecordFixture(by, { supplyKrw: DOC_SUPPLY - 10_000_000 });

    const withPay = await inReview(lines[0]);
    await attachEvidenceRecord(payerManager, { recordId: await rest(payerManager), owner: { kind: "expense", id: withPay.expenseId } });
    const [confirmed] = await db.select().from(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, withPay.expenseId));
    expect(confirmed).toMatchObject({ status: "confirmed", reviewedBy: payerManager.id });

    const withoutPay = await inReview(lines[1]);
    await attachEvidenceRecord(plain, { recordId: await rest(plain), owner: { kind: "expense", id: withoutPay.expenseId } });
    expect(await db.select().from(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, withoutPay.expenseId))).toHaveLength(0);

    const returned = await createReturnedExpenseFixture(fx, { lineId: lines[2], linkRecordId: await insertRecordFixture(payerManager, { supplyKrw: 10_000_000 }) });
    await attachEvidenceRecord(payerManager, { recordId: await rest(payerManager), owner: { kind: "expense", id: returned.expenseId } });
    expect(await db.select().from(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, returned.expenseId))).toHaveLength(0);
  });

  it("(/review P3-2) 승인 문서 붙이기 뒤 옛 문서 version의 증빙 확인은 거부된다(문서 version이 붙임 집합 변화를 실어 나른다)", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const payer = await makePayer();
    const expenseId = await approvedExpense(fx);
    const stale = (await moneyOf(expenseId)).version;
    await attachEvidenceRecord(manager, { recordId: await insertRecordFixture(manager), owner: { kind: "expense", id: expenseId } });
    expect(await caught(confirmEvidence(payer, { expenseId, version: stale }))).toBeInstanceOf(Error);
  });

  it("짝 아님(E06): 지급 방식 X에 짝이 아닌 종류 → 「{X 이름} · {종류 이름} 짝 아님 · 짝 설정은 관리자」 · 붙임 0 · 후보에서도 막힌 행", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const doc = await createReturnedExpenseFixture(fx);
    const [row] = await db.select({ method: expenses.paymentMethod }).from(expenses).where(eq(expenses.id, doc.expenseId));
    const method = row?.method;
    if (!method) throw new Error("지급 방식 없음");
    await upsertSimpleValue(SYSTEM_VIEWER, PAYMENT_METHOD_EVIDENCE_PAIRS.key, [{ method, evidence: "card_slip" }], null);
    const recordId = await insertRecordFixture(manager, { evidenceType: "tax_invoice" });
    const message = await messageOf(attachEvidenceRecord(manager, { recordId, owner: { kind: "expense", id: doc.expenseId } }));
    expect(message).toMatch(/ 짝 아님 · 짝 설정은 관리자$/);
    expect(await liveLinks(recordId)).toHaveLength(0);
    const candidates = await listAttachCandidates(manager, { recordId, query: doc.number });
    expect(candidates.items.find((item) => item.id === doc.expenseId)).toMatchObject({ selectable: false, reason: message });
  });

  it("잠금 뒤 재판정: afterPreRead에서 반려 문서를 다시 올리면 붙이기 키 없는 경영관리는 잠금 뒤 거부 · 붙임 0", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager("등록만", { attach: false });
    const doc = await createReturnedExpenseFixture(fx);
    const recordId = await insertRecordFixture(manager);
    const resubmit = async () => {
      const result = await submitExpense(fx.pm, { expenseId: doc.expenseId, expectedVersion: (await moneyOf(doc.expenseId)).version });
      if (result.kind !== "submitted") throw new Error("다시 올리기 안 됨");
    };
    expect(await messageOf(attachEvidenceRecord(manager, { recordId, owner: { kind: "expense", id: doc.expenseId } }, { afterPreRead: resubmit }))).toBe("결재 중 · 증빙 잠김");
    expect(await liveLinks(recordId)).toHaveLength(0);
  });

  it("같은 증빙을 두 문서에 동시에(A를 증빙 잠금 뒤에 멈추고 B 출발 — waitForLockWaiter) → 붙임 1행 · B는 「다른 사람이 먼저 붙임 · {A 번호} · 새로 고침」", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const a = await createReturnedExpenseFixture(fx);
    const b = await createReturnedExpenseFixture(fx, { lineId: fx.lines.split });
    const recordId = await insertRecordFixture(manager);
    const gate = deferred();
    const reached = deferred();
    const first = attachEvidenceRecord(manager, { recordId, owner: { kind: "expense", id: a.expenseId } }, { afterLock: () => (reached.resolve(), gate.promise) });
    await reached.promise;
    const second = caught(attachEvidenceRecord(manager, { recordId, owner: { kind: "expense", id: b.expenseId } }));
    await waitForLockWaiter(pool);
    gate.resolve();
    expect(await first).toEqual({ created: true });
    const refused = await second;
    expect((refused as Error).message).toBe(`다른 사람이 먼저 붙임 · ${a.number} · 새로 고침`);
    expect(await liveLinks(recordId)).toHaveLength(1);
  });

  it("(PR-C /review P3-1) 붙이기가 증빙 행 version을 올린다 — 붙이기 커밋을 기다린 보관은 옛 version이라 거부 · 붙임 1행 · 보관 안 됨", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const doc = await createReturnedExpenseFixture(fx);
    const recordId = await insertRecordFixture(manager);
    const before = (await getEvidenceRecord(manager, recordId))?.version;
    if (before === undefined) throw new Error("증빙 version 없음");
    const gate = deferred();
    const reached = deferred();
    const attach = attachEvidenceRecord(manager, { recordId, owner: { kind: "expense", id: doc.expenseId } }, { afterLock: () => (reached.resolve(), gate.promise) });
    await reached.promise;
    const archive = caught(archiveEvidenceRecord(manager, { id: recordId, version: before }));
    await waitForLockWaiter(pool);
    gate.resolve();
    expect(await attach).toEqual({ created: true });
    expect(await archive).toBeInstanceOf(EvidenceArchiveConflictError);
    expect(await liveLinks(recordId)).toHaveLength(1);
    const after = await getEvidenceRecord(manager, recordId);
    expect(after?.statusWord).toBe("붙음");
    expect(after?.version).toBe(before + 1);
  });

  it("(12 P3-6) 붙이기 ↔ 지급 완료 경합: 붙이기가 문서 행을 쥔 동안 지급이 기다리고, 붙이기 커밋 뒤 지급은 그 문서 version으로 다시 판정된다", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const payer = await makePayer();
    const expenseId = await approvedExpense(fx);
    const recordId = await insertRecordFixture(manager);
    const ready = await readyToPay(payer, expenseId);
    const gate = deferred();
    const reached = deferred();
    const attach = attachEvidenceRecord(manager, { recordId, owner: { kind: "expense", id: expenseId } }, { afterLock: () => (reached.resolve(), gate.promise) });
    await reached.promise;
    const pay = caught(completeExpensePayment(payer, { expenseId, ...ready }));
    await waitForLockWaiter(pool);
    gate.resolve();
    expect(await attach).toEqual({ created: true });
    // 지급은 붙이기 전 version을 들고 왔다 — 붙이기가 문서 version을 올리고 확인 기록을 풀었으니 지급은 거부된다(옛 화면으로 지급하지 않는다).
    expect(await pay).toBeInstanceOf(Error);
    expect(await db.select().from(expensePayments).where(eq(expensePayments.expenseId, expenseId))).toHaveLength(0);
    // 다시 확인하고 지급하면 통과 — 그 뒤 붙이기는 R1 지급 뒤 거부.
    await payNow(payer, expenseId);
    expect(await messageOf(attachEvidenceRecord(manager, { recordId: await insertRecordFixture(manager), owner: { kind: "expense", id: expenseId } }))).toBe("결재 중 아님 · 증빙은 작성자");
  });
});

describe("구매 요청 붙이기", () => {
  it("요청(requested)에 붙임 → 붙임 1행 · 견적 칸 그대로 · listLinkedEvidence가 읽는다 · 읽기 범위 밖 사람은 거부", async () => {
    const pfx = await purchaseProject();
    const manager = await createIntakeManager();
    if (!manager.roleId) throw new Error("계급 없음");
    // 06 구매 요청 읽기 범위(listAccess) — 프로젝트 보는 범위 전사인 계급은 전부를 본다.
    await upsertPermission(SYSTEM_VIEWER, { roleId: manager.roleId, menu: "projects", action: "view", allowed: true });
    const created = await createRequest(pfx, pfx.onlineLine, 110_000);
    const recordId = await insertRecordFixture(manager, { supplyKrw: 100_000, vatKrw: 10_000 });
    await attachEvidenceRecord(manager, { recordId, owner: { kind: "purchase_request", id: created.id } });
    expect(await liveLinks(recordId)).toHaveLength(1);
    const linked = await listLinkedEvidence(manager, { kind: "purchase_request", id: created.id });
    expect(linked.items).toHaveLength(1);
    const outsider = await createIntakeManager("범위밖");
    expect(await messageOf(listLinkedEvidence(outsider, { kind: "purchase_request", id: created.id }))).toBe("없는 구매 요청 · 새로 고침");
    const candidates = await listAttachCandidates(manager, { recordId: await insertRecordFixture(manager, { supplyKrw: 100_000, vatKrw: 10_000 }), query: created.number });
    expect(candidates.items.find((item) => item.id === created.id)).toMatchObject({ kind: "purchase_request", selectable: true });
  });

  it("작성자 붙임 픽스처(attach_mode = author) 행만 고른 사람 · 날짜가 선다(DB-7)", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const doc = await createReturnedExpenseFixture(fx);
    await insertLinkFixture({ recordId: await insertRecordFixture(manager), ownerId: doc.expenseId, attachMode: "author", attachedBy: fx.pm.id });
    await attachEvidenceRecord(manager, { recordId: await insertRecordFixture(manager), owner: { kind: "expense", id: doc.expenseId } });
    const linked = await listLinkedEvidence(manager, { kind: "expense", id: doc.expenseId });
    const author = linked.items.filter((item) => item.attachMode === "author");
    expect(author).toHaveLength(1);
    expect(author[0]?.pickedBy).toBe("박서연");
    expect(author[0]?.pickedOn).toMatch(/^\d{2}-\d{2}$/);
    expect(linked.items.filter((item) => item.attachMode === "registrar").every((item) => item.pickedBy === null)).toBe(true);
  });
});

// PR-C 카드 결정(2026-10-19 「붙은 것도 표시」): 뒤 파일 취소 줄의 원거래가 이미 문서에 붙어 있어도 원거래에 같은 확인 필요 사유를 세우고
// 문서 「증빙」 행에 그 사유를 싣는다. 지급 게이트는 바꾸지 않는다 — 지급 전 문서는 06 확인 게이트(확인 전 → 지급 막힘)가 그대로 막는다.
describe("뒤 파일 취소 × 붙은 원거래 (PR-C 카드 결정)", () => {
  const ORIGINAL = { 승인번호: "30000001", 매입일자: "2026.09.05", 매입금액: "50,000", 부가세: "4,545" };
  const CANCEL = { 승인번호: "30000001", 매입일자: "2026.09.20", 매입금액: "-50,000", 부가세: "-4,545" };
  const ORIGINAL_KEY = "card-lotte|2222|30000001|2026-09-05|50000";

  async function attachedOriginal(manager: Viewer, expenseId: string): Promise<string> {
    await createCorpCard(SYSTEM_VIEWER, { issuer: "롯데카드", numberLast4: "2222", label: "롯데카드 2222", kind: "shared" });
    await registerFixtureFile(manager, lotteFixture([ORIGINAL]), "롯데_0901-0915.xls");
    const [record] = await db.select({ id: evidenceRecords.id }).from(evidenceRecords).where(eq(evidenceRecords.dedupeKey, ORIGINAL_KEY));
    if (!record) throw new Error("원거래가 서지 않았다");
    await attachEvidenceRecord(manager, { recordId: record.id, owner: { kind: "expense", id: expenseId } });
    return record.id;
  }

  async function needsCheckOf(recordId: string): Promise<string | null> {
    const [row] = await db.select({ needsCheck: evidenceRecords.needsCheck }).from(evidenceRecords).where(eq(evidenceRecords.id, recordId));
    return row?.needsCheck ?? null;
  }

  async function laterCancelFile(manager: Viewer): Promise<void> {
    await registerFixtureFile(manager, lotteFixture([ORIGINAL, CANCEL]), "롯데_0901-0930.xls");
  }

  it("지급 전 승인 문서에 붙은 원거래 → 뒤 파일 취소로 확인 필요 사유 · 문서 증빙 행에 사유 · 확인 전이라 지급은 막히고 확인 뒤 지급", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const payer = await makePayer();
    const expenseId = await approvedExpense(fx);
    const recordId = await attachedOriginal(manager, expenseId);

    await laterCancelFile(manager);

    expect(await needsCheckOf(recordId)).toBe(CANCEL_REGISTERED_CHECK);
    expect(await liveLinks(recordId)).toHaveLength(1);
    const linked = await listLinkedEvidence(manager, { kind: "expense", id: expenseId });
    expect(linked.items.map((item) => item.needsCheck)).toEqual([CANCEL_REGISTERED_CHECK]);
    const preview = await previewPayable(payer, { expenseId, payDate: seoulToday() });
    if (preview.payableKrw === undefined || preview.payableKrw === null) throw new Error("지급 총액 없음");
    const unconfirmed = completeExpensePayment(payer, { expenseId, expectedPayableKrw: preview.payableKrw, version: (await moneyOf(expenseId)).version });
    expect(await messageOf(unconfirmed)).toBe(EVIDENCE_UNCONFIRMED);
    expect(await db.select().from(expensePayments).where(eq(expensePayments.expenseId, expenseId))).toHaveLength(0);

    await payNow(payer, expenseId);
    expect(await db.select().from(expensePayments).where(eq(expensePayments.expenseId, expenseId))).toHaveLength(1);
  });

  it("지급 뒤 문서에 붙은 원거래 → 확인 필요 사유는 서고 지급 · 확인 기록 · 문서 version은 그대로", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const payer = await makePayer();
    const expenseId = await approvedExpense(fx);
    const recordId = await attachedOriginal(manager, expenseId);
    await payNow(payer, expenseId);
    const before = { doc: await moneyOf(expenseId), reviews: await db.select().from(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, expenseId)) };

    await laterCancelFile(manager);

    expect(await needsCheckOf(recordId)).toBe(CANCEL_REGISTERED_CHECK);
    expect(await db.select().from(expensePayments).where(eq(expensePayments.expenseId, expenseId))).toHaveLength(1);
    expect(await db.select().from(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, expenseId))).toEqual(before.reviews);
    expect((await moneyOf(expenseId)).version).toBe(before.doc.version);
    const linked = await listLinkedEvidence(manager, { kind: "expense", id: expenseId });
    expect(linked.items.map((item) => item.needsCheck)).toEqual([CANCEL_REGISTERED_CHECK]);
  });

  async function reviewsOf(expenseId: string) {
    return db.select().from(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, expenseId));
  }

  it("확인까지 마친 지급 전 승인 문서 → 뒤 파일 취소로 확인 기록이 풀리고 문서 version + 1 · 옛 version 지급 거부 · 다시 확인하면 지급", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const payer = await makePayer();
    const expenseId = await approvedExpense(fx);
    await attachedOriginal(manager, expenseId);
    const ready = await readyToPay(payer, expenseId);
    expect((await reviewsOf(expenseId)).map((row) => row.status)).toEqual(["confirmed"]);

    await laterCancelFile(manager);

    expect(await reviewsOf(expenseId)).toEqual([]);
    expect((await moneyOf(expenseId)).version).toBe(ready.version + 1);
    expect(await caught(completeExpensePayment(payer, { expenseId, ...ready }))).toBeInstanceOf(Error);
    const preview = await previewPayable(payer, { expenseId, payDate: seoulToday() });
    if (preview.payableKrw === undefined || preview.payableKrw === null) throw new Error("지급 총액 없음");
    const fresh = completeExpensePayment(payer, { expenseId, expectedPayableKrw: preview.payableKrw, version: (await moneyOf(expenseId)).version });
    expect(await messageOf(fresh)).toBe(EVIDENCE_UNCONFIRMED);
    expect(await db.select().from(expensePayments).where(eq(expensePayments.expenseId, expenseId))).toHaveLength(0);

    await payNow(payer, expenseId);
    expect(await db.select().from(expensePayments).where(eq(expensePayments.expenseId, expenseId))).toHaveLength(1);
  });

  it("결재 중 문서의 자동 확인(confirmed) → 뒤 파일 취소로 풀린다 · 문서 version은 그대로(결재 중 05 X-1)", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const doc = await createInReviewExpenseFixture(fx);
    await attachedOriginal(manager, doc.expenseId);
    const supply = (await moneyOf(doc.expenseId)).supply;
    await upsertReview(SYSTEM_VIEWER, { expenseId: doc.expenseId, status: "confirmed", amountBeforeKrw: supply, amountAfterKrw: supply, waiveReason: null, reviewedBy: manager.id }, db);
    const before = (await moneyOf(doc.expenseId)).version;

    await laterCancelFile(manager);

    expect(await reviewsOf(doc.expenseId)).toEqual([]);
    expect((await moneyOf(doc.expenseId)).version).toBe(before);
  });

  it("지급 완료가 문서 행을 쥔 동안 뒤 파일 등록은 기다리고, 지급 커밋 뒤에는 지급 뒤 문서로 판정해 확인 기록을 그대로 둔다", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const payer = await makePayer();
    const expenseId = await approvedExpense(fx);
    const recordId = await attachedOriginal(manager, expenseId);
    const ready = await readyToPay(payer, expenseId);
    const gate = deferred();
    const reached = deferred();
    const pay = completeExpensePayment(payer, { expenseId, ...ready }, { afterLock: () => (reached.resolve(), gate.promise) });
    await reached.promise;
    const register = laterCancelFile(manager);
    await waitForLockWaiter(pool);
    gate.resolve();
    await pay;
    await register;

    expect(await needsCheckOf(recordId)).toBe(CANCEL_REGISTERED_CHECK);
    expect(await db.select().from(expensePayments).where(eq(expensePayments.expenseId, expenseId))).toHaveLength(1);
    expect((await reviewsOf(expenseId)).map((row) => row.status)).toEqual(["confirmed"]);
  });

  it("(PR-C 검토 P2-1) 확인이 풀린 문서에서 다른 기록을 무효 처리하고 같은 공급가 기록을 다시 붙여도 확인 필요 기록이 남아 있으면 자동 확인하지 않는다", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager("지급경영", { payments: true, void: true });
    const payer = await makePayer();
    // 05 파일 0인 승인 문서(자동 확인 조건 — 파일 0): 다른 기록 r2를 붙여 올려 승인하고, 경영관리가 원거래 r1을 붙이면 공급가 합 = 문서 공급가라 자동 확인.
    const [originalId] = await registerOriginals(manager);
    if (!originalId) throw new Error("원거래 없음");
    const [original] = await db.select({ supply: evidenceRecords.supplyKrw }).from(evidenceRecords).where(eq(evidenceRecords.id, originalId));
    if (!original) throw new Error("원거래 없음");
    const restSupply = DOC_SUPPLY - original.supply;
    const otherId = await insertRecordFixture(manager, { supplyKrw: restSupply });
    const doc = await createInReviewExpenseFixture(fx, { linkRecordId: otherId, linkedBy: manager.id });
    await approveFresh(fx, doc.expenseId);
    const expenseId = doc.expenseId;
    await attachEvidenceRecord(manager, { recordId: originalId, owner: { kind: "expense", id: expenseId } });
    expect((await reviewsOf(expenseId)).map((row) => row.status)).toEqual(["confirmed"]);

    await laterCancelFile(manager);
    expect(await reviewsOf(expenseId)).toEqual([]);

    const [otherLink] = await liveLinks(otherId);
    if (!otherLink) throw new Error("붙임 없음");
    await detachEvidenceRecord(manager, { linkId: otherLink.id, reason: "다른 기록으로 바꿈" });
    await attachEvidenceRecord(manager, { recordId: await insertRecordFixture(manager, { supplyKrw: restSupply }), owner: { kind: "expense", id: expenseId } });

    expect(await needsCheckOf(originalId)).toBe(CANCEL_REGISTERED_CHECK);
    expect(await reviewsOf(expenseId)).toEqual([]);
    const preview = await previewPayable(payer, { expenseId, payDate: seoulToday() });
    if (preview.payableKrw === undefined || preview.payableKrw === null) throw new Error("지급 총액 없음");
    const unconfirmed = completeExpensePayment(payer, { expenseId, expectedPayableKrw: preview.payableKrw, version: (await moneyOf(expenseId)).version });
    expect(await messageOf(unconfirmed)).toBe(EVIDENCE_UNCONFIRMED);
  });

  const ORIGINAL2 = { 승인번호: "30000002", 매입일자: "2026.09.06", 매입금액: "33,000", 부가세: "3,000" };
  const CANCEL2 = { 승인번호: "30000002", 매입일자: "2026.09.21", 매입금액: "-33,000", 부가세: "-3,000" };
  const keyOf = (row: typeof ORIGINAL) => `card-lotte|2222|${row.승인번호}|${row.매입일자.replaceAll(".", "-")}|${row.매입금액.replaceAll(",", "")}`;

  // 원거래만 든 앞 파일을 등록하고(붙이지 않는다) 원거래 기록 id를 넘긴 차례대로 돌려준다.
  async function registerOriginals(manager: Viewer, rows: readonly (typeof ORIGINAL)[] = [ORIGINAL]): Promise<string[]> {
    await createCorpCard(SYSTEM_VIEWER, { issuer: "롯데카드", numberLast4: "2222", label: "롯데카드 2222", kind: "shared" });
    await registerFixtureFile(manager, lotteFixture(rows), "롯데_0901-0915.xls");
    const ids: string[] = [];
    for (const row of rows) {
      const [record] = await db.select({ id: evidenceRecords.id }).from(evidenceRecords).where(eq(evidenceRecords.dedupeKey, keyOf(row)));
      if (!record) throw new Error("원거래가 서지 않았다");
      ids.push(record.id);
    }
    return ids;
  }

  it("(P3-1) 잠금 차례 프로젝트 전부 → 문서 전부 — 둘째 문서의 프로젝트를 남이 쥐고 있으면 등록은 문서 행을 하나도 쥐지 않은 채 기다린다", async () => {
    const fx = await setupExpenseProject();
    const other = await setupExpenseProject();
    const manager = await createIntakeManager();
    const docA = await approvedExpense(fx);
    const docB = await approvedExpense(other);
    const [recordA, recordB] = await registerOriginals(manager, [ORIGINAL, ORIGINAL2]);
    if (!recordA || !recordB) throw new Error("원거래 없음");
    await attachEvidenceRecord(manager, { recordId: recordA, owner: { kind: "expense", id: docA } });
    await attachEvidenceRecord(manager, { recordId: recordB, owner: { kind: "expense", id: docB } });
    const [low, high] = [
      { id: docA, projectId: fx.projectId },
      { id: docB, projectId: other.projectId },
    ].sort((a, b) => (a.id < b.id ? -1 : 1));
    if (!low || !high) throw new Error("문서 없음");

    const holder = await pool.connect();
    await holder.query("BEGIN");
    await holder.query("SELECT id FROM projects WHERE id = $1 FOR UPDATE", [high.projectId]);
    const register = caught(registerFixtureFile(manager, lotteFixture([ORIGINAL, CANCEL, ORIGINAL2, CANCEL2]), "롯데_0901-0930.xls"));
    let lowDocFree = false;
    try {
      await waitForLockWaiter(pool);
      const probe = await pool.connect();
      try {
        await probe.query("BEGIN");
        lowDocFree = await probe.query("SELECT id FROM expenses WHERE id = $1 FOR UPDATE NOWAIT", [low.id]).then(
          () => true,
          () => false,
        );
      } finally {
        await probe.query("ROLLBACK");
        probe.release();
      }
    } finally {
      await holder.query("ROLLBACK");
      holder.release();
    }

    expect(await register).toBeUndefined();
    expect(lowDocFree).toBe(true);
    expect(await needsCheckOf(recordA)).toBe(CANCEL_REGISTERED_CHECK);
    expect(await needsCheckOf(recordB)).toBe(CANCEL_REGISTERED_CHECK);
  });
});
