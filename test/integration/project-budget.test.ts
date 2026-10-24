import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, projectBudgetEntries, projects, quoteLines, quoteRevisions } from "@/db/schema";
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
import { listBudgetHistory, listBudgetRows, saveCostRateSetting, seedInitialBudgets, setBudgetManually } from "@/domain/projects/budget";
import { createRevisionFromCurrent, setCustomerApproval } from "@/domain/quotes/revisions";
import { approvalBasis } from "@/repositories/quote-revisions";
import { importSettings } from "@/domain/settings/export";
import { getSettingValue, type SettingDef } from "@/domain/settings/registry";
import { findProject, loadProjectList } from "@/domain/projects";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
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

// ── Task 2 ────────────────────────────────────────────────────────────────

const NOW = () => new Date("2026-09-20T03:00:00.000Z");
const RATE_DEF = PROJECT_COST_RATE_PCT as SettingDef<unknown>;

// 승인 · 새 차수를 만드는 PM — 회사 범위 · 프로젝트 쓰기 · 금액 정보 항목.
async function makeApprovalPm(teamId: string): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `예산 승인 PM-${randomUUID()}`, viewScope: "company" });
  for (const action of ["view", "write"] as const) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action, allowed: true });
  for (const infoItem of ["project.value", "quote.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return makeViewer(role.id, teamId);
}

async function setupApproval() {
  const teamId = await makeTeam();
  const pm = await makeApprovalPm(teamId);
  const lead = await makeViewer("role-team-lead", teamId);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}`, normalizedName: `거래처-${randomUUID()}` });
  const created = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId, pmUserId: pm.id, name: `승인-${randomUUID()}` });
  await db.update(projects).set({ status: "in_progress", endDate: FAR }).where(eq(projects.id, created.id));
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, created.id);
  if (!revision) throw new Error("1차 차수가 없습니다");
  return { projectId: created.id, revisionId: revision.id, pm, lead, teamId };
}

async function approve(pm: Viewer, revisionId: string): Promise<void> {
  const basis = await approvalBasis(SYSTEM_VIEWER, revisionId);
  await setCustomerApproval(pm, revisionId, { approvedOn: "2026-09-19", approvalBasis: "email", seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken }, { now: NOW });
}

async function makeAdmin(): Promise<Viewer> {
  return makeViewer(SYSADMIN_ROLE_ID);
}

describe("등록 PO → 처음 줄 (07-24 Task 2 · K2)", () => {
  it("원가율 70 · PO 1,000만으로 등록하면 등록 tx에 initial +700만 · PO 없으면 줄 없음", async () => {
    await setCostRate(70);
    const teamId = await makeTeam();
    const pm = await makeViewer(DEFAULT_ROLE_ID, teamId);
    const client = await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}`, normalizedName: `거래처-${randomUUID()}` });
    const withPo = await createProject(pm, { clientId: client.id, teamId, pmUserId: pm.id, name: `등록-${randomUUID()}`, preEstimate: { currency: "KRW", amount: 10_000_000, fxRate: 1 } });
    expect(await entriesOf(withPo.id)).toEqual([{ reason: "initial", base: 10_000_000, rate: "70.0", delta: 7_000_000, memo: null }]);
    const withoutPo = await createProject(pm, { clientId: client.id, teamId, pmUserId: pm.id, name: `등록-${randomUUID()}` });
    expect(await entriesOf(withoutPo.id)).toEqual([]);
  });

  it("등록이 거부되면 줄도 없다", async () => {
    await setCostRate(70);
    const teamId = await makeTeam();
    const pm = await makeViewer(DEFAULT_ROLE_ID, teamId);
    const before = await db.select().from(projectBudgetEntries);
    const outcome = await createProject(pm, { clientId: randomUUID(), teamId, pmUserId: pm.id, name: `거부-${randomUUID()}`, preEstimate: { currency: "KRW", amount: 10_000_000, fxRate: 1 } }).catch((error: unknown) => error);
    expect(outcome).toBeInstanceOf(Error);
    expect(await db.select().from(projectBudgetEntries)).toHaveLength(before.length);
  });
});

