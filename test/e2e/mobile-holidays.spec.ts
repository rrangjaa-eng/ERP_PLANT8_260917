import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { db } from "@/db/client";
import { holidays, holidayYearConfirmations } from "@/db/schema";
import { toKstDate } from "@/domain/holidays/business-day";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// 04.2-12 Task 3 — 폰 375(UI-SPEC S2-c 칸 접기 · S2-b 폰 확정 버튼 · S2-d 폼 · S2-f 결과 줄 ·
// Spacing 「터치 목표」). 누르는 영역은 보이는 상자가 아니라 요소 중심 ±21.5px 네 점의
// elementFromPoint로 잰다(디자인 리뷰 #7).
test.describe.configure({ mode: "serial" });

const NEXT_YEAR = Number(toKstDate(new Date()).slice(0, 4)) + 1;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const LONG_ROW = {
  date: `${NEXT_YEAR}-07-10`,
  name: "대한민국 임시공휴일 지정에 관한 아주 긴 이름의 테스트 공휴일 가나다라마바사아자차카타파하",
};
const SHORT_ROW = { date: `${NEXT_YEAR}-07-13`, name: "폰 임시 테스트" };

async function login(page: Page): Promise<void> {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

// 요소 중심에서 (±21.5, ±21.5) 네 점이 모두 그 요소(또는 자손)를 맞히면 누르는 영역이 44×44 이상이다.
async function expectTouchTarget(target: Locator, label: string): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const misses = await target.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const points = [
      [cx - 21.5, cy - 21.5],
      [cx + 21.5, cy - 21.5],
      [cx - 21.5, cy + 21.5],
      [cx + 21.5, cy + 21.5],
    ];
    return points
      .filter(([x, y]) => {
        const hit = document.elementFromPoint(x ?? 0, y ?? 0);
        return !hit || !(hit === el || el.contains(hit));
      })
      .map(([x, y]) => `${Math.round(x ?? 0)},${Math.round(y ?? 0)}`);
  });
  expect(misses, `${label} 누르는 영역 44×44`).toEqual([]);
}

