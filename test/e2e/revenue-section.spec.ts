import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { db } from "@/db/client";
import { codeItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { addDays, kstToday } from "@/lib/kst-date";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor } from "@/repositories/vendors";
import { listPermissions, listVisibility, upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { saveRevenue, type MoneyInputDto } from "@/domain/revenue";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// Phase 4 Task 3 ⑤ — 매출 섹션 E2E: 발행·입금 줄(경영관리 쓰기) → 입금 셀 둘째 줄 공급가액 +
// 합계 행 미수 표시 확인 → 기획 PM에게는 두 표가 DOM에 없음(부재, 숨김이
// 아니다). "경영관리"는 SEED_ROLES 5종에 없어 role-ceo에 이 스펙이
// 직접 권한을 부여한다(D-57, domain/permissions/menus.ts 04-02 주석과 같은 결).
// 04-16(D-84) — 계약 금액은 입력 칸이 없고 고객 승인된 현재 차수의 견적 합계다.
async function grantFinanceRole() {
  await upsertPermission(SYSTEM_VIEWER, { roleId: "role-ceo", menu: "projects", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: "role-ceo", menu: "projects.revenue", action: "write", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "project.value", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "revenue.issued_amount", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "revenue.paid_amount", visible: true });
}

// 04-49 — 경영관리 계정으로 발행 줄 하나를 저장해 둔 프로젝트를 연다(1280).
async function openWithIssuedEntry(page: Page): Promise<string> {
  const today = kstToday(new Date());
  const vendor = await insertVendor(SYSTEM_VIEWER, {
    name: `E2E매출폭규칙-${randomUUID()}`,
    normalizedName: `e2e매출폭규칙-${randomUUID()}`,
  });
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
  const pm = await createAccount(SYSTEM_VIEWER, { email: `e2e-rev-${randomUUID()}@example.test`, name: "E2E 매출 PM", roleId: DEFAULT_ROLE_ID });
  await assignTeam(SYSTEM_VIEWER, { userId: pm.userId, teamId: team.id, effectiveFrom: today });
  const project = await createProject(SYSTEM_VIEWER, {
    clientId: vendor.id,
    teamId: team.id,
    pmUserId: pm.userId,
    name: `E2E매출폭-${randomUUID().slice(0, 8)}`,
    startDate: today,
    endDate: addDays(today, 10),
  });
  await grantFinanceRole();
  const finance = await createFixtureUser({ roleId: "role-ceo" });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(finance.email);
  await page.getByLabel("비밀번호").fill(finance.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  const projectUrl = `/projects/${project.id}`;
  await page.goto(projectUrl);
  await page.getByRole("button", { name: "발행 줄 추가" }).click();
  await page.getByLabel("발행일").fill("2026-09-01");
  await page.getByLabel("발행액").fill("3000000");
  await page.getByRole("button", { name: /일괄 저장/ }).click();
  await expect(page.getByText("바뀐 칸 없음", { exact: true })).toBeVisible();
  return projectUrl;
}

function isServerAction(request: { method: () => string; headers: () => Record<string, string> }) {
  return request.method() === "POST" && request.headers()["next-action"] !== undefined;
}

// 04-16 — 계약 금액 한 줄(KvList)의 값 칸.
function contractValue(page: Page) {
  return page.locator("dt", { hasText: /^계약 금액$/ }).locator("xpath=following-sibling::dd[1]");
}

// 04-16 Task 3 — 매출 섹션과 캡션으로 찾은 표(읽기 표·격자 공통).
function revenueSection(page: Page) {
  return page.locator("section", { has: page.getByRole("heading", { name: "매출", exact: true }) });
}

function revenueTable(page: Page, caption: "발행 줄" | "입금 줄") {
  return page.locator("table", { has: page.locator("caption", { hasText: new RegExp(`^${caption}$`) }) });
}

const krw = (amount: number): MoneyInputDto => ({ currency: "KRW", amount, fxRate: 1 });
const FOREIGN_PAID: MoneyInputDto = { currency: "USD", amount: 4400, fxRate: 1318.1818 };

type SeedEntry = { entryDate: string; amount: MoneyInputDto; note?: string };

// 04-16 Task 3 — 담당 PM 계정·프로젝트·견적 줄·발행·입금 줄을 도메인으로 심는다(화면 입력은 04-41 범위).
async function seedRevenueProject(opts: {
  pmRoleId?: string;
  quoteAmounts?: number[];
  issued?: SeedEntry[];
  paid?: SeedEntry[];
}): Promise<{ projectUrl: string; email: string; password: string }> {
  const today = kstToday(new Date());
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E매출표-${randomUUID()}`, normalizedName: `e2e매출표-${randomUUID()}` });
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
  const email = `e2e-rev-table-${randomUUID()}@example.test`;
  const pm = await createAccount(SYSTEM_VIEWER, { email, name: "E2E 매출표 PM", roleId: opts.pmRoleId ?? DEFAULT_ROLE_ID });
  await assignTeam(SYSTEM_VIEWER, { userId: pm.userId, teamId: team.id, effectiveFrom: today });
  const project = await createProject(SYSTEM_VIEWER, {
    clientId: vendor.id,
    teamId: team.id,
    pmUserId: pm.userId,
    name: `E2E매출표-${randomUUID().slice(0, 8)}`,
    startDate: today,
    endDate: addDays(today, 10),
  });
  if (opts.quoteAmounts && opts.quoteAmounts.length > 0) {
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("1차 차수가 없습니다");
    const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
    if (!subcategory) throw new Error("소분류 코드가 없습니다");
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
      rows: opts.quoteAmounts.map((amount, index) => ({
        id: randomUUID(),
        isNew: true as const,
        lineKind: "quote" as const,
        subcategory: subcategory.value,
        itemName: `매출표 줄 ${index + 1}`,
        quantity: 1,
        unitPrice: krw(amount),
        execution: krw(0),
      })),
    });
  }
  if (opts.issued || opts.paid) {
    await saveRevenue(SYSTEM_VIEWER, project.id, { issuedEntries: opts.issued, paidEntries: opts.paid });
  }
  return { projectUrl: `/projects/${project.id}`, email, password: pm.tempPassword };
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function cssColor(page: Page, token: string): Promise<string> {
  return page.evaluate((value) => {
    const probe = document.createElement("span");
    probe.style.color = value;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, `var(${token})`);
}

test.describe("계약 금액 — 고객 승인된 현재 차수 합계 (04-16 Task 1 · D-84)", () => {
  test("입력 칸이 없고, 승인 전 `—` · 승인 뒤 견적 합계 · 새 차수 뒤 `—` + `2차 고객 승인 전`", async ({ page }) => {
    const today = kstToday(new Date());
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E계약파생-${randomUUID()}`, normalizedName: `e2e계약파생-${randomUUID()}` });
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
    const email = `e2e-contract-${randomUUID()}@example.test`;
    const pm = await createAccount(SYSTEM_VIEWER, { email, name: "E2E 계약 PM", roleId: DEFAULT_ROLE_ID });
    await assignTeam(SYSTEM_VIEWER, { userId: pm.userId, teamId: team.id, effectiveFrom: today });
    const project = await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId: team.id, pmUserId: pm.userId, name: `E2E계약-${randomUUID().slice(0, 8)}` });
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("1차 차수가 없습니다");
    const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
    if (!subcategory) throw new Error("소분류 코드가 없습니다");
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
      rows: [1_000_000, 500_000].map((amount, index) => ({
        id: randomUUID(),
        isNew: true as const,
        lineKind: "quote" as const,
        subcategory: subcategory.value,
        itemName: `계약 줄 ${index + 1}`,
        quantity: 1,
        unitPrice: { currency: "KRW" as const, amount, fxRate: 1 },
        execution: { currency: "KRW" as const, amount: 0, fxRate: 1 },
      })),
    });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호").fill(pm.tempPassword);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto(`/projects/${project.id}`);

    await expect(contractValue(page)).toContainText("—");
    await expect(contractValue(page)).toContainText("1차 고객 승인 전");
    await expect(page.getByRole("textbox", { name: "계약 금액" })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "계약 금액 통화" })).toHaveCount(0);

    await page.getByRole("button", { name: "고객 승인 표시", exact: true }).click();
    const approval = page.getByRole("dialog", { name: "고객 승인 표시", exact: true });
    await expect(approval).toBeVisible();
    const approved = page.waitForResponse((response) => isServerAction(response.request()));
    await approval.getByRole("button", { name: /고객 승인 표시/ }).click();
    await approved;
    await expect(approval).toBeHidden();

    await expect(contractValue(page)).toContainText("1,500,000");
    await expect(contractValue(page)).toContainText("부가세 10% 150,000 · 합계 1,650,000 · 1차 고객 승인 합계");

    await page.getByRole("button", { name: "복사해 새 차수" }).click();
    const newRevision = page.getByRole("dialog", { name: "복사해 새 차수" });
    await expect(newRevision).toBeVisible();
    const created = page.waitForResponse((response) => isServerAction(response.request()));
    await newRevision.getByRole("button", { name: /새 차수 만들기/ }).click();
    await created;
    await expect(page.getByText(`${project.number} · 상세 견적 2차`, { exact: true })).toBeVisible();

    await expect(contractValue(page)).toContainText("—");
    await expect(contractValue(page)).toContainText("2차 고객 승인 전");
    await expect(contractValue(page)).not.toContainText("1,500,000");
  });
});

