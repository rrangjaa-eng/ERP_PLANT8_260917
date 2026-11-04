import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orgUnits, settingsSimple } from "@/db/schema";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { FUND_DIVISION_SETTING_KEY } from "@/domain/permissions/fund-scope";
import { findSimpleValue } from "@/repositories/settings";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { VIEWPORTS } from "../../scripts/codex-design-review/lib";
import { createFixtureUser } from "./fixtures";

// 07.3-04(D-7318 · 디자인 검토 D2): 자금 본부 설정 행을 지운 상태 — 같은 자리가 「자금 본부 미지정」이고 표 위에 잠김 한 줄이 선다.
// 설정 `permissions.fund.division_org_unit`은 erp_test에 하나라 desktop 병렬 워커에서 지우면 fund-scope-gate 스펙이 fail-closed로 깨진다 —
// 그래서 playwright.config.ts DESKTOP_SETTINGS_SPECS(desktop-settings · 워커 1)에서 돈다. 행(값 · updated_by)을 읽어 두었다가 finally에서 그대로 되돌린다.
// DESIGN_CAPTURE_DIR가 있으면 같은 상태를 4폭 PNG + DOM 표로 남긴다(07.3-04 디자인 검토 증거).
const OUT_DIR = process.env.DESIGN_CAPTURE_DIR;
const LOCK_LINE = "자금 기능 본부 미지정";

