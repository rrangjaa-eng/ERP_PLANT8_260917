import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import { actionLog, codeItems, corpCardUsages, evidenceRecordLinks, evidenceRecords, projects, purchaseRequests } from "@/db/schema";
import { cardUsageFormDefaults, cardUsageFormOptions } from "@/domain/corp-card-usages";
import { createCorpCard } from "@/domain/corp-cards";
import { attachEvidenceAsAuthor, attachEvidenceRecord, cardUsagePrefillFromEvidence, createCardUsageFromEvidence, listAttachCandidates } from "@/domain/evidence-records/attach";
import { listEvidenceRecordsByIds } from "@/domain/evidence-records";
import { evidencePickerMode, listEvidencePool } from "@/domain/evidence-records/pool";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { detachLiveLinksForOwner } from "@/repositories/evidence-record-links";
import { insertVendor } from "@/repositories/vendors";
import { lotteFixture } from "@/test/fixtures/evidence-import/build";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { makePerson, teamIdByName } from "./approvals-fixtures";
import { createCardUsageFixture, createInReviewExpenseFixture, createIntakeManager, insertLinkFixture, insertRecordFixture, registerFixtureFile, setRecordVisibilityFixture } from "./fixtures/evidence";
import { setupExpenseProject } from "./fixtures/expenses";
import { deferred, waitForLockWaiter } from "./lock-race";

// 06.1-09 Task 2(경영관리 길 · D-6111 · 카드 R3 · P2-C4 · N-6 · N-8): 경영관리가 카드 줄을 카드 사용에 직접 붙인다.
// 붙임 → 파일 값 덮기 → 끌 수 없는 기록이 한 트랜잭션. 막힌 경우는 잠금 뒤 재판정 글자로 거부하고 붙임 · 덮기 0.

const USED_ON = "2026-04-30";
let seed = 4000 + Math.floor(Math.random() * 4000);

function nextLast4(): string {
  seed += 1;
  if (seed === 2222 || seed === 3333) seed += 1;
  return String(seed);
}

function approval(): string {
  return String(10_000_000 + Math.floor(Math.random() * 89_999_999));
}

async function lotteCard(holderUserId: string): Promise<{ id: string; last4: string }> {
  const last4 = nextLast4();
  const card = await createCorpCard(SYSTEM_VIEWER, { issuer: "롯데카드", numberLast4: last4, label: `붙이기 ${last4}`, kind: "personal", holderUserId });
  if (!card.id) throw new Error("카드 id 없음");
  return { id: card.id, last4 };
}

type Fx = { pm: Viewer; manager: Viewer; cardA: { id: string; last4: string }; cardB: { id: string; last4: string } };

async function setup(): Promise<Fx> {
  const pm = await makePerson("붙이기PM", DEFAULT_ROLE_ID, "기획1팀");
  // 지급 권한(expenses.payments) = 06 카드 사용 목록 전부 범위 — 경영관리 S4가 읽는 범위.
  const manager = await createIntakeManager("경영관리", { payments: true });
  if (!manager.roleId) throw new Error("계급 없음");
  for (const infoItem of ["card_usage.value", "card_usage.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: manager.roleId, infoItem, visible: true });
  return { pm, manager, cardA: await lotteCard(pm.id), cardB: await lotteCard(pm.id) };
}

// 카드 파일 한 줄 등록(대사 후보 없음 — 승인번호 새로) → 그 기록 id.
async function cardRecord(fx: Fx, last4: string, total: string, vat: string): Promise<string> {
  const result = await registerFixtureFile(fx.manager, lotteFixture([{ 카드번호: `999900001111${last4}`, 승인번호: approval(), 매입금액: total, 부가세: vat, 매입일자: "2026.04.10" }]));
  const [row] = await db.select({ id: evidenceRecords.id }).from(evidenceRecords).where(eq(evidenceRecords.batchId, result.batchId));
  if (!row) throw new Error("기록 없음");
  // 파일 날짜를 카드 사용 날짜와 다르게 올려 대사가 먼저 붙이지 않게 했다 — 사람이 고르는 길(3단계)을 잰다.
  return row.id;
}

// S4 후보 조건(검토 P2-3 — 같은 승인번호 ∨ 같은 사용일 ∧ 합계)을 맞춘다: 등록이 끝난 뒤 카드 사용과 그 줄들에 같은 새 승인번호를 싣는다
// (등록 전에 맞추면 대사 1단계가 먼저 붙인다). 사람이 고르는 길(3단계)을 재는 시험의 준비다.
async function pairByApproval(usageId: string, recordIds: readonly string[]): Promise<void> {
  const shared = approval();
  await db.update(corpCardUsages).set({ approvalNo: shared }).where(eq(corpCardUsages.id, usageId));
  for (const recordId of recordIds) await db.update(evidenceRecords).set({ approvalNo: shared }).where(eq(evidenceRecords.id, recordId));
}

async function usageRow(id: string) {
  const [row] = await db.select().from(corpCardUsages).where(eq(corpCardUsages.id, id));
  if (!row) throw new Error("카드 사용 없음");
  return row;
}

async function liveLinks(usageId: string) {
  return db
    .select({ recordId: evidenceRecordLinks.evidenceRecordId, attachMode: evidenceRecordLinks.attachMode })
    .from(evidenceRecordLinks)
    .where(and(eq(evidenceRecordLinks.ownerKind, "corp_card_usage"), eq(evidenceRecordLinks.ownerId, usageId), isNull(evidenceRecordLinks.detachedAt)));
}

async function amountLogs(usageId: string) {
  return db.select().from(actionLog).where(and(eq(actionLog.entityId, usageId), eq(actionLog.actionType, "evidence_record_amount_change")));
}

async function messageOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "(성공)";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function lineOf(pm: Viewer, execution: number): Promise<{ projectId: string; lineId: string }> {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `클라이언트-${randomUUID()}`, normalizedName: `클라이언트-${randomUUID()}` });
  const project = await createProject(pm, { clientId: client.id, teamId: await teamIdByName("기획1팀"), pmUserId: pm.id, name: `붙이기-${randomUUID().slice(0, 8)}`, startDate: "2026-09-01", endDate: "2026-12-31" });
  if (!project.id) throw new Error("프로젝트 없음");
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("1차 차수 없음");
  const lineId = randomUUID();
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: [{ id: lineId, isNew: true as const, subcategory: (await firstSelectableSubcategory()).value, itemName: "붙이기줄", vendorId: null, unitPrice: { currency: "KRW" as const, amount: execution + 500_000, fxRate: 1 }, execution: { currency: "KRW" as const, amount: execution, fxRate: 1 } }],
  });
  return { projectId: project.id, lineId };
}

