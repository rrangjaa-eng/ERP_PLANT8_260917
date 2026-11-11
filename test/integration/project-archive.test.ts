import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db/client";
import {
  actionLog,
  expenses,
  projectBudgetEntries,
  projects,
  purchaseRequests,
  quoteLines,
  quoteRevisions,
  reserveEntries,
  revenueIssueRequests,
  settlementApprovals,
  teams,
} from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { SYSADMIN_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { upsertPermission } from "@/repositories/permissions";
import { createExpenseFromLines, deleteExpenseDraft, restoreExpenseDraft, submitExpense } from "@/domain/expenses";
import { saveReserves } from "@/domain/reserves";
import { saveRevenue } from "@/domain/revenue";
import { setBudgetManually } from "@/domain/projects/budget";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { submitSettlement } from "@/domain/settlements";
import { createPurchaseRequest, precheckPurchaseRequest } from "@/domain/purchase-requests";
import { countMoneyAttachments } from "@/domain/projects/money-attachment";
import { archiveProject, deleteRights, findDeletedProjectForUndo, restoreProject } from "@/domain/projects/archive";
import { linkedDocumentReason } from "@/domain/quotes/edit-scope";
import { archive, ForbiddenError, listArchive, ProtectedRowError, restore } from "@/domain/archive";
import { setupExpenseProject, type ExpenseFixture } from "./fixtures/expenses";
import { grantFundKeys, makeFundPerson, makeFundRole } from "./fixtures/fund-scope";
import { issueRevenue, linkCardUsage, setupSettlementProject } from "./fixtures/settlements";
import { makePerson } from "./approvals-fixtures";
import { deferred, waitForLockWaiter } from "./lock-race";
import { purchaseProject, requestInput } from "./fixtures/purchase-requests";

// 07.2-17(PU1 · D-7210~D-7213 · PU22 ①) — 프로젝트 삭제 = 보관. 돈 문서 7종(D-7211) 판정 · 같은 시각 줄 보관 · 되돌리기 · 권리(쓰기 범위).
// 세계: setupExpenseProject(기획1팀 · PM 박서연 · 팀장 김도윤 · 진행 · 1차 고객 승인 · 견적 줄 3). 자동 예산 줄(initial · new_approved_revision)은
// 돈 문서가 아니다(플래너 가정 — manual만 센다).

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error("거부될 줄 알았는데 통과했다");
}

async function projectRow(projectId: string) {
  const [row] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!row) throw new Error("프로젝트 없음");
  return row;
}

async function linesOf(projectId: string) {
  return db
    .select({ id: quoteLines.id, archivedAt: quoteLines.archivedAt, archivedBy: quoteLines.archivedBy })
    .from(quoteLines)
    .innerJoin(quoteRevisions, eq(quoteRevisions.id, quoteLines.revisionId))
    .where(eq(quoteRevisions.projectId, projectId));
}

async function revisionCount(projectId: string): Promise<number> {
  return (await db.select({ id: quoteRevisions.id }).from(quoteRevisions).where(eq(quoteRevisions.projectId, projectId))).length;
}

async function projectLogs(projectId: string, actionType: string) {
  return db.select().from(actionLog).where(and(eq(actionLog.entity, "project"), eq(actionLog.entityId, projectId), eq(actionLog.actionType, actionType)));
}

// 앞서 지운 줄 하나 — 보관 시각이 과거로 고정된 줄(프로젝트 보관 · 복원이 건드리지 않아야 한다).
const EARLIER = new Date("2026-01-02T03:04:05.000Z");
async function archiveLineEarlier(fx: ExpenseFixture): Promise<void> {
  await db.update(quoteLines).set({ archivedAt: EARLIER, archivedBy: fx.pm.id }).where(eq(quoteLines.id, fx.lines.noVendor));
}

// 돈 문서 7종을 하나씩 붙이는 도우미 — 판정 수만 보는 사례라 리포지토리 꼴의 직접 삽입을 쓴다(도메인 쓰기 길은 Task 2가 따로 본다).
type MoneyKind = "expense" | "revenue" | "issueRequest" | "reserve" | "purchaseRequest" | "cardUsage" | "budget" | "settlement";

