import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db, pool } from "@/db/client";
import { teams } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import type { Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createProject, listProjects, aggregateProjects } from "@/domain/projects";
import { aggregateProjects as repoAggregateProjects } from "@/repositories/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";

async function setupProject(opts?: { endDate?: string | null; teamId?: string; namePrefix?: string }) {
  const client = await insertVendor(SYSTEM_VIEWER, {
    name: `거래처-${randomUUID()}`,
    normalizedName: `거래처-${randomUUID()}`,
  });
  const { userId: pmUserId } = await createAccount(SYSTEM_VIEWER, {
    email: `pm-${randomUUID()}@example.test`,
    name: "통합테스트 PM",
    roleId: DEFAULT_ROLE_ID,
  });
  let teamId = opts?.teamId;
  if (!teamId) {
    const [team] = await db.select().from(teams).limit(1);
    if (!team) throw new Error("시드된 팀이 없습니다");
    teamId = team.id;
  }

  const project = await createProject(SYSTEM_VIEWER, {
    clientId: client.id,
    teamId,
    pmUserId,
    name: `${opts?.namePrefix ?? "프로젝트"}-${randomUUID()}`,
    endDate: opts?.endDate,
  });

  return { project, pmUserId, teamId };
}

async function addQuoteLine(
  projectId: string,
  amounts: { quantity: number; unitPrice: number; execution: number },
) {
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, projectId);
  if (!revision) throw new Error("현재 차수를 찾지 못했습니다");
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, [
    {
      subcategory: "sub-a",
      itemName: "항목",
      quantity: amounts.quantity,
      unitPrice: { currency: "KRW", amount: amounts.unitPrice, fxRate: 1 },
      execution: { currency: "KRW", amount: amounts.execution, fxRate: 1 },
    },
  ]);
}

const pmViewer = (userId: string): Viewer => ({ id: userId, roleId: DEFAULT_ROLE_ID });

// role-ceo는 domain/seed가 sysadmin·pm 둘만 채우므로 기본 권한·노출표가
// 전혀 없다(revenue-entries.test.ts와 같은 결) — projects view + project.value
// 노출만 부여하고 quote.amount 노출은 **부여하지 않아** "금액 열이 서버에서
// 아예 빠지는" 계급을 만든다(기본 구조 정보는 보이고 금액만 안 보이는 경우를
// 증명하기 위해 project.value는 켠다 — 안 켜면 행 전체가 빈 객체가 된다).
async function createNoAmountViewer(): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, {
    email: `noamount-${randomUUID()}@example.test`,
    name: "통합테스트 금액 미노출",
    roleId: "role-ceo",
  });
  await upsertPermission(SYSTEM_VIEWER, { roleId: "role-ceo", menu: "projects", action: "view", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "project.value", visible: true });
  return { id: userId, roleId: "role-ceo" };
}

