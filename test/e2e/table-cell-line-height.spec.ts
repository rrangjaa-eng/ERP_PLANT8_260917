import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { insertVendor } from "@/repositories/vendors";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { db } from "@/db/client";
import { teams, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createProject } from "@/domain/projects";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// 웨이브 6 DOM 감사 J3 · 사용자 채팅 지시 2026-10-03 22:35 KST 「1.5로 줄여」 — SYSTEM §2: `--text-body` 행간 「표 1.5 · 산문 1.6」,
// 머리글 `--text-aux`는 「본문 행간 1.6」(13 x 1.6 = 20.8). 표 셀 행간은 본문 1.6 상속이 아니라 `--lh-table`이다.
// 그룹 머리글 줄(.groupHeader, `--text-group` 역할)은 표 셀이 아니라 제외한다. 기대 값은 리터럴 1.5가 아니라 계산된 역할 토큰 값이다.
async function expectCellLineHeights(page: Page, selector: string): Promise<void> {
  const table = page.locator(selector).first();
  await expect(table.locator("tbody td, tbody th").filter({ hasText: /\S/ }).locator("visible=true").first()).toBeVisible();
  const lhTable = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--lh-table")));
  const lhBody = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--lh-body")));
  const ratios = await table.evaluate((el) => {
    const ratio = (cell: Element) => {
      const cs = getComputedStyle(cell);
      return { cls: String(cell.className), text: (cell.textContent ?? "").trim().slice(0, 20), ratio: parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) };
    };
    return {
      cells: [...el.querySelectorAll("tbody td, tbody th")].filter((c) => c.getClientRects().length > 0 && (c.textContent ?? "").trim() !== "" && !String(c.className).includes("groupHeader")).map(ratio),
      headers: [...el.querySelectorAll("thead th")].filter((c) => c.getClientRects().length > 0).map(ratio),
    };
  });
  expect(ratios.cells.length).toBeGreaterThan(0);
  for (const cell of ratios.cells) expect(cell.ratio, `표 셀 행간 ${cell.cls} 「${cell.text}」`).toBeCloseTo(lhTable, 2);
  for (const header of ratios.headers) expect(header.ratio, `표 머리글 행간은 본문 행간 「${header.text}」`).toBeCloseTo(lhBody, 2);
}

for (const width of [1280, 390]) {
  test(`표 셀 행간은 --lh-table이고 머리글은 --lh-body다 (${width})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E행간-${randomUUID()}`, normalizedName: `e2e행간-${randomUUID()}` });
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, admin.email)).limit(1);
    const [team] = await db.select().from(teams).limit(1);
    const marker = `E2E행간-${randomUUID().slice(0, 8)}`;
    await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId: team!.id, pmUserId: row!.id, name: marker });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    // Table(프로젝트 목록) · StaticTable(코드표 · 계급) — 둘 다 같은 Table.module.css의 .cell이다.
    await page.goto(`/projects?q=${encodeURIComponent(marker)}&year=all`);
    await expectCellLineHeights(page, "main table:not([aria-hidden='true'] table)");
    await page.goto("/admin/code-tables?tableKey=project_status");
    await expectCellLineHeights(page, "main table");
    await page.goto("/admin/people/roles");
    await expectCellLineHeights(page, "main table");
  });
}