describe("경영관리 → 카드 사용 붙이기(06.1-09 Task 2)", () => {
  it("합계 · 카드 다른 카드 사용에 카드 줄을 붙이면 붙임 1행(registrar) · 합계 · 카드 = 파일 값 · K 번호 그대로 · 덮기 기록 한 줄(로그 끈 주입에서도)", async () => {
    const fx = await setup();
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000 });
    const recordId = await cardRecord(fx, fx.cardB.last4, "204,100", "18,554");
    await pairByApproval(usage.id, [recordId]);

    await attachEvidenceRecord(fx.manager, { recordId, owner: { kind: "corp_card_usage", id: usage.id } }, { isActionTypeEnabled: () => Promise.resolve(false) });

    expect(await liveLinks(usage.id)).toEqual([{ recordId, attachMode: "registrar" }]);
    expect(await usageRow(usage.id)).toMatchObject({ totalAmountKrw: 204_100, corpCardId: fx.cardB.id, number: usage.number, version: usage.version + 1 });
    const logs = await amountLogs(usage.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ entity: "corp_card_usage" });
    expect(logs[0]?.detail).toMatchObject({ cardLast4Before: fx.cardA.last4, cardLast4After: fx.cardB.last4, evidenceRecordId: recordId });
  });

  it("(검토 P2-3) 후보 조건 밖(승인번호 다름 · 사용일 다름) 같은 카드 줄을 직접 실으면 거부 · 붙임 0 · 합계 그대로 / registrar S5 풀에도 없다", async () => {
    const fx = await setup();
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000 });
    const outside = await cardRecord(fx, fx.cardA.last4, "204,100", "18,555");
    const paired = await cardRecord(fx, fx.cardA.last4, "210,000", "19,091");
    await pairByApproval(usage.id, [paired]);

    const poolIds = (await listEvidencePool(fx.manager, { owner: { kind: "corp_card_usage", id: usage.id } })).items.map((item) => item.id);
    expect(poolIds).toContain(paired);
    expect(poolIds).not.toContain(outside);

    expect(await messageOf(attachEvidenceRecord(fx.manager, { recordId: outside, owner: { kind: "corp_card_usage", id: usage.id } }))).toBe("없는 증빙 · 새로 고침");
    expect(await liveLinks(usage.id)).toEqual([]);
    expect(await usageRow(usage.id)).toMatchObject({ totalAmountKrw: 200_000, version: usage.version });
  });

  it("(N-6) 영수증 기록(카드 서식 아님)은 값을 바꾸지 않고 붙는다", async () => {
    const fx = await setup();
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000 });
    const recordId = await insertRecordFixture(fx.manager, { evidenceType: "card_receipt", supplyKrw: 181_818, vatKrw: 18_182, issuedOn: USED_ON });
    await attachEvidenceRecord(fx.manager, { recordId, owner: { kind: "corp_card_usage", id: usage.id } });
    expect(await liveLinks(usage.id)).toHaveLength(1);
    expect(await usageRow(usage.id)).toMatchObject({ totalAmountKrw: 200_000, version: usage.version });
    expect(await amountLogs(usage.id)).toHaveLength(0);
  });

  it("덮으면 실행가를 넘는 카드 사용 id를 직접 실으면 잠금 뒤 `합계 {a} → {b} · 실행가 초과`로 거부 · 붙임 0 · 덮기 0", async () => {
    const fx = await setup();
    const { lineId } = await lineOf(fx.pm, 300_000);
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000, lineId });
    const recordId = await cardRecord(fx, fx.cardA.last4, "1,238,000", "112,545");
    await pairByApproval(usage.id, [recordId]);
    expect(await messageOf(attachEvidenceRecord(fx.manager, { recordId, owner: { kind: "corp_card_usage", id: usage.id } }))).toBe("합계 200,000 → 1,238,000 · 실행가 초과");
    expect(await liveLinks(usage.id)).toEqual([]);
    expect(await usageRow(usage.id)).toMatchObject({ totalAmountKrw: 200_000, version: usage.version });
  });

  it("완료 프로젝트 · 합계 다름 → `합계 {a} → {b} · 완료 프로젝트` 거부 · 붙임 0", async () => {
    const fx = await setup();
    const { projectId, lineId } = await lineOf(fx.pm, 3_000_000);
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 90_000, lineId });
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, projectId));
    const recordId = await cardRecord(fx, fx.cardA.last4, "99,000", "9,000");
    await pairByApproval(usage.id, [recordId]);
    expect(await messageOf(attachEvidenceRecord(fx.manager, { recordId, owner: { kind: "corp_card_usage", id: usage.id } }))).toBe("합계 90,000 → 99,000 · 완료 프로젝트");
    expect(await liveLinks(usage.id)).toEqual([]);
  });

  it("(P1-5) 카드 서식 기록이 이미 붙은 카드 사용 → `증빙 있음 · {K 번호}` 거부 · 붙임 그대로 1", async () => {
    const fx = await setup();
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000 });
    const first = await cardRecord(fx, fx.cardA.last4, "200,000", "18,182");
    await insertLinkFixture({ recordId: first, ownerKind: "corp_card_usage", ownerId: usage.id, attachedBy: fx.manager.id });
    const second = await cardRecord(fx, fx.cardA.last4, "200,000", "18,182");
    expect(await messageOf(attachEvidenceRecord(fx.manager, { recordId: second, owner: { kind: "corp_card_usage", id: usage.id } }))).toBe(`증빙 있음 · ${usage.number}`);
    expect(await liveLinks(usage.id)).toHaveLength(1);
  });

  it("보관된 카드 사용 · 못 보는 카드 사용 → 거부 · 붙임 0", async () => {
    const fx = await setup();
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000 });
    await db.update(corpCardUsages).set({ archivedAt: new Date(), archivedBy: fx.pm.id }).where(eq(corpCardUsages.id, usage.id));
    const recordId = await cardRecord(fx, fx.cardA.last4, "200,000", "18,182");
    expect(await messageOf(attachEvidenceRecord(fx.manager, { recordId, owner: { kind: "corp_card_usage", id: usage.id } }))).not.toBe("(성공)");
    expect(await liveLinks(usage.id)).toEqual([]);

    const narrow = await createIntakeManager("범위 좁음");
    const other = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000 });
    expect(await messageOf(attachEvidenceRecord(narrow, { recordId, owner: { kind: "corp_card_usage", id: other.id } }))).not.toBe("(성공)");
    expect(await liveLinks(other.id)).toEqual([]);
  });
});

