import { afterEach, describe, expect, it, vi } from "vitest";
import { createAccount } from "@/domain/auth/accounts";
import { seoulToday } from "@/lib/dates";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { corpCards, expenses, files, orgUnits, projects, quoteLines, quoteRevisions, revenueEntries, teamMemberships, teams, users, vendors } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createVendor } from "@/domain/vendors";
import { createProject } from "@/domain/projects";
import { createCorpCard } from "@/domain/corp-cards";
import { createExpenseFromLines } from "@/domain/expenses";
import { assignTeam } from "@/domain/org";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { makePerson, teamIdByName } from "./approvals-fixtures";
import { DEMO_EMAIL_LIKE, DEMO_NAME_PREFIX, main, purgeDemoData, seedDemoData } from "@/scripts/demo-data";

const autoSettle = vi.hoisted(() => ({ swallow: false }));
vi.mock("@/domain/projects/auto-transition", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/projects/auto-transition")>();
  // swallow: 오류를 삼킨 경우를 흉내 낸다 — 아무것도 정산하지 못하고(앞 단계가 이미 바꾼 것도 되돌려) 빈 배열을 돌려준다.
  const swallowed = async (...args: Parameters<typeof actual.applyAutoSettlement>) => {
    const { db: database } = await import("@/db/client");
    const { projects: projectsTable } = await import("@/db/schema");
    const { inArray: inList } = await import("drizzle-orm");
    await database.update(projectsTable).set({ status: "in_progress" }).where(inList(projectsTable.id, args[0].projectIds ?? []));
    return [];
  };
  return { ...actual, applyAutoSettlement: (...args: Parameters<typeof actual.applyAutoSettlement>) => (autoSettle.swallow ? swallowed(...args) : actual.applyAutoSettlement(...args)) };
});

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
  autoSettle.swallow = false;
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

