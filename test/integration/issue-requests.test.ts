import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { actionLog, projects, revenueEntries, revenueIssueRequests, teams } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import type { Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createProject, CompletedProjectError } from "@/domain/projects";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { listIssueRequests, listProjectIssueRequests, summarizeOpenIssueRequests } from "@/domain/issue-requests";
import { SaveRejectedError } from "@/domain/quotes/lines";
import { ForbiddenError, listRevenue } from "@/domain/revenue";
import { getSettingValue as realGetSettingValue } from "@/domain/settings/registry";
import { TAX_VAT_RATE } from "@/domain/settings/keys";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { insertRole } from "@/repositories/roles";
import { insertIssueRequest } from "@/repositories/revenue-issue-requests";
import { deferred, waitForLockWaiter, type Deferred } from "./lock-race";

// 06-18 — 발행 요청(D-610): PM이 요청 줄을 일괄 저장하고, 매출 기록 권한자가 새 발행 줄에 `fromIssueRequestId`를 실어 저장하면
// 같은 트랜잭션에서 요청이 `발행됨`으로 이어진다. 표는 06-27, 이 파일은 domain · 원장 경로만 본다(UI는 E2E).

async function setupProject() {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}`, normalizedName: `거래처-${randomUUID()}` });
  const { userId: pmUserId } = await createAccount(SYSTEM_VIEWER, {
    email: `pm-${randomUUID()}@example.test`,
    name: "통합테스트 PM",
    roleId: DEFAULT_ROLE_ID,
  });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId, name: `프로젝트-${randomUUID()}` });
  return { project, pm: { id: pmUserId, roleId: DEFAULT_ROLE_ID } satisfies Viewer };
}

// 매출 기록 권한자(경영관리) — 프로젝트 쓰기 없음. 발행액을 볼 수 있다.
async function createFinanceViewer(): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, {
    email: `finance-${randomUUID()}@example.test`,
    name: "통합테스트 경영관리",
    roleId: "role-ceo",
  });
  await upsertPermission(SYSTEM_VIEWER, { roleId: "role-ceo", menu: "projects", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: "role-ceo", menu: "projects.revenue", action: "write", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "project.value", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "revenue.issued_amount", visible: true });
  return { id: userId, roleId: "role-ceo" };
}

const krw = (amount: number) => ({ currency: "KRW" as const, amount, fxRate: 1 });

function requestRow(over: Partial<{ id: string; desiredIssueDate: string; amount: number; memo: string | null }> = {}) {
  return {
    id: over.id ?? randomUUID(),
    isNew: true as const,
    desiredIssueDate: over.desiredIssueDate ?? "2026-09-30",
    amount: krw(over.amount ?? 20_000_000),
    memo: over.memo ?? "선금",
  };
}

async function storedRequest(id: string) {
  const [row] = await db.select().from(revenueIssueRequests).where(eq(revenueIssueRequests.id, id));
  return row;
}

describe("발행 요청 저장 (saveIssueRequestRows — 원장 일괄 저장 안)", () => {
  it("새 줄은 requested + 요청자로 저장되고 같은 트랜잭션에 행동 기록이 남는다", async () => {
    const { project, pm } = await setupProject();
    const row = requestRow();

    const result = await saveProjectLedger(pm, project.id, { seenStatus: "bidding", issueRequests: [row] });

    const stored = await storedRequest(row.id);
    expect(stored).toMatchObject({ projectId: project.id, status: "requested", requestedBy: pm.id, amountAmountKrw: 20_000_000, memo: "선금", version: 1 });
    expect(result.issueRequests?.map((entry) => entry.id)).toEqual([row.id]);
    const logs = await db.select().from(actionLog).where(and(eq(actionLog.entity, "revenue_issue_request"), eq(actionLog.entityId, row.id)));
    expect(logs.map((entry) => entry.actionType)).toEqual(["document_create"]);
  });

  it("issued 줄을 고치는 요청은 거부한다", async () => {
    const { project, pm } = await setupProject();
    const row = requestRow();
    await saveProjectLedger(pm, project.id, { seenStatus: "bidding", issueRequests: [row] });
    const finance = await createFinanceViewer();
    const entryId = randomUUID();
    await saveProjectLedger(finance, project.id, {
      seenStatus: "bidding",
      revenue: { issuedEntries: [{ id: entryId, isNew: true, entryDate: "2026-09-30", amount: krw(20_000_000), fromIssueRequestId: row.id }] },
    });

    const attempt = saveProjectLedger(pm, project.id, {
      seenStatus: "bidding",
      issueRequests: [{ id: row.id, version: 2, desiredIssueDate: "2026-10-05", amount: krw(1), memo: "바꿈" }],
    });

    await expect(attempt).rejects.toBeInstanceOf(SaveRejectedError);
    const stored = await storedRequest(row.id);
    expect(stored).toMatchObject({ status: "issued", memo: "선금", amountAmountKrw: 20_000_000 });
  });

  it("version이 다르면 거부하고 값을 바꾸지 않는다", async () => {
    const { project, pm } = await setupProject();
    const row = requestRow();
    await saveProjectLedger(pm, project.id, { seenStatus: "bidding", issueRequests: [row] });

    const attempt = saveProjectLedger(pm, project.id, {
      seenStatus: "bidding",
      issueRequests: [{ id: row.id, version: 7, desiredIssueDate: "2026-10-05", amount: krw(5), memo: "낡은 화면" }],
    });

    await expect(attempt).rejects.toBeInstanceOf(SaveRejectedError);
    expect(await storedRequest(row.id)).toMatchObject({ memo: "선금", version: 1 });
  });

  it("completed · lost 프로젝트는 `{상태 낱말} · 발행 요청 잠김`으로 거부한다", async () => {
    for (const [status, word] of [
      ["completed", "완료"],
      ["lost", "미수주"],
    ] as const) {
      const { project, pm } = await setupProject();
      await db.update(projects).set({ status }).where(eq(projects.id, project.id));
      const row = requestRow();

      const attempt = saveProjectLedger(pm, project.id, { seenStatus: status, issueRequests: [row] });

      await expect(attempt).rejects.toBeInstanceOf(CompletedProjectError);
      await expect(attempt).rejects.toThrow(`${word} · 발행 요청 잠김`);
      expect(await storedRequest(row.id)).toBeUndefined();
    }
  });

  it("프로젝트 쓰기 권한이 없으면 트랜잭션을 열기 전에 거부한다", async () => {
    const { project } = await setupProject();
    const finance = await createFinanceViewer();
    const row = requestRow();

    const attempt = saveProjectLedger(finance, project.id, { seenStatus: "bidding", issueRequests: [row] });

    await expect(attempt).rejects.toBeInstanceOf(ForbiddenError);
    expect(await storedRequest(row.id)).toBeUndefined();
  });
});

describe("발행 줄 잇기 (linkIssueRequestToEntry — 원장이 saveRevenueInTx 뒤 같은 tx로)", () => {
  async function requested(pm: Viewer, projectId: string, over: Parameters<typeof requestRow>[0] = {}) {
    const row = requestRow(over);
    await saveProjectLedger(pm, projectId, { seenStatus: "bidding", issueRequests: [row] });
    return row;
  }
  const issuedEntry = (id: string, fromIssueRequestId: string, amount = 20_000_000) => ({
    id,
    isNew: true as const,
    entryDate: "2026-09-30",
    amount: krw(amount),
    note: "선금",
    fromIssueRequestId,
  });

  it("새 발행 줄에 fromIssueRequestId를 실으면 요청이 issued + 그 줄 id로 이어진다", async () => {
    const { project, pm } = await setupProject();
    const finance = await createFinanceViewer();
    const row = await requested(pm, project.id);
    const entryId = randomUUID();

    const result = await saveProjectLedger(finance, project.id, { seenStatus: "bidding", revenue: { issuedEntries: [issuedEntry(entryId, row.id)] } });

    expect(await storedRequest(row.id)).toMatchObject({ status: "issued", issuedEntryId: entryId, version: 2 });
    expect(result.revenue?.issuedEntries?.map((entry) => entry.id)).toEqual([entryId]);
    expect(result.issueRequests?.[0]).toMatchObject({ id: row.id, status: "issued", issuedEntryId: entryId, issuedAmountKrw: 20_000_000 });
  });

  it("금액이 달라도 막지 않는다(선금 · 잔금 조정)", async () => {
    const { project, pm } = await setupProject();
    const finance = await createFinanceViewer();
    const row = await requested(pm, project.id, { amount: 20_000_000 });
    const entryId = randomUUID();

    await saveProjectLedger(finance, project.id, { seenStatus: "bidding", revenue: { issuedEntries: [issuedEntry(entryId, row.id, 12_000_000)] } });

    expect(await storedRequest(row.id)).toMatchObject({ status: "issued", issuedEntryId: entryId, amountAmountKrw: 20_000_000 });
    const [entry] = await db.select().from(revenueEntries).where(eq(revenueEntries.id, entryId));
    expect(entry?.amountAmountKrw).toBe(12_000_000);
  });

  it("요청이 requested가 아니면 거부하고 같은 저장의 발행 줄 INSERT도 되돌린다", async () => {
    const { project, pm } = await setupProject();
    const finance = await createFinanceViewer();
    const row = await requested(pm, project.id);
    await saveProjectLedger(finance, project.id, { seenStatus: "bidding", revenue: { issuedEntries: [issuedEntry(randomUUID(), row.id)] } });
    const secondEntryId = randomUUID();

    const attempt = saveProjectLedger(finance, project.id, { seenStatus: "bidding", revenue: { issuedEntries: [issuedEntry(secondEntryId, row.id)] } });

    await expect(attempt).rejects.toBeInstanceOf(SaveRejectedError);
    const entries = await db.select().from(revenueEntries).where(eq(revenueEntries.projectId, project.id));
    expect(entries).toHaveLength(1);
    expect(entries.some((entry) => entry.id === secondEntryId)).toBe(false);
  });

  it("잇기가 실패하면(행동 기록 실패) 발행 줄은 0건이고 요청은 requested로 남는다", async () => {
    const { project, pm } = await setupProject();
    const finance = await createFinanceViewer();
    const row = await requested(pm, project.id);
    const entryId = randomUUID();

    const attempt = saveProjectLedger(
      finance,
      project.id,
      { seenStatus: "bidding", revenue: { issuedEntries: [issuedEntry(entryId, row.id)] } },
      {
        recordAction: async (viewer, entry, deps) => {
          if (entry.entity === "revenue_issue_request") throw new UserFacingError("행동 기록 실패(주입)");
          const { recordAction } = await import("@/domain/action-log/record");
          return recordAction(viewer, entry, deps);
        },
      },
    );

    await expect(attempt).rejects.toThrow("행동 기록 실패(주입)");
    expect(await db.select().from(revenueEntries).where(eq(revenueEntries.projectId, project.id))).toHaveLength(0);
    expect(await storedRequest(row.id)).toMatchObject({ status: "requested", issuedEntryId: null, version: 1 });
  });

  it("같은 일괄 저장을 다시 보내면(응답 유실 재전송) 쓰기 · 행동 기록 없이 통과한다", async () => {
    const { project, pm } = await setupProject();
    const finance = await createFinanceViewer();
    const row = await requested(pm, project.id);
    const entryId = randomUUID();
    const input = { seenStatus: "bidding" as const, revenue: { issuedEntries: [issuedEntry(entryId, row.id)] } };
    await saveProjectLedger(finance, project.id, input);
    const before = await db.select().from(actionLog).where(eq(actionLog.entityId, row.id));

    await saveProjectLedger(finance, project.id, input);

    expect(await storedRequest(row.id)).toMatchObject({ status: "issued", issuedEntryId: entryId, version: 2 });
    expect(await db.select().from(revenueEntries).where(eq(revenueEntries.projectId, project.id))).toHaveLength(1);
    expect(await db.select().from(actionLog).where(eq(actionLog.entityId, row.id))).toHaveLength(before.length);
  });

  it("매출 기록 권한이 없는 PM이 fromIssueRequestId 발행 줄을 직접 보내면 거부한다", async () => {
    const { project, pm } = await setupProject();
    const row = await requested(pm, project.id);

    const attempt = saveProjectLedger(pm, project.id, {
      seenStatus: "bidding",
      revenue: { issuedEntries: [issuedEntry(randomUUID(), row.id)] },
    });

    await expect(attempt).rejects.toBeInstanceOf(ForbiddenError);
    expect(await storedRequest(row.id)).toMatchObject({ status: "requested", issuedEntryId: null });
  });
});

describe("발행 요청 — 교차 프로젝트 방어 · 재전송 id (06-18 검토 I-1)", () => {
  async function requestOf(pm: Viewer, projectId: string) {
    const row = requestRow();
    await saveProjectLedger(pm, projectId, { seenStatus: "bidding", issueRequests: [row] });
    return row;
  }

  it("다른 프로젝트의 요청 id를 내 발행 줄 fromIssueRequestId로 이으면 거부하고 그 요청도 발행 줄도 그대로다", async () => {
    const a = await setupProject();
    const b = await setupProject();
    const finance = await createFinanceViewer();
    const row = await requestOf(a.pm, a.project.id);
    const entryId = randomUUID();

    const attempt = saveProjectLedger(finance, b.project.id, {
      seenStatus: "bidding",
      revenue: { issuedEntries: [{ id: entryId, isNew: true, entryDate: "2026-09-30", amount: krw(20_000_000), fromIssueRequestId: row.id }] },
    });

    await expect(attempt).rejects.toBeInstanceOf(SaveRejectedError);
    expect(await storedRequest(row.id)).toMatchObject({ projectId: a.project.id, status: "requested", issuedEntryId: null, version: 1 });
    expect(await db.select().from(revenueEntries).where(eq(revenueEntries.projectId, b.project.id))).toHaveLength(0);
  });

  it("다른 프로젝트의 요청 줄을 내 프로젝트 저장으로 고치면 거부하고 값 · version이 그대로다", async () => {
    const a = await setupProject();
    const b = await setupProject();
    const row = await requestOf(a.pm, a.project.id);

    const attempt = saveProjectLedger(b.pm, b.project.id, {
      seenStatus: "bidding",
      issueRequests: [{ id: row.id, version: 1, desiredIssueDate: "2026-10-05", amount: krw(1), memo: "남의 요청" }],
    });

    await expect(attempt).rejects.toBeInstanceOf(SaveRejectedError);
    expect(await storedRequest(row.id)).toMatchObject({ projectId: a.project.id, memo: "선금", amountAmountKrw: 20_000_000, version: 1 });
  });

  it("다른 프로젝트에 이미 있는 id로 같은 값의 새 줄을 보내도(재전송처럼 보여도) 거부하고 그 줄을 건드리지 않는다", async () => {
    const a = await setupProject();
    const b = await setupProject();
    const row = await requestOf(a.pm, a.project.id);

    const attempt = saveProjectLedger(b.pm, b.project.id, { seenStatus: "bidding", issueRequests: [row] });

    await expect(attempt).rejects.toBeInstanceOf(SaveRejectedError);
    expect(await storedRequest(row.id)).toMatchObject({ projectId: a.project.id, memo: "선금", version: 1 });
    expect((await db.select().from(revenueIssueRequests).where(eq(revenueIssueRequests.projectId, b.project.id)))).toHaveLength(0);
  });
});

describe("발행 요청 — 금액은 0원 초과만 (06-18 검토 I-2, 260907 invoice_requests_amount_positive)", () => {
  it.each([
    ["음수", -5_000_000],
    ["0", 0],
  ])("%s 금액은 칸 오류(금액)로 거부하고 아무것도 저장하지 않는다", async (_label, amount) => {
    const { project, pm } = await setupProject();
    const ok = requestRow();
    const bad = requestRow({ amount });

    const attempt = saveProjectLedger(pm, project.id, { seenStatus: "bidding", issueRequests: [ok, bad] });

    const rejection: unknown = await attempt.then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(rejection).toBeInstanceOf(SaveRejectedError);
    expect((rejection as SaveRejectedError).formatErrors).toEqual([expect.objectContaining({ rowId: bad.id, field: "amount", reason: "0원 초과 · 금액 입력" })]);
    expect(await storedRequest(ok.id)).toBeUndefined();
    expect(await storedRequest(bad.id)).toBeUndefined();
  });
});

describe("발행 요청 표 DTO (listProjectIssueRequests)", () => {
  it("부가세 · 합계는 희망 발행일 기준 발행 줄과 같은 계산(computeVat)이다", async () => {
    const { project, pm } = await setupProject();
    const row = requestRow({ amount: 22_000_000, desiredIssueDate: "2026-09-30" });
    await saveProjectLedger(pm, project.id, { seenStatus: "bidding", issueRequests: [row] });
    const finance = await createFinanceViewer();
    const entryId = randomUUID();
    await saveProjectLedger(finance, project.id, {
      seenStatus: "bidding",
      revenue: { issuedEntries: [{ id: entryId, isNew: true, entryDate: "2026-09-30", amount: krw(22_000_000) }] },
    });

    const [request] = await listProjectIssueRequests(pm, project.id);
    const revenue = await listRevenue(finance, project.id);
    const entry = revenue.issuedEntries?.find((item) => item.id === entryId);

    expect(request).toMatchObject({ id: row.id, amountKrw: 22_000_000, status: "requested", desiredIssueDate: "2026-09-30" });
    expect(request?.vatKrw).toBe(entry?.vatKrw);
    expect(request?.totalKrw).toBe(entry?.totalKrw);
  });
});

describe("발행 요청 표 DTO — 부가세 기준일 (06-18 검토 S-1)", () => {
  it("부가세는 요청마다 그 희망 발행일의 세율로 계산한다", async () => {
    const { project, pm } = await setupProject();
    const before = requestRow({ desiredIssueDate: "2026-09-30", amount: 10_000_000 });
    const after = requestRow({ desiredIssueDate: "2026-10-05", amount: 10_000_000 });
    await saveProjectLedger(pm, project.id, { seenStatus: "bidding", issueRequests: [before, after] });
    // 설정 표는 모든 테스트가 같이 쓰므로 건드리지 않고, 날짜로 세율이 갈리는 값을 주입한다.
    const getSettingValue: typeof realGetSettingValue = (def, opts) =>
      (def.key === TAX_VAT_RATE.key ? Promise.resolve(opts?.asOf && opts.asOf < new Date("2026-10-01") ? 0.1 : 0.2) : realGetSettingValue(def, opts)) as never;

    const dtos = await listProjectIssueRequests(pm, project.id, { getSettingValue });

    expect(dtos.find((dto) => dto.id === before.id)).toMatchObject({ vatKrw: 1_000_000, totalKrw: 11_000_000 });
    expect(dtos.find((dto) => dto.id === after.id)).toMatchObject({ vatKrw: 2_000_000, totalKrw: 12_000_000 });
  });
});

// 06-18 Task 2 — 권리 · 동시 잇기 · 발행액 노출(A-605) · 상태 잠김.
async function createRoleViewer(opts: { write: boolean; issuedAmount: boolean }): Promise<Viewer> {
  // 06.2: 노출 조합만 재는 계급이라 보는 범위는 전사(06.2 전 「보기 권한이면 전 행」) — 기본값 team이면 팀 없는 이 사람은 프로젝트를 못 본다.
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `요청 노출 계급-${randomUUID()}`, viewScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  if (opts.write) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "write", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "project.value", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "revenue.issued_amount", visible: opts.issuedAmount });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `req-view-${randomUUID()}@example.test`, name: "요청 노출", roleId: role.id });
  return { id: userId, roleId: role.id };
}

async function issuedRequest(projectId: string, pm: Viewer, finance: Viewer) {
  const row = requestRow({ amount: 30_000_000 });
  await saveProjectLedger(pm, projectId, { seenStatus: "bidding", issueRequests: [row] });
  await saveProjectLedger(finance, projectId, {
    seenStatus: "bidding",
    revenue: { issuedEntries: [{ id: randomUUID(), isNew: true, entryDate: "2026-09-30", amount: krw(30_000_000), fromIssueRequestId: row.id }] },
  });
  return row;
}

describe("발행 요청 — 동시 잇기 · 노출 · 상태 잠김 (06-18 Task 2)", () => {
  it("동시 잇기 — 장벽: A의 원장 저장이 프로젝트 행 잠금에서 멈춘 동안 B가 같은 요청을 이으면 A만 성공하고 B는 거부 + B의 발행 줄도 되돌아간다", async () => {
    const { project, pm } = await setupProject();
    const financeA = await createFinanceViewer();
    const financeB = await createFinanceViewer();
    const row = requestRow();
    await saveProjectLedger(pm, project.id, { seenStatus: "bidding", issueRequests: [row] });
    const entryA = randomUUID();
    const entryB = randomUUID();
    const linkInput = (entryId: string) => ({
      seenStatus: "bidding" as const,
      revenue: { issuedEntries: [{ id: entryId, isNew: true as const, entryDate: "2026-09-30", amount: krw(20_000_000), fromIssueRequestId: row.id }] },
    });

    const locked = deferred();
    const release = deferred();
    const first = saveProjectLedger(financeA, project.id, linkInput(entryA), {
      afterLock: async () => {
        locked.resolve();
        await release.promise;
      },
    });
    const reachedLock = await Promise.race([locked.promise.then(() => true), first.then(() => false, () => false)]);
    expect(reachedLock, "잠금 순서 조건을 만들지 못했다 — A가 프로젝트 행 잠금에 닿지 않음").toBe(true);
    const second = saveProjectLedger(financeB, project.id, linkInput(entryB));
    try {
      await waitForLockWaiter(pool);
    } catch (error) {
      release.resolve();
      await Promise.allSettled([first, second]);
      throw new Error(`잠금 순서 조건을 만들지 못했다 — B가 A의 잠금을 기다리지 않음(${(error as Error).message})`);
    }
    release.resolve();
    const [a, b] = await Promise.allSettled([first, second]);

    expect(a.status).toBe("fulfilled");
    expect(b.status).toBe("rejected");
    const rejection: unknown = b.status === "rejected" ? b.reason : null;
    expect(rejection).toBeInstanceOf(SaveRejectedError);
    expect((rejection as SaveRejectedError).formatErrors[0]?.reason).toBe("다른 사람이 먼저 이 요청을 이음 · 새로 고침");
    const entries = await db.select().from(revenueEntries).where(eq(revenueEntries.projectId, project.id));
    expect(entries.map((entry) => entry.id)).toEqual([entryA]);
    expect(await storedRequest(row.id)).toMatchObject({ status: "issued", issuedEntryId: entryA });
  });

  it("DTO — 발행액을 끈 읽기 계정에는 요청 금액 · 부가세 · 합계 · 상태 2행 발행액 키가 없다", async () => {
    const { project, pm } = await setupProject();
    const finance = await createFinanceViewer();
    await issuedRequest(project.id, pm, finance);
    const reader = await createRoleViewer({ write: false, issuedAmount: false });

    const [dto] = await listProjectIssueRequests(reader, project.id);

    expect(dto).toBeDefined();
    expect(Object.keys(dto ?? {})).toEqual(expect.arrayContaining(["id", "desiredIssueDate", "status", "issuedEntryDate"]));
    for (const key of ["amountKrw", "vatKrw", "totalKrw", "issuedAmountKrw"]) expect(Object.keys(dto ?? {})).not.toContain(key);
  });

  it("DTO — 프로젝트 쓰기 PM은 발행액을 꺼 둬도 요청 금액을 보고, 발행액은 정보 항목대로 빠진다", async () => {
    const { project, pm } = await setupProject();
    const finance = await createFinanceViewer();
    await issuedRequest(project.id, pm, finance);
    const writer = await createRoleViewer({ write: true, issuedAmount: false });

    const [dto] = await listProjectIssueRequests(writer, project.id);

    expect(dto).toMatchObject({ amountKrw: 30_000_000 });
    expect(Object.keys(dto ?? {})).toEqual(expect.arrayContaining(["vatKrw", "totalKrw"]));
    expect(Object.keys(dto ?? {})).not.toContain("issuedAmountKrw");
  });

  it("DTO — 발행액을 볼 수 있는 읽기 계정은 금액과 상태 2행 발행액을 본다", async () => {
    const { project, pm } = await setupProject();
    const finance = await createFinanceViewer();
    await issuedRequest(project.id, pm, finance);
    const reader = await createRoleViewer({ write: false, issuedAmount: true });

    const [dto] = await listProjectIssueRequests(reader, project.id);

    expect(dto).toMatchObject({ amountKrw: 30_000_000, issuedAmountKrw: 30_000_000 });
  });

  it("settling 프로젝트는 PM 요청을 허용한다", async () => {
    const { project, pm } = await setupProject();
    await db.update(projects).set({ status: "settling" }).where(eq(projects.id, project.id));
    const row = requestRow();

    await saveProjectLedger(pm, project.id, { seenStatus: "settling", issueRequests: [row] });

    expect(await storedRequest(row.id)).toMatchObject({ status: "requested" });
  });

  it("completed 프로젝트의 신청됨 요청을 매출 기록 권한자가 이으면 기존 발행 줄 쓰기 판정 그대로 통과한다(이 플랜은 막지 않는다 — U-4)", async () => {
    const { project, pm } = await setupProject();
    const finance = await createFinanceViewer();
    const row = requestRow();
    await saveProjectLedger(pm, project.id, { seenStatus: "bidding", issueRequests: [row] });
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, project.id));
    const entryId = randomUUID();

    await saveProjectLedger(finance, project.id, {
      seenStatus: "completed",
      revenue: { issuedEntries: [{ id: entryId, isNew: true, entryDate: "2026-09-30", amount: krw(20_000_000), fromIssueRequestId: row.id }] },
    });

    expect(await storedRequest(row.id)).toMatchObject({ status: "issued", issuedEntryId: entryId });
  });
});

// 06-21(O-12 · r4 F-F3) — 취소는 원장 일괄 저장의 한 행(`{ id, version, cancel: true }`)으로만 간다. 별도 액션 · 트랜잭션 없음.
const cancelRow = (id: string, version: number) => ({ id, version, cancel: true as const });

async function cancelLogs(id: string) {
  return db
    .select()
    .from(actionLog)
    .where(and(eq(actionLog.entity, "revenue_issue_request"), eq(actionLog.entityId, id), eq(actionLog.actionType, "status_change")));
}

async function rejectionOf(attempt: Promise<unknown>): Promise<unknown> {
  return attempt.then(
    () => null,
    (caught: unknown) => caught,
  );
}

describe("발행 요청 취소 (saveIssueRequestRows 취소 갈래 — 06-21)", () => {
  it("정상: 신청됨 줄을 취소하면 cancelled + 취소한 사람 · 시각이 남고 줄은 지워지지 않으며 같은 tx에 status_change 기록", async () => {
    const { project, pm } = await setupProject();
    const row = requestRow();
    await saveProjectLedger(pm, project.id, { seenStatus: "bidding", issueRequests: [row] });

    const result = await saveProjectLedger(pm, project.id, { seenStatus: "bidding", issueRequests: [cancelRow(row.id, 1)] });

    const stored = await storedRequest(row.id);
    expect(stored).toMatchObject({ status: "cancelled", cancelledBy: pm.id, version: 2, memo: "선금", amountAmountKrw: 20_000_000 });
    expect(stored?.cancelledAt).toBeInstanceOf(Date);
    expect(result.issueRequests?.find((dto) => dto.id === row.id)).toMatchObject({ status: "cancelled" });
    const logs = await cancelLogs(row.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.detail).toMatchObject({ projectId: project.id, from: "requested", to: "cancelled" });
  });

  it("권한: 프로젝트 쓰기 권한이 없으면 트랜잭션을 열기 전에 거부하고 요청은 그대로다", async () => {
    const { project, pm } = await setupProject();
    const row = requestRow();
    await saveProjectLedger(pm, project.id, { seenStatus: "bidding", issueRequests: [row] });
    const finance = await createFinanceViewer();

    const attempt = saveProjectLedger(finance, project.id, { seenStatus: "bidding", issueRequests: [cancelRow(row.id, 1)] });

    await expect(attempt).rejects.toBeInstanceOf(ForbiddenError);
    expect(await storedRequest(row.id)).toMatchObject({ status: "requested", version: 1, cancelledBy: null });
  });

  it("이어짐: 발행됨 요청 취소는 잠금 뒤 거부하고 요청 · 발행 줄이 그대로다", async () => {
    const { project, pm } = await setupProject();
    const finance = await createFinanceViewer();
    const row = await issuedRequest(project.id, pm, finance);

    const rejection = await rejectionOf(saveProjectLedger(pm, project.id, { seenStatus: "bidding", issueRequests: [cancelRow(row.id, 2)] }));

    expect(rejection).toBeInstanceOf(SaveRejectedError);
    expect((rejection as SaveRejectedError).formatErrors[0]).toMatchObject({ rowId: row.id, reason: "이미 발행됨 · 새로 고침" });
    expect(await storedRequest(row.id)).toMatchObject({ status: "issued", version: 2, cancelledBy: null });
    expect(await db.select().from(revenueEntries).where(eq(revenueEntries.projectId, project.id))).toHaveLength(1);
  });

  it("이미 취소된 요청을 다른 화면이 다시 취소하면(옛 version) 거부한다", async () => {
    const { project, pm } = await setupProject();
    const row = requestRow();
    await saveProjectLedger(pm, project.id, { seenStatus: "bidding", issueRequests: [row] });
    await saveProjectLedger(pm, project.id, { seenStatus: "bidding", issueRequests: [cancelRow(row.id, 1)] });

    const rejection = await rejectionOf(saveProjectLedger(pm, project.id, { seenStatus: "bidding", issueRequests: [cancelRow(row.id, 5)] }));

    expect(rejection).toBeInstanceOf(SaveRejectedError);
    expect((rejection as SaveRejectedError).formatErrors[0]?.reason).toBe("취소된 요청 · 새로 고침");
    expect(await cancelLogs(row.id)).toHaveLength(1);
  });

  it("같은 취소를 다시 보내면(응답 유실 재전송) 쓰기 · 기록 없이 통과한다", async () => {
    const { project, pm } = await setupProject();
    const row = requestRow();
    await saveProjectLedger(pm, project.id, { seenStatus: "bidding", issueRequests: [row] });
    await saveProjectLedger(pm, project.id, { seenStatus: "bidding", issueRequests: [cancelRow(row.id, 1)] });

    await saveProjectLedger(pm, project.id, { seenStatus: "bidding", issueRequests: [cancelRow(row.id, 1)] });

    expect(await storedRequest(row.id)).toMatchObject({ status: "cancelled", version: 2 });
    expect(await cancelLogs(row.id)).toHaveLength(1);
  });

  it("완료: completed 프로젝트의 취소는 06-18 자리(잠근 프로젝트 행)에서 CompletedProjectError로 막힌다", async () => {
    const { project, pm } = await setupProject();
    const row = requestRow();
    await saveProjectLedger(pm, project.id, { seenStatus: "bidding", issueRequests: [row] });
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, project.id));

    const attempt = saveProjectLedger(pm, project.id, { seenStatus: "completed", issueRequests: [cancelRow(row.id, 1)] });

    await expect(attempt).rejects.toBeInstanceOf(CompletedProjectError);
    expect(await storedRequest(row.id)).toMatchObject({ status: "requested", version: 1 });
  });

  it("version: 다른 사람이 먼저 고친 요청(version 불일치)의 취소는 거부하고 값을 바꾸지 않는다", async () => {
    const { project, pm } = await setupProject();
    const row = requestRow();
    await saveProjectLedger(pm, project.id, { seenStatus: "bidding", issueRequests: [row] });
    await saveProjectLedger(pm, project.id, {
      seenStatus: "bidding",
      issueRequests: [{ id: row.id, version: 1, desiredIssueDate: "2026-10-05", amount: krw(20_000_000), memo: "고침" }],
    });

    const rejection = await rejectionOf(saveProjectLedger(pm, project.id, { seenStatus: "bidding", issueRequests: [cancelRow(row.id, 1)] }));

    expect(rejection).toBeInstanceOf(SaveRejectedError);
    expect((rejection as SaveRejectedError).formatErrors[0]?.reason).toBe("다른 사람이 먼저 이 요청을 바꿈 · 새로 고침");
    expect(await storedRequest(row.id)).toMatchObject({ status: "requested", version: 2, memo: "고침" });
  });

  it("다른 프로젝트의 요청 id를 내 프로젝트 저장으로 취소하면 거부한다", async () => {
    const a = await setupProject();
    const b = await setupProject();
    const row = requestRow();
    await saveProjectLedger(a.pm, a.project.id, { seenStatus: "bidding", issueRequests: [row] });

    const rejection = await rejectionOf(saveProjectLedger(b.pm, b.project.id, { seenStatus: "bidding", issueRequests: [cancelRow(row.id, 1)] }));

    expect(rejection).toBeInstanceOf(SaveRejectedError);
    expect(await storedRequest(row.id)).toMatchObject({ status: "requested", version: 1 });
  });

  it("같은 tx 기록: status_change 기록이 실패하면 취소도 되돌아간다", async () => {
    const { project, pm } = await setupProject();
    const row = requestRow();
    await saveProjectLedger(pm, project.id, { seenStatus: "bidding", issueRequests: [row] });

    const attempt = saveProjectLedger(
      pm,
      project.id,
      { seenStatus: "bidding", issueRequests: [cancelRow(row.id, 1)] },
      {
        recordAction: async (viewer, entry, deps) => {
          if (entry.actionType === "status_change" && entry.entity === "revenue_issue_request") throw new UserFacingError("행동 기록 실패(주입)");
          const { recordAction } = await import("@/domain/action-log/record");
          return recordAction(viewer, entry, deps);
        },
      },
    );

    await expect(attempt).rejects.toThrow("행동 기록 실패(주입)");
    expect(await storedRequest(row.id)).toMatchObject({ status: "requested", version: 1, cancelledAt: null });
  });
});

// [E-26] 취소 ∥ 잇기 — 원장 `afterLock` 장벽으로 쥔 쪽을 프로젝트 행 잠금에서 멈추고, 반대 저장이 그 잠금을 기다리는 것을 확인한 뒤 푼다.
// 두 원장 저장은 프로젝트 행에서 먼저 줄을 서므로 이 테스트가 지키는 것은 「요청 행 잠금 뒤 issueRequestTransition 판정」이다.
async function raceLedgerSaves(holder: () => Promise<unknown>, contender: () => Promise<unknown>, holderBarrier: { locked: Deferred<void>; release: Deferred<void> }) {
  const first = holder();
  const reachedLock = await Promise.race([holderBarrier.locked.promise.then(() => true), first.then(() => false, () => false)]);
  expect(reachedLock, "잠금 순서 조건을 만들지 못했다 — 쥔 쪽이 프로젝트 행 잠금에 닿지 않음").toBe(true);
  const second = contender();
  try {
    await waitForLockWaiter(pool);
  } catch (error) {
    holderBarrier.release.resolve();
    await Promise.allSettled([first, second]);
    throw new Error(`잠금 순서 조건을 만들지 못했다 — 뒤 저장이 쥔 쪽 잠금을 기다리지 않음(${(error as Error).message})`);
  }
  holderBarrier.release.resolve();
  return Promise.allSettled([first, second]);
}

describe("발행 요청 — 취소 ∥ 잇기 (E-26 장벽)", () => {
  async function prepared() {
    const { project, pm } = await setupProject();
    const finance = await createFinanceViewer();
    const row = requestRow();
    await saveProjectLedger(pm, project.id, { seenStatus: "bidding", issueRequests: [row] });
    const entryId = randomUUID();
    const linkInput = {
      seenStatus: "bidding" as const,
      revenue: { issuedEntries: [{ id: entryId, isNew: true as const, entryDate: "2026-09-30", amount: krw(20_000_000), fromIssueRequestId: row.id }] },
    };
    const cancelInput = { seenStatus: "bidding" as const, issueRequests: [cancelRow(row.id, 1)] };
    const barrier = { locked: deferred(), release: deferred() };
    const afterLock = async () => {
      barrier.locked.resolve();
      await barrier.release.promise;
    };
    return { project, pm, finance, row, entryId, linkInput, cancelInput, barrier, afterLock };
  }

  it("취소 ∥ 잇기 — 취소 먼저 잠금: 취소만 성공하고 잇기는 거부 + 그 발행 줄 INSERT도 되돌아간다", async () => {
    const { project, pm, finance, row, linkInput, cancelInput, barrier, afterLock } = await prepared();

    const [cancel, link] = await raceLedgerSaves(
      () => saveProjectLedger(pm, project.id, cancelInput, { afterLock }),
      () => saveProjectLedger(finance, project.id, linkInput),
      barrier,
    );

    expect([cancel, link].filter((settled) => settled.status === "fulfilled")).toHaveLength(1);
    expect(cancel.status).toBe("fulfilled");
    const rejection: unknown = link.status === "rejected" ? link.reason : null;
    expect(rejection).toBeInstanceOf(UserFacingError);
    expect((rejection as SaveRejectedError).formatErrors?.[0]?.reason).toBe("취소된 요청 · 새로 고침");
    expect(await storedRequest(row.id)).toMatchObject({ status: "cancelled", issuedEntryId: null });
    expect(await db.select().from(revenueEntries).where(eq(revenueEntries.projectId, project.id))).toHaveLength(0);
  });

  it("취소 ∥ 잇기 — 잇기 먼저 잠금: 잇기만 성공하고 취소는 거부, 요청은 발행됨 · 발행 줄 1건", async () => {
    const { project, pm, finance, row, entryId, linkInput, cancelInput, barrier, afterLock } = await prepared();

    const [link, cancel] = await raceLedgerSaves(
      () => saveProjectLedger(finance, project.id, linkInput, { afterLock }),
      () => saveProjectLedger(pm, project.id, cancelInput),
      barrier,
    );

    expect([link, cancel].filter((settled) => settled.status === "fulfilled")).toHaveLength(1);
    expect(link.status).toBe("fulfilled");
    const rejection: unknown = cancel.status === "rejected" ? cancel.reason : null;
    expect(rejection).toBeInstanceOf(SaveRejectedError);
    expect((rejection as SaveRejectedError).formatErrors[0]?.reason).toBe("이미 발행됨 · 새로 고침");
    expect(await storedRequest(row.id)).toMatchObject({ status: "issued", issuedEntryId: entryId, cancelledBy: null });
    expect(await db.select().from(revenueEntries).where(eq(revenueEntries.projectId, project.id))).toHaveLength(1);
  });
});

// 06-21 Task 2 — S17 발행 요청 목록(listIssueRequests). 통합 DB는 모든 테스트가 같이 쓰므로 보는 범위 own 계급의 사람을 PM으로 둔
// 프로젝트를 만들어 그 사람의 목록에는 그 프로젝트의 요청만 서게 한다.
async function createBoardViewer(opts: { revenueView: boolean; issuedAmount: boolean }): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `발행 요청 목록-${randomUUID()}`, viewScope: "own" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  if (opts.revenueView) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects.revenue", action: "view", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "project.value", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "revenue.issued_amount", visible: opts.issuedAmount });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `board-${randomUUID()}@example.test`, name: "목록 보는 사람", roleId: role.id });
  return { id: userId, roleId: role.id };
}

async function boardProject(owner: Viewer) {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}`, normalizedName: `거래처-${randomUUID()}` });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  return createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId: owner.id, name: `목록 프로젝트-${randomUUID()}` });
}