describe("domain/projects listProjects/aggregateProjects (Phase 4, 실제 Postgres)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(a) 집계 리포지토리 함수가 SQL 왕복 한 번으로 건수·합계를 계산한다", async () => {
    const { project } = await setupProject({ endDate: "2026-09-15" });
    await addQuoteLine(project.id, { quantity: 1, unitPrice: 1_000_000, execution: 400_000 });

    // 리포지토리 함수를 직접 호출해 권한 판정(can/visible, 별도 DB 조회)
    // 노이즈 없이 집계 쿼리 자체의 왕복 횟수만 잰다 — domain 레벨은 (b)~(e)가
    // 기능을 증명한다.
    const querySpy = vi.spyOn(pool, "query");
    const aggregate = await repoAggregateProjects(SYSTEM_VIEWER, {
      scope: { rows: "all", includeArchived: false },
      filter: {},
    });
    expect(querySpy).toHaveBeenCalledTimes(1);
    expect(aggregate.quoteAmountKrw).toBeGreaterThanOrEqual(1_000_000);
  });

  it("(b) 합계가 렌더된 페이지 크기와 무관하다 — 1건만 렌더돼도 전체 합", async () => {
    const marker = `합계테스트-${randomUUID().slice(0, 8)}`;
    const viewer = pmViewer((await setupProject()).pmUserId);
    await Promise.all(
      [1_000_000, 2_000_000, 3_000_000].map(async (unitPrice) => {
        const { project } = await setupProject({ endDate: "2026-10-01", namePrefix: marker });
        await addQuoteLine(project.id, { quantity: 1, unitPrice, execution: 0 });
        return project;
      }),
    );

    const filter = { search: marker };
    const page = await listProjects(viewer, { filter, limit: 1 });
    expect(page).toHaveLength(1);

    const aggregate = await aggregateProjects(viewer, filter);
    expect(aggregate.count).toBe(3);
    // 세 프로젝트의 견적 합(1,000,000+2,000,000+3,000,000)이 정확히
    // 나온다 — limit=1로 렌더한 목록 건수(1)와 무관.
    expect(aggregate.quoteAmountKrw).toBe(6_000_000);
  });

  it("(c) 목록 쿼리와 집계 쿼리가 같은 상태 필터를 적용한다", async () => {
    const { project: bidding, pmUserId } = await setupProject({ endDate: "2026-11-01" });
    await addQuoteLine(bidding.id, { quantity: 1, unitPrice: 500_000, execution: 0 });
    const viewer = pmViewer(pmUserId);

    const filter = { search: bidding.number };
    const [biddingRows, biddingAgg] = await Promise.all([
      listProjects(viewer, { filter: { ...filter, status: "bidding" } }),
      aggregateProjects(viewer, { ...filter, status: "bidding" }),
    ]);
    expect(biddingRows).toHaveLength(1);
    expect(biddingAgg.count).toBe(1);

    const [lostRows, lostAgg] = await Promise.all([
      listProjects(viewer, { filter: { ...filter, status: "lost" } }),
      aggregateProjects(viewer, { ...filter, status: "lost" }),
    ]);
    expect(lostRows).toHaveLength(0);
    expect(lostAgg.count).toBe(0);
  });

  it("(d) 금액 열을 볼 수 없는 계급의 DTO 키 집합에 견적·실행가·차익이 없다 — 빈 값이 아니라 필드 부재", async () => {
    const { project } = await setupProject({ endDate: "2026-09-20" });
    await addQuoteLine(project.id, { quantity: 1, unitPrice: 700_000, execution: 300_000 });
    const noAmountViewer = await createNoAmountViewer();

    const [row] = await listProjects(noAmountViewer, { filter: { search: project.number } });
    expect(row).toBeTruthy();
    expect(Object.keys(row!)).not.toContain("quoteAmountKrw");
    expect(Object.keys(row!)).not.toContain("executionAmountKrw");
    expect(Object.keys(row!)).not.toContain("profitKrw");
    expect(row!.number).toBe(project.number);

    const aggregate = await aggregateProjects(noAmountViewer, { search: project.number });
    expect(Object.keys(aggregate)).not.toContain("quoteAmountKrw");
    expect(aggregate.count).toBe(1);
  });

  it("(e) 종료일 없는 건은 「기간 미정」 그룹으로 간다", async () => {
    const { project, pmUserId } = await setupProject({ endDate: null });
    const viewer = pmViewer(pmUserId);

    const [row] = await listProjects(viewer, { filter: { search: project.number } });
    expect(row?.groupLabel).toBe("기간 미정");
  });

  it("종료일이 있는 건은 「YYYY-MM」 그룹으로 간다", async () => {
    const { project, pmUserId } = await setupProject({ endDate: "2026-09-15" });
    const viewer = pmViewer(pmUserId);

    const [row] = await listProjects(viewer, { filter: { search: project.number } });
    expect(row?.groupLabel).toBe("2026-09");
  });
});
