import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole, setRoleArchived } from "@/repositories/roles";
import { createFixtureUser } from "./fixtures";
import { createCertEvent, seedIpSubmissionsForTest } from "./helpers/cert";

test.use({ viewport: { width: 375, height: 800 } });
test.describe.configure({ mode: "serial" });

// 04.3-10 Task 3 ① — 폰(375) · 좁은 PC(900): I′1 1차 「QR 생성 신청」이 폰에도 있고 아래 시트(모달 — 스크림 · 포커스 가두기 ·
// Esc)로 열린다 · 신청 성공 · I′3 경품은 읽기 표(칸 접기 — P2 `{현장|택배} · 당첨 {M}명`)이고 「QR 생성」 · 「일괄 저장」이 없다.

async function login(page: Page, account: { email: string; password: string }): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function loggedInPage(browser: Browser, account: { email: string; password: string }, width = 375): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await context.newPage();
  await login(page, account);
  return page;
}

function kstToday(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
}

function eventRow(page: Page, eventName: string) {
  return page.getByRole("row").filter({ has: page.getByRole("link", { name: eventName }) });
}

test.describe("04.3-10 폰 · 좁은 PC", () => {
  let pm: { email: string; password: string };
  let pmId: string;
  let manager: { email: string; password: string };
  let managerRoleId: string;

  test.beforeAll(async () => {
    pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    const [me] = await db.select({ id: users.id }).from(users).where(eq(users.email, pm.email));
    pmId = me?.id ?? "";
    managerRoleId = `role-e2e-qrm-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: managerRoleId, name: `E2E 경영폰 ${managerRoleId.slice(-12)}`, sortOrder: 99 });
    await upsertPermission(SYSTEM_VIEWER, { roleId: managerRoleId, menu: "certs.events", action: "view", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId: managerRoleId, menu: "certs.qr", action: "write", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: managerRoleId, infoItem: "cert_event.value", visible: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: managerRoleId, infoItem: "cert_prize.value", visible: true });
    manager = await createFixtureUser({ roleId: managerRoleId });
  });

  test.afterAll(async () => {
    await setRoleArchived(SYSTEM_VIEWER, managerRoleId, true);
  });

  test("375 — 1차 「QR 생성 신청」 → 아래 시트(모달 · 첫 칸 포커스 · Esc 닫힘 → 여는 버튼) → 신청 성공", async ({ browser }) => {
    await createCertEvent({ name: "폰 기존 신청", status: "requested", createdBy: pmId });
    const page = await loggedInPage(browser, pm);
    await page.goto("/certs/events");
    const opener = page.getByRole("link", { name: "QR 생성 신청" });
    await expect(opener).toHaveCount(1);
    const listTable = page.locator("table").first();
    const tableTopBefore = (await listTable.boundingBox())?.y;
    await opener.click();
    await expect(page).toHaveURL(/\/certs\/events\?new=1$/);

    const sheet = page.getByRole("dialog", { name: "QR 생성 신청" });
    await expect(sheet).toBeVisible();
    // 04.6-04: 열림 모션(--dur-sheet 200ms)이 끝난 뒤에 잰다.
    await expect.poll(() => sheet.evaluate((el) => el.getAnimations().length)).toBe(0);
    // 시트 뒤 목록 표는 움직이지 않는다(DOM 감사 A-M2).
    expect((await listTable.boundingBox())?.y).toBe(tableTopBefore);
    // 막힘(빈 칸)에서도 행동 줄은 2차 왼쪽 · 1차 오른쪽 한 줄, 1차가 2차의 2배 폭(SYSTEM §7-8 — A-M1 · A-L1).
    await expect(sheet.getByText("행사 이름, 당첨일 2칸 비어 있음 · 행사 이름 적기")).toBeVisible();
    const cancelBox = await sheet.getByRole("button", { name: /취소/ }).boundingBox();
    const primaryBox = await sheet.getByRole("button", { name: "QR 생성 신청" }).boundingBox();
    expect(cancelBox?.y).toBe(primaryBox?.y);
    expect((cancelBox?.x ?? 0) + (cancelBox?.width ?? 0)).toBeLessThanOrEqual(primaryBox?.x ?? 0);
    const ratio = (primaryBox?.width ?? 0) / (cancelBox?.width ?? 1);
    expect(ratio).toBeGreaterThan(1.8);
    expect(ratio).toBeLessThan(2.2);
    // 폰은 모달 시트 — 스크림(::backdrop) · 브라우저 포커스 가두기(:modal).
    expect(await sheet.evaluate((el) => el.matches(":modal"))).toBe(true);
    await expect(sheet.getByLabel("행사 이름")).toBeFocused();
    const box = await sheet.boundingBox();
    expect(Math.round(box?.width ?? 0)).toBe(375);
    expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(800);

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/certs\/events$/);
    await expect(page.getByRole("link", { name: "QR 생성 신청" })).toBeFocused();

    const eventName = `폰 신청-${randomUUID().slice(0, 6)}`;
    await page.getByRole("link", { name: "QR 생성 신청" }).click();
    await sheet.getByLabel("행사 이름").fill(eventName);
    await sheet.getByLabel("당첨일").fill(kstToday());
    await sheet.getByRole("button", { name: "QR 생성 신청" }).click();
    await expect(sheet).toBeHidden();
    await expect(eventRow(page, eventName)).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: `QR 생성 신청 · ${eventName}` })).toBeVisible();
    await page.context().close();
  });

  test("375 · 900 — I′3 경품은 읽기 표(칸 접기) · 「QR 생성」 · 「일괄 저장」 없음 · 900에도 목록 1차는 있다", async ({ browser }) => {
    const open = await createCertEvent({
      name: "폰 읽기표",
      prizes: [{ name: "갤럭시 탭 S10", unitValueKrw: 1_290_000, winnerCount: 3 }, { name: "다이슨 에어랩", unitValueKrw: 599_000, delivery: "parcel", winnerCount: 2 }],
    });
    await seedIpSubmissionsForTest(open.eventId, { ip: "203.0.113.120", count: 1, prizeId: open.prizeIds[0] });
    const requested = await createCertEvent({ name: "폰 신청표", status: "requested" });

    for (const width of [375, 900]) {
      const page = await loggedInPage(browser, manager, width);
      await page.goto(`/certs/events/${open.eventId}`);
      const table = page.getByRole("table", { name: "경품" });
      await expect(table).toBeVisible();
      await expect(page.getByRole("grid")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /QR 생성|일괄 저장/ })).toHaveCount(0);
      await expect(table.getByText("1,290,000")).toBeVisible();
      if (width === 375) {
        await expect(table.getByText("택배 · 당첨 2명")).toBeVisible();
      } else {
        await expect(table.getByRole("columnheader", { name: "당첨 수" })).toBeVisible();
      }

      await page.goto(`/certs/events/${requested.eventId}`);
      await expect(page.getByText("경품이 없습니다", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: /QR 생성|첫 줄 만들기/ })).toHaveCount(0);
      await page.context().close();
    }

    const pmPage = await loggedInPage(browser, pm, 900);
    await pmPage.goto("/certs/events");
    await expect(pmPage.getByRole("link", { name: "QR 생성 신청" })).toHaveCount(1);
    await pmPage.context().close();
  });
});
