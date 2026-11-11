import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { actionLog, projects, quoteLines, settingsSimple, teams } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, listQuoteLines, saveQuoteLines, type QuoteLineWriteRow } from "@/domain/quotes/lines";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { listCounterpartProjects } from "@/domain/quotes/adjustment-pair";
import { restore } from "@/domain/archive";
import { deferred, waitForLockWaiter } from "./lock-race";

// 07.2-12(D7298-B · D-7300 · 07.2 D-7307) — 프로젝트 사이 조정 쌍. 한쪽 조정 줄과 상대 현재 차수의 반대 부호 줄이 한 트랜잭션으로
// 생기고 · 따라 고쳐지고 · 함께 보관 · 복원된다. 어느 쪽이든 완료면 전부 거부, 반대 방향 동시 저장에서도 교착(40P01)이 없다.

const LOCKED = "상대 프로젝트 완료 · 조정 불가";
const ARCHIVED = "상대 프로젝트 보관됨 · 조정 불가";
const ARCHIVE_VIEW = { menu: "admin.archive", action: "view" as const };
const CAP_KEY = "quote_line.max_per_revision";

async function makeProject(label: string) {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `쌍거래처-${randomUUID()}`, normalizedName: `쌍거래처-${randomUUID()}` });
  const { userId: pmUserId } = await createAccount(SYSTEM_VIEWER, { email: `pair-pm-${randomUUID()}@example.test`, name: "쌍 PM", roleId: DEFAULT_ROLE_ID });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId, name: `${label}-${randomUUID()}` });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("1차 차수가 없습니다");
  await db.update(projects).set({ status: "in_progress" }).where(eq(projects.id, project.id));
  return { projectId: project.id, number: project.number, revisionId: revision.id };
}

async function makeAdjuster(extra: { menu: string; action: "view" | "write" }[] = []): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `쌍 계급-${randomUUID()}`, viewScope: "company" });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `pair-${randomUUID()}@example.test`, name: "쌍 경영관리", roleId: role.id });
  for (const entry of [{ menu: "projects", action: "view" as const }, { menu: "projects.adjustment", action: "write" as const }, ...extra]) {
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: entry.menu, action: entry.action, allowed: true });
  }
  for (const infoItem of ["project.value", "quote.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return { id: userId, roleId: role.id };
}

function pairRow(execution: number, counterpartProjectId: string | undefined, patch: Partial<QuoteLineWriteRow> = {}): QuoteLineWriteRow {
  return {
    id: randomUUID(),
    isNew: true,
    lineKind: "adjustment",
    subcategory: "",
    itemName: "프로젝트 간 비용 이전",
    unitPrice: { currency: "KRW", amount: 0, fxRate: 1 },
    execution: { currency: "KRW", amount: execution, fxRate: 1 },
    ...(counterpartProjectId ? { counterpartProjectId } : {}),
    ...patch,
  };
}

async function liveAdjustments(revisionId: string) {
  return db
    .select()
    .from(quoteLines)
    .where(and(eq(quoteLines.revisionId, revisionId), eq(quoteLines.lineKind, "adjustment"), isNull(quoteLines.archivedAt)));
}

async function lineById(id: string) {
  const [row] = await db.select().from(quoteLines).where(eq(quoteLines.id, id));
  if (!row) throw new Error("줄이 없습니다");
  return row;
}

function editOf(row: typeof quoteLines.$inferSelect, patch: Partial<QuoteLineWriteRow>): QuoteLineWriteRow {
  return {
    id: row.id,
    version: row.version,
    subcategory: row.subcategory,
    itemName: row.itemName,
    unitPrice: { currency: "KRW", amount: 0, fxRate: 1 },
    execution: { currency: "KRW", amount: row.executionAmountKrw, fxRate: 1 },
    ...patch,
  };
}

async function logsFor(entityId: string, actionType: string) {
  return db.select().from(actionLog).where(and(eq(actionLog.entityId, entityId), eq(actionLog.actionType, actionType)));
}

async function withCap<T>(cap: number, run: () => Promise<T>): Promise<T> {
  const [before] = await db.select().from(settingsSimple).where(eq(settingsSimple.key, CAP_KEY));
  await db.insert(settingsSimple).values({ key: CAP_KEY, value: cap }).onConflictDoUpdate({ target: settingsSimple.key, set: { value: cap } });
  try {
    return await run();
  } finally {
    if (before) await db.update(settingsSimple).set({ value: before.value }).where(eq(settingsSimple.key, CAP_KEY));
    else await db.delete(settingsSimple).where(eq(settingsSimple.key, CAP_KEY));
  }
}

async function seedAdjustment(revisionId: string, execution: number) {
  await saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [pairRow(execution, undefined, { itemName: "채움 조정" })] });
}

