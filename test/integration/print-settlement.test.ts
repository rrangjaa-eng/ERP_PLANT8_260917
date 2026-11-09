import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalInstances, approvalRoutes, corpCardUsages, expenses, purchaseRequests } from "@/db/schema";
import { approveDocument, rejectDocument } from "@/domain/approvals";
import { createCorpCard } from "@/domain/corp-cards";
import { confirmEvidence } from "@/domain/evidence-reviews";
import { createExpenseFromLines, createTeamExpenseDraft, saveExpenseDraft } from "@/domain/expenses";
import { listExpenses, listProjectExpenseRows } from "@/domain/expenses/list";
import { createOrgUnit, createTeam } from "@/domain/org";
import { completeExpensePayment, previewPayable } from "@/domain/payments";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { currentApprovalRound } from "@/domain/print/current-round";
import { findProject, loadProjectProfit } from "@/domain/projects";
import {
  completePurchaseRequest,
  listProjectPurchaseRequests,
  listPurchaseRequests,
  precheckPurchaseCompletion,
  type PurchaseCompletionInput,
} from "@/domain/purchase-requests";
import {
  APPROVAL_ROUTE_SETTLEMENT_STEP4_ORG_UNIT_ID,
  APPROVAL_ROUTE_SETTLEMENT_STEP4_ROLE_ID,
  APPROVAL_ROUTE_SETTLEMENT_STEP4_SCOPE,
} from "@/domain/settings/keys";
import { getSettlement, SETTLEMENT_DOCUMENT_KIND, submitSettlement } from "@/domain/settlements";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { upsertSimpleValue } from "@/repositories/settings";
import { makePerson, orgUnitIdByName, teamIdByName } from "./approvals-fixtures";
import { addApprovedRevision, setupApprovedProject, setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";
import { placeInFundDivision } from "./fixtures/fund-scope";
import { makePaymentManager } from "./fixtures/payments";
import { purchaseProject, request, type PurchaseFx } from "./fixtures/purchase-requests";
import { extendToInProgress, SETTLEMENT_LINES, setupSettlementProject } from "./fixtures/settlements";

// 07.4-03 — 프로젝트 정산서 인쇄의 읽기 재료. 손익 칸은 화면과 같은 SQL(loadProjectProfit)을 그대로 싣고 종이에서 다시 세지 않는다(D-7402).

const QUOTE_TOTAL_KRW = SETTLEMENT_LINES.krw.unitPrice.amount + SETTLEMENT_LINES.usd.unitPrice.amount * SETTLEMENT_LINES.usd.unitPrice.fxRate;

async function grantPnl(roleId: string): Promise<void> {
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "pnl", action: "view", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "quote.amount", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "revenue.issued_amount", visible: true });
}

async function expectPnlViewer(viewer: Viewer): Promise<void> {
  expect(await can(viewer, "pnl", "view")).toBe(true);
  expect(await visible(viewer, "quote.amount")).toBe(true);
}

async function routesOf(documentId: string) {
  return db
    .select({ round: approvalRoutes.round, submittedAt: approvalRoutes.submittedAt })
    .from(approvalRoutes)
    .innerJoin(approvalInstances, eq(approvalInstances.id, approvalRoutes.instanceId))
    .where(and(eq(approvalInstances.documentKind, SETTLEMENT_DOCUMENT_KIND), eq(approvalInstances.documentId, documentId)))
    .orderBy(asc(approvalRoutes.round));
}

