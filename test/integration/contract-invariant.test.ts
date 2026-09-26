import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, quoteLines, teams } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { approvalBasis } from "@/repositories/quote-revisions";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines, type QuoteLineWriteRow } from "@/domain/quotes/lines";
import { createRevisionFromCurrent, setCustomerApproval } from "@/domain/quotes/revisions";
import { listRevenue } from "@/domain/revenue";
import { restore } from "@/domain/archive";
import { kstToday } from "@/lib/kst-date";

// 04-16(사용자 D7 · CEO 리뷰 OV-1 · 엔지니어링 리뷰 GAP 1) — 「계약 금액은 항상 승인값과 같다」를 계약 금액 쪽에서 증명한다.
// 조작은 04-40이 잠근 서버 경로(saveQuoteLines · 보관함 restore)를 그대로 부르고, 매번 listRevenue의 계약 금액과 DB의 승인
// 차수 견적 합(보관 제외)이 둘 다 승인값인지 본다.

const LOCKED = "2차 고객 승인됨 · 고치려면 새 차수";
const APPROVED_TOTAL = 48_000_000;

type LineInsert = typeof quoteLines.$inferInsert;
type LineRow = typeof quoteLines.$inferSelect;

async function makePm(): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `계약 불변 계급-${randomUUID()}` });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `contract-${randomUUID()}@example.test`, name: "계약 불변 PM", roleId: role.id });
  for (const action of ["view", "write"] as const) {
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action, allowed: true });
  }
  for (const infoItem of ["project.value", "quote.amount"]) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  }
  return { id: userId, roleId: role.id };
}

async function insertLine(revisionId: string, patch: Partial<LineInsert>): Promise<LineRow> {
  const [row] = await db
    .insert(quoteLines)
    .values({ revisionId, subcategory: "기타", itemName: `항목-${randomUUID()}`, unitPriceAmountKrw: 0, executionAmountKrw: 0, quoteAmountKrw: 0, profitKrw: 0, ...patch })
    .returning();
  if (!row) throw new Error("줄 삽입 실패");
  return row;
}

async function reload(id: string): Promise<LineRow> {
  const [row] = await db.select().from(quoteLines).where(eq(quoteLines.id, id));
  if (!row) throw new Error("줄이 없습니다");
  return row;
}