async function attachMoney(fx: ExpenseFixture, kind: MoneyKind): Promise<void> {
  switch (kind) {
    case "expense": {
      const result = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
      if (result.created.length !== 1) throw new Error(`지출결의 못 만듦: ${JSON.stringify(result.blocked)}`);
      return;
    }
    case "revenue":
      await issueRevenue(fx.projectId);
      return;
    case "issueRequest":
      await db.insert(revenueIssueRequests).values({
        projectId: fx.projectId,
        desiredIssueDate: "2026-10-01",
        amountCurrency: "KRW",
        amountForeignAmount: null,
        amountFxRate: "1.0000",
        amountAmountKrw: 100_000,
        requestedBy: fx.pm.id,
      });
      return;
    case "reserve": {
      const [project] = await db.select({ clientId: projects.clientId }).from(projects).where(eq(projects.id, fx.projectId));
      if (!project) throw new Error("프로젝트 없음");
      await db.insert(reserveEntries).values({
        clientId: project.clientId,
        entryDate: "2026-10-01",
        direction: "deposit",
        amountCurrency: "KRW",
        amountForeignAmount: null,
        amountFxRate: "1.0000",
        amountAmountKrw: 100_000,
        projectId: fx.projectId,
      });
      return;
    }
    case "purchaseRequest":
      await insertPurchaseRequest(fx, "requested");
      return;
    case "cardUsage":
      await linkCardUsage(fx.pm, fx.lines.split);
      return;
    case "budget":
      await db.insert(projectBudgetEntries).values({ projectId: fx.projectId, reason: "manual", deltaKrw: 10_000, memo: "직접 고침", createdBy: fx.lead.id });
      return;
    case "settlement":
      await db.insert(settlementApprovals).values({ projectId: fx.projectId, drafterId: fx.pm.id });
      return;
  }
}

async function insertPurchaseRequest(fx: ExpenseFixture, status: "requested" | "cancelled"): Promise<string> {
  const [row] = await db
    .insert(purchaseRequests)
    .values({
      number: `PR-${randomUUID().slice(0, 8)}`,
      linkKind: "quote_line",
      projectId: fx.projectId,
      quoteLineId: fx.lines.withVendor,
      requestedBy: fx.pm.id,
      itemName: "구매 품목",
      estimateCurrency: "KRW",
      estimateForeignAmount: null,
      estimateFxRate: "1.0000",
      estimateAmountKrw: 50_000,
      status,
      ...(status === "cancelled" ? { cancelledAt: new Date(), cancelledBy: fx.pm.id, cancelReason: "취소" } : {}),
    })
    .returning({ id: purchaseRequests.id });
  if (!row) throw new Error("구매 요청 없음");
  return row.id;
}

describe("프로젝트 보관(삭제) — 돈 문서 0건 · 같은 시각 줄 보관(D-7210 · D-7212)", () => {
  it("돈 문서 0건 프로젝트를 팀장이 지우면 프로젝트 · 살아 있던 줄이 같은 시각 · 같은 사람으로 보관되고 앞서 지운 줄은 그대로다", async () => {
    const fx = await setupExpenseProject();
    await archiveLineEarlier(fx);
    const now = new Date("2026-10-05T01:02:03.000Z");

    const result = await archiveProject(fx.lead, fx.projectId, { now: () => now });

    expect(result).toEqual({ archived: true, number: fx.projectNumber });
    const row = await projectRow(fx.projectId);
    expect(row.archivedAt?.toISOString()).toBe(now.toISOString());
    expect(row.archivedBy).toBe(fx.lead.id);
    const lines = await linesOf(fx.projectId);
    const live = lines.filter((line) => line.id !== fx.lines.noVendor);
    expect(live).toHaveLength(2);
    for (const line of live) {
      expect(line.archivedAt?.toISOString()).toBe(now.toISOString());
      expect(line.archivedBy).toBe(fx.lead.id);
    }
    const earlier = lines.find((line) => line.id === fx.lines.noVendor);
    expect(earlier?.archivedAt?.toISOString()).toBe(EARLIER.toISOString());
    expect(earlier?.archivedBy).toBe(fx.pm.id);
    const logs = await projectLogs(fx.projectId, "archive");
    expect(logs).toHaveLength(1);
    expect(logs[0]?.actorId).toBe(fx.lead.id);
  });

  it("이미 보관된 프로젝트를 다시 지우면 바꾸지 않고 archived false다", async () => {
    const fx = await setupExpenseProject();
    await archiveProject(fx.lead, fx.projectId);
    // 보관된 프로젝트는 쓰기 범위에서 사라지지 않는다(행 범위는 보관을 거르지 않는다) — 잠금 뒤 이미 보관으로 끝난다.
    expect(await archiveProject(fx.lead, fx.projectId)).toEqual({ archived: false, number: fx.projectNumber });
    expect(await projectLogs(fx.projectId, "archive")).toHaveLength(1);
  });
});

