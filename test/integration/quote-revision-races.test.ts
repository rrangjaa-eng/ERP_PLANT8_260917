import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { codeItems, quoteLines, quoteRevisions, revenueEntries, teams } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines, type QuoteLineWriteRow } from "@/domain/quotes/lines";
import { createRevisionFromCurrent, setCustomerApproval } from "@/domain/quotes/revisions";
import { approvalBasis } from "@/repositories/quote-revisions";
import { kstToday } from "@/lib/kst-date";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { log } from "@/lib/log";
import { deferred, waitForLockWaiter } from "./lock-race";

// 04-40(OV-3 · B-01) — 한 프로젝트의 줄 저장·새 차수가 프로젝트 행 잠금으로 한 줄로 서고, 새 차수 뒤에 온 옛 차수
// 저장은 잠금 뒤 다시 읽은 현재 차수로 거부된다. 순서는 afterLock의 deferred와 waitForLockWaiter로 정한다(고정 지연 없음).

const STALE_REVISION = "다른 사람이 새 차수를 만듦 · 새로 고침";

async function makePm(): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `경합 계급-${randomUUID()}` });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `race-${randomUUID()}@example.test`, name: "경합 PM", roleId: role.id });
  for (const action of ["view", "write"] as const) {
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action, allowed: true });
  }
  for (const infoItem of ["project.value", "quote.amount"]) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  }
  return { id: userId, roleId: role.id };
}