async function createPair(adjuster: Viewer, a: { revisionId: string }, b: { projectId: string }, execution = -1_000_000) {
  const row = pairRow(execution, b.projectId);
  await saveQuoteLines(adjuster, a.revisionId, { rows: [row] });
  return lineById(row.id);
}

function pgCodes(error: unknown): string[] {
  const codes: string[] = [];
  let current: unknown = error;
  while (current && typeof current === "object") {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") codes.push(code);
    current = (current as { cause?: unknown }).cause;
  }
  return codes;
}

describe("조정 줄 쌍 — 한 트랜잭션 · 따라 고치기 · 짝 보관(D-7300)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(p1) A에 −1,000,000 조정 + 상대 B → A 줄과 B 현재 차수 +1,000,000 줄이 한 쌍 · 양쪽 조정 합 0 · B 차수 행동 로그 1건", async () => {
    const a = await makeProject("쌍A");
    const b = await makeProject("쌍B");
    const adjuster = await makeAdjuster();
    const own = await createPair(adjuster, a, b);

    const [partner] = await liveAdjustments(b.revisionId);
    expect(partner).toBeDefined();
    expect(own.adjustmentPairId).not.toBeNull();
    expect(partner!.adjustmentPairId).toBe(own.adjustmentPairId);
    expect(own.counterpartProjectId).toBe(b.projectId);
    expect(partner!.counterpartProjectId).toBe(a.projectId);
    expect(own.executionAmountKrw).toBe(-1_000_000);
    expect(partner!.executionAmountKrw).toBe(1_000_000);
    expect(own.profitKrw + partner!.profitKrw).toBe(0);
    expect(partner!.itemName).toBe(own.itemName);

    const logs = await logsFor(b.revisionId, "document_update");
    expect(logs).toHaveLength(1);
    expect(logs[0]!.detail).toMatchObject({ counterpartProjectId: a.projectId, adjustmentPairId: own.adjustmentPairId, lineIds: [partner!.id] });
    // B 이력에도 줄 전후가 남는다(A 쪽 로그와 같은 lineChanges 꼴 — 순번은 B 차수 화면 번호).
    const created = (logs[0]!.detail as { lineChanges: { changes: Record<string, [unknown, unknown]> }[] }).lineChanges;
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ id: partner!.id, kind: "quote", no: 1, name: "프로젝트 간 비용 이전" });
    expect(created[0]!.changes).toMatchObject({ itemName: [null, "프로젝트 간 비용 이전"], execution: [null, "1,000,000원"] });

    // DTO — 양쪽 표가 상대를 2행으로 그린다(번호 · 이름).
    const listedB = await listQuoteLines(adjuster, b.revisionId, { status: "in_progress", canWrite: false, canAdjust: true });
    expect(listedB.find((line) => line.id === partner!.id)?.counterpart).toMatchObject({ number: a.number });
  });

  it("(p2) A 쪽 금액 · 항목명을 고치면 B 짝이 따라가고, A 쪽을 지우면 B 짝도 같은 트랜잭션으로 보관된다", async () => {
    const a = await makeProject("쌍A");
    const b = await makeProject("쌍B");
    const adjuster = await makeAdjuster();
    const own = await createPair(adjuster, a, b);

    await saveQuoteLines(adjuster, a.revisionId, { rows: [editOf(own, { itemName: "이전 비용 수정", execution: { currency: "KRW", amount: -1_200_000, fxRate: 1 } })] });
    const [partner] = await liveAdjustments(b.revisionId);
    expect(partner!.executionAmountKrw).toBe(1_200_000);
    expect(partner!.itemName).toBe("이전 비용 수정");

    await saveQuoteLines(adjuster, a.revisionId, { rows: [], archivedLineIds: [own.id] });
    expect(await liveAdjustments(a.revisionId)).toHaveLength(0);
    expect(await liveAdjustments(b.revisionId)).toHaveLength(0);
    expect((await lineById(partner!.id)).archivedAt).toBeInstanceOf(Date);

    // B 차수 로그: 생성 · 따라 고침 · 보관 세 저장에 한 건씩, 고침은 바뀐 칸만 · 보관은 이전 값만.
    const logs = (await logsFor(b.revisionId, "document_update")).sort((x, y) => x.occurredAt.getTime() - y.occurredAt.getTime());
    expect(logs).toHaveLength(3);
    const changesOf = (index: number) => (logs[index]!.detail as { lineChanges: { id: string; no: number; changes: Record<string, [unknown, unknown]> }[] }).lineChanges;
    expect(changesOf(1)).toEqual([
      { id: partner!.id, kind: "quote", no: 1, name: "이전 비용 수정", changes: { itemName: ["프로젝트 간 비용 이전", "이전 비용 수정"], execution: ["1,000,000원", "1,200,000원"] } },
    ]);
    expect(changesOf(2)).toHaveLength(1);
    expect(changesOf(2)[0]).toMatchObject({ id: partner!.id, no: 1 });
    expect(changesOf(2)[0]!.changes).toMatchObject({ itemName: ["이전 비용 수정", null], execution: ["1,200,000원", null] });
  });

  it("(p2b) 한 저장에서 같은 상대 B에 쌍 둘을 만들면 B 차수 로그는 짝 쓰기마다 한 건 · 각 로그가 제 쌍 하나와 그 줄 전후를 싣는다", async () => {
    const a = await makeProject("쌍A");
    const b = await makeProject("쌍B");
    const adjuster = await makeAdjuster();
    await saveQuoteLines(adjuster, a.revisionId, { rows: [pairRow(-1_000, b.projectId), pairRow(-2_000, b.projectId)] });

    const partners = await liveAdjustments(b.revisionId);
    expect(partners).toHaveLength(2);
    const logs = await logsFor(b.revisionId, "document_update");
    expect(logs).toHaveLength(2);
    for (const log of logs) {
      const detail = log.detail as { lineIds: string[]; adjustmentPairId: string; lineChanges: { id: string; no: number }[] };
      const partner = partners.find((row) => row.id === detail.lineIds[0]);
      expect(detail.adjustmentPairId).toBe(partner!.adjustmentPairId);
      expect(detail.lineChanges.map((element) => element.id)).toEqual([partner!.id]);
    }
    const numbers = logs.flatMap((log) => (log.detail as { lineChanges: { no: number }[] }).lineChanges.map((element) => element.no));
    expect(numbers.sort()).toEqual([1, 2]);
  });

  it("(p3) 외화 USD 쌍도 합 0 — 짝 줄은 저장 칸을 부호만 바꿔 복사한다(다시 환산하지 않는다)", async () => {
    const a = await makeProject("쌍A");
    const b = await makeProject("쌍B");
    const adjuster = await makeAdjuster();
    const row = pairRow(0, b.projectId, { execution: { currency: "USD", amount: -0.35, fxRate: 1350 } });
    await saveQuoteLines(adjuster, a.revisionId, { rows: [row] });
    const own = await lineById(row.id);
    const [partner] = await liveAdjustments(b.revisionId);
    expect(own.executionAmountKrw + partner!.executionAmountKrw).toBe(0);
    expect(partner!.executionForeignAmount).toBe("0.35");
  });

  it("(p4) B가 완료면 생성 · 수정 · 삭제 전부 거부 `상대 프로젝트 완료 · 조정 불가` · 행 변경 0", async () => {
    const a = await makeProject("쌍A");
    const b = await makeProject("쌍B");
    const adjuster = await makeAdjuster();
    const own = await createPair(adjuster, a, b);
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, b.projectId));

    await expect(saveQuoteLines(adjuster, a.revisionId, { rows: [pairRow(-5_000, b.projectId)] })).rejects.toThrow(LOCKED);
    await expect(
      saveQuoteLines(adjuster, a.revisionId, { rows: [editOf(own, { execution: { currency: "KRW", amount: -3_000, fxRate: 1 } })] }),
    ).rejects.toThrow(LOCKED);
    await expect(saveQuoteLines(adjuster, a.revisionId, { rows: [], archivedLineIds: [own.id] })).rejects.toThrow(LOCKED);
    expect(await liveAdjustments(a.revisionId)).toHaveLength(1);
    expect(await liveAdjustments(b.revisionId)).toHaveLength(1);
    expect((await lineById(own.id)).executionAmountKrw).toBe(-1_000_000);

    // 자기 쪽(A)이 완료여도 같다.
    await db.update(projects).set({ status: "in_progress" }).where(eq(projects.id, b.projectId));
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, a.projectId));
    await expect(saveQuoteLines(adjuster, a.revisionId, { rows: [], archivedLineIds: [own.id] })).rejects.toThrow(LOCKED);
  });

  it("(p5) 상대 집합 판정 — 없는(볼 수 없는) 프로젝트 · 자기 자신 · 견적 줄 · 규칙 줄(기존 줄)에 상대를 실으면 거부, 조정 권리 없는 사람도 거부", async () => {
    const a = await makeProject("쌍A");
    const b = await makeProject("쌍B");
    const adjuster = await makeAdjuster();
    await expect(saveQuoteLines(adjuster, a.revisionId, { rows: [pairRow(-1_000, randomUUID())] })).rejects.toThrow("상대 프로젝트를 볼 수 없음 · 새로 고침");
    await expect(saveQuoteLines(adjuster, a.revisionId, { rows: [pairRow(-1_000, a.projectId)] })).rejects.toThrow("조정 쌍은 새 조정 줄만 · 새로 고침");

    await seedAdjustment(a.revisionId, -7_000);
    const [rule] = await liveAdjustments(a.revisionId);
    await db.update(quoteLines).set({ sourceExpenseId: randomUUID(), sourceSyncedVersion: rule!.version }).where(eq(quoteLines.id, rule!.id));
    await expect(
      saveQuoteLines(adjuster, a.revisionId, { rows: [editOf(await lineById(rule!.id), { counterpartProjectId: b.projectId })] }),
    ).rejects.toThrow("조정 쌍은 새 조정 줄만 · 새로 고침");

    const { userId } = await createAccount(SYSTEM_VIEWER, { email: `pair-pm2-${randomUUID()}@example.test`, name: "쌍 PM2", roleId: DEFAULT_ROLE_ID });
    const noAdjust: Viewer = { id: userId, roleId: DEFAULT_ROLE_ID };
    await expect(saveQuoteLines(noAdjust, a.revisionId, { rows: [pairRow(-1_000, b.projectId)] })).rejects.toThrow();
    expect(await liveAdjustments(b.revisionId)).toHaveLength(0);
  });

  it("(p6) B 현재 차수가 상한이면 A의 쌍 저장 전부 거부(B 잠근 행으로 상한)", async () => {
    const a = await makeProject("쌍A");
    const b = await makeProject("쌍B");
    const adjuster = await makeAdjuster();
    await seedAdjustment(b.revisionId, -1_000);
    await seedAdjustment(b.revisionId, -2_000);
    await withCap(2, async () => {
      await expect(saveQuoteLines(adjuster, a.revisionId, { rows: [pairRow(-5_000, b.projectId)] })).rejects.toThrow("2줄 상한을 넘음 · 전부 거부");
    });
    expect(await liveAdjustments(a.revisionId)).toHaveLength(0);
    expect(await liveAdjustments(b.revisionId)).toHaveLength(2);
  });

  it("(p8) 보관된 상대 — 보관함 보기 권리가 있어 잠금 전 판정을 지나도 잠근 행이 보관이면 생성 거부 `상대 프로젝트 보관됨 · 조정 불가` · 행 변경 0", async () => {
    const a = await makeProject("쌍A");
    const b = await makeProject("쌍B");
    const adjuster = await makeAdjuster([ARCHIVE_VIEW]);
    await db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.id, b.projectId));

    await expect(saveQuoteLines(adjuster, a.revisionId, { rows: [pairRow(-1_000_000, b.projectId)] })).rejects.toThrow(ARCHIVED);
    expect(await liveAdjustments(a.revisionId)).toHaveLength(0);
    expect(await liveAdjustments(b.revisionId)).toHaveLength(0);
  });

  it("(p9) 상대 B가 잠금 전 판정과 잠금 사이에 보관되면 수정 거부 `상대 프로젝트 보관됨 · 조정 불가` · 짝 그대로", async () => {
    const a = await makeProject("쌍A");
    const b = await makeProject("쌍B");
    const adjuster = await makeAdjuster();
    const own = await createPair(adjuster, a, b);
    const [partner] = await liveAdjustments(b.revisionId);

    // B를 보관하는 트랜잭션이 B 행을 잡은 채로 있는 동안 A 저장이 잠금 전 판정(보관 전 값)을 지나 B 잠금에서 기다린다.
    const archived = deferred();
    const release = deferred();
    const archiving = db.transaction(async (tx) => {
      await tx.update(projects).set({ archivedAt: new Date() }).where(eq(projects.id, b.projectId));
      archived.resolve();
      await release.promise;
    });
    await archived.promise;
    const editing = saveQuoteLines(adjuster, a.revisionId, { rows: [editOf(own, { itemName: "늦은 수정" })] });
    await waitForLockWaiter(pool);
    release.resolve();
    await archiving;
    await expect(editing).rejects.toThrow(ARCHIVED);
    expect((await lineById(own.id)).itemName).toBe("프로젝트 간 비용 이전");
    expect((await lineById(partner!.id)).itemName).toBe("프로젝트 간 비용 이전");
  });

  it("(p10) 한 저장에 같은 새 조정 줄 id가 두 번 실리면 전부 거부 · 짝 줄이 둘 생기지 않는다(Codex 리뷰 P2 · PR #372)", async () => {
    const a = await makeProject("쌍A");
    const b = await makeProject("쌍B");
    const adjuster = await makeAdjuster();
    const row = pairRow(-1_000, b.projectId);

    await expect(saveQuoteLines(adjuster, a.revisionId, { rows: [row, { ...row }] })).rejects.toThrow("줄 순서가 맞지 않음 · 새로 고침");
    expect(await liveAdjustments(a.revisionId)).toHaveLength(0);
    expect(await liveAdjustments(b.revisionId)).toHaveLength(0);
  });

  it("(p7) 상대 고르기 목록 — 자기 프로젝트는 빠지고 완료 프로젝트는 고를 수 없다 · 조정 권리 없으면 빈 목록", async () => {
    const a = await makeProject("쌍A");
    const b = await makeProject("쌍B");
    const done = await makeProject("쌍완료");
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, done.projectId));
    const adjuster = await makeAdjuster();
    const rows = await listCounterpartProjects(adjuster, a.projectId);
    expect(rows.some((row) => row.id === a.projectId)).toBe(false);
    expect(rows.find((row) => row.id === b.projectId)?.selectable).toBe(true);
    expect(rows.find((row) => row.id === done.projectId)?.selectable).toEqual({ reason: "완료 프로젝트 · 고를 수 없음" });
    expect(await listCounterpartProjects({ id: adjuster.id, roleId: DEFAULT_ROLE_ID }, a.projectId)).toEqual([]);
  });
});

