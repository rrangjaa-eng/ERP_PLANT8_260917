import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { projects, quoteLines, revenueEntries, teams } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import type { Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createProject, loadProjectList } from "@/domain/projects";
import { profitBasisFor } from "@/domain/projects/list-view";
import { PROJECT_STATUSES, type ProjectStatus } from "@/domain/projects/status-transitions";
import {
  aggregateProjects as repoAggregateProjects,
  listProjectsPage as repoListProjectsPage,
  type ProjectListFilter,
} from "@/repositories/projects";
import { getCurrentQuoteRevision, listQuoteLines, saveQuoteLines } from "@/domain/quotes/lines";
import { kstYear } from "@/lib/kst-date";

// 04-17(D-88 · D-89 · D-90 · 계약 7 · CEO C-01 · C-14 · C-21 · 엔지 리뷰 C) — 목록 입구 loadProjectList와
// 리포지토리 목록·집계를 실제 Postgres에서 본다. 매 테스트 전 표가 비워진다(setup.ts) — 픽스처는 표식 검색어로
// 다시 한 번 좁힌다.

type Base = { clientId: string; pmUserId: string; teamId: string };

async function makeBase(): Promise<Base> {
  const client = await insertVendor(SYSTEM_VIEWER, {
    name: `거래처-${randomUUID()}`,
    normalizedName: `거래처-${randomUUID()}`,
  });
  const { userId: pmUserId } = await createAccount(SYSTEM_VIEWER, {
    email: `pm-${randomUUID()}@example.test`,
    name: "통합테스트 PM",
    roleId: DEFAULT_ROLE_ID,
  });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  return { clientId: client.id, pmUserId, teamId: team.id };
}

type ProjectFixture = {
  status?: ProjectStatus;
  startDate?: string | null;
  endDate?: string | null;
  createdAt?: Date;
  archived?: boolean;
  /** 현재 차수 견적 줄 하나(수주중일 때 저장한 뒤 상태를 바꾼다). */
  line?: { quote: number; execution: number };
  issues?: number[];
  payments?: number[];
};

async function makeProject(base: Base, marker: string, fixture: ProjectFixture = {}): Promise<{ id: string; number: string }> {
  const created = await createProject(SYSTEM_VIEWER, {
    clientId: base.clientId,
    teamId: base.teamId,
    pmUserId: base.pmUserId,
    name: `${marker}-${randomUUID().slice(0, 8)}`,
  });
  if (fixture.line) await addQuoteLine(created.id, fixture.line);
  await db
    .update(projects)
    .set({
      status: fixture.status ?? "bidding",
      startDate: fixture.startDate ?? null,
      endDate: fixture.endDate ?? null,
      ...(fixture.createdAt ? { createdAt: fixture.createdAt } : {}),
      archivedAt: fixture.archived ? new Date() : null,
    })
    .where(eq(projects.id, created.id));
  for (const amount of fixture.issues ?? []) await addRevenue(created.id, "issue", amount);
  for (const amount of fixture.payments ?? []) await addRevenue(created.id, "payment", amount);
  return { id: created.id, number: created.number };
}

async function addQuoteLine(projectId: string, amounts: { quote: number; execution: number }, itemName = "항목") {
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, projectId);
  if (!revision) throw new Error("현재 차수를 찾지 못했습니다");
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: [
      {
        id: randomUUID(),
        isNew: true,
        subcategory: "sub-a",
        itemName,
        quantity: 1,
        unitPrice: { currency: "KRW", amount: amounts.quote, fxRate: 1 },
        execution: { currency: "KRW", amount: amounts.execution, fxRate: 1 },
      },
    ],
  });
}

async function addRevenue(projectId: string, kind: "issue" | "payment", amount: number): Promise<string> {
  const [row] = await db
    .insert(revenueEntries)
    .values({ projectId, kind, entryDate: "2026-09-10", amountCurrency: "KRW", amountFxRate: "1.0000", amountAmountKrw: amount })
    .returning({ id: revenueEntries.id });
  if (!row) throw new Error("매출 줄을 넣지 못했습니다");
  return row.id;
}

const ALL_SCOPE = { rows: "all", includeArchived: false } as const;

async function repoRows(filter: ProjectListFilter) {
  return repoListProjectsPage(SYSTEM_VIEWER, { scope: ALL_SCOPE, filter, sort: { key: "endDate", direction: "asc" }, offset: 0, limit: 50 });
}

const pmViewer = (userId: string): Viewer => ({ id: userId, roleId: DEFAULT_ROLE_ID });

