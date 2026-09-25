import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, projects, quoteLines, settingsSimple, teams } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createProject, listProjects } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines, type QuoteLineWriteRow } from "@/domain/quotes/lines";
import { restore } from "@/domain/archive";
import { listArchivedAcrossEntities } from "@/repositories/archive";
import { log } from "@/lib/log";

// 04-13(D-83 · D-48 · EXP-14) — 견적 줄의 종류 셋(견적 줄 · 견적 외 비용 · 조정). 조정 줄은 권한표
// `projects.adjustment` 쓰기가 있는 사람만 상태와 무관하게 만들고 고친다.

async function setupProject() {
  const client = await insertVendor(SYSTEM_VIEWER, {
    name: `거래처-${randomUUID()}`,
    normalizedName: `거래처-${randomUUID()}`,
  });
  const { userId: pmUserId } = await createAccount(SYSTEM_VIEWER, {
    email: `pm-${randomUUID()}@example.test`,
    name: "종류 PM",
    roleId: DEFAULT_ROLE_ID,
  });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
  if (!subcategory) throw new Error("시드된 quote_subcategory 코드 항목이 없습니다");
  const project = await createProject(SYSTEM_VIEWER, {
    clientId: client.id,
    teamId: team.id,
    pmUserId,
    name: `종류-${randomUUID()}`,
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("1차 차수가 없습니다");
  const pm: Viewer = { id: pmUserId, roleId: DEFAULT_ROLE_ID };
  return { project, revisionId: revision.id, subcategory: subcategory.value, pm };
}

// 경영관리 — 시드 계급에 없어 테스트가 새 계급을 만들고 권한을 준다(메뉴 권한은 인자로).
async function makeViewer(menus: { menu: string; action: "view" | "write" }[]): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `종류 계급-${randomUUID()}` });
  const { userId } = await createAccount(SYSTEM_VIEWER, {
    email: `kind-${randomUUID()}@example.test`,
    name: "종류 테스트 사람",
    roleId: role.id,
  });
  for (const entry of menus) {
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: entry.menu, action: entry.action, allowed: true });
  }
  for (const infoItem of ["project.value", "quote.amount"]) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  }
  return { id: userId, roleId: role.id };
}

const adjusterMenus = [
  { menu: "projects", action: "view" as const },
  { menu: "projects.adjustment", action: "write" as const },
];

async function setStatus(projectId: string, status: string) {
  await db.update(projects).set({ status }).where(eq(projects.id, projectId));
}

async function linesOf(revisionId: string) {
  return db.select().from(quoteLines).where(eq(quoteLines.revisionId, revisionId));
}

function adjustmentLine(execution: number, patch: Partial<QuoteLineWriteRow> = {}): QuoteLineWriteRow {
  return {
    id: randomUUID(),
    isNew: true,
    lineKind: "adjustment",
    subcategory: "",
    itemName: "외화 송금 수수료",
    unitPrice: { currency: "KRW", amount: 0, fxRate: 1 },
    execution: { currency: "KRW", amount: execution, fxRate: 1 },
    ...patch,
  };
}

async function listedExecution(projectNumber: string): Promise<number> {
  const [row] = await listProjects(SYSTEM_VIEWER, { filter: { search: projectNumber } });
  if (!row) throw new Error("목록에 프로젝트가 없습니다");
  // B-18 — 목록 SUM이 문자열로 올 수 있어 값만 숫자로 비교한다(타입 단언은 04-17 C-01).
  return Number(row.executionAmountKrw);
}

