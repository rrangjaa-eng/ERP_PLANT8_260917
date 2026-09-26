import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, codeItems, projects, quoteLines, quoteRevisions, teams } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { approvalBasis, insertRevision } from "@/repositories/quote-revisions";
import { createProject, loadProjectList } from "@/domain/projects";
import { getCurrentQuoteRevision, listQuoteLines } from "@/domain/quotes/lines";
import {
  createRevisionFromCurrent,
  customerApprovalGateCtx,
  listRevisionLines,
  listRevisionSummaries,
  revisionLinesInputSchema,
  setCustomerApproval,
} from "@/domain/quotes/revisions";
import { ACTION_REGISTRY } from "@/lib/actions/registry";
import "@/app/(app)/projects/actions.registry";
import { gate } from "@/domain/rules/gate";
import { getSettingValue } from "@/domain/settings/registry";
import { PROJECT_CUSTOMER_APPROVAL_GATE } from "@/domain/settings/keys";
import { restore } from "@/domain/archive";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { log } from "@/lib/log";

// 04-14(D-53 · D-54 · CEO 리뷰 B-02·B-21·B-32 · 엔지 리뷰 GAP 5b · B §1) — 새 차수: 보던 차수 확인 → 견적 줄 전체
// 복사(계보 · version 1 · 업무 컬럼 보존) → 조정 줄 이동(보관 포함). 두 연결 경합은 04-40.

type Menu = { menu: string; action: "view" | "write" };

async function makeViewer(menus: Menu[], infoItems: string[] = ["project.value", "quote.amount"]): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `차수 계급-${randomUUID()}` });
  const { userId } = await createAccount(SYSTEM_VIEWER, {
    email: `rev-${randomUUID()}@example.test`,
    name: "차수 테스트 사람",
    roleId: role.id,
  });
  for (const entry of menus) {
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: entry.menu, action: entry.action, allowed: true });
  }
  for (const infoItem of infoItems) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  }
  return { id: userId, roleId: role.id };
}

const writerMenus: Menu[] = [
  { menu: "projects", action: "view" },
  { menu: "projects", action: "write" },
];