describe("새 승인 차수 → 증액 줄 (07-24 Task 2 · AQ-39 · D-730)", () => {
  it("승인 견적 합계가 늘 때만 줄 · 감액 · 취소는 없음 · PO가 생기면 기준이 PO로 · PO가 있으면 새 승인은 줄 없음", async () => {
    await setCostRate(70);
    const s = await setupApproval();
    await addExecutionLine(s.revisionId, 5_000_000);
    await approve(s.pm, s.revisionId);
    expect(await entriesOf(s.projectId)).toEqual([{ reason: "new_approved_revision", base: 5_000_000, rate: "70.0", delta: 3_500_000, memo: null }]);

    const second = await createRevisionFromCurrent(s.pm, { projectId: s.projectId, fromRevisionId: s.revisionId });
    await addExecutionLine(second.revisionId, 1_000_000);
    await approve(s.pm, second.revisionId);
    expect((await entriesOf(s.projectId)).at(-1)).toMatchObject({ reason: "new_approved_revision", base: 6_000_000, delta: 700_000 });

    // 작은 승인 차수(400만) → 줄 없음(D-730) · 승인 취소 → 줄 없음.
    const third = await createRevisionFromCurrent(s.pm, { projectId: s.projectId, fromRevisionId: second.revisionId });
    const thirdLines = await db.select().from(quoteLines).where(eq(quoteLines.revisionId, third.revisionId));
    const big = thirdLines.find((line) => line.quoteAmountKrw === 5_000_000);
    if (!big) throw new Error("복사된 500만 줄이 없습니다");
    await db.update(quoteLines).set({ archivedAt: new Date() }).where(eq(quoteLines.id, big.id));
    await addExecutionLine(third.revisionId, 3_000_000);
    await approve(s.pm, third.revisionId);
    await setCustomerApproval(s.pm, third.revisionId, null, { now: NOW });
    expect(await entriesOf(s.projectId)).toHaveLength(2);

    // PO 1,000만 → 기준이 승인 견적(2차 600만)에서 PO로: +400만 × 70%.
    await savePo({ projectId: s.projectId, revisionId: third.revisionId, lead: s.lead, teamId: s.teamId }, 10_000_000, "in_progress");
    expect((await entriesOf(s.projectId)).at(-1)).toMatchObject({ reason: "po_amount_change", base: 10_000_000, delta: 2_800_000 });

    // PO가 있으면 새 승인은 기준을 바꾸지 않는다.
    await addExecutionLine(third.revisionId, 20_000_000);
    await approve(s.pm, third.revisionId);
    expect(await entriesOf(s.projectId)).toHaveLength(3);
    expect(await budgetOf(s.projectId)).toBe(7_000_000);
  });
});

