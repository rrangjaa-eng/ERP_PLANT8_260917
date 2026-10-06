import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { corpCards, expenses, files, projects, quoteRevisions, revenueEntries, teamMemberships, users, vendors } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createVendor } from "@/domain/vendors";
import { createProject } from "@/domain/projects";
import { createCorpCard } from "@/domain/corp-cards";
import { makePerson, teamIdByName } from "./approvals-fixtures";
import { DEMO_EMAIL_LIKE, DEMO_NAME_PREFIX, main, purgeDemoData, seedDemoData } from "@/scripts/demo-data";

// 스테이징 화면 확인용 견본 데이터 CLI — 시드·멱등·삭제(purge)·운영 거부. 견본은 이름 접두어와 견본 사용자 이메일로만 고른다.

const namePrefix = `${DEMO_NAME_PREFIX}%`;

async function count(table: "users" | "vendors" | "projects" | "expenses" | "corp_cards" | "revenue_entries" | "files" | "approval_instances" | "quote_lines" | "quote_revisions" | "team_memberships"): Promise<number> {
  const result = await db.execute<{ n: string }>(sql.raw(`SELECT count(*)::text AS n FROM "${table}"`));
  return Number(result.rows[0]?.n ?? 0);
}

async function demoBusinessRows() {
  const demoProjects = await db.select({ id: projects.id }).from(projects).where(like(projects.name, namePrefix));
  const demoVendors = await db.select({ id: vendors.id }).from(vendors).where(like(vendors.name, namePrefix));
  const demoCards = await db.select({ id: corpCards.id }).from(corpCards).where(like(corpCards.label, namePrefix));
  const demoUsers = await db.select({ id: users.id }).from(users).where(like(users.email, DEMO_EMAIL_LIKE));
  return { projects: demoProjects.length, vendors: demoVendors.length, cards: demoCards.length, users: demoUsers.length };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("scripts/demo-data seed", () => {
  it("견본 사용자 6 · 거래처 6 · 프로젝트 4 · 법인카드 2 · 지출결의 6을 이름 접두어로 만든다", async () => {
    const result = await seedDemoData();
    expect(result.seeded).toBe(true);

    const demoUsers = await db.select().from(users).where(like(users.email, DEMO_EMAIL_LIKE));
    expect(demoUsers).toHaveLength(6);
    expect(demoUsers.every((user) => user.name.startsWith(DEMO_NAME_PREFIX) && user.archivedAt === null)).toBe(true);
    expect(demoUsers.every((user) => user.passwordIsTemporary)).toBe(true);

    const demoVendors = await db.select().from(vendors).where(like(vendors.name, namePrefix));
    expect(demoVendors).toHaveLength(6);
    expect(demoVendors.every((vendor) => vendor.accountNumberEncrypted === null)).toBe(true);

    const demoProjects = await db.select().from(projects).where(like(projects.name, namePrefix));
    expect(demoProjects).toHaveLength(4);
    expect(demoProjects.map((project) => project.status).sort()).toEqual(["bidding", "in_progress", "in_progress", "settling"]);
    expect(demoProjects.every((project) => project.startDate && project.endDate)).toBe(true);

    const demoCards = await db.select().from(corpCards).where(like(corpCards.label, namePrefix));
    expect(demoCards.map((card) => card.kind).sort()).toEqual(["personal", "team"]);

    const demoExpenses = await db
      .select({ number: expenses.number, projectId: expenses.projectId, note: expenses.note })
      .from(expenses)
      .where(inArray(expenses.projectId, demoProjects.map((project) => project.id)));
    expect(demoExpenses.filter((row) => row.number !== null)).toHaveLength(3);
    expect(demoExpenses.filter((row) => row.number === null)).toHaveLength(2);

    const teamExpenses = await db.select().from(expenses).where(and(sql`${expenses.projectId} IS NULL`, sql`${expenses.content} LIKE ${namePrefix}`));
    expect(teamExpenses).toHaveLength(1);

    const demoRevenue = await db.select().from(revenueEntries).where(inArray(revenueEntries.projectId, demoProjects.map((project) => project.id)));
    expect(demoRevenue.filter((row) => row.kind === "issue").length).toBeGreaterThanOrEqual(1);
    expect(demoRevenue.filter((row) => row.kind === "payment")).toHaveLength(1);

    const demoFiles = await db.select().from(files).where(like(files.originalName, namePrefix));
    expect(demoFiles).toHaveLength(3);
    expect(demoFiles.every((file) => file.objectKey.startsWith("demo/"))).toBe(true);

    expect(await count("approval_instances")).toBe(3);
  }, 120_000);

  it("두 번째 실행은 already seeded — 아무것도 더하지 않는다(멱등)", async () => {
    await seedDemoData();
    const before = { users: await count("users"), vendors: await count("vendors"), projects: await count("projects"), expenses: await count("expenses"), lines: await count("quote_lines") };

    const again = await seedDemoData();
    expect(again.seeded).toBe(false);

    expect({ users: await count("users"), vendors: await count("vendors"), projects: await count("projects"), expenses: await count("expenses"), lines: await count("quote_lines") }).toEqual(before);
  }, 120_000);
});

describe("scripts/demo-data purge", () => {
  it("purge 뒤 견본 사업 데이터가 0이고 견본 사용자는 로그인 못 하게 보관된다 — 두 번째 purge도 안전하고 다시 seed할 수 있다", async () => {
    await seedDemoData();

    const purged = await purgeDemoData();
    expect(purged.purged).toBe(true);
    expect(await demoBusinessRows()).toEqual({ projects: 0, vendors: 0, cards: 0, users: 0 });
    for (const table of ["projects", "expenses", "corp_cards", "revenue_entries", "files", "approval_instances", "quote_lines", "quote_revisions", "team_memberships"] as const) {
      expect(await count(table), table).toBe(0);
    }
    expect(await count("vendors")).toBe(0);
    const leftovers = await db.select().from(users).where(like(users.name, `${DEMO_NAME_PREFIX}%`));
    expect(leftovers).toHaveLength(6);
    expect(leftovers.every((user) => user.archivedAt !== null)).toBe(true);

    const again = await purgeDemoData();
    expect(again.purged).toBe(false);

    const reseeded = await seedDemoData();
    expect(reseeded.seeded).toBe(true);
    expect(await demoBusinessRows()).toMatchObject({ projects: 4, vendors: 6, cards: 2, users: 6 });
  }, 180_000);

  it("견본이 아닌 기존 데이터(사람 · 거래처 · 프로젝트 · 법인카드)는 purge가 건드리지 않는다", async () => {
    const real = await makePerson("실제PM", "role-pm", "기획1팀");
    const client = await createVendor(SYSTEM_VIEWER, { name: "실제클라이언트" });
    const project = await createProject(real, {
      clientId: client.vendor.id,
      teamId: await teamIdByName("기획1팀"),
      pmUserId: real.id,
      name: "실제 프로젝트",
      startDate: "2026-09-01",
      endDate: "2026-12-31",
    });
    const card = await createCorpCard(SYSTEM_VIEWER, { issuer: "실제카드사", numberLast4: "9999", label: "실제 법인카드", holderUserId: real.id });
    const membershipsBefore = (await db.select().from(teamMemberships).where(eq(teamMemberships.userId, real.id))).length;

    await seedDemoData();
    await purgeDemoData();

    const [realProject] = await db.select().from(projects).where(eq(projects.id, project.id));
    expect(realProject?.name).toBe("실제 프로젝트");
    expect((await db.select().from(vendors).where(eq(vendors.id, client.vendor.id))).length).toBe(1);
    expect((await db.select().from(corpCards).where(eq(corpCards.id, card.id))).length).toBe(1);
    const [realUser] = await db.select().from(users).where(eq(users.id, real.id));
    expect(realUser?.archivedAt).toBeNull();
    expect((await db.select().from(teamMemberships).where(eq(teamMemberships.userId, real.id))).length).toBe(membershipsBefore);
    expect((await db.select().from(quoteRevisions).where(eq(quoteRevisions.projectId, project.id))).length).toBe(1);
  }, 180_000);
});

describe("scripts/demo-data main", () => {
  it("운영(APP_ENV=prod)에서는 seed · purge 모두 거부하고 아무것도 만들지 않는다", async () => {
    vi.stubEnv("APP_ENV", "prod");
    await expect(main(["seed"])).rejects.toThrow(/운영/);
    await expect(main(["purge"])).rejects.toThrow(/운영/);
    expect(await count("projects")).toBe(0);
    expect(await count("users")).toBe(0);
  });

  it("알 수 없는 인자는 거부한다", async () => {
    await expect(main(["nuke"])).rejects.toThrow(/seed\|purge/);
  });

  it("개수 요약만 출력하고 비밀번호는 출력하지 않는다", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => void logs.push(args.join(" ")));
    await main(["seed"]);
    const output = logs.join("\n");
    expect(output).toMatch(/demo seed complete: users=6 vendors=6 projects=4/);
    expect(output).not.toMatch(/password|비밀번호/i);
    await main(["seed"]);
    expect(logs.join("\n")).toContain("already seeded");
  }, 120_000);
});