async function dbQuoteTotal(revisionId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${quoteLines.quoteAmountKrw}), 0)::bigint`.mapWith(Number) })
    .from(quoteLines)
    .where(and(eq(quoteLines.revisionId, revisionId), isNull(quoteLines.archivedAt)));
  return row?.total ?? 0;
}

async function approve(pm: Viewer, revisionId: string) {
  const basis = await approvalBasis(SYSTEM_VIEWER, revisionId);
  await setCustomerApproval(pm, revisionId, { approvedOn: kstToday(new Date()), seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken });
}

const krw = (amount: number) => ({ currency: "KRW" as const, amount, fxRate: 1 });

function asInput(row: LineRow, patch: Partial<QuoteLineWriteRow> = {}): QuoteLineWriteRow {
  return {
    id: row.id,
    version: row.version,
    subcategory: row.subcategory,
    itemName: row.itemName,
    quantity: Number(row.quantity),
    unitPrice: {
      currency: row.unitPriceCurrency as "KRW" | "USD",
      amount: row.unitPriceCurrency === "KRW" ? row.unitPriceAmountKrw : Number(row.unitPriceForeignAmount),
      fxRate: Number(row.unitPriceFxRate),
    },
    execution: krw(row.executionAmountKrw),
    lineStatus: row.lineStatus,
    ...patch,
  };
}

function newRow(subcategory: string, patch: Partial<QuoteLineWriteRow> = {}): QuoteLineWriteRow {
  return { id: randomUUID(), isNew: true, subcategory, itemName: `새 줄-${randomUUID()}`, unitPrice: krw(0), execution: krw(10_000), ...patch };
}

// 1차에 KRW 줄(1,000,000 × 21) · USD 줄(20,000 × @1,350) · 5,000,000 줄을 두고 2차를 만든 뒤, 2차의 5,000,000 줄을 승인 전에
// 보관하고 2차를 승인한다 — 2차 견적 합계 48,000,000.
async function setupApproved() {
  const pm = await makePm();
  const client = await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}`, normalizedName: `거래처-${randomUUID()}` });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const [code] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
  if (!code) throw new Error("시드된 quote_subcategory 코드 항목이 없습니다");
  const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId: pm.id, name: `계약 불변-${randomUUID()}` });
  const first = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!first) throw new Error("1차 차수가 없습니다");

  await insertLine(first.id, { subcategory: code.value, sortOrder: 0, quantity: "21.00", unitPriceAmountKrw: 1_000_000, quoteAmountKrw: 21_000_000, profitKrw: 21_000_000 });
  await insertLine(first.id, {
    subcategory: code.value,
    sortOrder: 1,
    unitPriceCurrency: "USD",
    unitPriceForeignAmount: "20000.00",
    unitPriceFxRate: "1350.0000",
    unitPriceAmountKrw: 27_000_000,
    quoteAmountKrw: 27_000_000,
    profitKrw: 27_000_000,
  });
  await insertLine(first.id, { subcategory: code.value, sortOrder: 2, unitPriceAmountKrw: 5_000_000, quoteAmountKrw: 5_000_000, profitKrw: 5_000_000 });
  const { revisionId } = await createRevisionFromCurrent(pm, { projectId: project.id, fromRevisionId: first.id });
  const rows = await db.select().from(quoteLines).where(eq(quoteLines.revisionId, revisionId)).orderBy(quoteLines.sortOrder);
  const [krwLine, usdLine, toArchive] = rows;
  if (!krwLine || !usdLine || !toArchive) throw new Error("2차 줄 준비 실패");
  await db.update(quoteLines).set({ archivedAt: new Date(), archivedBy: SYSTEM_VIEWER.id }).where(eq(quoteLines.id, toArchive.id));

  await approve(pm, revisionId);
  return { pm, projectId: project.id, revisionId, subcategory: code.value, krwLine, usdLine, archivedLine: toArchive };
}

async function expectContractAt(s: { pm: Viewer; projectId: string; revisionId: string }, amountKrw: number) {
  const dto = await listRevenue(s.pm, s.projectId);
  expect(dto.contract?.amountKrw).toBe(amountKrw);
  expect(await dbQuoteTotal(s.revisionId)).toBe(amountKrw);
}