async function login(page: Page): Promise<void> {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test("자금 본부 설정이 비면 표지가 「자금 본부 미지정」이고 표 위 잠김 한 줄이 서며, 복원하면 사라진다", async ({ page }) => {
  test.setTimeout(240_000);
  const original = await findSimpleValue(SYSTEM_VIEWER, FUND_DIVISION_SETTING_KEY);
  expect(original, "시드에 자금 본부 설정 행이 있어야 한다").not.toBeNull();

  try {
    await login(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/admin/permissions");
    await expect(page.getByText(LOCK_LINE)).toHaveCount(0);
    await expect(page.locator("th[scope='rowgroup']").filter({ hasText: "경영관리본부만" })).toHaveCount(8);

    await db.delete(settingsSimple).where(eq(settingsSimple.key, FUND_DIVISION_SETTING_KEY));
    await page.reload();
    const groups = page.locator("th[scope='rowgroup']");
    await expect(groups.filter({ hasText: "자금 본부 미지정" })).toHaveCount(8);
    await expect(groups.filter({ hasText: "경영관리본부만" })).toHaveCount(0);

    const line = page.locator("p").filter({ hasText: new RegExp(`^${LOCK_LINE} · 설정$`) });
    await expect(line).toHaveCount(1);
    await expect(line.getByRole("link", { name: "설정" })).toHaveAttribute("href", /^\/admin\/settings/);

    if (OUT_DIR) {
      mkdirSync(OUT_DIR, { recursive: true });
      const rows: unknown[] = [];
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport);
        await page.goto("/admin/permissions");
        await expect(page.getByText(LOCK_LINE)).toBeVisible();
        await page.screenshot({ path: join(OUT_DIR, `state-fund-note-unset-${viewport.width}.png`), fullPage: true });
        const phone = viewport.width < 700;
        if (phone) await page.locator("select").first().selectOption({ index: 0 });
        rows.push({ width: viewport.width, ...(await measureUnset(page, phone)) });
      }
      writeFileSync(join(OUT_DIR, "measurements-state-fund-note-unset.json"), JSON.stringify(rows, null, 2));
    }
  } finally {
    if (original) {
      await db
        .insert(settingsSimple)
        .values({ key: original.key, value: original.value, updatedAt: original.updatedAt, updatedBy: original.updatedBy })
        .onConflictDoUpdate({ target: settingsSimple.key, set: { value: original.value, updatedAt: original.updatedAt, updatedBy: original.updatedBy } });
    }
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin/permissions");
  await expect(page.getByText(LOCK_LINE)).toHaveCount(0);
  await expect(page.locator("th[scope='rowgroup']").filter({ hasText: "경영관리본부만" })).toHaveCount(8);
});

// 리뷰 P2: 본부 이름은 관리자가 고치는 값이라 길 수 있다 — 폰 값 칸(약 200px)에서 표지가 칸을 넘치지 않고 통째로 다음 줄로 내려가야 한다.
// 이름을 바꾸는 일도 공용 행(자금 본부)이라 이 스펙(desktop-settings · 워커 1)에서 try/finally로 되돌린다.
test("자금 본부 이름이 길어도 폰 320에서 표지가 값 칸을 넘치지 않는다", async ({ page }) => {
  test.setTimeout(240_000);
  const LONG_NAME = "경영관리본부운영지원재무회계센터";
  const setting = await findSimpleValue(SYSTEM_VIEWER, FUND_DIVISION_SETTING_KEY);
  const unitId = String(setting?.value);
  const [unit] = await db.select().from(orgUnits).where(eq(orgUnits.id, unitId));
  expect(unit, "자금 본부 조직 단위가 있어야 한다").toBeDefined();
  const originalName = unit!.name;

  try {
    await db.update(orgUnits).set({ name: LONG_NAME }).where(eq(orgUnits.id, unitId));
    await login(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/admin/permissions");
    await page.locator("select").first().selectOption({ index: 0 });
    const note = page.locator("dd span[id]").filter({ hasText: `${LONG_NAME}만` }).first();
    await expect(note).toBeVisible();
    const measured = await note.evaluate((el) => {
      const cell = el.closest("dd")!;
      const box = el.getBoundingClientRect();
      const cellBox = cell.getBoundingClientRect();
      return {
        lines: el.getClientRects().length,
        noteRight: Math.round(box.right),
        cellRight: Math.round(cellBox.right),
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
        cellOverflow: cell.scrollWidth - cell.clientWidth,
      };
    });
    expect(measured.lines).toBe(1);
    expect(measured.pageOverflow).toBeLessThanOrEqual(0);
    expect(measured.cellOverflow).toBeLessThanOrEqual(0);
    expect(measured.noteRight).toBeLessThanOrEqual(measured.cellRight);
  } finally {
    await db.update(orgUnits).set({ name: originalName }).where(eq(orgUnits.id, unitId));
  }

  const [restored] = await db.select().from(orgUnits).where(eq(orgUnits.id, unitId));
  expect(restored?.name).toBe(originalName);
});

async function measureUnset(page: Page, phone: boolean) {
  return page.evaluate((isPhone) => {
    const de = document.documentElement;
    const line = Array.from(document.querySelectorAll("p")).find((el) => (el.textContent ?? "").startsWith("자금 기능 본부 미지정"));
    const lineBox = line?.getBoundingClientRect();
    const lineRange = line ? document.createRange() : null;
    if (line && lineRange) lineRange.selectNodeContents(line);
    const link = line?.querySelector("a");
    const lineStyle = line ? getComputedStyle(line) : null;
    const linkStyle = link ? getComputedStyle(link) : null;
    const notes = Array.from(document.querySelectorAll<HTMLElement>(isPhone ? "dd span[id]" : "th[scope=rowgroup] span[id]")).filter((el) => el.offsetParent !== null);
    const note = notes[0];
    const noteStyle = note ? getComputedStyle(note) : null;
    return {
      innerWidth: window.innerWidth,
      scrollWidth: de.scrollWidth,
      overflow: de.scrollWidth - window.innerWidth,
      noteCount: notes.length,
      noteText: note?.textContent ?? null,
      noteLines: note ? note.getClientRects().length : null,
      noteWhiteSpace: noteStyle?.whiteSpace ?? null,
      noteColor: noteStyle?.color ?? null,
      noteFontSize: noteStyle?.fontSize ?? null,
      lockLine: lineBox && lineRange ? { top: Math.round(lineBox.top), height: Math.round(lineBox.height), lines: new Set(Array.from(lineRange.getClientRects()).filter((r) => r.width > 0).map((r) => Math.round(r.top))).size, color: lineStyle?.color, fontSize: lineStyle?.fontSize } : null,
      lockLink: link ? { text: link.textContent, href: link.getAttribute("href"), color: linkStyle?.color, fontSize: linkStyle?.fontSize, sameLineAsText: lineRange ? Math.abs(link.getBoundingClientRect().top - lineRange.getBoundingClientRect().top) < 8 : null } : null,
    };
  }, phone);
}