describe("조정 줄 쌍 — 복원(07.2 D-7307 · eng r2 B N3)", () => {
  const archiveMenu = { menu: "admin.archive", action: "write" as const };

  it("(r1) 보관함에서 A 쪽 쌍 줄을 복원하면 B 짝도 같은 트랜잭션으로 복원 · 양쪽 합 0 · A · B 복원 로그 각 1건", async () => {
    const a = await makeProject("쌍A");
    const b = await makeProject("쌍B");
    const adjuster = await makeAdjuster([archiveMenu]);
    const own = await createPair(adjuster, a, b);
    const [partner] = await liveAdjustments(b.revisionId);
    await saveQuoteLines(adjuster, a.revisionId, { rows: [], archivedLineIds: [own.id] });

    await restore(adjuster, "quote_line", own.id);
    expect((await lineById(own.id)).archivedAt).toBeNull();
    expect((await lineById(partner!.id)).archivedAt).toBeNull();
    expect((await lineById(own.id)).executionAmountKrw + (await lineById(partner!.id)).executionAmountKrw).toBe(0);
    expect(await logsFor(own.id, "restore")).toHaveLength(1);
    const partnerLogs = await logsFor(partner!.id, "restore");
    expect(partnerLogs).toHaveLength(1);
    expect(partnerLogs[0]!.detail).toMatchObject({ adjustmentPairId: own.adjustmentPairId });
  });

  it("(r2) B가 완료면 복원 거부 · 양쪽 보관 그대로", async () => {
    const a = await makeProject("쌍A");
    const b = await makeProject("쌍B");
    const adjuster = await makeAdjuster([archiveMenu]);
    const own = await createPair(adjuster, a, b);
    const [partner] = await liveAdjustments(b.revisionId);
    await saveQuoteLines(adjuster, a.revisionId, { rows: [], archivedLineIds: [own.id] });
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, b.projectId));

    await expect(restore(adjuster, "quote_line", own.id)).rejects.toThrow(LOCKED);
    expect((await lineById(own.id)).archivedAt).toBeInstanceOf(Date);
    expect((await lineById(partner!.id)).archivedAt).toBeInstanceOf(Date);
  });

  it("(r4) B가 보관됐으면 보관함 권리가 있어도 복원 거부 `상대 프로젝트 보관됨 · 조정 불가` · 양쪽 보관 그대로", async () => {
    const a = await makeProject("쌍A");
    const b = await makeProject("쌍B");
    const adjuster = await makeAdjuster([archiveMenu, ARCHIVE_VIEW]);
    const own = await createPair(adjuster, a, b);
    const [partner] = await liveAdjustments(b.revisionId);
    await saveQuoteLines(adjuster, a.revisionId, { rows: [], archivedLineIds: [own.id] });
    await db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.id, b.projectId));

    await expect(restore(adjuster, "quote_line", own.id)).rejects.toThrow(ARCHIVED);
    expect((await lineById(own.id)).archivedAt).toBeInstanceOf(Date);
    expect((await lineById(partner!.id)).archivedAt).toBeInstanceOf(Date);
  });

  it("(r3) B 현재 차수가 상한이면 A 쪽 쌍 줄 복원 전부 거부(B 잠근 행으로 상한) · A · B 행 변경 0", async () => {
    const a = await makeProject("쌍A");
    const b = await makeProject("쌍B");
    const adjuster = await makeAdjuster([archiveMenu]);
    const own = await createPair(adjuster, a, b);
    const [partner] = await liveAdjustments(b.revisionId);
    await saveQuoteLines(adjuster, a.revisionId, { rows: [], archivedLineIds: [own.id] });
    await seedAdjustment(b.revisionId, -1_000);
    await seedAdjustment(b.revisionId, -2_000);

    await withCap(2, async () => {
      await expect(restore(adjuster, "quote_line", own.id)).rejects.toThrow("2줄 상한을 넘음 · 전부 거부");
    });
    expect((await lineById(own.id)).archivedAt).toBeInstanceOf(Date);
    expect((await lineById(partner!.id)).archivedAt).toBeInstanceOf(Date);
  });
});