describe("계약 금액 = 승인 합계 불변식(04-16 · 사용자 D7 · OV-1 · GAP 1)", () => {
  it("승인 직후 계약 금액은 2차 견적 합계 48,000,000이다", async () => {
    const s = await setupApproved();
    await expectContractAt(s, APPROVED_TOTAL);
    expect((await listRevenue(s.pm, s.projectId)).contract?.sourceLabel).toBe("2차 고객 승인 합계");
  });

  it("(a) 수량 변경 · (b) 단가 변경은 거부되고 매번 계약 금액이 그대로다", async () => {
    const s = await setupApproved();
    await expect(saveQuoteLines(SYSTEM_VIEWER, s.revisionId, { rows: [asInput(s.krwLine, { quantity: 22 })] })).rejects.toThrow(LOCKED);
    await expectContractAt(s, APPROVED_TOTAL);
    await expect(saveQuoteLines(SYSTEM_VIEWER, s.revisionId, { rows: [asInput(s.krwLine, { unitPrice: krw(1_100_000) })] })).rejects.toThrow(LOCKED);
    await expectContractAt(s, APPROVED_TOTAL);
  });

  it("(c) 견적가 있는 새 줄 · (d) 견적가 있는 줄 취소 · (e) 견적가 있는 줄 보관은 거부되고 매번 계약 금액이 그대로다", async () => {
    const s = await setupApproved();
    await expect(saveQuoteLines(SYSTEM_VIEWER, s.revisionId, { rows: [newRow(s.subcategory, { unitPrice: krw(100_000) })] })).rejects.toThrow(LOCKED);
    await expectContractAt(s, APPROVED_TOTAL);
    await expect(saveQuoteLines(SYSTEM_VIEWER, s.revisionId, { rows: [asInput(s.krwLine, { lineStatus: "cancelled" })] })).rejects.toThrow(LOCKED);
    await expectContractAt(s, APPROVED_TOTAL);
    await expect(saveQuoteLines(SYSTEM_VIEWER, s.revisionId, { rows: [], archivedLineIds: [s.krwLine.id] })).rejects.toThrow(LOCKED);
    await expectContractAt(s, APPROVED_TOTAL);
  });

  it("(f) 승인 전에 보관해 둔 견적가 있는 줄의 복원은 거부되고 계약 금액이 그대로다", async () => {
    const s = await setupApproved();
    await expect(restore(SYSTEM_VIEWER, "quote_line", s.archivedLine.id)).rejects.toThrow(LOCKED);
    expect((await reload(s.archivedLine.id)).archivedAt).toBeInstanceOf(Date);
    await expectContractAt(s, APPROVED_TOTAL);
  });

  it("(g) 실행가 변경 · 견적 외 비용 새 줄 · 조정 새 줄은 통과하고 계약 금액이 그대로다", async () => {
    const s = await setupApproved();
    await saveQuoteLines(SYSTEM_VIEWER, s.revisionId, { rows: [asInput(s.krwLine, { execution: krw(9_000_000) })] });
    expect((await reload(s.krwLine.id)).executionAmountKrw).toBe(9_000_000);
    await expectContractAt(s, APPROVED_TOTAL);
    await saveQuoteLines(SYSTEM_VIEWER, s.revisionId, {
      rows: [newRow(s.subcategory, { lineKind: "out_of_quote" }), newRow(s.subcategory, { lineKind: "adjustment", execution: krw(-5_000) })],
    });
    await expectContractAt(s, APPROVED_TOTAL);
  });

  it("(h) USD 줄의 환율만 1,350 → 1,400으로 보낸 저장 · 통화만 바꾼 저장은 거부되고 계약 금액과 DB 합이 그대로다(GAP 1)", async () => {
    const s = await setupApproved();
    await expect(
      saveQuoteLines(SYSTEM_VIEWER, s.revisionId, { rows: [asInput(s.usdLine, { unitPrice: { currency: "USD", amount: 20_000, fxRate: 1400 } })] }),
    ).rejects.toThrow(LOCKED);
    await expectContractAt(s, APPROVED_TOTAL);
    await expect(saveQuoteLines(SYSTEM_VIEWER, s.revisionId, { rows: [asInput(s.usdLine, { unitPrice: krw(20_000) })] })).rejects.toThrow(LOCKED);
    await expectContractAt(s, APPROVED_TOTAL);
  });

  it("승인 표시를 끄면 `2차 고객 승인 전` · 수량을 고쳐 50,000,000으로 다시 승인하면 계약 금액이 50,000,000이다", async () => {
    const s = await setupApproved();
    await setCustomerApproval(s.pm, s.revisionId, null);
    const off = await listRevenue(s.pm, s.projectId);
    expect(off.contract?.amountKrw).toBeNull();
    expect(off.contract?.pendingLabel).toBe("2차 고객 승인 전");

    await saveQuoteLines(SYSTEM_VIEWER, s.revisionId, { rows: [asInput(s.krwLine, { quantity: 23 })] });
    await approve(s.pm, s.revisionId);
    await expectContractAt(s, 50_000_000);
  });

  it("(금지 항목) 3차를 만들면 `3차 고객 승인 전` — 2차 승인 합계로 대신하지 않는다", async () => {
    const s = await setupApproved();
    await createRevisionFromCurrent(s.pm, { projectId: s.projectId, fromRevisionId: s.revisionId });
    const dto = await listRevenue(s.pm, s.projectId);
    expect(dto.contract?.amountKrw).toBeNull();
    expect(dto.contract?.pendingLabel).toBe("3차 고객 승인 전");
  });
});
