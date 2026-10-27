import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db, pool } from "@/db/client";
import { actionLog, codeItems, corpCardUsages, evidenceRecordLinks, evidenceRecords, projects, purchaseRequests, settingsHistorized, users } from "@/db/schema";
import { cardOverwriteSplit, cardSlipNotFound, cardUsageFormDefaults, cardUsageFormOptions, cardUsageReadScope, loadCardOverwriteBasis } from "@/domain/corp-card-usages";
import { cardUsedOnError } from "@/domain/corp-card-usages/amounts";
import { createCorpCard } from "@/domain/corp-cards";
import { attachEvidenceAsAuthor, attachEvidenceRecord, cardUsagePrefillFromEvidence, createCardUsageFromEvidence, detachEvidenceRecord, judgeCardCandidates, listAttachCandidates } from "@/domain/evidence-records/attach";
import { listEvidenceRecordsByIds } from "@/domain/evidence-records";
import { evidencePickerMode, listEvidencePool } from "@/domain/evidence-records/pool";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { TAX_VAT_RATE } from "@/domain/settings/keys";
import { addHistorizedValue } from "@/domain/settings/registry";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { detachLiveLinksForOwner } from "@/repositories/evidence-record-links";
import { findCardUsageOverwriteFacts } from "@/repositories/corp-card-usages";
import { findRecordForScope } from "@/repositories/evidence-records";
import { evidenceScopeFor } from "@/domain/permissions/scope-for";
import { insertMembership } from "@/repositories/team-memberships";
import { insertVendor } from "@/repositories/vendors";
import { bcFixture, lotteFixture } from "@/test/fixtures/evidence-import/build";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { makePerson, teamIdByName } from "./approvals-fixtures";
import { createCardUsageFixture, createInReviewExpenseFixture, createIntakeManager, insertLinkFixture, insertRecordFixture, registerFixtureFile, setRecordVisibilityFixture } from "./fixtures/evidence";
import { setupExpenseProject } from "./fixtures/expenses";
import { deferred, waitForLockWaiter } from "./lock-race";

// 07.1-04 PE6: 덮기 막힘 재료 읽기 횟수를 센다 — 동작은 원래 함수 그대로(감싸기만).
vi.mock("@/repositories/corp-card-usages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/repositories/corp-card-usages")>();
  return { ...actual, findCardUsageOverwriteFacts: vi.fn(actual.findCardUsageOverwriteFacts) };
});

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

async function lotteCard(holderUserId: string, issuer = "롯데카드"): Promise<{ id: string; last4: string }> {
  const last4 = nextLast4();
  const card = await createCorpCard(SYSTEM_VIEWER, { issuer, numberLast4: last4, label: `붙이기 ${last4}`, kind: "personal", holderUserId });
  if (!card.id) throw new Error("카드 id 없음");
  return { id: card.id, last4 };
}

type Fx = { pm: Viewer; manager: Viewer; cardA: { id: string; last4: string }; cardB: { id: string; last4: string } };

// issuer: 카드 발급사 — 07.1-04 검토 P1 뒤 사용일 덮기는 날짜 칸이 사용(승인)일인 서식(비씨 · 신한)만이라 그 시험은 비씨카드로 잰다.
async function setup(issuer = "롯데카드"): Promise<Fx> {
  const pm = await makePerson("붙이기PM", DEFAULT_ROLE_ID, "기획1팀");
  // 지급 권한(expenses.payments) = 06 카드 사용 목록 전부 범위 — 경영관리 S4가 읽는 범위.
  const manager = await createIntakeManager("경영관리", { payments: true });
  if (!manager.roleId) throw new Error("계급 없음");
  for (const infoItem of ["card_usage.value", "card_usage.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: manager.roleId, infoItem, visible: true });
  return { pm, manager, cardA: await lotteCard(pm.id, issuer), cardB: await lotteCard(pm.id, issuer) };
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

async function liveLinkIdOf(recordId: string): Promise<string> {
  const [row] = await db.select({ id: evidenceRecordLinks.id }).from(evidenceRecordLinks).where(and(eq(evidenceRecordLinks.evidenceRecordId, recordId), isNull(evidenceRecordLinks.detachedAt)));
  if (!row) throw new Error("붙임 없음");
  return row.id;
}

function approvalChangesOf(logs: readonly { detail: unknown }[]): unknown[] {
  return logs.map((log) => (log.detail as { changes?: unknown }).changes);
}

// 04-29부터 부가세 20%(그 전 10%) — settings_historized는 키 · 날짜가 유일이라 한 번만 넣는다(시험 차례와 무관하게).
async function vatTwentyFrom0429(): Promise<void> {
  const [row] = await db
    .select({ id: settingsHistorized.id })
    .from(settingsHistorized)
    .where(and(eq(settingsHistorized.key, TAX_VAT_RATE.key), eq(settingsHistorized.effectiveFrom, "2026-04-29")));
  if (!row) await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: "2026-04-29", value: 0.2 }, { now: new Date("2026-04-01T00:00:00+09:00") });
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
  // PR #305 검토 F2 뒤: 승인번호 갈래는 같은 카드만이라 카드는 같은 사용일 ∧ 합계 갈래로, 합계는 같은 카드 승인번호 갈래로 따로 덮는다.
  it("카드 다른(같은 사용일 · 합계) · 합계 다른(같은 카드 · 승인번호) 카드 사용에 카드 줄을 붙이면 붙임 1행(registrar) · 카드 · 합계 = 파일 값 · K 번호 그대로 · 덮기 기록 한 줄(로그 끈 주입에서도)", async () => {
    const fx = await setup();
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000 });
    const recordId = await cardRecordWith(fx, { last4: fx.cardB.last4, approvalNo: approval(), total: "200,000", vat: "18,182", date: "2026.04.30" });

    await attachEvidenceRecord(fx.manager, { recordId, owner: { kind: "corp_card_usage", id: usage.id } }, { isActionTypeEnabled: () => Promise.resolve(false) });

    expect(await liveLinks(usage.id)).toEqual([{ recordId, attachMode: "registrar" }]);
    expect(await usageRow(usage.id)).toMatchObject({ totalAmountKrw: 200_000, corpCardId: fx.cardB.id, number: usage.number, version: usage.version + 1 });
    const totalUsage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000 });
    const totalRecord = await cardRecord(fx, fx.cardA.last4, "204,100", "18,554");
    await pairByApproval(totalUsage.id, [totalRecord]);
    await attachEvidenceRecord(fx.manager, { recordId: totalRecord, owner: { kind: "corp_card_usage", id: totalUsage.id } }, { isActionTypeEnabled: () => Promise.resolve(false) });
    expect(await usageRow(totalUsage.id)).toMatchObject({ totalAmountKrw: 204_100, corpCardId: fx.cardA.id, number: totalUsage.number, version: totalUsage.version + 1 });
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

  it("(Codex P2) 카드 서식이 아닌 기록 id를 카드 사용에 직접 실으면 거부 · 붙임 0 · 여러 장 반복해도 0 · 값 · 기록 그대로", async () => {
    const fx = await setup();
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000 });
    // 같은 사용일 · 합계 — S4 후보 조건(isRelaxedHit)은 맞아도 카드 서식이 아니면 후보가 아니다(UI 후보 · registrar 풀은 같은 카드 줄만).
    for (const supplyKrw of [181_818, 181_818]) {
      const recordId = await insertRecordFixture(fx.manager, { evidenceType: "card_receipt", supplyKrw, vatKrw: 18_182, issuedOn: USED_ON });
      expect(await messageOf(attachEvidenceRecord(fx.manager, { recordId, owner: { kind: "corp_card_usage", id: usage.id } }))).toBe("없는 증빙 · 새로 고침");
    }
    expect(await liveLinks(usage.id)).toEqual([]);
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

