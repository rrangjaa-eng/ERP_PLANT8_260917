import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, codeItems, projects, quoteLines, quoteRevisions, teams } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRevision } from "@/repositories/quote-revisions";
import { createProject, listProjects } from "@/domain/projects";
import { getCurrentQuoteRevision, listQuoteLines } from "@/domain/quotes/lines";
import { createRevisionFromCurrent } from "@/domain/quotes/revisions";
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

async function setupProject() {
  const pm = await makeViewer(writerMenus);
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
  const [row] = await listProjects(SYSTEM_VIEWER, { filter: { search: projectNumber } });
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
    await expect(createRevisionFromCurrent(viewerOnly, { projectId: project.id, fromRevisionId: revisionId })).rejects.toBeInstanceOf(UserFacingError);
    const stranger = await makeViewer([]);
    await expect(createRevisionFromCurrent(stranger, { projectId: project.id, fromRevisionId: revisionId })).rejects.toThrow(
      "존재하지 않는 프로젝트입니다.",
    );
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
