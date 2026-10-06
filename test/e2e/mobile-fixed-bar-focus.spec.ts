import { test, expect, type Page } from "@playwright/test";
import { createExpenseFromLines } from "@/domain/expenses";
import "@/domain/leave";
import { submitLeave } from "@/domain/leave";
import { seoulToday } from "@/lib/dates";
import { leaveWeekdayRange } from "./leave-dates";
import { loginPage, setupLeaveOrg, waitForHydration } from "./leave-org";
import { setupExpenseE2E, submitLineExpense } from "./expense-fixture";

// 05-13 게이트 감사 D1(WCAG 2.2 2.4.11 포커스 가림 없음): 폰에서 하단 탭 위에 고정된 행동 줄이 있는 화면은
// Tab으로 포커스가 가도 칸이 줄에 덮이지 않는다 — 포커스된 본문 요소의 아래 끝 ≤ 고정 줄의 위 끝.
// 고정 줄 공통 규칙(`data-fixed-bar` + 문서 scroll-padding-bottom)이라 지출결의 폼 · 지출결의 문서 · 연차 폼 · 연차 문서가 한 잣대를 쓴다.

const VIEWPORTS = [
  { width: 375, height: 667 },
  { width: 320, height: 568 },
] as const;

type Step = { tag: string; id: string; text: string; bottom: number; barTop: number };

// 본문 안 포커스 요소만 잰다(고정 줄 안 · 셸 안은 제외) — 모두 Tab 순서대로 최대 `max`번.
async function tabAudit(page: Page, barSelector: string, max = 40): Promise<Step[]> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const steps: Step[] = [];
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press("Tab");
    const step = await page.evaluate((selector) => {
      const active = document.activeElement as HTMLElement | null;
      if (!active || active === document.body) return null;
      const bar = document.querySelector(selector);
      if (!bar) return { kind: "none" as const };
      if (active.closest(selector)) return { kind: "bar" as const };
      if (!active.closest("main")) return { kind: "shell" as const };
      const rect = active.getBoundingClientRect();
      return {
        kind: "main" as const,
        tag: active.tagName.toLowerCase(),
        id: active.id,
        text: (active.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 20),
        bottom: Math.round(rect.bottom),
        barTop: Math.round(bar.getBoundingClientRect().top),
      };
    }, barSelector);
    if (step?.kind === "bar" && steps.length > 0) break;
    if (step?.kind === "main") steps.push(step);
  }
  return steps;
}

function expectAboveBar(steps: Step[], label: string, minimum: number): void {
  expect(steps.length, `${label} 본문 포커스 수`).toBeGreaterThanOrEqual(minimum);
  for (const step of steps) {
    expect(step.bottom, `${label} ${step.tag}#${step.id} 「${step.text}」 아래 끝 ${step.bottom} ≤ 고정 줄 위 ${step.barTop}`).toBeLessThanOrEqual(step.barTop);
  }
}

test.describe("폰 고정 행동 줄 — 포커스 가림 없음 (05-13 D1)", () => {
  test("지출결의 폼(작성 중 문서 · 새 문서) — Tab 포커스가 제출 줄 위에 머문다", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const fx = await setupExpenseE2E();
    const draft = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.tracer.id] });
    const expenseId = draft.created[0]?.expenseId;
    expect(expenseId).toBeTruthy();
    for (const viewport of VIEWPORTS) {
      const page = await loginPage(browser, baseURL, fx.pm, viewport);
      for (const path of [`/expenses/${expenseId}`, "/expenses/new"]) {
        await page.goto(path);
        await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
        await page.waitForLoadState("networkidle");
        expectAboveBar(await tabAudit(page, '[data-testid="expense-form-actions"]'), `폼 ${path.replace(expenseId!, ":id")} ${viewport.width}`, 5);
      }
      await page.context().close();
    }
  });

  test("지출결의 문서 — 결재자 Tab 포커스가 승인 줄 위에 머문다", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const fx = await setupExpenseE2E();
    const expenseId = await submitLineExpense(browser, baseURL, fx, "tracer");
    for (const viewport of VIEWPORTS) {
      const page = await loginPage(browser, baseURL, fx.lead, viewport);
      await page.goto(`/expenses/${expenseId}`);
      await waitForHydration(page.getByRole("button", { name: "승인" }));
      await page.waitForLoadState("networkidle");
      expectAboveBar(await tabAudit(page, "[data-fixed-bar]"), `문서 ${viewport.width}`, 0);
      await page.context().close();
    }
  });

  test("연차 신청 폼 · 연차 문서 — Tab 포커스가 고정 줄 위에 머문다", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const today = seoulToday();
    const range = leaveWeekdayRange(today, { week: 2, weekdays: 2 });
    const org = await setupLeaveOrg(today);
    const { leaveId } = await submitLeave(org.drafter.viewer, { kind: "full_day", startDate: range.startDate, endDate: range.endDate, half: "" });
    for (const viewport of VIEWPORTS) {
      const drafter = await loginPage(browser, baseURL, org.drafter, viewport);
      await drafter.goto("/leave/new");
      await expect(drafter.getByTestId("approval-route-line")).toBeVisible();
      await drafter.waitForLoadState("networkidle");
      expectAboveBar(await tabAudit(drafter, '[data-testid="leave-form-actions"]'), `연차 폼 ${viewport.width}`, 3);
      await drafter.context().close();

      const lead = await loginPage(browser, baseURL, org.teamLead, viewport);
      await lead.goto(`/leave/${leaveId}`);
      await waitForHydration(lead.getByRole("button", { name: "승인" }));
      await lead.waitForLoadState("networkidle");
      expectAboveBar(await tabAudit(lead, "[data-fixed-bar]"), `연차 문서 ${viewport.width}`, 0);
      await lead.context().close();
    }
  });
});