describe("정산서 손익 칸 — 매출 기준은 같은 SQL의 기준액 (07.4-03 D-7402)", () => {
  it("정산 · 발행 줄이 있으면 매출 기준 = 발행 합계(견적 합과 다름)이고 매출 기준 − 실행가 합 = 수익금이다", async () => {
    const fx = await setupSettlementProject();
    await submitSettlement(fx.pm, { projectId: fx.projectId });
    await grantPnl(CEO_ROLE_ID);
    await expectPnlViewer(fx.ceo);

    const doc = await getSettlement(fx.ceo, { projectId: fx.projectId });
    const profit = await loadProjectProfit(fx.ceo, fx.projectId);
    expect(profit?.kind).toBe("ok");
    if (profit?.kind !== "ok" || doc?.executionTotalKrw === undefined) throw new Error("손익 · 실행가 합 없음");
    // 픽스처의 발행 줄은 1,000,000 하나(clearPreSettleBlockers) — 견적 합(26,900,000)과 다르다.
    expect(profit.basisKrw).toBe(1_000_000);
    expect(profit.basisKrw).not.toBe(doc.quoteTotalKrw);
    expect(profit.basisKrw - doc.executionTotalKrw).toBe(profit.profitKrw);
  });

  it("진행 중 프로젝트는 발행 줄이 있어도 매출 기준 = 견적 합이다", async () => {
    const fx = await setupSettlementProject();
    await extendToInProgress(fx);
    await grantPnl(CEO_ROLE_ID);

    const profit = await loadProjectProfit(fx.ceo, fx.projectId);
    expect(profit).toMatchObject({ kind: "ok", basisKrw: QUOTE_TOTAL_KRW });
  });

  it("프로젝트 행 범위 밖 결재 관련자는 정산 문서를 열지만 손익은 null이다(누수 아님)", async () => {
    const fx = await setupSettlementProject();
    // 보기 범위가 자기 팀인 경영관리팀 팀장을 마지막 단계 후보로 — 기획1팀 프로젝트는 그 사람의 행 범위 밖이다.
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_SETTLEMENT_STEP4_ROLE_ID.key, TEAM_LEAD_ROLE_ID, null);
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_SETTLEMENT_STEP4_SCOPE.key, "org_unit", null);
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_SETTLEMENT_STEP4_ORG_UNIT_ID.key, await orgUnitIdByName("경영관리본부"), null);
    const mgmtHead = await makePerson("경영팀장", TEAM_LEAD_ROLE_ID, "경영관리팀");
    await grantPnl(TEAM_LEAD_ROLE_ID);
    // 자금 키는 프로젝트 행 범위를 전사로 넓힌다(domain/permissions/scope-for.ts FUND_ROW_SCOPE_KEYS) — 이 사례에서는 끈다.
    for (const [menu, action] of [["projects.adjustment", "write"], ["projects.budget", "view"], ["projects.revenue", "view"]] as const) {
      await upsertPermission(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, menu, action, allowed: false });
    }
    await submitSettlement(fx.pm, { projectId: fx.projectId });

    await expectPnlViewer(mgmtHead);
    expect(await findProject(mgmtHead, fx.projectId)).toBeNull();
    expect(await getSettlement(mgmtHead, { projectId: fx.projectId })).not.toBeNull();
    expect(await loadProjectProfit(mgmtHead, fx.projectId)).toBeNull();
  });
});

describe("정산서 결재란 기안 칸 시각 — 지금 차수 결재선 (07.4-03 eng 재검토 R2)", () => {
  it("반려 뒤 다시 올린 정산은 2차 route 시각이고 정산 문서 작성 시각과 다르다", async () => {
    const fx = await setupSettlementProject();
    await submitSettlement(fx.pm, { projectId: fx.projectId });
    const [instance] = await db
      .select({ id: approvalInstances.id, version: approvalInstances.version })
      .from(approvalInstances)
      .where(and(eq(approvalInstances.documentKind, SETTLEMENT_DOCUMENT_KIND), eq(approvalInstances.documentId, fx.projectId)));
    if (!instance) throw new Error("결재 인스턴스 없음");
    await rejectDocument(fx.ceo, { instanceId: instance.id, expectedVersion: instance.version, reason: "증빙 다시" });
    expect(await submitSettlement(fx.pm, { projectId: fx.projectId })).toMatchObject({ round: 2 });

    const [round1, round2] = await routesOf(fx.projectId);
    expect(round2?.round).toBe(2);
    const current = await currentApprovalRound(fx.pm, { kind: SETTLEMENT_DOCUMENT_KIND, documentId: fx.projectId });
    expect(current?.submittedAt).toEqual(round2?.submittedAt);
    expect(current?.submittedAt.getTime()).toBeGreaterThan(round1?.submittedAt.getTime() ?? Infinity);
    const doc = await getSettlement(fx.pm, { projectId: fx.projectId });
    expect(doc?.createdAt).toBeInstanceOf(Date);
    expect(doc?.createdAt?.getTime()).not.toBe(current?.submittedAt.getTime());
  });
});

