import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { expenseEvidenceReviews, expensePayments, expenses, files, purchaseRequests, quoteLines } from "@/db/schema";
import { createCorpCard } from "@/domain/corp-cards";
import { createOrgUnit, createTeam } from "@/domain/org";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createProject } from "@/domain/projects";
import { completePurchaseRequest, createPurchaseRequest, precheckPurchaseCompletion, precheckPurchaseRequest } from "@/domain/purchase-requests";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertVendor } from "@/repositories/vendors";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { makePerson, type Person } from "../leave-org";
import { E2E_ONLINE_VENDOR_NAME, enableOnlineVendorSetting } from "../online-vendor";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { confirmEvidence, loadPrepaidDueDays } from "@/domain/evidence-reviews";
import { completePaymentsBatch } from "@/domain/payments/batch";
import { previewPayable } from "@/domain/payments";
import { submitReadyDraft, testVendorAccount } from "../../integration/fixtures/expenses";
import { insertTempRole, type ExpenseE2E, type LineKey } from "../expense-fixture";

// 07.1-18 게이트 반영 — 실제 길이 데이터(7자리 금액 · 긴 이름 · 긴 상태 글자)로 폰 표를 재는 스펙들의 공용 픽스처. 스펙 파일끼리 import하지 않으므로 여기에 둔다.

export type Holder = { person: Person; cardId: string; teamId: string; teamName: string };

/** 개인 카드 보유자 — 자기 카드 사용에 수정 · 삭제 행동이 붙는 사람. */
export async function makeCardHolder(): Promise<Holder> {
  const suffix = randomUUID().slice(0, 8);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E폰실데이터본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E폰실데이터팀-${suffix}` });
  const person = await makePerson("폰실데이터", DEFAULT_ROLE_ID, team.id, `${seoulToday().slice(0, 4)}-01-01`);
  const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `신한-${suffix}`, numberLast4: "4321", label: `E2E폰실데이터-${suffix}`, kind: "personal", holderUserId: person.viewer.id });
  if (!card.id) throw new Error("카드 id 없음");
  return { person, cardId: card.id, teamId: team.id, teamName: team.name };
}

export type QuoteTarget = { projectId: string; projectName: string; projectNumber: string; lineId: string; itemName: string; onlineLineId: string; onlineItem: string };

/** 요청자가 담당 PM인 프로젝트 하나 — 긴 프로젝트 이름 · 긴 항목 이름 줄 둘(온라인구매 협력사 줄 + 다른 거래처 줄). */
export async function seedLongTarget(owner: { person: Person; teamId: string }): Promise<QuoteTarget> {
  const suffix = randomUUID().slice(0, 8);
  await enableOnlineVendorSetting();
  const online = await insertVendor(SYSTEM_VIEWER, { name: E2E_ONLINE_VENDOR_NAME, normalizedName: E2E_ONLINE_VENDOR_NAME.toLowerCase(), defaultEvidenceType: "tax_invoice", ...testVendorAccount() });
  const other = await insertVendor(SYSTEM_VIEWER, { name: `E2E스테이지-${suffix}`, normalizedName: `e2e스테이지-${suffix}`, defaultEvidenceType: "tax_invoice", ...testVendorAccount() });
  const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E폰실클라이언트-${suffix}`, normalizedName: `e2e폰실클라이언트-${suffix}` });
  const year = seoulToday().slice(0, 4);
  const projectName = `E2E폰실데이터 가을 브랜드 팝업스토어 운영 대행-${suffix}`;
  const project = await createProject(owner.person.viewer, { clientId: client.id, teamId: owner.teamId, pmUserId: owner.person.viewer.id, name: projectName, startDate: `${year}-01-01`, endDate: `${year}-12-31` });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision || !project.number) throw new Error("프로젝트 · 1차 차수가 없습니다");
  const subcategory = (await firstSelectableSubcategory()).value;
  const onlineItem = `현장 소모품 및 운영 인력 식대 다과 음료 일체-${suffix}`;
  const itemName = `무대 제작 및 설치 철거 일체-${suffix}`;
  const row = (name: string, vendorId: string) => ({
    id: randomUUID(),
    isNew: true as const,
    subcategory,
    itemName: name,
    vendorId,
    unitPrice: { currency: "KRW" as const, amount: 12_500_000, fxRate: 1 },
    execution: { currency: "KRW" as const, amount: 10_000_000, fxRate: 1 },
  });
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [row(onlineItem, online.id), row(itemName, other.id)] });
  const lines = await db.select({ id: quoteLines.id, itemName: quoteLines.itemName }).from(quoteLines).where(eq(quoteLines.revisionId, revision.id));
  const idOf = (name: string) => {
    const found = lines.find((line) => line.itemName === name)?.id;
    if (!found) throw new Error(`견적 줄 없음: ${name}`);
    return found;
  };
  return { projectId: project.id, projectName, projectNumber: project.number, lineId: idOf(itemName), itemName, onlineLineId: idOf(onlineItem), onlineItem };
}

