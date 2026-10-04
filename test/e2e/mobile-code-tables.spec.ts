import { test, expect, type Locator, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { loginAsSysadmin, tokenNumber } from "./row-actions-helpers";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertCodeItem, listCodeItems, setCodeItemActive } from "@/repositories/code-tables";

// §3 터치 목표: 폰에서 모든 행동 요소 최소 44×44. code-tables.module.css의
// .toggle은 밑줄 링크라 글자 줄 높이(20px 안팎)로 찌그러져 있다 — 공유
// Button .tertiary에서 고친 것과 같은 결함이 이 화면별 CSS 모듈에 남아 있었다.
test.describe("폰 375 /admin/code-tables 터치 목표 (§3)", () => {
  test("코드표 선택 링크와 숨김 토글이 44×44 이상이다", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/admin/code-tables");

    const targets = [
      page.getByRole("navigation", { name: "코드표 선택" }).getByRole("link").first(),
      page.getByRole("link", { name: /숨김 포함|숨김 제외/ }),
    ];

    for (const target of targets) {
      const box = await target.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});

// 04-25(D-93 · UI-SPEC S14 overflow, 2026-09-23 사용자 확정): 폰(<700)에서
// 설명은 P2 — 각 행 아래 접힌 줄에 한 번만 보이고, 값·정렬 열은 P3로
// 숨는다(SYSTEM.md §7-3 「폰 전략 = 칸 접기」). 가로 스크롤 0.
test.describe("폰 375 /admin/code-tables 설명 접힌 줄 (S14 overflow)", () => {
  // 이 스펙이 만든 항목을 비활성으로 돌린다 — 활성으로 남으면 같은 DB에서 뒤따르는 mobile-w5의 CLS 스펙이 보는 project_status 표에
  // 긴 이름(폰설명…)이 끼어, 동작 칸 폭이 서체 교체(대체 서체 → Pretendard) 전후로 한 줄/두 줄을 오가며 CLS가 0.24가 된다(CI run 37152655467).
  test.afterAll(async () => {
    const scope = { rows: "all", includeArchived: false } as const;
    const rows = await listCodeItems(SYSTEM_VIEWER, { tableKey: "project_status", scope, includeInactive: true });
    for (const row of rows.filter((item) => item.value.startsWith("m-desc-"))) await setCodeItemActive(SYSTEM_VIEWER, row.id, false);
  });

  test("설명이 이름 아래 접힌 줄에 한 번만 보이고 값·정렬 열이 숨고 동작 열은 보인다, 가로 스크롤 0", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const stamp = Date.now();
    const value = `m-desc-${stamp}`;
    const label = `폰설명${stamp % 100000}`;
    // 40자 상한 안에서 폰 폭을 넘는 긴 설명 — 말줄임 없이 줄바꿈해야 한다.
    const description = "무대·부스 설치와 철거 공사 · 현장 인력과 장비 반입까지 포함";

    await page.goto("/admin/code-tables?new=1");
    // 04.6-15: 「코드 추가」는 아래 시트 패널이다 — 성공하면 시트가 열린 채 칸이 비므로 Esc로 닫고 목록을 본다.
    const dialog = page.locator('dialog[data-ui="side-panel"]');
    const form = dialog.locator("#code-item-form");
    await form.getByLabel("값", { exact: true }).fill(value);
    await form.getByLabel("이름", { exact: true }).fill(label);
    await form.getByLabel("설명", { exact: true }).fill(description);
    await dialog.getByRole("button", { name: "코드 추가" }).click();
    await expect(dialog.getByRole("status")).toHaveText("코드 추가됨");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    // 사용자 결정 2026-10-03 14:57 KST 카드 「폰은 읽기만」 — 폰의 표 안에는 입력 칸 · 선택 상자가 없고 이름 · 설명이 글자로 보인다.
    // 동작 열(「비활성화」 · 「삭제」)은 Q4 A · SYSTEM 876대로 폰에서도 보인다(아래 44px 단언) — 그 두 버튼 말고 보이는 버튼은 없다.
    // 폰의 편집 요소는 DOM에 있되 CSS로 숨는다(첫 렌더부터 — 04.6 W5 D-1) — 의미는 「보이는 입력 0」이다.
    await expect(page.locator("table input, table select").filter({ visible: true })).toHaveCount(0);
    await expect(page.locator("table button").filter({ visible: true }).filter({ hasNotText: /^(비활성화|활성화|삭제)$/ })).toHaveCount(0);
    const nameText = page.locator("tbody th").filter({ visible: true, hasText: label }).first();
    // 한 번만 — 같은 설명을 폰에서 두 번 보이지 않는다.
    const descriptionText = page.locator("tbody td").filter({ visible: true, hasText: description });
    await expect(descriptionText).toHaveCount(1);
    await expect(nameText).toBeVisible();

    // P2: 설명은 이름 칸 아래 줄에 있고, 행 폭 전체를 쓴다.
    const nameBox = await nameText.boundingBox();
    const descriptionBox = await descriptionText.boundingBox();
    expect(nameBox).not.toBeNull();
    expect(descriptionBox).not.toBeNull();
    expect(descriptionBox!.y).toBeGreaterThanOrEqual(nameBox!.y + nameBox!.height);
    expect(descriptionBox!.width).toBeGreaterThan(nameBox!.width);

    // P3: 값·정렬 열(머리글과 칸)이 숨는다. P1 머리글(이름·상태·동작)이 보이는 것부터 확인해 표 역할이 살아 있음을 고정한다.
    // 04.6-15 Q4 A · SYSTEM 876 — 동작 열은 폰에서도 P1로 보이고 두 버튼은 44px 이상이다(편집 칸 · 추가 행만 폰에 없다).
    for (const header of ["이름", "상태", "동작"]) {
      await expect(page.getByRole("columnheader", { name: header, exact: true })).toBeVisible();
    }
    for (const button of await page.locator("tbody button").filter({ visible: true }).all()) {
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    for (const header of ["값", "설명", "정렬"]) {
      await expect(page.getByRole("columnheader", { name: header, exact: true })).toBeHidden();
    }
    await expect(page.getByText(value, { exact: true })).toBeHidden();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});

// 04.6 W7 O1: 폰 320 증빙 종류 동작 칸(폭 119.8)에서 「삭제」가 줄바꿈되어 행 높이가 68에서 128로 늘었다(0.2px 부족).
// 사용자 결정 2026-10-04 10:34 KST 「한 줄로 조정」 — 폰은 위험 행동 앞 여백을 --s-2로 줄여 한 줄을 지킨다.
// 폰은 동작마다 44px 누르는 상자에 글자가 가운데라 상자 안 여백이 간격에 더해지므로 글자 사이 간격은 --s-8 이상 그대로다. PC는 --s-8 그대로.
const CLS_INIT = `
  window.__cls = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
  }).observe({ type: "layout-shift", buffered: true });
`;

async function textGap(row: Locator): Promise<{ gap: number; sameLine: boolean }> {
  return row.evaluate((tr) => {
    const textBox = (button: Element): DOMRect => {
      const range = document.createRange();
      range.selectNodeContents(button);
      return range.getBoundingClientRect();
    };
    const buttons = Array.from(tr.querySelectorAll("button")).filter((b) => (b as HTMLElement).offsetParent !== null);
    const toggle = buttons.find((b) => /^(비활성화|활성화)$/.test(b.textContent?.trim() ?? ""));
    const remove = buttons.find((b) => b.textContent?.trim() === "삭제");
    if (!toggle || !remove) throw new Error("토글 · 삭제 버튼 없음");
    const a = textBox(toggle);
    const b = textBox(remove);
    return { gap: b.left - a.right, sameLine: Math.abs(b.top - a.top) < 1 };
  });
}

async function assertOneLine(page: Page, tableKey: string): Promise<number> {
  await page.goto(`/admin/code-tables?tableKey=${tableKey}`);
  const rows = page.locator("tbody tr").filter({ has: page.getByRole("button", { name: "삭제" }).filter({ visible: true }) });
  const count = await rows.count();
  expect(count, `${tableKey} 삭제가 보이는 행`).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    const toggle = await row.getByRole("button", { name: /^(비활성화|활성화)$/ }).boundingBox();
    const remove = await row.getByRole("button", { name: "삭제" }).boundingBox();
    expect(toggle, `${tableKey} ${index}행 토글 상자`).not.toBeNull();
    expect(remove, `${tableKey} ${index}행 삭제 상자`).not.toBeNull();
    expect(Math.abs(remove!.y - toggle!.y), `${tableKey} ${index}행 삭제와 토글이 한 줄(Δy)`).toBeLessThan(1);
    expect(remove!.x, `${tableKey} ${index}행 삭제는 토글 오른쪽`).toBeGreaterThan(toggle!.x + toggle!.width - 0.5);
  }
  return count;
}

test.describe("폰 320 /admin/code-tables 동작 칸 줄바꿈 (W7 O1)", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test.afterAll(async () => {
    const scope = { rows: "all", includeArchived: false } as const;
    const rows = await listCodeItems(SYSTEM_VIEWER, { tableKey: "project_status", scope, includeInactive: true });
    for (const row of rows.filter((item) => item.value.startsWith("m-long-"))) await setCodeItemActive(SYSTEM_VIEWER, row.id, false);
  });

  for (const tableKey of ["evidence_type", "project_status"]) {
    test(`「삭제」는 「비활성화」와 같은 줄 오른쪽에 있다 (${tableKey})`, async ({ page }) => {
      await loginAsSysadmin(page);
      await assertOneLine(page, tableKey);
    });
  }

  // 동작 칸이 한 줄(noWrap)로 폭을 가져가도 이름 칸은 낱말을 쪼개지 않는다 — 「세금계산서」가 「세금계산 / 서」로 갈리던 결함(Codex 후보 1 · DOM 감사 2026-10-04).
  test("이름 칸의 짧은 낱말이 한 줄이다 (evidence_type)", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/code-tables?tableKey=evidence_type");
    await page.evaluate(() => document.fonts.ready);
    for (const label of ["세금계산서", "현금영수증"]) {
      const lines = await page.locator("tbody tr > :is(td, th)").filter({ visible: true, hasText: new RegExp(`^${label}$`) }).first().evaluate((cell) => {
        // 글자 노드의 줄 상자만 센다(감싼 div 상자는 빼고).
        const tops = new Set<number>();
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of Array.from(range.getClientRects())) if (rect.width > 0) tops.add(Math.round(rect.top));
        }
        return tops.size;
      });
      expect(lines, label).toBe(1);
    }
  });

  test("폰에서 위험 행동 앞 여백은 앞 행동 뒤 --s-2이고 「삭제」 자신에는 없다", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/code-tables?tableKey=evidence_type");
    const remove = page.locator("tbody").getByRole("button", { name: "삭제" }).filter({ visible: true }).first();
    const margins = await remove.evaluate((element) => {
      const style = getComputedStyle(element);
      const prev = element.previousElementSibling as HTMLElement | null;
      return { own: style.marginInlineStart, prevEnd: prev ? getComputedStyle(prev).marginInlineEnd : "none" };
    });
    const s2 = await tokenNumber(page, "--s-2");
    expect(margins.own).toBe("0px");
    expect(parseFloat(margins.prevEnd)).toBeCloseTo(s2, 1);
  });

  for (const width of [320, 375]) {
    test(`토글 글자와 「삭제」 글자 사이는 --s-8 이상이다 (${width})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 640 });
      await loginAsSysadmin(page);
      await page.goto("/admin/code-tables?tableKey=evidence_type");
      const s8 = await tokenNumber(page, "--s-8");
      const rows = page.locator("tbody tr").filter({ has: page.getByRole("button", { name: "삭제" }).filter({ visible: true }) });
      const count = await rows.count();
      expect(count).toBeGreaterThan(0);
      for (let index = 0; index < count; index += 1) {
        const { gap, sameLine } = await textGap(rows.nth(index));
        expect(sameLine, `${width} ${index}행 한 줄`).toBe(true);
        console.log(`glyph-gap ${width} row${index}: ${gap}`);
        expect(gap, `${width} ${index}행 글자 간격`).toBeGreaterThanOrEqual(s8 - 0.5);
      }
    });
  }

  for (const width of [320, 375]) {
    test(`긴 이름 항목이 있어도 CLS < 0.1 이고 가로 넘침이 없다 (${width})`, async ({ page, browser }) => {
      await loginAsSysadmin(page);
      const stamp = Date.now();
      const label = "고객 확인 대기 중 견적 재협의 및 일정 조율 필요";
      await insertCodeItem(SYSTEM_VIEWER, { tableKey: "project_status", value: `m-long-${width}-${stamp}`, label, sortOrder: 99 });
      const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100", storageState: await page.context().storageState(), viewport: { width, height: 800 } });
      const fresh = await context.newPage();
      await fresh.addInitScript(CLS_INIT);
      await fresh.goto("/admin/code-tables?tableKey=project_status");
      await fresh.waitForLoadState("networkidle");
      await fresh.waitForTimeout(800);
      const cls = await fresh.evaluate(() => (window as unknown as { __cls: number }).__cls);
      console.log(`CLS ${width}: ${cls}`);
      const longRow = fresh.locator("tbody tr").filter({ hasText: label }).first();
      const toggle = await longRow.getByRole("button", { name: /^(비활성화|활성화)$/ }).boundingBox();
      const remove = await longRow.getByRole("button", { name: "삭제" }).boundingBox();
      console.log(`long row height ${width}: ${(await longRow.boundingBox())?.height}`);
      expect(toggle).not.toBeNull();
      expect(remove).not.toBeNull();
      // 긴 이름 행은 동작 칸이 좁아져 두 줄이 될 수 있다(사용자 결정은 보통 행) — 줄바꿈되면 들여쓰지 않는다.
      if (Math.abs(remove!.y - toggle!.y) >= 1) {
        expect(Math.abs(remove!.x - toggle!.x), `${width} 줄바꿈 시 삭제 x · 토글 x`).toBeLessThanOrEqual(0.5);
      }
      const overflow = await fresh.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
      expect(overflow.s, `${width} 가로 넘침`).toBeLessThanOrEqual(overflow.c);
      expect(cls, `${width} CLS`).toBeLessThan(0.1);
      await context.close();
    });
  }
});