test.describe("폰 375 /admin/holidays", () => {
  test.beforeEach(async () => {
    await db.delete(holidayYearConfirmations).where(eq(holidayYearConfirmations.year, NEXT_YEAR));
    await db.delete(holidays).where(inArray(holidays.date, [LONG_ROW.date, SHORT_ROW.date]));
    await db.insert(holidays).values([
      { ...LONG_ROW, kind: "temporary" },
      { ...SHORT_ROW, kind: "election" },
    ]);
  });

  test.afterAll(async () => {
    await db.delete(holidays).where(inArray(holidays.date, [LONG_ROW.date, SHORT_ROW.date]));
  });

  test("표는 날짜·이름·동작만 칸으로 남고 요일 · 구분은 행 아래 접힌 줄이며 가로 스크롤이 없다", async ({ page }) => {
    await login(page);
    await page.goto(`/admin/holidays?year=${NEXT_YEAR}`);
    const table = page.getByRole("table", { name: `${NEXT_YEAR}년 공휴일` });

    const headers = table.locator("thead th").filter({ visible: true });
    await expect(headers).toHaveText(["날짜", "이름", "동작"]);

    const rows = await db
      .select({ date: holidays.date })
      .from(holidays)
      .where(and(gte(holidays.date, `${NEXT_YEAR}-01-01`), lte(holidays.date, `${NEXT_YEAR}-12-31`)));
    const mainRows = table.locator("tbody tr").filter({ has: page.locator("td", { hasText: /^\d{2}-\d{2}$/ }) });
    await expect(mainRows).toHaveCount(rows.length);

    const mainRow = table.locator("tbody tr", { hasText: SHORT_ROW.name });
    const fold = mainRow.locator("xpath=following-sibling::tr[1]");
    const weekday = WEEKDAYS[new Date(`${SHORT_ROW.date}T00:00:00Z`).getUTCDay()];
    await expect(fold).toBeVisible();
    await expect(fold).toHaveText(`${weekday} · 선거일`);
    await expect(mainRow.locator("td").filter({ visible: true })).toHaveCount(3);

    await expectNoHorizontalScroll(page);
  });

  test("확정 버튼은 상태 줄 아래 전폭이고 보이는 높이 40 이상 · 누르는 영역이 모두 44×44 이상이다", async ({ page }) => {
    await login(page);
    await page.goto(`/admin/holidays?year=${NEXT_YEAR}`);

    const confirm = page.getByRole("button", { name: `${NEXT_YEAR}년 공휴일 확정` });
    const status = page.getByText(/^후보 · 공휴일 \d+일$/);
    const [confirmBox, statusBox, tableBox] = await Promise.all([
      confirm.boundingBox(),
      status.boundingBox(),
      page.getByRole("table", { name: `${NEXT_YEAR}년 공휴일` }).boundingBox(),
    ]);
    expect(confirmBox && statusBox && tableBox).toBeTruthy();
    expect(confirmBox!.y).toBeGreaterThanOrEqual(statusBox!.y + statusBox!.height);
    expect(confirmBox!.height).toBeGreaterThanOrEqual(40);
    expect(Math.abs(confirmBox!.width - tableBox!.width)).toBeLessThanOrEqual(1);

    await expectTouchTarget(confirm, "확정");
    await expectTouchTarget(page.getByRole("link", { name: "공휴일 추가", exact: true }), "필터 줄 공휴일 추가");
    const yearLinks = page.getByRole("navigation", { name: "연도" }).getByRole("link");
    for (let i = 0; i < (await yearLinks.count()); i += 1) {
      await expectTouchTarget(yearLinks.nth(i), `연도 링크 ${i}`);
    }
    const deleteShort = page.locator("tbody tr", { hasText: SHORT_ROW.name }).getByRole("button", { name: "삭제" });
    await expectTouchTarget(deleteShort, "삭제");

    await deleteShort.click();
    const undo = page.getByRole("status").filter({ hasText: "삭제됨" }).getByRole("button", { name: "되돌리기" });
    await expect(undo).toBeVisible();
    await expectTouchTarget(undo, "되돌리기");
  });

  test("긴 이름 행을 지우면 결과 줄이 줄바꿈되어 가로 스크롤이 없다", async ({ page }) => {
    await login(page);
    await page.goto(`/admin/holidays?year=${NEXT_YEAR}`);

    await page.locator("tbody tr", { hasText: LONG_ROW.name }).getByRole("button", { name: "삭제" }).click();
    const line = page.getByRole("status").filter({ hasText: "삭제됨" });
    await expect(line).toContainText(`${LONG_ROW.date} ${LONG_ROW.name} 삭제됨`);
    await expect(line.getByRole("button", { name: "되돌리기" })).toBeVisible();
    const lineBox = await line.boundingBox();
    expect(lineBox!.height).toBeGreaterThan(44);
    await expectNoHorizontalScroll(page);
  });

  test("폼은 라벨이 칸 위에 있고 칸이 전폭이며, 1차 공휴일 추가·취소의 누르는 영역이 44×44 이상이다", async ({ page }) => {
    await login(page);
    await page.goto(`/admin/holidays?year=${NEXT_YEAR}&new=1`);

    for (const label of ["날짜", "종류", "이름"]) {
      const control = page.getByLabel(label);
      const labelEl = page.locator("label", { hasText: new RegExp(`^${label}$`) });
      const [controlBox, labelBox, formBox] = await Promise.all([
        control.boundingBox(),
        labelEl.boundingBox(),
        page.locator("form#holiday-form").boundingBox(),
      ]);
      expect(labelBox!.y + labelBox!.height, `${label} 라벨이 위`).toBeLessThanOrEqual(controlBox!.y);
      expect(Math.abs(controlBox!.width - formBox!.width), `${label} 칸 전폭`).toBeLessThanOrEqual(1);
    }

    await expectTouchTarget(page.getByRole("button", { name: "공휴일 추가", exact: true }), "폼 1차 공휴일 추가");
    await expectTouchTarget(page.getByRole("link", { name: "취소", exact: true }), "취소");
    await expectNoHorizontalScroll(page);
  });
});