// 카드 파일 한 줄(승인번호 · 사용일을 정해) → 그 기록 id.
async function cardRecordWith(fx: Fx, input: { last4: string; approvalNo: string; total: string; vat: string; date: string }): Promise<string> {
  const result = await registerFixtureFile(fx.manager, lotteFixture([{ 카드번호: `999900001111${input.last4}`, 승인번호: input.approvalNo, 매입금액: input.total, 부가세: input.vat, 매입일자: input.date }]));
  const [row] = await db.select({ id: evidenceRecords.id }).from(evidenceRecords).where(eq(evidenceRecords.batchId, result.batchId));
  if (!row) throw new Error("기록 없음");
  return row.id;
}

describe("S4 카드 사용 후보(06.1-09 Task 2 · PA-RELAX · DB-9 · N-6 · 카드 R3)", () => {
  it("완화 후보만 · 값 바뀜 subtitle · valueChanges · 막힌 행 맨 뒤(증빙 있음 · 실행가 초과) · 영수증만 붙은 카드 사용은 고를 수 있음 · 보관 · 범위 밖 없음", async () => {
    const fx = await setup();
    const P = approval();
    const u1 = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: "2026-04-30", totalKrw: 200_000, approvalNo: P });
    const u2 = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardB.id, usedOn: "2026-04-10", totalKrw: 204_100 });
    const u3 = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: "2026-04-10", totalKrw: 204_100 });
    const statement = await cardRecordWith(fx, { last4: fx.cardA.last4, approvalNo: approval(), total: "1,000", vat: "91", date: "2026.04.10" });
    await insertLinkFixture({ recordId: statement, ownerKind: "corp_card_usage", ownerId: u3.id, attachedBy: fx.manager.id });
    const { lineId } = await lineOf(fx.pm, 150_000);
    const u4 = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: "2026-04-20", totalKrw: 100_000, approvalNo: P, lineId });
    const u5 = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: "2026-04-21", totalKrw: 100_000, approvalNo: P });
    await db.update(corpCardUsages).set({ archivedAt: new Date(), archivedBy: fx.pm.id }).where(eq(corpCardUsages.id, u5.id));
    const u6 = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: "2026-04-10", totalKrw: 204_100 });
    const receipt = await insertRecordFixture(fx.manager, { evidenceType: "card_receipt", supplyKrw: 185_545, vatKrw: 18_555, issuedOn: "2026-04-10" });
    await insertLinkFixture({ recordId: receipt, ownerKind: "corp_card_usage", ownerId: u6.id, attachedBy: fx.manager.id });
    const recordId = await cardRecordWith(fx, { last4: fx.cardA.last4, approvalNo: P, total: "204,100", vat: "18,555", date: "2026.04.10" });

    const result = await listAttachCandidates(fx.manager, { recordId });
    const known = new Set([u1.id, u2.id, u3.id, u4.id, u5.id, u6.id]);
    const cards = result.items.filter((item) => item.kind === "corp_card_usage" && item.id !== undefined && known.has(item.id));
    const byId = new Map(cards.map((item) => [item.id, item]));
    expect(byId.has(u5.id)).toBe(false);
    expect(byId.get(u1.id)).toMatchObject({ number: u1.number, selectable: true, reason: null, subtitle: "합계 200,000 → 204,100", amountKrw: 200_000 });
    expect(byId.get(u1.id)?.valueChanges).toEqual({ total: { before: 200_000, after: 204_100 }, card: null });
    expect(byId.get(u2.id)).toMatchObject({ selectable: true, subtitle: `카드 ${fx.cardB.last4} → ${fx.cardA.last4}` });
    expect(byId.get(u6.id)).toMatchObject({ selectable: true, valueChanges: null });
    expect(byId.get(u3.id)).toMatchObject({ selectable: false, reason: `증빙 있음 · ${u3.number}` });
    expect(byId.get(u4.id)).toMatchObject({ selectable: false, reason: "합계 100,000 → 204,100 · 실행가 초과" });
    const order = result.items.map((item) => item.id);
    const lastSelectable = Math.max(...[u1, u2, u6].map((u) => order.indexOf(u.id)));
    expect(Math.min(order.indexOf(u3.id), order.indexOf(u4.id))).toBeGreaterThan(lastSelectable);

    const narrow = await createIntakeManager("범위 좁음");
    const narrowCards = (await listAttachCandidates(narrow, { recordId })).items.filter((item) => item.id !== undefined && known.has(item.id));
    expect(narrowCards).toEqual([]);
  });
});