// 비씨 이용내역 한 줄(승인일자 = 사용일 · `YYYY-MM-DD`) — overseas면 해외 이용 줄(확인 필요).
async function bcRecordWith(fx: Fx, input: { last4: string; approvalNo: string; total: string; vat: string; date: string; overseas?: boolean }): Promise<string> {
  const result = await registerFixtureFile(
    fx.manager,
    bcFixture([{ 카드번호: `9430-0000-0000-${input.last4}`, 승인번호: input.approvalNo, 승인일자: input.date, "거래금액(원화)": input.total, 부가세: input.vat, 국내외사용구분: input.overseas ? "해외" : "국내" }]),
    "비씨.xls",
  );
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
    // PR #305 재검토: 채운 승인번호는 금액 변경 로그(changes = approvalNo 한 칸)로 남는다 — 떼기가 그 로그로 되돌린다.
    expect(approvalChangesOf(await amountLogs(usage.id))).toEqual([{ approvalNo: [null, record?.approvalNo] }]);
  });

  it("(PR #305 재검토) 작성자 붙이기가 채운 승인번호 — 떼면 비운다 · 다른 승인번호 줄을 다시 붙이면 그 번호로 채운다", async () => {
    const fx = await setup();
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000 });
    const firstNo = approval();
    const secondNo = approval();
    const first = await teamRecord(fx, { last4: fx.cardA.last4, approvalNo: firstNo, total: "200,000", vat: "18,182" });
    const second = await teamRecord(fx, { last4: fx.cardA.last4, approvalNo: secondNo, total: "200,000", vat: "18,182" });
    const owner = { kind: "corp_card_usage" as const, id: usage.id };

    expect(await attachEvidenceAsAuthor(fx.pm, { evidenceIds: [first], owner })).toEqual({ attached: 1 });
    expect((await usageRow(usage.id)).approvalNo).toBe(firstNo);
    expect(await detachEvidenceRecord(fx.manager, { linkId: await liveLinkIdOf(first), reason: "다른 건 증빙" })).toEqual({ detached: true });
    expect((await usageRow(usage.id)).approvalNo).toBeNull();
    expect(approvalChangesOf(await amountLogs(usage.id))).toEqual([{ approvalNo: [null, firstNo] }, { approvalNo: [firstNo, null] }]);

    expect(await attachEvidenceAsAuthor(fx.pm, { evidenceIds: [second], owner })).toEqual({ attached: 1 });
    expect(await liveLinks(usage.id)).toEqual([{ recordId: second, attachMode: "author" }]);
    expect((await usageRow(usage.id)).approvalNo).toBe(secondNo);
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

    // S4 카드 다른 붙임은 같은 사용일 ∧ 합계 갈래로(PR #305 검토 F2 — 승인번호 갈래는 같은 카드만).
    const s4 = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000 });
    const s4Record = await cardRecordWith(fx, { last4: fx.cardB.last4, approvalNo: approval(), total: "200,000", vat: "18,182", date: "2026.04.30" });
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

  it("(PR #305 재검토) 대리 등록 붙임이 채운 승인번호 — 금액 변경 로그를 남기고 · 떼면 비운다 · 같은 날 · 합계의 다른 승인번호 줄을 붙이면 그 번호로 채운다", async () => {
    const fx = await proxyFx();
    const line = await lonelyLine(fx);
    const created = await createCardUsageFromEvidence(fx.manager, { evidenceId: line.id, chosen: team, idempotencyKey: randomUUID() });
    expect((await usageRow(created.id)).approvalNo).toBe(line.approvalNo);
    expect(approvalChangesOf(await amountLogs(created.id))).toEqual([{ approvalNo: [null, line.approvalNo] }]);
    // 떼기 전에 올린다 — 카드 명세가 붙어 있고 승인번호가 달라 등록 대사가 붙이지 않는다(사람이 고르는 길).
    const secondNo = approval();
    const second = await cardRecordWith(fx, { last4: fx.cardA.last4, approvalNo: secondNo, total: won(line.total), vat: won(Math.floor(line.total / 11)), date: line.date.replaceAll("-", ".") });

    expect(await detachEvidenceRecord(fx.manager, { linkId: await liveLinkIdOf(line.id), reason: "다른 건 증빙" })).toEqual({ detached: true });
    expect((await usageRow(created.id)).approvalNo).toBeNull();

    await attachEvidenceRecord(fx.manager, { recordId: second, owner: { kind: "corp_card_usage", id: created.id } });
    expect(await liveLinks(created.id)).toEqual([{ recordId: second, attachMode: "registrar" }]);
    expect((await usageRow(created.id)).approvalNo).toBe(secondNo);
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
    let injected = "";
    const message = await messageOf(
      createCardUsageFromEvidence(fx.manager, { evidenceId: line.id, chosen: team, idempotencyKey: randomUUID() }, {
        afterPreRead: async () => {
          // 같은 카드 ∧ 같은 승인번호(PR #305 검토 F2 — 승인번호 후보는 같은 카드만).
          injected = (await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: "2026-04-01", totalKrw: 10_000, approvalNo: P })).id;
        },
      }),
    );
    expect(message).toBe("카드 사용 있음 · 붙이기로");
    expect(await usagesOn(fx.cardA.id)).toEqual([{ id: injected }]);
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

  // 07.1-04 PE4 ⓐ(이미 맞음 — 회귀): 두 탭이 다른 키로 같은 증빙에서 카드 사용을 동시에 만들면 하나만 서고 붙임도 하나.
  it("(PE4 ⓐ) 다른 키 동시 저장 — 카드 사용 1행 · 붙임 1행 · 진 쪽은 거부(원시 DB 오류 0)", async () => {
    const fx = await proxyFx();
    const line = await lonelyLine(fx);
    const held = deferred();
    const reached = deferred();
    const first = createCardUsageFromEvidence(fx.manager, { evidenceId: line.id, chosen: team, idempotencyKey: randomUUID() }, {
      afterCreate: async () => {
        reached.resolve();
        await held.promise;
      },
    }).then(
      (usage) => ({ ok: true as const, id: usage.id }),
      (error: unknown) => ({ ok: false as const, message: error instanceof Error ? error.message : String(error) }),
    );
    await reached.promise;
    // 둘째는 첫째 트랜잭션이 쥔 행(카드 사용 번호 차례)에서 기다린다 — 기다리는 것을 본 뒤 첫째를 놓는다.
    const second = createCardUsageFromEvidence(fx.manager, { evidenceId: line.id, chosen: team, idempotencyKey: randomUUID() }).then(
      (usage) => ({ ok: true as const, id: usage.id }),
      (error: unknown) => ({ ok: false as const, message: error instanceof Error ? error.message : String(error) }),
    );
    await waitForLockWaiter(pool);
    held.resolve();
    const results = await Promise.all([first, second]);
    const winners = results.filter((result) => result.ok);
    expect(winners).toHaveLength(1);
    const loser = results.find((result) => !result.ok);
    expect(loser && !loser.ok ? loser.message : "").toBe("카드 사용 있음 · 붙이기로");
    const usages = await usagesOn(fx.cardA.id);
    expect(usages).toHaveLength(1);
    const winner = winners[0];
    expect(winner?.ok ? winner.id : null).toBe(usages[0]?.id);
    expect(await liveLinks(usages[0]?.id ?? "")).toEqual([{ recordId: line.id, attachMode: "registrar" }]);
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

  it("(cso D1) 같은 키로 다른 증빙 둘 — 사전 판독 뒤 A(카드 a)가 먼저 커밋하면 B(카드 b · 다른 합계)는 `다른 저장이 먼저 됨 · 새로 고침` · A의 카드 사용에 붙지 않는다", async () => {
    const fx = await proxyFx();
    const a = await lonelyLine(fx);
    const tb = total();
    const b = await cardRecordWith(fx, { last4: fx.cardB.last4, approvalNo: approval(), total: won(tb), vat: won(Math.floor(tb / 11)), date: day() });
    const key = randomUUID();
    let usageOfA = "";
    const message = await messageOf(
      createCardUsageFromEvidence(fx.manager, { evidenceId: b, chosen: team, idempotencyKey: key }, {
        afterPreRead: async () => {
          usageOfA = (await createCardUsageFromEvidence(fx.manager, { evidenceId: a.id, chosen: team, idempotencyKey: key })).id;
        },
      }),
    );
    expect(message).toBe("다른 저장이 먼저 됨 · 새로 고침");
    expect(await liveLinks(usageOfA)).toEqual([{ recordId: a.id, attachMode: "registrar" }]);
    expect(await usageRow(usageOfA)).toMatchObject({ corpCardId: fx.cardA.id, totalAmountKrw: a.total });
    expect(await usagesOn(fx.cardB.id)).toEqual([]);
  });

  it("(검토 P3-1) 경합 재시도는 카드 사용 → 증빙 행 차례로 잠근다 — 다른 연결이 카드 사용을 쥔 동안 증빙 행은 비어 있다(NOWAIT) · 풀린 뒤 붙임 1", async () => {
    const fx = await proxyFx();
    const line = await lonelyLine(fx);
    const key = randomUUID();
    const holder = await pool.connect();
    let winner = "";
    try {
      const run = createCardUsageFromEvidence(fx.manager, { evidenceId: line.id, chosen: team, idempotencyKey: key }, {
        // 사전 판독 뒤에 같은 줄 값 · 같은 키 · 같은 등록자의 카드 사용을 만들어 둔다(앞서 만들면 완화 후보라 대리 등록이 막힌다) → 본 tx는 23505 → 재시도.
        afterPreRead: async () => {
          winner = (await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: line.date, totalKrw: line.total })).id;
          await db.update(corpCardUsages).set({ idempotencyKey: key, registeredBy: fx.manager.id, registeredVia: "proxy" }).where(eq(corpCardUsages.id, winner));
          await holder.query("BEGIN");
          await holder.query("SELECT id FROM corp_card_usages WHERE id = $1 FOR UPDATE", [winner]);
        },
      });
      await waitForLockWaiter(pool);
      const probe = await pool.connect();
      try {
        await probe.query("BEGIN");
        const free = await probe.query("SELECT id FROM evidence_records WHERE id = $1 FOR UPDATE NOWAIT", [line.id]).then(
          () => true,
          () => false,
        );
        await probe.query("ROLLBACK");
        expect(free).toBe(true);
      } finally {
        probe.release();
      }
      await holder.query("COMMIT");
      expect((await run).id).toBe(winner);
    } finally {
      await holder.query("ROLLBACK").catch(() => undefined);
      holder.release();
    }
    expect(await liveLinks(winner)).toEqual([{ recordId: line.id, attachMode: "registrar" }]);
  });
});

