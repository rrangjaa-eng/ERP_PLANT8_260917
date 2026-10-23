import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projectBudgetEntries, projects, quoteLines } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { upsertSimpleValue } from "@/repositories/settings";
import { createProject } from "@/domain/projects";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { getCurrentQuoteRevision } from "@/domain/quotes/lines";
import { listBudgetRows } from "@/domain/projects/budget";
import { PROJECT_COST_RATE_PCT } from "@/domain/settings/keys";
import type { ProjectStatus } from "@/domain/projects/status-transitions";
import { addDays, kstToday } from "@/lib/kst-date";

// 07-24 (W4 · W5 · B-P1-5 · D-730 · D-733) — 예산 = 줄 합(한 번 잡으면 고정). 기준 금액이 늘 때만 늘어난 금액 × 그때 원가율 한 줄을
// 사건과 같은 트랜잭션에 남기고, 예산 현황은 `projects.budget` 보기 + 정보 항목 `budget.amount`로만 금액을 싣는다.

const FAR = addDays(kstToday(new Date()), 30);

async function setCostRate(value: number | null): Promise<void> {
  await upsertSimpleValue(SYSTEM_VIEWER, PROJECT_COST_RATE_PCT.key, value, null);
}

async function makeTeam(): Promise<string> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `예산본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `예산팀-${randomUUID().slice(0, 8)}` });
  return team.id;
}

async function makeViewer(roleId: string, teamId?: string): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `budget-${randomUUID()}@example.test`, name: "예산 테스트 사람", roleId });
  if (teamId) await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom: "2026-01-01" });
  return { id: userId, roleId };
}

// 경영관리(시드 계급이 아니다 — 07-05): 임시 계급에 예산 보기 · 쓰기 + 금액 정보 항목을 직접 켠다.
async function makeBudgetViewer(opts: { write?: boolean; amount?: boolean } = {}): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `경영관리-${randomUUID()}`, viewScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects.budget", action: "view", allowed: true });
  if (opts.write !== false) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects.budget", action: "write", allowed: true });
  if (opts.amount !== false) {
    for (const infoItem of ["budget.amount", "quote.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  }
  return makeViewer(role.id);
}

type Setup = { projectId: string; revisionId: string; lead: Viewer; teamId: string };

async function setup(status: ProjectStatus = "bidding", name = `예산-${randomUUID()}`): Promise<Setup> {
  const teamId = await makeTeam();
  const pm = await makeViewer(DEFAULT_ROLE_ID, teamId);
  const lead = await makeViewer("role-team-lead", teamId);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}`, normalizedName: `거래처-${randomUUID()}` });
  const created = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId, pmUserId: pm.id, name });
  await db.update(projects).set({ status, startDate: null, endDate: FAR }).where(eq(projects.id, created.id));
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, created.id);
  if (!revision) throw new Error("1차 차수가 없습니다");
  return { projectId: created.id, revisionId: revision.id, lead, teamId };
}

async function savePo(s: Setup, amount: number, status: ProjectStatus = "bidding") {
  return saveProjectLedger(s.lead, s.projectId, {
    seenStatus: status,
    preEstimate: { currency: "KRW", amount, fxRate: 1, fxRateTouched: false },
  });
}

async function entriesOf(projectId: string) {
  const rows = await db
    .select()
    .from(projectBudgetEntries)
    .where(eq(projectBudgetEntries.projectId, projectId))
    .orderBy(asc(projectBudgetEntries.createdAt), asc(projectBudgetEntries.id));
  return rows.map((row) => ({ reason: row.reason, base: row.baseAmountKrw, rate: row.costRatePct, delta: row.deltaKrw, memo: row.memo }));
}

async function budgetOf(projectId: string): Promise<number> {
  return (await entriesOf(projectId)).reduce((sum, row) => sum + row.delta, 0);
}

async function addExecutionLine(revisionId: string, executionKrw: number): Promise<void> {
  await db.insert(quoteLines).values({
    revisionId,
    subcategory: "기타",
    itemName: `항목-${randomUUID()}`,
    unitPriceAmountKrw: executionKrw,
    executionAmountKrw: executionKrw,
    quoteAmountKrw: executionKrw,
    profitKrw: 0,
  });
}