describe("작성자 S5 카드 사용(06.1-09 Task 2 · PA-CUAUTH · E23 · DB-8)", () => {
  async function teamRecord(fx: Fx, input: { last4: string; approvalNo: string; total: string; vat: string }): Promise<string> {
    const id = await cardRecordWith(fx, { ...input, date: "2026.04.10" });
    await setRecordVisibilityFixture(id, { visibility: "team", teamId: await teamIdByName("기획1팀") });
    return id;
  }

  it("등록한 사람 → author · 풀은 같은 카드 줄만 · 합계 다른 줄은 막힌 행 · 같은 합계 붙이면 승인번호만 채움 · 값 · 기록 그대로 · 막힌 줄 직접 실으면 거부", async () => {
    const fx = await setup();
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000 });
    const same = await teamRecord(fx, { last4: fx.cardA.last4, approvalNo: approval(), total: "200,000", vat: "18,182" });
    const differ = await teamRecord(fx, { last4: fx.cardA.last4, approvalNo: approval(), total: "204,100", vat: "18,555" });
    const other = await teamRecord(fx, { last4: fx.cardB.last4, approvalNo: approval(), total: "200,000", vat: "18,182" });

    expect(await evidencePickerMode(fx.pm, { kind: "corp_card_usage", id: usage.id })).toEqual({ mode: "author" });
    const poolResult = await listEvidencePool(fx.pm, { owner: { kind: "corp_card_usage", id: usage.id } });
    const ids = poolResult.items.map((item) => item.id);
    expect(ids).toContain(same);
    expect(ids).not.toContain(other);
    expect(poolResult.items.find((item) => item.id === differ)).toMatchObject({ selectable: false, reason: "합계 200,000 → 204,100 · 붙이기는 경영관리" });
    expect(poolResult.items.find((item) => item.id === same)).toMatchObject({ selectable: true, reason: null });

    expect(await messageOf(attachEvidenceAsAuthor(fx.pm, { evidenceIds: [differ], owner: { kind: "corp_card_usage", id: usage.id } }))).toBe("합계 200,000 → 204,100 · 붙이기는 경영관리");
    expect(await liveLinks(usage.id)).toEqual([]);

    expect(await attachEvidenceAsAuthor(fx.pm, { evidenceIds: [same], owner: { kind: "corp_card_usage", id: usage.id } })).toEqual({ attached: 1 });
    expect(await liveLinks(usage.id)).toEqual([{ recordId: same, attachMode: "author" }]);
    const [record] = await db.select({ approvalNo: evidenceRecords.approvalNo }).from(evidenceRecords).where(eq(evidenceRecords.id, same));
    expect(await usageRow(usage.id)).toMatchObject({ totalAmountKrw: 200_000, corpCardId: fx.cardA.id, approvalNo: record?.approvalNo });
    expect(await amountLogs(usage.id)).toHaveLength(0);
  });

  it("(검토 P3-1) 승인번호가 이미 있는 카드 사용에 다른 승인번호 줄을 붙이면 붙임 1 · 승인번호는 덮지 않는다(비어 있을 때만 채움)", async () => {
    const fx = await setup();
    const kept = approval();
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000, approvalNo: kept });
    const line = await teamRecord(fx, { last4: fx.cardA.last4, approvalNo: approval(), total: "200,000", vat: "18,182" });
    expect(await attachEvidenceAsAuthor(fx.pm, { evidenceIds: [line], owner: { kind: "corp_card_usage", id: usage.id } })).toEqual({ attached: 1 });
    expect(await usageRow(usage.id)).toMatchObject({ approvalNo: kept, version: usage.version });
  });

  it("구매에서 생긴 카드 사용의 등록한 사람 · 남(경영관리 아닌 같은 팀 사람) → none · 직접 붙이기 거부", async () => {
    const fx = await setup();
    const { projectId, lineId } = await lineOf(fx.pm, 3_000_000);
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000, lineId });
    const [request] = await db
      .insert(purchaseRequests)
      .values({ number: `26001-C${randomUUID().slice(0, 8)}`, linkKind: "quote_line", projectId, quoteLineId: lineId, requestedBy: fx.pm.id, itemName: "현수막", estimateAmountKrw: 200_000 })
      .returning({ id: purchaseRequests.id });
    if (!request) throw new Error("구매 요청 없음");
    await db.update(corpCardUsages).set({ registeredVia: "purchase", purchaseRequestId: request.id }).where(eq(corpCardUsages.id, usage.id));
    const recordId = await teamRecord(fx, { last4: fx.cardA.last4, approvalNo: approval(), total: "200,000", vat: "18,182" });
    expect(await evidencePickerMode(fx.pm, { kind: "corp_card_usage", id: usage.id })).toEqual({ mode: "none" });
    expect(await messageOf(attachEvidenceAsAuthor(fx.pm, { evidenceIds: [recordId], owner: { kind: "corp_card_usage", id: usage.id } }))).not.toBe("(성공)");

    const mate = await makePerson("같은팀", DEFAULT_ROLE_ID, "기획1팀");
    const plain = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000 });
    expect(await evidencePickerMode(mate, { kind: "corp_card_usage", id: plain.id })).toEqual({ mode: "none" });
    expect(await messageOf(attachEvidenceAsAuthor(mate, { evidenceIds: [recordId], owner: { kind: "corp_card_usage", id: plain.id } }))).not.toBe("(성공)");
    expect(await liveLinks(plain.id)).toEqual([]);
  });

  it("완료 프로젝트 줄 카드 사용 — 등록한 사람(대리 등록 권한 없음)은 none · 경영관리는 registrar", async () => {
    const fx = await setup();
    const { projectId, lineId } = await lineOf(fx.pm, 3_000_000);
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000, lineId });
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, projectId));
    expect(await evidencePickerMode(fx.pm, { kind: "corp_card_usage", id: usage.id })).toEqual({ mode: "none" });
    expect(await evidencePickerMode(fx.manager, { kind: "corp_card_usage", id: usage.id })).toEqual({ mode: "registrar" });
  });
});