describe("scripts/demo-data 조직 격리 · 실제 사람 재사용", () => {
  async function demoOrg() {
    const [unit] = await db.select().from(orgUnits).where(eq(orgUnits.name, `${DEMO_NAME_PREFIX}견본본부`));
    const [team] = await db.select().from(teams).where(eq(teams.name, `${DEMO_NAME_PREFIX}견본팀`));
    return { unit, team };
  }

  it("견본 PM · 팀장 · 본부장과 프로젝트 · 팀 법인카드는 견본 본부 · 팀에 둔다(기획1팀에 견본 사람이 없다)", async () => {
    await seedDemoData();
    const { unit, team } = await demoOrg();
    expect(unit && team?.orgUnitId === unit.id).toBe(true);
    const memberships = await db.select({ teamId: teamMemberships.teamId, email: users.email }).from(teamMemberships).innerJoin(users, eq(users.id, teamMemberships.userId));
    const byEmail = Object.fromEntries(memberships.map((row) => [row.email, row.teamId]));
    for (const key of ["pm1", "pm2", "lead", "divisionHead"]) expect(byEmail[`demo-${key}@plant8-demo.test`.toLowerCase()], key).toBe(team?.id);
    const demoProjects = await db.select({ teamId: projects.teamId }).from(projects);
    expect(demoProjects.every((project) => project.teamId === team?.id)).toBe(true);
    const cards = await db.select({ kind: corpCards.kind, teamId: corpCards.teamId }).from(corpCards).where(eq(corpCards.kind, "team"));
    expect(cards.map((card) => card.teamId)).toEqual([team?.id]);
    const teamCost = await db.select({ attributedTeamId: expenses.attributedTeamId }).from(expenses).where(sql`${expenses.projectId} IS NULL`);
    expect(teamCost.map((row) => row.attributedTeamId)).toEqual([team?.id]);
  }, 120_000);

  it("실제 대표 · 경영관리 담당이 이미 있으면 견본으로 만들지 않고 제출 3건이 선다", async () => {
    await makePerson("실제대표", CEO_ROLE_ID, null);
    await makePerson("실제경영", DEFAULT_ROLE_ID, "경영관리팀");
    await seedDemoData();
    const demoUsers = await db.select({ email: users.email }).from(users).where(like(users.email, DEMO_EMAIL_LIKE));
    expect(demoUsers.map((user) => user.email).sort()).toEqual(["demo-divisionhead@plant8-demo.test", "demo-lead@plant8-demo.test", "demo-pm1@plant8-demo.test", "demo-pm2@plant8-demo.test"]);
    expect(await count("approval_instances")).toBe(3);
    expect((await db.select().from(expenses).where(sql`${expenses.number} IS NOT NULL`)).length).toBe(3);
  }, 120_000);

  it("실제 대표 · 경영관리 담당이 없으면 견본 둘을 만들고 제출 3건이 선다", async () => {
    await seedDemoData();
    const demoUsers = await db.select({ email: users.email }).from(users).where(like(users.email, DEMO_EMAIL_LIKE));
    expect(demoUsers.map((user) => user.email)).toEqual(expect.arrayContaining(["demo-ceo@plant8-demo.test", "demo-mgmt@plant8-demo.test"]));
    expect(await count("approval_instances")).toBe(3);
  }, 120_000);

  it("보관 안 된 견본 본부 · 팀이 이미 있으면 seed가 재사용한다", async () => {
    await seedDemoData();
    const before = await demoOrg();
    await purgeDemoData();
    // 이전 purge가 지웠으므로 직접 다시 만든 뒤 seed가 재사용하는지 본다.
    const { createOrgUnit, createTeam } = await import("@/domain/org");
    const unit = await createOrgUnit(SYSTEM_VIEWER, { name: `${DEMO_NAME_PREFIX}견본본부` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: unit.id, name: `${DEMO_NAME_PREFIX}견본팀` });
    await seedDemoData();
    const after = await demoOrg();
    expect(before.team?.id).not.toBe(team.id);
    expect(after.team?.id).toBe(team.id);
    expect((await db.select().from(teams).where(like(teams.name, `${DEMO_NAME_PREFIX}%`))).length).toBe(1);
  }, 180_000);

  it("purge는 참조가 없으면 견본 팀 · 본부를 지우고, 견본 아닌 소속이 남아 있으면 보관한다", async () => {
    await seedDemoData();
    await purgeDemoData();
    expect((await demoOrg()).team).toBeUndefined();
    expect((await demoOrg()).unit).toBeUndefined();

    await seedDemoData();
    const { team } = await demoOrg();
    const real = await makePerson("실제소속", DEFAULT_ROLE_ID, null);
    await assignTeam(SYSTEM_VIEWER, { userId: real.id, teamId: team?.id ?? "", effectiveFrom: "2026-01-01" });
    const result = await purgeDemoData();
    const after = await demoOrg();
    expect(after.team?.archivedAt).not.toBeNull();
    expect(after.unit?.archivedAt).not.toBeNull();
    expect(result.counts.archivedTeams).toBe(1);
    expect(result.counts.archivedOrgUnits).toBe(1);
  }, 180_000);
});

