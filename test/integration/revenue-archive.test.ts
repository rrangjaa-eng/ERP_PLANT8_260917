import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { actionLog, projects, revenueEntries, revenueIssueRequests, teams } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createProject } from "@/domain/projects";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { listRevenue, saveRevenue } from "@/domain/revenue";
import { archiveRevenueEntry, undoRevenueArchive, REVENUE_ARCHIVE_LOG, REVENUE_RESTORE_LOG } from "@/domain/revenue/archive";
import { SaveRejectedError } from "@/domain/quotes/lines";
import { log } from "@/lib/log";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { deferred, waitForLockWaiter } from "./lock-race";
import { grantFundKeys, makeFundPerson, makeFundRole } from "./fixtures/fund-scope";

// 07.6-01 매출 줄 지우기 · 되돌리기(D-7601 · D-7602 · D-7604 · D-7605 · D-7606 · D-7607 · D-7612).
//
// 읽는 곳 전수 표(D-7606 — 07.6-01-PLAN.md 「읽는 곳 전수 표」, 실행 시점 grep으로 다시 잼):
//   R1  repositories/revenue-entries.ts listRevenueEntriesByProject → listRevenue 줄 · 합계 · 잔액 · 로그 순번 — 07.6에서 보관 거름 + 끝 정렬(createdAt · id)
//   R2  listCollectionRows(수금 지연) — 이미 거름
//   R3  listCollectionCandidateProjects(수금 지연 알림 후보) — 이미 거름
//   R4  findRevenueEntryById — 그대로(호출자가 「보관됨」과 「없음」을 가른다)
//   R5  findRevenueEntriesByIds — 그대로(이전 값 묶음)
//   R6  updateRevenueEntryIfVersionMatches — 07.6에서 WHERE 보관 거름 + domain 분기(`줄을 찾을 수 없음 · 새로 고침`)
//   R7  lockRevenueEntryForUpdate — 그대로(계산서 owner closed)
//   R8  listLiveIssueEntryIds(계산서 목록) — 이미 거름
//   R9  repositories/projects.ts issuedSumsLateral(목록 발행 합계) — 이미 거름
//   R10 repositories/pre-settle-check.ts listIssuedAmountsKrw(정산 전 점검) — 이미 거름
//   R11 repositories/revenue-issue-requests.ts leftJoin — 해당 없음(발행 요청이 이어진 줄은 지울 수 없다 — Q1)
//   R12 repositories/business-records.ts 운영 기록 존재 판정 — 일부러 거르지 않는다: 지운 줄도 운영 기록이다(리저브 probe와 같은 취급)
//   R13 scripts/demo-data.ts — 해당 없음(스크립트)
//   R14 repositories/projects.ts countProjectMoneyAttachments(07.2-17 — 프로젝트 삭제 막기) — 이미 거름(보관 안 된 매출 줄만 센다)
// 로그는 늘 `detail->>'entryId'`로 센다 — entityId가 프로젝트 id라 줄 id로 세면 공허한 통과(eng r1 B-P1-1 덧).

const krw = (amount: number) => ({ currency: "KRW" as const, amount, fxRate: 1 });

async function financeRole(): Promise<string> {
  const roleId = await makeFundRole("company");
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "projects", action: "view", allowed: true });
  await grantFundKeys(roleId, ["projects.revenue"], "write");
  for (const infoItem of ["project.value", "revenue.issued_amount", "revenue.paid_amount"]) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem, visible: true });
  }
  return roleId;
}

// 자금 본부 밖 사람 — 회사 전체 계급은 자금 게이트 면제(domain/permissions/can.ts)라 팀 범위 계급에 같은 키를 켠다.
async function outsiderPerson(): Promise<Viewer> {
  const roleId = await makeFundRole("team");
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "projects", action: "view", allowed: true });
  await grantFundKeys(roleId, ["projects.revenue"], "write");
  return makeFundPerson("기획 사람", roleId, "기획1팀");
}

async function financePerson(roleId?: string): Promise<Viewer> {
  return makeFundPerson("경영관리", roleId ?? (await financeRole()), "경영관리팀");
}