describe("경영관리 카드 사용 붙이기 동시성(06.1-09 · 잠금 순서 견적 줄 → 카드 사용 → 증빙 행 → 붙임)", () => {
  it("두 경영관리가 같은 카드 사용에 카드 줄 둘을 동시에 붙임 — 둘째는 첫째 커밋까지 기다린 뒤 거부 · 붙임 1 · 덮기 기록 1 · 교착 없음", async () => {
    const fx = await setup();
    const second = await createIntakeManager("경영관리2", { payments: true });
    if (!second.roleId) throw new Error("계급 없음");
    for (const infoItem of ["card_usage.value", "card_usage.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: second.roleId, infoItem, visible: true });
    const { lineId } = await lineOf(fx.pm, 3_000_000);
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000, lineId });
    const r1 = await cardRecord(fx, fx.cardA.last4, "204,100", "18,555");
    const r2 = await cardRecord(fx, fx.cardA.last4, "210,000", "19,091");
    await pairByApproval(usage.id, [r1, r2]);

    const held = deferred();
    const reached = deferred();
    const first = attachEvidenceRecord(fx.manager, { recordId: r1, owner: { kind: "corp_card_usage", id: usage.id } }, {
      afterLock: async () => {
        reached.resolve();
        await held.promise;
      },
    });
    await reached.promise;
    const later = messageOf(attachEvidenceRecord(second, { recordId: r2, owner: { kind: "corp_card_usage", id: usage.id } }));
    await waitForLockWaiter(pool);
    held.resolve();
    await first;
    expect(await later).not.toBe("(성공)");
    expect(await liveLinks(usage.id)).toEqual([{ recordId: r1, attachMode: "registrar" }]);
    expect(await amountLogs(usage.id)).toHaveLength(1);
    expect(await usageRow(usage.id)).toMatchObject({ totalAmountKrw: 204_100 });
  });
});

describe("카드 사용 증빙 종류에서 개인카드 전표 빠짐(06.1-09 Task 3 · 카드 R6 · PA-R6-CARD)", () => {
  it("private_to_owner 종류가 켜져 있어도 카드 사용 선택지에 없고 그 값으로 등록하면 거부", async () => {
    const fx = await setup();
    await db.update(codeItems).set({ active: true }).where(eq(codeItems.value, "personal_card_receipt"));
    try {
      const options = await cardUsageFormOptions(fx.pm, USED_ON);
      expect(options.evidenceTypes.map((option) => option.value)).not.toContain("personal_card_receipt");
      expect(options.evidenceTypes.map((option) => option.value)).toContain("card_receipt");
      expect(await messageOf(createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 10_000, evidenceTypeCode: "personal_card_receipt" }))).not.toBe("(성공)");
    } finally {
      await db.update(codeItems).set({ active: false }).where(eq(codeItems.value, "personal_card_receipt"));
    }
  });
});

