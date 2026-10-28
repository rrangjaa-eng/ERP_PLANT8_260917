import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { evidenceRecords, teams } from "@/db/schema";
import { PAYMENT_METHOD_EVIDENCE_PAIRS } from "@/domain/settings/keys";
import { countEvidencePool, countRecommendedEvidence, evidencePickerMode, listEvidencePool } from "@/domain/evidence-records/pool";
import { rankRecordsForDocument } from "@/domain/evidence-records/score";
import { ATTACH_BATCH_MAX } from "@/domain/evidence-records/attach";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { insertOrgUnit } from "@/repositories/org-units";
import { insertTeam } from "@/repositories/teams";
import { upsertSimpleValue } from "@/repositories/settings";
import { teamIdByName } from "./approvals-fixtures";
import { setupExpenseProject, type ExpenseFixture } from "./fixtures/expenses";
import { createDraftExpenseFixture, createInReviewExpenseFixture, createIntakeManager, createPmInTeam, insertLiveLinkFixture, insertRecordFixture, setRecordArchivedFixture, setRecordTypeFixture, setRecordVisibilityFixture } from "./fixtures/evidence";

// 06.1-08 Task 1(EVID-07 · RP-5 · E34): 작성자 고르기 풀. 보는 범위는 06.1-05 scopeWhere 하나(실제 role-pm 두 팀), 그 위에 붙일 수 있는 상태 조각.
// 순위는 SQL — 같은 증빙을 순수 rankRecordsForDocument에 넣은 순서와 맞댄다.

let fx: ExpenseFixture;
let team1: string;
let division1: string;

beforeEach(async () => {
  fx = await setupExpenseProject();
  team1 = await teamIdByName("기획1팀");
  const [row] = await db.select({ orgUnitId: teams.orgUnitId }).from(teams).where(eq(teams.id, team1));
  if (!row) throw new Error("기획1팀 없음");
  division1 = row.orgUnitId;
  await upsertSimpleValue(SYSTEM_VIEWER, PAYMENT_METHOD_EVIDENCE_PAIRS.key, [], null);
});

async function publishTeam(recordId: string, teamId: string = team1): Promise<string> {
  await setRecordVisibilityFixture(recordId, { visibility: "team", teamId });
  return recordId;
}

// 07.1-09: 문서 증빙 종류를 정한다 — 종류 거름(검색어 없는 추천)이 걸리지 않게 하려면 null.
async function setDocType(expenseId: string, evidenceType: string | null): Promise<void> {
  await db.execute(sql`update expenses set evidence_type = ${evidenceType} where id = ${expenseId}`);
}

async function ids(viewer: Viewer, expenseId: string, q?: string): Promise<string[]> {
  const pool = await listEvidencePool(viewer, { owner: { kind: "expense", id: expenseId }, q });
  return pool.items.flatMap((item) => (item.id ? [item.id] : []));
}

describe("evidencePickerMode (06.1-08 RP-4)", () => {
  it("작성자 = 자기 임시 문서 · 팀장(작성자 아님) = none · 남의 팀 PM = none", async () => {
    const draft = await createDraftExpenseFixture(fx);
    const otherTeamPm = await createPmInTeam((await insertTeam(SYSTEM_VIEWER, { orgUnitId: (await insertOrgUnit(SYSTEM_VIEWER, { name: `다른본부-${randomUUID().slice(0, 6)}` })).id, name: `다른팀-${randomUUID().slice(0, 6)}` })).id);
    expect((await evidencePickerMode(fx.pm, { kind: "expense", id: draft })).mode).toBe("author");
    expect((await evidencePickerMode(fx.lead, { kind: "expense", id: draft })).mode).toBe("none");
    expect((await evidencePickerMode(otherTeamPm, { kind: "expense", id: draft })).mode).toBe("none");
  });

  it("결재 중 문서의 작성자 = none(D-6110) · 경영관리(붙이기 키 있음) = registrar · 키 없음 = none", async () => {
    const doc = await createInReviewExpenseFixture(fx);
    const keyed = await createIntakeManager("키있음", { attach: true });
    const keyless = await createIntakeManager("키없음", { attach: false });
    expect((await evidencePickerMode(fx.pm, { kind: "expense", id: doc.expenseId })).mode).toBe("none");
    expect((await evidencePickerMode(keyed, { kind: "expense", id: doc.expenseId })).mode).toBe("registrar");
    expect((await evidencePickerMode(keyless, { kind: "expense", id: doc.expenseId })).mode).toBe("none");
  });
});

