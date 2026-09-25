import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { actionLog, codeItems, projects, quoteLines } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { createProject, findProject } from "@/domain/projects";
import { getCurrentQuoteRevision } from "@/domain/quotes/lines";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { changeProjectStatus, listProjectStatusCatalog, StatusChangedError, statusChangedMessage } from "@/domain/projects/status";
import { applyAutoSettlement } from "@/domain/projects/auto-transition";
import { PeriodRejectedError, saveProjectLedger, type SaveProjectLedgerInput } from "@/domain/projects/ledger";
import type { ProjectStatus } from "@/domain/projects/status-transitions";
import { recordAction } from "@/domain/action-log/record";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { seedMasterData } from "@/domain/seed";
import { findPermission } from "@/repositories/permissions";
import { log } from "@/lib/log";
import { addDays, kstDayStart, kstToday } from "@/lib/kst-date";
import { gate } from "@/domain/rules/gate";
import { deferred, waitForLockWaiter } from "./lock-race";

// S1(04-22 리뷰): 견적 줄 게이트가 어느 행으로 판정했는지 보려고 gate를 통과형 스파이로 감싼다 —
// 판정 결과는 원본 그대로다. 견적 줄 로그는 커밋 뒤에 남아 seq로는 순서를 증명할 수 없다.
vi.mock("@/domain/rules/gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/rules/gate")>();
  return { ...actual, gate: vi.fn(actual.gate) };
});

// 04-22(D-80 · D-82 · CEO A-01·A-02·A-13·A-14·A-16·A-22·OV-5 · ENG-D6 · DR-6 · 엔지 리뷰 A §1 P1 ·
// 사용자 결정 2026-09-25 「기간만 수정」) — 기간 칸이 합류한 합성 저장을 실제 DB에서 본다. 로그 단언은
// 그 프로젝트의 줄만 센다. 날짜는 오늘(KST)에서 더해 만들고, 자정·경합은 now를 주입한다.

const TODAY = kstToday(new Date());
const FAR = addDays(TODAY, 30); // 실제 시계의 자동 정산이 끼어들지 않는 미래 종료일.
const AFTER_FAR = () => new Date(kstDayStart(addDays(FAR, 1)).getTime() + 1000); // FAR 다음 날 00:00:01 KST

async function makeTeam(): Promise<string> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `기간본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `기간팀-${randomUUID().slice(0, 8)}` });
  return team.id;
}

async function makeViewer(roleId: string, teamId?: string, name = "기간 테스트 사람"): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `period-${randomUUID()}@example.test`, name, roleId });
  if (teamId) await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom: "2026-01-01" });
  return { id: userId, roleId };
}

type Setup = {
  projectId: string;
  revisionId: string;
  teamId: string;
  pm: Viewer;
  lead: Viewer;
  leadName: string;
  startDate: string | null;
  endDate: string | null;
};

async function setup(input: { status: ProjectStatus; startDate: string | null; endDate: string | null }): Promise<Setup> {
  const teamId = await makeTeam();
  const pm = await makeViewer(DEFAULT_ROLE_ID, teamId);
  const leadName = `팀장${randomUUID().slice(0, 6)}`;
  const lead = await makeViewer("role-team-lead", teamId, leadName);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}`, normalizedName: `거래처-${randomUUID()}` });
  const created = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId, pmUserId: pm.id, name: `기간-${randomUUID()}` });
  await db
    .update(projects)
    .set({ status: input.status, startDate: input.startDate, endDate: input.endDate })
    .where(eq(projects.id, created.id));
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, created.id);
  if (!revision) throw new Error("차수가 없습니다");
  return { projectId: created.id, revisionId: revision.id, teamId, pm, lead, leadName, startDate: input.startDate, endDate: input.endDate };
}