describe("scripts/demo-data purge 범위 · 안전", () => {
  it("접두어만 같은 견본 아닌 프로젝트 · 거래처 · 카드는 purge가 건드리지 않는다(정확한 이름 + 견본 사용자만)", async () => {
    const real = await makePerson("실제PM", DEFAULT_ROLE_ID, "기획1팀");
    const vendor = await createVendor(SYSTEM_VIEWER, { name: `${DEMO_NAME_PREFIX}직접 만든 거래처` });
    const project = await createProject(real, { clientId: vendor.vendor.id, teamId: await teamIdByName("기획1팀"), pmUserId: real.id, name: `${DEMO_NAME_PREFIX}직접 만든 프로젝트`, startDate: "2026-09-01", endDate: "2026-12-31" });
    const card = await createCorpCard(SYSTEM_VIEWER, { issuer: "직접카드사", numberLast4: "1234", label: `${DEMO_NAME_PREFIX}직접 만든 카드`, holderUserId: real.id });
    await seedDemoData();
    await purgeDemoData();
    expect((await db.select().from(projects).where(eq(projects.id, project.id))).length).toBe(1);
    expect((await db.select().from(vendors).where(eq(vendors.id, vendor.vendor.id))).length).toBe(1);
    expect((await db.select().from(corpCards).where(eq(corpCards.id, card.id))).length).toBe(1);
  }, 180_000);

  it("견본 거래처를 견본 아닌 프로젝트가 가리키면 그 거래처만 보관하고 purge는 롤백되지 않는다", async () => {
    await seedDemoData();
    const [client] = await db.select().from(vendors).where(eq(vendors.name, `${DEMO_NAME_PREFIX}한빛전자`));
    const real = await makePerson("실제PM", DEFAULT_ROLE_ID, "기획1팀");
    const realProject = await createProject(real, { clientId: client?.id ?? "", teamId: await teamIdByName("기획1팀"), pmUserId: real.id, name: "실제 프로젝트", startDate: "2026-09-01", endDate: "2026-12-31" });

    const result = await purgeDemoData();
    expect(result.counts.archivedVendors).toBe(1);
    expect(result.counts.projects).toBe(4);
    const [kept] = await db.select().from(vendors).where(eq(vendors.id, client?.id ?? ""));
    expect(kept?.archivedAt).not.toBeNull();
    expect((await db.select().from(vendors).where(like(vendors.name, `${DEMO_NAME_PREFIX}%`))).length).toBe(1);
    expect((await db.select().from(projects).where(eq(projects.id, realProject.id))).length).toBe(1);
  }, 180_000);

  it("프로젝트 경유로 지워지는 견본 아닌 사용자의 지출결의 수를 nonDemoExpenses로 따로 센다", async () => {
    await seedDemoData();
    const [line] = await db.select({ id: quoteLines.id }).from(quoteLines).where(eq(quoteLines.itemName, "철거·원상복구"));
    const realAdmin = await makePerson("실제관리자", SYSADMIN_ROLE_ID, null);
    const created = await createExpenseFromLines(realAdmin, { lineIds: [line?.id ?? ""] });
    expect(created.created).toHaveLength(1);

    const result = await purgeDemoData();
    expect(result.counts.nonDemoExpenses).toBe(1);
    expect(await count("expenses")).toBe(0);

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => void logs.push(args.join(" ")));
    await main(["seed"]);
    await main(["purge"]);
    expect(logs.join("\n")).toMatch(/demo purge complete:.*nonDemoExpenses=0/);
  }, 240_000);
});