describe("listEvidencePool — 작성자 풀 (06.1-08 EVID-07 · D-6108)", () => {
  it("1팀 공개 · 본부 공개만 — 미공개 · 2팀 공개 · 붙음 · 보관 · G15 종류 · 확인 필요 · 음수는 어느 쪽에도 없다", async () => {
    const draft = await createDraftExpenseFixture(fx);
    const intake = await createIntakeManager();
    const otherDivision = await insertOrgUnit(SYSTEM_VIEWER, { name: `풀다른본부-${randomUUID().slice(0, 6)}` });
    const otherTeam = await insertTeam(SYSTEM_VIEWER, { orgUnitId: otherDivision.id, name: `풀다른팀-${randomUUID().slice(0, 6)}` });
    const team1Row = await publishTeam(await insertRecordFixture(intake));
    const divisionRow = await insertRecordFixture(intake);
    await setRecordVisibilityFixture(divisionRow, { visibility: "division", orgUnitId: division1 });
    const privateRow = await insertRecordFixture(intake);
    const otherTeamRow = await publishTeam(await insertRecordFixture(intake), otherTeam.id);
    const attached = await publishTeam(await insertRecordFixture(intake));
    await insertLiveLinkFixture(attached, intake.id);
    const archived = await publishTeam(await insertRecordFixture(intake));
    await setRecordArchivedFixture(archived, intake.id);
    const privateType = await publishTeam(await insertRecordFixture(intake));
    await setRecordTypeFixture(privateType, "personal_card_receipt");
    const needsCheck = await publishTeam(await insertRecordFixture(intake));
    await db.update(evidenceRecords).set({ needsCheck: "취소 줄" }).where(eq(evidenceRecords.id, needsCheck));
    const negative = await publishTeam(await insertRecordFixture(intake, { supplyKrw: -50_000 }));

    const own = await ids(fx.pm, draft);
    expect(new Set(own)).toEqual(new Set([team1Row, divisionRow]));
    for (const excluded of [privateRow, otherTeamRow, attached, archived, privateType, needsCheck, negative]) expect(own).not.toContain(excluded);
    // 같은 본부의 다른 팀 PM(본부 공개는 보이고 1팀 공개는 안 보인다)은 같은 문서의 풀을 열 수 없다 — 문서의 작성자가 아니다.
    expect(await countEvidencePool(fx.pm, { kind: "expense", id: draft })).toBe(2);
  });

  it("경영관리 풀(registrar) = 붙일 수 있는 증빙 전부 — 미공개 · G15 종류 · 음수 포함, 붙음 · 보관 · 확인 필요는 없음", async () => {
    const doc = await createInReviewExpenseFixture(fx);
    await setDocType(doc.expenseId, null);
    const keyed = await createIntakeManager("키있음", { attach: true });
    const privateRow = await insertRecordFixture(keyed);
    const negative = await insertRecordFixture(keyed, { supplyKrw: -50_000 });
    const privateType = await insertRecordFixture(keyed);
    await setRecordTypeFixture(privateType, "personal_card_receipt");
    const attached = await insertRecordFixture(keyed);
    await insertLiveLinkFixture(attached, keyed.id);
    const archived = await insertRecordFixture(keyed);
    await setRecordArchivedFixture(archived, keyed.id);
    const needsCheck = await insertRecordFixture(keyed);
    await db.update(evidenceRecords).set({ needsCheck: "취소 줄" }).where(eq(evidenceRecords.id, needsCheck));
    const got = await ids(keyed, doc.expenseId);
    expect(new Set(got)).toEqual(new Set([privateRow, negative, privateType]));
  });

  it("못 보는 문서 · 작성자 아닌 사람의 풀 요청은 없는 지출결의와 같은 거부 하나", async () => {
    const draft = await createDraftExpenseFixture(fx);
    const stranger = await createPmInTeam(null);
    const messages = new Set<string>();
    for (const viewer of [fx.lead, stranger, fx.otherPm]) {
      const error = await listEvidencePool(viewer, { owner: { kind: "expense", id: draft } }).then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(Error);
      messages.add((error as Error).message);
    }
    expect(messages.size).toBe(1);
  });

  it("검색 — 거래처 이름 · 금액", async () => {
    const draft = await createDraftExpenseFixture(fx);
    const intake = await createIntakeManager();
    const byName = await publishTeam(await insertRecordFixture(intake, { nameOnDocument: "검색용상회", supplyKrw: 111_000 }));
    const byAmount = await publishTeam(await insertRecordFixture(intake, { nameOnDocument: "다른곳", supplyKrw: 777_000 }));
    expect(await ids(fx.pm, draft, "검색용")).toEqual([byName]);
    expect(await ids(fx.pm, draft, "777,000")).toEqual([byAmount]);
    expect(await ids(fx.pm, draft, "없는이름")).toEqual([]);
  });
});

