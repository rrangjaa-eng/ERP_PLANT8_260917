import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
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
