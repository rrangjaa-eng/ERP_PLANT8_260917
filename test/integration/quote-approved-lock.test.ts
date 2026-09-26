import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, quoteLines, revenueEntries, teams } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { approvalBasis } from "@/repositories/quote-revisions";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, listQuoteLines, saveQuoteLines, type QuoteLineWriteRow } from "@/domain/quotes/lines";
import { createRevisionFromCurrent, setCustomerApproval } from "@/domain/quotes/revisions";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { restore } from "@/domain/archive";
import { kstToday } from "@/lib/kst-date";
import { log } from "@/lib/log";

// 04-40(사용자 D7 · B-07 · ENG-D7 · OV-1 · OV-2 · GAP 1) — 승인된 현재 차수의 견적 합계는 새 차수 없이 바뀌지 않고, 실행가는
// 계속 고친다. 모든 거부 뒤 승인 차수의 견적 합계(보관 제외)가 승인 직전 값 그대로인지 DB로 단언한다.

const LOCKED = "2차 고객 승인됨 · 고치려면 새 차수";
const PAST_RESTORE = "이전 차수 줄은 복원할 수 없음 · 현재 차수에서 새로 생성";

async function makePm(): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `승인 잠금 계급-${randomUUID()}` });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `lock-${randomUUID()}@example.test`, name: "승인 잠금 PM", roleId: role.id });
  for (const action of ["view", "write"] as const) {
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action, allowed: true });
  }
  for (const infoItem of ["project.value", "quote.amount"]) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  }
  return { id: userId, roleId: role.id };
}

type LineInsert = typeof quoteLines.$inferInsert;
type LineRow = typeof quoteLines.$inferSelect;

async function insertLine(revisionId: string, patch: Partial<LineInsert>): Promise<LineRow> {
  const [row] = await db
    .insert(quoteLines)
    .values({
      revisionId,
      subcategory: "기타",
      itemName: `항목-${randomUUID()}`,
      unitPriceAmountKrw: 100_000,
      executionAmountKrw: 40_000,
      quoteAmountKrw: 100_000,
      profitKrw: 60_000,
      ...patch,
    })
    .returning();
  if (!row) throw new Error("줄 삽입 실패");
  return row;
}

async function reload(id: string): Promise<LineRow> {
  const [row] = await db.select().from(quoteLines).where(eq(quoteLines.id, id));
  if (!row) throw new Error("줄이 없습니다");
  return row;
}

async function quoteTotal(revisionId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${quoteLines.quoteAmountKrw}), 0)::bigint`.mapWith(Number) })
    .from(quoteLines)
    .where(and(eq(quoteLines.revisionId, revisionId), isNull(quoteLines.archivedAt)));
  return row?.total ?? 0;
}

async function approve(pm: Viewer, revisionId: string) {
  const basis = await approvalBasis(SYSTEM_VIEWER, revisionId);
  await setCustomerApproval(pm, revisionId, { approvedOn: kstToday(new Date()), seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken });
  return basis.totalKrw;
}

// 1차에 KRW 견적 줄 · USD 견적 줄 · 보관한 1차 줄을 두고 2차를 만든 뒤, 2차의 줄 하나를 승인 전에 보관하고 2차를 승인한다.
async function setupApproved() {
  const pm = await makePm();
  const client = await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}`, normalizedName: `거래처-${randomUUID()}` });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
  if (!subcategory) throw new Error("시드된 quote_subcategory 코드 항목이 없습니다");
  const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId: pm.id, name: `승인 잠금-${randomUUID()}` });
  const first = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!first) throw new Error("1차 차수가 없습니다");

  await insertLine(first.id, { subcategory: subcategory.value, sortOrder: 0 });
  await insertLine(first.id, {
    subcategory: subcategory.value,
    sortOrder: 1,
    unitPriceCurrency: "USD",
    unitPriceForeignAmount: "100.00",
    unitPriceFxRate: "1350.0000",
    unitPriceAmountKrw: 135_000,
    quoteAmountKrw: 135_000,
    profitKrw: 95_000,
  });
  await insertLine(first.id, { subcategory: subcategory.value, sortOrder: 2 });
  const { revisionId } = await createRevisionFromCurrent(pm, { projectId: project.id, fromRevisionId: first.id });
  const rows = await db.select().from(quoteLines).where(eq(quoteLines.revisionId, revisionId)).orderBy(quoteLines.sortOrder);
  const [krwLine, usdLine, toArchive] = rows;
  if (!krwLine || !usdLine || !toArchive) throw new Error("2차 줄 준비 실패");
  await db.update(quoteLines).set({ archivedAt: new Date(), archivedBy: SYSTEM_VIEWER.id }).where(eq(quoteLines.id, toArchive.id));
  const [firstLine] = await db.select().from(quoteLines).where(eq(quoteLines.revisionId, first.id)).orderBy(quoteLines.sortOrder);
  if (!firstLine) throw new Error("1차 줄이 없습니다");
  await db.update(quoteLines).set({ archivedAt: new Date(), archivedBy: SYSTEM_VIEWER.id }).where(eq(quoteLines.id, firstLine.id));

  const approvedTotal = await approve(pm, revisionId);
  return {
    pm,
    projectId: project.id,
    revisionId,
    subcategory: subcategory.value,
    krwLine: await reload(krwLine.id),
    usdLine: await reload(usdLine.id),
    archivedLine: await reload(toArchive.id),
    firstLine: await reload(firstLine.id),
    approvedTotal,
  };
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