describe("조정 줄 트레이서(04-13 Task 1 · D-83, 실제 Postgres)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(t1) 조정 권한만 있는 경영관리가 완료 프로젝트에 조정 줄(실행가 −120,000)을 저장한다 — 견적가 0 · 수량 1 · 단가 0 · 차익 120,000", async () => {
    const { project, revisionId } = await setupProject();
    await setStatus(project.id, "completed");
    const adjuster = await makeViewer(adjusterMenus);
    const line = adjustmentLine(-120_000);

    await saveQuoteLines(adjuster, revisionId, { rows: [line] });

    const [row] = await linesOf(revisionId);
    expect(row?.id).toBe(line.id);
    expect(row?.lineKind).toBe("adjustment");
    expect(row?.subcategory).toBe("adjustment");
    expect(row?.quoteAmountKrw).toBe(0);
    expect(Number(row?.quantity)).toBe(1);
    expect(row?.unitPriceAmountKrw).toBe(0);
    expect(row?.executionAmountKrw).toBe(-120_000);
    expect(row?.profitKrw).toBe(120_000);
  });

  it("(t2) 조정 줄 저장 뒤 목록 실행가가 조정 줄만큼 바뀐다(DB 집계)", async () => {
    const { project, revisionId, subcategory } = await setupProject();
    await saveQuoteLines(SYSTEM_VIEWER, revisionId, {
      rows: [
        {
          id: randomUUID(),
          isNew: true,
          subcategory,
          itemName: "견적 줄",
          unitPrice: { currency: "KRW", amount: 1_000_000, fxRate: 1 },
          execution: { currency: "KRW", amount: 400_000, fxRate: 1 },
        },
      ],
    });
    expect(await listedExecution(project.number)).toBe(400_000);
    await setStatus(project.id, "completed");

    await saveQuoteLines(await makeViewer(adjusterMenus), revisionId, { rows: [adjustmentLine(-120_000)] });

    expect(await listedExecution(project.number)).toBe(280_000);
  });

  it("(t3) 조정 권한이 없는 담당 PM이 같은 조정 새 줄을 보내면 「조정 줄 · 경영관리만」으로 거부되고 DB는 그대로다 · write.denied 한 번", async () => {
    const { project, revisionId, pm } = await setupProject();
    await setStatus(project.id, "in_progress");
    const warn = vi.spyOn(log, "warn");

    await expect(saveQuoteLines(pm, revisionId, { rows: [adjustmentLine(-120_000)] })).rejects.toThrow("조정 줄 · 경영관리만");
    expect(await linesOf(revisionId)).toHaveLength(0);
    expectOneDenied(warn, { viewerId: pm.id, projectId: project.id, revisionId });
  });
});

// ── Task 2 ────────────────────────────────────────────────────────────────────────────────────────────

type SeedKind = "quote" | "out_of_quote" | "adjustment";

// 줄을 DB에 바로 둔다(저장 경로와 무관한 준비). 조정·견적 외 비용 줄은 서버 저장 규칙대로 견적가 0.
async function seedLine(revisionId: string, kind: SeedKind, opts: { subcategory?: string; execution?: number; archived?: boolean } = {}) {
  const unitPrice = kind === "quote" ? 100_000 : 0;
  const execution = opts.execution ?? 50_000;
  const [row] = await db
    .insert(quoteLines)
    .values({
      revisionId,
      subcategory: kind === "quote" ? (opts.subcategory ?? "sub-a") : kind,
      itemName: `${kind} 줄`,
      unitPriceAmountKrw: unitPrice,
      executionAmountKrw: execution,
      quoteAmountKrw: unitPrice,
      profitKrw: unitPrice - execution,
      lineKind: kind,
      archivedAt: opts.archived ? new Date() : null,
      archivedBy: opts.archived ? SYSTEM_VIEWER.id : null,
    })
    .returning();
  if (!row) throw new Error("줄 준비 실패");
  return row;
}

function asInput(row: typeof quoteLines.$inferSelect, patch: Partial<QuoteLineWriteRow> = {}): QuoteLineWriteRow {
  return {
    id: row.id,
    version: row.version,
    subcategory: row.subcategory,
    itemName: row.itemName,
    quantity: Number(row.quantity),
    unitPrice: { currency: "KRW", amount: row.unitPriceAmountKrw, fxRate: 1 },
    execution: { currency: "KRW", amount: row.executionAmountKrw, fxRate: 1 },
    lineStatus: row.lineStatus,
    ...patch,
  };
}

async function reload(id: string) {
  const [row] = await db.select().from(quoteLines).where(eq(quoteLines.id, id));
  if (!row) throw new Error("줄이 없습니다");
  return row;
}

async function activeCount(revisionId: string): Promise<number> {
  const rows = await db
    .select({ id: quoteLines.id })
    .from(quoteLines)
    .where(and(eq(quoteLines.revisionId, revisionId), isNull(quoteLines.archivedAt)));
  return rows.length;
}

function deniedCalls(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.filter(([event]) => event === "write.denied").map(([, fields]) => fields as Record<string, unknown>);
}

