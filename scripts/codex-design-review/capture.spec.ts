import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createAccount } from "@/domain/auth/accounts";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { VIEWPORTS, countLines, screenshotName, type ScreenMeasure } from "./lib";

// Codex 디자인 검토 캡처(playwright.codex-design.config.ts 전용). 요청 경로마다 4폭 전체 화면
// 스크린샷과 DOM 실측(가로 넘침·요소 높이·줄 수·넘침·세로 간격)을 남긴다. 판정은 이 실측으로 한다.
const routes = (process.env.CODEX_REVIEW_ROUTES ?? "").split(",").filter(Boolean);
const dir = process.env.CODEX_REVIEW_DIR ?? "";
if (routes.length === 0 || !dir) throw new Error("CODEX_REVIEW_ROUTES·CODEX_REVIEW_DIR가 필요하다");

for (const route of routes) {
  test(`캡처 ${route}`, async ({ page }) => {
    test.setTimeout(180_000);
    const email = `e2e-${randomUUID()}@example.test`;
    const { tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "E2E Admin", roleId: SYSADMIN_ROLE_ID });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호").fill(tempPassword);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const screens: ScreenMeasure[] = [];
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready.then(() => true));
      const screenshot = screenshotName(route, viewport.width);
      await page.screenshot({ path: join(dir, screenshot), fullPage: true });
      const { elements, ...pageMeasure } = await page.evaluate(measurePage);
      screens.push({
        route,
        width: viewport.width,
        screenshot,
        ...pageMeasure,
        elements: elements.map(({ textRects, ...e }) => ({ ...e, lines: countLines(textRects) })),
      });
    }
    writeFileSync(join(dir, `measurements-${screenshotName(route, 0).replace(/-0\.png$/, "")}.json`), JSON.stringify(screens, null, 2));
  });
}

// 브라우저 안에서 도는 함수 — 바깥 변수를 쓰지 않는다.
type RawElement = Omit<ScreenMeasure["elements"][number], "lines"> & { textRects: Array<[number, number]> };
function measurePage(): Omit<ScreenMeasure, "route" | "width" | "screenshot" | "elements"> & { elements: RawElement[] } {
  const kindOf = (el: Element): ScreenMeasure["elements"][number]["kind"] => {
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) return "heading";
    if (tag === "label") return "label";
    if (tag === "button") return "button";
    if (tag === "input" || tag === "select" || tag === "textarea") return "input";
    if (tag === "th" || tag === "td") return "cell";
    if (tag === "tr" || el.getAttribute("role") === "row") return "row";
    return "nav";
  };
  const part = (el: Element): string => {
    if (el.id) return `#${el.id}`;
    const tag = el.tagName.toLowerCase();
    const cls = el.classList[0];
    let s = cls ? `${tag}.${cls}` : tag;
    const parent = el.parentElement;
    if (parent) {
      const same = [...parent.children].filter((c) => c.tagName === el.tagName && c.classList[0] === cls);
      if (same.length > 1) s += `:nth-of-type(${[...parent.children].filter((c) => c.tagName === el.tagName).indexOf(el) + 1})`;
    }
    return s;
  };
  const selectorOf = (el: Element): string => {
    const parts: string[] = [];
    let cur: Element | null = el;
    for (let depth = 0; cur && depth < 4 && cur !== document.body; depth++) {
      parts.unshift(part(cur));
      if (cur.id) break;
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  };
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // 텍스트 노드 상자만 모은다 — 요소 범위 전체는 하위 요소 상자까지 섞인다. 줄 수는 countLines(lib)가 센다.
  const textRectsOf = (el: Element): Array<[number, number]> => {
    const rects: Array<[number, number]> = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!(node.textContent ?? "").trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) if (r.width > 0) rects.push([Math.round(r.top), Math.round(r.bottom)]);
    }
    return rects;
  };

  const root = document.documentElement;
  const elements = [...document.querySelectorAll("h1,h2,h3,label,button,input,select,textarea,th,td,tr,[role=row],nav a")]
    .filter(visible)
    .slice(0, 400)
    .map((el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const scrollable = style.overflowX === "auto" || style.overflowX === "scroll";
      return {
        selector: selectorOf(el),
        kind: kindOf(el),
        text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40),
        width: Math.round(r.width),
        height: Math.round(r.height),
        textRects: textRectsOf(el),
        overflowsSelf: !scrollable && el.scrollWidth > el.clientWidth + 1,
        exceedsViewport: r.right > window.innerWidth + 0.5,
        scrollContainer: scrollable,
      };
    });

  const gaps: ScreenMeasure["gaps"] = [];
  const walk = (parent: Element, depth: number) => {
    if (depth > 4 || gaps.length >= 120) return;
    const children = [...parent.children].filter(visible);
    for (let i = 1; i < children.length && gaps.length < 120; i++) {
      const prev = children[i - 1]!.getBoundingClientRect();
      const next = children[i]!.getBoundingClientRect();
      if (next.top >= prev.bottom - 1) {
        gaps.push({ parent: selectorOf(parent), before: selectorOf(children[i - 1]!), after: selectorOf(children[i]!), gap: Math.round(next.top - prev.bottom) });
      }
    }
    for (const child of children) walk(child, depth + 1);
  };
  walk(document.querySelector("main") ?? document.body, 1);

  return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, overflowX: root.scrollWidth > root.clientWidth, elements, gaps };
}