// 06.1-09 Task 3 — S2 행 행동 배타(E5 · DB-9 · PA-ALLBLOCKED · C2)와 M10 표식(파일이 카드를 바꾼 붙임).
describe("S2 행 행동 배타 · M10 표식(06.1-09 Task 3)", () => {
  const won = (n: number) => n.toLocaleString("en-US");
  const total = () => 300_000 + Math.floor(Math.random() * 600_000);

  async function rowOf(viewer: Viewer, id: string) {
    const [row] = await listEvidenceRecordsByIds(viewer, [id]);
    if (!row) throw new Error("행 없음");
    return row;
  }

  async function lineRecord(fx: Fx, input: { last4: string; approvalNo?: string; total: number; date: string }): Promise<string> {
    return cardRecordWith(fx, { last4: input.last4, approvalNo: input.approvalNo ?? approval(), total: won(input.total), vat: won(Math.floor(input.total / 11)), date: input.date });
  }

  it("완화 후보 0 → 대리 등록만 / 고를 수 있는 후보 → 붙이기만 / 전부 막힘 → 둘 다 없음 + 1위 이유 / 대리 등록 권한 없음 · 보관 → canProxy 거짓", async () => {
    const fx = await setup();
    if (!fx.manager.roleId) throw new Error("계급 없음");
    await upsertPermission(SYSTEM_VIEWER, { roleId: fx.manager.roleId, menu: "cards.proxy", action: "write", allowed: true });

    const none = await lineRecord(fx, { last4: fx.cardA.last4, total: total(), date: "2026.03.03" });
    expect(await rowOf(fx.manager, none)).toMatchObject({ canProxy: true, canAttach: false, actionBlockedReason: null });

    const A1 = approval();
    await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: "2026-03-20", totalKrw: 100_000, approvalNo: A1 });
    const pickable = await lineRecord(fx, { last4: fx.cardA.last4, approvalNo: A1, total: total(), date: "2026.03.04" });
    expect(await rowOf(fx.manager, pickable)).toMatchObject({ canProxy: false, canAttach: true, actionBlockedReason: null });

    const A2 = approval();
    const held = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: "2026-03-21", totalKrw: 100_000, approvalNo: A2 });
    const statement = await lineRecord(fx, { last4: fx.cardA.last4, total: total(), date: "2026.03.01" });
    await insertLinkFixture({ recordId: statement, ownerKind: "corp_card_usage", ownerId: held.id, attachedBy: fx.manager.id });
    const blocked = await lineRecord(fx, { last4: fx.cardA.last4, approvalNo: A2, total: total(), date: "2026.03.05" });
    expect(await rowOf(fx.manager, blocked)).toMatchObject({ canProxy: false, canAttach: false, actionBlockedReason: `증빙 있음 · ${held.number}` });

    const noProxy = await createIntakeManager("대리 없음", { payments: true });
    expect(await rowOf(noProxy, none)).toMatchObject({ canProxy: false, canAttach: false, actionBlockedReason: null });

    await db.update(evidenceRecords).set({ archivedAt: new Date(), archivedBy: fx.manager.id }).where(eq(evidenceRecords.id, none));
    expect(await rowOf(fx.manager, none)).toMatchObject({ canProxy: false, canAttach: false, actionBlockedReason: null });
  });

  it("(M10) 1단계 카드 다른 짝 · S4 카드 다른 붙임 → cardReplaced 참(기록 정리 뒤에도) · 2단계 같은 카드 · 뗀 뒤 → 거짓", async () => {
    const fx = await setup();
    const M1 = approval();
    const tM = total();
    const stepOne = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: "2026-03-10", totalKrw: tM, approvalNo: M1 });
    const replaced = await lineRecord(fx, { last4: fx.cardB.last4, approvalNo: M1, total: tM, date: "2026.03.10" });
    expect(await rowOf(fx.manager, replaced)).toMatchObject({ attachedKind: "corp_card_usage", attachedNumber: stepOne.number, cardReplaced: true });
    await db.update(actionLog).set({ prunedAt: new Date(), prunedBy: fx.manager.id }).where(eq(actionLog.entityId, stepOne.id));
    expect((await rowOf(fx.manager, replaced)).cardReplaced).toBe(true);

    const tN = total();
    const stepTwo = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: "2026-03-11", totalKrw: tN });
    const same = await lineRecord(fx, { last4: fx.cardA.last4, total: tN, date: "2026.03.11" });
    expect(await rowOf(fx.manager, same)).toMatchObject({ attachedKind: "corp_card_usage", attachedNumber: stepTwo.number, cardReplaced: false });

    const s4 = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000 });
    const s4Record = await cardRecord(fx, fx.cardB.last4, "204,100", "18,554");
    await pairByApproval(s4.id, [s4Record]);
    await attachEvidenceRecord(fx.manager, { recordId: s4Record, owner: { kind: "corp_card_usage", id: s4.id } });
    expect((await rowOf(fx.manager, s4Record)).cardReplaced).toBe(true);
    await detachLiveLinksForOwner(fx.manager, { ownerKind: "corp_card_usage", ownerId: s4.id, reason: "카드 사용 삭제" }, db);
    expect(await rowOf(fx.manager, s4Record)).toMatchObject({ attachedKind: null, cardReplaced: false });
  });
});