describe("PO 금액 저장 → 증액 예산 줄 (07-24 Task 1 · B-P1-5 · D-730)", () => {
  it("증액분 × 그때 율만 같은 tx 줄로 남고 감액 · 같은 값 · 율 비움은 줄이 없다", async () => {
    await setCostRate(70);
    const s = await setup();

    await savePo(s, 10_000_000);
    expect(await entriesOf(s.projectId)).toEqual([{ reason: "po_amount_change", base: 10_000_000, rate: "70.0", delta: 7_000_000, memo: null }]);

    await savePo(s, 12_000_000);
    expect((await entriesOf(s.projectId)).at(-1)).toMatchObject({ reason: "po_amount_change", base: 12_000_000, rate: "70.0", delta: 1_400_000 });

    // 율이 바뀌어도 기존 줄은 그대로 — 다음 증액부터 새 율(B-P1-5).
    await setCostRate(60);
    await savePo(s, 13_000_000);
    expect((await entriesOf(s.projectId)).at(-1)).toMatchObject({ base: 13_000_000, rate: "60.0", delta: 600_000 });
    expect(await budgetOf(s.projectId)).toBe(9_000_000);

    // D-730: 감액은 자동 줄이 없다.
    await savePo(s, 9_000_000);
    expect(await entriesOf(s.projectId)).toHaveLength(3);
    expect(await budgetOf(s.projectId)).toBe(9_000_000);

    // 다시 늘면 늘어난 만큼만(9백만 → 1천만 = 100만 × 60%).
    await savePo(s, 10_000_000);
    expect((await entriesOf(s.projectId)).at(-1)).toMatchObject({ base: 10_000_000, rate: "60.0", delta: 600_000 });

    // 같은 값 다시 저장 → 줄 없음.
    await savePo(s, 10_000_000);
    expect(await entriesOf(s.projectId)).toHaveLength(4);

    // 원가율 비움 → 줄 없음.
    await setCostRate(null);
    await savePo(s, 20_000_000);
    expect(await entriesOf(s.projectId)).toHaveLength(4);
  });

  it("PO 금액이 이번 저장에 없으면 예산 줄을 쓰지 않는다", async () => {
    await setCostRate(70);
    const s = await setup();
    await saveProjectLedger(s.lead, s.projectId, { seenStatus: "bidding", poNumber: "PO-1" });
    expect(await entriesOf(s.projectId)).toEqual([]);
  });

  it("저장이 거부되면(검증 · 권리) 예산 줄도 없다(같은 tx)", async () => {
    await setCostRate(70);
    const s = await setup();
    const rejected = await saveProjectLedger(s.lead, s.projectId, {
      seenStatus: "bidding",
      preEstimate: { currency: "KRW", amount: 10_000_000, fxRate: 1, fxRateTouched: false },
      poNumber: "P".repeat(101),
    }).catch((error: unknown) => error);
    expect(rejected).toBeInstanceOf(Error);
    expect(await entriesOf(s.projectId)).toEqual([]);

    const outsider = await makeViewer(DEFAULT_ROLE_ID);
    const noRights = await savePo({ ...s, lead: outsider }, 10_000_000).catch((error: unknown) => error);
    expect(noRights).toBeInstanceOf(Error);
    expect(await entriesOf(s.projectId)).toEqual([]);
  });
});

