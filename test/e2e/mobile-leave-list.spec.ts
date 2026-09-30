import { test, expect, type Browser, type Page } from "@playwright/test";
import { rejectDocument } from "@/domain/approvals";
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

      // 접힌 줄을 눌러도 그 문서로 간다 — 행 전체가 링크(DOM 감사 #6 · UI-SPEC S1).
      await table.getByText(`신청 ${today.slice(5)}`, { exact: true }).click();
      await expect(page).toHaveURL(/\/leave\/[0-9a-f-]{36}$/);
      await page.goBack();

      await page.getByRole("link", { name: "연차 신청" }).click();
      await expect(page).toHaveURL(/\/leave\/new$/);
      await page.context().close();
    });
  });

  test("신청 폼(S2 폰): 행동 줄이 하단 탭 위에 고정되고 비고 칸이 가려지지 않는다", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const org = await setupLeaveOrg(today);
      const page = await login(browser, baseURL, org.drafter);
      await page.goto("/leave/new");
      // 하이드레이션 전에 채운 입력은 버려진다 — 마운트 미리보기의 결재선 한 줄이 뜬 뒤(= 하이드레이션 끝) 입력한다.
      await expect(page.getByTestId("approval-route-line")).toBeVisible();
      await page.getByLabel("시작일").fill(leaveWeekdayRange(today, { week: 13, weekdays: 1 }).startDate);

      const bar = page.getByTestId("leave-form-actions");
      // 사용자 결정 2026-09-29 A(PR #90 5894348076) — 폰 고정 제출 줄도 취소 왼쪽 · 1차 오른쪽, DOM · Tab 순서도 취소 → 연차 신청.
      const [cancelBox, submitBox] = [
        await bar.getByRole("button", { name: /^취소/ }).boundingBox(),
        await bar.getByRole("button", { name: /^연차 신청/ }).boundingBox(),
      ];
      expect(cancelBox?.x ?? 0).toBeLessThan(submitBox?.x ?? 0);
      expect(
        await bar.evaluate((node) =>
          [...node.querySelectorAll("button")].map((button) => button.textContent?.trim() ?? "").filter((text) => /^(취소|연차 신청)/.test(text)),
        ),
      ).toEqual([expect.stringMatching(/^취소/), expect.stringMatching(/^연차 신청/)]);
      const tabs = page.getByRole("navigation", { name: "하단 탭" });
      const barBox = await bar.boundingBox();
      const tabsBox = await tabs.boundingBox();
      if (!barBox || !tabsBox) throw new Error("행동 줄 · 하단 탭 상자 없음");
      expect(await bar.evaluate((node) => getComputedStyle(node).position)).toBe("fixed");
      expect(barBox.y + barBox.height).toBeLessThanOrEqual(tabsBox.y + 1);

      const note = page.getByLabel("비고");
      await note.scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const noteBox = await note.boundingBox();
      const barAfter = await bar.boundingBox();
      if (!noteBox || !barAfter) throw new Error("비고 · 행동 줄 상자 없음");
      expect(noteBox.y + noteBox.height).toBeLessThanOrEqual(barAfter.y);
      await expect(bar.locator("kbd").filter({ visible: true })).toHaveCount(0);
      await noHorizontalScroll(page);
      await page.context().close();
    });
  });

  // DOM 감사 blocker(04.1-06): 다시 신청 모드의 결재선 한 줄이 폰 고정 행동 줄에 가리지 않는다 — 새 신청과 같은
  // 자리(폼 안 라벨·값 목록 `결재선` 행)에 있어 행동 줄 여백 위에 온다.
  test("다시 신청 폼(S3 폰): 스크롤을 끝까지 내리면 결재선 한 줄이 행동 줄 위에 다 보인다", async ({ browser, baseURL }) => {
    await onStableSeoulDay(async (today) => {
      const org = await setupLeaveOrg(today);
      const range = leaveWeekdayRange(today, { week: 14, weekdays: 1 });
      const rejected = await submitLeave(org.drafter.viewer, { kind: "full_day", half: "", ...range });
      await rejectDocument(org.teamLead.viewer, { instanceId: rejected.instanceId, expectedVersion: rejected.version, reason: "일정 겹침" });
      const page = await login(browser, baseURL, org.drafter);
      await page.goto(`/leave/${rejected.leaveId}`);

      const route = page.getByTestId("approval-route-line");
      await expect(route).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const routeBox = await route.boundingBox();
      const barBox = await page.getByTestId("leave-form-actions").boundingBox();
      if (!routeBox || !barBox) throw new Error("결재선 · 행동 줄 상자 없음");
      expect(routeBox.y + routeBox.height).toBeLessThanOrEqual(barBox.y);
      await page.context().close();
    });
  });
});