describe("돈 문서 7종 판정(D-7211 · countMoneyAttachments)", () => {
  const kinds: MoneyKind[] = ["expense", "revenue", "issueRequest", "reserve", "purchaseRequest", "cardUsage", "budget", "settlement"];
  for (const kind of kinds) {
    it(`${kind} 1건이 붙으면 「돈 문서 1건 연결 · 삭제 불가」로 막힌다`, async () => {
      const fx = await setupExpenseProject();
      await attachMoney(fx, kind);
      const counted = await countMoneyAttachments(SYSTEM_VIEWER, fx.projectId);
      expect(counted.total).toBe(1);
      const error = await rejection(archiveProject(fx.lead, fx.projectId));
      expect(error.message).toBe("돈 문서 1건 연결 · 삭제 불가");
      expect((await projectRow(fx.projectId)).archivedAt).toBeNull();
    });
  }

  it("둘이 붙으면 2건이다", async () => {
    const fx = await setupExpenseProject();
    await attachMoney(fx, "budget");
    await attachMoney(fx, "settlement");
    const error = await rejection(archiveProject(fx.lead, fx.projectId));
    expect(error.message).toBe("돈 문서 2건 연결 · 삭제 불가");
  });

  it("삭제된 지출결의 · 취소된 구매 요청 · 보관된 리저브 · 취소된 발행 요청 · 자동 예산 줄만 있으면 0건이라 지워진다", async () => {
    const fx = await setupExpenseProject();
    await attachMoney(fx, "expense");
    await db.update(expenses).set({ deletedAt: new Date(), deletedBy: fx.pm.id }).where(eq(expenses.projectId, fx.projectId));
    await insertPurchaseRequest(fx, "cancelled");
    await attachMoney(fx, "reserve");
    await db.update(reserveEntries).set({ archivedAt: new Date(), archivedBy: fx.lead.id }).where(eq(reserveEntries.projectId, fx.projectId));
    await attachMoney(fx, "issueRequest");
    await db
      .update(revenueIssueRequests)
      .set({ status: "cancelled", cancelledAt: new Date(), cancelledBy: fx.pm.id })
      .where(eq(revenueIssueRequests.projectId, fx.projectId));
    // 등록 · PO 저장 · 승인 차수가 자동으로 만드는 예산 줄(원가율 설정이 없는 시험 DB라 직접 넣는다).
    await db.insert(projectBudgetEntries).values([
      { projectId: fx.projectId, reason: "initial", baseAmountKrw: 1_000_000, costRatePct: "70.0", deltaKrw: 700_000, createdBy: fx.pm.id },
      { projectId: fx.projectId, reason: "new_approved_revision", baseAmountKrw: 2_000_000, costRatePct: "70.0", deltaKrw: 700_000, createdBy: fx.pm.id },
    ]);

    expect((await countMoneyAttachments(SYSTEM_VIEWER, fx.projectId)).total).toBe(0);
    expect((await archiveProject(fx.lead, fx.projectId)).archived).toBe(true);
  });

  it("PU22 ① — 견적 줄에 취소 아닌 구매 요청이 걸리면 막히고, 취소하면 지워진다 · 줄 하나 지우기 잠금은 그대로다", async () => {
    const fx = await setupExpenseProject();
    const requestId = await insertPurchaseRequest(fx, "requested");
    expect((await rejection(archiveProject(fx.lead, fx.projectId))).message).toBe("돈 문서 1건 연결 · 삭제 불가");
    expect(linkedDocumentReason("PR-1")).toContain("PR-1");
    await db
      .update(purchaseRequests)
      .set({ status: "cancelled", cancelledAt: new Date(), cancelledBy: fx.pm.id, cancelReason: "취소" })
      .where(eq(purchaseRequests.id, requestId));
    expect((await archiveProject(fx.lead, fx.projectId)).archived).toBe(true);
  });
});