async function setupProject() {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}`, normalizedName: `거래처-${randomUUID()}` });
  const { userId: pmUserId } = await createAccount(SYSTEM_VIEWER, { email: `pm-${randomUUID()}@example.test`, name: "통합테스트 PM", roleId: DEFAULT_ROLE_ID });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId, name: `프로젝트-${randomUUID()}` });
  return { project, pm: { id: pmUserId, roleId: DEFAULT_ROLE_ID } satisfies Viewer };
}

// 발행 2(09-01 1,000,000 · 09-05 500,000) · 입금 1(09-20 330,000).
async function seeded(finance: Viewer) {
  const { project, pm } = await setupProject();
  await saveRevenue(finance, project.id, {
    issuedEntries: [
      { entryDate: "2026-09-01", amount: krw(1_000_000), note: "1차" },
      { entryDate: "2026-09-05", amount: krw(500_000), note: "2차" },
    ],
    paidEntries: [{ entryDate: "2026-09-20", amount: krw(330_000), note: "입금" }],
  });
  const rows = await entriesOf(project.id);
  const first = rows.find((row) => row.entryDate === "2026-09-01")!;
  const second = rows.find((row) => row.entryDate === "2026-09-05")!;
  const payment = rows.find((row) => row.kind === "payment")!;
  return { project, pm, first, second, payment };
}

async function entriesOf(projectId: string) {
  return db.select().from(revenueEntries).where(eq(revenueEntries.projectId, projectId));
}

async function entry(id: string) {
  const [row] = await db.select().from(revenueEntries).where(eq(revenueEntries.id, id));
  if (!row) throw new Error("줄 없음");
  return row;
}

async function logsFor(entryId: string, actionType: string) {
  return db
    .select()
    .from(actionLog)
    .where(and(eq(actionLog.actionType, actionType), sql`${actionLog.detail}->>'entryId' = ${entryId}`));
}

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error("거부되지 않음");
}

const minutesAfter = (date: Date, minutes: number) => () => new Date(date.getTime() + minutes * 60_000);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("R1 · R6 — 보관된 매출 줄 읽기 · 쓰기 거름(D-7606)", () => {
  it("R1: 보관된 발행 줄은 listRevenue 줄 · 합계 · 잔액에서 빠진다", async () => {
    const finance = await financePerson();
    const { project, second } = await seeded(finance);
    await db.update(revenueEntries).set({ archivedAt: new Date(), archivedBy: finance.id }).where(eq(revenueEntries.id, second.id));

    const revenue = await listRevenue(finance, project.id);
    expect(revenue.issuedEntries?.map((row) => row.id)).toHaveLength(1);
    expect(revenue.issuedTotalKrw).toBe(1_000_000);
    expect(revenue.balanceKrw).toBe((revenue.paidGrossTotalKrw ?? 0) - 1_000_000);
  });

  it("R6: 보관된 줄을 그 version으로 일괄 저장하면 `줄을 찾을 수 없음 · 새로 고침` · 값 불변 · write.denied 0", async () => {
    const finance = await financePerson();
    const { project, second } = await seeded(finance);
    await db.update(revenueEntries).set({ archivedAt: new Date(), archivedBy: finance.id }).where(eq(revenueEntries.id, second.id));
    const warn = vi.spyOn(log, "warn");

    const error = await rejectionOf(
      saveRevenue(finance, project.id, { issuedEntries: [{ id: second.id, version: second.version, entryDate: second.entryDate, amount: krw(9_000), note: "2차" }] }),
    );
    expect(error).toBeInstanceOf(UserFacingError);
    expect(error.message).toBe("줄을 찾을 수 없음 · 새로 고침");
    expect((await entry(second.id)).amountAmountKrw).toBe(500_000);
    expect(warn.mock.calls.filter(([event]) => event === "write.denied")).toHaveLength(0);
  });
});

describe("archiveRevenueEntry · undoRevenueArchive (D-7601 · D-7602 · D-7605)", () => {
  it("지우기 — archived_at · archived_by · version +1 · 행 수 불변 · listRevenue에서 빠짐 · 상시 로그 1건(전후 줄)", async () => {
    const finance = await financePerson();
    const { project, second } = await seeded(finance);

    const result = await archiveRevenueEntry(finance, { projectId: project.id, entryId: second.id, version: second.version });

    const stored = await entry(second.id);
    expect(result).toEqual({ kind: "issue", version: stored.version });
    expect(stored.version).toBe(second.version + 1);
    expect(stored.archivedAt).not.toBeNull();
    expect(stored.archivedBy).toBe(finance.id);
    expect(await entriesOf(project.id)).toHaveLength(3);
    expect((await listRevenue(finance, project.id)).issuedEntries?.map((row) => row.id)).not.toContain(second.id);

    const logs = await logsFor(second.id, REVENUE_ARCHIVE_LOG);
    expect(REVENUE_ARCHIVE_LOG).toBe("revenue_entry_archive");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ entity: "revenue_entry", entityId: project.id });
    expect((logs[0]?.detail as { lineChanges: unknown[] }).lineChanges).toEqual([
      { id: second.id, kind: "issue", no: 2, name: null, changes: { entryDate: ["2026-09-05", null], amount: ["500,000원", null], note: ["2차", null] } },
    ]);
  });

  it("이미 보관된 줄을 직접 지우면 `줄을 찾을 수 없음 · 새로 고침` · 로그 0", async () => {
    const finance = await financePerson();
    const { project, second } = await seeded(finance);
    await db.update(revenueEntries).set({ archivedAt: new Date(), archivedBy: finance.id }).where(eq(revenueEntries.id, second.id));

    const error = await rejectionOf(archiveRevenueEntry(finance, { projectId: project.id, entryId: second.id, version: second.version }));
    expect(error.message).toBe("줄을 찾을 수 없음 · 새로 고침");
    expect(await logsFor(second.id, REVENUE_ARCHIVE_LOG)).toHaveLength(0);
  });

  it("되돌리기 — 같은 사람 9분 뒤 성공(version +1 · via undo 로그) · 재전송은 같은 version으로 멱등 · 11분 뒤 · 남은 거부", async () => {
    const finance = await financePerson();
    const other = await financePerson();
    const { project, second, payment } = await seeded(finance);
    const archived = await archiveRevenueEntry(finance, { projectId: project.id, entryId: second.id, version: second.version });
    const archivedAt = (await entry(second.id)).archivedAt!;

    const late = await rejectionOf(undoRevenueArchive(finance, { projectId: project.id, entryId: second.id, version: archived.version }, { now: minutesAfter(archivedAt, 11) }));
    expect(late.message).toBe("삭제 뒤 10분 지남 · 복원은 관리자");
    const stranger = await rejectionOf(undoRevenueArchive(other, { projectId: project.id, entryId: second.id, version: archived.version }));
    expect(stranger.message).toBe("줄을 찾을 수 없음 · 새로 고침");

    const restored = await undoRevenueArchive(finance, { projectId: project.id, entryId: second.id, version: archived.version }, { now: minutesAfter(archivedAt, 9) });
    const stored = await entry(second.id);
    expect(stored.archivedAt).toBeNull();
    expect(stored.archivedBy).toBeNull();
    expect(restored).toEqual({ kind: "issue", version: archived.version + 1 });
    expect(stored.version).toBe(archived.version + 1);

    const again = await undoRevenueArchive(finance, { projectId: project.id, entryId: second.id, version: archived.version });
    expect(again).toEqual({ kind: "issue", version: archived.version + 1 });

    const logs = await logsFor(second.id, REVENUE_RESTORE_LOG);
    expect(REVENUE_RESTORE_LOG).toBe("revenue_entry_restore");
    expect(logs).toHaveLength(1);
    const detail = logs[0]?.detail as { via: string; lineChanges: { no: number; changes: Record<string, unknown> }[] };
    expect(detail.via).toBe("undo");
    expect(detail.lineChanges[0]?.no).toBe(2);
    expect(detail.lineChanges[0]?.changes.amount).toEqual([null, "500,000원"]);

    // 입금 줄도 같은 길
    const paid = await archiveRevenueEntry(finance, { projectId: project.id, entryId: payment.id, version: payment.version });
    expect(paid.kind).toBe("payment");
  });

  it("낡은 결과 줄 되돌리기 — 보관함 복원(DB 흉내) 뒤 남이 고친 줄은 거부 · 아무도 안 고쳤으면 성공(로그 0) · 다시 지운 뒤 낡은 version 거부", async () => {
    const finance = await financePerson();
    const other = await financePerson();
    const { project, first, second } = await seeded(finance);
    const restoreLikeArchive = (id: string) =>
      db.update(revenueEntries).set({ archivedAt: null, archivedBy: null, version: sql`${revenueEntries.version} + 1` }).where(eq(revenueEntries.id, id));

    // 남이 고친 줄
    const a = await archiveRevenueEntry(finance, { projectId: project.id, entryId: second.id, version: second.version });
    await restoreLikeArchive(second.id);
    const mid = await entry(second.id);
    await saveRevenue(other, project.id, { issuedEntries: [{ id: second.id, version: mid.version, entryDate: mid.entryDate, amount: krw(777_000), note: mid.note }] });
    const changed = await rejectionOf(undoRevenueArchive(finance, { projectId: project.id, entryId: second.id, version: a.version }));
    expect(changed.message).toBe("다른 사람이 먼저 이 줄을 바꿈 · 새로 고침");
    expect((await entry(second.id)).amountAmountKrw).toBe(777_000);
    expect(await logsFor(second.id, REVENUE_RESTORE_LOG)).toHaveLength(0);

    // 아무도 안 고친 줄
    const b = await archiveRevenueEntry(finance, { projectId: project.id, entryId: first.id, version: first.version });
    await restoreLikeArchive(first.id);
    expect(await undoRevenueArchive(finance, { projectId: project.id, entryId: first.id, version: b.version })).toEqual({ kind: "issue", version: b.version + 1 });
    expect(await logsFor(first.id, REVENUE_RESTORE_LOG)).toHaveLength(0);

    // 복원 뒤 다시 지운 줄의 낡은 결과 줄
    await archiveRevenueEntry(finance, { projectId: project.id, entryId: first.id, version: b.version + 1 });
    const stale = await rejectionOf(undoRevenueArchive(finance, { projectId: project.id, entryId: first.id, version: b.version }));
    expect(stale.message).toBe("다른 사람이 먼저 이 줄을 바꿈 · 새로 고침");
    expect((await entry(first.id)).archivedAt).not.toBeNull();
  });
});

describe("동시 수정 · 잠금 순서(D-7607)", () => {
  it("낡은 version으로 지우면 `다른 사람이 먼저 이 줄을 바꿈 · 새로 고침` · DB · 로그 불변", async () => {
    const finance = await financePerson();
    const { project, second } = await seeded(finance);
    const error = await rejectionOf(archiveRevenueEntry(finance, { projectId: project.id, entryId: second.id, version: second.version - 1 }));
    expect(error.message).toBe("다른 사람이 먼저 이 줄을 바꿈 · 새로 고침");
    expect((await entry(second.id)).archivedAt).toBeNull();
    expect(await logsFor(second.id, REVENUE_ARCHIVE_LOG)).toHaveLength(0);
  });

  it("두 사람이 같은 줄을 동시에 지우면 하나만 보관 · 로그 1건", async () => {
    const roleId = await financeRole();
    const a = await financePerson(roleId);
    const b = await financePerson(roleId);
    const { project, second } = await seeded(a);
    const release = deferred();
    const first = archiveRevenueEntry(a, { projectId: project.id, entryId: second.id, version: second.version }, { afterLock: () => release.promise });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const contender = archiveRevenueEntry(b, { projectId: project.id, entryId: second.id, version: second.version });
    try {
      await waitForLockWaiter(pool);
    } finally {
      release.resolve();
    }
    const [ra, rb] = await Promise.allSettled([first, contender]);
    expect(ra.status).toBe("fulfilled");
    expect(rb.status).toBe("rejected");
    expect((await entry(second.id)).archivedBy).toBe(a.id);
    expect(await logsFor(second.id, REVENUE_ARCHIVE_LOG)).toHaveLength(1);
  });
});

describe("권한 · 범위(D-7604)", () => {
  it("지우기 — 담당 PM · 자금 본부 밖 키만 · 다른 프로젝트 줄 · 보관된 프로젝트 거부, 로그 0", async () => {
    const roleId = await financeRole();
    const finance = await financePerson(roleId);
    const outsider = await outsiderPerson();
    const { project, pm, second } = await seeded(finance);
    const { project: otherProject } = await seeded(finance);
    const input = { projectId: project.id, entryId: second.id, version: second.version };

    expect((await rejectionOf(archiveRevenueEntry(pm, input))).message).toBe("발행·입금 줄 삭제 권한 없음");
    expect(await rejectionOf(archiveRevenueEntry(outsider, input))).toBeInstanceOf(UserFacingError);
    expect((await rejectionOf(archiveRevenueEntry(finance, { ...input, projectId: otherProject.id }))).message).toBe("줄을 찾을 수 없음 · 새로 고침");
    await db.update(projects).set({ archivedAt: new Date(), archivedBy: SYSTEM_VIEWER.id }).where(eq(projects.id, project.id));
    expect((await rejectionOf(archiveRevenueEntry(finance, input))).message).toBe("존재하지 않는 프로젝트");
    expect((await entry(second.id)).archivedAt).toBeNull();
    expect(await logsFor(second.id, REVENUE_ARCHIVE_LOG)).toHaveLength(0);
  });

  it("되돌리기 — 담당 PM 거부", async () => {
    const finance = await financePerson();
    const { project, pm, second } = await seeded(finance);
    const a = await archiveRevenueEntry(finance, { projectId: project.id, entryId: second.id, version: second.version });
    expect((await rejectionOf(undoRevenueArchive(pm, { projectId: project.id, entryId: second.id, version: a.version }))).message).toBe("발행·입금 줄 삭제 권한 없음");
  });

  it("되돌리기 — 자금 본부 밖 키만 가진 사람 거부", async () => {
    const roleId = await financeRole();
    const finance = await financePerson(roleId);
    const outsider = await outsiderPerson();
    const { project, second } = await seeded(finance);
    const a = await archiveRevenueEntry(finance, { projectId: project.id, entryId: second.id, version: second.version });
    expect(await rejectionOf(undoRevenueArchive(outsider, { projectId: project.id, entryId: second.id, version: a.version }))).toBeInstanceOf(UserFacingError);
    expect((await entry(second.id)).archivedAt).not.toBeNull();
  });

  it("되돌리기 — 다른 프로젝트 id로 보내면 `줄을 찾을 수 없음 · 새로 고침`", async () => {
    const finance = await financePerson();
    const { project, second } = await seeded(finance);
    const { project: otherProject } = await seeded(finance);
    const a = await archiveRevenueEntry(finance, { projectId: project.id, entryId: second.id, version: second.version });
    expect((await rejectionOf(undoRevenueArchive(finance, { projectId: otherProject.id, entryId: second.id, version: a.version }))).message).toBe("줄을 찾을 수 없음 · 새로 고침");
  });

  it("되돌리기 — 보관된 프로젝트는 `존재하지 않는 프로젝트` · 로그 0", async () => {
    const finance = await financePerson();
    const { project, second } = await seeded(finance);
    const a = await archiveRevenueEntry(finance, { projectId: project.id, entryId: second.id, version: second.version });
    await db.update(projects).set({ archivedAt: new Date(), archivedBy: SYSTEM_VIEWER.id }).where(eq(projects.id, project.id));
    expect((await rejectionOf(undoRevenueArchive(finance, { projectId: project.id, entryId: second.id, version: a.version }))).message).toBe("존재하지 않는 프로젝트");
    expect(await logsFor(second.id, REVENUE_RESTORE_LOG)).toHaveLength(0);
  });
});

describe("완료 프로젝트 잠금(D-7612 — 사용자 카드 확정 11/4 22:24 KST 「막기」)", () => {
  it("완료 프로젝트 지우기 `완료 프로젝트 · 삭제 불가` · 정산 중은 허용 · 지운 뒤 완료면 되돌리기 `완료 프로젝트 · 복원 불가` · 일괄 저장은 그대로", async () => {
    const finance = await financePerson();
    const { project, first, second } = await seeded(finance);

    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, project.id));
    const blocked = await rejectionOf(archiveRevenueEntry(finance, { projectId: project.id, entryId: second.id, version: second.version }));
    expect(blocked.message).toBe("완료 프로젝트 · 삭제 불가");
    expect((await entry(second.id)).archivedAt).toBeNull();
    expect((await entry(second.id)).version).toBe(second.version);
    expect(await logsFor(second.id, REVENUE_ARCHIVE_LOG)).toHaveLength(0);

    // 일괄 저장 경로 잠금 추가 0(범위 밖 고정)
    await saveRevenue(finance, project.id, { issuedEntries: [{ id: first.id, version: first.version, entryDate: first.entryDate, amount: krw(1_200_000), note: first.note }] });
    expect((await entry(first.id)).amountAmountKrw).toBe(1_200_000);

    await db.update(projects).set({ status: "settling" }).where(eq(projects.id, project.id));
    const a = await archiveRevenueEntry(finance, { projectId: project.id, entryId: second.id, version: second.version });

    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, project.id));
    const undo = await rejectionOf(undoRevenueArchive(finance, { projectId: project.id, entryId: second.id, version: a.version }));
    expect(undo.message).toBe("완료 프로젝트 · 복원 불가");
    expect((await entry(second.id)).archivedAt).not.toBeNull();
    expect(await logsFor(second.id, REVENUE_RESTORE_LOG)).toHaveLength(0);
  });
});

describe("로그 순번(D-7606 · Pitfall 2 · eng r1 A-P3-7)", () => {
  it("첫 발행 줄을 지운 뒤 남은 줄을 고치면 저장 로그 no = 1", async () => {
    const finance = await financePerson();
    const { project, first, second } = await seeded(finance);
    await archiveRevenueEntry(finance, { projectId: project.id, entryId: first.id, version: first.version });
    await saveRevenue(finance, project.id, { issuedEntries: [{ id: second.id, version: second.version, entryDate: second.entryDate, amount: krw(600_000), note: second.note }] });
    const [last] = await db
      .select()
      .from(actionLog)
      .where(and(eq(actionLog.actionType, "document_update"), eq(actionLog.entity, "revenue_entry"), eq(actionLog.entityId, project.id)))
      .orderBy(sql`${actionLog.seq} desc`)
      .limit(1);
    expect((last?.detail as { lineChanges: { id: string; no: number }[] }).lineChanges).toMatchObject([{ id: second.id, no: 1 }]);
  });

  it("같은 날짜 줄 둘을 두 번 나눠 저장하면 저장 순서로 고정되고 둘째를 지우면 no = 2", async () => {
    const finance = await financePerson();
    const { project } = await setupProject();
    await saveRevenue(finance, project.id, { issuedEntries: [{ entryDate: "2026-09-10", amount: krw(100_000), note: "먼저" }] });
    await saveRevenue(finance, project.id, { issuedEntries: [{ entryDate: "2026-09-10", amount: krw(200_000), note: "나중" }] });
    const revenue = await listRevenue(finance, project.id);
    expect(revenue.issuedEntries?.map((row) => row.note)).toEqual(["먼저", "나중"]);
    const later = revenue.issuedEntries![1]!;
    await archiveRevenueEntry(finance, { projectId: project.id, entryId: later.id, version: later.version });
    const [logRow] = await logsFor(later.id, REVENUE_ARCHIVE_LOG);
    expect((logRow?.detail as { lineChanges: { no: number }[] }).lineChanges[0]?.no).toBe(2);
  });
});

describe("같은 발행 요청 이중 계상 서버 막이(design r1 G3 — 기존 동작 고정)", () => {
  async function requested(pm: Viewer, projectId: string) {
    const row = { id: randomUUID(), isNew: true as const, desiredIssueDate: "2026-09-30", amount: krw(20_000_000), memo: "선금" };
    await saveProjectLedger(pm, projectId, { seenStatus: "bidding", issueRequests: [row] });
    return row;
  }
  const issuedEntry = (fromIssueRequestId: string) => ({ id: randomUUID(), isNew: true as const, entryDate: "2026-09-30", amount: krw(20_000_000), note: "선금", fromIssueRequestId });

  it("한 저장에 같은 요청을 실은 새 발행 줄 둘 → 전부 거부 · 발행 줄 0 · 요청 requested", async () => {
    const finance = await financePerson();
    const { project, pm } = await setupProject();
    const row = await requested(pm, project.id);
    const error = await rejectionOf(
      saveProjectLedger(finance, project.id, { seenStatus: "bidding", revenue: { issuedEntries: [issuedEntry(row.id), issuedEntry(row.id)] } }),
    );
    expect(error).toBeInstanceOf(SaveRejectedError);
    expect(await entriesOf(project.id)).toHaveLength(0);
    const [request] = await db.select().from(revenueIssueRequests).where(eq(revenueIssueRequests.id, row.id));
    expect(request).toMatchObject({ status: "requested", issuedEntryId: null });
  });

  it("이미 이어진 요청을 실은 새 발행 줄 → 거부 · 발행 줄 수 불변", async () => {
    const finance = await financePerson();
    const { project, pm } = await setupProject();
    const row = await requested(pm, project.id);
    await saveProjectLedger(finance, project.id, { seenStatus: "bidding", revenue: { issuedEntries: [issuedEntry(row.id)] } });
    const error = await rejectionOf(saveProjectLedger(finance, project.id, { seenStatus: "bidding", revenue: { issuedEntries: [issuedEntry(row.id)] } }));
    expect(error).toBeInstanceOf(SaveRejectedError);
    expect(await entriesOf(project.id)).toHaveLength(1);
  });
});