test.describe("매출 섹션 (Phase 4 Task 3)", () => {
  test("발행·입금(경영관리) → 미수 표시 → PM에게는 발행 읽기 표만 있고 입금 표·미수는 부재(D-85)", async ({ page }) => {
    const vendor = await insertVendor(SYSTEM_VIEWER, {
      name: `E2E매출클라이언트-${Date.now()}`,
      normalizedName: `e2e매출클라이언트-${Date.now()}`,
    });
    const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    await grantFinanceRole();
    const finance = await createFixtureUser({ roleId: "role-ceo" });

    // PM: 프로젝트 등록
    await page.goto("/login");
    await page.getByLabel("이메일").fill(pm.email);
    await page.getByLabel("비밀번호").fill(pm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/projects?new=1");
    await page.getByLabel("클라이언트").selectOption({ label: vendor.name });
    await page.getByLabel("팀").selectOption({ index: 1 });
    await page.getByLabel("담당 PM").selectOption({ index: 1 });
    const projectName = `E2E수익섹션-${Date.now()}`;
    await page.getByLabel("프로젝트명").fill(projectName);
    await page.getByRole("button", { name: "프로젝트 등록" }).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    const projectUrl = page.url();

    // 로그아웃 후 경영관리(role-ceo)로 로그인
    await page.goto("/account");
    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("이메일").fill(finance.email);
    await page.getByLabel("비밀번호").fill(finance.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto(projectUrl);
    await page.getByRole("button", { name: "발행 줄 추가" }).click();
    await page.getByLabel("발행일").fill("2026-09-01");
    await page.getByLabel("발행액").fill("10000000");

    await page.getByRole("button", { name: "입금 줄 추가" }).click();
    await page.getByLabel("입금일").fill("2026-09-05");
    await page.getByLabel("입금액").fill("5500000");

    await page.getByRole("button", { name: /일괄 저장/ }).click();

    // 입금 셀 둘째 줄 — 서버가 역산한 공급가액(04-16 P0: `· 서버 계산` 꼬리 없음).
    // 같은 묶음이 폰 접힌 줄(PC에서 숨김)에도 있어 입금 표 주 행으로 좁힌다.
    await expect(revenueTable(page, "입금 줄").locator("tbody tr:not([aria-hidden])").getByText("공급가액 5,000,000", { exact: true })).toBeVisible();
    await expect(revenueSection(page).getByText(/서버 계산/)).toHaveCount(0);
    // 합계 행 — 발행 10,000,000 - 입금 공급가 5,000,000 = 미수 5,000,000.
    const balance = page.getByText("미수 5,000,000");
    await expect(balance).toBeVisible();
    // 04-16 리뷰 S-1 — 미수·초과 입금 글자는 `--warning`이다(합계 행의 다른 글자는 `--fg`).
    await expect(balance).toHaveCSS("color", await cssColor(page, "--warning"));

    // 다시 PM으로 로그인해 같은 화면을 연다 — 04-16(D-85): 발행 표는 읽기 표로 보이고, 입금 표·미수는 DOM에 없다(숨김이 아니라 부재).
    await page.goto("/account");
    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("이메일").fill(pm.email);
    await page.getByLabel("비밀번호").fill(pm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto(projectUrl);
    await expect(page.getByRole("heading", { name: "매출", exact: true })).toBeVisible();
    await expect(page.getByRole("table", { name: "발행 줄" })).toContainText("10,000,000");
    await expect(page.getByRole("grid", { name: "발행 줄" })).toHaveCount(0);
    await expect(revenueTable(page, "입금 줄")).toHaveCount(0);
    await expect(page.getByText("입금일")).toHaveCount(0);
    await expect(page.getByText("공급가액 5,000,000")).toHaveCount(0);
    await expect(page.getByText("미수 5,000,000")).toHaveCount(0);
  });

  // 04-09 S15 — 숫자 열(.alignRight)의 nowrap이 입금 셀 둘째 줄 「공급가액 … ·
  // 서버 계산」 전체에 상속돼, 10자리 공급가액이면 입금 표가 375px 폭을
  // 넘었다(측정: 문서 scrollWidth 386). 숫자는 꺾지 않고 묶음 사이에서만
  // 줄바꿈해야 한다(SYSTEM.md 숫자 칸 · 외화 2행 규칙).
  test("375px에서 10자리 공급가액 보조 줄이 문서 가로 넘침 없이 숫자를 한 줄로 유지한다", async ({ page }) => {
    const vendor = await insertVendor(SYSTEM_VIEWER, {
      name: `E2E매출폭클라이언트-${Date.now()}`,
      normalizedName: `e2e매출폭클라이언트-${Date.now()}`,
    });
    const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    await grantFinanceRole();
    const finance = await createFixtureUser({ roleId: "role-ceo" });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(pm.email);
    await page.getByLabel("비밀번호").fill(pm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/projects?new=1");
    await page.getByLabel("클라이언트").selectOption({ label: vendor.name });
    await page.getByLabel("팀").selectOption({ index: 1 });
    await page.getByLabel("담당 PM").selectOption({ index: 1 });
    await page.getByLabel("프로젝트명").fill(`E2E매출폭-${Date.now()}`);
    await page.getByRole("button", { name: "프로젝트 등록" }).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    const projectUrl = page.url();

    await page.goto("/account");
    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("이메일").fill(finance.email);
    await page.getByLabel("비밀번호").fill(finance.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto(projectUrl);
    await page.getByRole("button", { name: "입금 줄 추가" }).click();
    await page.getByLabel("입금일").fill("2026-09-05");
    await page.getByLabel("입금액").fill("2000000000");
    await page.getByRole("button", { name: /일괄 저장/ }).click();
    await expect(revenueTable(page, "입금 줄").locator("tbody tr:not([aria-hidden])").getByText("공급가액 1,818,181,818", { exact: true })).toBeVisible();

    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(projectUrl);
    await page.evaluate(() => document.fonts.ready);
    const number = page.getByText("1,818,181,818", { exact: false }).last();
    await expect(number).toBeVisible();
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBe(clientWidth);
    const numberLineCount = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.textContent?.indexOf("1,818,181,818") ?? -1;
        if (at < 0) continue;
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + "1,818,181,818".length);
        const rects = [...range.getClientRects()];
        // 04-16(DR-15) — 폰에서 숨는 금액 셀 2행은 건너뛰고 보이는 접힌 줄의 숫자를 잰다.
        if (rects.length === 0) continue;
        return new Set(rects.map((rect) => Math.round(rect.top))).size;
      }
      return 0;
    });
    expect(numberLineCount).toBe(1);
  });

  test("(리뷰 S-4) 1000에서 쓰기 권한자의 발행액 칸은 읽기 전용이고 권한 잠김(--muted)으로 흐려지지 않는다", async ({ page }) => {
    const projectUrl = await openWithIssuedEntry(page);
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.goto(projectUrl);

    const amountCell = page.getByRole("table", { name: "발행 줄" }).locator("tbody td").filter({ hasText: "3,000,000" }).first();
    await expect(amountCell).toBeVisible();
    await expect(page.getByRole("button", { name: "발행 줄 추가" })).toHaveCount(0);
    const muted = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--muted)";
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    expect(await amountCell.evaluate((el) => getComputedStyle(el).color)).not.toBe(muted);
  });

  test("(리뷰 S-2) 저장 요청 중 발행액 칸은 값을 보인 채 읽기 전용이고 「발행 줄 추가」는 무동작이다", async ({ page }) => {
    const projectUrl = await openWithIssuedEntry(page);
    await page.goto(projectUrl);
    const amount = page.getByLabel("발행액");
    await amount.fill("4000000");

    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"] !== undefined) await held;
      await route.continue();
    });
    await page.getByRole("button", { name: /일괄 저장/ }).click();
    await expect(page.getByRole("button", { name: /일괄 저장/ })).toContainText("…");

    await expect(amount).toHaveAttribute("readonly", "");
    // 04-16(DR-3) — 이 플랜이 바꾼 발행 표에도 저장 잠금이 그대로 간다.
    await expect(page.getByRole("grid", { name: "발행 줄" })).toHaveAttribute("aria-busy", "true");
    await page.getByRole("button", { name: "발행 줄 추가" }).click();
    await expect(page.getByLabel("발행액")).toHaveCount(1);

    release();
    await expect(page.getByText("바뀐 칸 없음", { exact: true })).toBeVisible();
    await expect(amount).not.toHaveAttribute("readonly", "");
    await expect(page.getByRole("grid", { name: "발행 줄" })).not.toHaveAttribute("aria-busy", "true");
  });
});