describe("권리 — projects.delete 쓰기 + 쓰기 범위(D-7213 · eng r2 D P2-3)", () => {
  it("projects.delete 없는 계급(사원 · 담당 PM이라도)은 거부된다", async () => {
    const fx = await setupExpenseProject();
    expect(await deleteRights(fx.pm, fx.projectId)).toBe(false);
    await rejection(archiveProject(fx.pm, fx.projectId));
    expect((await projectRow(fx.projectId)).archivedAt).toBeNull();
  });

  it("다른 팀 팀장에게는 존재하지 않는 프로젝트다", async () => {
    const fx = await setupExpenseProject();
    const otherLead = await makePerson("다른팀장", TEAM_LEAD_ROLE_ID, "경영관리팀");
    expect(await deleteRights(otherLead, fx.projectId)).toBe(false);
    expect((await rejection(archiveProject(otherLead, fx.projectId))).message).toBe("존재하지 않는 프로젝트");
  });

  it("자금 키로 보기만 넓어진 비팀장(projects.delete 켬)은 쓰기 범위 밖 프로젝트를 지우지도 되돌리지도 못한다", async () => {
    const fx = await setupExpenseProject();
    const roleId = await makeFundRole("team");
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "projects", action: "view", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "projects.delete", action: "write", allowed: true });
    await grantFundKeys(roleId, ["projects.budget"], "view");
    const fund = await makeFundPerson("경영관리 사원", roleId, "경영관리팀");
    expect(await deleteRights(fund, fx.projectId)).toBe(false);
    expect((await rejection(archiveProject(fund, fx.projectId))).message).toBe("존재하지 않는 프로젝트");

    await archiveProject(fx.lead, fx.projectId);
    expect((await rejection(restoreProject(fund, fx.projectId, { via: "archive" }))).message).toBe("존재하지 않는 프로젝트");
    expect((await projectRow(fx.projectId)).archivedAt).not.toBeNull();
  });

  it("팀장 · 시스템 관리자는 권리가 있다", async () => {
    const fx = await setupExpenseProject();
    const admin = await makePerson("관리자", SYSADMIN_ROLE_ID, null);
    expect(await deleteRights(fx.lead, fx.projectId)).toBe(true);
    expect(await deleteRights(admin, fx.projectId)).toBe(true);
  });

  it("잠금을 쥔 동안 지출결의가 먼저 커밋되면 잠금 안 재판정이 막는다(afterLock)", async () => {
    const fx = await setupExpenseProject();
    const gate = deferred();
    // 이 경합은 지출결의 생성이 보관보다 먼저 프로젝트 행을 잡는 쪽 — 생성이 커밋된 뒤 보관이 잠금을 얻어 센다.
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    expect(created.created).toHaveLength(1);
    const archiving = archiveProject(fx.lead, fx.projectId, { afterLock: () => gate.promise });
    gate.resolve();
    expect((await rejection(archiving)).message).toBe("돈 문서 1건 연결 · 삭제 불가");
  });
});

describe("되살리기(D-7212 · 되돌리기 · T-07.2-17-04)", () => {
  it("되돌리기는 프로젝트와 같은 시각 줄만 되살리고 차수 수 · 줄 수가 보관 전과 같다", async () => {
    const fx = await setupExpenseProject();
    await archiveLineEarlier(fx);
    const beforeRevisions = await revisionCount(fx.projectId);
    const beforeLines = await linesOf(fx.projectId);

    await archiveProject(fx.lead, fx.projectId);
    const result = await restoreProject(fx.lead, fx.projectId, { via: "undo" });

    expect(result).toEqual({ restored: true, number: fx.projectNumber });
    const row = await projectRow(fx.projectId);
    expect(row.archivedAt).toBeNull();
    expect(row.archivedBy).toBeNull();
    expect(await revisionCount(fx.projectId)).toBe(beforeRevisions);
    const after = await linesOf(fx.projectId);
    expect(after.map((line) => [line.id, line.archivedAt?.toISOString() ?? null]).sort()).toEqual(
      beforeLines.map((line) => [line.id, line.archivedAt?.toISOString() ?? null]).sort(),
    );
    expect(await projectLogs(fx.projectId, "restore")).toHaveLength(1);
  });

  it("다른 사람이 지운 프로젝트의 되돌리기는 거부되고 링크도 띄우지 않는다", async () => {
    const fx = await setupExpenseProject();
    const admin = await makePerson("관리자", SYSADMIN_ROLE_ID, null);
    await archiveProject(admin, fx.projectId);
    expect(await findDeletedProjectForUndo(fx.lead, fx.projectId)).toBeNull();
    expect(await findDeletedProjectForUndo(admin, fx.projectId)).toEqual({ id: fx.projectId, number: fx.projectNumber });
    expect((await rejection(restoreProject(fx.lead, fx.projectId, { via: "undo" }))).message).toBe("존재하지 않는 프로젝트");
    expect((await projectRow(fx.projectId)).archivedAt).not.toBeNull();
  });

  it("살아 있는 프로젝트 · 권리 없는 사람에게 되돌리기 링크는 null이다", async () => {
    const fx = await setupExpenseProject();
    expect(await findDeletedProjectForUndo(fx.lead, fx.projectId)).toBeNull();
    await archiveProject(fx.lead, fx.projectId);
    await upsertPermission(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, menu: "projects.delete", action: "write", allowed: false });
    expect(await findDeletedProjectForUndo(fx.lead, fx.projectId)).toBeNull();
    expect(await findDeletedProjectForUndo(fx.lead, "not-a-uuid")).toBeNull();
  });

  it("보관 중 돈 문서가 붙은(방어 판정) 프로젝트는 「돈 문서 1건 연결 · 복원 불가」다", async () => {
    const fx = await setupExpenseProject();
    await archiveProject(fx.lead, fx.projectId);
    await db.insert(settlementApprovals).values({ projectId: fx.projectId, drafterId: fx.pm.id });
    expect((await rejection(restoreProject(fx.lead, fx.projectId, { via: "undo" }))).message).toBe("돈 문서 1건 연결 · 복원 불가");
  });
});

