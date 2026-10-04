import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor } from "@/repositories/vendors";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { db } from "@/db/client";
import { teams, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";

// 웨이브 6 DOM 감사 P3 — 견적 표 첫 칸(행 번호). SYSTEM §7-3(853) 「첫 칸(행 번호) --text-tag --text-faint, 폭 --row-number-w(28)」.
// 열 폭 판정은 칸 안쪽(패딩 뺀 내용) 폭이다 — 자동 표 배치가 남는 폭을 번호 칸에도 나눠 주어 폭이 78~116까지 늘었다.
async function openQuoteTable(page: Page) {
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E번호칸-${randomUUID()}`, normalizedName: `e2e번호칸-${randomUUID()}` });
  const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, pm.email)).limit(1);
  const [team] = await db.select().from(teams).limit(1);
  const project = await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId: team!.id, pmUserId: row!.id, name: `E2E번호칸-${randomUUID().slice(0, 8)}` });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  await saveQuoteLines(SYSTEM_VIEWER, revision!.id, {
    rows: [1, 2].map((n) => ({
      id: randomUUID(),
      isNew: true,
      subcategory: "stage_construction",
      itemName: `항목${n}`,
      quantity: 1,
      unitPrice: { currency: "KRW" as const, amount: 1000 * n, fxRate: 1 },
      execution: { currency: "KRW" as const, amount: 0, fxRate: 1 },
    })),
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(pm.email);
  await page.getByLabel("비밀번호").fill(pm.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole("gridcell", { name: /항목1/ }).first()).toBeVisible();
}

async function resolvedStyle(page: Page, property: "fontSize" | "color" | "width", token: string): Promise<string> {
  return page.evaluate(
    ([prop, value]) => {
      const probe = document.createElement("div");
      probe.style.setProperty(prop === "fontSize" ? "font-size" : prop, `var(${value})`);
      document.body.append(probe);
      const out = getComputedStyle(probe)[prop];
      probe.remove();
      return out;
    },
    [property, token] as const,
  );
}

test.describe("견적 표 번호 칸 (P3)", () => {
  test("번호 숫자는 --text-tag 600 --text-faint이고 번호 칸 내용 폭은 --row-number-w이다", async ({ page }) => {
    await openQuoteTable(page);
    const m = await page.evaluate(() => {
      const th = [...document.querySelectorAll("th")].find((t) => t.textContent?.trim() === "번호")!;
      const table = th.closest("table")!;
      const index = [...th.parentElement!.children].indexOf(th);
      const td = table.querySelector(`tbody tr td:nth-child(${index + 1}) > span`)!.parentElement as HTMLElement;
      const span = td.querySelector("span")!;
      const cs = getComputedStyle(td);
      const spanStyle = getComputedStyle(span);
      return {
        fontSize: spanStyle.fontSize,
        fontWeight: spanStyle.fontWeight,
        color: spanStyle.color,
        content: td.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
        thContent: th.getBoundingClientRect().width - parseFloat(getComputedStyle(th).paddingLeft) - parseFloat(getComputedStyle(th).paddingRight),
      };
    });
    expect(m.fontSize).toBe(await resolvedStyle(page, "fontSize", "--text-tag"));
    expect(m.fontWeight).toBe("600");
    expect(m.color).toBe(await resolvedStyle(page, "color", "--text-faint"));
    const rowNumberW = parseFloat(await resolvedStyle(page, "width", "--row-number-w"));
    expect(m.content, "번호 칸 내용 폭").toBeLessThanOrEqual(rowNumberW + 1);
    expect(m.thContent, "번호 머리글 칸 내용 폭 = 같은 열").toBeCloseTo(m.content, 0);
  });
});
