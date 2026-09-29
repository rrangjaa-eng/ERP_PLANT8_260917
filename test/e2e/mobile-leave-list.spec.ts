import { test, expect, type Browser, type Page } from "@playwright/test";
import { submitLeave } from "@/domain/leave";
import { leaveWeekdayRange, onStableSeoulDay } from "./leave-dates";
import { setupLeaveOrg, type Person } from "./leave-org";

// 04.1-06(S1 · S10 폰 375): 「더보기」 시트 계정 그룹 「연차」 → 목록(P1 세 열 · 접힌 줄 `신청 MM-DD`) → 신청.
// 날짜는 onStableSeoulDay가 준 오늘에서 leaveWeekdayRange(오늘, {week 10~20})로만 만든다(Codex HIGH 06 · CEO-15).

async function login(browser: Browser, baseURL: string | undefined, person: Person): Promise<Page> {
  const context = await browser.newContext({ baseURL, viewport: { width: 375, height: 800 } });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("이메일").fill(person.email);
  await page.getByLabel("비밀번호").fill(person.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return page;
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

test.describe("폰 375 연차 목록 (04.1-06 · S1 · S10)", () => {
  test("「더보기」 → 계정 그룹 「연차」 → 목록 P1 세 열 · 접힌 줄 `신청 MM-DD` · 가로 스크롤 0 → 연차 신청", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const org = await setupLeaveOrg(today);
      const range = leaveWeekdayRange(today, { week: 12, weekdays: 1 });
      await submitLeave(org.drafter.viewer, { kind: "half_day", half: "pm", startDate: range.startDate, endDate: range.startDate });
      const page = await login(browser, baseURL, org.drafter);
      await page.goto("/");

      await page.getByRole("button", { name: "더보기" }).click();
      const sheet = page.getByRole("dialog", { name: "더보기" });
      await expect(sheet.getByRole("link", { name: "연차" })).toBeVisible();
      await sheet.getByRole("link", { name: "연차" }).click();
      await expect(page).toHaveURL(/\/leave$/);

      const table = page.getByRole("table", { name: "내 연차" });
      await expect(table.locator("thead th").filter({ visible: true })).toHaveText(["종류 · 기간", "일수", "상태"]);
      await expect(table.getByRole("link", { name: `반차 오후 ${range.startDate.slice(5)}` })).toBeVisible();
      await expect(table.getByText(`신청 ${today.slice(5)}`, { exact: true })).toBeVisible();
      // 폰 행 높이 ≥ 44(행 전체가 탭 대상).
      const rowBox = await table.getByRole("link", { name: `반차 오후 ${range.startDate.slice(5)}` }).boundingBox();
      expect(rowBox?.height ?? 0).toBeGreaterThanOrEqual(44);
      await noHorizontalScroll(page);

      await page.getByRole("link", { name: "연차 신청" }).click();
      await expect(page).toHaveURL(/\/leave\/new$/);
      await page.context().close();
    });
  });
});