describe("처음 원가율 → 처음 줄 (07-24 Task 2 · D-747 · U3)", () => {
  async function seedTargets() {
    const po = await setup("in_progress");
    await db.update(projects).set({ preEstimateAmountKrw: 10_000_000 }).where(eq(projects.id, po.projectId));
    const approved = await setup("in_progress");
    await addExecutionLine(approved.revisionId, 5_000_000);
    await db.update(quoteRevisions).set({ customerApprovedAt: new Date("2026-09-18T15:00:00.000Z") }).where(eq(quoteRevisions.id, approved.revisionId));
    const zero = await setup("in_progress");
    const done = await setup("completed");
    await db.update(projects).set({ preEstimateAmountKrw: 10_000_000 }).where(eq(projects.id, done.projectId));
    return { po, approved, zero, done };
  }

  it("원가율 비움 → 70 저장: 같은 tx initial 줄 둘 · 기준 0과 완료는 없음 · 75 재저장 · 줄 없는 새 프로젝트만 · 0 저장", async () => {
    await setCostRate(null);
    const admin = await makeAdmin();
    const t = await seedTargets();

    expect(await saveCostRateSetting(admin, RATE_DEF, 70)).toEqual({ firstSave: true, createdCount: 2 });
    expect(await getSettingValue(PROJECT_COST_RATE_PCT)).toBe(70);
    expect(await entriesOf(t.po.projectId)).toEqual([{ reason: "initial", base: 10_000_000, rate: "70.0", delta: 7_000_000, memo: null }]);
    expect(await entriesOf(t.approved.projectId)).toEqual([{ reason: "initial", base: 5_000_000, rate: "70.0", delta: 3_500_000, memo: null }]);
    expect(await entriesOf(t.zero.projectId)).toEqual([]);
    expect(await entriesOf(t.done.projectId)).toEqual([]);

    expect(await saveCostRateSetting(admin, RATE_DEF, 75)).toEqual({ firstSave: false, createdCount: 0 });
    expect(await entriesOf(t.po.projectId)).toHaveLength(1);

    const late = await setup("in_progress");
    await db.update(projects).set({ preEstimateAmountKrw: 2_000_000 }).where(eq(projects.id, late.projectId));
    expect(await saveCostRateSetting(admin, RATE_DEF, 75)).toEqual({ firstSave: false, createdCount: 1 });
    expect(await entriesOf(late.projectId)).toEqual([{ reason: "initial", base: 2_000_000, rate: "75.0", delta: 1_500_000, memo: null }]);

    const later = await setup("in_progress");
    await db.update(projects).set({ preEstimateAmountKrw: 2_000_000 }).where(eq(projects.id, later.projectId));
    expect(await saveCostRateSetting(admin, RATE_DEF, 0)).toEqual({ firstSave: false, createdCount: 0 });
    expect(await entriesOf(later.projectId)).toEqual([]);
  });

  it("원가율 0 첫 저장은 firstSave · 0건", async () => {
    await setCostRate(null);
    const admin = await makeAdmin();
    await seedTargets();
    expect(await saveCostRateSetting(admin, RATE_DEF, 0)).toEqual({ firstSave: true, createdCount: 0 });
    expect(await db.select().from(projectBudgetEntries)).toEqual([]);
  });

  it("설정 저장이 거부되면(권한 · 검증) 줄도 값도 없다", async () => {
    await setCostRate(null);
    await seedTargets();
    const staff = await makeViewer(DEFAULT_ROLE_ID);
    await expect(saveCostRateSetting(staff, RATE_DEF, 70)).rejects.toThrow();
    await expect(saveCostRateSetting(await makeAdmin(), RATE_DEF, 101)).rejects.toThrow();
    expect(await getSettingValue(PROJECT_COST_RATE_PCT)).toBeNull();
    expect(await db.select().from(projectBudgetEntries)).toEqual([]);
  });

  it("가져오기(afterApply 주입) — 같은 tx initial 줄 · 검증 실패면 줄 없음 · 시스템 행위자는 작성자가 없어 전부 되돌린다", async () => {
    await setCostRate(null);
    const admin = await makeAdmin();
    const t = await seedTargets();
    const payload = (value: unknown) => ({ schemaVersion: "1", exportedAt: new Date().toISOString(), settings: { [PROJECT_COST_RATE_PCT.key]: value } });

    await expect(importSettings(admin, payload(101), { afterApply: seedInitialBudgets })).rejects.toThrow();
    expect(await db.select().from(projectBudgetEntries)).toEqual([]);

    await expect(importSettings(SYSTEM_VIEWER, payload(70), { afterApply: seedInitialBudgets })).rejects.toThrow("예산 줄 작성자 없음");
    expect(await getSettingValue(PROJECT_COST_RATE_PCT)).toBeNull();
    expect(await db.select().from(projectBudgetEntries)).toEqual([]);

    await importSettings(admin, payload(70), { afterApply: seedInitialBudgets });
    expect(await getSettingValue(PROJECT_COST_RATE_PCT)).toBe(70);
    expect(await entriesOf(t.po.projectId)).toEqual([{ reason: "initial", base: 10_000_000, rate: "70.0", delta: 7_000_000, memo: null }]);
  });

  it("afterApply 없이 가져오면 기존 동작 그대로 — 줄 없음", async () => {
    await setCostRate(null);
    const admin = await makeAdmin();
    await seedTargets();
    await importSettings(admin, { schemaVersion: "1", exportedAt: new Date().toISOString(), settings: { [PROJECT_COST_RATE_PCT.key]: 70 } });
    expect(await getSettingValue(PROJECT_COST_RATE_PCT)).toBe(70);
    expect(await db.select().from(projectBudgetEntries)).toEqual([]);
  });
});