describe("조정 줄 쌍 — 경합(T-07.2-12-03)", () => {
  it("(c1) A 저장(상대 B)과 B 저장(상대 A)을 ledger 경로 두 개로 afterLock에서 교차시켜도 40P01 없이 둘 다 서고 쌍이 일관된다", async () => {
    const a = await makeProject("쌍A");
    const b = await makeProject("쌍B");
    const adjuster = await makeAdjuster();
    const locked = deferred();
    const release = deferred();

    const first = saveProjectLedger(
      adjuster,
      a.projectId,
      { seenStatus: "in_progress", quoteLines: { revisionId: a.revisionId, rows: [pairRow(-10_000, b.projectId)] } },
      {
        afterLock: async () => {
          locked.resolve();
          await release.promise;
        },
      },
    );
    await locked.promise;
    const second = saveProjectLedger(adjuster, b.projectId, {
      seenStatus: "in_progress",
      quoteLines: { revisionId: b.revisionId, rows: [pairRow(-20_000, a.projectId)] },
    });
    await waitForLockWaiter(pool);
    release.resolve();
    const results = await Promise.allSettled([first, second]);
    for (const result of results) {
      if (result.status === "rejected") expect(pgCodes(result.reason)).not.toContain("40P01");
      expect(result.status).toBe("fulfilled");
    }

    const linesA = await liveAdjustments(a.revisionId);
    const linesB = await liveAdjustments(b.revisionId);
    expect(linesA).toHaveLength(2);
    expect(linesB).toHaveLength(2);
    const sum = [...linesA, ...linesB].reduce((total, line) => total + line.executionAmountKrw, 0);
    expect(sum).toBe(0);
    for (const line of linesA) expect(linesB.some((other) => other.adjustmentPairId === line.adjustmentPairId)).toBe(true);
  });

  it("(c2) 잠금 전에 읽은 쌍이 잠근 뒤 사라졌으면(다른 사람이 짝을 지움) `다른 사람이 먼저 바꿈 · 새로 고침`으로 전부 거부", async () => {
    const a = await makeProject("쌍A");
    const b = await makeProject("쌍B");
    const adjuster = await makeAdjuster();
    const own = await createPair(adjuster, a, b);
    const [partner] = await liveAdjustments(b.revisionId);
    const locked = deferred();
    const release = deferred();

    // B 쪽에서 짝을 지우는 저장이 두 프로젝트를 잡고 멈춘다.
    const archiving = saveProjectLedger(
      adjuster,
      b.projectId,
      { seenStatus: "in_progress", quoteLines: { revisionId: b.revisionId, rows: [], archivedLineIds: [partner!.id] } },
      {
        afterLock: async () => {
          locked.resolve();
          await release.promise;
        },
      },
    );
    await locked.promise;
    // A 쪽 수정은 잠금 전에 쌍(상대 B)을 읽고 잠금에서 기다린다.
    const editing = saveProjectLedger(adjuster, a.projectId, {
      seenStatus: "in_progress",
      quoteLines: { revisionId: a.revisionId, rows: [editOf(own, { itemName: "늦은 수정" })] },
    });
    await waitForLockWaiter(pool);
    release.resolve();
    const [archived, edited] = await Promise.allSettled([archiving, editing]);
    expect(archived.status).toBe("fulfilled");
    expect(edited.status === "rejected" && String(edited.reason)).toContain("다른 사람이 먼저 바꿈 · 새로 고침");
    expect((await lineById(own.id)).archivedAt).toBeInstanceOf(Date);
    expect((await lineById(own.id)).itemName).toBe("프로젝트 간 비용 이전");
  });
});
