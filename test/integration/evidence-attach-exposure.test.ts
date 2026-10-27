import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { actionLog, corpCardUsages, evidenceRecordLinks, expenses, purchaseRequests } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createCorpCard } from "@/domain/corp-cards";
import { createCardUsage, deleteCardUsage, precheckCardUsage, precheckCardUsageRemoval, type CardUsageInput } from "@/domain/corp-card-usages";
import { attachEvidenceRecord, canSeeLinkOwner, detachEvidenceRecord, listAttachCandidates, previewDetach, takenMessage } from "@/domain/evidence-records/attach";
import { listLiveLinkOwnersByRecords } from "@/repositories/evidence-record-links";
import { closeExpense, deleteExpenseDraft } from "@/domain/expenses";
import { createOrgUnit, createTeam } from "@/domain/org";
import { cancelPurchaseRequest, precheckPurchaseCancel } from "@/domain/purchase-requests";
import { PAYMENT_METHOD_EVIDENCE_PAIRS } from "@/domain/settings/keys";
import { seoulToday } from "@/lib/dates";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { upsertSimpleValue } from "@/repositories/settings";
import { makePerson } from "./approvals-fixtures";
import { setupExpenseProject } from "./fixtures/expenses";
import { createCardUsageFixture, createDraftExpenseFixture, createInReviewExpenseFixture, createIntakeManager, createReturnedExpenseFixture, insertLinkFixture, insertRecordFixture } from "./fixtures/evidence";
import { setEvidenceRequired } from "./fixtures/payments";
import { purchaseProject, request as createRequest } from "./fixtures/purchase-requests";

// 06.1-06 독립 검토 P3-1 · P3-2 · P3-5 · P3-6: 떼기 미리 보기 권리 · 문서 금액은 문서 금액 항목으로 · 경합 거부의 문서 번호는 볼 수 있을 때만 ·
// 자동 떼기 수를 주인 로그에 · 못 보는 붙임의 떼기 거부는 한 글자.

beforeEach(async () => {
  await setEvidenceRequired(false);
  await upsertSimpleValue(SYSTEM_VIEWER, PAYMENT_METHOD_EVIDENCE_PAIRS.key, [], null);
});

async function messageOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  if (!(error instanceof Error)) throw new Error("거부되지 않았다");
  return error.message;
}

async function linkIdOf(recordId: string): Promise<string> {
  const [row] = await db.select({ id: evidenceRecordLinks.id }).from(evidenceRecordLinks).where(eq(evidenceRecordLinks.evidenceRecordId, recordId));
  if (!row) throw new Error("붙임 없음");
  return row.id;
}

async function hideAmount(viewer: Viewer, infoItem: string): Promise<void> {
  if (!viewer.roleId) throw new Error("계급 없음");
  await upsertVisibility(SYSTEM_VIEWER, { roleId: viewer.roleId, infoItem, visible: false });
}

async function ownerLogDetail(entity: string, entityId: string, actionType: string): Promise<Record<string, unknown>> {
  const [row] = await db
    .select({ detail: actionLog.detail })
    .from(actionLog)
    .where(and(eq(actionLog.entity, entity), eq(actionLog.entityId, entityId), eq(actionLog.actionType, actionType)));
  if (!row) throw new Error(`로그 없음: ${entity} ${actionType}`);
  return (row.detail ?? {}) as Record<string, unknown>;
}

describe("P3-1 떼기 미리 보기 · 후보 금액", () => {
  it("결재 중 문서(떼기 권리 없음) → previewDetach도 떼기와 같은 거부", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const recordId = await insertRecordFixture(manager);
    await createInReviewExpenseFixture(fx, { linkRecordId: recordId, linkedBy: manager.id });
    expect(await messageOf(previewDetach(manager, { linkId: await linkIdOf(recordId) }))).toBe("결재 중 · 증빙 잠김");
  });

  it("expense.amount를 끈 계급 → 미리 보기 결과는 그대로 · 문서 공급가액은 싣지 않는다(evidence.amount와 무관)", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const recordId = await insertRecordFixture(manager);
    await createReturnedExpenseFixture(fx, { linkRecordId: recordId, linkedBy: manager.id });
    await hideAmount(manager, "expense.amount");
    const preview = await previewDetach(manager, { linkId: await linkIdOf(recordId) });
    expect(preview.result).toBe("expected");
    expect(preview.amountKrw ?? null).toBeNull();
  });

  it("후보 금액: expense.amount를 끄면 지출결의 공급가액 · purchase_request.amount를 끄면 구매 요청 견적을 싣지 않는다", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const doc = await createReturnedExpenseFixture(fx);
    const recordId = await insertRecordFixture(manager);
    await hideAmount(manager, "expense.amount");
    const candidates = await listAttachCandidates(manager, { recordId, query: doc.number });
    const item = candidates.items.find((candidate) => candidate.id === doc.expenseId);
    expect(item).toBeDefined();
    expect(item?.amountKrw ?? null).toBeNull();

    const pfx = await purchaseProject();
    const buyer = await createIntakeManager("구매후보");
    if (!buyer.roleId) throw new Error("계급 없음");
    await upsertPermission(SYSTEM_VIEWER, { roleId: buyer.roleId, menu: "projects", action: "view", allowed: true });
    const created = await createRequest(pfx, pfx.onlineLine, 110_000);
    await hideAmount(buyer, "purchase_request.amount");
    const listed = await listAttachCandidates(buyer, { recordId: await insertRecordFixture(buyer, { supplyKrw: 100_000, vatKrw: 10_000 }), query: created.number });
    const request = listed.items.find((candidate) => candidate.id === created.id);
    expect(request).toBeDefined();
    expect(request?.amountKrw ?? null).toBeNull();
  });
});