function period(s: Setup, next: { startDate?: string | null; endDate?: string | null }): NonNullable<SaveProjectLedgerInput["period"]> {
  return {
    startDate: next.startDate === undefined ? s.startDate : next.startDate,
    endDate: next.endDate === undefined ? s.endDate : next.endDate,
    baseline: { startDate: s.startDate, endDate: s.endDate },
  };
}

async function subcategoryValue(): Promise<string> {
  const [item] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
  if (!item) throw new Error("시드된 소분류가 없습니다");
  return item.value;
}

async function newLine(s: Setup, itemName: string): Promise<NonNullable<SaveProjectLedgerInput["quoteLines"]>> {
  return {
    revisionId: s.revisionId,
    rows: [
      {
        subcategory: await subcategoryValue(),
        itemName,
        quantity: 1,
        unitPrice: { currency: "KRW", amount: 100_000, fxRate: 1 },
        execution: { currency: "KRW", amount: 80_000, fxRate: 1 },
      },
    ],
  };
}

async function reload(projectId: string) {
  const [row] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!row) throw new Error("프로젝트가 없습니다");
  return row;
}

async function logs(projectId: string, actionType: string) {
  return db
    .select()
    .from(actionLog)
    .where(and(eq(actionLog.entity, "project"), eq(actionLog.entityId, projectId), eq(actionLog.actionType, actionType)))
    .orderBy(asc(actionLog.seq));
}

async function linesNamed(itemName: string) {
  return db.select().from(quoteLines).where(eq(quoteLines.itemName, itemName));
}

function deniedCalls(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.filter((call) => call[0] === "write.denied").map((call) => call[1] as Record<string, unknown>);
}