// 06.1-09 Task 3 S8 — 대리 등록: 짝 없는 카드 줄(완화 후보 0)에서 카드 사용을 만들고 그 줄을 한 트랜잭션에 붙인다(C-F14 · PA-S8-KEY · PA-S8-RACE · E5 · C2).
describe("S8 대리 등록(06.1-09 Task 3)", () => {
  const won = (n: number) => n.toLocaleString("en-US");
  const total = () => 300_000 + Math.floor(Math.random() * 600_000);
  const day = () => `2026.03.${String(1 + Math.floor(Math.random() * 27)).padStart(2, "0")}`;

  async function proxyFx(): Promise<Fx> {
    const fx = await setup();
    if (!fx.manager.roleId) throw new Error("계급 없음");
    await upsertPermission(SYSTEM_VIEWER, { roleId: fx.manager.roleId, menu: "cards.proxy", action: "write", allowed: true });
    return fx;
  }

  async function lonelyLine(fx: Fx, approvalNo = approval()): Promise<{ id: string; total: number; date: string; approvalNo: string }> {
    const t = total();
    const date = day();
    const id = await cardRecordWith(fx, { last4: fx.cardA.last4, approvalNo, total: won(t), vat: won(Math.floor(t / 11)), date });
    return { id, total: t, date: date.replaceAll(".", "-"), approvalNo };
  }

  async function usagesOn(cardId: string) {
    return db.select({ id: corpCardUsages.id }).from(corpCardUsages).where(eq(corpCardUsages.corpCardId, cardId));
  }

  const team = { linkKind: "team_cost" as const, usedByUserId: null, memo: null };

  it("미리 채움 = 파일 값 · 저장하면 카드 사용(K 번호 · proxy · 파일 값) + 붙임(registrar) 한 번 · 같은 키 다시 보내면 같은 행", async () => {
    const fx = await proxyFx();
    const line = await lonelyLine(fx);
    expect(await cardUsagePrefillFromEvidence(fx.manager, line.id)).toMatchObject({ corpCardId: fx.cardA.id, usedOn: line.date, totalKrw: line.total, evidenceTypeCode: "card_receipt" });
    expect(await cardUsageFormDefaults(fx.manager, "2026-10-19", { prefill: { corpCardId: fx.cardA.id, usedOn: line.date } })).toMatchObject({ corpCardId: fx.cardA.id, usedOn: line.date });

    const key = randomUUID();
    const created = await createCardUsageFromEvidence(fx.manager, { evidenceId: line.id, chosen: team, idempotencyKey: key });
    const row = await usageRow(created.id);
    expect(row).toMatchObject({ corpCardId: fx.cardA.id, usedOn: line.date, totalAmountKrw: line.total, registeredVia: "proxy", usedByUserId: fx.pm.id, registeredBy: fx.manager.id, approvalNo: line.approvalNo, merchantVendorId: null });
    expect(row.number).toMatch(/-K\d{4}$/);
    expect(await liveLinks(created.id)).toEqual([{ recordId: line.id, attachMode: "registrar" }]);

    const again = await createCardUsageFromEvidence(fx.manager, { evidenceId: line.id, chosen: team, idempotencyKey: key });
    expect(again.id).toBe(created.id);
    expect(await usagesOn(fx.cardA.id)).toHaveLength(1);
    expect(await liveLinks(created.id)).toHaveLength(1);
    expect(await cardUsagePrefillFromEvidence(fx.manager, line.id)).toBeNull();
  });

  it("(검토 P2-2) 금액 보기(evidence.amount · card_usage.amount) 중 하나라도 없으면 → 행 대리 등록 없음 · 미리 채움 null · 저장 거부(권리 없음) · 카드 사용 0행", async () => {
    for (const hidden of ["evidence.amount", "card_usage.amount"]) {
      const fx = await proxyFx();
      if (!fx.manager.roleId) throw new Error("계급 없음");
      const line = await lonelyLine(fx);
      await upsertVisibility(SYSTEM_VIEWER, { roleId: fx.manager.roleId, infoItem: hidden, visible: false });
      const [row] = await listEvidenceRecordsByIds(fx.manager, [line.id]);
      expect(row?.canProxy).toBe(false);
      expect(await cardUsagePrefillFromEvidence(fx.manager, line.id)).toBeNull();
      expect(await messageOf(createCardUsageFromEvidence(fx.manager, { evidenceId: line.id, chosen: team, idempotencyKey: randomUUID() }))).toBe("카드 사용 수정 권리 없음");
      expect(await usagesOn(fx.cardA.id)).toEqual([]);
    }
  });

  it("대리 등록 권한 없음 · 증빙 등록 권한 없음 → 미리 채움 null · 저장 거부 · 카드 사용 0행", async () => {
    const fx = await setup();
    const line = await lonelyLine(fx);
    expect(await cardUsagePrefillFromEvidence(fx.manager, line.id)).toBeNull();
    expect(await messageOf(createCardUsageFromEvidence(fx.manager, { evidenceId: line.id, chosen: team, idempotencyKey: randomUUID() }))).not.toBe("(성공)");
    expect(await messageOf(createCardUsageFromEvidence(fx.pm, { evidenceId: line.id, chosen: team, idempotencyKey: randomUUID() }))).not.toBe("(성공)");
    expect(await usagesOn(fx.cardA.id)).toEqual([]);
  });

  it("(C2) 보관 증빙 → 미리 채움 null · 저장 거부 / 사전 판독 뒤 보관 → 잠금 뒤 재검사 거부 · 카드 사용 0행(롤백)", async () => {
    const fx = await proxyFx();
    const archived = await lonelyLine(fx);
    await db.update(evidenceRecords).set({ archivedAt: new Date(), archivedBy: fx.manager.id }).where(eq(evidenceRecords.id, archived.id));
    expect(await cardUsagePrefillFromEvidence(fx.manager, archived.id)).toBeNull();
    expect(await messageOf(createCardUsageFromEvidence(fx.manager, { evidenceId: archived.id, chosen: team, idempotencyKey: randomUUID() }))).not.toBe("(성공)");

    const late = await lonelyLine(fx);
    const message = await messageOf(
      createCardUsageFromEvidence(fx.manager, { evidenceId: late.id, chosen: team, idempotencyKey: randomUUID() }, {
        afterPreRead: async () => {
          await db.update(evidenceRecords).set({ archivedAt: new Date(), archivedBy: fx.manager.id }).where(eq(evidenceRecords.id, late.id));
        },
      }),
    );
    expect(message).toBe("보관됨");
    expect(await usagesOn(fx.cardA.id)).toEqual([]);
  });

  it("(E5) 완화 후보가 있으면 미리 채움 null · 사전 판독 뒤 같은 승인번호 카드 사용이 생기면 `카드 사용 있음 · 붙이기로` · 새 카드 사용 0행", async () => {
    const fx = await proxyFx();
    const P = approval();
    const line = await lonelyLine(fx, P);
    const message = await messageOf(
      createCardUsageFromEvidence(fx.manager, { evidenceId: line.id, chosen: team, idempotencyKey: randomUUID() }, {
        afterPreRead: async () => {
          await createCardUsageFixture(fx.pm, { corpCardId: fx.cardB.id, usedOn: "2026-04-01", totalKrw: 10_000, approvalNo: P });
        },
      }),
    );
    expect(message).toBe("카드 사용 있음 · 붙이기로");
    expect(await usagesOn(fx.cardA.id)).toEqual([]);
    expect(await cardUsagePrefillFromEvidence(fx.manager, line.id)).toBeNull();
    expect(await messageOf(createCardUsageFromEvidence(fx.manager, { evidenceId: line.id, chosen: team, idempotencyKey: randomUUID() }))).toBe("카드 사용 있음 · 붙이기로");
  });

  it("(N1) 그새 다른 문서에 붙음 → `다른 사람이 먼저 붙임 · {문서 번호}`(꼬리 없음) · 저장 전에 이미 붙음도 같은 글 · 카드 사용 0행", async () => {
    const fx = await proxyFx();
    const expense = await createInReviewExpenseFixture(await setupExpenseProject());
    const line = await lonelyLine(fx);
    const message = await messageOf(
      createCardUsageFromEvidence(fx.manager, { evidenceId: line.id, chosen: team, idempotencyKey: randomUUID() }, {
        afterPreRead: async () => {
          await insertLinkFixture({ recordId: line.id, ownerId: expense.expenseId, attachedBy: fx.manager.id });
        },
      }),
    );
    expect(message).toBe(`다른 사람이 먼저 붙임 · ${expense.number}`);
    expect(await usagesOn(fx.cardA.id)).toEqual([]);
    expect(await messageOf(createCardUsageFromEvidence(fx.manager, { evidenceId: line.id, chosen: team, idempotencyKey: randomUUID() }))).toBe(`다른 사람이 먼저 붙임 · ${expense.number}`);
    expect(await usagesOn(fx.cardA.id)).toEqual([]);
  });

  it("(P2-C3) 같은 키 동시 저장 — 둘째는 첫째 커밋까지 기다린 뒤 같은 카드 사용 id · 카드 사용 1행 · 붙임 1행 · 원시 DB 오류 0", async () => {
    const fx = await proxyFx();
    const line = await lonelyLine(fx);
    const key = randomUUID();
    const held = deferred();
    const reached = deferred();
    const first = createCardUsageFromEvidence(fx.manager, { evidenceId: line.id, chosen: team, idempotencyKey: key }, {
      afterCreate: async () => {
        reached.resolve();
        await held.promise;
      },
    });
    await reached.promise;
    const second = createCardUsageFromEvidence(fx.manager, { evidenceId: line.id, chosen: team, idempotencyKey: key });
    await waitForLockWaiter(pool);
    held.resolve();
    const [a, b] = await Promise.all([first, second]);
    expect(b.id).toBe(a.id);
    expect(await usagesOn(fx.cardA.id)).toHaveLength(1);
    expect(await liveLinks(a.id)).toEqual([{ recordId: line.id, attachMode: "registrar" }]);
  });
});
