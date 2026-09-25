import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { addDays, kstToday } from "@/lib/kst-date";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// Phase 4 Task 3 ⑤ — 매출 섹션 E2E: 계약 금액(PM 쓰기) → 부가세·합계
// 서버 계산 확인 → 발행·입금 줄(경영관리 쓰기) → 입금 셀 둘째 줄 공급가액 +
// 합계 행 미수 표시 확인 → 기획 PM에게는 두 표가 DOM에 없음(부재, 숨김이
// 아니다). "경영관리"는 SEED_ROLES 5종에 없어 role-ceo에 이 스펙이
// 직접 권한을 부여한다(D-57, domain/permissions/menus.ts 04-02 주석과 같은
// 결 — 계획의 예시 흐름과 달리 계약 금액은 경영관리가 아니라 PM이 적는다,
// 실제 구현된 쓰기 주체 분리를 따른다).
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

test.describe("매출 섹션 (Phase 4 Task 3)", () => {
  test("계약 금액(PM) → 발행·입금(경영관리) → 미수 표시 → PM에게는 두 표 부재", async ({ page }) => {
    const vendor = await insertVendor(SYSTEM_VIEWER, {
      name: `E2E매출클라이언트-${Date.now()}`,
      normalizedName: `e2e매출클라이언트-${Date.now()}`,
    });
    const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    await grantFinanceRole();
    const finance = await createFixtureUser({ roleId: "role-ceo" });

    // PM: 프로젝트 등록 + 계약 금액 입력
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

    await page.getByLabel("계약 금액", { exact: true }).fill("5000000");
    await page.getByRole("button", { name: /일괄 저장/ }).click();
    await expect(page.getByText("부가세 10% 500,000 · 합계 5,500,000 · 서버 계산")).toBeVisible();

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

    // 입금 셀 둘째 줄 — 서버가 역산한 공급가액.
    await expect(page.getByText("공급가액 5,000,000 · 서버 계산")).toBeVisible();
    // 합계 행 — 발행 10,000,000 - 입금 공급가 5,000,000 = 미수 5,000,000.
    await expect(page.getByText("미수 5,000,000")).toBeVisible();

    // 다시 PM으로 로그인해 같은 화면을 연다 — 두 표가 DOM에 없다(숨김이 아니라 부재).
    await page.goto("/account");
    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("이메일").fill(pm.email);
    await page.getByLabel("비밀번호").fill(pm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto(projectUrl);
    await expect(page.getByRole("heading", { name: "매출", exact: true })).toBeVisible();
    // 부제 "공급가액 기준 · 입금액만 통장 합계"는 항상 렌더되므로("공급가액"
    // 포함) 표 부재 단언은 표에만 나오는 열 머리글·미수 문구로 확인한다.
    await expect(page.getByText("발행일")).toHaveCount(0);
    await expect(page.getByText("입금일")).toHaveCount(0);
    await expect(page.getByText("공급가액 5,000,000")).toHaveCount(0);
    await expect(page.getByText("미수 5,000,000")).toHaveCount(0);
  });

  // F4 — 계약 금액이 `value={숫자}`로 매 렌더 되돌려지는 통제 입력이라
  // 쉼표는 Number()가 조용히 0으로 읽고, USD 소수점은 다음 렌더에서
  // "."이 지워져 뒷자리가 정수 뒤에 붙었다(1234.56→123456). `.fill()`은
  // 값을 한 번에 밀어넣어 이 버그를 재현하지 못하므로 한 글자씩 타이핑한다.
  // 04-09부터 칸은 타이핑 중에도 쉼표를 넣어 보여준다(D-95) — 저장·새로고침
  // 뒤 값 단언도 쉼표 서식(그대로 남는지 확인하는 것이 이 테스트의 목적).
  test("F4 — 타이핑으로 쉼표·소수점을 넣은 계약 금액이 저장·새로고침 후에도 보존된다", async ({ page }) => {
    const vendor = await insertVendor(SYSTEM_VIEWER, {
      name: `E2E매출타이핑클라이언트-${Date.now()}`,
      normalizedName: `e2e매출타이핑클라이언트-${Date.now()}`,
    });
    const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(pm.email);
    await page.getByLabel("비밀번호").fill(pm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/projects?new=1");
    await page.getByLabel("클라이언트").selectOption({ label: vendor.name });
    await page.getByLabel("팀").selectOption({ index: 1 });
    await page.getByLabel("담당 PM").selectOption({ index: 1 });
    const projectName = `E2E수익타이핑-${Date.now()}`;
    await page.getByLabel("프로젝트명").fill(projectName);
    await page.getByRole("button", { name: "프로젝트 등록" }).click();
    await expect(page).toHaveURL(/\/projects\/.+/);

    const amountInput = page.getByLabel("계약 금액", { exact: true });
    await amountInput.click();
    await page.keyboard.type("1,500,000");
    await page.getByRole("button", { name: /일괄 저장/ }).click();
    await expect(page.getByText("부가세 10% 150,000 · 합계 1,650,000 · 서버 계산")).toBeVisible();

    await page.reload();
    await expect(amountInput).toHaveValue("1,500,000");
    await expect(page.getByText("부가세 10% 150,000 · 합계 1,650,000 · 서버 계산")).toBeVisible();

    // USD로 바꾸고 소수점을 타이핑한다 — "."이 도중에 지워지면 안 된다.
    await page.getByLabel("계약 금액 통화").selectOption("USD");
    await amountInput.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("1234.56");
    await page.getByRole("button", { name: /일괄 저장/ }).click();
    await expect(amountInput).toHaveValue("1,234.56");
    // 입력칸 값은 타이핑 직후부터 이미 "1,234.56"이라 저장 완료 신호가 아니다 —
    // 서버 응답으로 dirty가 비워져야 뜨는 비활성 사유를 기다린 뒤 새로고침한다
    // (아니면 reload가 진행 중인 저장 요청을 끊어 1500000이 남는다).
    await expect(page.getByText("바뀐 칸 없음", { exact: true })).toBeVisible();

    await page.reload();
    await expect(amountInput).toHaveValue("1,234.56");
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

    await page.getByLabel("계약 금액", { exact: true }).fill("2000000000");
    await page.getByRole("button", { name: /일괄 저장/ }).click();
    await expect(page.getByText("부가세 10% 200,000,000 · 합계 2,200,000,000 · 서버 계산")).toBeVisible();

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
    await expect(page.getByText("공급가액 1,818,181,818 · 서버 계산")).toBeVisible();

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
        return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
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
    await page.getByRole("button", { name: "발행 줄 추가" }).click();
    await expect(page.getByLabel("발행액")).toHaveCount(1);

    release();
    await expect(page.getByText("바뀐 칸 없음", { exact: true })).toBeVisible();
    await expect(amount).not.toHaveAttribute("readonly", "");
  });
});