describe("listEvidencePool — 순위 (E34 · G3)", () => {
  it("공개 증빙 25건 → SQL 20행 · 순서가 순수 rankRecordsForDocument 상위 20과 같다 · truncated · limit 20", async () => {
    const draft = await createDraftExpenseFixture(fx);
    await setDocType(draft, null);
    const intake = await createIntakeManager();
    const made: { id: string; supplyKrw: number; issuedOn: string; evidenceType: string }[] = [];
    for (let index = 0; index < 25; index += 1) {
      const supplyKrw = index % 5 === 0 ? 12_400_000 : 1_000_000 + index;
      const evidenceType = index % 3 === 0 ? "tax_invoice" : "cash_receipt";
      const issuedOn = `2026-09-${String(1 + (index % 28)).padStart(2, "0")}`;
      const id = await publishTeam(await insertRecordFixture(intake, { supplyKrw, evidenceType, issuedOn }));
      made.push({ id, supplyKrw, issuedOn, evidenceType });
    }
    const pool = await listEvidencePool(fx.pm, { owner: { kind: "expense", id: draft } });
    expect(pool.items).toHaveLength(20);
    expect(pool.truncated).toBe(true);
    expect(pool.limit).toBe(20);
    expect(pool.cap).toBe(ATTACH_BATCH_MAX);
    const [doc] = await db.execute<{ evidence_type: string | null; supply: string | null; usage: string | null }>(
      sql`select evidence_type, supply_amount_krw::text as supply, usage_date::text as usage from expenses where id = ${draft}`,
    ).then((result) => result.rows);
    const ranked = rankRecordsForDocument(
      { kind: "expense", evidenceType: doc?.evidence_type ?? null, businessNo: null, amountKrw: doc?.supply === null || doc?.supply === undefined ? null : Number(doc.supply), date: doc?.usage ?? null },
      made.map((row) => ({ id: row.id, evidenceType: row.evidenceType, businessNoDigits: null, supplyKrw: row.supplyKrw, totalKrw: row.supplyKrw, issuedOn: row.issuedOn, pairOk: true })),
    ).slice(0, 20);
    expect(pool.items.map((item) => item.id)).toEqual(ranked.map((row) => row.id));
    expect(pool.preselect).toEqual([ranked[0]?.id]);
  });

  it("짝 아닌 종류는 막힌 행으로 뒤에 선다(G3) — 점수가 높아도 짝 맞는 1건이 첫 행이고 고를 수 있다 · 후보 수에서 빠진다", async () => {
    const draft = await createDraftExpenseFixture(fx);
    await setDocType(draft, null);
    const intake = await createIntakeManager();
    // 문서 지급 방식 = bank_transfer 라고 두고, 짝 설정은 bank_transfer ↔ tax_invoice 하나뿐.
    await db.execute(sql`update expenses set payment_method = 'bank_transfer' where id = ${draft}`);
    await upsertSimpleValue(SYSTEM_VIEWER, PAYMENT_METHOD_EVIDENCE_PAIRS.key, [{ method: "bank_transfer", evidence: "tax_invoice" }], null);
    const mismatched: string[] = [];
    for (let index = 0; index < 22; index += 1) mismatched.push(await publishTeam(await insertRecordFixture(intake, { evidenceType: "cash_receipt", supplyKrw: 12_400_000 })));
    const paired = await publishTeam(await insertRecordFixture(intake, { evidenceType: "tax_invoice", supplyKrw: 5 }));
    const pool = await listEvidencePool(fx.pm, { owner: { kind: "expense", id: draft } });
    expect(pool.items[0]?.id).toBe(paired);
    expect(pool.items[0]?.selectable).toBe(true);
    expect(pool.items[1]?.selectable).toBe(false);
    expect(pool.items[1]?.reason).toContain("짝 아님");
    expect(pool.preselect).toEqual([paired]);
    expect(await countEvidencePool(fx.pm, { kind: "expense", id: draft })).toBe(1);
    expect(mismatched).toHaveLength(22);
  });
});