describe("예산 직접 수정 (07-24 Task 2 · D-729)", () => {
  async function withBudget() {
    await setCostRate(70);
    const s = await setup();
    await savePo(s, 10_000_000);
    return s;
  }

  async function budgetLogs(projectId: string) {
    return (await db.select().from(actionLog).where(eq(actionLog.entityId, projectId))).filter((row) => row.actionType === "budget_manual_change");
  }

  it("700만 → 500만: manual −200만(base · 율 NULL · memo) + 행동 로그 같은 tx", async () => {
    const s = await withBudget();
    const viewer = await makeBudgetViewer();
    expect(await setBudgetManually(viewer, s.projectId, { budgetKrw: 5_000_000, expectedBudgetKrw: 7_000_000, memo: "  오입력 정정 " })).toEqual({ budgetKrw: 5_000_000 });
    expect((await entriesOf(s.projectId)).at(-1)).toEqual({ reason: "manual", base: null, rate: null, delta: -2_000_000, memo: "오입력 정정" });
    const logs = await budgetLogs(s.projectId);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.actorId).toBe(viewer.id);
    expect(logs[0]?.detail).toEqual({ changes: { budgetKrw: [7_000_000, 5_000_000] }, memo: "오입력 정정" });
  });

  it("사유 공백 · 501자 · 음수 · 소수 · 같은 값 · 경합 · 쓰기 없음은 줄 · 로그 없음", async () => {
    const s = await withBudget();
    const viewer = await makeBudgetViewer();
    const call = (input: { budgetKrw: number; expectedBudgetKrw: number; memo: string }, who = viewer) => setBudgetManually(who, s.projectId, input);
    await expect(call({ budgetKrw: 5_000_000, expectedBudgetKrw: 7_000_000, memo: "   " })).rejects.toThrow("사유 · 입력");
    await expect(call({ budgetKrw: 5_000_000, expectedBudgetKrw: 7_000_000, memo: "가".repeat(501) })).rejects.toThrow("사유 · 500자 이하");
    await expect(call({ budgetKrw: -1, expectedBudgetKrw: 7_000_000, memo: "정정" })).rejects.toThrow("예산은 0 이상 · 금액 수정");
    await expect(call({ budgetKrw: 1.5, expectedBudgetKrw: 7_000_000, memo: "정정" })).rejects.toThrow("예산은 0 이상 · 금액 수정");
    await expect(call({ budgetKrw: 5_000_000, expectedBudgetKrw: 6_000_000, memo: "정정" })).rejects.toThrow("다른 사람이 먼저 수정 · 새로 불러오기");
    expect(await call({ budgetKrw: 7_000_000, expectedBudgetKrw: 7_000_000, memo: "그대로" })).toEqual({ budgetKrw: 7_000_000 });
    const readOnly = await makeBudgetViewer({ write: false });
    await expect(call({ budgetKrw: 5_000_000, expectedBudgetKrw: 7_000_000, memo: "정정" }, readOnly)).rejects.toThrow();
    expect(await entriesOf(s.projectId)).toHaveLength(1);
    expect(await budgetLogs(s.projectId)).toEqual([]);
  });

  it("행 범위 밖 프로젝트는 쓰기 권한이 있어도 거부 · 줄 · 로그 없음", async () => {
    const s = await withBudget();
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `팀 경영관리-${randomUUID()}`, viewScope: "team" });
    for (const [menu, action] of [["projects", "view"], ["projects.budget", "view"], ["projects.budget", "write"]] as const) {
      await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu, action, allowed: true });
    }
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "budget.amount", visible: true });
    const otherTeam = await makeViewer(role.id, await makeTeam());
    await expect(setBudgetManually(otherTeam, s.projectId, { budgetKrw: 5_000_000, expectedBudgetKrw: 7_000_000, memo: "정정" })).rejects.toThrow("프로젝트 없음");
    expect(await entriesOf(s.projectId)).toHaveLength(1);
    expect(await budgetLogs(s.projectId)).toEqual([]);
  });

  // 게이트 R-1 · C-1: 쓰기 권한이 있어도 금액을 못 보는 역할은 예상 금액 대조(맞으면 ok · 틀리면 충돌 문구)로 금액을 알아내거나
  // 값을 모른 채 덮어쓸 수 있었다. 금액 보기 확인이 대조 · 쓰기보다 먼저다 — 맞는 값 · 틀린 값 모두 같은 거부.
  it("쓰기는 있어도 budget.amount를 못 보면 맞는 예상 값 · 틀린 예상 값 모두 같은 거부 · 줄 · 로그 없음", async () => {
    const s = await withBudget();
    const blind = await makeBudgetViewer({ amount: false });
    await expect(setBudgetManually(blind, s.projectId, { budgetKrw: 7_300_001, expectedBudgetKrw: 7_000_000, memo: "정정" })).rejects.toThrow("예산 금액 보기 권한 없음");
    await expect(setBudgetManually(blind, s.projectId, { budgetKrw: 7_300_001, expectedBudgetKrw: 6_000_000, memo: "정정" })).rejects.toThrow("예산 금액 보기 권한 없음");
    expect(await entriesOf(s.projectId)).toHaveLength(1);
    expect(await budgetLogs(s.projectId)).toEqual([]);
  });

  it("0으로 내릴 수 있고 그 뒤 PO 증액은 늘어난 만큼만 더한다", async () => {
    const s = await withBudget();
    const viewer = await makeBudgetViewer();
    await setBudgetManually(viewer, s.projectId, { budgetKrw: 0, expectedBudgetKrw: 7_000_000, memo: "취소분" });
    expect(await budgetOf(s.projectId)).toBe(0);
    await savePo(s, 11_000_000);
    expect(await budgetOf(s.projectId)).toBe(700_000);
  });
});