// ── Task 2 — 정산서 안 지출결의 목록 · 구매 요청 목록(각 목록 화면과 같은 범위 · 같은 낱말 · 같은 투영) ─────────────

const krw = (amount: number) => ({ currency: "KRW" as const, amount, fxRate: 1 });

async function expenseVersion(expenseId: string): Promise<number> {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row.version;
}

async function newDraft(viewer: Viewer, lineId: string): Promise<string> {
  const created = await createExpenseFromLines(viewer, { lineIds: [lineId], fields: { note: "행사 운영비" } });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error(`작성 중 문서 없음: ${JSON.stringify(created.blocked)}`);
  return expenseId;
}

async function submittedOn(fx: ExpenseFixture, lineId: string, fields: Parameters<typeof saveExpenseDraft>[1]["fields"] = {}) {
  const expenseId = await newDraft(fx.pm, lineId);
  if (Object.keys(fields).length > 0) await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: await expenseVersion(expenseId), fields });
  const submitted = await submitReadyDraft(fx.pm, expenseId);
  if (submitted.kind !== "submitted") throw new Error("제출되지 않음");
  return { expenseId, number: submitted.number, instanceId: submitted.instanceId, version: submitted.version };
}

async function approveAll(fx: ExpenseFixture, doc: { instanceId: string; version: number }): Promise<void> {
  const first = await approveDocument(fx.lead, { instanceId: doc.instanceId, expectedVersion: doc.version });
  await approveDocument(fx.ceo, { instanceId: doc.instanceId, expectedVersion: first.version });
}

async function payNow(expenseId: string): Promise<void> {
  const payer = await makePaymentManager("지급담당");
  if (!payer.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: true });
  const confirmed = await confirmEvidence(payer, { expenseId, version: await expenseVersion(expenseId) });
  const preview = await previewPayable(payer, { expenseId, payDate: seoulToday() });
  if (preview.payableKrw === undefined || preview.payableKrw === null) throw new Error("지급 총액 없음");
  await completeExpensePayment(payer, { expenseId, expectedPayableKrw: preview.payableKrw, version: confirmed.version });
}

// 프로젝트 A: 지급 완료 1 · 승인(분할 1회차) 1 · 결재 중(분할 2회차) 1 · 작성 중 1 / 다른 프로젝트 B: 승인 1 / 팀 비용 작성 중 1.
async function expenseWorld() {
  const fx = await setupExpenseProject();
  const paid = await submittedOn(fx, fx.lines.withVendor);
  await approveAll(fx, paid);
  await payNow(paid.expenseId);
  const approved = await submittedOn(fx, fx.lines.split, { installment: true, supply: krw(3_000_000) });
  await approveAll(fx, approved);
  const inReview = await submittedOn(fx, fx.lines.split, { supply: krw(3_000_000) });
  const extra = await addApprovedRevision(fx, [{ itemName: "조명", vendorId: fx.stageOneId, execution: krw(500_000) }]);
  const lightLine = extra.lineIds.get("조명");
  if (!lightLine) throw new Error("조명 줄 없음");
  const draftId = await newDraft(fx.pm, lightLine);

  const other = await setupApprovedProject("다른 프로젝트", await teamIdByName("기획1팀"), fx.pm, fx.stageOneId);
  const otherDoc = await newDraft(fx.pm, other.lineId);
  const otherSubmitted = await submitReadyDraft(fx.pm, otherDoc);
  if (otherSubmitted.kind !== "submitted") throw new Error("제출되지 않음");
  await approveAll(fx, otherSubmitted);
  const teamDraft = await createTeamExpenseDraft(fx.pm, { idempotencyKey: randomUUID(), fields: { teamExpenseKind: "team_overhead" as const, content: "팀 회식" } });
  return { fx, numbered: [paid, approved, inReview], draftId, otherId: otherDoc, teamDraftId: teamDraft.expenseId };
}