// 07.1-04 D-7104 · PE3 · PE2 · E-P1-03 · E-P1-04 · E-P2-17 · D-E1: 승인번호 같음 붙임은 합계와 함께 사용일도 명세 날짜로 덮고,
// 같은 트랜잭션 안 always-on 로그에 바뀐 칸만 [이전, 이후]로 남긴다. 31일 넘는 날짜 차 · 완료 · 고정 건의 날짜 변경은 막힌다.
describe("카드 사용 사용일 덮기 · 전후 로그(07.1-04 D-7104)", () => {
  async function purchaseOrigin(fx: Fx, usageId: string, projectId: string, lineId: string): Promise<void> {
    const [request] = await db
      .insert(purchaseRequests)
      .values({ number: `26001-D${randomUUID().slice(0, 8)}`, linkKind: "quote_line", projectId, quoteLineId: lineId, requestedBy: fx.pm.id, itemName: "현수막", estimateAmountKrw: 200_000 })
      .returning({ id: purchaseRequests.id });
    if (!request) throw new Error("구매 요청 없음");
    await db.update(corpCardUsages).set({ registeredVia: "purchase", purchaseRequestId: request.id }).where(eq(corpCardUsages.id, usageId));
  }

  it("합계 · 사용일 다름 → used_on = 명세 날짜 · 합계 = 명세 · 공급가 · 세액 = 새 사용일 세율 · version +1 · 로그 changes(사용일 · 합계 · 공급가 · 부가세)", async () => {
    const fx = await setup("비씨카드");
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000 });
    const stored = await usageRow(usage.id);
    const recordId = await bcRecordWith(fx, { last4: fx.cardA.last4, approvalNo: approval(), total: "204,100", vat: "18,555", date: "2026-04-10" });
    await pairByApproval(usage.id, [recordId]);

    await attachEvidenceRecord(fx.manager, { recordId, owner: { kind: "corp_card_usage", id: usage.id } });

    const split = cardOverwriteSplit(await loadCardOverwriteBasis(SYSTEM_VIEWER, ["2026-04-10"]), { evidenceTypeCode: "card_receipt", usedOn: "2026-04-10", totalKrw: 204_100 });
    expect(await usageRow(usage.id)).toMatchObject({ usedOn: "2026-04-10", totalAmountKrw: 204_100, supplyKrw: split.supplyKrw, vatKrw: split.vatKrw, version: usage.version + 1 });
    const logs = await amountLogs(usage.id);
    expect(logs).toHaveLength(1);
    expect((logs[0]?.detail as { changes?: unknown }).changes).toEqual({
      usedOn: [USED_ON, "2026-04-10"],
      totalKrw: [200_000, 204_100],
      supplyKrw: [stored.supplyKrw, split.supplyKrw],
      vatKrw: [stored.vatKrw, split.vatKrw],
    });
  });

  it("(E-P1-03) 합계 · 카드 같음 · 사용일만 다름(2일) → used_on만 덮고 돈 칸 그대로 · version +1 · 로그 changes = usedOn 한 칸", async () => {
    const fx = await setup("비씨카드");
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000 });
    const before = await usageRow(usage.id);
    const recordId = await bcRecordWith(fx, { last4: fx.cardA.last4, approvalNo: approval(), total: "200,000", vat: "18,182", date: "2026-04-28" });
    await pairByApproval(usage.id, [recordId]);

    await attachEvidenceRecord(fx.manager, { recordId, owner: { kind: "corp_card_usage", id: usage.id } });

    expect(await liveLinks(usage.id)).toEqual([{ recordId, attachMode: "registrar" }]);
    expect(await usageRow(usage.id)).toMatchObject({
      usedOn: "2026-04-28",
      totalAmountKrw: before.totalAmountKrw,
      supplyKrw: before.supplyKrw,
      vatKrw: before.vatKrw,
      totalCurrency: before.totalCurrency,
      totalForeignAmount: before.totalForeignAmount,
      totalFxRate: before.totalFxRate,
      version: usage.version + 1,
    });
    const logs = await amountLogs(usage.id);
    expect(logs).toHaveLength(1);
    expect((logs[0]?.detail as { changes?: unknown }).changes).toEqual({ usedOn: [USED_ON, "2026-04-28"] });
  });

  it("(E-P1-04) 견적 줄 연결 · 합계 · 사용일 다름 → 후보 목록이 예외 없이 그 행을 내고 · 붙이기도 새 날짜 세율로 나눈다(덮기 세율 없음 0)", async () => {
    const fx = await setup("비씨카드");
    const { lineId } = await lineOf(fx.pm, 3_000_000);
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000, lineId });
    const recordId = await bcRecordWith(fx, { last4: fx.cardA.last4, approvalNo: approval(), total: "204,100", vat: "18,555", date: "2026-04-05" });
    await pairByApproval(usage.id, [recordId]);

    const candidates = await listAttachCandidates(fx.manager, { recordId });
    expect(candidates.items.find((item) => item.id === usage.id)).toMatchObject({ selectable: true, reason: null });

    await attachEvidenceRecord(fx.manager, { recordId, owner: { kind: "corp_card_usage", id: usage.id } });
    const split = cardOverwriteSplit(await loadCardOverwriteBasis(SYSTEM_VIEWER, ["2026-04-05"]), { evidenceTypeCode: "card_receipt", usedOn: "2026-04-05", totalKrw: 204_100 });
    expect(await usageRow(usage.id)).toMatchObject({ usedOn: "2026-04-05", totalAmountKrw: 204_100, supplyKrw: split.supplyKrw, vatKrw: split.vatKrw });
  });

  it("(D-E1) 승인번호 같음 · 날짜 차 32일 → 후보는 막힌 행 `날짜 다름 · 32일` · 직접 붙이기도 같은 글자로 거부 · 붙임 0 · used_on 그대로 · 로그 0", async () => {
    const fx = await setup("비씨카드");
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000 });
    const recordId = await bcRecordWith(fx, { last4: fx.cardA.last4, approvalNo: approval(), total: "200,000", vat: "18,182", date: "2026-03-29" });
    await pairByApproval(usage.id, [recordId]);

    const candidates = await listAttachCandidates(fx.manager, { recordId });
    expect(candidates.items.find((item) => item.id === usage.id)).toMatchObject({ selectable: false, reason: "날짜 다름 · 32일" });
    expect(await messageOf(attachEvidenceRecord(fx.manager, { recordId, owner: { kind: "corp_card_usage", id: usage.id } }))).toBe("날짜 다름 · 32일");
    expect(await liveLinks(usage.id)).toEqual([]);
    expect(await usageRow(usage.id)).toMatchObject({ usedOn: USED_ON, version: usage.version });
    expect(await amountLogs(usage.id)).toHaveLength(0);
  });

  it("(D-E1) 날짜 차 31일은 덮는다", async () => {
    const fx = await setup("비씨카드");
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000 });
    const recordId = await bcRecordWith(fx, { last4: fx.cardA.last4, approvalNo: approval(), total: "200,000", vat: "18,182", date: "2026-03-30" });
    await pairByApproval(usage.id, [recordId]);
    await attachEvidenceRecord(fx.manager, { recordId, owner: { kind: "corp_card_usage", id: usage.id } });
    expect(await usageRow(usage.id)).toMatchObject({ usedOn: "2026-03-30" });
  });

  it("(E-P2-17) 완료 프로젝트 · 날짜만 다름 → `사용일 04-30 → 04-28 · 완료 프로젝트` · 구매에서 생긴 건 → `… · 연결 고정` · 붙임 0 · used_on 그대로", async () => {
    const fx = await setup("비씨카드");
    const done = await lineOf(fx.pm, 3_000_000);
    const completed = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000, lineId: done.lineId });
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, done.projectId));
    const r1 = await bcRecordWith(fx, { last4: fx.cardA.last4, approvalNo: approval(), total: "200,000", vat: "18,182", date: "2026-04-28" });
    await pairByApproval(completed.id, [r1]);
    expect(await messageOf(attachEvidenceRecord(fx.manager, { recordId: r1, owner: { kind: "corp_card_usage", id: completed.id } }))).toBe("사용일 04-30 → 04-28 · 완료 프로젝트");
    expect(await liveLinks(completed.id)).toEqual([]);
    expect(await usageRow(completed.id)).toMatchObject({ usedOn: USED_ON });

    const open = await lineOf(fx.pm, 3_000_000);
    const bought = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000, lineId: open.lineId });
    await purchaseOrigin(fx, bought.id, open.projectId, open.lineId);
    const r2 = await bcRecordWith(fx, { last4: fx.cardA.last4, approvalNo: approval(), total: "200,000", vat: "18,182", date: "2026-04-28" });
    await pairByApproval(bought.id, [r2]);
    expect(await messageOf(attachEvidenceRecord(fx.manager, { recordId: r2, owner: { kind: "corp_card_usage", id: bought.id } }))).toBe("사용일 04-30 → 04-28 · 연결 고정");
    expect(await liveLinks(bought.id)).toEqual([]);
    expect(await usageRow(bought.id)).toMatchObject({ usedOn: USED_ON });
  });

  it("(PE2) 합계 · 사용일 같고 승인번호 빈 카드 사용 → 승인번호만 채움 · 로그 changes = approvalNo 한 칸 · 합계 · 사용일 그대로", async () => {
    const fx = await setup("비씨카드");
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: "2026-04-10", totalKrw: 200_000 });
    const before = await usageRow(usage.id);
    expect(before.approvalNo).toBeNull();
    // 같은 사용일 · 합계 — 등록 대사가 2단계로 먼저 붙이지 않게 등록 뒤 줄 날짜를 맞춘다.
    const recordId = await bcRecordWith(fx, { last4: fx.cardA.last4, approvalNo: approval(), total: "200,000", vat: "18,182", date: "2026-04-11" });
    await db.update(evidenceRecords).set({ issuedOn: "2026-04-10" }).where(eq(evidenceRecords.id, recordId));
    const [record] = await db.select({ approvalNo: evidenceRecords.approvalNo }).from(evidenceRecords).where(eq(evidenceRecords.id, recordId));

    await attachEvidenceRecord(fx.manager, { recordId, owner: { kind: "corp_card_usage", id: usage.id } });

    expect(await usageRow(usage.id)).toMatchObject({ approvalNo: record?.approvalNo, usedOn: "2026-04-10", totalAmountKrw: 200_000, version: usage.version + 1 });
    const logs = await amountLogs(usage.id);
    expect(logs).toHaveLength(1);
    expect((logs[0]?.detail as { changes?: unknown }).changes).toEqual({ approvalNo: [null, record?.approvalNo] });
  });

  it("낡은 version(사전 판독 뒤 다른 쓰기) → 기존 충돌 글자로 거부 · 붙임 0 · used_on 그대로 · 로그 0", async () => {
    const fx = await setup("비씨카드");
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000 });
    const recordId = await bcRecordWith(fx, { last4: fx.cardA.last4, approvalNo: approval(), total: "204,100", vat: "18,555", date: "2026-04-10" });
    await pairByApproval(usage.id, [recordId]);
    const message = await messageOf(
      attachEvidenceRecord(fx.manager, { recordId, owner: { kind: "corp_card_usage", id: usage.id } }, {
        afterPreRead: async () => {
          await db.update(corpCardUsages).set({ memo: "다른 쓰기", version: usage.version + 1 }).where(eq(corpCardUsages.id, usage.id));
        },
      }),
    );
    expect(message).toBe(cardSlipNotFound().message);
    expect(await liveLinks(usage.id)).toEqual([]);
    expect(await usageRow(usage.id)).toMatchObject({ usedOn: USED_ON, totalAmountKrw: 200_000 });
    expect(await amountLogs(usage.id)).toHaveLength(0);
  });
});

