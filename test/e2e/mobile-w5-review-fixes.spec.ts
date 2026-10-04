import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { loginAsSysadmin, tokenNumber } from "./row-actions-helpers";
import { setupLeaveOrg } from "./leave-org";
import { onStableSeoulDay } from "./leave-dates";
import { recordAction } from "@/domain/action-log/record";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// 04.6 웨이브 5 디자인 검토 결함 고침의 DOM 실측 — 폰 375 · 320. 판정은 계산값으로만 한다(스크린샷 육안 없음).

const BASE_URL = "http://127.0.0.1:3100";
const D1_PATHS = [
  "/admin/people/roles",
  "/admin/code-tables?tableKey=project_status",
  "/admin/code-tables?tableKey=evidence_type",
];

const CLS_INIT = `
  window.__cls = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
  }).observe({ type: "layout-shift", buffered: true });
`;

for (const width of [375, 320]) {
  test.describe(`폰 ${width}`, () => {
    test.use({ viewport: { width, height: 800 } });

    // D-1 — 폰 읽기 전용이 서버 렌더부터 적용된다(CSS 미디어쿼리). JS를 끄면 수화가 없으니 첫 렌더 그대로다.
    test(`D-1 첫 렌더(JS 끔)부터 폰에서 보이는 입력 0 · 읽기 글자 보임 (${width})`, async ({ browser, page }) => {
      await loginAsSysadmin(page);
      const state = await page.context().storageState();
      const context = await browser.newContext({ baseURL: BASE_URL, storageState: state, javaScriptEnabled: false, viewport: { width, height: 800 } });
      const noJs = await context.newPage();
      for (const path of D1_PATHS) {
        await noJs.goto(path);
        const visibleEdit = noJs.locator("table input, table select, table textarea, table button").filter({ visible: true }).filter({ hasNotText: /^(비활성화|활성화|삭제)$/ });
        expect(await visibleEdit.count(), `${path} 보이는 편집 요소`).toBe(0);
        await expect(noJs.locator("tbody td").filter({ visible: true, hasText: /\S/ }).first()).toBeVisible();
      }
      await noJs.goto("/admin/people/roles");
      await expect(noJs.locator("tbody td").filter({ visible: true, hasText: "대표" }).first()).toBeVisible();
      await expect(noJs.locator("tbody td").filter({ visible: true, hasText: "전사" }).first()).toBeVisible();
      await context.close();
    });

    test(`D-1 수화 뒤에도 보이는 입력 0 · 레이아웃 이동(CLS) 0.1 미만 (${width})`, async ({ browser }) => {
      const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width, height: 800 } });
      const adminPage = await context.newPage();
      await loginAsSysadmin(adminPage);
      for (const path of D1_PATHS) {
        const fresh = await context.newPage();
        await fresh.addInitScript(CLS_INIT);
        await fresh.goto(path);
        await fresh.waitForLoadState("networkidle");
        await fresh.waitForTimeout(800);
        const visibleEdit = fresh.locator("table input, table select, table textarea, table button").filter({ visible: true }).filter({ hasNotText: /^(비활성화|활성화|삭제)$/ });
        expect(await visibleEdit.count(), `${path} 보이는 편집 요소`).toBe(0);
        const cls = await fresh.evaluate(() => (window as unknown as { __cls: number }).__cls);
        expect(cls, `${path} CLS`).toBeLessThan(0.1);
        await fresh.close();
      }
      await context.close();
    });

    // D-3 — 접힌 칸 좌우가 같은 표 주 행 첫 칸과 같은 --s-4다.
    test(`D-3 접힌 줄 좌우 여백이 주 행 첫 칸과 같다 (${width})`, async ({ page }) => {
      await recordAction(SYSTEM_VIEWER, { actionType: "document_create", entity: "code_items", detail: { memo: `w5-${randomUUID()}` } });
      await loginAsSysadmin(page);
      await page.goto("/admin/action-log?actionType=document_create");
      const pads = await page.evaluate(() => {
        const folded = document.querySelector("tbody td[colspan]");
        const first = document.querySelector("tbody tr:first-child td:first-child");
        if (!folded || !first) return null;
        const f = getComputedStyle(folded);
        const m = getComputedStyle(first);
        return { foldedLeft: f.paddingLeft, foldedRight: f.paddingRight, mainLeft: m.paddingLeft };
      });
      expect(pads).not.toBeNull();
      const s4 = `${await tokenNumber(page, "--s-4")}px`;
      expect(pads!.mainLeft).toBe(s4);
      expect(pads!.foldedLeft).toBe(s4);
      expect(pads!.foldedRight).toBe(s4);
    });

    // D-5 — 폰에서 1차를 숨긴 계급 화면의 제목 → 표가 다른 목록 화면처럼 --s-4다(빈 머리 줄 자리 없음).
    test(`D-5 /admin/people/roles 제목과 표 사이가 --s-4다 (${width})`, async ({ page }) => {
      await loginAsSysadmin(page);
      await page.goto("/admin/people/roles");
      const gap = await page.evaluate(() => {
        const title = document.querySelector('[data-ui="screen-title"]');
        const table = document.querySelector("table");
        if (!title || !table) return null;
        return table.getBoundingClientRect().top - title.getBoundingClientRect().bottom;
      });
      expect(gap).toBe(await tokenNumber(page, "--s-4"));
    });

    // D-8 — /pnl
    test(`D-8 /pnl 「리저브 대장」 줄과 빈 화면 사이가 --s-3이다 (${width})`, async ({ page }) => {
      await loginAsSysadmin(page);
      await page.goto("/pnl");
      await expect(page.getByRole("link", { name: "리저브 대장", exact: true })).toBeVisible();
      const gap = await page.evaluate(() => {
        const anchor = Array.from(document.querySelectorAll("a")).find((a) => a.textContent?.trim() === "리저브 대장");
        const empty = document.querySelector('[data-ui="empty-state"]');
        if (!anchor || !empty) return null;
        return empty.getBoundingClientRect().top - anchor.getBoundingClientRect().bottom;
      });
      expect(gap).toBe(await tokenNumber(page, "--s-3"));
    });

    // D-10 — 권한 · 노출표 폰 계급 select radius가 입력 토큰이다.
    for (const path of ["/admin/permissions", "/admin/visibility"]) {
      test(`D-10 ${path} 계급 select radius가 입력 토큰이다 (${width})`, async ({ page }) => {
        await loginAsSysadmin(page);
        await page.goto(path);
        const radius = await tokenNumber(page, "--radius-control");
        const selects = page.locator("#main-content select").filter({ visible: true });
        await expect(selects.first()).toBeVisible();
        for (const value of await selects.evaluateAll((nodes) => nodes.map((node) => parseFloat(getComputedStyle(node).borderTopLeftRadius)))) {
          expect(value).toBe(radius);
        }
      });
    }
  });
}

// 연차 잔고 — 폰에서도 면 없이 텍스트 한 줄.
async function loginDrafter(browser: Browser, creds: { email: string; password: string }): Promise<Page> {
  const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 375, height: 800 } });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("이메일").fill(creds.email);
  await page.getByLabel("비밀번호").fill(creds.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return page;
}

test("연차 /leave 잔고가 면 없이 텍스트 한 줄이다 (375)", async ({ browser }) => {
  await onStableSeoulDay(async (today) => {
    const org = await setupLeaveOrg(today);
    const page = await loginDrafter(browser, org.drafter);
    await page.goto("/leave");
    const balance = page.getByTestId("leave-balance");
    await expect(balance).toBeVisible();
    const surface = await balance.evaluate((element) => {
      const style = getComputedStyle(element.parentElement as HTMLElement);
      return { border: style.borderTopWidth, radius: style.borderTopLeftRadius, bg: style.backgroundColor };
    });
    expect(surface).toEqual({ border: "0px", radius: "0px", bg: "rgba(0, 0, 0, 0)" });
    await page.context().close();
  });
});
