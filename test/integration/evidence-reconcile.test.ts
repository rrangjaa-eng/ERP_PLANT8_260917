import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import { actionLog, corpCardUsages, evidenceRecordLinks, evidenceRecords, projects, purchaseRequests } from "@/db/schema";
import { createCorpCard } from "@/domain/corp-cards";
import { cardOverwriteSplit, createCardUsage, listCardUsages, loadCardOverwriteBasis, precheckCardUsage, type CardUsageInput } from "@/domain/corp-card-usages";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { insertVendor } from "@/repositories/vendors";
import { lotteFixture } from "@/test/fixtures/evidence-import/build";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { makePerson, teamIdByName } from "./approvals-fixtures";
import { createCardUsageFixture, createIntakeViewer, insertLinkFixture, insertRecordFixture, registerFixtureFile } from "./fixtures/evidence";
import { deferred, waitForLockWaiter } from "./lock-race";

// 06.1-09(EVID-10 · E28 · E32 · D-6111 · 카드 R3 · P2-C4 · P1-5 · N-6 · N-7 · N-8): 카드 파일 등록 트랜잭션 안 대사.
// 카드는 테스트마다 끝 4자리를 새로 잡는다(다른 파일의 롯데 2222 카드와 겹치면 카드가 정해지지 않는다). 승인번호도 테스트마다 새로.

const USED_ON = "2026-04-30";
const FILE_DATE = "2026.04.30";
let last4Seed = 4000 + Math.floor(Math.random() * 4000);

function nextLast4(): string {
  last4Seed += 1;
  if (last4Seed === 2222 || last4Seed === 3333) last4Seed += 1;
  return String(last4Seed);
}

function approval(): string {
  return String(10_000_000 + Math.floor(Math.random() * 89_999_999));
}

async function lotteCard(input: { kind: "personal" | "team" | "shared"; holderUserId?: string; teamId?: string }): Promise<{ id: string; last4: string }> {
  const last4 = nextLast4();
  const card = await createCorpCard(SYSTEM_VIEWER, { issuer: "롯데카드", numberLast4: last4, label: `대사 ${last4}`, ...input });
  if (!card.id) throw new Error("카드 id 없음");
  return { id: card.id, last4 };
}

function cardNo(last4: string): string {
  return `999900001111${last4}`;
}

type Line = { 승인번호: string; 카드번호: string; 매입금액: string; 부가세: string; 매입일자?: string; 현지거래금액?: string };

function line(last4: string, approvalNo: string, total: number, vat = 0, date = FILE_DATE): Line {
  return { 승인번호: approvalNo, 카드번호: cardNo(last4), 매입금액: total.toLocaleString("en-US"), 부가세: vat.toLocaleString("en-US"), 매입일자: date };
}

type Fx = { pm: Viewer; intake: Viewer; teamName: string; cardA: { id: string; last4: string }; cardB: { id: string; last4: string } };

// PM(같은 보유자) 개인 카드 둘 — A에 등록된 카드 사용을 B로 긁은 파일 줄이 덮는다(E28 재발급 · P2-C4 같은 보유자).
async function setup(): Promise<Fx> {
  const teamName = "기획1팀";
  const pm = await makePerson("대사PM", DEFAULT_ROLE_ID, teamName);
  const intake = await createIntakeViewer();
  // 대사 덮기는 두 금액 보임일 때만(cso D2) — 경영관리 계급처럼 카드 사용 금액도 보이게 한다(새 계급은 행이 없으면 숨김).
  if (!intake.roleId) throw new Error("계급 없음");
  await upsertVisibility(SYSTEM_VIEWER, { roleId: intake.roleId, infoItem: "card_usage.amount", visible: true });
  const cardA = await lotteCard({ kind: "personal", holderUserId: pm.id });
  const cardB = await lotteCard({ kind: "personal", holderUserId: pm.id });
  return { pm, intake, teamName, cardA, cardB };
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

async function recordIdOf(batchId: string, approvalNo: string): Promise<string> {
  const [row] = await db.select({ id: evidenceRecords.id }).from(evidenceRecords).where(and(eq(evidenceRecords.batchId, batchId), eq(evidenceRecords.approvalNo, approvalNo)));
  if (!row) throw new Error("기록 없음");
  return row.id;
}

async function lineProject(pm: Viewer, executions: readonly number[], status?: string): Promise<{ projectId: string; lines: string[] }> {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `클라이언트-${randomUUID()}`, normalizedName: `클라이언트-${randomUUID()}` });
  const project = await createProject(pm, { clientId: client.id, teamId: await teamIdByName("기획1팀"), pmUserId: pm.id, name: `대사-${randomUUID().slice(0, 8)}`, startDate: "2026-09-01", endDate: "2026-12-31" });
  if (!project.id) throw new Error("프로젝트 없음");
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("1차 차수 없음");
  const subcategory = (await firstSelectableSubcategory()).value;
  const ids = executions.map(() => randomUUID());
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: executions.map((amount, index) => ({
      id: ids[index] ?? randomUUID(),
      isNew: true as const,
      subcategory,
      itemName: `대사줄${index + 1}`,
      vendorId: null,
      unitPrice: { currency: "KRW" as const, amount: amount + 500_000, fxRate: 1 },
      execution: { currency: "KRW" as const, amount, fxRate: 1 },
    })),
  });
  if (status) await db.update(projects).set({ status }).where(eq(projects.id, project.id));
  return { projectId: project.id, lines: ids };
}