describe("listBudgetRows (07-24 Task 1 · W5 · D-733 · K11)", () => {
  it("예산 = 줄 합 · 사용액 = 지금 차수 실행가 합 · 남은 예산 · 상태 한 값 · 초과 먼저 → 남은 예산 오름 · 합계 셋", async () => {
    await setCostRate(70);
    const viewer = await makeBudgetViewer();
    const a = await setup("bidding", `가-${randomUUID()}`);
    await savePo(a, 10_000_000); // 예산 700만
    await addExecutionLine(a.revisionId, 2_000_000); // 남은 500만
    const b = await setup("bidding", `나-${randomUUID()}`);
    await savePo(b, 1_000_000); // 예산 70만
    await addExecutionLine(b.revisionId, 900_000); // 남은 −20만 → 초과
    const c = await setup("bidding", `다-${randomUUID()}`);
    await savePo(c, 2_000_000); // 예산 140만, 남은 140만

    const result = await listBudgetRows(viewer, { status: "in_progress" });
    expect(result.costRateSet).toBe(true);
    const ids = [a.projectId, b.projectId, c.projectId];
    const mine = result.rows.filter((row) => ids.includes(row.projectId));
    expect(mine.map((row) => row.projectId)).toEqual([b.projectId, c.projectId, a.projectId]);
    expect(mine[0]).toMatchObject({ budgetKrw: 700_000, usedKrw: 900_000, remainingKrw: -200_000, poAmountKrw: 1_000_000, overrun: true, statusWord: "초과" });
    expect(mine[2]).toMatchObject({ budgetKrw: 7_000_000, usedKrw: 2_000_000, remainingKrw: 5_000_000, overrun: false, statusWord: "수주중" });
    expect(result.totals).toEqual({ budgetKrw: 9_100_000, usedKrw: 2_900_000, remainingKrw: 6_200_000 });
    expect(result.uncomputableCount).toBe(0);
  });

  it("「진행」은 완료 · 미수주를 빼고 「전체」는 넣는다", async () => {
    await setCostRate(70);
    const viewer = await makeBudgetViewer();
    const done = await setup("bidding");
    await savePo(done, 1_000_000);
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, done.projectId));
    expect((await listBudgetRows(viewer, { status: "in_progress" })).rows.map((row) => row.projectId)).not.toContain(done.projectId);
    const all = await listBudgetRows(viewer, { status: "all" });
    expect(all.rows.find((row) => row.projectId === done.projectId)).toMatchObject({ statusWord: "완료", budgetKrw: 700_000 });
  });

  it("예산 줄 없이 기준 금액만 있는 진행 프로젝트는 계산 불가(금액 없음) · 합계는 계산된 행만", async () => {
    await setCostRate(70);
    const viewer = await makeBudgetViewer();
    const ok = await setup();
    await savePo(ok, 1_000_000);
    const missing = await setup();
    await db.update(projects).set({ preEstimateAmountKrw: 5_000_000 }).where(eq(projects.id, missing.projectId));
    const result = await listBudgetRows(viewer, { status: "in_progress" });
    const row = result.rows.find((candidate) => candidate.projectId === missing.projectId);
    expect(row).toMatchObject({ computable: false });
    expect(row?.budgetKrw).toBeUndefined();
    expect(result.uncomputableCount).toBe(1);
    expect(result.totals).toEqual({ budgetKrw: 700_000, usedKrw: 0, remainingKrw: 700_000 });
  });

  it("원가율 0은 설정된 값 — 줄 없이 예산 0 행(잠김 아님 · D-734)", async () => {
    await setCostRate(0);
    const viewer = await makeBudgetViewer();
    const s = await setup();
    await savePo(s, 1_000_000);
    const result = await listBudgetRows(viewer, { status: "in_progress" });
    expect(result.costRateSet).toBe(true);
    expect(result.rows.find((row) => row.projectId === s.projectId)).toMatchObject({ computable: true, budgetKrw: 0, remainingKrw: 0 });
  });

  it("원가율 비움이면 costRateSet false · 행 없음(D-734)", async () => {
    await setCostRate(null);
    const viewer = await makeBudgetViewer();
    const result = await listBudgetRows(viewer, { status: "in_progress" });
    expect(result).toMatchObject({ costRateSet: false, rows: [] });
  });

  it("`projects.budget` 보기 없음 → 거부 · `budget.amount` 없음 → 금액 칸 없음", async () => {
    await setCostRate(70);
    const s = await setup();
    await savePo(s, 1_000_000);
    const staff = await makeViewer(DEFAULT_ROLE_ID, s.teamId);
    await expect(listBudgetRows(staff, { status: "in_progress" })).rejects.toThrow();

    const noAmount = await makeBudgetViewer({ amount: false });
    const row = (await listBudgetRows(noAmount, { status: "in_progress" })).rows.find((candidate) => candidate.projectId === s.projectId);
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("budgetKrw");
    expect(row).not.toHaveProperty("usedKrw");
    expect(row).not.toHaveProperty("remainingKrw");
    expect(row).not.toHaveProperty("poAmountKrw");
    expect(row?.statusWord).toBe("수주중");
  });
});
