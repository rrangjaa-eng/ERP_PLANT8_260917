import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createOrgUnit } from "@/domain/org";

// 04.6 웨이브 1~4 디자인 검토 결함(04.6-W1-4-design-review.md) 고침의 DOM 실측 — PC 1280 · 태블릿 768.
// 판정은 계산값으로만 한다(스크린샷 육안 판정 없음).

async function loginAsAdmin(page: Page): Promise<void> {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

for (const width of [1280, 768]) {
  test.describe(`${width} /admin/people/org 720 기둥 · 행동 줄 간격 (B7·B9·B10)`, () => {
    test.use({ viewport: { width, height: 900 } });

    test(`목록과 이름 입력이 720 기둥 안이고 행동 줄과 목록 사이가 12px다`, async ({ page }) => {
      await createOrgUnit(SYSTEM_VIEWER, { name: `기둥본부-${randomUUID().slice(0, 8)}` });
      await loginAsAdmin(page);
      await page.goto("/admin/people/org");

      const list = page.locator("main ul").first();
      const listBox = await list.boundingBox();
      expect(listBox!.width, "목록 폭").toBeLessThanOrEqual(721);
      const inputs = page.locator("main ul input");
      expect(await inputs.count()).toBeGreaterThan(0);
      for (let i = 0; i < (await inputs.count()); i += 1) {
        const box = await inputs.nth(i).boundingBox();
        expect(box!.x + box!.width - listBox!.x, `입력 ${i} 오른쪽 끝(기둥 기준)`).toBeLessThanOrEqual(721);
      }

      const bar = page.locator('[data-ui="primary-button"]').locator("xpath=..");
      const barBox = await bar.boundingBox();
      expect(Math.round(listBox!.y - (barBox!.y + barBox!.height)), "행동 줄 → 목록 간격").toBe(12);
    });
  });
}

// 7 — 날짜 입력의 포커스 링. Tab으로 도달한 날짜 입력(또는 조상 3단)에 SYSTEM 포커스 링(outline 2px)이 있는가.
async function focusRingOf(page: Page, selector: string): Promise<{ reached: boolean; width: number; style: string }> {
  // 칸이 그려지기 전(loading.tsx 뼈대 · 느린 서버 렌더)에 Tab을 누르면 80번이 뼈대 위에서 헛돈다 — 칸이 보일 때까지 기다린 뒤 누른다.
  await page.locator(selector).waitFor({ state: "visible" });
  for (let i = 0; i < 80; i += 1) {
    const reached = await page.evaluate((sel) => document.activeElement === document.querySelector(sel), selector);
    if (reached) break;
    await page.keyboard.press("Tab");
  }
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el || document.activeElement !== el) return { reached: false, width: 0, style: "" };
    let node: Element | null = el;
    for (let depth = 0; depth < 4 && node; depth += 1, node = node.parentElement) {
      const cs = getComputedStyle(node);
      const width = parseFloat(cs.outlineWidth);
      if (cs.outlineStyle !== "none" && width > 0) return { reached: true, width, style: `${cs.outlineStyle} ${cs.outlineColor}` };
      if (cs.boxShadow !== "none") return { reached: true, width: 2, style: `shadow ${cs.boxShadow}` };
    }
    return { reached: true, width: 0, style: "none" };
  }, selector);
}

test.describe("날짜 입력 포커스 링 (SYSTEM 포커스 링 2px)", () => {
  test("/projects 기간 시작·끝 날짜 입력", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/projects");
    for (const selector of ["input#from", "input#to"]) {
      const ring = await focusRingOf(page, selector);
      expect(ring.reached, `${selector} Tab 도달`).toBe(true);
      expect(ring.width, `${selector} 링 두께(${ring.style})`).toBeGreaterThanOrEqual(2);
    }
  });

  test("/admin/people?new=1 패널 날짜 입력(발령일·입사일)", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/people?new=1");
    for (const selector of ["input#effectiveFrom", "input#hireDate"]) {
      const ring = await focusRingOf(page, selector);
      expect(ring.reached, `${selector} Tab 도달`).toBe(true);
      expect(ring.width, `${selector} 링 두께(${ring.style})`).toBeGreaterThanOrEqual(2);
    }
  });
});