describe("P3-2 경합 거부의 문서 번호", () => {
  it("먼저 붙은 지출결의를 못 보는 등록 권한자 → `다른 사람이 먼저 붙임 · 새로 고침`(번호 없음)", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const recordId = await insertRecordFixture(manager, { supplyKrw: 100_000, vatKrw: 10_000 });
    const doc = await createReturnedExpenseFixture(fx, { linkRecordId: recordId, linkedBy: manager.id });

    // 지출결의는 본인 것만 보는 계급 — 구매 요청은 구매 권한으로 전부 본다.
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `좁은등록-${randomUUID().slice(0, 8)}`, viewScope: "own" });
    for (const [menu, action] of [
      ["evidence.intake", "write"],
      ["evidence", "view"],
      ["expenses", "view"],
      ["expenses.evidence_attach", "write"],
      ["cards.purchases", "write"],
    ] as const) {
      await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu, action, allowed: true });
    }
    for (const infoItem of ["evidence.value", "evidence.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
    const narrow = await makePerson("좁은등록", role.id, null);
    const pfx = await purchaseProject();
    const created = await createRequest(pfx, pfx.onlineLine, 110_000);

    const message = await messageOf(attachEvidenceRecord(narrow, { recordId, owner: { kind: "purchase_request", id: created.id } }));
    expect(message).toBe("다른 사람이 먼저 붙임 · 새로 고침");
    expect(message).not.toContain(doc.number);
    // 그 문서를 보는 사람에게는 번호가 선다(기존 경합 글자 그대로). 구매 요청을 고르려면 구매 요청 읽기 범위가 있어야 한다.
    if (!manager.roleId) throw new Error("계급 없음");
    await upsertPermission(SYSTEM_VIEWER, { roleId: manager.roleId, menu: "projects", action: "view", allowed: true });
    expect(await messageOf(attachEvidenceRecord(manager, { recordId, owner: { kind: "purchase_request", id: created.id } }))).toBe(`다른 사람이 먼저 붙임 · ${doc.number} · 새로 고침`);
  });
});

// 07.1-04 PE9: 카드 사용에 붙은 기록의 점유 문구 — 그 카드 사용을 볼 수 있는 사람에게만 K 번호.
describe("PE9 카드 사용 붙은 곳 보기", () => {
  it("카드 사용 목록 범위 안 → canSeeLinkOwner 참 · 문구에 K 번호 / 범위 밖 → 거짓 · 번호 없는 문구", async () => {
    const pm = await makePerson("붙은곳PM", DEFAULT_ROLE_ID, "기획1팀");
    const wide = await createIntakeManager("경영관리", { payments: true });
    const narrow = await createIntakeManager("범위 좁음");
    const last4 = String(4000 + Math.floor(Math.random() * 4000));
    const card = await createCorpCard(SYSTEM_VIEWER, { issuer: "롯데카드", numberLast4: last4, label: `붙은곳 ${last4}`, kind: "personal", holderUserId: pm.id });
    if (!card.id) throw new Error("카드 id 없음");
    const usage = await createCardUsageFixture(pm, { corpCardId: card.id, usedOn: "2026-04-30", totalKrw: 200_000 });
    const recordId = await insertRecordFixture(wide, { evidenceType: "card_receipt", supplyKrw: 181_818, vatKrw: 18_182, issuedOn: "2026-04-30" });
    await insertLinkFixture({ recordId, ownerKind: "corp_card_usage", ownerId: usage.id, attachedBy: wide.id });
    const [owner] = await listLiveLinkOwnersByRecords(SYSTEM_VIEWER, [recordId]);
    if (!owner) throw new Error("붙은 곳 없음");
    expect(owner.ownerNumber).toBe(usage.number);

    expect(await canSeeLinkOwner(wide, owner)).toBe(true);
    expect(await takenMessage(wide, owner)).toBe(`다른 사람이 먼저 붙임 · ${usage.number} · 새로 고침`);
    expect(await canSeeLinkOwner(narrow, owner)).toBe(false);
    const hidden = await takenMessage(narrow, owner);
    expect(hidden).toBe("다른 사람이 먼저 붙임 · 새로 고침");
    expect(hidden).not.toContain(usage.number);
  });
});