const PURCHASER_VISIBLE = ["purchase_request.value", "purchase_request.amount", "project.value", "quote.amount", "card_usage.value", "card_usage.amount", "team.value", "vendor.value"];

/** 구매 권한자(`cards.purchases` write) — 요청자와 다른 새 팀. */
export async function makePurchaser(): Promise<Person> {
  const suffix = randomUUID().slice(0, 8);
  const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E폰구매처리-${suffix}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "cards.purchases", action: "write", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  for (const infoItem of PURCHASER_VISIBLE) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E폰처리본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E폰처리팀-${suffix}` });
  return makePerson("처리", role.id, team.id, `${seoulToday().slice(0, 4)}-01-01`);
}

export type RequestMoney = { currency: "KRW" | "USD"; amount: number; fxRate: number };

/** 구매 요청 하나를 만들고 id · 번호 · 버전을 돌려준다. */
export async function requestPurchase(requester: Person, lineId: string, itemName: string, estimate: RequestMoney): Promise<{ id: string; number: string }> {
  const input = { linkKind: "quote_line" as const, lineId, itemName, linkUrl: null, estimate, memo: null };
  return createPurchaseRequest(requester.viewer, input, await precheckPurchaseRequest(requester.viewer, input));
}

/** 요청을 구매 완료 처리한다(카드 사용 생성). 결제 합계는 7자리 원화. */
export async function completePurchase(buyer: Person, requestId: string, cardId: string, totalKrw: number): Promise<void> {
  const [current] = await db.select({ version: purchaseRequests.version }).from(purchaseRequests).where(eq(purchaseRequests.id, requestId));
  if (!current) throw new Error("구매 요청 없음");
  const version = current.version;
  const input = { requestId, version, corpCardId: cardId, usedOn: seoulToday(), merchantVendorId: null, total: { currency: "KRW" as const, amount: totalKrw, fxRate: 1 }, evidenceTypeCode: "invoice", memo: null };
  await completePurchaseRequest(buyer.viewer, input, await precheckPurchaseCompletion(buyer.viewer, input));
}

// ---- 지출결의 목록 상태 칸(`지급 완료 MM-DD` + 기한 지난 선결제 `증빙 N일 경과`) 픽스처 ----

const INFO_ITEMS = ["expense.value", "expense.amount", "approval.value", "project.value", "quote.amount", "vendor.value", "team.value", "person.value"];

/** 프로젝트 팀의 지급 권한자(팀 업무 범위 · 지출결의 보기 + 지급 처리 쓰기). */
export async function makeTeamPayer(fx: ExpenseE2E): Promise<Person> {
  const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E폰지급-${randomUUID().slice(0, 8)}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.team", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.payments", action: "write", allowed: true });
  for (const infoItem of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return makePerson("폰지급", role.id, fx.teamId, `${seoulToday().slice(0, 4)}-01-01`);
}

/** 줄 하나 → 증빙 붙여 제출 → 결재 넷 승인 → 지급 권한자 확인 → 오늘 지급(`pay: false`면 확인까지 = 지급 대상). 문서 id. */
export async function paidExpense(fx: ExpenseE2E, key: LineKey, payer: Person, options: { pay?: boolean } = {}): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  const submitted = await submitReadyDraft(fx.pm.viewer, expenseId);
  if (submitted.kind !== "submitted") throw new Error("제출 실패");
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 인스턴스 없음");
  let version = view.version;
  for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) version = (await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: version })).version;
  const [doc] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!doc) throw new Error("문서 없음");
  await confirmEvidence(payer.viewer, { expenseId, version: doc.version });
  if (options.pay === false) return expenseId;
  const [fresh] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  const preview = await previewPayable(payer.viewer, { expenseId, payDate: seoulToday() });
  if (!fresh || typeof preview.payableKrw !== "number") throw new Error("지급할 수 없는 문서");
  const result = await completePaymentsBatch(payer.viewer, { payDate: seoulToday(), rows: [{ expenseId, expenseVersion: fresh.version, expectedPayableKrw: preview.payableKrw }] });
  if (result.processed !== 1) throw new Error(`지급 안 됨: ${JSON.stringify(result.blocked)}`);
  return expenseId;
}

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/** 지급된 선결제 문서를 기한이 지난 상태로 만든다 → 목록 상태 칸 둘째 줄 `증빙 N일 경과`(N = 2). */
export async function makePrepaidOverdue(expenseId: string): Promise<void> {
  const past = addDays(seoulToday(), -((await loadPrepaidDueDays()) + 2));
  await db.update(expensePayments).set({ payDate: past }).where(and(eq(expensePayments.expenseId, expenseId), isNull(expensePayments.cancelledAt)));
  await db.delete(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, expenseId));
  await db.update(expenses).set({ prepaid: true, prepaidReason: "해외 결제 선결제" }).where(eq(expenses.id, expenseId));
  await db.update(files).set({ removedAt: new Date() }).where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, expenseId)));
}