function deniedCalls(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.filter(([event]) => event === "write.denied").map(([, fields]) => fields as Record<string, unknown>);
}

describe("승인 차수 잠금 — 단독 저장(04-40 · 사용자 D7 · ENG-D7 · OV-1 · GAP 1)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("수량 변경은 승인 문구로 거부 · write.denied 한 번(금액 없음) · 합계 그대로", async () => {
    const s = await setupApproved();
    const warn = vi.spyOn(log, "warn");

    await expect(saveQuoteLines(SYSTEM_VIEWER, s.revisionId, { rows: [asInput(s.krwLine, { quantity: 2 })] })).rejects.toThrow(LOCKED);

    expect(await quoteTotal(s.revisionId)).toBe(s.approvedTotal);
    const denied = deniedCalls(warn);
    expect(denied).toHaveLength(1);
    expect(denied[0]?.rule).toBe("project.line-edit");
    expect(Object.keys(denied[0] ?? {}).some((key) => /amount|krw/i.test(key))).toBe(false);
  });

  it("소분류 변경은 거부(ENG-D7)", async () => {
    const s = await setupApproved();
    await expect(saveQuoteLines(SYSTEM_VIEWER, s.revisionId, { rows: [asInput(s.krwLine, { subcategory: `${s.subcategory}-변경` })] })).rejects.toThrow(LOCKED);
    expect((await reload(s.krwLine.id)).subcategory).toBe(s.krwLine.subcategory);
  });

  it("실행가만 바꾼 저장은 통과하고 합계가 그대로다", async () => {
    const s = await setupApproved();
    await saveQuoteLines(SYSTEM_VIEWER, s.revisionId, { rows: [asInput(s.krwLine, { execution: krw(55_000) })] });
    expect((await reload(s.krwLine.id)).executionAmountKrw).toBe(55_000);
    expect(await quoteTotal(s.revisionId)).toBe(s.approvedTotal);
  });

  it("USD 줄의 금액은 그대로 두고 환율만 1,350 → 1,400으로 보낸 저장은 거부 · 합계 그대로(GAP 1)", async () => {
    const s = await setupApproved();
    await expect(
      saveQuoteLines(SYSTEM_VIEWER, s.revisionId, { rows: [asInput(s.usdLine, { unitPrice: { currency: "USD", amount: 100, fxRate: 1400 } })] }),
    ).rejects.toThrow(LOCKED);
    expect((await reload(s.usdLine.id)).unitPriceFxRate).toBe("1350.0000");
    expect(await quoteTotal(s.revisionId)).toBe(s.approvedTotal);
  });

  it("같은 USD 줄의 통화만 KRW로 바꾼 저장은 거부 · 합계 그대로(GAP 1)", async () => {
    const s = await setupApproved();
    await expect(saveQuoteLines(SYSTEM_VIEWER, s.revisionId, { rows: [asInput(s.usdLine, { unitPrice: krw(100) })] })).rejects.toThrow(LOCKED);
    expect((await reload(s.usdLine.id)).unitPriceCurrency).toBe("USD");
    expect(await quoteTotal(s.revisionId)).toBe(s.approvedTotal);
  });

  it("단가 100,000 새 줄은 거부 · 단가 0 새 줄은 통과(수량 1 · 단가 0 저장)", async () => {
    const s = await setupApproved();
    await expect(saveQuoteLines(SYSTEM_VIEWER, s.revisionId, { rows: [newRow(s.subcategory, { unitPrice: krw(100_000) })] })).rejects.toThrow(LOCKED);
    const zero = newRow(s.subcategory);
    await saveQuoteLines(SYSTEM_VIEWER, s.revisionId, { rows: [zero] });
    const saved = await reload(zero.id);
    expect(saved.quantity).toBe("1.00");
    expect(saved.unitPriceAmountKrw).toBe(0);
    expect(await quoteTotal(s.revisionId)).toBe(s.approvedTotal);
  });

  it("견적가 있는 줄의 복제(새 줄)는 거부 · 합계 그대로", async () => {
    const s = await setupApproved();
    const copy = { ...asInput(s.krwLine), id: randomUUID(), isNew: true as const, duplicatedFrom: s.krwLine.id, version: undefined };
    await expect(saveQuoteLines(SYSTEM_VIEWER, s.revisionId, { rows: [copy] })).rejects.toThrow(LOCKED);
    expect(await quoteTotal(s.revisionId)).toBe(s.approvedTotal);
  });

  it("견적가 있는 줄의 취소와 보관은 거부 · 합계 그대로", async () => {
    const s = await setupApproved();
    await expect(saveQuoteLines(SYSTEM_VIEWER, s.revisionId, { rows: [asInput(s.krwLine, { lineStatus: "cancelled" })] })).rejects.toThrow(LOCKED);
    await expect(saveQuoteLines(SYSTEM_VIEWER, s.revisionId, { rows: [], archivedLineIds: [s.krwLine.id] })).rejects.toThrow(LOCKED);
    expect((await reload(s.krwLine.id)).archivedAt).toBeNull();
    expect(await quoteTotal(s.revisionId)).toBe(s.approvedTotal);
  });

  it("견적 외 비용 · 조정 새 줄은 통과한다", async () => {
    const s = await setupApproved();
    await saveQuoteLines(SYSTEM_VIEWER, s.revisionId, {
      rows: [newRow(s.subcategory, { lineKind: "out_of_quote" }), newRow(s.subcategory, { lineKind: "adjustment", execution: krw(-5_000) })],
    });
    expect(await quoteTotal(s.revisionId)).toBe(s.approvedTotal);
  });

  it("listQuoteLines가 승인 차수의 기존 견적 줄에 수량·단가·상태·소분류 locked를 싣는다", async () => {
    const s = await setupApproved();
    const lines = await listQuoteLines(SYSTEM_VIEWER, s.revisionId, { status: "bidding", canWrite: true });
    const line = lines.find((entry) => entry.id === s.krwLine.id);
    expect(line?.cellEditability).toMatchObject({ quantity: "locked", unitPrice: "locked", lineStatus: "locked", subcategory: "locked", execution: "edit" });
  });

  it("승인 표시를 끄면 같은 수량·소분류 변경이 통과한다", async () => {
    const s = await setupApproved();
    await setCustomerApproval(s.pm, s.revisionId, null);
    await saveQuoteLines(SYSTEM_VIEWER, s.revisionId, { rows: [asInput(s.krwLine, { quantity: 2, subcategory: `${s.subcategory}-변경` })] });
    const after = await reload(s.krwLine.id);
    expect(after.quantity).toBe("2.00");
    expect(after.quoteAmountKrw).toBe(200_000);
  });
});