// ---- Task 2 · 보관된 프로젝트 쓰기 거부(T-07.2-17-02) ----
// 보관함 권한자(시스템 관리자 — admin.archive · 보관 프로젝트까지 보는 범위)도 보관된 프로젝트에는 돈 문서를 쓰지 못한다.

async function forceArchive(projectId: string): Promise<void> {
  // 돈 문서가 이미 붙은 프로젝트를 보관 상태로 만드는 시험 전용 지름길(도메인은 막는다) — 이미 있는 문서의 다음 쓰기를 본다.
  await db.update(projects).set({ archivedAt: new Date(), archivedBy: SYSTEM_VIEWER.id }).where(eq(projects.id, projectId));
}

async function moneyTotal(projectId: string): Promise<number> {
  return (await countMoneyAttachments(SYSTEM_VIEWER, projectId)).total;
}

async function clientOf(projectId: string): Promise<string> {
  return (await projectRow(projectId)).clientId;
}

describe("보관된 프로젝트 쓰기 거부 — 차례(보관 커밋 뒤)", () => {
  it("지출결의 만들기 · 리저브 줄 · 매출 단독 저장 · 합성 저장 · 예산 직접 고침이 보관함 권한자에게도 거부되고 돈 문서가 0이다", async () => {
    const fx = await setupExpenseProject();
    const admin = await makePerson("관리자", SYSADMIN_ROLE_ID, null);
    await archiveProject(fx.lead, fx.projectId);

    const created = await createExpenseFromLines(admin, { lineIds: [fx.lines.withVendor] });
    expect(created.created).toHaveLength(0);
    const reserveRow = {
      id: randomUUID(),
      isNew: true as const,
      clientId: await clientOf(fx.projectId),
      entryDate: "2026-10-01",
      direction: "deposit" as const,
      amount: { currency: "KRW" as const, amount: 100_000, fxRate: 1 },
      projectId: fx.projectId,
    };
    await rejection(saveReserves(admin, { rows: [reserveRow] }));
    const revenueEntry = { id: randomUUID(), isNew: true as const, entryDate: "2026-10-01", amount: { currency: "KRW" as const, amount: 100_000, fxRate: 1 } };
    expect((await rejection(saveRevenue(admin, fx.projectId, { issuedEntries: [revenueEntry] }))).message).toBe("존재하지 않는 프로젝트");
    expect(
      (await rejection(saveProjectLedger(admin, fx.projectId, { seenStatus: "in_progress", revenue: { issuedEntries: [{ ...revenueEntry, id: randomUUID() }] } }))).message,
    ).toBe("존재하지 않는 프로젝트");
    expect((await rejection(setBudgetManually(admin, fx.projectId, { budgetKrw: 10_000, expectedBudgetKrw: 0, memo: "보관 뒤" }))).message).toBe("프로젝트 없음");

    expect(await moneyTotal(fx.projectId)).toBe(0);
  });

  it("이미 있던 작성 중 문서의 올리기 · 지운 문서 되살리기가 보관 뒤 거부된다", async () => {
    const fx = await setupExpenseProject();
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor, fx.lines.split] });
    expect(created.created).toHaveLength(2);
    const [toSubmit, toRestore] = created.created;
    if (!toSubmit || !toRestore) throw new Error("작성 중 문서 없음");
    const [restoreRow] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, toRestore.expenseId));
    await deleteExpenseDraft(fx.pm, { expenseId: toRestore.expenseId, expectedVersion: restoreRow?.version ?? 1 });
    await forceArchive(fx.projectId);

    const [submitRow] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, toSubmit.expenseId));
    await rejection(submitExpense(fx.pm, { expenseId: toSubmit.expenseId, expectedVersion: submitRow?.version ?? 1 }));
    await rejection(restoreExpenseDraft(fx.pm, { expenseId: toRestore.expenseId }));

    const rows = await db.select({ id: expenses.id, number: expenses.number, deletedAt: expenses.deletedAt }).from(expenses).where(eq(expenses.projectId, fx.projectId));
    expect(rows.find((row) => row.id === toSubmit.expenseId)?.number).toBeNull();
    expect(rows.find((row) => row.id === toRestore.expenseId)?.deletedAt).not.toBeNull();
  });

  it("구매 요청 · 카드 사용 연결이 보관 뒤 거부된다(잠근 행 판정 — 고침 0 길)", async () => {
    const fx = await purchaseProject();
    await forceArchive(fx.projectId);
    const input = { ...requestInput(fx.onlineLine), idempotencyKey: randomUUID() };
    await rejection((async () => createPurchaseRequest(fx.pm, input, await precheckPurchaseRequest(fx.pm, input)))());
    await rejection(linkCardUsage(fx.pm, fx.onlineLine));
    expect(await moneyTotal(fx.projectId)).toBe(0);
  });

  it("정산 결재 올리기가 보관 뒤 거부되고 문서 행이 생기지 않는다", async () => {
    const fx = await setupSettlementProject();
    await forceArchive(fx.projectId);
    expect((await rejection(submitSettlement(fx.pm, { projectId: fx.projectId }))).message).toBe("존재하지 않는 프로젝트");
    expect(await db.select().from(settlementApprovals).where(eq(settlementApprovals.projectId, fx.projectId))).toHaveLength(0);
  });
});