async function listedIn(viewer: Viewer, ids: readonly string[]) {
  const list = await listExpenses(viewer, { status: "all" }, { pageSize: 100 });
  return list.groups.flatMap((group) => group.rows).filter((row) => row.id !== undefined && ids.includes(row.id) && row.number);
}

describe("정산서 지출결의 목록 — 지출결의 목록 화면과 같은 범위 · 같은 낱말 (07.4-03 D-7414)", () => {
  it("전사 범위 계급에는 A의 번호 있는 문서 셋만 번호 오름차순 · 상태 낱말 · 항목은 목록 화면과 같고 프로젝트 이름이 없다", async () => {
    const world = await expenseWorld();
    const { fx } = world;
    const rows = await listProjectExpenseRows(fx.ceo, fx.projectId);
    expect(rows).not.toBeNull();
    const numbers = world.numbered.map((doc) => doc.number).sort();
    expect(rows?.map((row) => row.number)).toEqual(numbers);
    expect(rows?.map((row) => row.id)).not.toContain(world.draftId);
    expect(rows?.map((row) => row.id)).not.toContain(world.otherId);
    expect(rows?.map((row) => row.id)).not.toContain(world.teamDraftId);

    const screen = await listedIn(fx.ceo, world.numbered.map((doc) => doc.expenseId));
    const wordOf = new Map(screen.map((row) => [row.id, row.statusWord]));
    for (const row of rows ?? []) expect(row.statusWord, row.number ?? undefined).toBe(wordOf.get(row.id ?? ""));
    expect(rows?.find((row) => row.id === world.numbered[0]?.expenseId)?.statusWord).toBe("지급 완료");
    expect(rows?.find((row) => row.id === world.numbered[1]?.expenseId)?.statusWord).toBe("승인");
    expect(rows?.find((row) => row.id === world.numbered[2]?.expenseId)?.statusWord).toMatch(/ 결재 중$/);
    for (const row of rows ?? []) expect(row.title ?? "").not.toContain("가을 팝업");
    expect(rows?.find((row) => row.id === world.numbered[0]?.expenseId)?.title).toBe("무대 제작");
    for (const row of rows ?? []) expect(row).toHaveProperty("supply");
  }, 60_000);

  it("일련번호 자릿수가 프로젝트 도중 바뀌어도 번호는 숫자 순서다(/review 지적)", async () => {
    const world = await expenseWorld();
    const { fx } = world;
    const [first, second] = world.numbered;
    // 앞 문서는 1자리(…-9), 뒤 문서는 자릿수를 4로 늘린 뒤의 번호(…-0010) — 글자 비교면 …-0010이 앞에 온다.
    await db.update(expenses).set({ number: "SORT-9" }).where(eq(expenses.id, first?.expenseId ?? ""));
    await db.update(expenses).set({ number: "SORT-0010" }).where(eq(expenses.id, second?.expenseId ?? ""));
    const rows = (await listProjectExpenseRows(fx.ceo, fx.projectId)) ?? [];
    const order = rows.map((row) => row.number).filter((number) => number?.startsWith("SORT-"));
    expect(order).toEqual(["SORT-9", "SORT-0010"]);
  }, 60_000);

  it("자기 범위 계급의 행은 그 사람이 지출결의 목록 화면에서 보는 A 행과 같은 집합이다", async () => {
    const world = await expenseWorld();
    const { fx } = world;
    const aIds = [...world.numbered.map((doc) => doc.expenseId), world.draftId];
    for (const viewer of [fx.pm, fx.otherPm, fx.lead]) {
      const rows = (await listProjectExpenseRows(viewer, fx.projectId)) ?? [];
      const screen = await listedIn(viewer, aIds);
      expect(rows.map((row) => row.id).sort()).toEqual(screen.map((row) => row.id).sort());
    }
  }, 60_000);

  it("expenses 보기 권한 없는 계급은 null · 형식 아닌 projectId는 [] · expense.amount를 끈 계급은 supply 키가 없다", async () => {
    const world = await expenseWorld();
    const { fx } = world;
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `지출없음-${randomUUID().slice(0, 8)}`, workScope: "company", viewScope: "company" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
    const noExpenses = await makePerson("지출없음", role.id, null);
    expect(await listProjectExpenseRows(noExpenses, fx.projectId)).toBeNull();
    expect(await listProjectExpenseRows(fx.ceo, "abc")).toEqual([]);

    await upsertVisibility(SYSTEM_VIEWER, { roleId: CEO_ROLE_ID, infoItem: "expense.amount", visible: false });
    const rows = (await listProjectExpenseRows(fx.ceo, fx.projectId)) ?? [];
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row).not.toHaveProperty("supply");
  }, 60_000);
});