describe("승인 차수 잠금 — 보관함 복원(04-40 · OV-2 · B-01)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("승인 전에 보관해 둔 견적가 있는 줄의 복원은 승인 문구로 거부 · 합계 그대로", async () => {
    const s = await setupApproved();
    await expect(restore(SYSTEM_VIEWER, "quote_line", s.archivedLine.id)).rejects.toThrow(LOCKED);
    expect((await reload(s.archivedLine.id)).archivedAt).toBeInstanceOf(Date);
    expect(await quoteTotal(s.revisionId)).toBe(s.approvedTotal);
  });

  it("1차(현재 아님) 줄의 복원은 「이전 차수의 줄은 복원할 수 없습니다」 · write.denied 한 번", async () => {
    const s = await setupApproved();
    const warn = vi.spyOn(log, "warn");
    await expect(restore(SYSTEM_VIEWER, "quote_line", s.firstLine.id)).rejects.toThrow(PAST_RESTORE);
    expect((await reload(s.firstLine.id)).archivedAt).toBeInstanceOf(Date);
    expect(deniedCalls(warn)).toHaveLength(1);
  });
});

describe("승인 차수 잠금 — 원장 합성 저장(04-40 · writeQuoteLinesInTx 공통)", () => {
  it("수량 변경 · USD 환율만 바꾼 저장은 같은 승인 문구로 거부되고 매출 발행 줄 무변경, 실행가만 바꾼 저장은 통과", async () => {
    const s = await setupApproved();
    const revenue = { issuedEntries: [{ entryDate: "2026-09-01", amount: krw(1_000_000) }] };

    await expect(
      saveProjectLedger(SYSTEM_VIEWER, s.projectId, { seenStatus: "bidding", quoteLines: { revisionId: s.revisionId, rows: [asInput(s.krwLine, { quantity: 2 })] }, revenue }),
    ).rejects.toThrow(LOCKED);
    await expect(
      saveProjectLedger(SYSTEM_VIEWER, s.projectId, {
        seenStatus: "bidding",
        quoteLines: { revisionId: s.revisionId, rows: [asInput(s.usdLine, { unitPrice: { currency: "USD", amount: 100, fxRate: 1400 } })] },
        revenue,
      }),
    ).rejects.toThrow(LOCKED);
    expect(await db.select().from(revenueEntries).where(eq(revenueEntries.projectId, s.projectId))).toHaveLength(0);
    expect(await quoteTotal(s.revisionId)).toBe(s.approvedTotal);

    await saveProjectLedger(SYSTEM_VIEWER, s.projectId, { seenStatus: "bidding", quoteLines: { revisionId: s.revisionId, rows: [asInput(s.krwLine, { execution: krw(60_000) })] } });
    expect((await reload(s.krwLine.id)).executionAmountKrw).toBe(60_000);
    expect(await quoteTotal(s.revisionId)).toBe(s.approvedTotal);
  });
});