describe("카드 파일 등록 → 대사(06.1-09 트레이서)", () => {
  it("1단계(같은 카드사 · 승인번호 · 다른 카드) 덮기 + 2단계(카드 · 날짜 · 합계) 승인번호 채움 · 짝 없음 1 — 덮기 기록은 로그 끈 주입에서도 남는다", async () => {
    const fx = await setup();
    const [a1, a2, a3] = [approval(), approval(), approval()];
    const u1 = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000, approvalNo: a1 });
    const u2 = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardB.id, usedOn: USED_ON, totalKrw: 50_000 });

    const result = await registerFixtureFile(fx.intake, lotteFixture([line(fx.cardB.last4, a1, 204_100, 18_554), line(fx.cardB.last4, a2, 50_000, 4_545), line(fx.cardB.last4, a3, 77_000, 7_000)]), "롯데.xls", {
      isActionTypeEnabled: () => Promise.resolve(false),
    });

    expect(result).toMatchObject({ registered: 3, cardMatched: 2, cardUnmatched: 1, cardUnknown: 0 });
    const r1 = await recordIdOf(result.batchId, a1);
    const r2 = await recordIdOf(result.batchId, a2);
    expect(await liveLinks(u1.id)).toEqual([{ recordId: r1, attachMode: "reconcile" }]);
    expect(await liveLinks(u2.id)).toEqual([{ recordId: r2, attachMode: "reconcile" }]);

    // 공급가 · 세액 = 그 카드 사용 증빙 종류(card_receipt) 규칙 + 사용일 세율의 splitCardTotal.
    const split = cardOverwriteSplit(await loadCardOverwriteBasis(SYSTEM_VIEWER, [USED_ON]), { evidenceTypeCode: "card_receipt", usedOn: USED_ON, totalKrw: 204_100 });
    const row1 = await usageRow(u1.id);
    expect(row1).toMatchObject({ corpCardId: fx.cardB.id, totalAmountKrw: 204_100, approvalNo: a1, number: u1.number, version: u1.version + 1 });
    expect({ supplyKrw: row1.supplyKrw, vatKrw: row1.vatKrw }).toEqual({ supplyKrw: split.supplyKrw, vatKrw: split.vatKrw });
    const logs = await amountLogs(u1.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ entity: "corp_card_usage" });
    expect(logs[0]?.detail).toMatchObject({ cardLast4Before: fx.cardA.last4, cardLast4After: fx.cardB.last4, evidenceRecordId: r1, before: { totalKrw: 200_000 }, after: { totalKrw: 204_100 } });
    // 07.1-04 PE3 · E-P2-15: 수동 붙임과 같은 changes 모양 — 1단계는 구조상 같은 사용일이라 usedOn 칸이 없다.
    // PR #305 검토 P2: 카드 끝 4자리 · 공급가 · 부가세도 바뀐 칸이면 남는다.
    expect((logs[0]?.detail as { changes?: unknown }).changes).toEqual({
      cardLast4: [fx.cardA.last4, fx.cardB.last4],
      totalKrw: [200_000, 204_100],
      supplyKrw: [181_818, split.supplyKrw],
      vatKrw: [18_182, split.vatKrw],
    });

    const row2 = await usageRow(u2.id);
    expect(row2).toMatchObject({ approvalNo: a2, totalAmountKrw: 50_000, usedOn: USED_ON, corpCardId: fx.cardB.id, number: u2.number });
    // 07.1-04 PE2: 2단계 승인번호만 채운 짝도 같은 종류 로그 한 행 — changes는 승인번호 한 칸.
    const fillLogs = await amountLogs(u2.id);
    expect(fillLogs).toHaveLength(1);
    expect((fillLogs[0]?.detail as { changes?: unknown }).changes).toEqual({ approvalNo: [null, a2] });
  });

  it("보관된 카드 사용은 후보가 아니다 → 그 줄은 짝 없음", async () => {
    const fx = await setup();
    const a1 = approval();
    const u = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardB.id, usedOn: USED_ON, totalKrw: 204_100, approvalNo: a1 });
    await db.update(corpCardUsages).set({ archivedAt: new Date(), archivedBy: fx.pm.id }).where(eq(corpCardUsages.id, u.id));
    const result = await registerFixtureFile(fx.intake, lotteFixture([line(fx.cardB.last4, a1, 204_100, 18_554)]));
    expect(result).toMatchObject({ cardMatched: 0, cardUnmatched: 1 });
    expect(await liveLinks(u.id)).toEqual([]);
  });

  it("같은 파일을 다시 올리면 이미 등록으로 건너뛰고 대사 0", async () => {
    const fx = await setup();
    const a1 = approval();
    const u = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardB.id, usedOn: USED_ON, totalKrw: 204_100 });
    const bytes = lotteFixture([line(fx.cardB.last4, a1, 204_100, 18_554)]);
    expect(await registerFixtureFile(fx.intake, bytes)).toMatchObject({ cardMatched: 1 });
    const again = await registerFixtureFile(fx.intake, bytes);
    expect(again).toMatchObject({ registered: 0, sameFile: true, cardMatched: 0, cardUnmatched: 0 });
    expect(await liveLinks(u.id)).toHaveLength(1);
  });

  it("needs_check 줄(해외 이용)은 짝이 하나여도 붙지 않는다", async () => {
    const fx = await setup();
    const a1 = approval();
    const u = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardB.id, usedOn: USED_ON, totalKrw: 204_100, approvalNo: a1 });
    const result = await registerFixtureFile(fx.intake, lotteFixture([{ ...line(fx.cardB.last4, a1, 204_100, 18_554), 현지거래금액: "150.00" }]));
    const [record] = await db.select({ needsCheck: evidenceRecords.needsCheck }).from(evidenceRecords).where(eq(evidenceRecords.batchId, result.batchId));
    expect(record?.needsCheck).not.toBeNull();
    expect(result.cardMatched).toBe(0);
    expect(await liveLinks(u.id)).toEqual([]);
  });
});