async function companyViewer(roleId: "role-sysadmin" | "role-division-head"): Promise<Viewer> {
  return makeViewer(roleId);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("기간 저장 — 행위자 · 권리 · 검증 (04-22 Task 2)", () => {
  it("(a) 팀장이 정산의 종료일을 오늘 이후로 늦추면 진행 + 사람 status_change 1줄 + document_update 1줄", async () => {
    const s = await setup({ status: "settling", startDate: addDays(TODAY, -10), endDate: addDays(TODAY, -1) });
    const newEnd = addDays(TODAY, 5);

    const result = await saveProjectLedger(s.lead, s.projectId, { seenStatus: "settling", period: period(s, { endDate: newEnd }) });

    expect(result.project).toEqual({ status: "in_progress", startDate: s.startDate, endDate: newEnd });
    const row = await reload(s.projectId);
    expect(row.status).toBe("in_progress");
    expect(row.endDate).toBe(newEnd);
    const statusLogs = await logs(s.projectId, "status_change");
    expect(statusLogs).toHaveLength(1);
    expect(statusLogs[0]?.actorId).toBe(s.lead.id);
    expect(statusLogs[0]?.detail).toEqual({
      from: "settling",
      to: "in_progress",
      trigger: "end_date_extended",
      endDate: { from: s.endDate, to: newEnd },
    });
    const updates = await logs(s.projectId, "document_update");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.actorId).toBe(s.lead.id);
    expect(updates[0]?.detail).toEqual({ endDate: { from: s.endDate, to: newEnd } });
  });

  it("(b) 진행의 담당 PM이 종료일을 어제로 앞당기면 「앞당기기는 팀장 {이름}」으로 거부 · DB 무변경 · write.denied 한 번", async () => {
    const s = await setup({ status: "in_progress", startDate: addDays(TODAY, -10), endDate: addDays(TODAY, 5) });
    const warn = vi.spyOn(log, "warn");

    const outcome = await saveProjectLedger(s.pm, s.projectId, {
      seenStatus: "in_progress",
      period: period(s, { endDate: addDays(TODAY, -1) }),
    }).catch((error: unknown) => error);

    expect(outcome).toBeInstanceOf(PeriodRejectedError);
    expect((outcome as PeriodRejectedError).errors).toEqual([
      { field: "end", reason: `종료일이 오늘보다 빠름 · 앞당기기는 팀장 ${s.leadName}` },
    ]);
    const row = await reload(s.projectId);
    expect(row.status).toBe("in_progress");
    expect(row.endDate).toBe(s.endDate);
    const denied = deniedCalls(warn);
    expect(denied).toHaveLength(1);
    expect(denied[0]?.rule).toBe("project.period-edit");
    expect(Object.keys(denied[0] ?? {}).some((key) => /date|amount/i.test(key))).toBe(false);
    expect(await logs(s.projectId, "document_update")).toHaveLength(0);
  });

  it("(b2) 진행의 담당 PM이 과거 시작일 프로젝트의 종료일을 비우면 거부되고 DB 무변경(A-02)", async () => {
    const s = await setup({ status: "in_progress", startDate: addDays(TODAY, -3), endDate: addDays(TODAY, 5) });

    await expect(
      saveProjectLedger(s.pm, s.projectId, { seenStatus: "in_progress", period: period(s, { endDate: null }) }),
    ).rejects.toBeInstanceOf(PeriodRejectedError);

    const row = await reload(s.projectId);
    expect(row.status).toBe("in_progress");
    expect(row.endDate).toBe(s.endDate);
  });

  it("(c) 팀장이 진행의 종료일을 어제로 앞당기면 같은 커밋에서 정산 + 시스템 로그 1줄 + 팀장의 document_update 1줄", async () => {
    const s = await setup({ status: "in_progress", startDate: addDays(TODAY, -10), endDate: addDays(TODAY, 5) });
    const yesterday = addDays(TODAY, -1);

    const result = await saveProjectLedger(s.lead, s.projectId, { seenStatus: "in_progress", period: period(s, { endDate: yesterday }) });

    expect(result.project.status).toBe("settling");
    expect((await reload(s.projectId)).status).toBe("settling");
    const statusLogs = await logs(s.projectId, "status_change");
    expect(statusLogs).toHaveLength(1);
    expect(statusLogs[0]?.actorId).toBeNull();
    expect(statusLogs[0]?.detail).toMatchObject({ from: "in_progress", to: "settling", trigger: "end_date_passed" });
    const updates = await logs(s.projectId, "document_update");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.actorId).toBe(s.lead.id);
  });

  it("(d) 진행 이후 종료일을 비우면(시작일 ≥ 오늘) 시작일로 저장된다", async () => {
    const s = await setup({ status: "in_progress", startDate: addDays(TODAY, 2), endDate: addDays(TODAY, 5) });

    await saveProjectLedger(s.pm, s.projectId, { seenStatus: "in_progress", period: period(s, { endDate: null }) });

    const row = await reload(s.projectId);
    expect(row.endDate).toBe(s.startDate);
    expect(row.status).toBe("in_progress");
  });

  it("진행 이후 시작일을 비우는 저장은 「진행부터는 시작일이 있어야 합니다」로 거부된다(D-82)", async () => {
    const s = await setup({ status: "in_progress", startDate: addDays(TODAY, 2), endDate: addDays(TODAY, 5) });

    const outcome = await saveProjectLedger(s.lead, s.projectId, {
      seenStatus: "in_progress",
      period: period(s, { startDate: null }),
    }).catch((error: unknown) => error);

    expect((outcome as PeriodRejectedError).errors).toEqual([
      { field: "start", reason: "진행부터는 시작일이 있어야 합니다 · 시작일을 적어 주세요" },
    ]);
  });

  it("달력에 없는 날짜(2026-02-30)는 칸 오류이고 DB 오류가 되지 않는다(A-22)", async () => {
    const s = await setup({ status: "bidding", startDate: null, endDate: null });

    const outcome = await saveProjectLedger(s.lead, s.projectId, {
      seenStatus: "bidding",
      period: period(s, { startDate: "2026-02-30" }),
    }).catch((error: unknown) => error);

    expect(outcome).toBeInstanceOf(PeriodRejectedError);
    expect((outcome as PeriodRejectedError).errors).toEqual([
      { field: "start", reason: "날짜 형식이 아닙니다 · 2026-09-18처럼 적어 주세요" },
    ]);
  });

  it("(e) 기간 오류와 견적 줄 변경이 같은 저장에 있으면 견적 줄도 저장되지 않는다", async () => {
    const s = await setup({ status: "bidding", startDate: addDays(TODAY, 5), endDate: addDays(TODAY, 10) });
    const admin = await companyViewer("role-sysadmin");
    const itemName = `기간 오류와 함께-${randomUUID()}`;

    await expect(
      saveProjectLedger(admin, s.projectId, {
        seenStatus: "bidding",
        period: period(s, { endDate: addDays(TODAY, 1) }),
        quoteLines: await newLine(s, itemName),
      }),
    ).rejects.toBeInstanceOf(PeriodRejectedError);

    expect(await linesNamed(itemName)).toHaveLength(0);
    expect((await reload(s.projectId)).endDate).toBe(s.endDate);
  });

  it("(f) 완료 프로젝트의 기간 저장은 누구든 거부", async () => {
    const s = await setup({ status: "completed", startDate: addDays(TODAY, -10), endDate: addDays(TODAY, -5) });
    const admin = await companyViewer("role-sysadmin");

    for (const viewer of [s.lead, s.pm, admin]) {
      const outcome = await saveProjectLedger(viewer, s.projectId, {
        seenStatus: "completed",
        period: period(s, { endDate: addDays(TODAY, 5) }),
      }).catch((error: unknown) => error);
      expect(outcome).toBeInstanceOf(PeriodRejectedError);
      expect(String(outcome)).toContain("기간 바꾸기 권한 없음");
    }
    expect((await reload(s.projectId)).endDate).toBe(s.endDate);
  });

  it("(h) 다른 팀 팀장(업무 범위 team)의 정산 연장은 「기간 바꾸기 권한 없음」 · 본부 책임자(전사)는 통과", async () => {
    const s = await setup({ status: "settling", startDate: addDays(TODAY, -10), endDate: addDays(TODAY, -1) });
    const otherLead = await makeViewer("role-team-lead", await makeTeam());

    const denied = await saveProjectLedger(otherLead, s.projectId, {
      seenStatus: "settling",
      period: period(s, { endDate: addDays(TODAY, 5) }),
    }).catch((error: unknown) => error);
    expect(denied).toBeInstanceOf(PeriodRejectedError);
    expect(String(denied)).toContain("기간 바꾸기 권한 없음");
    expect((await reload(s.projectId)).status).toBe("settling");

    const divisionHead = await companyViewer("role-division-head");
    await saveProjectLedger(divisionHead, s.projectId, { seenStatus: "settling", period: period(s, { endDate: addDays(TODAY, 5) }) });
    expect((await reload(s.projectId)).status).toBe("in_progress");
  });

  it("사용자 결정 「기간만 수정」 — 시드 권한의 팀장은 기간만 저장하고, 같은 저장에 견적 줄이 있으면 전부 거부된다", async () => {
    const s = await setup({ status: "in_progress", startDate: addDays(TODAY, -3), endDate: addDays(TODAY, 5) });
    const itemName = `팀장 견적 줄-${randomUUID()}`;
    const newEnd = addDays(TODAY, 9);

    await expect(
      saveProjectLedger(s.lead, s.projectId, {
        seenStatus: "in_progress",
        period: period(s, { endDate: newEnd }),
        quoteLines: await newLine(s, itemName),
      }),
    ).rejects.toThrow("견적 줄 저장 권한이 없습니다.");
    expect(await linesNamed(itemName)).toHaveLength(0);
    expect((await reload(s.projectId)).endDate).toBe(s.endDate);
    expect(await logs(s.projectId, "document_update")).toHaveLength(0);

    await saveProjectLedger(s.lead, s.projectId, { seenStatus: "in_progress", period: period(s, { endDate: newEnd }) });
    expect((await reload(s.projectId)).endDate).toBe(newEnd);
  });

  it("사용자 결정 「기간만 수정」 — 첫 시드가 팀장·본부 책임자·대표에 projects.period 쓰기를 켜고, 관리자가 끈 값은 재시드 뒤에도 꺼져 있다", async () => {
    for (const roleId of ["role-team-lead", "role-division-head", "role-ceo"]) {
      expect((await findPermission(SYSTEM_VIEWER, roleId, "projects.period", "write"))?.allowed).toBe(true);
    }
    expect(await findPermission(SYSTEM_VIEWER, DEFAULT_ROLE_ID, "projects.period", "write")).toBeNull();
    expect(await findPermission(SYSTEM_VIEWER, "role-team-lead", "projects", "write")).toBeNull();

    await setPermissionCell(SYSTEM_VIEWER, { roleId: "role-division-head", menu: "projects.period", action: "write", allowed: false });
    try {
      await seedMasterData(SYSTEM_VIEWER);
      expect((await findPermission(SYSTEM_VIEWER, "role-division-head", "projects.period", "write"))?.allowed).toBe(false);
    } finally {
      await setPermissionCell(SYSTEM_VIEWER, { roleId: "role-division-head", menu: "projects.period", action: "write", allowed: true });
    }
  });

  it("(i) 다른 프로젝트의 차수를 실은 저장은 「차수와 프로젝트가 맞지 않음 · 새로 고침」 · 두 프로젝트 무변경 · write.denied 정확히 한 번", async () => {
    const a = await setup({ status: "bidding", startDate: null, endDate: null });
    const b = await setup({ status: "bidding", startDate: null, endDate: null });
    const admin = await companyViewer("role-sysadmin");
    const itemName = `섞임-${randomUUID()}`;
    const warn = vi.spyOn(log, "warn");

    const outcome = await saveProjectLedger(admin, a.projectId, {
      seenStatus: "bidding",
      quoteLines: await newLine(b, itemName),
      period: period(a, { endDate: addDays(TODAY, 3) }),
    }).catch((error: unknown) => error);

    expect(String(outcome)).toContain("차수와 프로젝트가 맞지 않음 · 새로 고침");
    expect(await linesNamed(itemName)).toHaveLength(0);
    expect((await reload(a.projectId)).endDate).toBeNull();
    expect((await reload(b.projectId)).endDate).toBeNull();
    const denied = deniedCalls(warn);
    expect(denied).toHaveLength(1);
    expect(denied[0]?.rule).toBe("quote.revision-project");
    expect(denied[0]).toMatchObject({ projectId: a.projectId, revisionId: b.revisionId });
    expect(Object.keys(denied[0] ?? {}).some((key) => /date|amount|krw/i.test(key))).toBe(false);
  });

  it("(k) 되돌리기 저장에서 행동 로그가 실패하면 기간·상태·견적 줄 모두 무변경(A-01)", async () => {
    const s = await setup({ status: "settling", startDate: addDays(TODAY, -10), endDate: addDays(TODAY, -1) });
    const admin = await companyViewer("role-sysadmin");
    const itemName = `로그 실패-${randomUUID()}`;

    await expect(
      saveProjectLedger(
        admin,
        s.projectId,
        { seenStatus: "settling", period: period(s, { endDate: addDays(TODAY, 5) }), quoteLines: await newLine(s, itemName) },
        { recordAction: () => Promise.reject(new Error("action_log 실패 주입")) },
      ),
    ).rejects.toThrow("action_log 실패 주입");

    const row = await reload(s.projectId);
    expect(row.status).toBe("settling");
    expect(row.endDate).toBe(s.endDate);
    expect(await linesNamed(itemName)).toHaveLength(0);
    expect(await logs(s.projectId, "status_change")).toHaveLength(0);
  });

  it("(l) 동료가 먼저 종료일을 바꾼 뒤 옛 기준값으로 보낸 저장은 「다른 사람이 먼저 기간을 바꿈 · 새로 고침」 · DB 무변경", async () => {
    const s = await setup({ status: "in_progress", startDate: addDays(TODAY, -3), endDate: addDays(TODAY, 5) });
    const colleagueEnd = addDays(TODAY, 8);
    await saveProjectLedger(s.lead, s.projectId, { seenStatus: "in_progress", period: period(s, { endDate: colleagueEnd }) });

    const outcome = await saveProjectLedger(s.pm, s.projectId, {
      seenStatus: "in_progress",
      period: period(s, { endDate: addDays(TODAY, 12) }),
    }).catch((error: unknown) => error);

    expect(outcome).toBeInstanceOf(PeriodRejectedError);
    expect((outcome as PeriodRejectedError).errors).toEqual([{ field: "end", reason: "다른 사람이 먼저 기간을 바꿈 · 새로 고침" }]);
    expect((await reload(s.projectId)).endDate).toBe(colleagueEnd);
  });

  it("(m) 첫 저장이 돌려준 project를 기준값·seenStatus로 쓴 둘째 기간 저장도 통과한다(새로 고침 없음)", async () => {
    const s = await setup({ status: "settling", startDate: addDays(TODAY, -10), endDate: addDays(TODAY, -1) });

    const first = await saveProjectLedger(s.lead, s.projectId, { seenStatus: "settling", period: period(s, { endDate: addDays(TODAY, 5) }) });
    const secondEnd = addDays(TODAY, 9);
    const second = await saveProjectLedger(s.lead, s.projectId, {
      seenStatus: first.project.status as ProjectStatus,
      period: {
        startDate: first.project.startDate,
        endDate: secondEnd,
        baseline: { startDate: first.project.startDate, endDate: first.project.endDate },
      },
    });

    expect(second.project).toEqual({ status: "in_progress", startDate: s.startDate, endDate: secondEnd });
    expect((await reload(s.projectId)).endDate).toBe(secondEnd);
  });

  it("(m2) 화면을 연 뒤 상태만 바뀐 프로젝트에 읽은 기간 그대로의 기준값 + 바뀐 뒤 상태로 보낸 저장은 헛충돌이 없다", async () => {
    const s = await setup({ status: "bidding", startDate: addDays(TODAY, 2), endDate: addDays(TODAY, 5) });
    await changeProjectStatus(s.lead, s.projectId, { from: "bidding", to: "lost" });
    const newEnd = addDays(TODAY, 7);

    await saveProjectLedger(s.pm, s.projectId, { seenStatus: "lost", period: period(s, { endDate: newEnd }) });

    const row = await reload(s.projectId);
    expect(row.status).toBe("lost");
    expect(row.endDate).toBe(newEnd);
  });

  it("(n) 기간 쓰기 → 재판정 → 견적 줄: 견적 줄 게이트는 트랜잭션 안의 새 행(정산)으로 판정하고, 시스템 정산 로그의 seq가 견적 줄 document_update의 seq보다 작다(ENG-D6)", async () => {
    const s = await setup({ status: "in_progress", startDate: addDays(TODAY, -10), endDate: addDays(TODAY, 5) });
    const admin = await companyViewer("role-sysadmin");
    const lines = await newLine(s, `순서-${randomUUID()}`);
    vi.mocked(gate).mockClear();

    await saveProjectLedger(admin, s.projectId, {
      seenStatus: "in_progress",
      period: period(s, { endDate: addDays(TODAY, -1) }),
      quoteLines: lines,
    });

    // 견적 줄 게이트는 트랜잭션 안의 새 행(기간 쓰기 + 재판정 정산)으로 판정한다 — 커밋된 옛 행이 아니다.
    const lineGateCalls = vi.mocked(gate).mock.calls.filter(([, rule]) => rule === "project.line-edit");
    expect(lineGateCalls).toHaveLength(1);
    const [lineDoc, , lineCtx] = lineGateCalls[0]!;
    expect(lineCtx).toEqual({ status: "settling" });
    expect(lineDoc).toMatchObject({ status: "settling", endDate: addDays(TODAY, -1) });

    const [settle] = await logs(s.projectId, "status_change");
    const [lineLog] = await db
      .select()
      .from(actionLog)
      .where(and(eq(actionLog.entityId, s.revisionId), eq(actionLog.actionType, "document_update")));
    expect(settle?.actorId).toBeNull();
    expect(settle?.detail).toMatchObject({ to: "settling" });
    expect(lineLog).toBeDefined();
    expect(settle!.seq).toBeLessThan(lineLog!.seq);
    expect((await reload(s.projectId)).status).toBe("settling");
  });
});

