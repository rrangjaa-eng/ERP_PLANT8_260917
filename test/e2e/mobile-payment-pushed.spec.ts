import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects, vendors } from "@/db/schema";
import { payWeekIndex, resolvePaySchedule } from "@/domain/payments/pay-schedule";
import { loginPage } from "./leave-org";
import { setupExpenseE2E, archiveTempRoles } from "./expense-fixture";
import { addDays, makeTeamPayer, payCalendar, pushedDoc, submittedDoc, targetsGrid } from "./pay-schedule-e2e";

// 07-16 Task 1(K5): 폰 375 — 밀린 건의 `마감 지나 밀림`은 그 행 P2 접힌 줄의 첫 요소이고 행은 두 줄(주 행 + 접힌 줄)이다.
// PC의 제목 아래 2행은 폰에서 숨는다(같은 말을 두 번 보이지 않는다 — SYSTEM §7-3 폰 전략).

test.afterAll(archiveTempRoles);

test("폰 375 — `마감 지나 밀림`이 P2 접힌 줄 맨 앞 · 행 두 줄 · 가로 넘침 없음", async ({ browser, baseURL }) => {
  const cal = await payCalendar();
  const fx = await setupExpenseE2E();
  const payer = await makeTeamPayer(fx);
  await pushedDoc(fx, "tracer", payer, cal);
  const itemName = fx.lines.tracer.itemName;

  const page = await loginPage(browser, baseURL, payer, { width: 375, height: 812 });
  await page.goto("/expenses");
  await expect(page.getByLabel("상태")).toHaveValue("지급 대상");
  const table = targetsGrid(page).or(page.getByRole("table", { name: "지급 대상" }));
  await expect(table).toBeVisible();
  const rowGroup = table.locator("tbody").filter({ has: page.getByRole("link", { name: itemName }) });
  await expect(rowGroup).toHaveCount(1);
  const shape = await rowGroup.evaluate((tbody) => {
    const visible = [...tbody.querySelectorAll(":scope > tr")].filter((tr) => tr instanceof HTMLElement && tr.offsetParent !== null);
    const collapsed = visible.at(-1)?.querySelector("td");
    const first = collapsed?.querySelector("[data-cell-text] > span");
    const lineHeight = (cell: Element | null | undefined) => (cell ? parseFloat(getComputedStyle(cell).lineHeight) : 0);
    const textHeight = (cell: HTMLElement | null | undefined) => {
      if (!cell) return 0;
      const style = getComputedStyle(cell);
      return cell.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    };
    const titleCell = visible[0]?.querySelector("a[data-row-link]")?.closest("td") as HTMLElement | null;
    return {
      rows: visible.length,
      firstText: (first?.textContent ?? "").trim(),
      collapsedLines: Math.round(textHeight(collapsed) / lineHeight(collapsed)),
      titleLines: Math.round(textHeight(titleCell) / lineHeight(titleCell)),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(shape.rows).toBe(2);
  expect(shape.firstText.startsWith("마감 지나 밀림")).toBe(true);
  expect(shape.collapsedLines).toBe(1);
  expect(shape.titleLines).toBe(1);
  expect(shape.overflow).toBeLessThanOrEqual(0);
  await page.context().close();
});

// 감사 #3(P1) · #6(P3): 폰 결재 중 행 — 링크 없는 제목도 한 줄 말줄임(전체 글자는 title) · 정보 없는 접힌 줄(`— · —`)은 서지 않는다.
test("폰 375 · 320 — 결재 중 행은 제목 한 줄 말줄임 · 빈 접힌 줄 없음 · 가로 넘침 없음", async ({ browser, baseURL }) => {
  const cal = await payCalendar();
  const fx = await setupExpenseE2E();
  const payer = await makeTeamPayer(fx);
  const issuedOn = addDays(cal.today, 7 - cal.cfg.termDays);
  const approving = resolvePaySchedule({ baseDate: issuedOn, termDays: cal.cfg.termDays, manualDate: null, approvedAt: null, now: new Date(), lookup: cal.lookup, cfg: cal.cfg });
  const week = payWeekIndex(approving.payDate, cal.today);
  test.skip(week !== 0 && week !== 1, "결재 중 건이 이번 주 · 다음 주 밖");
  const longName = `${fx.projectName} 2026 하반기 브랜드 체험 팝업스토어 현장 운영 및 철수`;
  await db.update(projects).set({ name: longName }).where(eq(projects.id, fx.projectId));
  await submittedDoc(fx, "phone", issuedOn);
  await pushedDoc(fx, "tracer", payer, cal);
  const itemName = fx.lines.phone.itemName;

  for (const width of [375, 320]) {
    const page = await loginPage(browser, baseURL, payer, { width, height: 812 });
    await page.goto("/expenses");
    const table = targetsGrid(page).or(page.getByRole("table", { name: "지급 대상" }));
    await expect(table).toBeVisible();
    const rowGroup = table.locator("tbody").filter({ hasText: itemName });
    await expect(rowGroup).toHaveCount(1);
    const shape = await rowGroup.evaluate((tbody, name) => {
      const visible = [...tbody.querySelectorAll(":scope > tr")].filter((tr) => tr instanceof HTMLElement && tr.offsetParent !== null);
      const title = [...tbody.querySelectorAll("span")].find((span) => span.children.length === 0 && span.textContent?.includes(name));
      const style = title ? getComputedStyle(title) : null;
      return {
        rows: visible.length,
        texts: visible.map((tr) => (tr.textContent ?? "").trim()),
        titleLines: title && style ? Math.round(title.clientHeight / parseFloat(style.lineHeight)) : -1,
        titleAttr: title?.getAttribute("title") ?? null,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    }, itemName);
    expect(shape.rows, `${width} 행 줄 수`).toBeLessThanOrEqual(2);
    expect(shape.texts.filter((text) => /^[—·\s]+$/.test(text)), `${width} 빈 접힌 줄`).toEqual([]);
    expect(shape.titleLines, `${width} 제목 줄 수`).toBe(1);
    expect(shape.titleAttr).toContain(itemName);
    expect(shape.overflow, `${width} 가로 넘침`).toBeLessThanOrEqual(0);
    await page.context().close();
  }
});

// 2026-10-24 사용자 결정: 지급처 거래처가 「거래처 확인 전」인 행은 폰 접힌 줄에서 계좌를 뺀다(배지 글자는 그대로) — 확인 전 + 밀림이
// 375 · 320에서 두 줄로 넘쳐 행이 세 줄이 되던 것(SYSTEM §7-3 행 두 줄). 거래처가 확인되면 계좌가 다시 보인다.
test("폰 375 · 320 — 확인 전 거래처 + 밀림 행은 접힌 줄에 계좌 없이 한 줄 · 확인되면 계좌 복귀", async ({ browser, baseURL }) => {
  const cal = await payCalendar();
  const fx = await setupExpenseE2E();
  const payer = await makeTeamPayer(fx);
  await pushedDoc(fx, "tracer", payer, cal);
  const itemName = fx.lines.tracer.itemName;
  await db.update(vendors).set({ confirmedAt: null, confirmedBy: null }).where(eq(vendors.id, fx.vendorId));

  const collapsedOf = async (width: number, expectAccount: boolean) => {
    const page = await loginPage(browser, baseURL, payer, { width, height: 812 });
    await page.goto("/expenses");
    const table = targetsGrid(page).or(page.getByRole("table", { name: "지급 대상" }));
    await expect(table).toBeVisible();
    const rowGroup = table.locator("tbody").filter({ has: page.getByRole("link", { name: itemName }) });
    await expect(rowGroup).toHaveCount(1);
    const shape = await rowGroup.evaluate((tbody) => {
      const visible = [...tbody.querySelectorAll(":scope > tr")].filter((tr) => tr instanceof HTMLElement && tr.offsetParent !== null);
      const collapsed = visible.at(-1)?.querySelector("td") as HTMLElement | undefined;
      const style = collapsed ? getComputedStyle(collapsed) : null;
      const textHeight = collapsed && style ? collapsed.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) : 0;
      return {
        rows: visible.length,
        text: (collapsed?.textContent ?? "").trim(),
        lines: style ? Math.round(textHeight / parseFloat(style.lineHeight)) : 0,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(shape.text, `${width} 접힌 줄 밀림`).toContain("마감 지나 밀림");
    expect(shape.text.includes("****"), `${width} 접힌 줄 계좌 ${expectAccount ? "있음" : "없음"}`).toBe(expectAccount);
    if (!expectAccount) {
      expect(shape.text, `${width} 접힌 줄 배지`).toContain("거래처 확인 전");
      expect(shape.rows, `${width} 행 줄 수`).toBe(2);
      expect(shape.lines, `${width} 접힌 줄 줄 수`).toBe(1);
    }
    expect(shape.overflow, `${width} 가로 넘침`).toBeLessThanOrEqual(0);
    await page.context().close();
  };

  for (const width of [375, 320]) await collapsedOf(width, false);
  await db.update(vendors).set({ confirmedAt: new Date() }).where(eq(vendors.id, fx.vendorId));
  for (const width of [375, 320]) await collapsedOf(width, true);
});
