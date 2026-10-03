import { test, expect, type Page } from "@playwright/test";
import { loginAsSysadmin } from "./row-actions-helpers";

// 웨이브 6 DOM 감사 P1 · P2 — 코드표 · 계급의 편집 표(StaticTable `editable`).
// SYSTEM §7-2(801) 「표 안 입력: 테두리 없이 아래 1px --accent 밑줄」 · §7-3(894) · §7-13(1095) 「편집할 수 있는 셀이 하나라도 있으면 머리글 --g-100 + 강한 글자」(Table `.editable`과 같은 값).
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
      expect(header.color, "머리글 글자").toBe(await resolved(page, "color", "--text-strong"));
    });
  }
}
