import { test, expect } from "@playwright/test";
import { payWeekGroupLabel, resolvePaySchedule } from "@/domain/payments/pay-schedule";
import { getSettingValue, setSettingValue } from "@/domain/settings/registry";
import { PAYMENT_WEEKDAY } from "@/domain/settings/keys";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { loginPage } from "./leave-org";
import { setupExpenseE2E } from "./expense-fixture";
import { addDays, approvedDoc, groupOf, makeTeamPayer, payCalendar, targetsGrid } from "./pay-schedule-e2e";

// 07-16 B-P3-9 — 공용 설정 `payment.weekday`를 바꾸는 스펙이라 desktop-settings 한 워커에서만 돈다(playwright.config.ts DESKTOP_SETTINGS_SPECS).
// 머리글 요일 글자는 화면이 만들지 않고 07-01 라벨(설정 요일로 셈한 지급일)을 그대로 그린다 — 설정을 목요일로 바꾸면 머리글이 `목`.
test.describe.serial("설정 지급 요일 → 지급 대상 머리글 (07-16 Task 2)", () => {
  let original: "mon" | "tue" | "wed" | "thu" | "fri" = "fri";

  test.beforeAll(async () => {
    original = await getSettingValue(PAYMENT_WEEKDAY);
    await setSettingValue(SYSTEM_VIEWER, PAYMENT_WEEKDAY, "thu");
  });

  test.afterAll(async () => {
    await setSettingValue(SYSTEM_VIEWER, PAYMENT_WEEKDAY, original);
  });

  test("지급 요일 목 → 이번 주 · 다음 주 머리글 요일 `목`", async ({ browser, baseURL }) => {
    const cal = await payCalendar();
    expect(cal.cfg.payWeekday).toBe("thu");
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    const issuedOn = addDays(cal.today, 7 - cal.cfg.termDays);
    const { approvedAt } = await approvedDoc(fx, "retry", payer, { issuedOn });
    const schedule = resolvePaySchedule({ baseDate: issuedOn, termDays: cal.cfg.termDays, manualDate: null, approvedAt, now: new Date(), lookup: cal.lookup, cfg: cal.cfg });
    const label = payWeekGroupLabel(schedule, cal.today).label;
    test.skip(schedule.pushReason === "no-slot", "기한 안 목요일 없음(공휴일) — 마지막 영업일 갈래");
    expect(label).toMatch(/^(이번|다음) 주 목 /);

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    await expect(targetsGrid(page)).toBeVisible();
    expect(await groupOf(page, fx.lines.retry.itemName)).toBe(label);
    await page.context().close();
  });
});
