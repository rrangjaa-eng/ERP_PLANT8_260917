import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { evidenceRecordLinks, projects, quoteLines } from "@/db/schema";
import { cardSlipNotFound, cardUsageReadScope } from "@/domain/corp-card-usages";
import { createCorpCard } from "@/domain/corp-cards";
import { attachEvidenceRecord, readCardUsageRights } from "@/domain/evidence-records/attach";
import type { PermissionAction } from "@/domain/permissions/menus";
import { rowScopeFor } from "@/domain/permissions/scope-for";
import type { ProjectStatus } from "@/domain/projects/status-transitions";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { canOpenProject } from "@/domain/projects/visibility";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { prepareQuoteLineSave, type QuoteLineWriteRow } from "@/domain/quotes/lines";
import { canSeePurchaseRequest } from "@/domain/purchase-requests";
import { saveRevenue } from "@/domain/revenue";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { grantFundKeys, makeFundPerson, makeFundRole } from "./fixtures/fund-scope";
import { createCardUsageFixture, insertRecordFixture } from "./fixtures/evidence";
import { purchaseProject, request } from "./fixtures/purchase-requests";

// 07.3-01 Q5(사용자 카드 2026-11-02 「넓힌 범위는 보기에만」): 자금 키로 넓힌 회사 전체 범위는 보기에만 쓴다.
// 일반 쓰기(견적 줄 · 기간 등)는 계급의 원래 범위(team)로 판정하고, 자금 작업(조정 줄 · 발행·입금 줄)만 그 키로 넓힌 범위에 닿는다.
// 세계: purchaseProject가 만든 새 팀 프로젝트(PM 박서연) — 경영관리팀 사람에게는 다른 팀 프로젝트다.

type Grant = readonly [menu: string, action: PermissionAction];

async function mgmtWith(name: string, grants: readonly Grant[]): Promise<Viewer> {
  const roleId = await makeFundRole("team");
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "projects", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "projects", action: "write", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "quote.amount", visible: true });
  for (const [menu, action] of grants) await grantFundKeys(roleId, [menu], action);
  return makeFundPerson(name, roleId, "경영관리팀");
}

async function statusOf(projectId: string): Promise<ProjectStatus> {
  const [row] = await db.select({ status: projects.status }).from(projects).where(eq(projects.id, projectId));
  if (!row) throw new Error("프로젝트 없음");
  return row.status as ProjectStatus;
}

async function quoteRow(lineId: string): Promise<QuoteLineWriteRow> {
  const [row] = await db.select().from(quoteLines).where(eq(quoteLines.id, lineId));
  if (!row) throw new Error("견적 줄 없음");
  return {
    id: row.id,
    subcategory: row.subcategory,
    itemName: `${row.itemName} 고침`,
    vendorId: row.vendorId,
    unitPrice: { currency: "KRW", amount: 1_500_000, fxRate: 1 },
    execution: { currency: "KRW", amount: 1_000_000, fxRate: 1 },
  };
}

async function adjustmentRow(): Promise<QuoteLineWriteRow> {
  const subcategory = (await firstSelectableSubcategory()).value;
  return {
    id: randomUUID(),
    isNew: true,
    lineKind: "adjustment",
    subcategory,
    itemName: `조정-${randomUUID().slice(0, 8)}`,
    unitPrice: { currency: "KRW", amount: 0, fxRate: 1 },
    execution: { currency: "KRW", amount: -5_000, fxRate: 1 },
  };
}

const PERIOD = { startDate: "2026-09-01", endDate: "2026-12-31" };

describe("넓힌 범위는 보기에만 (07.3-01 Q5)", () => {
  it("예산 보기 키만 — 다른 팀 프로젝트를 보지만 기간 · 견적 줄 저장은 없는 프로젝트와 같은 거절", async () => {
    const fx = await purchaseProject();
    const mgmt = await mgmtWith("경영관리 예산", [["projects.budget", "view"]]);
    expect((await rowScopeFor(mgmt, "project")).rows).toBe("all");
    expect(await canOpenProject(mgmt, fx.projectId)).toBe(true);

    const seenStatus = await statusOf(fx.projectId);
    await expect(
      saveProjectLedger(mgmt, fx.projectId, { seenStatus, period: { ...PERIOD, endDate: "2027-01-31", baseline: PERIOD } }),
    ).rejects.toThrow("존재하지 않는 프로젝트");
    await expect(
      saveProjectLedger(mgmt, fx.projectId, { seenStatus, quoteLines: { revisionId: fx.revisionId, rows: [await quoteRow(fx.onlineLine)] } }),
    ).rejects.toThrow();
    await expect(prepareQuoteLineSave(mgmt, fx.revisionId)).rejects.toThrow("존재하지 않는 차수");
    const [line] = await db.select({ itemName: quoteLines.itemName }).from(quoteLines).where(eq(quoteLines.id, fx.onlineLine));
    expect(line?.itemName).toBe("현장 소모품");
  });

  it("조정 쓰기 키 — 다른 팀 프로젝트에 조정 줄은 저장하지만 견적 줄 · 기간은 못 바꾼다", async () => {
    const fx = await purchaseProject();
    const mgmt = await mgmtWith("경영관리 조정", [["projects.adjustment", "write"]]);
    const seenStatus = await statusOf(fx.projectId);

    await expect(prepareQuoteLineSave(mgmt, fx.revisionId)).resolves.toMatchObject({ canAdjust: true, canWrite: false });
    await expect(
      saveProjectLedger(mgmt, fx.projectId, { seenStatus, quoteLines: { revisionId: fx.revisionId, rows: [await quoteRow(fx.onlineLine)] } }),
    ).rejects.toThrow();
    await expect(
      saveProjectLedger(mgmt, fx.projectId, { seenStatus, period: { ...PERIOD, endDate: "2027-01-31", baseline: PERIOD } }),
    ).rejects.toThrow("존재하지 않는 프로젝트");

    const adjustment = await adjustmentRow();
    const saved = await saveProjectLedger(mgmt, fx.projectId, { seenStatus, quoteLines: { revisionId: fx.revisionId, rows: [adjustment] } });
    expect(saved.quoteLines).not.toBeNull();
    const [stored] = await db.select({ lineKind: quoteLines.lineKind }).from(quoteLines).where(eq(quoteLines.id, adjustment.id));
    expect(stored?.lineKind).toBe("adjustment");
  });

  it("매출 정산 쓰기 키 — 다른 팀 프로젝트에 입금 줄을 저장한다(자금 작업)", async () => {
    const fx = await purchaseProject();
    const mgmt = await mgmtWith("경영관리 매출", [["projects.revenue", "write"]]);
    const entryId = randomUUID();
    const result = await saveRevenue(mgmt, fx.projectId, {
      paidEntries: [{ id: entryId, isNew: true, entryDate: "2026-10-01", amount: { currency: "KRW", amount: 1_000_000, fxRate: 1 } }],
    });
    expect(result).not.toBeNull();
  });
});