async function buyerWith(hidden: readonly string[] = []): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `구매처리-${randomUUID().slice(0, 8)}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "cards.purchases", action: "write", allowed: true });
  for (const infoItem of ["purchase_request.value", "purchase_request.amount", "project.value", "quote.amount", "card_usage.value", "card_usage.amount"]) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: !hidden.includes(infoItem) });
  }
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `처리본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `처리팀-${randomUUID()}` });
  const person = await makePerson("구매담당", role.id, team.name);
  await placeInFundDivision(person.id);
  return person;
}

async function completeWithCard(buyer: Viewer, requestId: string, totalKrw: number): Promise<void> {
  const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `공용사-${randomUUID().slice(0, 6)}`, numberLast4: String(Math.floor(1000 + Math.random() * 9000)), label: "공용 카드", kind: "shared" });
  if (!card.id) throw new Error("카드 id 없음");
  const [row] = await db.select({ version: purchaseRequests.version }).from(purchaseRequests).where(eq(purchaseRequests.id, requestId));
  const input: PurchaseCompletionInput = {
    requestId,
    version: row?.version ?? 0,
    corpCardId: card.id,
    usedOn: seoulToday(),
    merchantVendorId: null,
    total: { currency: "KRW", amount: totalKrw, fxRate: 1 },
    evidenceTypeCode: "invoice",
    memo: null,
  };
  await completePurchaseRequest(buyer, input, await precheckPurchaseCompletion(buyer, input));
}

// 남이 신청한 요청 — 신청 권한 경로를 거치지 않고 행으로 만든다(purchase-requests.test.ts 범위 시험과 같은 꼴 · 범위 쿼리만 본다).
async function requestBy(requester: Viewer, fx: PurchaseFx, estimateKrw: number): Promise<string> {
  const [row] = await db
    .insert(purchaseRequests)
    .values({ number: `${fx.projectNumber}-C${randomUUID().slice(0, 6)}`, linkKind: "quote_line", projectId: fx.projectId, quoteLineId: fx.onlineLine, requestedBy: requester.id, itemName: "남의 물건", estimateAmountKrw: estimateKrw })
    .returning({ id: purchaseRequests.id });
  if (!row) throw new Error("구매 요청 없음");
  return row.id;
}