describe("대사 — 붙임 · 날짜 갈래(P1-5 · N-6 · N-7 · PA-HASEV)", () => {
  it("(P1-5) 이미 붙은 카드 사용 · 같은 승인번호 — 카드 서식 기록이 붙어 있으면 짝 없음 · 합계 · 카드 그대로", async () => {
    const fx = await setup();
    const a1 = approval();
    const u = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000 });
    const first = await registerFixtureFile(fx.intake, lotteFixture([line(fx.cardA.last4, approval(), 200_000, 18_182)]));
    expect(first.cardMatched).toBe(1);
    await db.update(corpCardUsages).set({ approvalNo: a1 }).where(eq(corpCardUsages.id, u.id));
    const before = await usageRow(u.id);

    const result = await registerFixtureFile(fx.intake, lotteFixture([line(fx.cardB.last4, a1, 204_100, 18_554)]));
    expect(result).toMatchObject({ cardMatched: 0, cardUnmatched: 1 });
    expect(await liveLinks(u.id)).toHaveLength(1);
    expect(await usageRow(u.id)).toMatchObject({ totalAmountKrw: before.totalAmountKrw, corpCardId: fx.cardA.id, version: before.version });
  });

  it("(N-6) 영수증 기록만 붙은 카드 사용 — 같은 승인번호 · 사용일 줄이 1단계로 붙고 파일 값으로 덮인다(붙임 2행)", async () => {
    const fx = await setup();
    const a1 = approval();
    const u = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000, approvalNo: a1 });
    const receipt = await insertRecordFixture(fx.intake, { evidenceType: "card_receipt", supplyKrw: 181_818, vatKrw: 18_182, issuedOn: USED_ON });
    await insertLinkFixture({ recordId: receipt, ownerKind: "corp_card_usage", ownerId: u.id, attachedBy: fx.intake.id });

    const result = await registerFixtureFile(fx.intake, lotteFixture([line(fx.cardB.last4, a1, 204_100, 18_554)]));
    expect(result.cardMatched).toBe(1);
    expect(await liveLinks(u.id)).toHaveLength(2);
    expect(await usageRow(u.id)).toMatchObject({ totalAmountKrw: 204_100, corpCardId: fx.cardB.id });
  });

  it("(N-7) 승인번호 같고 사용일이 다른 달 — 붙임 0 · 덮기 0 · 짝 없음", async () => {
    const fx = await setup();
    const a1 = approval();
    const u = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardB.id, usedOn: "2026-03-30", totalKrw: 204_100, approvalNo: a1 });
    const result = await registerFixtureFile(fx.intake, lotteFixture([line(fx.cardB.last4, a1, 204_100, 18_554)]));
    expect(result).toMatchObject({ cardMatched: 0, cardUnmatched: 1 });
    expect(await liveLinks(u.id)).toEqual([]);
  });

  it("(PA-HASEV) 구매에서 생긴 카드 사용 · 원 구매 요청에 붙임 있음 → 2단계 「증빙 없음」 아님 → 짝 없음", async () => {
    const fx = await setup();
    const { projectId, lines } = await lineProject(fx.pm, [5_000_000]);
    const lineId = lines[0] ?? "";
    const u = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardB.id, usedOn: USED_ON, totalKrw: 204_100, lineId });
    const [request] = await db
      .insert(purchaseRequests)
      .values({ number: `26001-C${randomUUID().slice(0, 8)}`, linkKind: "quote_line", projectId, quoteLineId: lineId, requestedBy: fx.pm.id, itemName: "현수막", estimateAmountKrw: 204_100 })
      .returning({ id: purchaseRequests.id });
    if (!request) throw new Error("구매 요청 없음");
    await db.update(corpCardUsages).set({ registeredVia: "purchase", purchaseRequestId: request.id }).where(eq(corpCardUsages.id, u.id));
    const receipt = await insertRecordFixture(fx.intake, { evidenceType: "card_receipt", supplyKrw: 185_546, vatKrw: 18_554, issuedOn: USED_ON });
    await insertLinkFixture({ recordId: receipt, ownerKind: "purchase_request", ownerId: request.id, attachedBy: fx.intake.id });

    const result = await registerFixtureFile(fx.intake, lotteFixture([line(fx.cardB.last4, approval(), 204_100, 18_554)]));
    expect(result).toMatchObject({ cardMatched: 0, cardUnmatched: 1 });
    expect(await liveLinks(u.id)).toEqual([]);
    // 같은 「증빙 있음」이 06 카드 사용 목록의 증빙 열에도 선다(PA-HASEV — 원 구매 요청의 붙임).
    const listed = await listCardUsages(fx.pm, { month: USED_ON.slice(0, 7) }, USED_ON);
    expect(listed.rows.find((row) => row.id === u.id)?.hasCardSlip).toBe(true);
  });
});

