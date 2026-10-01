import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { insertRole, setRoleArchived } from "@/repositories/roles";
import { createFixtureUser } from "./fixtures";
import { withCertFeatureOff } from "./helpers/cert";

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
});
