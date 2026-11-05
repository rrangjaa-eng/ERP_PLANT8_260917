import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { VIEWPORTS } from "../../scripts/codex-design-review/lib";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { loginAsAdmin } from "./people-list-helpers";

// 07.3-04 디자인 검토 증거 — 권한표 본부 조건 표지(기본 상태: 「경영관리본부만」)를 폭마다(375 · 320 · 768 · 1280) 전체 화면 PNG `state-fund-note-default-<폭>.png`와
// DOM 실측 `measurements-state-fund-note-default.json`으로 DESIGN_CAPTURE_DIR에 남긴다. 폰(<700)은 기본 계급을 고르고 「증빙 등록」 줄까지 내린 목록이다(경로 캡처가 놓치는 상태).
// 「자금 본부 미지정」 상태는 설정 행을 지우는 일이라 permissions-fund-note-unset.spec.ts(desktop-settings · 워커 1)가 같은 폴더에 찍는다.
// 판정은 독립 DOM 감사 몫 — 여기 단언은 상태에 닿았는지 보는 expect뿐이다. DESIGN_CAPTURE_DIR이 없으면(CI E2E) 건너뛴다.

const OUT_DIR = process.env.DESIGN_CAPTURE_DIR;
test.skip(!OUT_DIR, "DESIGN_CAPTURE_DIR이 없으면 캡처하지 않는다 — 디자인 검토 증거용(07.3-04)");

async function measure(page: Page, phone: boolean) {
  return page.evaluate((isPhone) => {
    const lines = (el: Element) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set(Array.from(range.getClientRects()).filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top))).size;
    };
    const probe = document.createElement("span");
    probe.style.cssText = "color:var(--text-muted);font-size:var(--text-aux);font-weight:var(--fw-regular);position:absolute";
    probe.textContent = "x";
    document.body.appendChild(probe);
    const expected = getComputedStyle(probe);
    const tokens = { color: expected.color, fontSize: expected.fontSize, fontWeight: expected.fontWeight };
    probe.remove();
    const styleOf = (el: HTMLElement) => {
      const cs = getComputedStyle(el);
      return { color: cs.color, fontSize: cs.fontSize, fontWeight: cs.fontWeight, whiteSpace: cs.whiteSpace, matchesTokens: cs.color === tokens.color && cs.fontSize === tokens.fontSize && cs.fontWeight === tokens.fontWeight };
    };
    const de = document.documentElement;
    const base = { innerWidth: window.innerWidth, scrollWidth: de.scrollWidth, overflow: de.scrollWidth - window.innerWidth, tokens };
    if (isPhone) {
      const dts = Array.from(document.querySelectorAll("dt")).filter((el) => el.offsetParent !== null);
      const rows = dts.map((dt) => {
        const dd = dt.nextElementSibling as HTMLElement;
        const note = dd.querySelector<HTMLElement>("span[id]");
        const box = dd.querySelector("input")!.getBoundingClientRect();
        const noteBox = note?.getBoundingClientRect();
        const described = dd.querySelector("input")!.getAttribute("aria-describedby");
        return {
          label: dt.textContent,
          labelLines: lines(dt),
          labelHeight: Math.round(dt.getBoundingClientRect().height),
          rowHeight: Math.round(dd.getBoundingClientRect().height),
          note: note?.textContent ?? null,
          noteLines: note ? note.getClientRects().length : null,
          noteCenterInsideCheckbox: noteBox ? noteBox.top + noteBox.height / 2 >= box.top && noteBox.top + noteBox.height / 2 <= box.bottom : null,
          noteStyle: note ? styleOf(note) : null,
          describedByResolves: described ? document.getElementById(described)?.textContent === note?.textContent : null,
        };
      });
      return { ...base, rows };
    }
    const groups = Array.from(document.querySelectorAll<HTMLElement>("th[scope=rowgroup]")).filter((el) => el.offsetParent !== null);
    const rows = groups.map((th) => {
      const tr = th.closest("tr")!;
      const note = th.querySelector<HTMLElement>("span[id]");
      const nameNode = Array.from(th.childNodes).find((node) => node.nodeType === 3 && (node.textContent ?? "").trim()) as Text | undefined;
      const nameRange = document.createRange();
      if (nameNode) nameRange.selectNodeContents(nameNode);
      const nameBox = nameNode ? nameRange.getBoundingClientRect() : null;
      const noteBox = note?.getBoundingClientRect();
      const tbody = th.closest("tbody")!;
      const firstCell = tbody.querySelector<HTMLInputElement>("td input[type=checkbox]");
      const headBox = tbody.querySelector<HTMLInputElement>("th[scope=row] input[type=checkbox]");
      const resolves = (input: HTMLInputElement | null) => (input?.getAttribute("aria-describedby") ? document.getElementById(input.getAttribute("aria-describedby")!)?.textContent === note?.textContent : null);
      return {
        group: nameNode?.textContent?.trim() ?? th.textContent,
        accessibleText: th.textContent,
        note: note?.textContent ?? null,
        noteSameLine: note && nameBox && noteBox ? Math.abs(noteBox.top - nameBox.top) < 4 : null,
        noteGap: note && nameBox && noteBox ? Math.round(noteBox.left - nameBox.right) : null,
        noteLines: note ? note.getClientRects().length : null,
        rowHeight: Math.round(tr.getBoundingClientRect().height * 100) / 100,
        noteStyle: note ? styleOf(note) : null,
        cellDescribedByResolves: resolves(firstCell),
        headCheckboxDescribedByResolves: resolves(headBox),
        cellAriaLabel: firstCell?.getAttribute("aria-label") ?? null,
      };
    });
    return { ...base, groupCount: rows.length, rows };
  }, phone);
}

test("권한표 본부 조건 표지 — 폰 목록(375 · 320)과 PC 그룹 줄(768 · 1280)", async ({ page }) => {
  test.setTimeout(180_000);
  await loginAsAdmin(page);
  const results: unknown[] = [];
  mkdirSync(OUT_DIR!, { recursive: true });
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto("/admin/permissions");
    const phone = viewport.width < 700;
    if (phone) {
      await page.locator("select").first().selectOption(DEFAULT_ROLE_ID);
      const target = page.locator("dt").filter({ hasText: /^증빙 등록 · 쓰기$/ });
      await expect(target).toBeVisible();
      await target.scrollIntoViewIfNeeded();
    } else {
      await expect(page.locator("th[scope='rowgroup']").filter({ hasText: "경영관리본부만" }).first()).toBeVisible();
    }
    await page.evaluate(() => document.fonts.ready.then(() => true));
    await page.screenshot({ path: join(OUT_DIR!, `state-fund-note-default-${viewport.width}.png`), fullPage: true });
    results.push({ width: viewport.width, ...(await measure(page, phone)) });
  }
  writeFileSync(join(OUT_DIR!, "measurements-state-fund-note-default.json"), JSON.stringify(results, null, 2));
});