async function setupProject(pmMenus: Menu[] = writerMenus) {
  const pm = await makeViewer(pmMenus);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}`, normalizedName: `거래처-${randomUUID()}` });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
  if (!subcategory) throw new Error("시드된 quote_subcategory 코드 항목이 없습니다");
  const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId: pm.id, name: `차수-${randomUUID()}` });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("1차 차수가 없습니다");
  return { project, revisionId: revision.id, subcategory: subcategory.value, pm };
}

type LineInsert = typeof quoteLines.$inferInsert;

async function insertLine(revisionId: string, patch: Partial<LineInsert> = {}) {
  const [row] = await db
    .insert(quoteLines)
    .values({
      revisionId,
      subcategory: "기타",
      itemName: `항목-${randomUUID()}`,
      unitPriceAmountKrw: 100_000,
      executionAmountKrw: 40_000,
      quoteAmountKrw: 100_000,
      profitKrw: 60_000,
      ...patch,
    })
    .returning();
  if (!row) throw new Error("줄 삽입 실패");
  return row;
}

function adjustmentPatch(execution: number, patch: Partial<LineInsert> = {}): Partial<LineInsert> {
  return {
    lineKind: "adjustment",
    subcategory: "adjustment",
    unitPriceAmountKrw: 0,
    quoteAmountKrw: 0,
    executionAmountKrw: execution,
    profitKrw: -execution,
    ...patch,
  };
}

async function linesOf(revisionId: string) {
  return db.select().from(quoteLines).where(eq(quoteLines.revisionId, revisionId));
}

async function revisionCount(projectId: string): Promise<number> {
  return (await db.select().from(quoteRevisions).where(eq(quoteRevisions.projectId, projectId))).length;
}

async function setStatus(projectId: string, status: string) {
  await db.update(projects).set({ status }).where(eq(projects.id, projectId));
}

async function listedExecution(projectNumber: string): Promise<number> {
  const {
    rows: [row],
  } = await loadProjectList(SYSTEM_VIEWER, { year: "all", search: projectNumber });
  if (!row) throw new Error("목록에 프로젝트가 없습니다");
  return Number(row.executionAmountKrw);
}

function deniedWarnings(calls: readonly (readonly unknown[])[]): unknown[] {
  return calls.filter((call) => call[0] === "write.denied");
}

const STALE = "다른 사람이 먼저 새 차수를 만듦 · 새로 고침";

describe("새 차수 트레이서(04-14 Task 1 · D-53, 실제 Postgres)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(r1) 견적 줄 여섯 + 조정 줄 둘(하나 보관) → 2차: 견적 줄 여섯이 계보·version 1로 복사, 조정 줄 둘은 id 그대로 2차로, 1차엔 견적 줄만", async () => {
    const { project, revisionId, pm } = await setupProject();
    const originals = [];
    for (let i = 0; i < 5; i += 1) originals.push(await insertLine(revisionId, { sortOrder: i, version: i + 1 }));
    originals.push(await insertLine(revisionId, { lineKind: "out_of_quote", subcategory: "out_of_quote", quoteAmountKrw: 0, unitPriceAmountKrw: 0, profitKrw: -40_000, sortOrder: 5 }));
    const archivedQuote = await insertLine(revisionId, { archivedAt: new Date(), archivedBy: pm.id });
    const adjustment = await insertLine(revisionId, adjustmentPatch(-10_000));
    const archivedAdjustment = await insertLine(revisionId, adjustmentPatch(30_000, { archivedAt: new Date(), archivedBy: "system" }));

    const created = await createRevisionFromCurrent(pm, { projectId: project.id, fromRevisionId: revisionId });

    expect(created.seq).toBe(2);
    const current = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    expect(current).toEqual({ id: created.revisionId, seq: 2, approved: false });
    const [revisionRow] = await db.select().from(quoteRevisions).where(eq(quoteRevisions.id, created.revisionId));
    expect(revisionRow?.customerApprovedAt).toBeNull();
    expect(revisionRow?.customerApprovedBy).toBeNull();

    const second = await linesOf(created.revisionId);
    const copies = second.filter((row) => row.lineKind !== "adjustment");
    expect(copies).toHaveLength(6);
    expect(copies.map((row) => row.copiedFromLineId).sort()).toEqual(originals.map((row) => row.id).sort());
    expect(copies.every((row) => row.version === 1 && row.archivedAt === null)).toBe(true);
    expect(copies.some((row) => row.copiedFromLineId === archivedQuote.id)).toBe(false);
    const moved = second.filter((row) => row.lineKind === "adjustment");
    expect(moved.map((row) => row.id).sort()).toEqual([adjustment.id, archivedAdjustment.id].sort());

    const first = await linesOf(revisionId);
    expect(first.filter((row) => row.lineKind === "adjustment")).toHaveLength(0);
    expect(first.map((row) => row.id).sort()).toEqual([...originals.map((row) => row.id), archivedQuote.id].sort());

    const [logRow] = await db
      .select()
      .from(actionLog)
      .where(and(eq(actionLog.entity, "quote_revision"), eq(actionLog.entityId, created.revisionId)));
    expect(logRow?.actionType).toBe("document_create");
    expect(logRow?.detail).toEqual({ kind: "quote_revision", seq: 2, copiedLineCount: 6, movedAdjustmentCount: 2 });
  });

  it("(r2) 복사가 업무 컬럼을 전부 보존한다(GAP 5b) — 비고·거래처·정렬·custom_fields·취소 상태·외화 금액 묶음", async () => {
    const { project, revisionId, pm } = await setupProject();
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: `줄 거래처-${randomUUID()}`, normalizedName: `줄 거래처-${randomUUID()}` });
    const original = await insertLine(revisionId, {
      subcategory: "무대",
      itemName: "LED 벽",
      vendorId: vendor.id,
      quantity: "2.50",
      unitPriceCurrency: "USD",
      unitPriceForeignAmount: "100.00",
      unitPriceFxRate: "1350.0000",
      unitPriceAmountKrw: 135_000,
      executionCurrency: "USD",
      executionForeignAmount: "40.00",
      executionFxRate: "1340.0000",
      executionAmountKrw: 53_600,
      quoteAmountKrw: 337_500,
      profitKrw: 283_900,
      lineStatus: "cancelled",
      note: "고객 요청으로 취소",
      sortOrder: 3,
      customFields: { memo: "원본 값" },
      source: "legacy",
      version: 4,
    });

    const created = await createRevisionFromCurrent(pm, { projectId: project.id, fromRevisionId: revisionId });

    const [copy] = await linesOf(created.revisionId);
    if (!copy) throw new Error("복사본이 없습니다");
    const { id, revisionId: copyRevision, copiedFromLineId, version, createdAt, updatedAt, ...copyBusiness } = copy;
    void createdAt;
    void updatedAt;
    const { id: originalId, revisionId: originalRevision, copiedFromLineId: originalLineage, version: originalVersion, createdAt: oc, updatedAt: ou, ...originalBusiness } = original;
    void originalLineage;
    void originalVersion;
    void oc;
    void ou;
    expect(id).not.toBe(originalId);
    expect(copyRevision).toBe(created.revisionId);
    expect(originalRevision).toBe(revisionId);
    expect(copiedFromLineId).toBe(originalId);
    expect(version).toBe(1);
    expect(copyBusiness).toEqual(originalBusiness);
  });

  it("(r3) 보관된 조정 줄을 새 차수 뒤에 복원하면 2차 조정 그룹과 목록 실행가에 돌아온다(B-21)", async () => {
    const { project, revisionId, pm } = await setupProject();
    await insertLine(revisionId);
    const archivedAdjustment = await insertLine(revisionId, adjustmentPatch(30_000, { archivedAt: new Date(), archivedBy: "system" }));
    const created = await createRevisionFromCurrent(pm, { projectId: project.id, fromRevisionId: revisionId });
    const before = await listedExecution(project.number);

    const restorer = await makeViewer([
      { menu: "projects", action: "view" },
      { menu: "projects.adjustment", action: "write" },
      { menu: "admin.archive", action: "write" },
    ]);
    await restore(restorer, "quote_line", archivedAdjustment.id);

    const listed = await listQuoteLines(SYSTEM_VIEWER, created.revisionId, { status: "bidding", canWrite: true, canAdjust: true });
    expect(listed.filter((line) => line.lineKind === "adjustment").map((line) => line.id)).toEqual([archivedAdjustment.id]);
    expect(await listedExecution(project.number)).toBe(before + 30_000);
  });

  it("(r4) 같은 fromRevisionId로 두 번째 요청 → 「다른 사람이 먼저 새 차수를 만듦 · 새로 고침」, 차수 수 그대로 + write.denied 한 번(B-02)", async () => {
    const { project, revisionId, pm } = await setupProject();
    await insertLine(revisionId);
    await createRevisionFromCurrent(pm, { projectId: project.id, fromRevisionId: revisionId });
    const warn = vi.spyOn(log, "warn");

    const second = createRevisionFromCurrent(pm, { projectId: project.id, fromRevisionId: revisionId });

    await expect(second).rejects.toThrow(STALE);
    await expect(second).rejects.toBeInstanceOf(UserFacingError);
    expect(await revisionCount(project.id)).toBe(2);
    expect(deniedWarnings(warn.mock.calls)).toHaveLength(1);
  });

  it("(r5) 견적 줄 0 + 조정 줄 1 → 「복사할 견적 줄 없음 · 첫 줄 만들기」, 조정 줄은 1차에 그대로", async () => {
    const { project, revisionId, pm } = await setupProject();
    const adjustment = await insertLine(revisionId, adjustmentPatch(-5_000));
    await insertLine(revisionId, { archivedAt: new Date(), archivedBy: pm.id });
    const warn = vi.spyOn(log, "warn");

    await expect(createRevisionFromCurrent(pm, { projectId: project.id, fromRevisionId: revisionId })).rejects.toThrow(
      "복사할 견적 줄 없음 · 첫 줄 만들기",
    );

    expect(await revisionCount(project.id)).toBe(1);
    const [row] = await db.select().from(quoteLines).where(eq(quoteLines.id, adjustment.id));
    expect(row?.revisionId).toBe(revisionId);
    expect(deniedWarnings(warn.mock.calls)).toHaveLength(1);
  });

  it("(r6) 정산 「정산 · 새 차수 없음」 · 완료 「완료 · 견적 줄 잠김」 · 담당이 아닌 projects 쓰기 권한자는 허용", async () => {
    const settling = await setupProject();
    await insertLine(settling.revisionId);
    await setStatus(settling.project.id, "settling");
    await expect(createRevisionFromCurrent(settling.pm, { projectId: settling.project.id, fromRevisionId: settling.revisionId })).rejects.toThrow(
      "정산 · 새 차수 없음",
    );
    expect(await revisionCount(settling.project.id)).toBe(1);

    const completed = await setupProject();
    await insertLine(completed.revisionId);
    await setStatus(completed.project.id, "completed");
    await expect(createRevisionFromCurrent(completed.pm, { projectId: completed.project.id, fromRevisionId: completed.revisionId })).rejects.toThrow(
      "완료 · 견적 줄 잠김",
    );
    expect(await revisionCount(completed.project.id)).toBe(1);

    const open = await setupProject();
    await insertLine(open.revisionId);
    await setStatus(open.project.id, "lost");
    const otherWriter = await makeViewer(writerMenus);
    const created = await createRevisionFromCurrent(otherWriter, { projectId: open.project.id, fromRevisionId: open.revisionId });
    expect(created.seq).toBe(2);
  });

  it("(r7) projects 쓰기가 없으면 거부 · 보기 권한이 없으면 없는 프로젝트와 같이 거부 — 차수 수 그대로", async () => {
    const { project, revisionId } = await setupProject();
    await insertLine(revisionId);
    const viewerOnly = await makeViewer([{ menu: "projects", action: "view" }]);
    const warn = vi.spyOn(log, "warn");
    const denied = createRevisionFromCurrent(viewerOnly, { projectId: project.id, fromRevisionId: revisionId });
    await expect(denied).rejects.toBeInstanceOf(UserFacingError);
    await expect(denied).rejects.toThrow("견적 줄 · 쓰기 권한 없음");
    expect(deniedWarnings(warn.mock.calls)).toHaveLength(1);
    const stranger = await makeViewer([]);
    await expect(createRevisionFromCurrent(stranger, { projectId: project.id, fromRevisionId: revisionId })).rejects.toThrow(
      "존재하지 않는 프로젝트입니다.",
    );
    expect(deniedWarnings(warn.mock.calls)).toHaveLength(2);
    expect(await revisionCount(project.id)).toBe(1);
  });

  it("(r8) 순번 유일 제약 위반(23505 · quote_revisions_project_seq_key 주입)은 같은 거부 문구 · 반쪽 차수 없음 · write.denied 한 번, 다른 제약의 23505는 그대로 던진다", async () => {
    const { project, revisionId, pm } = await setupProject();
    await insertLine(revisionId);
    const adjustment = await insertLine(revisionId, adjustmentPatch(-5_000));
    const warn = vi.spyOn(log, "warn");
    const uniqueViolation = (constraint: string) =>
      Object.assign(new Error("Failed query: insert into quote_revisions"), { cause: { code: "23505", constraint } });

    // 실제로 행을 넣은 뒤 던진다 — 트랜잭션이 그 행과 뒤 단계를 전부 되돌리는지 본다(다른 연결 삽입은 교착 — B §1).
    const collide: typeof insertRevision = async (viewer, input, tx) => {
      await insertRevision(viewer, input, tx);
      throw uniqueViolation("quote_revisions_project_seq_key");
    };
    const attempt = createRevisionFromCurrent(pm, { projectId: project.id, fromRevisionId: revisionId }, { insertRevision: collide });
    await expect(attempt).rejects.toThrow(STALE);
    await expect(attempt).rejects.toBeInstanceOf(UserFacingError);
    expect(await revisionCount(project.id)).toBe(1);
    expect(await linesOf(revisionId)).toHaveLength(2);
    const [adjustmentRow] = await db.select().from(quoteLines).where(eq(quoteLines.id, adjustment.id));
    expect(adjustmentRow?.revisionId).toBe(revisionId);
    expect(deniedWarnings(warn.mock.calls)).toHaveLength(1);

    const other = uniqueViolation("some_other_key");
    await expect(
      createRevisionFromCurrent(pm, { projectId: project.id, fromRevisionId: revisionId }, {
        insertRevision: () => Promise.reject(other),
      }),
    ).rejects.toBe(other);
    expect(await revisionCount(project.id)).toBe(1);
  });
});

// 04-14 Task 2(D-56 · B-25 · B-30 · ENG-D4 · ENG-D9 · 사용자 D19-9) — 고객 승인 표시와 취소. 켜기는 전부 그 순간의
// approvalBasis에서 기준값을 받아 싣는다.
const NOW = () => new Date("2026-09-20T03:00:00.000Z"); // KST 2026-09-20 12:00

async function basisOf(revisionId: string) {
  const basis = await approvalBasis(SYSTEM_VIEWER, revisionId);
  return { seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken };
}

async function approve(viewer: Viewer, revisionId: string, approvedOn = "2026-09-19", deps: Parameters<typeof setCustomerApproval>[3] = {}) {
  return setCustomerApproval(viewer, revisionId, { approvedOn, ...(await basisOf(revisionId)) }, { now: NOW, ...deps });
}

async function approvalOf(revisionId: string) {
  const [row] = await db.select().from(quoteRevisions).where(eq(quoteRevisions.id, revisionId));
  return { at: row?.customerApprovedAt ?? null, by: row?.customerApprovedBy ?? null };
}

const NOT_ASSIGNED = "고객 승인 표시는 담당 PM만";

describe("고객 승인 표시(04-14 Task 2 · D-56, 실제 Postgres)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(a1) 담당 PM이 진행에서 2026-09-19로 켠다 — 저장 순간 2026-09-18T15:00:00Z · 승인자 · 응답 승인일 · 행동 로그 document_update(B-25 · B-30)", async () => {
    const { project, revisionId, pm } = await setupProject();
    await insertLine(revisionId);
    await setStatus(project.id, "in_progress");

    const result = await approve(pm, revisionId, "2026-09-19");

    expect(result).toEqual({ revisionId, seq: 1, approvedOn: "2026-09-19" });
    const stored = await approvalOf(revisionId);
    expect(stored.at?.toISOString()).toBe("2026-09-18T15:00:00.000Z");
    expect(stored.by).toBe(pm.id);
    const logs = await db
      .select()
      .from(actionLog)
      .where(and(eq(actionLog.entity, "quote_revision"), eq(actionLog.entityId, revisionId)));
    expect(logs.map((row) => [row.actionType, row.detail])).toEqual([
      ["document_update", { kind: "customer_approval", revisionSeq: 1, approvedOn: "2026-09-19" }],
    ]);
  });

  it("(a2) 담당이 아닌 쓰기 권한자 · 쓰기를 거둔 담당 PM은 「고객 승인 표시는 담당 PM만」 + write.denied 한 번씩(B-30)", async () => {
    const { revisionId } = await setupProject();
    await insertLine(revisionId);
    const warn = vi.spyOn(log, "warn");
    await expect(approve(await makeViewer(writerMenus), revisionId)).rejects.toThrow(NOT_ASSIGNED);

    const readOnlyPm = await setupProject([{ menu: "projects", action: "view" }]);
    await insertLine(readOnlyPm.revisionId);
    await expect(approve(readOnlyPm.pm, readOnlyPm.revisionId)).rejects.toThrow(NOT_ASSIGNED);

    expect(await approvalOf(revisionId)).toEqual({ at: null, by: null });
    expect(await approvalOf(readOnlyPm.revisionId)).toEqual({ at: null, by: null });
    expect(deniedWarnings(warn.mock.calls)).toHaveLength(2);
  });

  it("(a3) 완료에서는 켜기·끄기 모두 「완료 · 견적 줄 잠김」이고 승인일은 그대로 남는다(D19-9)", async () => {
    const { project, revisionId, pm } = await setupProject();
    await insertLine(revisionId);
    await approve(pm, revisionId, "2026-09-18");
    await setStatus(project.id, "completed");

    await expect(setCustomerApproval(pm, revisionId, null, { now: NOW })).rejects.toThrow("완료 · 견적 줄 잠김");
    await expect(approve(pm, revisionId, "2026-09-19")).rejects.toThrow("완료 · 견적 줄 잠김");

    expect((await approvalOf(revisionId)).at?.toISOString()).toBe("2026-09-17T15:00:00.000Z");
  });

  it("(a4) 정산에서는 켜기가 통과한다(D19-9)", async () => {
    const { project, revisionId, pm } = await setupProject();
    await insertLine(revisionId);
    await setStatus(project.id, "settling");
    await approve(pm, revisionId);
    expect((await approvalOf(revisionId)).by).toBe(pm.id);
  });

  it("(a5) 이전 차수 켜기는 「다른 사람이 새 차수를 만듦 · 새로 고침」", async () => {
    const { project, revisionId, pm } = await setupProject();
    await insertLine(revisionId);
    await createRevisionFromCurrent(pm, { projectId: project.id, fromRevisionId: revisionId });
    await expect(approve(pm, revisionId)).rejects.toThrow("다른 사람이 새 차수를 만듦 · 새로 고침");
    expect(await approvalOf(revisionId)).toEqual({ at: null, by: null });
  });

  it("(a6) 끄기: 연결 문서가 있으면 「연결 문서 있음 · 고치려면 새 차수」, 없으면 둘 다 비우고 로그 cleared", async () => {
    const { revisionId, pm } = await setupProject();
    const line = await insertLine(revisionId);
    await approve(pm, revisionId);
    const linked = () => Promise.resolve(new Map([[line.id, [{ number: "EX-26-0001" }]]]));

    await expect(setCustomerApproval(pm, revisionId, null, { now: NOW, linkedDocuments: linked })).rejects.toThrow(
      "연결 문서 있음 · 고치려면 새 차수",
    );
    expect((await approvalOf(revisionId)).by).toBe(pm.id);

    const result = await setCustomerApproval(pm, revisionId, null, { now: NOW });
    expect(result).toEqual({ revisionId, seq: 1, approvedOn: null });
    expect(await approvalOf(revisionId)).toEqual({ at: null, by: null });
    const [latest] = await db
      .select()
      .from(actionLog)
      .where(and(eq(actionLog.entity, "quote_revision"), eq(actionLog.entityId, revisionId)))
      .orderBy(sql`${actionLog.seq} desc`)
      .limit(1);
    expect(latest?.detail).toEqual({ kind: "customer_approval", revisionSeq: 1, cleared: true });
  });

  it("(a7) 오늘(KST)보다 늦은 승인일은 「승인일이 오늘보다 늦음 · 날짜를 고쳐 주세요」", async () => {
    const { revisionId, pm } = await setupProject();
    await insertLine(revisionId);
    await expect(approve(pm, revisionId, "2026-09-21")).rejects.toThrow("승인일이 오늘보다 늦음 · 날짜를 고쳐 주세요");
    await approve(pm, revisionId, "2026-09-20");
    expect((await approvalOf(revisionId)).by).toBe(pm.id);
  });

  it("(a8) 견적 줄 0개 차수(줄 없음 · 조정 줄만 · 보관 줄만)의 켜기는 「승인할 견적 줄이 없음 · 첫 줄 만들기」(ENG-D4)", async () => {
    const empty = await setupProject();
    const warn = vi.spyOn(log, "warn");
    await expect(approve(empty.pm, empty.revisionId)).rejects.toThrow("승인할 견적 줄이 없음 · 첫 줄 만들기");

    const adjustmentOnly = await setupProject();
    await insertLine(adjustmentOnly.revisionId, adjustmentPatch(-5_000));
    await expect(approve(adjustmentOnly.pm, adjustmentOnly.revisionId)).rejects.toThrow("승인할 견적 줄이 없음 · 첫 줄 만들기");

    const archivedOnly = await setupProject();
    await insertLine(archivedOnly.revisionId, { archivedAt: new Date(), archivedBy: archivedOnly.pm.id });
    await expect(approve(archivedOnly.pm, archivedOnly.revisionId)).rejects.toThrow("승인할 견적 줄이 없음 · 첫 줄 만들기");

    for (const setup of [empty, adjustmentOnly, archivedOnly]) expect(await approvalOf(setup.revisionId)).toEqual({ at: null, by: null });
    expect(deniedWarnings(warn.mock.calls)).toHaveLength(3);
  });

  it("(a9) 옛 기준값의 켜기는 「견적이 바뀜 · 새로 고침」 — 수량 저장·실행가만 저장·토큰만 다름은 거부, 조정 줄만 더하면 통과(ENG-D9)", async () => {
    const { revisionId, pm } = await setupProject();
    const line = await insertLine(revisionId);
    const warn = vi.spyOn(log, "warn");
    const opts = { now: NOW };

    // 다른 사람이 수량을 고쳐 저장(버전 증가 · 견적가 변경).
    const seen = await basisOf(revisionId);
    await db
      .update(quoteLines)
      .set({ quantity: "2.00", quoteAmountKrw: 200_000, profitKrw: 160_000, version: sql`${quoteLines.version} + 1` })
      .where(eq(quoteLines.id, line.id));
    await expect(setCustomerApproval(pm, revisionId, { approvedOn: "2026-09-19", ...seen }, opts)).rejects.toThrow("견적이 바뀜 · 새로 고침");
    expect(await approvalOf(revisionId)).toEqual({ at: null, by: null });
    expect(deniedWarnings(warn.mock.calls)).toHaveLength(1);

    await setCustomerApproval(pm, revisionId, { approvedOn: "2026-09-19", ...(await basisOf(revisionId)) }, opts);
    expect((await approvalOf(revisionId)).by).toBe(pm.id);
    await setCustomerApproval(pm, revisionId, null, opts);

    // 실행가만 고친 저장도 줄 버전을 올린다 — 보수적으로 거부.
    const beforeExecution = await basisOf(revisionId);
    await db
      .update(quoteLines)
      .set({ executionAmountKrw: 50_000, profitKrw: 150_000, version: sql`${quoteLines.version} + 1` })
      .where(eq(quoteLines.id, line.id));
    expect((await basisOf(revisionId)).seenTotalKrw).toBe(beforeExecution.seenTotalKrw);
    await expect(setCustomerApproval(pm, revisionId, { approvedOn: "2026-09-19", ...beforeExecution }, opts)).rejects.toThrow(
      "견적이 바뀜 · 새로 고침",
    );

    // 합계는 맞고 토큰만 다름 → 거부.
    const current = await basisOf(revisionId);
    await expect(
      setCustomerApproval(pm, revisionId, { approvedOn: "2026-09-19", seenTotalKrw: current.seenTotalKrw, contentToken: "0".repeat(32) }, opts),
    ).rejects.toThrow("견적이 바뀜 · 새로 고침");

    // 조정 줄만 더한 저장은 토큰 밖 — 옛 기준값 그대로 통과.
    await insertLine(revisionId, adjustmentPatch(-7_000));
    await setCustomerApproval(pm, revisionId, { approvedOn: "2026-09-19", ...current }, opts);
    expect((await approvalOf(revisionId)).by).toBe(pm.id);
  });

  it("(a10) 게이트는 이전 승인 차수를 대신 보지 않는다 — 1차 승인 + 2차 미승인이면 quote.customer-approval 거부(D-54 · 금지 항목), ctx는 호출자 tx 안의 최신 차수로 만든다", async () => {
    const { project, revisionId, pm } = await setupProject();
    await insertLine(revisionId);
    await setStatus(project.id, "in_progress");
    await approve(pm, revisionId);
    await createRevisionFromCurrent(pm, { projectId: project.id, fromRevisionId: revisionId });
    const gateEnabled = await getSettingValue(PROJECT_CUSTOMER_APPROVAL_GATE);
    const lockedProject = { ...project, status: "in_progress" };

    const decision = await db.transaction(async (tx) => {
      const ctx = await customerApprovalGateCtx(SYSTEM_VIEWER, lockedProject, { tx, gateEnabled, actorIsAssignedPm: true, pmName: "차수 테스트 사람" });
      expect(ctx).toEqual({ status: "in_progress", revisionSeq: 2, revisionApproved: false, gateEnabled, actorIsAssignedPm: true, pmName: "차수 테스트 사람" });
      return gate(lockedProject, "quote.customer-approval", ctx);
    });
    expect(decision).toEqual({ allowed: false, reason: "2차 고객 승인 전 · 고객 승인 표시" });
    expect((await approvalOf(revisionId)).by).toBe(pm.id);

    // 전역 db가 아니라 호출자 tx를 읽는다 — 같은 tx에서 아직 커밋 안 된 3차가 최신으로 잡힌다(04-32).
    const rollback = new Error("rollback");
    await expect(
      db.transaction(async (tx) => {
        await insertRevision(SYSTEM_VIEWER, { projectId: project.id, seq: 3 }, tx);
        const ctx = await customerApprovalGateCtx(SYSTEM_VIEWER, lockedProject, { tx, gateEnabled, actorIsAssignedPm: false, pmName: "차수 테스트 사람" });
        expect(ctx.revisionSeq).toBe(3);
        await expect(gate(lockedProject, "quote.customer-approval", ctx)).resolves.toEqual({ allowed: false, reason: "3차 고객 승인 전 · 담당 PM 차수 테스트 사람" });
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(await revisionCount(project.id)).toBe(2);
  });
});

// 04-14 Task 3(S5 · U-2 · B-18 · B-20 · ENG-D9 · GAP 5c · DR-4 · DR-13) — 차수 요약 · 이전 차수 잠김 조회 · 보기 액션.
const readerMenus: Menu[] = [{ menu: "projects", action: "view" }];

describe("차수 요약 · 이전 차수 잠김 조회(04-14 Task 3, 실제 Postgres)", () => {
  it("(s1) 1차 승인 · 2차 미승인 · 3차 최신 → [현재, 빈 값, 승인] · 최신이 승인이면 `승인`만 · 합계는 숫자(15억 줄 둘) · 줄 수 · 차수 id · 토큰(ENG-D9)", async () => {
    const { project, revisionId, pm } = await setupProject();
    await insertLine(revisionId, { unitPriceAmountKrw: 1_500_000_000, quoteAmountKrw: 1_500_000_000, profitKrw: 1_499_960_000 });
    await insertLine(revisionId, { unitPriceAmountKrw: 1_500_000_000, quoteAmountKrw: 1_500_000_000, profitKrw: 1_499_960_000 });
    await insertLine(revisionId, { archivedAt: new Date(), archivedBy: pm.id });
    await insertLine(revisionId, adjustmentPatch(-3_000));
    await approve(pm, revisionId);
    const second = await createRevisionFromCurrent(pm, { projectId: project.id, fromRevisionId: revisionId });
    const third = await createRevisionFromCurrent(pm, { projectId: project.id, fromRevisionId: second.revisionId });

    const summaries = await listRevisionSummaries(pm, project.id);

    expect(summaries.map((row) => [row.seq, row.statusWord])).toEqual([
      [3, "현재"],
      [2, ""],
      [1, "승인"],
    ]);
    expect(summaries.map((row) => row.revisionId)).toEqual([third.revisionId, second.revisionId, revisionId]);
    for (const row of summaries) {
      expect(typeof row.totalKrw).toBe("number");
      expect(row.totalKrw).toBe(3_000_000_000);
      expect(row.lineCount).toBe(2);
      expect(row.createdOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(summaries[2]?.approvedOn).toBe("2026-09-19");
    expect(summaries[0]?.contentToken).toBe((await approvalBasis(SYSTEM_VIEWER, third.revisionId)).contentToken);

    await approve(pm, third.revisionId);
    const [latest] = await listRevisionSummaries(pm, project.id);
    expect(latest?.statusWord).toBe("승인");
  });

  it("(s2) quote.amount를 숨긴 계급은 요약 행에 합계 키가 없다 — 순번·생성일·줄 수·상태는 있다(B-20)", async () => {
    const { project, revisionId } = await setupProject();
    await insertLine(revisionId);
    const hidden = await makeViewer(readerMenus, ["project.value"]);

    const rows = await listRevisionSummaries(hidden, project.id);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ seq: 1, lineCount: 1, statusWord: "현재" });
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(["approvedBy", "approvedOn", "contentToken", "createdOn", "lineCount", "revisionId", "seq", "statusWord"]);
    }
  });

  it("(s5) 차수 요약도 findProject 기준 — 보관된 프로젝트(보관함 권한 없음) · 없는 프로젝트는 빈 목록", async () => {
    const { project, revisionId } = await setupProject();
    await insertLine(revisionId);
    const reader = await makeViewer(readerMenus);
    expect(await listRevisionSummaries(reader, project.id)).toHaveLength(1);

    await db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.id, project.id));

    expect(await listRevisionSummaries(reader, project.id)).toEqual([]);
    expect(await listRevisionSummaries(reader, randomUUID())).toEqual([]);
  });

  it("(s3) 이전 차수 잠김 조회: 모든 줄의 모든 셀 locked(쓰기 권한자에게도) · 조정 줄 0 · 1차 줄 id · 숨긴 계급은 금액 키 없음 · 현재 이상·없는 순번은 현재 차수(GAP 5c)", async () => {
    const { project, revisionId, pm } = await setupProject();
    const first = [await insertLine(revisionId), await insertLine(revisionId, { lineKind: "out_of_quote", subcategory: "out_of_quote", quoteAmountKrw: 0, unitPriceAmountKrw: 0 })];
    const adjustment = await insertLine(revisionId, adjustmentPatch(-4_000));
    const second = await createRevisionFromCurrent(pm, { projectId: project.id, fromRevisionId: revisionId });

    const locked = await listRevisionLines(pm, project.id, { revisionSeq: 1 });
    expect(locked.map((line) => line.id).sort()).toEqual(first.map((line) => line.id).sort());
    expect(locked.filter((line) => line.lineKind === "adjustment")).toHaveLength(0);
    for (const line of locked) expect(new Set(Object.values(line.cellEditability))).toEqual(new Set(["locked"]));

    const hidden = await makeViewer(readerMenus, ["project.value"]);
    const hiddenLines = await listRevisionLines(hidden, project.id, { revisionSeq: 1 });
    expect(hiddenLines).toHaveLength(2);
    for (const line of hiddenLines) {
      for (const key of ["unitPrice", "execution", "quoteAmountKrw", "profitKrw"]) expect(Object.keys(line)).not.toContain(key);
    }
    const hiddenCurrent = await listRevisionLines(hidden, project.id, { revisionSeq: 2 });
    expect(Object.keys(hiddenCurrent[0] ?? {}).sort()).toEqual(Object.keys(hiddenLines[0] ?? {}).sort());

    const secondIds = (await linesOf(second.revisionId)).map((row) => row.id).sort();
    for (const seq of [2, 99]) {
      const current = await listRevisionLines(pm, project.id, { revisionSeq: seq });
      expect(current.map((line) => line.id).sort()).toEqual(secondIds);
      expect(current.some((line) => line.id === adjustment.id)).toBe(true);
      expect(current.some((line) => Object.values(line.cellEditability).includes("edit"))).toBe(true);
    }
  });

  it("(s4) 보기 액션: 레지스트리 view·QuoteLineDto · 순번 스키마(0·음수·정수 아님 거부) · 행 범위 밖은 없는 프로젝트와 같이 거부(DR-13)", async () => {
    expect(ACTION_REGISTRY.find((entry) => entry.name === "listRevisionLinesAction")).toEqual({
      name: "listRevisionLinesAction",
      menu: "projects",
      action: "view",
      dtoName: "QuoteLineDto",
    });
    const projectId = randomUUID();
    for (const revisionSeq of [0, -1, 1.5]) expect(revisionLinesInputSchema.safeParse({ projectId, revisionSeq }).success).toBe(false);
    expect(revisionLinesInputSchema.safeParse({ projectId, revisionSeq: 1 }).success).toBe(true);

    const { project, revisionId } = await setupProject();
    await insertLine(revisionId);
    const stranger = await makeViewer([]);
    await expect(listRevisionLines(stranger, project.id, { revisionSeq: 1 })).rejects.toThrow("존재하지 않는 프로젝트입니다.");
    await expect(listRevisionLines(SYSTEM_VIEWER, randomUUID(), { revisionSeq: 1 })).rejects.toThrow("존재하지 않는 프로젝트입니다.");
  });
});