describe("P3-5 자동 떼기 수를 주인 로그 detail에", () => {
  it("삭제 · 종결 · 요청 취소 · 카드 사용 삭제 로그에 detachedEvidenceLinks", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();

    const draftId = await createDraftExpenseFixture(fx);
    await insertLinkFixture({ recordId: await insertRecordFixture(manager), ownerId: draftId, attachMode: "author", attachedBy: fx.pm.id });
    const [draft] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, draftId));
    await deleteExpenseDraft(fx.pm, { expenseId: draftId, expectedVersion: draft?.version ?? 0 });
    expect(await ownerLogDetail("expense", draftId, "document_delete")).toMatchObject({ detachedEvidenceLinks: 1 });

    const recordId = await insertRecordFixture(manager);
    const returned = await createReturnedExpenseFixture(fx, { linkRecordId: recordId, linkedBy: manager.id });
    const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, returned.expenseId));
    await closeExpense(fx.pm, { expenseId: returned.expenseId, expectedVersion: row?.version ?? 0, reason: "업체 취소" });
    expect(await ownerLogDetail("expense", returned.expenseId, "status_change")).toMatchObject({ to: "closed", detachedEvidenceLinks: 1 });

    const pfx = await purchaseProject();
    const created = await createRequest(pfx, pfx.onlineLine, 110_000);
    await insertLinkFixture({ recordId: await insertRecordFixture(manager), ownerKind: "purchase_request", ownerId: created.id, attachedBy: manager.id });
    const [request] = await db.select({ version: purchaseRequests.version }).from(purchaseRequests).where(eq(purchaseRequests.id, created.id));
    await cancelPurchaseRequest(pfx.pm, { id: created.id, version: request?.version ?? 0 }, await precheckPurchaseCancel(pfx.pm, { id: created.id }));
    expect(await ownerLogDetail("purchase_request", created.id, "status_change")).toMatchObject({ to: "cancelled", detachedEvidenceLinks: 1 });

    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `로그본부-${randomUUID()}` });
    const teamName = `로그팀-${randomUUID()}`;
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: teamName });
    const staff = await makePerson("직원", DEFAULT_ROLE_ID, teamName);
    const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `카드사-${randomUUID().slice(0, 6)}`, numberLast4: String(Math.floor(1000 + Math.random() * 9000)), label: "팀 카드", kind: "team", teamId: team.id });
    if (!card.id) throw new Error("카드 id 없음");
    const input: CardUsageInput = { corpCardId: card.id, usedOn: seoulToday(), merchantVendorId: null, total: { currency: "KRW", amount: 33_000, fxRate: 1 }, evidenceTypeCode: "card_receipt", linkKind: "team_cost", memo: null };
    const usage = await createCardUsage(staff, input, await precheckCardUsage(staff, input));
    await insertLinkFixture({ recordId: await insertRecordFixture(manager), ownerKind: "corp_card_usage", ownerId: usage.id, attachedBy: manager.id });
    const [stored] = await db.select({ version: corpCardUsages.version }).from(corpCardUsages).where(eq(corpCardUsages.id, usage.id));
    await deleteCardUsage(staff, { id: usage.id, version: stored?.version ?? 0 }, await precheckCardUsageRemoval(staff, { id: usage.id }));
    expect(await ownerLogDetail("corp_card_usage", usage.id, "document_delete")).toMatchObject({ detachedEvidenceLinks: 1 });
  });

  it("붙임이 없는 문서 삭제 로그에는 그 칸이 없다(기존 detail 그대로)", async () => {
    const fx = await setupExpenseProject();
    const draftId = await createDraftExpenseFixture(fx);
    const [draft] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, draftId));
    await deleteExpenseDraft(fx.pm, { expenseId: draftId, expectedVersion: draft?.version ?? 0 });
    expect(await ownerLogDetail("expense", draftId, "document_delete")).not.toHaveProperty("detachedEvidenceLinks");
  });
});

describe("P3-6 못 보는 붙임의 떼기 · 미리 보기 거부는 한 글자", () => {
  it("남의 지출결의 붙임 · 남의 구매 요청 붙임 · 없는 붙임 → 모두 `없는 붙임 · 새로 고침`", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const expenseRecord = await insertRecordFixture(manager);
    await createReturnedExpenseFixture(fx, { linkRecordId: expenseRecord, linkedBy: manager.id });
    const pfx = await purchaseProject();
    const created = await createRequest(pfx, pfx.onlineLine, 110_000);
    const requestRecord = await insertRecordFixture(manager);
    await insertLinkFixture({ recordId: requestRecord, ownerKind: "purchase_request", ownerId: created.id, attachedBy: manager.id });
    const stranger = await makePerson("남팀", "role-pm", null);
    const expected = "없는 붙임 · 새로 고침";
    for (const linkId of [await linkIdOf(expenseRecord), await linkIdOf(requestRecord), randomUUID()]) {
      expect(await messageOf(detachEvidenceRecord(stranger, { linkId, reason: "다른 건 증빙" }))).toBe(expected);
      expect(await messageOf(previewDetach(stranger, { linkId }))).toBe(expected);
    }
  });
});