describe("상태 바뀜 저장 거부 — seenStatus (04-22 Task 2 · DR-6)", () => {
  it("(g) 자정을 넘긴 편집 화면(seenStatus 진행)의 견적 줄 저장은 StatusChangedError(정산)로 전부 거부 · 롤백 → 읽기 경로가 다시 정산", async () => {
    const s = await setup({ status: "in_progress", startDate: addDays(FAR, -3), endDate: FAR });
    const itemName = `자정 넘김-${randomUUID()}`;

    const outcome = await saveProjectLedger(
      s.pm,
      s.projectId,
      { seenStatus: "in_progress", quoteLines: await newLine(s, itemName) },
      { now: AFTER_FAR },
    ).catch((error: unknown) => error);

    expect(outcome).toBeInstanceOf(StatusChangedError);
    expect((outcome as StatusChangedError).status).toBe("settling");
    expect(await linesNamed(itemName)).toHaveLength(0);
    expect((await reload(s.projectId)).status).toBe("in_progress");
    expect(await logs(s.projectId, "status_change")).toHaveLength(0);

    const seen = await findProject(s.pm, s.projectId, { autoSettlement: { now: AFTER_FAR } });
    expect(seen?.status).toBe("settling");
    const settleLogs = await logs(s.projectId, "status_change");
    expect(settleLogs).toHaveLength(1);
    expect(settleLogs[0]?.actorId).toBeNull();
  });

  it("(g2) 동료가 미수주로 닫은 뒤 seenStatus 수주중인 저장은 거부 · 문구 「상태가 미수주로 바뀜 · 전부 거부」 · 줄·기간 무변경", async () => {
    const s = await setup({ status: "bidding", startDate: addDays(TODAY, 2), endDate: addDays(TODAY, 5) });
    await changeProjectStatus(s.lead, s.projectId, { from: "bidding", to: "lost" });
    const itemName = `오래된 화면-${randomUUID()}`;

    const outcome = await saveProjectLedger(s.pm, s.projectId, {
      seenStatus: "bidding",
      quoteLines: await newLine(s, itemName),
      period: period(s, { endDate: addDays(TODAY, 9) }),
    }).catch((error: unknown) => error);

    expect(outcome).toBeInstanceOf(StatusChangedError);
    // saveProjectLedgerAction이 롤백 뒤 트랜잭션 밖에서 만드는 문구와 같은 두 함수(코드표 라벨 + statusChangedMessage).
    // "use server" 액션 파일은 server-only 가드 때문에 vitest에서 import할 수 없다.
    const label = (await listProjectStatusCatalog(s.pm)).find((entry) => entry.value === (outcome as StatusChangedError).status)?.label;
    expect(statusChangedMessage(label ?? "", "전부 거부")).toBe("상태가 미수주로 바뀜 · 전부 거부");
    expect(await linesNamed(itemName)).toHaveLength(0);
    const row = await reload(s.projectId);
    expect(row.status).toBe("lost");
    expect(row.endDate).toBe(s.endDate);
  });

  it("(g3) 화면이 정산을 본 뒤 팀장이 종료일을 늦추는 저장(seenStatus 정산)은 같은 tx의 자동 정산 뒤 비교라 통과한다", async () => {
    const s = await setup({ status: "in_progress", startDate: addDays(FAR, -3), endDate: FAR });

    const result = await saveProjectLedger(
      s.lead,
      s.projectId,
      { seenStatus: "settling", period: period(s, { endDate: addDays(FAR, 10) }) },
      { now: AFTER_FAR },
    );

    expect(result.project.status).toBe("in_progress");
    const statusLogs = await logs(s.projectId, "status_change");
    expect(statusLogs.map((entry) => entry.actorId)).toEqual([null, s.lead.id]);
  });

  it("상태 바뀜 거부는 권한 위반이 아니라 write.denied를 남기지 않는다", async () => {
    const s = await setup({ status: "bidding", startDate: null, endDate: null });
    await changeProjectStatus(s.lead, s.projectId, { from: "bidding", to: "lost" });
    const warn = vi.spyOn(log, "warn");

    await expect(saveProjectLedger(s.pm, s.projectId, { seenStatus: "bidding" })).rejects.toBeInstanceOf(StatusChangedError);
    expect(deniedCalls(warn)).toHaveLength(0);
  });
});