// 금액 두 정보 항목을 조합별로 켠 전용 계급(시드 계급을 고치지 않는다).
async function viewerWith(visibility: { quote: boolean; revenue: boolean }): Promise<Viewer> {
  const roleId = `role-it-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id: roleId, name: `통합 ${roleId.slice(-8)}`, sortOrder: 99 });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "projects", action: "view", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "project.value", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "quote.amount", visible: visibility.quote });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "revenue.issued_amount", visible: visibility.revenue });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `it-${randomUUID()}@example.test`, name: "금액 조합", roleId });
  return { id: userId, roleId };
}

const NON_AMOUNT_TOTAL_KEYS = ["title", "count", "exclusionText"];
const amountKeys = (totals: object) => Object.keys(totals).filter((key) => !NON_AMOUNT_TOTAL_KEYS.includes(key)).sort();

describe("리포지토리 목록 · 집계 (04-17, 실제 Postgres)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(a) 집계 리포지토리 함수가 귀속 구간이 있어도 SQL 왕복 한 번으로 구간별 건수 · 합계를 계산한다", async () => {
    const base = await makeBase();
    await makeProject(base, "왕복", { endDate: "2026-09-15", line: { quote: 1_000_000, execution: 400_000 } });
    await makeProject(base, "왕복", { startDate: "2026-12-20", endDate: "2027-01-15" });

    const querySpy = vi.spyOn(pool, "query");
    const buckets = await repoAggregateProjects(SYSTEM_VIEWER, {
      scope: ALL_SCOPE,
      filter: { range: { start: "2026-01-01", end: "2026-12-31" } },
    });
    expect(querySpy).toHaveBeenCalledTimes(1);
    expect(buckets.find((bucket) => bucket.bucket === "in")?.quoteAmountKrw).toBe(1_000_000);
    expect(buckets.find((bucket) => bucket.bucket === "2027")?.count).toBe(1);
  });

  it("(DR-8) 부분 발행된 진행 건은 견적 기준이다 — 수익금 +20,000,000, 매출 30,000,000, 수익률 0.2", async () => {
    const base = await makeBase();
    const marker = `진행발행-${randomUUID().slice(0, 8)}`;
    await makeProject(base, marker, {
      status: "in_progress",
      startDate: "2026-09-01",
      endDate: "2099-12-31",
      line: { quote: 100_000_000, execution: 80_000_000 },
      issues: [30_000_000],
    });

    const [row] = await repoRows({ search: marker });
    expect(row).toMatchObject({ profitBasis: "quote", netProfitKrw: 20_000_000, revenueKrw: 30_000_000, issuedCount: 1 });
    expect(row?.profitRate).toBeCloseTo(0.2, 10);
  });

  it("(DR-8 · DR-38) 정산 · 완료의 발행 기준과 발행 0개 정산의 견적 기준 · 기준 ≤ 0 수익률 null", async () => {
    const base = await makeBase();
    const issued = `정산발행-${randomUUID().slice(0, 8)}`;
    const noIssue = `정산무발행-${randomUUID().slice(0, 8)}`;
    const negative = `완료음수-${randomUUID().slice(0, 8)}`;
    await makeProject(base, issued, {
      status: "settling",
      endDate: "2026-09-01",
      line: { quote: 12_000_000, execution: 7_000_000 },
      issues: [10_000_000, -1_000_000],
    });
    await makeProject(base, noIssue, { status: "settling", endDate: "2026-09-01", line: { quote: 12_000_000, execution: 7_000_000 } });
    await makeProject(base, negative, {
      status: "completed",
      endDate: "2026-09-01",
      line: { quote: 600_000, execution: 500_000 },
      issues: [1_000_000, -2_000_000],
    });

    const [issuedRow] = await repoRows({ search: issued });
    expect(issuedRow).toMatchObject({ profitBasis: "issued", netProfitKrw: 2_000_000, revenueKrw: 9_000_000 });
    expect(issuedRow?.profitRate).toBeCloseTo(2 / 9, 10);

    const [noIssueRow] = await repoRows({ search: noIssue });
    expect(noIssueRow).toMatchObject({ profitBasis: "quote", netProfitKrw: 5_000_000, revenueKrw: null, issuedCount: 0 });

    const [negativeRow] = await repoRows({ search: negative });
    expect(negativeRow).toMatchObject({ profitBasis: "issued", netProfitKrw: -1_500_000, profitRate: null });
  });

  it("(계약 7) 다섯 상태 × {발행 0, 1 이상}에서 리포지토리 기준과 profitBasisFor가 같다", async () => {
    const base = await makeBase();
    const marker = `기준정합-${randomUUID().slice(0, 8)}`;
    for (const status of PROJECT_STATUSES) {
      for (const issues of [[], [500_000]]) {
        await makeProject(base, marker, { status, endDate: "2099-12-31", line: { quote: 1_000_000, execution: 100_000 }, issues });
      }
    }

    const rows = await repoRows({ search: marker });
    expect(rows).toHaveLength(PROJECT_STATUSES.length * 2);
    for (const row of rows) {
      expect(row.profitBasis).toBe(profitBasisFor(row.status, row.issuedCount));
    }
    expect(new Set(rows.map((row) => row.profitBasis))).toEqual(new Set(["quote", "issued"]));
  });

  it("(C-14) 입금 줄은 매출 · 기준에 더해지지 않는다", async () => {
    const base = await makeBase();
    const marker = `입금제외-${randomUUID().slice(0, 8)}`;
    await makeProject(base, marker, {
      status: "settling",
      endDate: "2026-09-01",
      line: { quote: 3_000_000, execution: 400_000 },
      issues: [1_000_000],
      payments: [1_000_000],
    });

    const [row] = await repoRows({ search: marker });
    expect(row).toMatchObject({ revenueKrw: 1_000_000, issuedCount: 1, profitBasis: "issued", netProfitKrw: 600_000 });

    const { totals } = await loadProjectList(SYSTEM_VIEWER, { year: "all", search: marker });
    expect(totals.revenueKrw).toBe(1_000_000);
    expect(totals.profitKrw).toBe(600_000);
  });
});

describe("loadProjectList — 목록 입구 (04-17, 실제 Postgres)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(C-01) 합계가 21억 원을 넘어도 정확하고 합계 · 행의 금액 · 건수가 전부 숫자다", async () => {
    const base = await makeBase();
    const marker = `큰합계-${randomUUID().slice(0, 8)}`;
    for (let i = 0; i < 2; i += 1) {
      await makeProject(base, marker, { endDate: "2026-10-01", line: { quote: 1_500_000_000, execution: 0 } });
    }

    const { totals, rows } = await loadProjectList(SYSTEM_VIEWER, { year: "all", search: marker });
    expect(totals.quoteAmountKrw).toBe(3_000_000_000);
    for (const key of ["count", "revenueKrw", "quoteAmountKrw", "executionAmountKrw", "profitKrw", "profitRate"] as const) {
      expect(typeof totals[key], key).toBe("number");
    }
    for (const row of rows) {
      for (const key of ["quoteAmountKrw", "executionAmountKrw", "profitKrw"] as const) expect(typeof row[key], key).toBe("number");
    }
    for (const row of await repoRows({ search: marker })) {
      for (const key of ["quoteAmountKrw", "executionAmountKrw", "profitKrw", "netProfitKrw", "issuedCount", "profitRate"] as const) {
        expect(typeof row[key], key).toBe("number");
      }
    }
  });

  it("(b · D-91) 125행 보기 — page=3은 101~125번째 25행, page=99는 마지막 쪽, 1~3쪽을 이으면 전체와 순서까지 같고 합계는 쪽과 무관하다", async () => {
    const base = await makeBase();
    const marker = `페이지-${randomUUID().slice(0, 8)}`;
    for (let i = 0; i < 125; i += 1) {
      await makeProject(base, marker, {
        endDate: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`,
        ...(i < 3 ? { line: { quote: (i + 1) * 1_000_000, execution: 0 } } : {}),
      });
    }
    const all = await repoListProjectsPage(SYSTEM_VIEWER, {
      scope: ALL_SCOPE,
      filter: { search: marker },
      sort: { key: "endDate", direction: "asc" },
      offset: 0,
      limit: 200,
    });
    expect(all).toHaveLength(125);

    const pages = [];
    for (const page of [1, 2, 3]) pages.push(await loadProjectList(SYSTEM_VIEWER, { year: 2026, search: marker, page }));
    expect(pages.map((result) => result.rows.length)).toEqual([50, 50, 25]);
    expect(pages.map((result) => result.page)).toEqual([1, 2, 3]);
    expect(pages[2]?.pageCount).toBe(3);
    expect(pages.flatMap((result) => result.rows.map((row) => row.id))).toEqual(all.map((row) => row.id));

    const clamped = await loadProjectList(SYSTEM_VIEWER, { year: 2026, search: marker, page: 99 });
    expect(clamped.page).toBe(3);
    expect(clamped.rows.map((row) => row.id)).toEqual(pages[2]?.rows.map((row) => row.id));

    // 합계는 렌더된 쪽의 행 수와 무관하다.
    expect(pages[2]?.totals.count).toBe(125);
    expect(pages[2]?.totals.quoteAmountKrw).toBe(6_000_000);
  });

  it("(c) 목록과 합계가 같은 상태 필터를 적용하고 제목에 상태 라벨이 들어간다", async () => {
    const base = await makeBase();
    const { number } = await makeProject(base, "상태필터", { endDate: "2026-11-01", line: { quote: 500_000, execution: 0 } });
    const viewer = pmViewer(base.pmUserId);

    const bidding = await loadProjectList(viewer, { year: 2026, search: number, status: "bidding", statusLabel: "수주중" });
    expect(bidding.rows).toHaveLength(1);
    expect(bidding.totals.count).toBe(1);
    expect(bidding.totals.title).toBe("합계 (수주중 · 2026 귀속 · 1건)");

    const lost = await loadProjectList(viewer, { year: 2026, search: number, status: "lost", statusLabel: "미수주" });
    expect(lost.rows).toHaveLength(0);
    expect(lost.totals.count).toBe(0);
  });

  it("(D-89 · D-90 · 금지) 해를 걸친 프로젝트는 두 해 목록에 보이고 합계는 종료 해 한 곳에만 들어간다", async () => {
    const base = await makeBase();
    const marker = `걸침-${randomUUID().slice(0, 8)}`;
    const spanning = await makeProject(base, marker, {
      startDate: "2026-11-10",
      endDate: "2027-02-05",
      line: { quote: 1_000_000, execution: 100_000 },
    });
    await makeProject(base, marker, { startDate: "2026-03-01", endDate: "2026-03-31", line: { quote: 2_000_000, execution: 0 } });
    await makeProject(base, marker, { line: { quote: 4_000_000, execution: 0 } });
    await makeProject(base, marker, { startDate: "2027-05-01", endDate: "2027-05-02", line: { quote: 8_000_000, execution: 0 } });

    const view2026 = await loadProjectList(SYSTEM_VIEWER, { year: 2026, search: marker });
    expect(view2026.rows).toHaveLength(3);
    expect(view2026.rows.filter((row) => row.id === spanning.id)).toHaveLength(1);
    const spanningRow = view2026.rows.find((row) => row.id === spanning.id);
    expect(spanningRow).toMatchObject({ attributionLabel: "2027 귀속", groupLabel: "2027-02" });
    expect(view2026.totals).toMatchObject({
      title: "합계 (2026 귀속 · 1건)",
      count: 1,
      quoteAmountKrw: 2_000_000,
      exclusionText: "2027 귀속 1건 제외 · 기간 미정 1건 제외",
    });

    const view2027 = await loadProjectList(SYSTEM_VIEWER, { year: 2027, search: marker });
    expect(view2027.rows).toHaveLength(3);
    expect(view2027.rows.find((row) => row.id === spanning.id)?.attributionLabel).toBeNull();
    expect(view2027.totals).toMatchObject({ count: 2, quoteAmountKrw: 9_000_000, exclusionText: "기간 미정 1건 제외" });

    const all = await loadProjectList(SYSTEM_VIEWER, { year: "all", search: marker });
    expect(all.rows).toHaveLength(4);
    expect(all.totals).toMatchObject({ title: "합계 (전체 연도 · 3건)", exclusionText: "기간 미정 1건 제외" });
    // 두 해 합계의 합 = 전체 연도 합계(기간 미정은 어디에도 들지 않는다) — 이중 계산 없음.
    expect((view2026.totals.quoteAmountKrw ?? 0) + (view2027.totals.quoteAmountKrw ?? 0)).toBe(all.totals.quoteAmountKrw);
    expect(view2026.totals.count + view2027.totals.count).toBe(all.totals.count);
  });

  it("(D-89) 조건 없는 요청은 올해(KST) 보기다", async () => {
    const base = await makeBase();
    const marker = `올해-${randomUUID().slice(0, 8)}`;
    await makeProject(base, marker, { endDate: "2027-01-01" });
    await makeProject(base, marker, { endDate: "2026-12-31" });

    // UTC 2026-12-31 15:00 = KST 2027-01-01 00:00 — 기본 연도는 2027이다.
    const result = await loadProjectList(SYSTEM_VIEWER, { search: marker }, { now: () => new Date("2026-12-31T15:00:00Z") });
    expect(result.year).toBe(2027);
    expect(result.rows.map((row) => row.endDate)).toEqual(["2027-01-01"]);
  });

  it("(C-11) 기간 미정은 수주중이면 항상, 그 밖은 등록일(KST)이 범위 안일 때만 보이고 늘 합계 밖이다", async () => {
    const base = await makeBase();
    const marker = `기간미정-${randomUUID().slice(0, 8)}`;
    const oldBidding = await makeProject(base, marker, { createdAt: new Date("2020-05-01T00:00:00Z"), line: { quote: 1_000, execution: 0 } });
    // KST 2027-01-01 00:30 = UTC 2026-12-31 15:30.
    const newYearLost = await makeProject(base, marker, { status: "lost", createdAt: new Date("2026-12-31T15:30:00Z") });

    const view2026 = await loadProjectList(SYSTEM_VIEWER, { year: 2026, search: marker });
    expect(view2026.rows.map((row) => row.id)).toEqual([oldBidding.id]);
    expect(view2026.rows[0]?.groupLabel).toBe("기간 미정");

    const view2027 = await loadProjectList(SYSTEM_VIEWER, { year: 2027, search: marker });
    expect(view2027.rows.map((row) => row.id).sort()).toEqual([oldBidding.id, newYearLost.id].sort());
    expect(view2027.totals).toMatchObject({ count: 0, quoteAmountKrw: 0, exclusionText: "기간 미정 2건 제외" });

    const all = await loadProjectList(SYSTEM_VIEWER, { year: "all", search: marker });
    expect(all.rows).toHaveLength(2);
  });

  it("(D-87 · C-16) 합계 수익금 = Σ(행 기준 − 실행가) · 합계 수익률 = Σ수익금 ÷ Σ기준 · Σ기준 ≤ 0이면 null", async () => {
    const base = await makeBase();
    const mixed = `혼합-${randomUUID().slice(0, 8)}`;
    await makeProject(base, mixed, {
      status: "in_progress",
      startDate: "2026-09-01",
      endDate: "2099-12-31",
      line: { quote: 100_000_000, execution: 80_000_000 },
      issues: [30_000_000],
    });
    await makeProject(base, mixed, {
      status: "settling",
      endDate: "2026-09-01",
      line: { quote: 12_000_000, execution: 7_000_000 },
      issues: [10_000_000, -1_000_000],
    });
    await makeProject(base, mixed, {
      status: "completed",
      endDate: "2026-09-01",
      line: { quote: 600_000, execution: 500_000 },
      issues: [1_000_000, -2_000_000],
    });

    const rows = await repoRows({ search: mixed });
    const profit = rows.reduce((sum, row) => sum + row.netProfitKrw, 0);
    const basis = rows.reduce((sum, row) => sum + row.netProfitKrw + row.executionAmountKrw, 0);
    const { totals } = await loadProjectList(SYSTEM_VIEWER, { year: "all", search: mixed });
    expect(totals.profitKrw).toBe(profit);
    expect(totals.profitKrw).toBe(20_500_000);
    expect(totals.revenueKrw).toBe(38_000_000);
    expect(totals.quoteAmountKrw).toBe(112_600_000);
    expect(totals.executionAmountKrw).toBe(87_500_000);
    expect(totals.profitRate).toBeCloseTo(profit / basis, 10);

    const negative = `음수기준-${randomUUID().slice(0, 8)}`;
    await makeProject(base, negative, {
      status: "completed",
      endDate: "2026-09-01",
      line: { quote: 600_000, execution: 500_000 },
      issues: [1_000_000, -2_000_000],
    });
    const negativeTotals = (await loadProjectList(SYSTEM_VIEWER, { year: "all", search: negative })).totals;
    expect(negativeTotals.profitKrw).toBe(-1_500_000);
    expect(negativeTotals.profitRate).toBeNull();
  });

  it("(A-04 · D18) 보관된 견적 줄 · 발행 줄은 합계에서 빠지고 보관된 프로젝트는 시스템 관리자에게도 없다", async () => {
    const base = await makeBase();
    const marker = `보관-${randomUUID().slice(0, 8)}`;
    const bidding = await makeProject(base, marker, { endDate: "2026-10-01", line: { quote: 1_000_000, execution: 100_000 } });
    await addQuoteLine(bidding.id, { quote: 5_000_000, execution: 500_000 }, "보관될 줄");
    await db.update(quoteLines).set({ archivedAt: new Date() }).where(eq(quoteLines.itemName, "보관될 줄"));

    const settling = await makeProject(base, marker, {
      status: "settling",
      endDate: "2026-10-01",
      line: { quote: 2_000_000, execution: 0 },
      issues: [700_000],
    });
    const archivedIssue = await addRevenue(settling.id, "issue", 9_000_000);
    await db.update(revenueEntries).set({ archivedAt: new Date() }).where(eq(revenueEntries.id, archivedIssue));

    await makeProject(base, marker, { endDate: "2026-10-01", archived: true, line: { quote: 70_000_000, execution: 0 } });

    const { rows, totals } = await loadProjectList(SYSTEM_VIEWER, { year: "all", search: marker });
    expect(rows).toHaveLength(2);
    expect(totals).toMatchObject({ count: 2, quoteAmountKrw: 3_000_000, executionAmountKrw: 100_000, revenueKrw: 700_000 });
  });

  it("(C-14 · 공백 1) 합계 금액 키 집합 — quote.amount만 · revenue.issued_amount만 · 둘 다 · 둘 다 없음, 행 금액 키는 새 입구에서 빠진다", async () => {
    const base = await makeBase();
    const marker = `키집합-${randomUUID().slice(0, 8)}`;
    await makeProject(base, marker, {
      status: "settling",
      endDate: "2026-10-01",
      line: { quote: 700_000, execution: 300_000 },
      issues: [600_000],
    });

    const quoteOnly = await loadProjectList(await viewerWith({ quote: true, revenue: false }), { year: "all", search: marker });
    expect(amountKeys(quoteOnly.totals)).toEqual(["executionAmountKrw", "quoteAmountKrw"]);

    const revenueOnly = await loadProjectList(await viewerWith({ quote: false, revenue: true }), { year: "all", search: marker });
    expect(amountKeys(revenueOnly.totals)).toEqual(["revenueKrw"]);

    const both = await loadProjectList(await viewerWith({ quote: true, revenue: true }), { year: "all", search: marker });
    expect(amountKeys(both.totals)).toEqual(["executionAmountKrw", "profitKrw", "profitRate", "quoteAmountKrw", "revenueKrw"]);

    const none = await loadProjectList(await viewerWith({ quote: false, revenue: false }), { year: "all", search: marker });
    expect(amountKeys(none.totals)).toEqual([]);
    expect(none.totals.count).toBe(1);
    const [row] = none.rows;
    expect(row).toBeTruthy();
    for (const key of ["quoteAmountKrw", "executionAmountKrw", "revenueKrw", "profitKrw", "netProfitKrw", "profitRate", "profitBasis", "issuedCount"]) {
      expect(Object.keys(row!)).not.toContain(key);
    }
  });

  it("(공백 1) 명세 밖 행 칸(발행 합계 · 기준 · 수익금)은 금액을 볼 수 있어도 응답에 없다", async () => {
    const base = await makeBase();
    const marker = `명세밖-${randomUUID().slice(0, 8)}`;
    await makeProject(base, marker, { status: "settling", endDate: "2026-10-01", line: { quote: 700_000, execution: 300_000 }, issues: [600_000] });

    const [row] = (await loadProjectList(SYSTEM_VIEWER, { year: "all", search: marker })).rows;
    expect(row?.quoteAmountKrw).toBe(700_000);
    for (const key of ["revenueKrw", "netProfitKrw", "profitRate", "profitBasis", "issuedCount"]) {
      expect(Object.keys(row!)).not.toContain(key);
    }
  });

  it("(ENG-D3 ②) 목록 요청 한 번의 DB 호출 수가 1행 보기와 50행 보기에서 같다", async () => {
    const base = await makeBase();
    const one = `한행-${randomUUID().slice(0, 8)}`;
    const fifty = `오십행-${randomUUID().slice(0, 8)}`;
    await makeProject(base, one, { endDate: "2026-10-01" });
    for (let i = 0; i < 50; i += 1) await makeProject(base, fifty, { endDate: "2026-10-01" });
    const viewer = pmViewer(base.pmUserId);
    await loadProjectList(viewer, { year: "all", search: one });

    async function countCalls(search: string): Promise<{ rows: number; calls: number }> {
      const querySpy = vi.spyOn(pool, "query");
      const connectSpy = vi.spyOn(pool, "connect");
      const result = await loadProjectList(viewer, { year: "all", search });
      const calls = querySpy.mock.calls.length + connectSpy.mock.calls.length;
      vi.restoreAllMocks();
      return { rows: result.rows.length, calls };
    }

    const oneRow = await countCalls(one);
    const fiftyRows = await countCalls(fifty);
    expect(oneRow.rows).toBe(1);
    expect(fiftyRows.rows).toBe(50);
    expect(fiftyRows.calls).toBe(oneRow.calls);
  });

  it("(e) 종료일 없는 건은 「기간 미정」, 종료일이 있는 건은 「YYYY-MM」 그룹으로 간다", async () => {
    const base = await makeBase();
    const undated = await makeProject(base, "그룹");
    const dated = await makeProject(base, "그룹", { endDate: "2026-09-15" });

    const [undatedRow] = (await loadProjectList(SYSTEM_VIEWER, { year: "all", search: undated.number })).rows;
    expect(undatedRow?.groupLabel).toBe("기간 미정");
    const [datedRow] = (await loadProjectList(SYSTEM_VIEWER, { year: "all", search: dated.number })).rows;
    expect(datedRow?.groupLabel).toBe("2026-09");
  });

  // 04-13(D-83 · D-87 · 금지 항목) — 모든 종류의 줄이 저장 → 상세 합계 → 목록 · 합계를 같은 금액으로 지난다.
  it("(g) 한 차수의 견적 줄 · 견적 외 비용 · 조정 줄 실행가 합이 상세 합계 · 목록 · 합계에서 같다", async () => {
    const base = await makeBase();
    const project = await makeProject(base, "줄종류", { endDate: "2026-09-25" });
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("현재 차수를 찾지 못했습니다");
    const line = (lineKind: "quote" | "out_of_quote" | "adjustment", execution: number) => ({
      id: randomUUID(),
      isNew: true as const,
      lineKind,
      subcategory: lineKind === "quote" ? "sub-a" : "",
      itemName: `${lineKind} 줄`,
      unitPrice: { currency: "KRW" as const, amount: lineKind === "quote" ? 1_000_000 : 0, fxRate: 1 },
      execution: { currency: "KRW" as const, amount: execution, fxRate: 1 },
    });
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
      rows: [line("quote", 400_000), line("out_of_quote", 70_000), line("adjustment", -120_000)],
    });
    const expected = 400_000 + 70_000 - 120_000;

    const detail = await listQuoteLines(SYSTEM_VIEWER, revision.id, { status: "bidding", canWrite: true, canAdjust: true });
    expect(detail.map((row) => row.lineKind).sort()).toEqual(["adjustment", "out_of_quote", "quote"]);
    expect(detail.reduce((sum, row) => sum + row.execution.amountKrw, 0)).toBe(expected);

    const { rows, totals } = await loadProjectList(SYSTEM_VIEWER, { year: "all", search: project.number });
    expect(rows[0]?.executionAmountKrw).toBe(expected);
    expect(totals.executionAmountKrw).toBe(expected);
  });
});

