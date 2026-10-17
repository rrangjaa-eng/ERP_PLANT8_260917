import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { evidenceRecordLinks, expenses, purchaseRequests } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createCorpCard } from "@/domain/corp-cards";
import { createCardUsage, deleteCardUsage, precheckCardUsage, precheckCardUsageRemoval, restoreCardUsage, type CardUsageInput } from "@/domain/corp-card-usages";
import { attachEvidenceRecord } from "@/domain/evidence-records/attach";
import { closeExpense, deleteExpenseDraft, getExpense, restoreExpenseDraft } from "@/domain/expenses";
import { createOrgUnit, createTeam } from "@/domain/org";
import { cancelPurchaseRequest, precheckPurchaseCancel } from "@/domain/purchase-requests";
import { PAYMENT_METHOD_EVIDENCE_PAIRS } from "@/domain/settings/keys";
import { seoulToday } from "@/lib/dates";
import { upsertSimpleValue } from "@/repositories/settings";
import { makePerson } from "./approvals-fixtures";
import { addApprovedRevision, setupExpenseProject, type ExpenseFixture } from "./fixtures/expenses";
import { createDraftExpenseFixture, createIntakeManager, createReturnedExpenseFixture, insertLinkFixture, insertRecordFixture } from "./fixtures/evidence";
import { setEvidenceRequired } from "./fixtures/payments";
import { purchaseProject, request as createRequest } from "./fixtures/purchase-requests";

// 06.1-06 Task 3(E22 · DB-15): 문서 삭제 · 종결 · 구매 요청 취소 · 카드 사용 삭제는 같은 트랜잭션에서 붙은 증빙 기록을 뗀다(뗀 사람 = 실행자 ·
// 사유 = 고정 글자). 증빙은 풀로 돌아가 다른 문서에 다시 붙는다. 되살리기는 붙임을 다시 만들지 않는다.

beforeEach(async () => {
  await setEvidenceRequired(false);
  await upsertSimpleValue(SYSTEM_VIEWER, PAYMENT_METHOD_EVIDENCE_PAIRS.key, [], null);
});

async function linksOf(recordId: string) {
  return db.select().from(evidenceRecordLinks).where(eq(evidenceRecordLinks.evidenceRecordId, recordId));
}

async function versionOf(expenseId: string): Promise<number> {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row.version;
}

async function secondLine(fx: ExpenseFixture): Promise<string> {
  const added = await addApprovedRevision(fx, [{ itemName: "다시 붙일 줄", vendorId: fx.stageOneId, execution: { currency: "KRW", amount: 12_400_000, fxRate: 1 } }]);
  const id = added.lineIds.get("다시 붙일 줄");
  if (!id) throw new Error("견적 줄 없음");
  return id;
}