describe("대사 — 덮기 막힘(카드 R3 · P2-C4)", () => {
  it("실행가 초과: 견적 줄 연결 카드 사용을 파일 합계로 덮으면 06 상한을 넘음 → 붙임 0 · 덮기 0 · 짝 없음 / 대조: 상한 안이면 덮기 성공", async () => {
    const fx = await setup();
    const { lines } = await lineProject(fx.pm, [300_000, 3_000_000]);
    const [tight, roomy] = [lines[0] ?? "", lines[1] ?? ""];
    const [a1, a2] = [approval(), approval()];
    const blocked = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000, approvalNo: a1, lineId: tight });
    const fine = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000, approvalNo: a2, lineId: roomy });

    const result = await registerFixtureFile(fx.intake, lotteFixture([line(fx.cardA.last4, a1, 1_238_000, 112_545), line(fx.cardA.last4, a2, 1_238_000, 112_545)]));
    expect(result).toMatchObject({ cardMatched: 1, cardUnmatched: 1 });
    expect(await liveLinks(blocked.id)).toEqual([]);
    expect(await usageRow(blocked.id)).toMatchObject({ totalAmountKrw: 200_000, version: blocked.version });
    expect(await amountLogs(blocked.id)).toHaveLength(0);
    expect(await liveLinks(fine.id)).toHaveLength(1);
    expect(await usageRow(fine.id)).toMatchObject({ totalAmountKrw: 1_238_000 });
  });

  it("(cso D2) 등록자가 금액(card_usage.amount · evidence.amount) 중 하나라도 못 보면 값 바뀌는 짝은 붙임 0 · 덮기 0 · 기록 0 / 값 같은 짝은 붙고 승인번호만 채움", async () => {
    for (const hidden of ["card_usage.amount", "evidence.amount"]) {
      const fx = await setup();
      if (!fx.intake.roleId) throw new Error("계급 없음");
      await upsertVisibility(SYSTEM_VIEWER, { roleId: fx.intake.roleId, infoItem: hidden, visible: false });
      const [a1, a2] = [approval(), approval()];
      const differ = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000, approvalNo: a1 });
      const same = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardB.id, usedOn: USED_ON, totalKrw: 50_000 });

      const result = await registerFixtureFile(fx.intake, lotteFixture([line(fx.cardB.last4, a1, 204_100, 18_554), line(fx.cardB.last4, a2, 50_000, 4_545)]));
      expect(result).toMatchObject({ cardMatched: 1, cardUnmatched: 1 });
      expect(await liveLinks(differ.id)).toEqual([]);
      expect(await usageRow(differ.id)).toMatchObject({ corpCardId: fx.cardA.id, totalAmountKrw: 200_000, version: differ.version });
      expect(await amountLogs(differ.id)).toHaveLength(0);
      expect(await liveLinks(same.id)).toEqual([{ recordId: await recordIdOf(result.batchId, a2), attachMode: "reconcile" }]);
      expect(await usageRow(same.id)).toMatchObject({ approvalNo: a2, totalAmountKrw: 50_000 });
    }
  });

  it("완료 프로젝트: 값이 같으면(승인번호만) 붙임 · 승인번호 채움 / 합계가 다르면 붙임 0 · 덮기 0 · 기록 0", async () => {
    const fx = await setup();
    const { projectId, lines } = await lineProject(fx.pm, [3_000_000, 3_000_000]);
    const [a1, a2] = [approval(), approval()];
    const same = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardB.id, usedOn: USED_ON, totalKrw: 204_100, lineId: lines[0] ?? "" });
    const differ = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardB.id, usedOn: USED_ON, totalKrw: 90_000, approvalNo: a2, lineId: lines[1] ?? "" });
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, projectId));

    const result = await registerFixtureFile(fx.intake, lotteFixture([line(fx.cardB.last4, a1, 204_100, 18_554), line(fx.cardB.last4, a2, 99_000, 9_000)]));
    expect(result).toMatchObject({ cardMatched: 1, cardUnmatched: 1 });
    expect(await usageRow(same.id)).toMatchObject({ approvalNo: a1, totalAmountKrw: 204_100 });
    expect(await liveLinks(same.id)).toHaveLength(1);
    expect(await liveLinks(differ.id)).toEqual([]);
    expect(await usageRow(differ.id)).toMatchObject({ totalAmountKrw: 90_000, version: differ.version });
    expect(await amountLogs(differ.id)).toHaveLength(0);
  });

  it("연결 고정: 구매에서 생긴 카드 사용 · 견적 외(out_of_quote) 카드 사용의 합계 다른 짝 → 붙임 0 · 덮기 0", async () => {
    const fx = await setup();
    const { projectId, lines } = await lineProject(fx.pm, [3_000_000]);
    const [a1, a2] = [approval(), approval()];
    const purchased = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardB.id, usedOn: USED_ON, totalKrw: 90_000, approvalNo: a1, lineId: lines[0] ?? "" });
    const [request] = await db
      .insert(purchaseRequests)
      .values({ number: `26001-C${randomUUID().slice(0, 8)}`, linkKind: "quote_line", projectId, quoteLineId: lines[0] ?? "", requestedBy: fx.pm.id, itemName: "현수막", estimateAmountKrw: 90_000 })
      .returning({ id: purchaseRequests.id });
    if (!request) throw new Error("구매 요청 없음");
    await db.update(corpCardUsages).set({ registeredVia: "purchase", purchaseRequestId: request.id }).where(eq(corpCardUsages.id, purchased.id));
    const outInput: CardUsageInput = { corpCardId: fx.cardB.id, usedOn: USED_ON, merchantVendorId: null, total: { currency: "KRW", amount: 90_000, fxRate: 1 }, evidenceTypeCode: "card_receipt", linkKind: "out_of_quote", projectId, itemName: "견적 외" };
    const out = await createCardUsage(fx.pm, outInput, await precheckCardUsage(fx.pm, outInput));
    await db.update(corpCardUsages).set({ approvalNo: a2 }).where(eq(corpCardUsages.id, out.id));

    const result = await registerFixtureFile(fx.intake, lotteFixture([line(fx.cardB.last4, a1, 99_000, 9_000), line(fx.cardB.last4, a2, 99_000, 9_000)]));
    expect(result).toMatchObject({ cardMatched: 0, cardUnmatched: 2 });
    expect(await liveLinks(purchased.id)).toEqual([]);
    expect(await liveLinks(out.id)).toEqual([]);
    expect(await usageRow(out.id)).toMatchObject({ totalAmountKrw: 90_000 });
  });

  it("보유자 다름: 1단계 짝의 파일 카드가 다른 사람의 개인 카드 → 붙임 0 · 덮기 0", async () => {
    const fx = await setup();
    const other = await makePerson("다른보유자", DEFAULT_ROLE_ID, fx.teamName);
    const otherCard = await lotteCard({ kind: "personal", holderUserId: other.id });
    const a1 = approval();
    const u = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 204_100, approvalNo: a1 });
    const result = await registerFixtureFile(fx.intake, lotteFixture([line(otherCard.last4, a1, 204_100, 18_554)]));
    expect(result).toMatchObject({ cardMatched: 0, cardUnmatched: 1 });
    expect(await liveLinks(u.id)).toEqual([]);
    expect(await usageRow(u.id)).toMatchObject({ corpCardId: fx.cardA.id, version: u.version });
  });
});