test.describe("매출 표 — 발행 읽기 표·입금 표 부재(D-85) · 폰 배치(DR-15) · 좁은 PC 보기 전용(DR-36) · 다른 표 오류(R2) (04-16 Task 3)", () => {
  test("기획 PM — 발행 표는 캡션 읽기 표 · 추가 버튼 없음 · EMPTY `· 발행은 경영관리` · 입금 표·미수 부재 · 부제 `공급가액 기준`", async ({ page }) => {
    const seeded = await seedRevenueProject({});
    await login(page, seeded.email, seeded.password);
    await page.goto(seeded.projectUrl);

    const section = revenueSection(page);
    const issued = page.getByRole("table", { name: "발행 줄" });
    await expect(issued).toBeVisible();
    await expect(issued.getByText("발행한 세금계산서가 없습니다 · 발행은 경영관리", { exact: true })).toBeVisible();
    await expect(section.getByRole("button", { name: "발행 줄 추가" })).toHaveCount(0);
    await expect(revenueTable(page, "입금 줄")).toHaveCount(0);
    await expect(section.getByText(/^미수 /)).toHaveCount(0);
    await expect(section.getByText("공급가액 기준", { exact: true })).toBeVisible();
    await expect(section.getByText(/입금액만 통장 합계/)).toHaveCount(0);
  });

  test("경영관리 1280 — 두 격자 + 추가 버튼 · 부제 · 외화 입금 2행이 외화 묶음과 공급가액 묶음 둘 · `서버 계산` 없음 · 힌트 줄 없음", async ({ page }) => {
    const seeded = await seedRevenueProject({
      issued: [{ entryDate: "2026-09-01", amount: krw(12_000_000) }],
      paid: [{ entryDate: "2026-09-05", amount: FOREIGN_PAID, note: "현장 입금" }],
    });
    await grantFinanceRole();
    const finance = await createFixtureUser({ roleId: "role-ceo" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page, finance.email, finance.password);
    await page.goto(seeded.projectUrl);

    const section = revenueSection(page);
    await expect(page.getByRole("grid", { name: "발행 줄" })).toBeVisible();
    await expect(page.getByRole("grid", { name: "입금 줄" })).toBeVisible();
    await expect(section.getByRole("button", { name: "발행 줄 추가" })).toBeVisible();
    await expect(section.getByRole("button", { name: "입금 줄 추가" })).toBeVisible();
    await expect(section.getByText("공급가액 기준 · 입금액만 통장 합계", { exact: true })).toBeVisible();

    const paid = revenueTable(page, "입금 줄");
    const fxGroup = paid.getByText("USD 4,400.00 @1,318.1818", { exact: true }).first();
    const supplyGroup = paid.getByText(/^공급가액 [\d,]+$/).first();
    await expect(fxGroup).toBeVisible();
    await expect(supplyGroup).toBeVisible();
    expect(await fxGroup.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe("nowrap");
    expect(await supplyGroup.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe("nowrap");
    await expect(section.getByText(/서버 계산/)).toHaveCount(0);
    await expect(section.locator("kbd")).toHaveCount(0);
  });

  test("경영관리 1000 — 두 표가 읽기 표 · 추가 버튼 없음 · 0줄 EMPTY는 사실만(버튼 없음)", async ({ page }) => {
    const seeded = await seedRevenueProject({});
    await grantFinanceRole();
    const finance = await createFixtureUser({ roleId: "role-ceo" });
    await page.setViewportSize({ width: 1000, height: 800 });
    await login(page, finance.email, finance.password);
    await page.goto(seeded.projectUrl);

    const section = revenueSection(page);
    await expect(page.getByRole("table", { name: "발행 줄" }).getByText("발행한 세금계산서가 없습니다", { exact: true })).toBeVisible();
    await expect(page.getByRole("table", { name: "입금 줄" }).getByText("입금 줄이 없습니다", { exact: true })).toBeVisible();
    await expect(section.getByRole("grid")).toHaveCount(0);
    await expect(section.getByRole("button", { name: "발행 줄 추가" })).toHaveCount(0);
    await expect(section.getByRole("button", { name: "입금 줄 추가" })).toHaveCount(0);
  });

  test("경영관리 375 — 보이는 열은 날짜·금액 둘 · 금액 셀 2행은 숨고 접힌 줄이 외화 · 공급가액 · 메모 순 · 묶음 nowrap · 가로 스크롤 0", async ({ page }) => {
    const seeded = await seedRevenueProject({
      issued: [{ entryDate: "2026-09-01", amount: krw(12_000_000), note: "1차 발행 메모" }],
      paid: [{ entryDate: "2026-09-05", amount: FOREIGN_PAID, note: "현장 입금 메모" }],
    });
    await grantFinanceRole();
    const finance = await createFixtureUser({ roleId: "role-ceo" });
    await page.setViewportSize({ width: 375, height: 800 });
    await login(page, finance.email, finance.password);
    await page.goto(seeded.projectUrl);
    await page.evaluate(() => document.fonts.ready);

    for (const caption of ["발행 줄", "입금 줄"] as const) {
      const visibleHeaders = await revenueTable(page, caption)
        .locator("thead th")
        .evaluateAll((cells) => cells.filter((cell) => getComputedStyle(cell).display !== "none").map((cell) => cell.textContent));
      expect(visibleHeaders).toEqual(caption === "발행 줄" ? ["발행일", "발행액"] : ["입금일", "입금액"]);
    }

    const paid = revenueTable(page, "입금 줄");
    const mainRow = paid.locator("tbody tr:not([aria-hidden])").first();
    await expect(mainRow.getByText("USD 4,400.00 @1,318.1818", { exact: true })).toBeHidden();
    const collapsed = paid.locator('tbody tr[aria-hidden="true"] td');
    await expect(collapsed).toHaveText(/^USD 4,400\.00 @1,318\.1818 · 공급가액 [\d,]+ · 현장 입금 메모$/);
    expect(await collapsed.getByText("USD 4,400.00 @1,318.1818", { exact: true }).evaluate((el) => getComputedStyle(el).whiteSpace)).toBe("nowrap");
    expect(await collapsed.getByText(/^공급가액 [\d,]+$/).evaluate((el) => getComputedStyle(el).whiteSpace)).toBe("nowrap");
    await expect(revenueTable(page, "발행 줄").locator('tbody tr[aria-hidden="true"] td')).toHaveText("1차 발행 메모");

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBe(clientWidth);
  });

  test("(R2) 견적 줄 칸 하나만 거부된 저장 → 발행·입금 표 합계 행이 각각 `전부 거부 · 다른 칸 오류 1칸`(--danger) · 고쳐 저장하면 모두 사라진다", async ({ page }) => {
    // 담당 PM이 견적도 고치고 발행·입금도 보는 계급 — role-pm 권한을 복사하고 매출 쓰기·모든 정보 노출을 더한다.
    const roleId = `role-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: roleId, name: `E2E 매출 PM-${randomUUID().slice(0, 8)}` });
    for (const row of await listPermissions(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID })) {
      await upsertPermission(SYSTEM_VIEWER, { roleId, menu: row.menu, action: row.action, allowed: row.allowed });
    }
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "projects.revenue", action: "write", allowed: true });
    for (const row of await listVisibility(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID })) {
      await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: row.infoItem, visible: true });
    }
    const seeded = await seedRevenueProject({
      pmRoleId: roleId,
      quoteAmounts: [1_000_000],
      issued: [{ entryDate: "2026-09-01", amount: krw(1_000_000) }],
      paid: [{ entryDate: "2026-09-05", amount: krw(1_100_000) }],
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page, seeded.email, seeded.password);
    await page.goto(seeded.projectUrl);

    const quoteTable = page.locator("table", { has: page.locator("caption", { hasText: /^견적 줄$/ }) });
    const quantityCell = quoteTable.locator('tbody tr:has(td[role="gridcell"])').first().getByRole("gridcell").nth(4);
    await expect(async () => {
      await quantityCell.focus();
      await page.keyboard.press("Enter");
      await expect(quantityCell.locator("input")).toBeFocused({ timeout: 1000 });
    }).toPass();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("0");
    await page.keyboard.press("Enter");
    await quantityCell.focus();
    const rejected = page.waitForResponse((response) => isServerAction(response.request()));
    await page.keyboard.press("Control+s");
    await rejected;

    await expect(quantityCell).toHaveAttribute("aria-invalid", "true");
    await expect(quoteTable.locator("tfoot")).toContainText("오류 1칸 · 전부 거부");
    const danger = await cssColor(page, "--danger");
    for (const caption of ["발행 줄", "입금 줄"] as const) {
      const note = revenueTable(page, caption).locator("tfoot").getByText("전부 거부 · 다른 칸 오류 1칸", { exact: true });
      await expect(note).toBeVisible();
      expect(await note.evaluate((el) => getComputedStyle(el).color)).toBe(danger);
    }

    await expect(async () => {
      await quantityCell.focus();
      await page.keyboard.press("Enter");
      await expect(quantityCell.locator("input")).toBeFocused({ timeout: 1000 });
    }).toPass();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("2");
    await page.keyboard.press("Enter");
    await quantityCell.focus();
    const saved = page.waitForResponse((response) => isServerAction(response.request()));
    await page.keyboard.press("Control+s");
    await saved;

    await expect(page.getByText(/저장됨/).first()).toBeVisible();
    await expect(quoteTable.locator("tfoot")).not.toContainText("전부 거부");
    await expect(revenueSection(page).locator("tfoot").getByText(/전부 거부/)).toHaveCount(0);
  });
});
