import { test, expect, type Locator, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { randomUUID } from "node:crypto";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertVendor } from "@/repositories/vendors";

// 04.6 웨이브 1~4 디자인 검토 결함(04.6-W1-4-design-review.md) 고침의 DOM 실측 — 폰 375 · 320.
// 판정은 계산값(Range 줄 수 · 보이는 열 수 · 입력 자기 넘침)으로만 한다. 스크린샷 육안 판정 없음.

async function loginAsAdmin(page: Page): Promise<void> {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

// 낱말(공백으로 가른 글자 덩어리)이 두 줄 이상 걸쳐 그려진 것 — keep-all 아래에서 쪼개짐의 판정.
async function brokenWords(locator: Locator): Promise<string[]> {
  return locator.evaluateAll((elements) => {
    const broken: string[] = [];
    for (const element of elements) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? "";
        for (const match of text.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, match.index ?? 0);
          range.setEnd(node, (match.index ?? 0) + match[0].length);
          const lines = new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top)));
          if (lines.size > 1) broken.push(match[0]);
        }
      }
    }
    return broken;
  });
}

async function lineCount(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
  });
}

async function visibleHeaderCount(page: Page): Promise<number> {
  return page.locator("table thead th").filter({ visible: true }).count();
}

// 입력이 자기 상자 안에 값을 다 보이는가(scrollWidth ≤ clientWidth).
async function selfOverflow(page: Page): Promise<string[]> {
  // 시드 계급 이름 입력만 잰다 — 다른 스펙이 남긴 긴 이름은 입력 안에서 넘쳐도 되는 경우다.
  return page.locator("table tbody input:visible").evaluateAll((elements) =>
    elements.flatMap((element) =>
      element instanceof HTMLInputElement && ["대표", "본부 책임자", "팀장", "기획 PM", "시스템 관리자"].includes(element.value) && element.scrollWidth > element.clientWidth
        ? [`${element.value} ${element.clientWidth}/${element.scrollWidth}`]
        : [],
    ),
  );
}