describe("대사 — 동시성(E32 · N-8)", () => {
  it("(E32) 서로 다른 카드 파일 둘이 같은 카드 사용을 2단계 짝으로 노림 → 붙임 1행 · 뒤 등록은 짝 없음", async () => {
    const fx = await setup();
    const u = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardB.id, usedOn: USED_ON, totalKrw: 204_100 });
    const hold = deferred();
    const reached = deferred();
    const first = registerFixtureFile(fx.intake, lotteFixture([line(fx.cardB.last4, approval(), 204_100, 18_554)]), "첫.xls", {
      afterLock: async () => {
        reached.resolve();
        await hold.promise;
      },
    });
    await reached.promise;
    const second = registerFixtureFile(fx.intake, lotteFixture([line(fx.cardB.last4, approval(), 204_100, 18_554)]), "둘.xls");
    await waitForLockWaiter(pool);
    hold.resolve();
    const [a, b] = await Promise.all([first, second]);
    expect([a.cardMatched, b.cardMatched]).toEqual([1, 0]);
    expect(b.cardUnmatched).toBe(1);
    expect(await liveLinks(u.id)).toHaveLength(1);
  });

  it("applyFileWins 0행: 덮기 직전 version이 낡으면 그 짝은 붙지 않고 짝 없음 · 덮기 기록 0", async () => {
    const fx = await setup();
    const a1 = approval();
    const u = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 200_000, approvalNo: a1 });
    const result = await registerFixtureFile(fx.intake, lotteFixture([line(fx.cardB.last4, a1, 204_100, 18_554)]), "낡음.xls", {
      // 잠근 행은 밖에서 못 고친다 — 같은 트랜잭션으로 version만 올려 계획 version을 낡게 만든다.
      beforeApply: async (tx) => {
        await tx.update(corpCardUsages).set({ version: u.version + 5 }).where(eq(corpCardUsages.id, u.id));
      },
    });
    expect(result).toMatchObject({ cardMatched: 0, cardUnmatched: 1 });
    expect(await liveLinks(u.id)).toEqual([]);
    expect(await usageRow(u.id)).toMatchObject({ totalAmountKrw: 200_000, corpCardId: fx.cardA.id });
    expect(await amountLogs(u.id)).toHaveLength(0);
  });

  it("(N-8) 동시 상한: 등록이 견적 줄을 쥔 동안 같은 줄에 새 카드 사용 V를 출발 → V는 늘어난 공급가를 보고 상한 판정 · 줄 공급가 합 ≤ 실행가", async () => {
    const fx = await setup();
    const { lines } = await lineProject(fx.pm, [1_000_000]);
    const lineId = lines[0] ?? "";
    const a1 = approval();
    const u = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 110_000, approvalNo: a1, lineId });
    const hold = deferred();
    const reached = deferred();
    const registering = registerFixtureFile(fx.intake, lotteFixture([line(fx.cardA.last4, a1, 990_000, 90_000)]), "상한.xls", {
      afterLineLock: async () => {
        reached.resolve();
        await hold.promise;
      },
    });
    await reached.promise;
    const vInput: CardUsageInput = { corpCardId: fx.cardA.id, usedOn: USED_ON, merchantVendorId: null, total: { currency: "KRW", amount: 330_000, fxRate: 1 }, evidenceTypeCode: "card_receipt", linkKind: "quote_line", lineId };
    const vPre = await precheckCardUsage(fx.pm, vInput);
    const creating = createCardUsage(fx.pm, vInput, vPre).then(
      () => "created" as const,
      () => "blocked" as const,
    );
    await waitForLockWaiter(pool);
    hold.resolve();
    const [registered, v] = await Promise.all([registering, creating]);
    expect(registered.cardMatched).toBe(1);
    expect(v).toBe("blocked");
    const supplies = await db.select({ supplyKrw: corpCardUsages.supplyKrw }).from(corpCardUsages).where(and(eq(corpCardUsages.quoteLineId, lineId), isNull(corpCardUsages.archivedAt)));
    expect(supplies.reduce((sum, row) => sum + row.supplyKrw, 0)).toBeLessThanOrEqual(1_000_000);
    expect((await usageRow(u.id)).totalAmountKrw).toBe(990_000);
  });

  it("(N-8 거꾸로) V를 먼저 커밋시키면 대사는 V 공급가를 보고 U 짝을 실행가 초과 막힌 행으로", async () => {
    const fx = await setup();
    const { lines } = await lineProject(fx.pm, [1_000_000]);
    const lineId = lines[0] ?? "";
    const a1 = approval();
    const u = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 110_000, approvalNo: a1, lineId });
    await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 330_000, lineId });
    const result = await registerFixtureFile(fx.intake, lotteFixture([line(fx.cardA.last4, a1, 990_000, 90_000)]));
    expect(result).toMatchObject({ cardMatched: 0, cardUnmatched: 1 });
    expect((await usageRow(u.id)).totalAmountKrw).toBe(110_000);
  });
});