describe("프로젝트 화면 DTO에 예산 없음 (07-24 Task 2 · SC-20)", () => {
  it("시스템 관리자로도 상세 · 목록 DTO에 예산 · 사용액 · 남은 예산 키가 없다", async () => {
    await setCostRate(70);
    const s = await setup();
    await savePo(s, 10_000_000);
    const admin = await makeAdmin();
    const detail = await findProject(admin, s.projectId);
    const list = await loadProjectList(admin, { year: "all" });
    const keys = JSON.stringify([detail, list]);
    expect(keys).not.toMatch(/"(budget|budgetKrw|usedKrw|remainingKrw|usage|remaining)[A-Za-z]*"\s*:/);
  });
});

// ── Task 3 ────────────────────────────────────────────────────────────────

describe("예산 이력 읽기 (07-24 Task 3 · SC-21 · K9)", () => {
  it("최신 위 · 사유 낱말 · 직접 수정 메모 · 현재 예산 · 쓰기 판정", async () => {
    await setCostRate(70);
    const s = await setup();
    await savePo(s, 10_000_000);
    const viewer = await makeBudgetViewer();
    await setBudgetManually(viewer, s.projectId, { budgetKrw: 5_000_000, expectedBudgetKrw: 7_000_000, memo: "오입력 정정" });

    const history = await listBudgetHistory(viewer, s.projectId, { cursor: null });
    expect(history).toMatchObject({ projectId: s.projectId, currentBudgetKrw: 5_000_000, canWrite: true, nextCursor: null });
    expect(history.entries.map(({ reasonWord, deltaKrw, memo }) => ({ reasonWord, deltaKrw, memo }))).toEqual([
      { reasonWord: "직접 수정", deltaKrw: -2_000_000, memo: "오입력 정정" },
      { reasonWord: "PO 금액 변경", deltaKrw: 7_000_000, memo: null },
    ]);
    expect(history.entries[0]?.at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);

    const readOnly = await listBudgetHistory(await makeBudgetViewer({ write: false }), s.projectId, { cursor: null });
    expect(readOnly.canWrite).toBe(false);
  });

  it("11줄이면 10줄 + 다음 쪽 · 다음 쪽은 나머지 1줄 · 이력 없으면 빈 목록", async () => {
    await setCostRate(70);
    const s = await setup();
    for (let step = 1; step <= 11; step += 1) await savePo(s, step * 1_000_000);
    const viewer = await makeBudgetViewer();
    const first = await listBudgetHistory(viewer, s.projectId, { cursor: null });
    expect(first.entries).toHaveLength(10);
    expect(first.nextCursor).not.toBeNull();
    const second = await listBudgetHistory(viewer, s.projectId, { cursor: first.nextCursor });
    expect(second.entries).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.entries, ...second.entries].map((entry) => entry.id)).size).toBe(11);

    const empty = await setup();
    expect((await listBudgetHistory(viewer, empty.projectId, { cursor: null })).entries).toEqual([]);
  });

  it("보기 권한 · 금액 정보 항목 · 행 범위가 없으면 거부", async () => {
    await setCostRate(70);
    const s = await setup();
    await savePo(s, 10_000_000);
    await expect(listBudgetHistory(await makeViewer(DEFAULT_ROLE_ID, s.teamId), s.projectId, { cursor: null })).rejects.toThrow();
    await expect(listBudgetHistory(await makeBudgetViewer({ amount: false }), s.projectId, { cursor: null })).rejects.toThrow();
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `팀 예산-${randomUUID()}`, viewScope: "team" });
    for (const [menu, action] of [["projects", "view"], ["projects.budget", "view"]] as const) {
      await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu, action, allowed: true });
    }
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "budget.amount", visible: true });
    await expect(listBudgetHistory(await makeViewer(role.id, await makeTeam()), s.projectId, { cursor: null })).rejects.toThrow("프로젝트 없음");
  });
});
