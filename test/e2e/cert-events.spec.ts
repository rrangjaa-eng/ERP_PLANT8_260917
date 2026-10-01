import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole, setRoleArchived } from "@/repositories/roles";
import { createFixtureUser } from "./fixtures";
import { createCertEvent, seedSubmittedCert, withCertFeatureOff } from "./helpers/cert";

// 04.3-04 Task 4 ⑤ · 04.3-15 — I′1 확인증 행사 목록 · I′3 상세 머리. 행사 만들기(I2)는 명단과 함께 없어졌다
// (새 「QR 생성 신청」은 04.3-10). 전역 설정(기능 · 문의 전화)은 cert.setup.ts가 켠다 — 이 스펙은 기능 끄기를
// withCertFeatureOff 범위 안에서만 한다. 목록이 비었다는 전역 단언은 하지 않는다(다른 스펙의 행사) — EMPTY는
// 범위상 0건인 임시 사용자로 본다.

test.describe.configure({ mode: "serial" });

async function login(page: Page, account: { email: string; password: string }): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function groupHeaders(page: Page): Promise<string[]> {
  // 폰 접힌 줄(P2 `당첨일 · 담당`)도 td[colspan]이라 그룹 이름만 거른다(leave-list 전례).
  return (await page.locator("tbody tr td[colspan]").allTextContents())
    .map((text) => text.trim())
    .filter((text) => ["신청됨", "접수 중", "닫힘"].includes(text));
}

function eventRow(page: Page, eventName: string) {
  return page.getByRole("row").filter({ has: page.getByRole("link", { name: eventName }) });
}

async function loggedInPage(browser: Browser, account: { email: string; password: string }): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, account);
  return page;
}

test.describe("확인증 행사 — 시스템 관리자", () => {
  let admin: { email: string; password: string };

  test.beforeAll(async () => {
    admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  });

  test("(g) 기능 꺼짐 → /certs/events · 상세가 404 화면 · 범위를 나오면 다시 보인다", async ({ page }) => {
    await login(page, admin);
    await page.goto("/certs/events");
    const ownEvent = page.locator('a[data-row-link][href^="/certs/events/"]').first();
    const detailHref = (await ownEvent.count()) > 0 ? await ownEvent.getAttribute("href") : null;
    await withCertFeatureOff(async () => {
      for (const path of ["/certs/events", ...(detailHref ? [detailHref] : [])]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { name: "페이지 찾을 수 없음" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "확인증 행사" })).toHaveCount(0);
      }
    });
    const on = await page.goto("/certs/events");
    expect(on?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "확인증 행사" })).toBeVisible();
  });

  test("제출 셀 = 대조 제외 뺀 건수 하나 — 보이는 숫자 + 접근 이름 「제출 N건」", async ({ page }) => {
    const seeded = await seedSubmittedCert();
    await login(page, admin);
    await page.goto("/certs/events");
    const row = eventRow(page, seeded.eventName);
    await expect(row.locator(".sr-only")).toHaveText("제출 1건");
    await expect(row.locator('[aria-hidden="true"]', { hasText: /^1$/ })).toHaveCount(1);
  });
});

