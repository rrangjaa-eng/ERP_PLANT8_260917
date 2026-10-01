import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createAccount } from "@/domain/auth/accounts";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { VIEWPORTS, countLines, fillRoute, screenshotName, type ScreenMeasure } from "./lib";

// Codex 디자인 검토 캡처(playwright.codex-design.config.ts 전용). 요청 경로마다 4폭 전체 화면
// 스크린샷과 DOM 실측(가로 넘침·요소 높이·줄 수·넘침·세로 간격)을 남긴다. 판정은 이 실측으로 한다.
const routes = JSON.parse(process.env.CODEX_REVIEW_ROUTES ?? "[]") as string[];
const dir = process.env.CODEX_REVIEW_DIR ?? "";
if (routes.length === 0 || !dir) throw new Error("CODEX_REVIEW_ROUTES(JSON 배열)·CODEX_REVIEW_DIR가 필요하다");

for (const route of routes) {
  test(`캡처 ${route}`, async ({ page, baseURL }) => {
    test.setTimeout(180_000);
    const email = `e2e-${randomUUID()}@example.test`;
    const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "E2E Admin", roleId: SYSADMIN_ROLE_ID });
    const target = fillRoute(route, { adminId: userId });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호").fill(tempPassword);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const screens: ScreenMeasure[] = [];
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      const wanted = new URL(target, baseURL);
      // 앱 출처 밖으로는 가지 않는다(경로는 parseArgs가 이미 거른다 — 한 번 더 막는다).
      expect(wanted.origin).toBe(new URL(baseURL ?? "").origin);
      const response = await page.goto(wanted.href);
      // 리다이렉트·오류 페이지를 요청한 화면으로 재지 않는다(쿼리로 고르는 화면이 있어 search까지 비교).
      expect(response?.ok(), `${target} 응답 ${response?.status()}`).toBe(true);
      const landed = new URL(page.url());
      expect(landed.pathname + landed.search).toBe(wanted.pathname + wanted.search);
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
  const LIMIT = 400;
  const kindOf = (el: Element): ScreenMeasure["elements"][number]["kind"] => {
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) return "heading";
    if (tag === "label") return "label";
    if (tag === "button") return "button";
    if (tag === "input" || tag === "select" || tag === "textarea") return "input";
    if (tag === "th" || tag === "td") return "cell";
    if (tag === "tr" || el.getAttribute("role") === "row") return "row";
    return el.closest("nav") ? "nav" : "link";
  };
  const part = (el: Element): string => {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const tag = el.tagName.toLowerCase();
    const cls = el.classList[0];
    let s = cls ? `${tag}.${CSS.escape(cls)}` : tag;
    const parent = el.parentElement;
    if (parent) {
      const sameTag = [...parent.children].filter((c) => c.tagName === el.tagName);
      const same = sameTag.filter((c) => c.classList[0] === cls);
      // 표 행·목록 항목은 늘 순번을 붙인다 — 행마다 같은 선택자가 되지 않게.
      if (same.length > 1 || tag === "tr" || tag === "li") s += `:nth-of-type(${sameTag.indexOf(el) + 1})`;
    }
    return s;
  };
  const selectorOf = (el: Element): string => {
    const parts: string[] = [];
    let cur: Element | null = el;
    for (let depth = 0; cur && depth < 6 && cur !== document.body; depth++) {
      parts.unshift(part(cur));
      if (cur.id || cur.tagName === "MAIN") break;
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  };
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && Number(style.opacity) > 0 && el.checkVisibility();
  };
  const isScroller = (el: Element) => {
    const x = getComputedStyle(el).overflowX;
    return x === "auto" || x === "scroll";
  };
  const insideScroller = (el: Element) => {
    for (let cur = el.parentElement; cur && cur !== document.body; cur = cur.parentElement) if (isScroller(cur)) return true;
    return false;
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
  // 조작 요소·제목을 먼저, 표 칸·행을 뒤에 — 상한에 걸려도 버튼·입력이 빠지지 않게.
  // 링크로 그린 행동(주 버튼 모양 Link 등)도 잰다 — nav 밖 a[href]는 kind "link".
  const controls = [...document.querySelectorAll("h1,h2,h3,label,button,input,select,textarea,a[href]")].filter(visible);
  const cells = [...document.querySelectorAll("th,td,tr,[role=row]")].filter(visible);
  const all = [...controls, ...cells];
  const elements = all.slice(0, LIMIT).map((el) => {
    const r = el.getBoundingClientRect();
    const scrollable = isScroller(el);
    return {
      selector: selectorOf(el),
      kind: kindOf(el),
      text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40),
      width: Math.round(r.width),
      height: Math.round(r.height),
      textRects: textRectsOf(el),
      overflowsSelf: !scrollable && el.scrollWidth > el.clientWidth + 1,
      // 의도된 가로 스크롤 칸 안의 요소는 화면 밖으로 세지 않는다.
      exceedsViewport: r.right > window.innerWidth + 0.5 && !insideScroller(el),
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

  return {
    scrollWidth: root.scrollWidth,
    clientWidth: root.clientWidth,
    overflowX: root.scrollWidth > root.clientWidth,
    elements,
    gaps,
    omitted: Math.max(0, all.length - LIMIT),
  };
}