for (const width of [375, 320]) {
  test.describe(`폰 ${width} 04.6 W1-4 결함 고침`, () => {
    test.use({ viewport: { width, height: 800 } });

    test(`/admin/people ${width} 행 머리글(이름) 낱말이 쪼개지지 않는다 (B1)`, async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto("/admin/people");
      // 시드 이름만 잰다 — 다른 스펙이 남긴 긴 한 낱말 이름은 쪼개져도 되는 경우다.
      const names = page.locator("table tbody th[scope=row]").filter({ hasText: /^E2E (Admin|Employee)$/ });
      expect(await names.count()).toBeGreaterThan(0);
      expect(await brokenWords(names)).toEqual([]);
    });

    test(`/admin/people/roles ${width} 보이는 열이 3개 이하다 (B2·B3)`, async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto("/admin/people/roles");
      expect(await visibleHeaderCount(page)).toBeLessThanOrEqual(3);
    });

    test(`/admin/people/roles ${width} 입력이 자기 폭 안에 담긴다 (B4)`, async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto("/admin/people/roles");
      expect(await selfOverflow(page)).toEqual([]);
    });

    test(`/admin/code-tables ${width} 머리글 낱말이 쪼개지지 않고 머리 줄이 한 줄이다 (C4·C5)`, async ({ page }) => {
      await loginAsAdmin(page);
      for (const tableKey of ["project_status", "evidence_type"]) {
        await page.goto(`/admin/code-tables?tableKey=${tableKey}`);
        const headers = page.locator("table thead th").filter({ visible: true });
        expect(await brokenWords(headers)).toEqual([]);
        for (let i = 0; i < (await headers.count()); i += 1) {
          expect(await lineCount(headers.nth(i)), `${tableKey} 머리글 ${i} 줄 수`).toBe(1);
        }
      }
    });

    test(`/admin/vendors ${width} (?new=1 포함) 머리글 낱말이 쪼개지지 않고 머리 줄 높이가 다른 목록과 같다 (R2)`, async ({ page }) => {
      await insertVendor(SYSTEM_VIEWER, { name: `머리글대상-${Date.now()}`, normalizedName: `머리글대상-${randomUUID()}` });
      await loginAsAdmin(page);
      for (const url of ["/admin/vendors", "/admin/vendors?new=1"]) {
        await page.goto(url);
        const headers = page.locator("table thead th").filter({ visible: true });
        expect(await brokenWords(headers), `${url} 쪼개진 낱말`).toEqual([]);
        for (let i = 0; i < (await headers.count()); i += 1) {
          expect(await lineCount(headers.nth(i)), `${url} 머리글 ${i} 줄 수`).toBe(1);
        }
      }
    });

    // 04.6 사용자 결정 2026-10-03 14:57 KST 카드 「폰은 읽기만」 — 폰의 표 안에는 입력 칸 · 선택 상자 · 편집 버튼이 없고 값은 글자로 보인다(SYSTEM §7-3 「폰에서 셀 편집 없음」).
    test(`/admin/people/roles ${width} 표 안 입력 0 · 값이 글자 · 계급 추가 숨김 (폰은 읽기만)`, async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto("/admin/people/roles");
      const table = page.locator("table");
      await expect(table.locator("input, select, textarea").filter({ visible: true })).toHaveCount(0);
      await expect(table.locator("button").filter({ visible: true }).filter({ hasNotText: /^(비활성화|활성화|삭제)$/ })).toHaveCount(0);
      for (const text of ["대표", "본부 책임자", "팀장", "기획 PM", "시스템 관리자"]) {
        await expect(table.getByRole("cell", { name: text, exact: true }).first()).toBeVisible();
      }
      await expect(table.getByRole("cell", { name: "전사", exact: true }).first()).toBeVisible();
      await expect(page.locator('[data-ui="primary-button"]')).toBeHidden();
    });

    test(`/admin/code-tables ${width} 두 코드표 표 안 입력 0 · 값이 글자 · 코드 추가 숨김 (폰은 읽기만)`, async ({ page }) => {
      await loginAsAdmin(page);
      for (const tableKey of ["project_status", "evidence_type"]) {
        await page.goto(`/admin/code-tables?tableKey=${tableKey}`);
        const table = page.locator("table");
        await expect(table.locator("input, select, textarea").filter({ visible: true }), `${tableKey} 표 안 보이는 편집 요소`).toHaveCount(0);
        await expect(table.locator("button").filter({ visible: true }).filter({ hasNotText: /^(비활성화|활성화|삭제)$/ }), `${tableKey} 표 안 보이는 편집 버튼`).toHaveCount(0);
        await expect(table.locator("tbody td").filter({ visible: true }).first()).not.toHaveText("");
        await expect(page.locator('[data-ui="primary-button"]')).toBeHidden();
      }
      await page.goto("/admin/code-tables?tableKey=evidence_type");
      await expect(page.getByText("세금계산서").first()).toBeVisible();
    });

    // R4 — 패널 안 세로 간격이 어디서 나는지 잰다: 형제 블록 사이 빈칸 중 큰 것(척도 최대 48 초과).
    test(`/admin/field-definitions?new=1 ${width} 패널 안 형제 블록 사이 세로 간격이 척도(≤48) 안이다 (R4)`, async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto("/admin/field-definitions?new=1");
      const gaps = await page.locator('dialog[data-ui="side-panel"]').evaluate((dialog) => {
        const out: string[] = [];
        for (const parent of Array.from(dialog.querySelectorAll("*"))) {
          const kids = Array.from(parent.children).filter((child) => {
            const rect = child.getBoundingClientRect();
            return rect.height > 0 && getComputedStyle(child).position !== "absolute" && getComputedStyle(child).position !== "fixed";
          });
          for (let i = 1; i < kids.length; i += 1) {
            const gap = Math.round(kids[i]!.getBoundingClientRect().top - kids[i - 1]!.getBoundingClientRect().bottom);
            if (gap > 48) out.push(`${parent.tagName}.${parent.className.toString().slice(0, 30)} ${kids[i - 1]!.tagName}→${kids[i]!.tagName} ${gap}`);
          }
        }
        return out;
      });
      expect(gaps).toEqual([]);
    });
  });
}

// PC 1280 — 폰 읽기 전용이 PC 편집을 건드리지 않는다(같은 두 화면의 표 안 입력이 그대로 있다).
test.describe("PC 1280 두 화면 표 안 편집 유지 (폰은 읽기만의 대조)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("/admin/people/roles · /admin/code-tables 표 안에 입력 · 선택 상자가 있다", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/people/roles");
    await expect(page.locator("table tbody input").first()).toBeVisible();
    await expect(page.locator("table tbody select").first()).toBeVisible();
    await page.goto("/admin/code-tables?tableKey=evidence_type");
    await expect(page.locator("table tbody input").first()).toBeVisible();
    await expect(page.locator("table tbody select").first()).toBeVisible();
    await expect(page.locator('[data-ui="primary-button"]')).toBeVisible();
  });
});