// 프로젝트 A: 구매 완료 1(PM 신청 · 결제 합계 99,000) · 남의 신청 1 · 취소 1 / 프로젝트 B: 1.
async function purchaseWorld() {
  const a = await purchaseProject();
  const b = await purchaseProject();
  const buyer = await buyerWith();
  const purchased = (await request(a, a.onlineLine, 110_000)).id;
  await completeWithCard(buyer, purchased, 99_000);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `요청본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `요청팀-${randomUUID()}` });
  const requester = await makePerson("다른요청자", DEFAULT_ROLE_ID, team.name);
  const others = await requestBy(requester, a, 11_000);
  const cancelled = (await request(a, a.onlineLine, 50_000)).id;
  await db.update(purchaseRequests).set({ status: "cancelled", cancelledAt: new Date(), cancelledBy: a.pm.id, cancelReason: "취소" }).where(eq(purchaseRequests.id, cancelled));
  const onB = (await request(b, b.onlineLine)).id;
  return { a, b, buyer, requester, purchased, others, cancelled, onB };
}

const idsOf = (rows: readonly { id?: string }[]) => rows.map((row) => row.id).sort();

describe("정산서 구매 요청 목록 — 구매 요청 목록 화면과 같은 범위 · 취소 제외 (07.4-03 D-7414 · Q5)", () => {
  it("전부 보는 계급은 A의 두 요청(취소 · B 없음) · 자기 범위는 배열이고 목록 화면 집합에서 취소만 뺀 것과 같다", async () => {
    const world = await purchaseWorld();
    const ceo = await makePerson("구매대표", CEO_ROLE_ID, null);
    const expected = [world.purchased, world.others].sort();
    expect(idsOf(await listProjectPurchaseRequests(world.buyer, world.a.projectId))).toEqual(expected);
    expect(idsOf(await listProjectPurchaseRequests(ceo, world.a.projectId))).toEqual(expected);
    expect(idsOf(await listProjectPurchaseRequests(world.a.pm, world.a.projectId))).toEqual(expected);
    expect(idsOf(await listProjectPurchaseRequests(world.requester, world.a.projectId))).toEqual([world.others]);
    expect(await listProjectPurchaseRequests(world.buyer, "abc")).toEqual([]);

    // 목록 화면(listPurchaseRequests 전체 보기)과 같은 범위 — 그 프로젝트 행에서 취소만 뺀 집합.
    const aIds = [world.purchased, world.others, world.cancelled];
    for (const viewer of [world.a.pm, world.requester]) {
      const screen = (await listPurchaseRequests(viewer, { status: "all" }, seoulToday())).rows.filter((row) => row.id && aIds.includes(row.id) && row.status !== "cancelled");
      expect(idsOf(await listProjectPurchaseRequests(viewer, world.a.projectId))).toEqual(idsOf(screen));
    }
  }, 60_000);

  it("혼합 권한: 금액 둘 다 보면 결제 합계 숫자 · 예상 금액만 보면 결제 합계 키 없음 · 둘 다 못 보면 두 키 없음 · 카드 사용 보관이면 결제 합계 null", async () => {
    const world = await purchaseWorld();
    const both = await listProjectPurchaseRequests(world.buyer, world.a.projectId);
    const purchasedRow = both.find((row) => row.id === world.purchased);
    expect(purchasedRow).toMatchObject({ status: "purchased", estimateKrw: 110_000, usageTotalKrw: 99_000 });
    expect(purchasedRow?.usageUsedOn).toBe(seoulToday());
    expect(both.find((row) => row.id === world.others)).toMatchObject({ estimateKrw: 11_000 });

    const amountOnly = await buyerWith(["card_usage.amount"]);
    for (const row of await listProjectPurchaseRequests(amountOnly, world.a.projectId)) {
      expect(row).not.toHaveProperty("usageTotalKrw");
      expect(row).toHaveProperty("estimateKrw");
    }
    const neither = await buyerWith(["card_usage.amount", "purchase_request.amount"]);
    for (const row of await listProjectPurchaseRequests(neither, world.a.projectId)) {
      expect(row).not.toHaveProperty("usageTotalKrw");
      expect(row).not.toHaveProperty("estimateKrw");
    }

    await db.update(corpCardUsages).set({ archivedAt: new Date() }).where(eq(corpCardUsages.purchaseRequestId, world.purchased));
    const archived = (await listProjectPurchaseRequests(world.buyer, world.a.projectId)).find((row) => row.id === world.purchased);
    expect(archived?.usageTotalKrw).toBeNull();
  }, 60_000);
});