describe("보관된 프로젝트 쓰기 거부 — 경합(보관이 잠금을 쥔 동안 끼어든 쓰기 · afterLock)", () => {
  // 보관이 프로젝트 행을 잠근 채 멈춘 사이 쓰기를 시작하고, 그 쓰기가 잠금(행 잠금 또는 FK 확인)을 기다리는 것을 확인한 뒤 보관을 푼다.
  async function raceAgainstArchive(fx: ExpenseFixture, write: () => Promise<unknown>): Promise<Error | null> {
    const gate = deferred();
    const locked = deferred();
    const archiving = archiveProject(fx.lead, fx.projectId, {
      afterLock: async () => {
        locked.resolve();
        await gate.promise;
      },
    });
    await locked.promise;
    const writing = write().then(
      () => null,
      (error: unknown) => error as Error,
    );
    await waitForLockWaiter(pool);
    gate.resolve();
    expect((await archiving).archived).toBe(true);
    return writing;
  }

  it("지출결의 만들기 — 보관된 프로젝트에 문서가 붙지 않는다", async () => {
    const fx = await setupExpenseProject();
    const admin = await makePerson("관리자", SYSADMIN_ROLE_ID, null);
    let result: Awaited<ReturnType<typeof createExpenseFromLines>> | null = null;
    const error = await raceAgainstArchive(fx, async () => {
      result = await createExpenseFromLines(admin, { lineIds: [fx.lines.withVendor] });
    });
    expect(error).toBeNull();
    expect(result).toMatchObject({ created: [] });
    expect(await moneyTotal(fx.projectId)).toBe(0);
  });

  it("지운 지출결의 되살리기 — 거부된다", async () => {
    const fx = await setupExpenseProject();
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = created.created[0]?.expenseId;
    if (!expenseId) throw new Error("작성 중 문서 없음");
    const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
    await deleteExpenseDraft(fx.pm, { expenseId, expectedVersion: row?.version ?? 1 });
    const error = await raceAgainstArchive(fx, () => restoreExpenseDraft(fx.pm, { expenseId }));
    expect(error).not.toBeNull();
    expect(await moneyTotal(fx.projectId)).toBe(0);
  });

  it("리저브 줄 — 거부된다", async () => {
    const fx = await setupExpenseProject();
    const admin = await makePerson("관리자", SYSADMIN_ROLE_ID, null);
    const clientId = await clientOf(fx.projectId);
    const reserve = await raceAgainstArchive(fx, () =>
      saveReserves(admin, {
        rows: [
          {
            id: randomUUID(),
            isNew: true,
            clientId,
            entryDate: "2026-10-01",
            direction: "deposit",
            amount: { currency: "KRW", amount: 100_000, fxRate: 1 },
            projectId: fx.projectId,
          },
        ],
      }),
    );
    expect(reserve).not.toBeNull();
    expect(await moneyTotal(fx.projectId)).toBe(0);
  });

  it("매출 단독 저장 — 거부된다", async () => {
    const fx = await setupExpenseProject();
    const admin = await makePerson("관리자", SYSADMIN_ROLE_ID, null);
    const error = await raceAgainstArchive(fx, () =>
      saveRevenue(admin, fx.projectId, {
        issuedEntries: [{ id: randomUUID(), isNew: true, entryDate: "2026-10-01", amount: { currency: "KRW", amount: 100_000, fxRate: 1 } }],
      }),
    );
    expect(error?.message).toBe("존재하지 않는 프로젝트");
    expect(await moneyTotal(fx.projectId)).toBe(0);
  });

  it("예산 직접 고침 — 거부된다", async () => {
    const fx = await setupExpenseProject();
    const admin = await makePerson("관리자", SYSADMIN_ROLE_ID, null);
    const error = await raceAgainstArchive(fx, () => setBudgetManually(admin, fx.projectId, { budgetKrw: 10_000, expectedBudgetKrw: 0, memo: "경합" }));
    expect(error?.message).toBe("프로젝트 없음");
    expect(await moneyTotal(fx.projectId)).toBe(0);
  });

  it("정산 결재 올리기 — 보관 tx가 행을 쥔 동안 넣은 문서 행이 FK 대기 뒤 거부된다(잠금 없는 길)", async () => {
    // 정산 프로젝트는 카드 · 매출이 붙어 도메인 보관이 막히므로, 보관 tx를 같은 꼴(FOR UPDATE → archived_at 쓰기)로 직접 연다.
    const fx = await setupSettlementProject();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM projects WHERE id = $1 FOR UPDATE", [fx.projectId]);
      await client.query("UPDATE projects SET archived_at = now(), archived_by = $2 WHERE id = $1", [fx.projectId, fx.lead.id]);
      const submitting = submitSettlement(fx.pm, { projectId: fx.projectId }).then(
        () => null,
        (error: unknown) => error as Error,
      );
      await waitForLockWaiter(pool);
      await client.query("COMMIT");
      expect((await submitting)?.message).toBe("존재하지 않는 프로젝트");
    } finally {
      client.release();
    }
    expect(await db.select().from(settlementApprovals).where(eq(settlementApprovals.projectId, fx.projectId))).toHaveLength(0);
  });
});