// 06.1-09 독립 검토 P2-1: 등록 tx의 잠금 한 줄 순서 — 프로젝트 → 문서 → 견적 줄 → 카드 사용 → 증빙 행 → 붙임. 앞 파일로 등록된 원거래 R의
// 취소 줄과 카드 사용 U 짝 줄이 한 파일에 들면, 등록은 견적 줄 · 카드 사용을 다 잡기 전에는 R을 잠그지 않는다 — S4 붙이기(견적 줄 → U → R)와
// S8 대리 등록(프로젝트 → 견적 줄 → 새 카드 사용 → R)이 앞 자원을 쥔 채 R을 기다려도 교착이 생기지 않는다.
describe("대사 — 잠금 순서(06.1-09 검토 P2-1)", () => {
  const ORIGINAL_DATE = "2026.04.05";
  const CANCEL_DATE = "2026.04.20";

  async function registeredOriginal(fx: Fx): Promise<{ recordId: string; approvalNo: string }> {
    const approvalNo = approval();
    const first = await registerFixtureFile(fx.intake, lotteFixture([line(fx.cardA.last4, approvalNo, 50_000, 4_545, ORIGINAL_DATE)]), "원거래.xls");
    return { recordId: await recordIdOf(first.batchId, approvalNo), approvalNo };
  }

  // holder가 앞 자원을 쥔 동안 등록을 출발 → 등록이 기다리기 시작하면 probe가 R(과 extra)을 NOWAIT로 잡아 본다.
  async function probeWhileHeld(holdSql: string, holdId: string, register: () => Promise<unknown>, probeIds: { recordId: string; usageId?: string }) {
    const holder = await pool.connect();
    await holder.query("BEGIN");
    await holder.query(holdSql, [holdId]);
    const registering = register();
    const free = { record: false, usage: false };
    try {
      await waitForLockWaiter(pool);
      // 자동 커밋 한 문장씩 — 잡자마자 놓는다(앞 NOWAIT 실패가 뒤 시도를 막지 않게).
      free.record = await pool.query("SELECT id FROM evidence_records WHERE id = $1 FOR UPDATE NOWAIT", [probeIds.recordId]).then(() => true, () => false);
      if (probeIds.usageId) free.usage = await pool.query("SELECT id FROM corp_card_usages WHERE id = $1 FOR UPDATE NOWAIT", [probeIds.usageId]).then(() => true, () => false);
    } finally {
      await holder.query("ROLLBACK");
      holder.release();
    }
    return { free, result: await registering };
  }

  it("다른 연결이 카드 사용 U를 쥔 동안(S4 붙이기 자리) 등록은 U에서 기다리고 원거래 R은 비어 있다(NOWAIT 성공) · 놓으면 붙임 1 · R 확인 필요", async () => {
    const fx = await setup();
    const original = await registeredOriginal(fx);
    const u = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 204_100 });
    const file = lotteFixture([
      line(fx.cardA.last4, original.approvalNo, 50_000, 4_545, ORIGINAL_DATE),
      line(fx.cardA.last4, original.approvalNo, -50_000, -4_545, CANCEL_DATE),
      line(fx.cardA.last4, approval(), 204_100, 18_554),
    ]);
    const { free, result } = await probeWhileHeld("SELECT id FROM corp_card_usages WHERE id = $1 FOR UPDATE", u.id, () => registerFixtureFile(fx.intake, file, "취소_짝.xls"), {
      recordId: original.recordId,
    });
    expect(free.record).toBe(true);
    expect(result).toMatchObject({ cardMatched: 1 });
    expect(await liveLinks(u.id)).toHaveLength(1);
    const [flagged] = await db.select({ needsCheck: evidenceRecords.needsCheck }).from(evidenceRecords).where(eq(evidenceRecords.id, original.recordId));
    expect(flagged?.needsCheck).not.toBeNull();
  });

  it("다른 연결이 견적 줄 L을 쥔 동안(S8 대리 등록 · 06 카드 사용 저장 자리) 등록은 L에서 기다리고 카드 사용 U · 원거래 R은 비어 있다", async () => {
    const fx = await setup();
    const original = await registeredOriginal(fx);
    const { lines } = await lineProject(fx.pm, [1_000_000]);
    const lineId = lines[0] ?? "";
    const a1 = approval();
    const u = await createCardUsageFixture(fx.pm, { corpCardId: fx.cardA.id, usedOn: USED_ON, totalKrw: 110_000, approvalNo: a1, lineId });
    const file = lotteFixture([
      line(fx.cardA.last4, original.approvalNo, 50_000, 4_545, ORIGINAL_DATE),
      line(fx.cardA.last4, original.approvalNo, -50_000, -4_545, CANCEL_DATE),
      line(fx.cardA.last4, a1, 220_000, 20_000),
    ]);
    const { free, result } = await probeWhileHeld("SELECT id FROM quote_lines WHERE id = $1 FOR UPDATE", lineId, () => registerFixtureFile(fx.intake, file, "취소_줄.xls"), {
      recordId: original.recordId,
      usageId: u.id,
    });
    expect(free).toEqual({ record: true, usage: true });
    expect(result).toMatchObject({ cardMatched: 1 });
    expect((await usageRow(u.id)).totalAmountKrw).toBe(220_000);
  });
});