// 04-48 Task 1(D-89 · UX-04) — 기간 필터: 보기 범위 R = 연도 ∩ 기간, 행은 R과 겹치면 보이고 합계는 R 안 귀속만.
describe("loadProjectList — 기간 필터 (04-48, 실제 Postgres)", () => {
  it("(기간 보기) 연도 2026 + 기간 09-01~10-31이면 R이 그 기간이고, 11월에 끝나는 겹친 행은 보이되 합계에서 빠진다", async () => {
    const base = await makeBase();
    const marker = `기간보기-${randomUUID().slice(0, 8)}`;
    await makeProject(base, marker, { startDate: "2026-09-05", endDate: "2026-09-20", line: { quote: 1_000_000, execution: 0 } });
    const spilling = await makeProject(base, marker, {
      startDate: "2026-10-20",
      endDate: "2026-11-15",
      line: { quote: 2_000_000, execution: 0 },
    });
    await makeProject(base, marker, { startDate: "2026-12-01", endDate: "2026-12-10", line: { quote: 4_000_000, execution: 0 } });

    const result = await loadProjectList(SYSTEM_VIEWER, { year: 2026, search: marker, from: "2026-09-01", to: "2026-10-31" });
    expect(result.periodErrors).toEqual({});
    expect(result.rows).toHaveLength(2);
    expect(result.rows.find((row) => row.id === spilling.id)?.attributionLabel).toBe("2026-11 귀속");
    expect(result.totals).toMatchObject({
      title: "합계 (2026-09-01 ~ 2026-10-31 귀속 · 1건)",
      count: 1,
      quoteAmountKrw: 1_000_000,
      exclusionText: "기간 밖 귀속 1건 제외",
    });
  });

  it("(UX-04) 기간 칸에 형식 오류가 있으면 기간 필터 없는 같은 요청과 행 · 합계가 같고 periodErrors에 그 칸의 오류가 있다", async () => {
    const base = await makeBase();
    const marker = `기간오류-${randomUUID().slice(0, 8)}`;
    await makeProject(base, marker, { startDate: "2026-03-01", endDate: "2026-03-20", line: { quote: 1_000_000, execution: 0 } });
    await makeProject(base, marker, { startDate: "2026-09-05", endDate: "2026-09-20", line: { quote: 2_000_000, execution: 0 } });

    const plain = await loadProjectList(SYSTEM_VIEWER, { year: 2026, search: marker });
    const broken = await loadProjectList(SYSTEM_VIEWER, { year: 2026, search: marker, from: "2026-9-1", to: "2026-09-30" });
    expect(broken.periodErrors).toEqual({ from: "날짜 형식 오류 · 2026-09-18처럼" });
    expect(broken.rows.map((row) => row.id)).toEqual(plain.rows.map((row) => row.id));
    expect(broken.rows).toHaveLength(2);
    expect(broken.totals).toEqual(plain.totals);

    const reversed = await loadProjectList(SYSTEM_VIEWER, { year: 2026, search: marker, from: "2026-09-30", to: "2026-09-01" });
    expect(reversed.periodErrors).toEqual({ to: "기간 끝이 시작보다 빠름 · 기간 끝 수정" });
    expect(reversed.totals).toEqual(plain.totals);
  });
});