async function setup() {
  const pm = await makePm();
  const client = await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}`, normalizedName: `거래처-${randomUUID()}` });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
  if (!subcategory) throw new Error("시드된 quote_subcategory 코드 항목이 없습니다");
  const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId: pm.id, name: `경합-${randomUUID()}` });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("1차 차수가 없습니다");
  const [line] = await db
    .insert(quoteLines)
    .values({
      revisionId: revision.id,
      subcategory: subcategory.value,
      itemName: `경합 줄-${randomUUID()}`,
      unitPriceAmountKrw: 100_000,
      executionAmountKrw: 50_000,
      quoteAmountKrw: 100_000,
      profitKrw: 50_000,
    })
    .returning();
  if (!line) throw new Error("줄 준비 실패");
  return { pm, projectId: project.id, revisionId: revision.id, line };
}

const krw = (amount: number) => ({ currency: "KRW" as const, amount, fxRate: 1 });

function asInput(row: typeof quoteLines.$inferSelect, patch: Partial<QuoteLineWriteRow> = {}): QuoteLineWriteRow {
  return {
    id: row.id,
    version: row.version,
    subcategory: row.subcategory,
    itemName: row.itemName,
    quantity: Number(row.quantity),
    unitPrice: krw(row.unitPriceAmountKrw),
    execution: krw(row.executionAmountKrw),
    lineStatus: row.lineStatus,
    ...patch,
  };
}

async function linesOf(revisionId: string) {
  return db.select().from(quoteLines).where(eq(quoteLines.revisionId, revisionId));
}

function deniedCalls(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.filter(([event]) => event === "write.denied").map(([, fields]) => fields as Record<string, unknown>);
}

function holdAfterLock() {
  const locked = deferred();
  const release = deferred();
  const afterLock = async () => {
    locked.resolve();
    await release.promise;
  };
  return { locked, release, afterLock };
}

// 대기 확인이 실패해도 잠금을 쥔 쪽을 풀어 뒤 테스트를 막지 않는다.
async function confirmWaiterThenRelease(release: { resolve: () => void }) {
  try {
    await waitForLockWaiter(pool);
  } finally {
    release.resolve();
  }
}

describe("새 차수 대 줄 저장 — 두 연결 결정적 경합(04-40 · OV-3 · B-01)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("풀 최대 커넥션이 3 이상이다(두 트랜잭션 + 관찰 연결 — 아니면 아래 경합이 가짜로 통과한다)", () => {
    expect(pool.options.max ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("(A) 새 차수가 잠금을 쥔 동안 온 1차 저장은 기다렸다가 「다른 사람이 새 차수를 만듦 · 새로 고침」으로 거부되고 두 차수 줄이 그대로다", async () => {
    const { pm, projectId, revisionId, line } = await setup();
    const hold = holdAfterLock();

    const creating = createRevisionFromCurrent(pm, { projectId, fromRevisionId: revisionId }, { afterLock: hold.afterLock });
    await hold.locked.promise;
    const saving = saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [asInput(line, { execution: krw(70_000) })] });
    await confirmWaiterThenRelease(hold.release);

    const [created, saved] = await Promise.allSettled([creating, saving]);
    expect(created.status).toBe("fulfilled");
    expect(saved.status).toBe("rejected");
    if (saved.status === "rejected") expect(String(saved.reason)).toContain(STALE_REVISION);

    const [first] = await linesOf(revisionId);
    expect(first?.executionAmountKrw).toBe(50_000);
    expect(first?.version).toBe(line.version);
    if (created.status !== "fulfilled") throw new Error("새 차수 실패");
    const second = await linesOf(created.value.revisionId);
    expect(second).toHaveLength(1);
    expect(second[0]?.executionAmountKrw).toBe(50_000);
  });

  it("(B) 저장이 잠금을 쥔 동안 온 새 차수는 기다렸다가 저장된 실행가를 2차에 복사한다", async () => {
    const { pm, projectId, revisionId, line } = await setup();
    const hold = holdAfterLock();

    const saving = saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [asInput(line, { execution: krw(70_000) })] }, { afterLock: hold.afterLock });
    await hold.locked.promise;
    const creating = createRevisionFromCurrent(pm, { projectId, fromRevisionId: revisionId });
    await confirmWaiterThenRelease(hold.release);

    const [saved, created] = await Promise.allSettled([saving, creating]);
    expect(saved.status).toBe("fulfilled");
    expect(created.status).toBe("fulfilled");
    if (created.status !== "fulfilled") throw new Error("새 차수 실패");
    const second = await linesOf(created.value.revisionId);
    expect(second).toHaveLength(1);
    expect(second[0]?.executionAmountKrw).toBe(70_000);
  });

  it("경합 없이 새 차수 뒤 1차로 저장하면 같은 거부 · DB 무변경 · write.denied 한 번(규칙 quote.current-revision, 금액 키 없음)", async () => {
    const { pm, projectId, revisionId, line } = await setup();
    const { revisionId: secondId } = await createRevisionFromCurrent(pm, { projectId, fromRevisionId: revisionId });
    const warn = vi.spyOn(log, "warn");

    await expect(saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [asInput(line, { execution: krw(70_000) })] })).rejects.toThrow(STALE_REVISION);

    expect((await linesOf(revisionId))[0]?.executionAmountKrw).toBe(50_000);
    expect((await linesOf(secondId))[0]?.executionAmountKrw).toBe(50_000);
    const denied = deniedCalls(warn);
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({ rule: "quote.current-revision", projectId, revisionId });
    expect(Object.keys(denied[0] ?? {}).some((key) => /amount|krw/i.test(key))).toBe(false);
  });

  it("경합 없이 새 차수 뒤 원장 합성 저장(1차 줄 + 매출 발행 줄)도 writeQuoteLinesInTx에서 같은 거부 · 견적 줄·매출 무변경 · write.denied 한 번", async () => {
    const { pm, projectId, revisionId, line } = await setup();
    const { revisionId: secondId } = await createRevisionFromCurrent(pm, { projectId, fromRevisionId: revisionId });
    const warn = vi.spyOn(log, "warn");

    await expect(
      saveProjectLedger(SYSTEM_VIEWER, projectId, {
        seenStatus: "bidding",
        quoteLines: { revisionId, rows: [asInput(line, { execution: krw(70_000) })] },
        revenue: { issuedEntries: [{ entryDate: "2026-09-01", amount: krw(1_000_000) }] },
      }),
    ).rejects.toThrow(STALE_REVISION);

    expect((await linesOf(revisionId))[0]?.executionAmountKrw).toBe(50_000);
    expect((await linesOf(secondId))[0]?.executionAmountKrw).toBe(50_000);
    expect(await db.select().from(revenueEntries).where(eq(revenueEntries.projectId, projectId))).toHaveLength(0);
    const denied = deniedCalls(warn);
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({ rule: "quote.current-revision", projectId, revisionId });
  });
});

const APPROVED_LOCK = "1차 고객 승인됨 · 고치려면 새 차수";
const BASIS_CHANGED = "견적이 바뀜 · 새로 고침";

async function basisNow(revisionId: string) {
  const basis = await approvalBasis(SYSTEM_VIEWER, revisionId);
  return { approvedOn: kstToday(), seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken };
}

async function approvedAt(revisionId: string): Promise<Date | null> {
  const [row] = await db.select().from(quoteRevisions).where(eq(quoteRevisions.id, revisionId));
  return row?.customerApprovedAt ?? null;
}

describe("승인 대 줄 저장 — 두 연결 결정적 경합(04-40 · OV-3 · B-07 · ENG-D9)", () => {
  it("(C) 승인이 잠금을 쥔 동안 온 수량 저장은 기다렸다가 승인 문구로 거부된다", async () => {
    const { pm, revisionId, line } = await setup();
    const hold = holdAfterLock();

    const approving = setCustomerApproval(pm, revisionId, await basisNow(revisionId), { afterLock: hold.afterLock });
    await hold.locked.promise;
    const saving = saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [asInput(line, { quantity: 2 })] });
    await confirmWaiterThenRelease(hold.release);

    const [approved, saved] = await Promise.allSettled([approving, saving]);
    expect(approved.status).toBe("fulfilled");
    expect(saved.status).toBe("rejected");
    if (saved.status === "rejected") expect(String(saved.reason)).toContain(APPROVED_LOCK);
    const [after] = await linesOf(revisionId);
    expect(after?.quantity).toBe(line.quantity);
    expect(after?.quoteAmountKrw).toBe(100_000);
  });

  it("(C') 승인이 잠금을 쥔 동안 온 실행가만 바꾼 저장은 기다렸다가 통과한다", async () => {
    const { pm, revisionId, line } = await setup();
    const hold = holdAfterLock();

    const approving = setCustomerApproval(pm, revisionId, await basisNow(revisionId), { afterLock: hold.afterLock });
    await hold.locked.promise;
    const saving = saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [asInput(line, { execution: krw(70_000) })] });
    await confirmWaiterThenRelease(hold.release);

    const [approved, saved] = await Promise.allSettled([approving, saving]);
    expect(approved.status).toBe("fulfilled");
    expect(saved.status).toBe("fulfilled");
    expect((await linesOf(revisionId))[0]?.executionAmountKrw).toBe(70_000);
  });

  it("(D) 저장이 잠금을 쥔 동안 저장 전에 읽은 기준값으로 온 승인은 「견적이 바뀜 · 새로 고침」으로 거부 · 미승인 그대로 → 새 기준값이면 저장 뒤 합계를 승인", async () => {
    const { pm, revisionId, line } = await setup();
    const staleBasis = await basisNow(revisionId);
    const hold = holdAfterLock();

    const saving = saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [asInput(line, { quantity: 2 })] }, { afterLock: hold.afterLock });
    await hold.locked.promise;
    const approving = setCustomerApproval(pm, revisionId, staleBasis);
    await confirmWaiterThenRelease(hold.release);

    const [saved, approved] = await Promise.allSettled([saving, approving]);
    expect(saved.status).toBe("fulfilled");
    expect(approved.status).toBe("rejected");
    if (approved.status === "rejected") expect(String(approved.reason)).toContain(BASIS_CHANGED);
    expect(await approvedAt(revisionId)).toBeNull();

    const fresh = await basisNow(revisionId);
    expect(fresh.seenTotalKrw).toBe(200_000);
    await setCustomerApproval(pm, revisionId, fresh);
    expect(await approvedAt(revisionId)).toBeInstanceOf(Date);
    expect((await approvalBasis(SYSTEM_VIEWER, revisionId)).totalKrw).toBe(200_000);
  });
});