describe("정산 대 종료일 연장 경합 (04-22 Task 2 · OV-5)", () => {
  it("(j-1) 읽기 판정(A)이 행을 잠근 동안 팀장의 연장(B)이 기다리고, A를 풀면 진행 · 시스템 정산 1줄 + 사람 되돌리기 1줄", async () => {
    const s = await setup({ status: "in_progress", startDate: addDays(FAR, -3), endDate: FAR });
    const locked = deferred();
    const release = deferred();

    const first = applyAutoSettlement(
      { projectIds: [s.projectId] },
      {
        now: AFTER_FAR,
        recordAction: async (viewer, entry, opts) => {
          locked.resolve();
          await release.promise;
          return recordAction(viewer, entry, opts);
        },
      },
    );
    await locked.promise;

    const second = saveProjectLedger(
      s.lead,
      s.projectId,
      { seenStatus: "settling", period: period(s, { endDate: addDays(FAR, 10) }) },
      { now: AFTER_FAR },
    );
    try {
      await waitForLockWaiter(pool);
    } finally {
      release.resolve();
    }

    expect(await first).toEqual([s.projectId]);
    expect((await second).project.status).toBe("in_progress");
    expect((await reload(s.projectId)).status).toBe("in_progress");
    const statusLogs = await logs(s.projectId, "status_change");
    expect(statusLogs.map((entry) => [entry.actorId, (entry.detail as { trigger: string }).trigger])).toEqual([
      [null, "end_date_passed"],
      [s.lead.id, "end_date_extended"],
    ]);
  });

  it("(j-2) 연장(B)이 잠금을 쥔 동안 읽기 판정(A)은 기다리지 않고 0행 · B를 풀면 진행, 정산·되돌리기 로그가 B의 tx에서 각 1줄", async () => {
    const s = await setup({ status: "in_progress", startDate: addDays(FAR, -3), endDate: FAR });
    const locked = deferred();
    const release = deferred();

    const saving = saveProjectLedger(
      s.lead,
      s.projectId,
      { seenStatus: "settling", period: period(s, { endDate: addDays(FAR, 10) }) },
      {
        now: AFTER_FAR,
        afterLock: async () => {
          locked.resolve();
          await release.promise;
        },
      },
    );
    await locked.promise;
    try {
      expect(await applyAutoSettlement({ projectIds: [s.projectId] }, { now: AFTER_FAR })).toEqual([]);
    } finally {
      release.resolve();
    }

    expect((await saving).project.status).toBe("in_progress");
    const statusLogs = await logs(s.projectId, "status_change");
    expect(statusLogs.map((entry) => [entry.actorId, (entry.detail as { trigger: string }).trigger])).toEqual([
      [null, "end_date_passed"],
      [s.lead.id, "end_date_extended"],
    ]);
  });
});