// ---- Task 2 · 보관함 `프로젝트` 행 · 복원기(D-7213 · D-F3) ----

describe("보관함 프로젝트 행 · 복원", () => {
  it("시스템 관리자: 보관함에 `프로젝트` 한 줄({번호} {이름}) · 복원하면 되살아나고 같은 시각 줄만 복원 · 로그 restore", async () => {
    const fx = await setupExpenseProject();
    const admin = await makePerson("관리자", SYSADMIN_ROLE_ID, null);
    await archiveLineEarlier(fx);
    await archiveProject(fx.lead, fx.projectId);
    const name = (await projectRow(fx.projectId)).name;

    const rows = (await listArchive(admin)).filter((row) => row.entity === "project");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: "프로젝트", id: fx.projectId, name: `${fx.projectNumber} ${name}`, restorable: true });

    expect(await restore(admin, "project", fx.projectId)).toEqual({ restored: true });
    expect((await projectRow(fx.projectId)).archivedAt).toBeNull();
    const earlier = (await linesOf(fx.projectId)).find((line) => line.id === fx.lines.noVendor);
    expect(earlier?.archivedAt?.toISOString()).toBe(EARLIER.toISOString());
    const logs = await projectLogs(fx.projectId, "restore");
    expect(logs).toHaveLength(1);
    expect(logs[0]?.actorId).toBe(admin.id);
    expect(await restore(admin, "project", fx.projectId)).toEqual({ restored: false });
  });

  it("담당 팀이 사용중지면 「담당 팀 사용중지 · 팀 먼저 복원」 · 프로젝트는 그대로 보관 · 범용 보관은 보호 행 거부", async () => {
    const fx = await setupExpenseProject();
    const admin = await makePerson("관리자", SYSADMIN_ROLE_ID, null);
    await expect(archive(admin, "project", fx.projectId)).rejects.toBeInstanceOf(ProtectedRowError);
    await archiveProject(fx.lead, fx.projectId);
    const teamId = (await projectRow(fx.projectId)).teamId;
    await db.update(teams).set({ archivedAt: new Date(), archivedBy: admin.id }).where(eq(teams.id, teamId));

    expect((await rejection(restore(admin, "project", fx.projectId))).message).toBe("담당 팀 사용중지 · 팀 먼저 복원");
    expect((await projectRow(fx.projectId)).archivedAt).not.toBeNull();
    expect(await projectLogs(fx.projectId, "restore")).toHaveLength(0);
  });

  it("projects.delete만 있는 팀장(보관함 권한 없음): 자기 범위 `프로젝트` 행만 보고 되살린다 · 다른 종류 복원은 그대로 거부", async () => {
    const fx = await setupExpenseProject();
    const other = await setupExpenseProject();
    const admin = await makePerson("관리자", SYSADMIN_ROLE_ID, null);
    await archiveProject(fx.lead, fx.projectId);
    // 다른 팀 프로젝트(같은 시드 팀이면 범위 안이라 팀을 옮긴다) — 범위 밖 행이 보이지 않아야 한다.
    const [mgmt] = await db.select({ id: teams.id }).from(teams).where(eq(teams.name, "경영관리팀"));
    if (!mgmt) throw new Error("경영관리팀 없음");
    await db.update(projects).set({ teamId: mgmt.id }).where(eq(projects.id, other.projectId));
    await archiveProject(admin, other.projectId);

    const rows = await listArchive(fx.lead);
    expect(rows.map((row) => [row.entity, row.id])).toEqual([["project", fx.projectId]]);
    expect(rows[0]?.restorable).toBe(true);

    await expect(restore(fx.lead, "vendor", randomUUID())).rejects.toBeInstanceOf(ForbiddenError);
    expect(await restore(fx.lead, "project", fx.projectId)).toEqual({ restored: true });
    expect((await rejection(restore(fx.lead, "project", other.projectId))).message).toBe("존재하지 않는 프로젝트");
  });

  it("/review #1 — 보관된 프로젝트의 견적 줄은 보관함 권한자도 하나씩 되살리지 못하고 줄은 보관된 채다", async () => {
    const fx = await setupExpenseProject();
    const admin = await makePerson("관리자", SYSADMIN_ROLE_ID, null);
    // 승인 차수는 합계를 바꾸는 복원을 따로 막으므로(B-01) 승인을 걷어 보관 판정만 남긴다.
    await db.update(quoteRevisions).set({ customerApprovedAt: null }).where(eq(quoteRevisions.id, fx.revisionId));
    await archiveProject(fx.lead, fx.projectId);

    expect((await rejection(restore(admin, "quote_line", fx.lines.withVendor))).message).toBe("연결된 프로젝트 찾을 수 없음");
    const line = (await linesOf(fx.projectId)).find((row) => row.id === fx.lines.withVendor);
    expect(line?.archivedAt).not.toBeNull();
  });

  it("/review #1 — 보관함 목록에 보관된 프로젝트의 견적 줄 행은 뜨지 않고 살아 있는 프로젝트의 지운 줄은 뜬다", async () => {
    const fx = await setupExpenseProject();
    const live = await setupExpenseProject();
    const admin = await makePerson("관리자", SYSADMIN_ROLE_ID, null);
    await archiveLineEarlier(fx);
    await archiveLineEarlier(live);
    await archiveProject(fx.lead, fx.projectId);

    const lineIds = new Set((await listArchive(admin)).filter((row) => row.entity === "quote_line").map((row) => row.id));
    for (const id of Object.values(fx.lines)) expect(lineIds.has(id)).toBe(false);
    expect(lineIds.has(live.lines.noVendor)).toBe(true);
  });

  it("보관함 권한도 삭제 권리도 없는 사원에게 보관함 목록은 거부다", async () => {
    const fx = await setupExpenseProject();
    await expect(listArchive(fx.pm)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