// 07.1-04 PE6 · T-07.1-04-07: 쪽(여러 카드 줄)의 덮기 막힘 판정은 재료 읽기 한 번 — 줄마다 판정 결과는 줄 하나씩 볼 때와 같다.
// PE4 ⓒ(이미 맞음 — 회귀): 후보 금액은 카드 사용 저장 값이다(증빙 값이 아니다).
describe("쪽 단위 덮기 막힘 판정(07.1-04 PE6)", () => {
  it("값이 다른 후보를 가진 카드 줄 셋 → findCardUsageOverwriteFacts 한 번 · 실행가 초과 줄만 막힘 · 후보 금액 = 카드 사용 값", async () => {
    const fx = await setup();
    const { lineId } = await lineOf(fx.pm, 300_000);
    const u1 = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000 });
    const u2 = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000, lineId });
    const u3 = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 100_000 });
    const r1 = await cardRecord(fx, fx.cardA.last4, "213,457", "19,405");
    const r2 = await cardRecord(fx, fx.cardA.last4, "1,238,013", "112,546");
    const r3 = await cardRecord(fx, fx.cardA.last4, "110,013", "10,001");
    await pairByApproval(u1.id, [r1]);
    await pairByApproval(u2.id, [r2]);
    await pairByApproval(u3.id, [r3]);
    const scope = await evidenceScopeFor(fx.manager);
    const rows = [];
    for (const id of [r1, r2, r3]) {
      const row = await findRecordForScope(fx.manager, scope, id);
      if (!row) throw new Error("기록 없음");
      rows.push(row);
    }

    vi.mocked(findCardUsageOverwriteFacts).mockClear();
    const judged = await judgeCardCandidates(fx.manager, rows, await cardUsageReadScope(fx.manager));
    expect(vi.mocked(findCardUsageOverwriteFacts)).toHaveBeenCalledTimes(1);

    const pick = (recordId: string, usageId: string) => judged.get(recordId)?.find((item) => item.row.id === usageId);
    expect(pick(r1, u1.id)?.judged.blockedReason).toBeNull();
    expect(pick(r2, u2.id)?.judged.blockedReason).toBe("합계 200,000 → 1,238,013 · 실행가 초과");
    expect(pick(r3, u3.id)?.judged.blockedReason).toBeNull();

    const candidates = await listAttachCandidates(fx.manager, { recordId: r1 });
    expect(candidates.items.find((item) => item.id === u1.id)).toMatchObject({ amountKrw: 200_000 });
  });
});

