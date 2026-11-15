import { inArray } from "drizzle-orm";
import { test, expect, type Page } from "@playwright/test";
import { db } from "@/db/client";
import { holidays } from "@/db/schema";
import { submitLeave } from "@/domain/leave";
import { seoulToday } from "@/lib/dates";
import { leaveWeekdayRange } from "./leave-dates";
import { setupLeaveOrg } from "./leave-org";
import { loginAsSysadmin } from "./row-actions-helpers";

// 07.5-05 /review P3 · /design-review: 폰 필터 줄 규칙을 선택 링크 줄(<nav>)에 넓힌 뒤에도, 링크 줄과 1차가 한 줄에 들어가는 목록은
// 1차가 링크 줄 옆(같은 줄 오른쪽 끝)에 남는다 — 거래처 「갈래」와 같은 배치. 링크가 1차 옆에서 접힐 때만 1차가 다음 줄로 내려간다
// (그 경우는 mobile-field-definitions.spec.ts가 잠근다). 공휴일 「공휴일 추가」 · 연차 「내 연차」 「연차 신청」.
const HOLIDAY_NAMES = ["E2E폰1차휴일가", "E2E폰1차휴일나"];

test.afterAll(async () => {
  await db.delete(holidays).where(inArray(holidays.name, HOLIDAY_NAMES));
});

async function expectPrimaryBesideNav(page: Page, navName: string, primaryName: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  const nav = page.getByRole("navigation", { name: navName });
  const primary = page.getByRole("link", { name: primaryName, exact: true }).first();
  await expect(primary).toBeVisible();
  const navBox = await nav.boundingBox();
  const primaryBox = await primary.boundingBox();
  expect(navBox && primaryBox, "상자").toBeTruthy();
  // 같은 줄: 1차 위 끝이 링크 줄 상자 안에 있다(다음 줄이면 링크 줄 아래 끝보다 아래).
  expect(primaryBox!.y, `1차 y ${primaryBox!.y} · 링크 줄 y ${navBox!.y} h ${navBox!.height}`).toBeLessThan(navBox!.y + navBox!.height);
  expect(primaryBox!.x).toBeGreaterThan(navBox!.x + navBox!.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
}

for (const width of [320, 375]) {
  test(`폰 ${width} 공휴일: 연도 링크 줄과 「공휴일 추가」가 한 줄`, async ({ page }) => {
    const year = Number(seoulToday().slice(0, 4)) - 1;
    await db
      .insert(holidays)
      .values([
        { date: `${year}-04-13`, name: HOLIDAY_NAMES[0]!, kind: "temporary" },
        { date: `${year}-06-15`, name: HOLIDAY_NAMES[1]!, kind: "temporary" },
      ])
      .onConflictDoNothing();
    await page.setViewportSize({ width, height: 800 });
    await loginAsSysadmin(page);
    await page.goto(`/admin/holidays?year=${year}`);
    await expectPrimaryBesideNav(page, "연도", "공휴일 추가");
  });

  test(`폰 ${width} 내 연차(팀장): 보기 링크 줄과 「연차 신청」이 한 줄`, async ({ page }) => {
    const org = await setupLeaveOrg(seoulToday());
    const range = leaveWeekdayRange(seoulToday(), { week: 3, weekdays: 1 });
    await submitLeave(org.teamLead.viewer, { kind: "full_day", startDate: range.startDate, endDate: range.endDate, half: "" });
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(org.teamLead.email);
    await page.getByLabel("비밀번호").fill(org.teamLead.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/leave");
    await expectPrimaryBesideNav(page, "연차 보기", "연차 신청");
  });
}