// 07.1-09 D-7124(C-92): 검색어 없는 추천은 문서 증빙 종류와 같은 증빙만(DB WHERE — 후보 집합), 검색어가 있으면 다른 종류도 나온다.
describe("listEvidencePool — 같은 종류만 (07.1-09 D-7124 · C-92)", () => {
  async function seedMixed(intake: Viewer): Promise<{ tax: string[]; card: string[] }> {
    const tax = [await publishTeam(await insertRecordFixture(intake, { evidenceType: "tax_invoice", nameOnDocument: "세금상회A" })), await publishTeam(await insertRecordFixture(intake, { evidenceType: "tax_invoice", nameOnDocument: "세금상회B" }))];
    const card = [
      await publishTeam(await insertRecordFixture(intake, { evidenceType: "card_receipt", nameOnDocument: "카드상회A" })),
      await publishTeam(await insertRecordFixture(intake, { evidenceType: "card_receipt", nameOnDocument: "카드상회B" })),
      await publishTeam(await insertRecordFixture(intake, { evidenceType: "card_receipt", nameOnDocument: "카드상회C" })),
    ];
    return { tax, card };
  }

  it("검색어 없음 + 문서 종류 있음 → 같은 종류만 · 부제 건수 2 · 트리거 건수 5(모든 종류)", async () => {
    const draft = await createDraftExpenseFixture(fx);
    const intake = await createIntakeManager();
    await setDocType(draft, "tax_invoice");
    const { tax } = await seedMixed(intake);
    expect(new Set(await ids(fx.pm, draft))).toEqual(new Set(tax));
    const recommended = await countRecommendedEvidence(fx.pm, draft);
    expect(recommended.count).toBe(2);
    expect(recommended.typeLabel).toBeTruthy();
    expect(await countEvidencePool(fx.pm, { kind: "expense", id: draft })).toBe(5);
  });

  it("검색어 있음 → 다른 종류도 나오고 줄 제목에 종류가 붙는다 · 부제 건수는 검색과 무관하게 2", async () => {
    const draft = await createDraftExpenseFixture(fx);
    const intake = await createIntakeManager();
    await setDocType(draft, "tax_invoice");
    const { card } = await seedMixed(intake);
    expect(await ids(fx.pm, draft, "카드상회A")).toEqual([card[0]]);
    const pool = await listEvidencePool(fx.pm, { owner: { kind: "expense", id: draft }, q: "카드상회A" });
    const other = (await countRecommendedEvidence(fx.pm, draft)).typeLabel;
    expect(pool.items[0]?.title).toMatch(/ · 카드상회A$/);
    expect(pool.items[0]?.title).not.toBe("카드상회A");
    expect(other).not.toBeNull();
    expect((await countRecommendedEvidence(fx.pm, draft)).count).toBe(2);
    const same = await listEvidencePool(fx.pm, { owner: { kind: "expense", id: draft }, q: "세금상회A" });
    expect(same.items[0]?.title).toBe("세금상회A");
  });

  it("문서 종류 null → 거름 없음(목록 5 · 부제 건수 5 · 트리거 건수 5)", async () => {
    const draft = await createDraftExpenseFixture(fx);
    const intake = await createIntakeManager();
    await setDocType(draft, null);
    await seedMixed(intake);
    expect((await ids(fx.pm, draft)).length).toBe(5);
    expect(await countRecommendedEvidence(fx.pm, draft)).toEqual({ count: 5, typeLabel: null });
    expect(await countEvidencePool(fx.pm, { kind: "expense", id: draft })).toBe(5);
  });

  it("다른 종류만 있는 문서 — 추천 0 · 트리거 건수 3 · 빈 목록 글자 · 검색으로 다른 종류에 닿는다", async () => {
    const draft = await createDraftExpenseFixture(fx);
    const intake = await createIntakeManager();
    await setDocType(draft, "tax_invoice");
    const card = [
      await publishTeam(await insertRecordFixture(intake, { evidenceType: "card_receipt", nameOnDocument: "카드만A" })),
      await publishTeam(await insertRecordFixture(intake, { evidenceType: "card_receipt", nameOnDocument: "카드만B" })),
      await publishTeam(await insertRecordFixture(intake, { evidenceType: "card_receipt", nameOnDocument: "카드만C" })),
    ];
    const pool = await listEvidencePool(fx.pm, { owner: { kind: "expense", id: draft } });
    expect(pool.items).toEqual([]);
    const recommended = await countRecommendedEvidence(fx.pm, draft);
    expect(recommended.count).toBe(0);
    expect(pool.emptyDefault).toBe(`${recommended.typeLabel} 증빙이 없습니다`);
    expect(await countEvidencePool(fx.pm, { kind: "expense", id: draft })).toBe(3);
    expect(await ids(fx.pm, draft, "카드만B")).toEqual([card[1]]);
    expect((await listEvidencePool(fx.pm, { owner: { kind: "expense", id: draft }, q: "없는이름" })).emptyDefault).toBeNull();
  });

  it("짝 맞지 않는 같은 종류는 부제 건수에서 빠진다(DB-16 그대로)", async () => {
    const draft = await createDraftExpenseFixture(fx);
    const intake = await createIntakeManager();
    await setDocType(draft, "tax_invoice");
    await db.execute(sql`update expenses set payment_method = 'bank_transfer' where id = ${draft}`);
    await upsertSimpleValue(SYSTEM_VIEWER, PAYMENT_METHOD_EVIDENCE_PAIRS.key, [{ method: "bank_transfer", evidence: "cash_receipt" }], null);
    await seedMixed(intake);
    expect((await countRecommendedEvidence(fx.pm, draft)).count).toBe(0);
  });
});