test.describe("확인증 행사 — 임시 계급(자기 행사만)", () => {
  let roleId: string;
  let account: { email: string; password: string };

  // (f-0) 공유 role-pm을 바꾸지 않는다 — 임시 계급에 certs.events 보기 · 쓰기와 cert_event.value 노출만 준다.
  test.beforeAll(async () => {
    roleId = `role-e2e-cert-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: roleId, name: `E2E 임시 계급 ${roleId.slice(-12)}`, sortOrder: 99 });
    for (const action of ["view", "write"] as const) {
      await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "certs.events", action, allowed: true });
    }
    await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "cert_event.value", visible: true });
    account = await createFixtureUser({ roleId });
  });

  test.afterAll(async () => {
    await setRoleArchived(SYSTEM_VIEWER, roleId, true);
  });

  test("(f-0-b) EMPTY — 자기 행사 0건이면 「확인증 행사가 없습니다」(만들기 진입 없음 — 04.3-10이 더한다)", async ({ browser }) => {
    const page = await loggedInPage(browser, account);
    await page.goto("/certs/events");
    await expect(page.getByText("확인증 행사가 없습니다")).toBeVisible();
    await expect(page.getByRole("link", { name: "행사 만들기" })).toHaveCount(0);
    await page.context().close();
  });

  test("목록 그룹 신청됨 → 접수 중 → 닫힘 · 신청됨 제출 셀 「—」 · 상세 머리 태그 · QR 섹션은 접수 중만", async ({ browser }) => {
    const [me] = await db.select({ id: users.id }).from(users).where(eq(users.email, account.email));
    if (!me) throw new Error("임시 사용자 없음");
    const requested = await createCertEvent({ name: "신청 행사", status: "requested", createdBy: me.id });
    const open = await createCertEvent({ name: "접수 행사", status: "open", createdBy: me.id });
    const closed = await createCertEvent({ name: "닫힌 행사", status: "closed", createdBy: me.id });

    const page = await loggedInPage(browser, account);
    await page.goto("/certs/events");
    expect(await groupHeaders(page)).toEqual(["신청됨", "접수 중", "닫힘"]);
    const requestedRow = eventRow(page, requested.eventName);
    await expect(requestedRow.getByRole("cell").nth(3)).toHaveText("—");
    await expect(requestedRow.locator(".sr-only")).toHaveCount(0);
    await expect(eventRow(page, open.eventName).locator(".sr-only")).toHaveText("제출 0건");

    const cases = [
      { event: requested, tag: "신청됨", qr: 0, svg: 0 },
      { event: open, tag: "접수 중", qr: 1, svg: 1 },
      { event: closed, tag: "닫힘", qr: 1, svg: 0 },
    ];
    for (const c of cases) {
      await page.goto(`/certs/events/${c.event.eventId}`);
      await expect(page.getByRole("heading", { name: c.event.eventName, level: 1 })).toBeVisible();
      await expect(page.getByText(c.tag, { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "QR", level: 2 })).toHaveCount(c.qr);
      await expect(page.getByRole("img", { name: `${c.event.eventName} 확인증 QR` })).toHaveCount(c.svg);
    }
    await page.context().close();
  });
});

// ── 04.3-10 tracer — 기획본부 「QR 생성 신청」 → 경영관리 알림함 → I′3 경품 한 줄 → 「QR 생성」 → 신청자 알림 → 수령자 링크 ──

function kstToday(offsetDays = 0): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + offsetDays * 86_400_000));
}

const prizeGrid = (page: Page) => page.getByRole("grid", { name: "경품" });
const prizeRows = (page: Page) => prizeGrid(page).locator("tbody > tr");
const prizeCell = (page: Page, row: number, col: number) => prizeRows(page).nth(row).locator("td").nth(col);
const PRIZE_COL = { name: 1, value: 2, delivery: 3, winners: 4, submitted: 5 } as const;

async function editPrizeCell(page: Page, row: number, col: number, value: string) {
  const cell: Locator = prizeCell(page, row, col);
  if ((await cell.locator("input").count()) === 0) await cell.click();
  const input = cell.locator("input");
  await input.fill(value);
  await input.press("Enter");
  await expect(cell.locator("input")).toHaveCount(0);
}

test.describe("04.3-10 tracer — QR 생성 신청 → QR 생성(1280)", () => {
  let pm: { email: string; password: string };
  let manager: { email: string; password: string };
  let managerRoleId: string;

  test.beforeAll(async () => {
    pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    // 경영관리 고정물(E11) — 시스템 관리자가 아니다. 모든 메뉴를 가진 박서연으로는 권한 조합 결함이 드러나지 않는다.
    managerRoleId = `role-e2e-qr-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: managerRoleId, name: `E2E 경영 ${managerRoleId.slice(-12)}`, sortOrder: 99 });
    await upsertPermission(SYSTEM_VIEWER, { roleId: managerRoleId, menu: "certs.events", action: "view", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId: managerRoleId, menu: "certs.qr", action: "write", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: managerRoleId, infoItem: "cert_event.value", visible: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: managerRoleId, infoItem: "cert_prize.value", visible: true });
    manager = await createFixtureUser({ roleId: managerRoleId });
  });

  test.afterAll(async () => {
    await setRoleArchived(SYSTEM_VIEWER, managerRoleId, true);
  });

  test("PM 신청(옆 패널) → 경영관리 알림함 · 경품 한 줄 · QR 생성 → PM 알림함 · 수령자 링크에 그 경품", async ({ browser }) => {
    const eventName = `E2E 신청-${randomUUID().slice(0, 8)}`;
    const prizeName = `E2E 경품-${randomUUID().slice(0, 6)}`;
    const today = kstToday();

    // ① PM — 목록 1차 → 옆 패널(첫 칸 포커스 · 열린 동안 화면의 1차는 패널 1차 하나 — DR-9)
    const pmPage = await loggedInPage(browser, pm);
    await pmPage.goto("/certs/events");
    await pmPage.getByRole("button", { name: "QR 생성 신청" }).click();
    const panel = pmPage.getByRole("dialog", { name: "QR 생성 신청" });
    await expect(panel).toBeVisible();
    await expect(panel.getByLabel("행사 이름")).toBeFocused();
    await expect(pmPage.getByRole("button", { name: "QR 생성 신청" })).toHaveCount(1);
    await expect(panel.getByRole("button", { name: "QR 생성 신청" })).toHaveCount(1);

    // ② 막힘 한 번에 하나 — 당첨일 빔 → 어제(지난 날짜) → 오늘(계산 줄)
    await panel.getByLabel("행사 이름").fill(eventName);
    // 막힌 1차는 aria-disabled(누름 무시) + 이유 글자(§7-1) — 이유가 1차의 접근 설명이다.
    const panelPrimary = panel.getByRole("button", { name: "QR 생성 신청" });
    await expect(panelPrimary).toHaveAttribute("aria-disabled", "true");
    await expect(panel.getByText("당첨일 비어 있음 · 당첨일 적기")).toBeVisible();
    await expect(panelPrimary).toHaveAccessibleDescription("당첨일 비어 있음 · 당첨일 적기");
    await panel.getByLabel("당첨일").fill(kstToday(-1));
    await expect(panel.getByText("지난 날짜 · 당첨일 확인")).toBeVisible();
    await panel.getByLabel("당첨일").fill(today);
    await expect(panel.getByText(new RegExp(`^열림 ${today.slice(5)} 00:00 · 마감 \\d{2}-\\d{2} \\d{2}:\\d{2}$`))).toBeVisible();
    await expect(panel.getByText("지난 날짜 · 당첨일 확인")).toHaveCount(0);

    // ③ 신청 → 패널 닫힘 · 새 행 신청됨 그룹 · 포커스 = 그 행 · 토스트
    await panel.getByRole("button", { name: "QR 생성 신청" }).click();
    await expect(panel).toBeHidden();
    const newRow = eventRow(pmPage, eventName);
    await expect(newRow).toBeVisible();
    await expect(newRow.getByRole("link", { name: eventName })).toBeFocused();
    await expect(pmPage.getByRole("status").filter({ hasText: `QR 생성 신청 · ${eventName}` })).toBeVisible();
    await expect(newRow.getByText("신청됨", { exact: true })).toBeVisible();

    // ④ 경영관리 — 알림함 → 목록 그 행 → I′3 경품 첫 줄 → QR 생성
    const mPage = await loggedInPage(browser, manager);
    await mPage.goto("/notifications");
    await expect(mPage.getByText(`QR 생성 신청 · ${eventName} · ${today} · E2E Employee`)).toBeVisible();
    await mPage.goto("/certs/events");
    await eventRow(mPage, eventName).getByRole("link", { name: eventName }).click();
    await expect(mPage.getByRole("heading", { name: eventName, level: 1 })).toBeVisible();
    await mPage.getByRole("button", { name: /첫 줄 만들기/ }).click();
    await expect(prizeRows(mPage)).toHaveCount(1);
    await editPrizeCell(mPage, 0, PRIZE_COL.name, prizeName);
    await editPrizeCell(mPage, 0, PRIZE_COL.value, "1,290,000");
    await expect(prizeCell(mPage, 0, PRIZE_COL.delivery)).toHaveText("현장");
    await mPage.getByRole("button", { name: "QR 생성", exact: true }).click();

    // ⑤ 같은 화면이 접수 중으로 · QR 섹션 · 포커스 = QR 섹션 라벨 · 토스트
    const qrHeading = mPage.getByRole("heading", { name: "QR", level: 2 });
    await expect(qrHeading).toBeVisible();
    await expect(qrHeading).toBeFocused();
    await expect(mPage.getByText("접수 중", { exact: true })).toBeVisible();
    await expect(mPage.getByRole("status").filter({ hasText: `QR 생성 · ${eventName}` })).toBeVisible();
    const link = (await mPage.locator('[class*="linkRow"] span').first().textContent())?.trim() ?? "";
    expect(link).toMatch(/\/c\/[A-Za-z0-9_-]+$/);

    // ⑥ PM 알림함 · 수령자 링크에 그 경품
    await pmPage.goto("/notifications");
    await expect(pmPage.getByRole("cell", { name: new RegExp(`QR 생성 · ${eventName}$`) })).toBeVisible();
    const recipient = await browser.newContext();
    const rPage = await recipient.newPage();
    await rPage.goto(link);
    await expect(rPage.getByRole("button", { name: new RegExp(prizeName) })).toBeVisible();

    await recipient.close();
    await pmPage.context().close();
    await mPage.context().close();
  });
});