const AMOUNT_KEY = /amount|krw|execution|price|profit/i;

// 04-13 검토 S1 — 조정 줄 규칙 거부는 denyWrite 한 지점을 지나 write.denied 한 줄(금액 키 없음)을 남긴다.
function expectOneDenied(spy: { mock: { calls: unknown[][] } }, ids: { viewerId: string; projectId: string; revisionId: string }) {
  const denied = deniedCalls(spy);
  expect(denied).toHaveLength(1);
  expect(denied[0]).toMatchObject({ ...ids, rule: "project.line-edit" });
  expect(Object.keys(denied[0]!).filter((key) => AMOUNT_KEY.test(key))).toEqual([]);
}

function newRow(kind: SeedKind, execution: number, patch: Partial<QuoteLineWriteRow> = {}): QuoteLineWriteRow {
  return {
    id: randomUUID(),
    isNew: true,
    lineKind: kind,
    subcategory: kind === "quote" ? "sub-a" : "",
    itemName: `새 ${kind} 줄`,
    unitPrice: { currency: "KRW", amount: 100_000, fxRate: 1 },
    execution: { currency: "KRW", amount: execution, fxRate: 1 },
    ...patch,
  };
}

const CAP_KEY = "quote_line.max_per_revision";

async function withCap<T>(cap: number, run: () => Promise<T>): Promise<T> {
  const [before] = await db.select().from(settingsSimple).where(eq(settingsSimple.key, CAP_KEY));
  await db
    .insert(settingsSimple)
    .values({ key: CAP_KEY, value: cap })
    .onConflictDoUpdate({ target: settingsSimple.key, set: { value: cap } });
  try {
    return await run();
  } finally {
    if (before) await db.update(settingsSimple).set({ value: before.value }).where(eq(settingsSimple.key, CAP_KEY));
    else await db.delete(settingsSimple).where(eq(settingsSimple.key, CAP_KEY));
  }
}