describe("scripts/demo-data 리뷰 지적", () => {
  it("견본 형식(demo-… · archived-…)이 아닌 plant8-demo.test 계정은 purge가 건드리지 않고 seed도 막지 않는다", async () => {
    const employee = await createAccount(SYSTEM_VIEWER, { email: "employee@plant8-demo.test", name: "실제 직원", roleId: DEFAULT_ROLE_ID });
    const lookalike = await createAccount(SYSTEM_VIEWER, { email: "demo-extra@plant8-demo.test", name: "실제 직원2", roleId: DEFAULT_ROLE_ID });
    await expect(seedDemoData()).resolves.toMatchObject({ seeded: true });
    await purgeDemoData();
    const rows = await db.select({ id: users.id, archivedAt: users.archivedAt, email: users.email }).from(users).where(inArray(users.id, [employee.userId, lookalike.userId]));
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.archivedAt === null && !row.email.startsWith("archived-"))).toBe(true);
  }, 180_000);

  it("purge가 견본 팀 · 본부를 보관한 뒤에도 다음 seed가 복원해 재사용한다(이름 unique 위반 없음)", async () => {
    await seedDemoData();
    const [team] = await db.select().from(teams).where(eq(teams.name, `${DEMO_NAME_PREFIX}견본팀`));
    const real = await makePerson("실제소속", DEFAULT_ROLE_ID, null);
    await assignTeam(SYSTEM_VIEWER, { userId: real.id, teamId: team?.id ?? "", effectiveFrom: "2026-01-01" });
    await purgeDemoData();
    const [archived] = await db.select().from(teams).where(eq(teams.id, team?.id ?? ""));
    expect(archived?.archivedAt).not.toBeNull();

    await expect(seedDemoData()).resolves.toMatchObject({ seeded: true });
    const [restored] = await db.select().from(teams).where(eq(teams.name, `${DEMO_NAME_PREFIX}견본팀`));
    expect(restored?.id).toBe(team?.id);
    expect(restored?.archivedAt).toBeNull();
    const [unit] = await db.select().from(orgUnits).where(eq(orgUnits.name, `${DEMO_NAME_PREFIX}견본본부`));
    expect(unit?.archivedAt).toBeNull();
  }, 240_000);

  it("이름만 같고 사업자번호가 다른 거래처는 purge가 지우지 않는다", async () => {
    const lookalike = await createVendor(SYSTEM_VIEWER, { name: `${DEMO_NAME_PREFIX}한빛전자`, businessNo: "999-99-99999" });
    await seedDemoData();
    const result = await purgeDemoData();
    expect(result.counts.vendors).toBe(6);
    const left = await db.select().from(vendors).where(like(vendors.name, `${DEMO_NAME_PREFIX}%`));
    expect(left.map((vendor) => vendor.id)).toEqual([lookalike.vendor.id]);
  }, 180_000);

  it("자동 정산이 오류를 삼키고 빈 배열을 돌려주면 팀 비용 마커가 생기기 전에 seed가 throw한다", async () => {
    autoSettle.swallow = true;
    await expect(seedDemoData()).rejects.toThrow(/정산/);
    expect(await count("expenses")).toBe(0);
  }, 120_000);

  it("실제 대표의 퇴직일이 오늘이면 아직 활성이라 견본 대표를 만들지 않고, 어제면 만든다", async () => {
    const today = seoulToday();
    const yesterday = new Date(`${today}T00:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const real = await makePerson("실제대표", CEO_ROLE_ID, null);
    await db.update(users).set({ resignationDate: today }).where(eq(users.id, real.id));
    await seedDemoData();
    expect((await db.select().from(users).where(eq(users.email, "demo-ceo@plant8-demo.test"))).length).toBe(0);

    await purgeDemoData();
    await db.update(users).set({ resignationDate: yesterday.toISOString().slice(0, 10) }).where(eq(users.id, real.id));
    await seedDemoData();
    expect((await db.select().from(users).where(eq(users.email, "demo-ceo@plant8-demo.test"))).length).toBe(1);
  }, 240_000);
});

describe("scripts/demo-data 부분 seed", () => {
  it("견본 사용자는 있는데 마지막 산출물(팀 비용 작성 중 지출결의)이 없으면 partial seed 에러다", async () => {
    await seedDemoData();
    await db.delete(expenses).where(sql`${expenses.projectId} IS NULL`);
    await expect(seedDemoData()).rejects.toThrow(/partial seed/);
    await expect(main(["seed"])).rejects.toThrow(/partial seed/);
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

  it("APP_ENV가 미설정이거나 local · staging이 아니면 거부한다", async () => {
    for (const value of ["", "production", "dev"]) {
      vi.stubEnv("APP_ENV", value);
      await expect(main(["seed"]), `APP_ENV=${value}`).rejects.toThrow(/APP_ENV/);
    }
    vi.stubEnv("APP_ENV", "staging");
    await expect(main(["purge"])).resolves.toBeUndefined();
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