describe("자동 떼기 (06.1-06 Task 3 · E22)", () => {
  it("작성 중 문서 삭제 → 작성자 붙임이 「문서 삭제」로 떨어짐(뗀 사람 = 삭제한 사람) · 되살리기는 붙임을 다시 만들지 않음", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const recordId = await insertRecordFixture(manager);
    const expenseId = await createDraftExpenseFixture(fx);
    await insertLinkFixture({ recordId, ownerId: expenseId, attachMode: "author", attachedBy: fx.pm.id });

    await deleteExpenseDraft(fx.pm, { expenseId, expectedVersion: await versionOf(expenseId) });
    const [link] = await linksOf(recordId);
    expect(link?.detachedAt).not.toBeNull();
    expect(link).toMatchObject({ detachedBy: fx.pm.id, detachReason: "문서 삭제" });

    await restoreExpenseDraft(fx.pm, { expenseId });
    const after = await linksOf(recordId);
    expect(after).toHaveLength(1);
    expect(after.every((row) => row.detachedAt !== null)).toBe(true);
  });

  it("반려 문서 종결 → 확인 창 결과 줄에 붙은 증빙 수 · 종결 뒤 「문서 종결」로 떨어짐 · 같은 기록을 다른 반려 문서에 붙이기 성공", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const recordId = await insertRecordFixture(manager);
    const doc = await createReturnedExpenseFixture(fx, { linkRecordId: recordId, linkedBy: manager.id });

    const dialog = (await getExpense(fx.pm, { expenseId: doc.expenseId }))?.closeDialog;
    expect(dialog?.resultLines.at(-1)).toBe("붙은 증빙 1건은 증빙 목록으로");

    await closeExpense(fx.pm, { expenseId: doc.expenseId, expectedVersion: await versionOf(doc.expenseId), reason: "업체 취소" });
    const [link] = await linksOf(recordId);
    expect(link).toMatchObject({ detachedBy: fx.pm.id, detachReason: "문서 종결" });

    const other = await createReturnedExpenseFixture(fx, { lineId: await secondLine(fx) });
    expect(await attachEvidenceRecord(manager, { recordId, owner: { kind: "expense", id: other.expenseId } })).toMatchObject({ created: true });
    const live = (await linksOf(recordId)).filter((row) => row.detachedAt === null);
    expect(live.map((row) => row.ownerId)).toEqual([other.expenseId]);
  });

  it("붙은 증빙이 없는 반려 문서 → 확인 창 결과 줄에 붙은 증빙 줄 없음", async () => {
    const fx = await setupExpenseProject();
    const doc = await createReturnedExpenseFixture(fx);
    const dialog = (await getExpense(fx.pm, { expenseId: doc.expenseId }))?.closeDialog;
    expect(dialog?.resultLines.some((line) => line.startsWith("붙은 증빙"))).toBe(false);
  });

  it("구매 요청 본인 취소 → 「요청 취소」로 떨어짐(뗀 사람 = 취소한 사람)", async () => {
    const pfx = await purchaseProject();
    const manager = await createIntakeManager();
    const created = await createRequest(pfx, pfx.onlineLine, 110_000);
    const recordId = await insertRecordFixture(manager, { supplyKrw: 100_000, vatKrw: 10_000 });
    await insertLinkFixture({ recordId, ownerKind: "purchase_request", ownerId: created.id, attachedBy: manager.id });
    const [row] = await db.select({ version: purchaseRequests.version }).from(purchaseRequests).where(eq(purchaseRequests.id, created.id));
    if (!row) throw new Error("구매 요청 없음");

    await cancelPurchaseRequest(pfx.pm, { id: created.id, version: row.version }, await precheckPurchaseCancel(pfx.pm, { id: created.id }));
    const [link] = await linksOf(recordId);
    expect(link).toMatchObject({ detachedBy: pfx.pm.id, detachReason: "요청 취소" });
  });

  it("카드 사용 삭제(보관) → 「카드 사용 삭제」로 떨어짐 · 되살리기는 붙임을 다시 만들지 않음", async () => {
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `떼기본부-${randomUUID()}` });
    const teamName = `떼기팀-${randomUUID()}`;
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: teamName });
    const staff = await makePerson("직원", DEFAULT_ROLE_ID, teamName);
    const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `카드사-${randomUUID().slice(0, 6)}`, numberLast4: String(Math.floor(1000 + Math.random() * 9000)), label: "팀 카드", kind: "team", teamId: team.id });
    if (!card.id) throw new Error("카드 id 없음");
    const input: CardUsageInput = { corpCardId: card.id, usedOn: seoulToday(), merchantVendorId: null, total: { currency: "KRW", amount: 33_000, fxRate: 1 }, evidenceTypeCode: "card_receipt", linkKind: "team_cost", memo: null };
    const usage = await createCardUsage(staff, input, await precheckCardUsage(staff, input));
    const manager = await createIntakeManager();
    const recordId = await insertRecordFixture(manager);
    await insertLinkFixture({ recordId, ownerKind: "corp_card_usage", ownerId: usage.id, attachedBy: manager.id });

    const deleted = await deleteCardUsage(staff, { id: usage.id, version: usage.version }, await precheckCardUsageRemoval(staff, { id: usage.id }));
    const [link] = await linksOf(recordId);
    expect(link).toMatchObject({ detachedBy: staff.id, detachReason: "카드 사용 삭제" });

    await restoreCardUsage(staff, { id: usage.id, version: deleted.version }, await precheckCardUsageRemoval(staff, { id: usage.id }));
    expect((await linksOf(recordId)).every((row) => row.detachedAt !== null)).toBe(true);
  });
});
