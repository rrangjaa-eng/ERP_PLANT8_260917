import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, codeItems, projects, quoteLines, revenueEntries, teams } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { createProject } from "@/domain/projects";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { saveRevenue } from "@/domain/revenue";

// /review(PR #38) — 저장 요청의 줄 id·차수 id가 요청한 프로젝트·차수에
// 속하는지 확인한다. 다른 프로젝트의 줄을 id·version만으로 덮어쓰면 안 된다.
async function setupProject() {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}`, normalizedName: `거래처-${randomUUID()}` });
  const { userId: pmUserId } = await createAccount(SYSTEM_VIEWER, {
    email: `pm-${randomUUID()}@example.test`,
    name: "통합테스트 PM",
    roleId: DEFAULT_ROLE_ID,
  });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
  if (!subcategory) throw new Error("시드된 quote_subcategory 코드 항목이 없습니다");
  const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId, name: `프로젝트-${randomUUID()}` });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("1차 차수가 없습니다");
  return { project, revision, pmUserId, subcategoryValue: subcategory.value };
}

const krw = (amount: number) => ({ currency: "KRW" as const, amount, fxRate: 1 });

describe("저장 경로의 소속 검사(/review PR #38)", () => {
  it("다른 차수의 견적 줄 id로 저장하면 거부되고 그 줄은 바뀌지 않는다", async () => {
    const a = await setupProject();
    const b = await setupProject();
    const [lineB] = (await saveQuoteLines(SYSTEM_VIEWER, b.revision.id, { rows: [
      { id: randomUUID(), isNew: true, subcategory: b.subcategoryValue, itemName: "B의 줄", unitPrice: krw(100), execution: krw(0) },
    ] })).lines;
    if (!lineB) throw new Error("줄 저장 실패");

    await expect(
      saveQuoteLines(SYSTEM_VIEWER, a.revision.id, { rows: [
        { id: lineB.id, version: lineB.version, subcategory: a.subcategoryValue, itemName: "탈취", unitPrice: krw(1), execution: krw(0) },
      ] }),
    ).rejects.toThrow();

    const [row] = await db.select().from(quoteLines).where(eq(quoteLines.id, lineB.id));
    expect(row?.itemName).toBe("B의 줄");
    expect(row?.revisionId).toBe(b.revision.id);
  });

  it("다른 프로젝트의 매출 줄 id로 저장하면 거부되고 그 줄은 바뀌지 않는다", async () => {
    const a = await setupProject();
    const b = await setupProject();
    const saved = await saveRevenue(SYSTEM_VIEWER, b.project.id, { paidEntries: [{ entryDate: "2026-09-01", amount: krw(1000) }] });
    const entryB = saved?.paidEntries?.[0];
    if (!entryB) throw new Error("매출 줄 저장 실패");

    await expect(
      saveRevenue(SYSTEM_VIEWER, a.project.id, {
        paidEntries: [{ id: entryB.id, version: entryB.version, entryDate: "2026-09-02", amount: krw(1) }],
      }),
    ).rejects.toThrow();

    const [row] = await db.select().from(revenueEntries).where(eq(revenueEntries.id, entryB.id));
    expect(row?.projectId).toBe(b.project.id);
    expect(Number(row?.amountAmountKrw)).toBe(1000);
  });

  it("일괄 저장에 다른 프로젝트의 차수 id를 넣으면 거부되고 아무 줄도 생기지 않는다", async () => {
    const a = await setupProject();
    const b = await setupProject();

    await expect(
      saveProjectLedger(SYSTEM_VIEWER, a.project.id, {
        seenStatus: "bidding",
        quoteLines: { revisionId: b.revision.id, rows: [{ id: randomUUID(), isNew: true, subcategory: b.subcategoryValue, itemName: "섞임", unitPrice: krw(1), execution: krw(0) }] },
      }),
    ).rejects.toThrow();

    const rows = await db.select().from(quoteLines).where(eq(quoteLines.revisionId, b.revision.id));
    expect(rows).toHaveLength(0);
  });
  it("일괄 저장이 뒤쪽(매출)에서 거부되면 앞쪽 견적 줄의 감사 기록도 남지 않는다", async () => {
    const a = await setupProject();
    const pm = { id: a.pmUserId, roleId: DEFAULT_ROLE_ID };

    await expect(
      saveProjectLedger(pm, a.project.id, {
        seenStatus: "bidding",
        quoteLines: { revisionId: a.revision.id, rows: [{ id: randomUUID(), isNew: true, subcategory: a.subcategoryValue, itemName: "줄", unitPrice: krw(1), execution: krw(0) }] },
        revenue: { paidEntries: [{ entryDate: "2026-09-01", amount: krw(1) }] },
      }),
    ).rejects.toThrow();

    expect(await db.select().from(quoteLines).where(eq(quoteLines.revisionId, a.revision.id))).toHaveLength(0);
    expect(await db.select().from(actionLog).where(eq(actionLog.entityId, a.revision.id))).toHaveLength(0);
  });
  it("볼 수 없는 보관 프로젝트에는 일괄 저장이 거부되고 계약 금액이 바뀌지 않는다(/cso 14b1ae15)", async () => {
    const a = await setupProject();
    const pm = { id: a.pmUserId, roleId: DEFAULT_ROLE_ID };
    await db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.id, a.project.id));

    await expect(
      saveProjectLedger(pm, a.project.id, {
        seenStatus: "bidding",
        quoteLines: { revisionId: a.revision.id, rows: [{ id: randomUUID(), isNew: true, subcategory: a.subcategoryValue, itemName: "보관 뒤 줄", unitPrice: krw(1), execution: krw(0) }] },
      }),
    ).rejects.toThrow();

    expect(await db.select().from(quoteLines).where(eq(quoteLines.revisionId, a.revision.id))).toHaveLength(0);
  });
});
