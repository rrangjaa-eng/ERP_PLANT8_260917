import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, projects, quoteLines, teams } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createProject, listProjects } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines, type QuoteLineWriteRow } from "@/domain/quotes/lines";

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

  it("(t3) 조정 권한이 없는 담당 PM이 같은 조정 새 줄을 보내면 「조정 줄 · 경영관리만」으로 거부되고 DB는 그대로다", async () => {
    const { project, revisionId, pm } = await setupProject();
    await setStatus(project.id, "in_progress");

    await expect(saveQuoteLines(pm, revisionId, { rows: [adjustmentLine(-120_000)] })).rejects.toThrow("조정 줄 · 경영관리만");
    expect(await linesOf(revisionId)).toHaveLength(0);
  });
});