// 04-48 Task 2(CEO C-08 · 엔지 리뷰 C 공백 8 · DR-30) — 틀린 파라미터 정규화 · 빈 목록 갈래.
describe("loadProjectList — 파라미터 정규화 · 빈 갈래 (04-48, 실제 Postgres)", () => {
  const thisYear = kstYear(new Date());

  it("(C-08) 틀린 파라미터마다 던지지 않고 기본 보기와 같은 결과다", async () => {
    const base = await makeBase();
    const marker = `틀린값-${randomUUID().slice(0, 8)}`;
    await makeProject(base, marker, { startDate: `${thisYear}-03-01`, endDate: `${thisYear}-03-20`, line: { quote: 1_000_000, execution: 0 } });
    await makeProject(base, marker, { status: "lost", startDate: `${thisYear}-04-01`, endDate: `${thisYear}-04-20` });

    const plain = await loadProjectList(SYSTEM_VIEWER, { search: marker });
    expect(plain.rows).toHaveLength(2);
    const cases: { name: string; query: Parameters<typeof loadProjectList>[1] }[] = [
      { name: "teamId=abc", query: { search: marker, teamId: "abc" } },
      { name: "teamId=목록 밖 uuid", query: { search: marker, teamId: randomUUID() } },
      { name: "year=0000", query: { search: marker, year: "0000" } },
      { name: "year=99999", query: { search: marker, year: "99999" } },
      { name: "page=-1", query: { search: marker, page: "-1" } },
      { name: "q 두 개", query: { search: [marker, "다른"] } },
    ];
    for (const { name, query } of cases) {
      const result = await loadProjectList(SYSTEM_VIEWER, query);
      expect(result.year, name).toBe(thisYear);
      expect(result.rows.map((row) => row.id), name).toEqual(plain.rows.map((row) => row.id));
      expect(result.totals, name).toEqual(plain.totals);
    }

    const bidding = await loadProjectList(SYSTEM_VIEWER, { search: marker, status: "bidding" });
    const twoStatuses = await loadProjectList(SYSTEM_VIEWER, { search: marker, status: ["bidding", "lost"] as unknown as string });
    expect(twoStatuses.rows.map((row) => row.id)).toEqual(bidding.rows.map((row) => row.id));
    expect(twoStatuses.rows).toHaveLength(1);

    // 목록에 있는 팀은 그대로 적용된다.
    const team = await loadProjectList(SYSTEM_VIEWER, { search: marker, teamId: base.teamId });
    expect(team.rows).toHaveLength(2);
    expect(team.hasFilter).toBe(true);
  });

  // Opus 검토 NIT 9 — T-04-90 표에 PG를 깨는 기간 값(22008)과 배열 · 중복 teamId 행을 더한다.
  it("(T-04-90) 달력에 없는 날 · 0년 기간과 배열 · 중복 teamId도 던지지 않고 정규화된다", async () => {
    const base = await makeBase();
    const marker = `틀린기간-${randomUUID().slice(0, 8)}`;
    await makeProject(base, marker, { startDate: `${thisYear}-03-01`, endDate: `${thisYear}-03-20`, line: { quote: 1_000_000, execution: 0 } });
    await makeProject(base, marker, { startDate: `${thisYear}-09-05`, endDate: `${thisYear}-09-20` });
    const plain = await loadProjectList(SYSTEM_VIEWER, { search: marker });
    expect(plain.rows).toHaveLength(2);

    for (const from of [`${thisYear}-02-30`, "0000-01-01"]) {
      const result = await loadProjectList(SYSTEM_VIEWER, { search: marker, from });
      expect(result.periodErrors, from).toEqual({ from: "날짜 형식 오류 · 2026-09-18처럼" });
      expect(result.rows.map((row) => row.id), from).toEqual(plain.rows.map((row) => row.id));
      expect(result.totals, from).toEqual(plain.totals);
    }

    const team = await loadProjectList(SYSTEM_VIEWER, { search: marker, teamId: base.teamId });
    const teamCases: { name: string; teamId: readonly string[]; applied: boolean }[] = [
      { name: "teamId=[팀, abc]", teamId: [base.teamId, "abc"], applied: true },
      { name: "teamId=[팀, 팀]", teamId: [base.teamId, base.teamId], applied: true },
      { name: "teamId=[abc, 팀]", teamId: ["abc", base.teamId], applied: false },
    ];
    for (const { name, teamId, applied } of teamCases) {
      const result = await loadProjectList(SYSTEM_VIEWER, { search: marker, teamId });
      expect(result.params.teamId, name).toBe(applied ? base.teamId : undefined);
      expect(result.rows.map((row) => row.id), name).toEqual((applied ? team : plain).rows.map((row) => row.id));
    }
  });

  it("(공백 8) 볼 수 있는 프로젝트가 하나도 없으면 emptyKind는 none이다", async () => {
    const result = await loadProjectList(SYSTEM_VIEWER, {});
    expect(result.total).toBe(0);
    expect(result.emptyKind).toBe("none");
    expect(result.hasFilter).toBe(false);
  });

  it("다른 해에만 프로젝트가 있으면 기본 보기는 default-view, 사용자 필터가 있으면 filtered, 행이 있으면 null이다", async () => {
    const base = await makeBase();
    const marker = `빈갈래-${randomUUID().slice(0, 8)}`;
    await makeProject(base, marker, { startDate: `${thisYear - 3}-03-01`, endDate: `${thisYear - 3}-03-20` });

    expect((await loadProjectList(SYSTEM_VIEWER, {})).emptyKind).toBe("default-view");
    const filtered = await loadProjectList(SYSTEM_VIEWER, { search: `${marker}-없음` });
    expect(filtered.emptyKind).toBe("filtered");
    expect(filtered.hasFilter).toBe(true);
    expect((await loadProjectList(SYSTEM_VIEWER, { year: "all" })).emptyKind).toBeNull();
  });
});