async function seedBoardRequest(projectId: string, requestedBy: string, over: { desiredIssueDate: string; amount?: number; memo?: string | null }) {
  const id = randomUUID();
  await insertIssueRequest(
    SYSTEM_VIEWER,
    { id, projectId, requestedBy, desiredIssueDate: over.desiredIssueDate, amountCurrency: "KRW", amountForeignAmount: null, amountFxRate: "1.0000", amountAmountKrw: over.amount ?? 10_000_000, memo: over.memo ?? null },
    db,
  );
  return id;
}

const TODAY = "2026-10-13";

describe("발행 요청 목록 (listIssueRequests — S17, 06-21 Task 2)", () => {
  it("projects.revenue 보기가 없으면 거부한다", async () => {
    const viewer = await createBoardViewer({ revenueView: false, issuedAmount: true });

    await expect(listIssueRequests(viewer, { status: "requested" }, { today: TODAY })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("기본 필터는 신청됨이고 행은 희망일 그룹 순서(희망일 지남 → 이번 주 → 다음 주 → 그 뒤)로 선다", async () => {
    const viewer = await createBoardViewer({ revenueView: true, issuedAmount: true });
    const project = await boardProject(viewer);
    const later = await seedBoardRequest(project.id, viewer.id, { desiredIssueDate: "2026-11-30" });
    const next = await seedBoardRequest(project.id, viewer.id, { desiredIssueDate: "2026-10-20" });
    const overdue = await seedBoardRequest(project.id, viewer.id, { desiredIssueDate: "2026-10-01" });
    const thisWeek = await seedBoardRequest(project.id, viewer.id, { desiredIssueDate: "2026-10-15" });
    const cancelled = await seedBoardRequest(project.id, viewer.id, { desiredIssueDate: "2026-10-14" });
    await db.update(revenueIssueRequests).set({ status: "cancelled", cancelledBy: viewer.id, cancelledAt: new Date() }).where(eq(revenueIssueRequests.id, cancelled));

    const list = await listIssueRequests(viewer, {}, { today: TODAY });

    expect(list.rows.map((row) => row.id)).toEqual([overdue, thisWeek, next, later]);
    expect(list.rows.map((row) => row.group)).toEqual(["희망일 지남", "이번 주", "다음 주", "그 뒤"]);
    expect(list.rows[0]).toMatchObject({ projectId: project.id, projectNumber: project.number, projectName: project.name, requesterName: "목록 보는 사람", status: "requested" });
  });

  it("합계 줄은 필터 전체의 건수 · 공급가 합(sumKrw)이고, 전체 보기는 세 상태를 모두 싣는다", async () => {
    const viewer = await createBoardViewer({ revenueView: true, issuedAmount: true });
    const project = await boardProject(viewer);
    await seedBoardRequest(project.id, viewer.id, { desiredIssueDate: "2026-10-14", amount: 20_000_000 });
    await seedBoardRequest(project.id, viewer.id, { desiredIssueDate: "2026-10-16", amount: 24_000_000 });
    const cancelled = await seedBoardRequest(project.id, viewer.id, { desiredIssueDate: "2026-10-17", amount: 1_000_000 });
    await db.update(revenueIssueRequests).set({ status: "cancelled", cancelledBy: viewer.id, cancelledAt: new Date() }).where(eq(revenueIssueRequests.id, cancelled));

    const requested = await listIssueRequests(viewer, { status: "requested" }, { today: TODAY });
    const all = await listIssueRequests(viewer, { status: "all" }, { today: TODAY });

    expect(requested.totals).toEqual({ count: 2, amountKrw: 44_000_000 });
    expect(all.totals).toEqual({ count: 3, amountKrw: 45_000_000 });
    expect(all.rows.map((row) => row.status)).toEqual(["requested", "requested", "cancelled"]);
  });

  it("발행액(revenue.issued_amount)을 못 보는 읽기 계정에게는 행 · 합계 줄에 금액 키가 없다(A-605)", async () => {
    const viewer = await createBoardViewer({ revenueView: true, issuedAmount: false });
    const project = await boardProject(viewer);
    await seedBoardRequest(project.id, viewer.id, { desiredIssueDate: "2026-10-14", amount: 20_000_000 });

    const list = await listIssueRequests(viewer, {}, { today: TODAY });

    expect(list.rows).toHaveLength(1);
    for (const key of ["amountKrw", "vatKrw", "totalKrw", "issuedAmountKrw"]) expect(Object.keys(list.rows[0] ?? {})).not.toContain(key);
    expect(list.totals).toEqual({ count: 1 });
  });

  it("51건이면 50건씩 두 페이지다", async () => {
    const viewer = await createBoardViewer({ revenueView: true, issuedAmount: true });
    const project = await boardProject(viewer);
    for (let index = 0; index < 51; index++) await seedBoardRequest(project.id, viewer.id, { desiredIssueDate: `2026-11-${String((index % 28) + 1).padStart(2, "0")}`, amount: 1_000 });

    const first = await listIssueRequests(viewer, {}, { today: TODAY });
    const second = await listIssueRequests(viewer, { page: "2" }, { today: TODAY });

    expect(first.rows).toHaveLength(50);
    expect(first.page).toEqual({ page: 1, pageCount: 2, pageSize: 50, total: 51 });
    expect(second.rows).toHaveLength(1);
    expect(second.page.page).toBe(2);
    expect(new Set([...first.rows, ...second.rows].map((row) => row.id)).size).toBe(51);
    expect(first.totals.count).toBe(51);
  });

  it("보는 범위 밖 프로젝트의 요청은 서지 않는다", async () => {
    const viewer = await createBoardViewer({ revenueView: true, issuedAmount: true });
    const other = await createBoardViewer({ revenueView: true, issuedAmount: true });
    const mine = await boardProject(viewer);
    const theirs = await boardProject(other);
    const own = await seedBoardRequest(mine.id, viewer.id, { desiredIssueDate: "2026-10-14" });
    await seedBoardRequest(theirs.id, other.id, { desiredIssueDate: "2026-10-14" });

    const list = await listIssueRequests(viewer, {}, { today: TODAY });

    expect(list.rows.map((row) => row.id)).toEqual([own]);
  });
});

describe("열린 발행 요청 요약 (summarizeOpenIssueRequests — SP-4 링크 · 06-23, 06-21 Task 3)", () => {
  it("projects.revenue 보기가 없으면 null이다(링크 없음)", async () => {
    const viewer = await createBoardViewer({ revenueView: false, issuedAmount: true });

    expect(await summarizeOpenIssueRequests(viewer)).toBeNull();
  });

  it("신청됨 0건이면 { count: 0 }이다(발행됨 · 취소는 세지 않는다)", async () => {
    const viewer = await createBoardViewer({ revenueView: true, issuedAmount: true });
    const project = await boardProject(viewer);
    const cancelled = await seedBoardRequest(project.id, viewer.id, { desiredIssueDate: "2026-09-30" });
    await db.update(revenueIssueRequests).set({ status: "cancelled", cancelledAt: new Date(), cancelledBy: viewer.id }).where(eq(revenueIssueRequests.id, cancelled));

    expect(await summarizeOpenIssueRequests(viewer)).toEqual({ count: 0 });
  });

  it("신청됨 2건이면 건수 · 가장 이른 희망 발행일 · 공급가 합이다", async () => {
    const viewer = await createBoardViewer({ revenueView: true, issuedAmount: true });
    const project = await boardProject(viewer);
    await seedBoardRequest(project.id, viewer.id, { desiredIssueDate: "2026-10-02", amount: 3_000_000 });
    await seedBoardRequest(project.id, viewer.id, { desiredIssueDate: "2026-09-30", amount: 2_000_000 });

    expect(await summarizeOpenIssueRequests(viewer)).toEqual({ count: 2, earliestDesiredDate: "2026-09-30", supplyKrw: 5_000_000 });
  });

  it("발행액을 볼 수 없으면 공급가 키가 없다(A-605)", async () => {
    const viewer = await createBoardViewer({ revenueView: true, issuedAmount: false });
    const project = await boardProject(viewer);
    await seedBoardRequest(project.id, viewer.id, { desiredIssueDate: "2026-10-02", amount: 3_000_000 });
    await seedBoardRequest(project.id, viewer.id, { desiredIssueDate: "2026-09-30", amount: 2_000_000 });

    const summary = await summarizeOpenIssueRequests(viewer);

    expect(summary).toEqual({ count: 2, earliestDesiredDate: "2026-09-30" });
    expect(summary).not.toHaveProperty("supplyKrw");
  });
});