// 07.3-01 Q5 검토 F1: 카드 사용 · 구매 요청 목록은 자금 키로 넓힌 보기 범위(D-E1)를 쓰지만, 증빙 붙이기 · 떼기(값 덮기 포함)는 쓰기 범위다.
// 증빙 등록 쓰기 + 예산 보기(team 계급 · 대리 등록 · 지급 · 구매 처리 키 없음)는 다른 팀 카드 사용 · 구매 요청을 보지만 붙이지 못한다.
describe("넓힌 범위는 보기에만 — 증빙 붙이기 (07.3-01 Q5 F1)", () => {
  async function intakeWith(name: string, grants: readonly Grant[]): Promise<Viewer> {
    return mgmtWith(name, [["evidence.intake", "write"], ["evidence", "view"], ...grants]);
  }

  async function liveLinkCount(ownerId: string): Promise<number> {
    return (await db.select({ id: evidenceRecordLinks.id }).from(evidenceRecordLinks).where(eq(evidenceRecordLinks.ownerId, ownerId))).length;
  }

  async function otherTeamCardUsage(): Promise<string> {
    const fx = await purchaseProject();
    const last4 = String(1000 + Math.floor(Math.random() * 8999));
    const card = await createCorpCard(SYSTEM_VIEWER, { issuer: "롯데카드", numberLast4: last4, label: `범위 ${last4}`, kind: "personal", holderUserId: fx.pm.id });
    if (!card.id) throw new Error("카드 id 없음");
    return (await createCardUsageFixture(fx.pm, { corpCardId: card.id, usedOn: "2026-04-30", totalKrw: 200_000 })).id;
  }

  it("카드 사용 — 목록 범위는 전부지만 붙이기 권리는 없고 붙이기는 없는 카드 사용과 같은 거절", async () => {
    const usageId = await otherTeamCardUsage();
    const mgmt = await intakeWith("경영관리 예산 카드", [["projects.budget", "view"]]);
    expect(await cardUsageReadScope(mgmt)).toEqual({ kind: "all" });
    expect((await readCardUsageRights(mgmt, usageId))?.rights.attach ?? false).toBe(false);
    const recordId = await insertRecordFixture(mgmt);
    await expect(attachEvidenceRecord(mgmt, { recordId, owner: { kind: "corp_card_usage", id: usageId } })).rejects.toThrow(cardSlipNotFound().message);
    expect(await liveLinkCount(usageId)).toBe(0);
  });

  it("카드 사용 — 지급 처리 쓰기 키는 제 키로 붙이기 권리가 있다", async () => {
    const usageId = await otherTeamCardUsage();
    const payer = await intakeWith("경영관리 지급 카드", [["expenses.payments", "write"]]);
    expect((await readCardUsageRights(payer, usageId))?.rights.attach).toBe(true);
  });

  it("구매 요청 — 보기는 되지만 붙이기는 없는 구매 요청과 같은 거절, 구매 처리 쓰기 키는 붙인다", async () => {
    const fx = await purchaseProject();
    const created = await request(fx, fx.onlineLine);
    const mgmt = await intakeWith("경영관리 예산 구매", [["projects.budget", "view"]]);
    expect(await canSeePurchaseRequest(mgmt, { id: created.id })).toBe(true);
    const recordId = await insertRecordFixture(mgmt, { supplyKrw: 100_000, vatKrw: 10_000 });
    await expect(attachEvidenceRecord(mgmt, { recordId, owner: { kind: "purchase_request", id: created.id } })).rejects.toThrow("없는 구매 요청");
    expect(await liveLinkCount(created.id)).toBe(0);

    const purchaser = await intakeWith("경영관리 구매 처리", [["cards.purchases", "write"]]);
    const ownRecord = await insertRecordFixture(purchaser, { supplyKrw: 100_000, vatKrw: 10_000 });
    expect(await attachEvidenceRecord(purchaser, { recordId: ownRecord, owner: { kind: "purchase_request", id: created.id } })).toEqual({ created: true });
  });
});