describe("조정 줄 권한 · PM 거부 · 보관 · 복원(04-13 Task 2 · D-83)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(k1) 담당 PM이 조정 줄 실행가를 바꾼 페이로드는 배치 전부 거부되고 write.denied가 한 번, 금액 키가 없다", async () => {
    const { project, revisionId, pm } = await setupProject();
    const quote = await seedLine(revisionId, "quote");
    const adjustment = await seedLine(revisionId, "adjustment", { execution: -120_000 });
    await setStatus(project.id, "in_progress");
    const warn = vi.spyOn(log, "warn");

    await expect(
      saveQuoteLines(pm, revisionId, {
        rows: [
          asInput(quote, { itemName: "같이 고친 견적 줄" }),
          asInput(adjustment, { execution: { currency: "KRW", amount: -1, fxRate: 1 } }),
        ],
      }),
    ).rejects.toThrow("조정 줄 · 경영관리만");

    expect((await reload(quote.id)).itemName).toBe(quote.itemName);
    expect((await reload(adjustment.id)).executionAmountKrw).toBe(-120_000);
    const denied = deniedCalls(warn);
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({ viewerId: pm.id, rule: "project.line-edit", projectId: project.id, revisionId });
    expect(Object.keys(denied[0]!).filter((key) => AMOUNT_KEY.test(key))).toEqual([]);
  });

  it("(k2) 담당 PM의 조정 줄 보관 요청은 거부되고(write.denied 한 번), 경영관리의 조정 줄 보관은 통과해 보관함에 「견적 줄」로 보인다", async () => {
    const { project, revisionId, pm } = await setupProject();
    const adjustment = await seedLine(revisionId, "adjustment", { execution: -10_000 });
    await setStatus(project.id, "completed");
    const warn = vi.spyOn(log, "warn");

    await expect(saveQuoteLines(pm, revisionId, { rows: [], archivedLineIds: [adjustment.id] })).rejects.toThrow("조정 줄 · 경영관리만");
    expect((await reload(adjustment.id)).archivedAt).toBeNull();
    expectOneDenied(warn, { viewerId: pm.id, projectId: project.id, revisionId });
    warn.mockRestore();

    await saveQuoteLines(await makeViewer(adjusterMenus), revisionId, { rows: [], archivedLineIds: [adjustment.id] });
    expect((await reload(adjustment.id)).archivedAt).toBeInstanceOf(Date);
    const archived = await listArchivedAcrossEntities(SYSTEM_VIEWER);
    expect(archived.find((item) => item.id === adjustment.id)).toMatchObject({ entity: "quote_line", label: "견적 줄" });
  });

  it("(k3) 완료 프로젝트의 보관된 조정 줄 — 조정 권한 + 보관함 권한이면 복원, 보관함·프로젝트 쓰기만이면 거부·DB 무변경(OV-2)", async () => {
    const { project, revisionId } = await setupProject();
    const first = await seedLine(revisionId, "adjustment", { execution: -10_000, archived: true });
    const second = await seedLine(revisionId, "adjustment", { execution: -20_000, archived: true });
    await setStatus(project.id, "completed");
    const archiveMenu = { menu: "admin.archive", action: "write" as const };
    const adjuster = await makeViewer([...adjusterMenus, archiveMenu]);
    const noAdjust = await makeViewer([{ menu: "projects", action: "write" }, archiveMenu]);

    await restore(adjuster, "quote_line", first.id);
    expect((await reload(first.id)).archivedAt).toBeNull();

    await expect(restore(noAdjust, "quote_line", second.id)).rejects.toThrow("조정 줄 · 경영관리만");
    expect((await reload(second.id)).archivedAt).toBeInstanceOf(Date);
  });

  it("(k4) 상한 3 · 줄 3이면 경영관리의 조정 줄 추가도 거부된다(조정 줄도 센다)", async () => {
    const { project, revisionId } = await setupProject();
    await seedLine(revisionId, "quote");
    await seedLine(revisionId, "quote");
    await seedLine(revisionId, "adjustment", { execution: -1_000 });
    await setStatus(project.id, "completed");
    const adjuster = await makeViewer(adjusterMenus);

    await withCap(3, async () => {
      await expect(saveQuoteLines(adjuster, revisionId, { rows: [adjustmentLine(-5_000)] })).rejects.toThrow("3줄 상한을 넘음 · 전부 거부");
    });
    expect(await activeCount(revisionId)).toBe(3);
  });

  it("(k5) 조정 권한만 있는 사람이 견적 줄을 바꾸면 거부된다 · write.denied 한 번", async () => {
    const { project, revisionId } = await setupProject();
    const quote = await seedLine(revisionId, "quote");
    await setStatus(project.id, "in_progress");
    const adjuster = await makeViewer(adjusterMenus);
    const warn = vi.spyOn(log, "warn");

    await expect(saveQuoteLines(adjuster, revisionId, { rows: [asInput(quote, { note: "경영관리가 고침" })] })).rejects.toThrow(
      "견적 줄 · 쓰기 권한 없음",
    );
    expect((await reload(quote.id)).note).toBeNull();
    expectOneDenied(warn, { viewerId: adjuster.id, projectId: project.id, revisionId });
  });

  it("(k6) 조정 권한만 있는 사람의 새 견적 줄 · 견적 줄 보관은 각각 거부 · DB 무변경 · write.denied 한 번(GAP 2)", async () => {
    const { project, revisionId } = await setupProject();
    const quote = await seedLine(revisionId, "quote");
    await setStatus(project.id, "in_progress");
    const adjuster = await makeViewer(adjusterMenus);

    const insertWarn = vi.spyOn(log, "warn");
    await expect(saveQuoteLines(adjuster, revisionId, { rows: [newRow("quote", 10_000)] })).rejects.toThrow("견적 줄 · 쓰기 권한 없음");
    expect(deniedCalls(insertWarn)).toHaveLength(1);
    expect(await activeCount(revisionId)).toBe(1);
    insertWarn.mockRestore();

    const archiveWarn = vi.spyOn(log, "warn");
    await expect(saveQuoteLines(adjuster, revisionId, { rows: [], archivedLineIds: [quote.id] })).rejects.toThrow("견적 줄 · 쓰기 권한 없음");
    expect(deniedCalls(archiveWarn)).toHaveLength(1);
    expect((await reload(quote.id)).archivedAt).toBeNull();
  });

  it("(k7) 기존 조정 줄에 lineKind quote를 실어 보내면 「줄 종류는 바뀌지 않음 · 새로 고침」으로 거부되고 종류는 그대로다", async () => {
    const { project, revisionId } = await setupProject();
    const adjustment = await seedLine(revisionId, "adjustment", { execution: -10_000 });
    await setStatus(project.id, "in_progress");

    await expect(
      saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [asInput(adjustment, { lineKind: "quote", itemName: "견적 줄로 바꾸기" })] }),
    ).rejects.toThrow("줄 종류는 바뀌지 않음 · 새로 고침");
    const after = await reload(adjustment.id);
    expect(after.lineKind).toBe("adjustment");
    expect(after.itemName).toBe(adjustment.itemName);
  });

  it("(k8) 소분류를 빈 값으로 보낸 새 조정 줄은 line_kind adjustment · 소분류 칸 = 종류 값으로 저장된다(GAP 6)", async () => {
    const { revisionId } = await setupProject();
    const line = adjustmentLine(-3_000, { subcategory: "" });

    await saveQuoteLines(await makeViewer(adjusterMenus), revisionId, { rows: [line] });

    const row = await reload(line.id);
    expect(row.lineKind).toBe("adjustment");
    expect(row.subcategory).toBe("adjustment");
  });

  it("(k9) 정산·완료 프로젝트에서 경영관리의 조정 줄 추가가 통과한다", async () => {
    for (const status of ["settling", "completed"]) {
      const { project, revisionId } = await setupProject();
      await setStatus(project.id, status);
      await saveQuoteLines(await makeViewer(adjusterMenus), revisionId, { rows: [adjustmentLine(-7_000)] });
      expect(await activeCount(revisionId)).toBe(1);
    }
  });
});

