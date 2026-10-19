import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { actionLog, corpCardUsages, evidenceRecordLinks, evidenceRecords, projects } from "@/db/schema";
import { createCorpCard } from "@/domain/corp-cards";
import { attachEvidenceRecord } from "@/domain/evidence-records/attach";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { insertVendor } from "@/repositories/vendors";
import { lotteFixture } from "@/test/fixtures/evidence-import/build";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { makePerson, teamIdByName } from "./approvals-fixtures";
import { createCardUsageFixture, createIntakeManager, insertLinkFixture, insertRecordFixture, registerFixtureFile } from "./fixtures/evidence";

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

    await attachEvidenceRecord(fx.manager, { recordId, owner: { kind: "corp_card_usage", id: usage.id } }, { isActionTypeEnabled: () => Promise.resolve(false) });

    expect(await liveLinks(usage.id)).toEqual([{ recordId, attachMode: "registrar" }]);
    expect(await usageRow(usage.id)).toMatchObject({ totalAmountKrw: 204_100, corpCardId: fx.cardB.id, number: usage.number, version: usage.version + 1 });
    const logs = await amountLogs(usage.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ entity: "corp_card_usage" });
    expect(logs[0]?.detail).toMatchObject({ cardLast4Before: fx.cardA.last4, cardLast4After: fx.cardB.last4, evidenceRecordId: recordId });
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