// 07.1-04 PR #305 검토 반영: 날짜 칸이 사용일이 아닌 서식(롯데 매입일자) · 확인 필요 줄 · 다른 카드의 같은 승인번호는 덮지 않고,
// 사용일을 옮기는 덮기는 수정 경로와 같은 날짜 판정(미래 · 재직 · 팀 카드 소속 · 팀 비용 소속 팀) · 새 날짜 세율 재분할 · 전후 로그를 받는다.
describe("카드 대사 붙임 검토 반영(07.1-04 PR #305)", () => {
  function changesOf(log: { detail: unknown } | undefined): Record<string, unknown> {
    return (log?.detail as { changes?: Record<string, unknown> } | undefined)?.changes ?? {};
  }

  it("(P1) 롯데 매입일자 줄 · 승인번호 같음 · 합계 다름 → 합계만 덮고 used_on 그대로 · 로그 changes에 usedOn 없음", async () => {
    const fx = await setup();
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000 });
    const recordId = await cardRecordWith(fx, { last4: fx.cardA.last4, approvalNo: approval(), total: "204,100", vat: "18,555", date: "2026.05.02" });
    await pairByApproval(usage.id, [recordId]);

    await attachEvidenceRecord(fx.manager, { recordId, owner: { kind: "corp_card_usage", id: usage.id } });

    expect(await usageRow(usage.id)).toMatchObject({ usedOn: USED_ON, totalAmountKrw: 204_100 });
    const [log] = await amountLogs(usage.id);
    expect(changesOf(log)).not.toHaveProperty("usedOn");
    expect(changesOf(log).totalKrw).toEqual([200_000, 204_100]);
  });

  it("(P1) 롯데 매입일자 줄 · 합계 · 카드 같음 · 날짜만 다름 → 붙임만 · used_on · version 그대로 · 금액 로그 0", async () => {
    const fx = await setup();
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000 });
    const recordId = await cardRecordWith(fx, { last4: fx.cardA.last4, approvalNo: approval(), total: "200,000", vat: "18,182", date: "2026.05.02" });
    await pairByApproval(usage.id, [recordId]);

    await attachEvidenceRecord(fx.manager, { recordId, owner: { kind: "corp_card_usage", id: usage.id } });

    expect(await liveLinks(usage.id)).toEqual([{ recordId, attachMode: "registrar" }]);
    expect(await usageRow(usage.id)).toMatchObject({ usedOn: USED_ON, version: usage.version });
    expect(await amountLogs(usage.id)).toHaveLength(0);
  });

  it("(P1) 해외 이용 줄(확인 필요)은 카드 사용에 붙지 않는다 — 붙임 0 · 사용일 · 합계 그대로 · 금액 로그 0", async () => {
    const fx = await setup("비씨카드");
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000 });
    const recordId = await bcRecordWith(fx, { last4: fx.cardA.last4, approvalNo: approval(), total: "204,100", vat: "18,555", date: "2026-04-28", overseas: true });
    await pairByApproval(usage.id, [recordId]);

    // 잠금 뒤 상태 재검사(attachLinkInTx · evidenceAttachBlockOf)가 덮기 전에 거부한다 — 확인 필요를 푼 뒤에만 붙인다.
    expect(await messageOf(attachEvidenceRecord(fx.manager, { recordId, owner: { kind: "corp_card_usage", id: usage.id } }))).toBe("확인 필요 · 패널에서 확인 필요 풀기");
    expect(await liveLinks(usage.id)).toEqual([]);
    expect(await usageRow(usage.id)).toMatchObject({ usedOn: USED_ON, totalAmountKrw: 200_000, version: usage.version });
    expect(await amountLogs(usage.id)).toHaveLength(0);
  });

  it("(F2) 다른 카드의 같은 승인번호(사용일 · 합계 다름) → 후보 아님 · 직접 붙여도 거부 · 카드 · 합계 · 사용일 그대로", async () => {
    const fx = await setup("비씨카드");
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000 });
    const recordId = await bcRecordWith(fx, { last4: fx.cardB.last4, approvalNo: approval(), total: "204,100", vat: "18,555", date: "2026-04-28" });
    await pairByApproval(usage.id, [recordId]);

    const candidates = await listAttachCandidates(fx.manager, { recordId });
    expect(candidates.items.some((item) => item.id === usage.id)).toBe(false);
    expect(await messageOf(attachEvidenceRecord(fx.manager, { recordId, owner: { kind: "corp_card_usage", id: usage.id } }))).not.toBe("(성공)");
    expect(await liveLinks(usage.id)).toEqual([]);
    expect(await usageRow(usage.id)).toMatchObject({ corpCardId: fx.cardA.id, totalAmountKrw: 200_000, usedOn: USED_ON });
  });

  it("(P2) 팀 비용 · 사용일을 옛 팀 시절로 덮으면 team_id = 새 사용일 소속 팀", async () => {
    const fx = await setup("비씨카드");
    const before = await teamIdByName("기획1팀");
    const after = await teamIdByName("경영관리팀");
    await insertMembership(SYSTEM_VIEWER, { userId: fx.pm.id, teamId: after, effectiveFrom: "2026-04-29" });
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000 });
    expect((await usageRow(usage.id)).teamId).toBe(after);
    const recordId = await bcRecordWith(fx, { last4: fx.cardA.last4, approvalNo: approval(), total: "200,000", vat: "18,182", date: "2026-04-28" });
    await pairByApproval(usage.id, [recordId]);

    await attachEvidenceRecord(fx.manager, { recordId, owner: { kind: "corp_card_usage", id: usage.id } });

    expect(await usageRow(usage.id)).toMatchObject({ usedOn: "2026-04-28", linkKind: "team_cost", teamId: before });
  });

  it("(P2) 팀 비용 · 새 사용일에 소속이 없으면 `{이름} {MM-DD} 소속 없음 · 소속 발령은 관리자` 거부 · 붙임 0 · 값 그대로", async () => {
    const fx = await setup("비씨카드");
    const late = await makePerson("늦은발령", DEFAULT_ROLE_ID, null);
    await insertMembership(SYSTEM_VIEWER, { userId: late.id, teamId: await teamIdByName("기획1팀"), effectiveFrom: "2026-04-29" });
    const card = await lotteCard(late.id, "비씨카드");
    const usage = await createCardUsageFixture(late, { corpCardId: card.id, usedOn: USED_ON, totalKrw: 200_000 });
    const recordId = await bcRecordWith(fx, { last4: card.last4, approvalNo: approval(), total: "200,000", vat: "18,182", date: "2026-04-28" });
    await pairByApproval(usage.id, [recordId]);

    expect(await messageOf(attachEvidenceRecord(fx.manager, { recordId, owner: { kind: "corp_card_usage", id: usage.id } }))).toBe("늦은발령 04-28 소속 없음 · 소속 발령은 관리자");
    expect(await liveLinks(usage.id)).toEqual([]);
    expect(await usageRow(usage.id)).toMatchObject({ usedOn: USED_ON, version: usage.version });
  });

  it("(P2) 새 사용일이 오늘 뒤면 사용일 상한 글자로 거부 · 붙임 0", async () => {
    const fx = await setup("비씨카드");
    const today = seoulToday();
    const tomorrow = seoulToday(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: today, totalKrw: 200_000 });
    const recordId = await bcRecordWith(fx, { last4: fx.cardA.last4, approvalNo: approval(), total: "200,000", vat: "18,182", date: tomorrow });
    await pairByApproval(usage.id, [recordId]);

    expect(await messageOf(attachEvidenceRecord(fx.manager, { recordId, owner: { kind: "corp_card_usage", id: usage.id } }))).toBe(cardUsedOnError(tomorrow, today));
    expect(await liveLinks(usage.id)).toEqual([]);
    expect(await usageRow(usage.id)).toMatchObject({ usedOn: today });
  });

  it("(P2) 팀 카드 — 새 사용일에 사용한 사람이 카드 팀 소속이 아니거나 재직 전이면 거부 · 붙임 0", async () => {
    const fx = await setup("비씨카드");
    const managementTeam = await teamIdByName("경영관리팀");
    await insertMembership(SYSTEM_VIEWER, { userId: fx.pm.id, teamId: managementTeam, effectiveFrom: "2026-04-29" });
    const movedLast4 = nextLast4();
    const moved = await createCorpCard(SYSTEM_VIEWER, { issuer: "비씨카드", numberLast4: movedLast4, label: "팀 카드 이동", kind: "team", teamId: managementTeam });
    if (!moved.id) throw new Error("카드 없음");
    const u1 = await createCardUsageFixture(fx.pm, { corpCardId: moved.id, usedOn: USED_ON, totalKrw: 200_000 });
    const r1 = await bcRecordWith(fx, { last4: movedLast4, approvalNo: approval(), total: "200,000", vat: "18,182", date: "2026-04-28" });
    await pairByApproval(u1.id, [r1]);
    expect(await messageOf(attachEvidenceRecord(fx.manager, { recordId: r1, owner: { kind: "corp_card_usage", id: u1.id } }))).toBe("붙이기PM 04-28 카드 팀 소속 아님");
    expect(await liveLinks(u1.id)).toEqual([]);

    const hired = await makePerson("늦은입사", DEFAULT_ROLE_ID, "기획1팀");
    await db.update(users).set({ hireDate: "2026-04-29" }).where(eq(users.id, hired.id));
    const teamLast4 = nextLast4();
    const teamCard = await createCorpCard(SYSTEM_VIEWER, { issuer: "비씨카드", numberLast4: teamLast4, label: "팀 카드 입사", kind: "team", teamId: await teamIdByName("기획1팀") });
    if (!teamCard.id) throw new Error("카드 없음");
    const u2 = await createCardUsageFixture(hired, { corpCardId: teamCard.id, usedOn: USED_ON, totalKrw: 200_000 });
    const r2 = await bcRecordWith(fx, { last4: teamLast4, approvalNo: approval(), total: "200,000", vat: "18,182", date: "2026-04-28" });
    await pairByApproval(u2.id, [r2]);
    expect(await messageOf(attachEvidenceRecord(fx.manager, { recordId: r2, owner: { kind: "corp_card_usage", id: u2.id } }))).toBe("늦은입사 04-28 재직 아님");
    expect(await liveLinks(u2.id)).toEqual([]);
    expect(await usageRow(u2.id)).toMatchObject({ usedOn: USED_ON });
  });

  it("(P2) 날짜만 덮는 원화 카드 사용 — 공급가 · 세액을 새 사용일 세율로 다시 나눈다(04-29부터 20% · 그 전 10%)", async () => {
    await vatTwentyFrom0429();
    const fx = await setup("비씨카드");
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 240_000 });
    expect(await usageRow(usage.id)).toMatchObject({ supplyKrw: 200_000, vatKrw: 40_000 });
    const recordId = await bcRecordWith(fx, { last4: fx.cardA.last4, approvalNo: approval(), total: "240,000", vat: "21,818", date: "2026-04-28" });
    await pairByApproval(usage.id, [recordId]);

    await attachEvidenceRecord(fx.manager, { recordId, owner: { kind: "corp_card_usage", id: usage.id } });

    expect(await usageRow(usage.id)).toMatchObject({ usedOn: "2026-04-28", totalAmountKrw: 240_000, supplyKrw: 218_182, vatKrw: 21_818, totalCurrency: "KRW" });
    const [log] = await amountLogs(usage.id);
    expect(changesOf(log)).toEqual({ usedOn: [USED_ON, "2026-04-28"], supplyKrw: [200_000, 218_182], vatKrw: [40_000, 21_818] });
  });

  it("(PR #305 재검토) 날짜만 옮기는 원화 건 — 새 세율로 나눈 공급가(218,182)가 실행가(210,000)를 넘으면 S4 후보 · S5 풀 둘 다 막힌 행 · 붙이기도 같은 글자로 거부", async () => {
    await vatTwentyFrom0429();
    const fx = await setup("비씨카드");
    const { lineId } = await lineOf(fx.pm, 210_000);
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 240_000, lineId });
    expect(await usageRow(usage.id)).toMatchObject({ supplyKrw: 200_000, vatKrw: 40_000 });
    const recordId = await bcRecordWith(fx, { last4: fx.cardA.last4, approvalNo: approval(), total: "240,000", vat: "21,818", date: "2026-04-28" });
    await pairByApproval(usage.id, [recordId]);
    const reason = "사용일 04-30 → 04-28 · 실행가 초과";

    const candidates = await listAttachCandidates(fx.manager, { recordId });
    expect(candidates.items.find((item) => item.id === usage.id)).toMatchObject({ selectable: false, reason });
    const poolResult = await listEvidencePool(fx.manager, { owner: { kind: "corp_card_usage", id: usage.id } });
    expect(poolResult.items.find((item) => item.id === recordId)).toMatchObject({ selectable: false, reason });
    expect(await messageOf(attachEvidenceRecord(fx.manager, { recordId, owner: { kind: "corp_card_usage", id: usage.id } }))).toBe(reason);
    expect(await liveLinks(usage.id)).toEqual([]);
    expect(await usageRow(usage.id)).toMatchObject({ usedOn: USED_ON, supplyKrw: 200_000, version: usage.version });
  });

  it("(P2) 카드만 바꾼 덮기도 로그 changes에 카드 끝 4자리가 남는다", async () => {
    const fx = await setup("비씨카드");
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardB.id, usedOn: USED_ON, totalKrw: 200_000 });
    const recordId = await bcRecordWith(fx, { last4: fx.cardA.last4, approvalNo: approval(), total: "200,000", vat: "18,182", date: USED_ON });

    await attachEvidenceRecord(fx.manager, { recordId, owner: { kind: "corp_card_usage", id: usage.id } });

    expect(await usageRow(usage.id)).toMatchObject({ corpCardId: fx.cardA.id });
    const [log] = await amountLogs(usage.id);
    expect(changesOf(log)).toMatchObject({ cardLast4: [fx.cardB.last4, fx.cardA.last4] });
  });

  it("(P2) 경영관리 S5 풀 — 날짜만 다른 줄 changesCardUsage 참 · 32일 차는 `날짜 다름 · 32일` · 완료 프로젝트 날짜만 다른 줄은 막힘", async () => {
    const fx = await setup("비씨카드");
    const usage = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000 });
    const near = await bcRecordWith(fx, { last4: fx.cardA.last4, approvalNo: approval(), total: "200,000", vat: "18,182", date: "2026-04-28" });
    const far = await bcRecordWith(fx, { last4: fx.cardA.last4, approvalNo: approval(), total: "200,000", vat: "18,182", date: "2026-03-29" });
    await pairByApproval(usage.id, [near, far]);
    const pool1 = await listEvidencePool(fx.manager, { owner: { kind: "corp_card_usage", id: usage.id } });
    expect(pool1.items.find((item) => item.id === near)).toMatchObject({ selectable: true, reason: null, changesCardUsage: true });
    expect(pool1.items.find((item) => item.id === far)).toMatchObject({ selectable: false, reason: "날짜 다름 · 32일" });

    const done = await lineOf(fx.pm, 3_000_000);
    const completed = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000, lineId: done.lineId });
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, done.projectId));
    const line = await bcRecordWith(fx, { last4: fx.cardA.last4, approvalNo: approval(), total: "200,000", vat: "18,182", date: "2026-04-28" });
    await pairByApproval(completed.id, [line]);
    const pool2 = await listEvidencePool(fx.manager, { owner: { kind: "corp_card_usage", id: completed.id } });
    expect(pool2.items.find((item) => item.id === line)).toMatchObject({ selectable: false, reason: "사용일 04-30 → 04-28 · 완료 프로젝트" });
  });
});