describe("견적 외 비용 줄(04-13 Task 2 · D-48 · EXP-14 · 사용자 D10·D12)", () => {
  it("(o1) 진행에서 담당 PM의 견적 외 비용 새 줄 실행가 −50,000은 통과하고 서버가 수량 1 · 단가 0 · 견적가 0 · 소분류 = 종류 값으로 저장한다", async () => {
    const { project, revisionId, pm } = await setupProject();
    await setStatus(project.id, "in_progress");
    const line = newRow("out_of_quote", -50_000, { quantity: 3 });

    await saveQuoteLines(pm, revisionId, { rows: [line] });

    const row = await reload(line.id);
    expect(row.lineKind).toBe("out_of_quote");
    expect(row.subcategory).toBe("out_of_quote");
    expect(Number(row.quantity)).toBe(1);
    expect(row.unitPriceAmountKrw).toBe(0);
    expect(row.quoteAmountKrw).toBe(0);
    expect(row.executionAmountKrw).toBe(-50_000);
    expect(row.profitKrw).toBe(50_000);
  });

  it("(o2) 정산에서 담당 PM의 견적 외 비용 새 줄(실행가 −30,000)은 통과하고 견적가 0이다(사용자 D10·D12)", async () => {
    const { project, revisionId, pm } = await setupProject();
    await setStatus(project.id, "settling");
    const line = newRow("out_of_quote", -30_000);

    await saveQuoteLines(pm, revisionId, { rows: [line] });

    const row = await reload(line.id);
    expect(row.quoteAmountKrw).toBe(0);
    expect(row.executionAmountKrw).toBe(-30_000);
  });

  it("(o3) 정산에서 기존 견적 외 비용 줄 보관은 「정산 · 줄 삭제·이동 없음」으로 거부된다(D10)", async () => {
    const { project, revisionId, pm } = await setupProject();
    const line = await seedLine(revisionId, "out_of_quote", { execution: -1_000 });
    await setStatus(project.id, "settling");

    await expect(saveQuoteLines(pm, revisionId, { rows: [], archivedLineIds: [line.id] })).rejects.toThrow("정산 · 줄 삭제·이동 없음");
    expect((await reload(line.id)).archivedAt).toBeNull();
  });

  it("(o4) 견적 줄 실행가 음수는 여전히 형식 오류다", async () => {
    const { project, revisionId, pm } = await setupProject();
    await setStatus(project.id, "in_progress");

    await expect(saveQuoteLines(pm, revisionId, { rows: [newRow("quote", -1)] })).rejects.toThrow("[실행가]");
    expect(await activeCount(revisionId)).toBe(0);
  });
});
