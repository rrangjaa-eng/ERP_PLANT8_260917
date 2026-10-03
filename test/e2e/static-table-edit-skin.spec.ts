import { test, expect, type Page } from "@playwright/test";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createRole } from "@/domain/permissions/roles";
import { loginAsSysadmin } from "./row-actions-helpers";

// 웨이브 6 DOM 감사 P1 · P2 — 코드표 · 계급의 편집 표(StaticTable `editable`).
// SYSTEM §7-2(801) 「표 안 입력: 테두리 없이 아래 1px --accent 밑줄」 · §7-3(894) · §7-13(1095) 「편집할 수 있는 셀이 하나라도 있으면 머리글 --g-100 + --g-950」(Table `.editable`과 같은 값 — 견적 표 · 코드표 · 계급 모두).
// 기대 값은 리터럴 rgb가 아니라 계산된 역할 토큰 값이다.
const SCREENS = [
  { name: "코드표 프로젝트 상태", url: "/admin/code-tables?tableKey=project_status" },
  { name: "코드표 증빙 종류", url: "/admin/code-tables?tableKey=evidence_type" },
  { name: "계급", url: "/admin/people/roles" },
] as const;

async function resolved(page: Page, property: "backgroundColor" | "color", token: string): Promise<string> {
  return page.evaluate(
    ([prop, value]) => {
      const probe = document.createElement("div");
      probe.style.setProperty(prop === "color" ? "color" : "background-color", `var(${value})`);
      document.body.append(probe);
      const out = getComputedStyle(probe)[prop as "color"];
      probe.remove();
      return out;
    },
    [property, token] as const,
  );
}

for (const width of [1280, 768]) {
  for (const screen of SCREENS) {
    test(`${screen.name} ${width} — 표 안 입력은 아래 1px --accent 밑줄뿐이고 머리글 면은 --g-100이다`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await loginAsSysadmin(page);
      await page.goto(screen.url);
      const controls = page.locator("main table :is(input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select)").locator("visible=true");
      await expect(controls.first()).toBeVisible();
      const accent = await resolved(page, "color", "--accent");
      const sides = await controls.evaluateAll((nodes) =>
        nodes.map((node) => {
          const cs = getComputedStyle(node);
          return { label: node.getAttribute("aria-label") ?? node.tagName, top: cs.borderTopWidth, left: cs.borderLeftWidth, right: cs.borderRightWidth, bottom: cs.borderBottomWidth, bottomColor: cs.borderBottomColor };
        }),
      );
      expect(sides.length).toBeGreaterThan(0);
      for (const side of sides) {
        expect(side, `${side.label} 테두리`).toMatchObject({ top: "0px", left: "0px", right: "0px", bottom: "1px", bottomColor: accent });
      }
      const header = await page.locator("main table thead th").first().evaluate((th) => ({ bg: getComputedStyle(th).backgroundColor, color: getComputedStyle(th).color }));
      expect(header.bg, "머리글 면").toBe(await resolved(page, "backgroundColor", "--g-100"));
      expect(header.color, "머리글 글자").toBe(await resolved(page, "color", "--g-950"));
    });
  }
}

// 웨이브 6 재검사 N1 · Q1 — 폰(<700)은 읽기 전용 표다(편집 칸 0).
// N1: 편집 셀이 0이면 머리글은 읽기 표 면(--surface-head + --text-muted)이다(SYSTEM 894) — 편집 신호 면(--g-100)이 아니다. 서버 렌더부터(CSS 미디어쿼리) 맞는다.
// Q1: SYSTEM 876 「동작 열(「비활성화」·「삭제」)은 Q4 A대로 44px로 보인다」 — 폰에서도 동작 버튼이 44px 이상으로 보이고 320에서 가로 넘침이 없다.
const PHONE_WIDTHS = [375, 320] as const;

for (const width of PHONE_WIDTHS) {
  for (const screen of SCREENS) {
    test(`${screen.name} ${width} — 폰은 읽기 전용이라 머리글이 읽기 표 면이고 가로 넘침이 없다`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await loginAsSysadmin(page);
      await page.goto(screen.url);
      await expect(page.locator("main table thead th").locator("visible=true").first()).toBeVisible();
      await expect(page.locator("main table :is(input:not([type=hidden]), select)").locator("visible=true")).toHaveCount(0);
      const headers = await page.locator("main table thead th").locator("visible=true").evaluateAll((nodes) =>
        nodes.map((th) => ({ bg: getComputedStyle(th).backgroundColor, color: getComputedStyle(th).color })),
      );
      expect(headers.length).toBeGreaterThan(0);
      const readBg = await resolved(page, "backgroundColor", "--surface-head");
      const readColor = await resolved(page, "color", "--text-muted");
      const editBg = await resolved(page, "backgroundColor", "--g-100");
      expect(readBg).not.toBe(editBg);
      for (const header of headers) {
        expect(header.bg, "폰 머리글 면").toBe(readBg);
        expect(header.color, "폰 머리글 글자").toBe(readColor);
      }
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(width);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
  }

  test(`코드표 프로젝트 상태 ${width} — 폰에서도 「비활성화」·「삭제」 동작 버튼이 44px 이상으로 보인다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await loginAsSysadmin(page);
    await page.goto("/admin/code-tables?tableKey=project_status");
    const deactivate = page.locator("main table tbody").getByRole("button", { name: /^(비활성화|활성화)$/ }).locator("visible=true");
    const remove = page.locator("main table tbody").getByRole("button", { name: "삭제" }).locator("visible=true");
    await expect(deactivate.first()).toBeVisible();
    await expect(remove.first()).toBeVisible();
    for (const button of [...(await deactivate.all()), ...(await remove.all())]) {
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(width);
  });

  test(`계급 ${width} — 폰에서도 사용자 만든 계급의 「삭제」 동작 버튼이 44px 이상으로 보인다`, async ({ page }) => {
    await createRole(SYSTEM_VIEWER, { name: `E2E 폰삭제${width}${Date.now() % 100000}` });
    await page.setViewportSize({ width, height: 900 });
    await loginAsSysadmin(page);
    await page.goto("/admin/people/roles");
    const remove = page.locator("main table tbody").getByRole("button", { name: "삭제" }).locator("visible=true");
    await expect(remove.first()).toBeVisible();
    for (const button of await remove.all()) {
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(width);
  });
}
