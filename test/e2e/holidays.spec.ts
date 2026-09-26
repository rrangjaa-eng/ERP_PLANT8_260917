import { randomUUID } from "node:crypto";
import { and, eq, gte, lte } from "drizzle-orm";
import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { db } from "@/db/client";
import { holidays, holidayYearConfirmations } from "@/db/schema";
import { toKstDate } from "@/domain/holidays/business-day";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertRole, setRoleArchived } from "@/repositories/roles";

// 04.2-11 — 공휴일 관리 화면(ADMN-11). 확정 상태를 바꾸는 E2E는 이 파일 밖에 두지
// 않는다 — 같은 파일 안에서 직렬로 돌고, 확정을 누르는 테스트는 시작할 때 다음 해
// 확정 기록만 지워 되풀이 실행에도 「확정 전」에서 시작한다(되돌리기 경로는
// 프로덕션 코드에 없다 — UI-SPEC 가정 U-2).
test.describe.configure({ mode: "serial" });

const THIS_YEAR = Number(toKstDate(new Date()).slice(0, 4));
const NEXT_YEAR = THIS_YEAR + 1;

async function resetConfirmation(year: number): Promise<void> {
  await db.delete(holidayYearConfirmations).where(eq(holidayYearConfirmations.year, year));
}

async function holidayCount(year: number): Promise<number> {
  const rows = await db
    .select({ id: holidays.id })
    .from(holidays)
    .where(and(gte(holidays.date, `${year}-01-01`), lte(holidays.date, `${year}-12-31`)));
  return rows.length;
}

async function login(page: Page, credentials: { email: string; password: string }): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(credentials.email);
  await page.getByLabel("비밀번호").fill(credentials.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function loginAsSysadmin(page: Page): Promise<void> {
  await login(page, await createFixtureUser({ roleId: SYSADMIN_ROLE_ID }));
}

test.describe("공휴일 관리 /admin/holidays", () => {
  test("관리 인덱스 → 공휴일 → 다음 해 후보 표 → 확정하면 버튼이 사라지고 상태 줄이 확정으로 바뀐다", async ({
    page,
  }) => {
    await resetConfirmation(NEXT_YEAR);
    await loginAsSysadmin(page);

    await page.goto("/admin");
    await page.getByRole("link", { name: "공휴일", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/holidays$/);
    await expect(page.getByRole("heading", { name: "공휴일", exact: true })).toBeVisible();

    await page.goto(`/admin/holidays?year=${NEXT_YEAR}`);
    const table = page.getByRole("table", { name: `${NEXT_YEAR}년 공휴일` });
    await expect(table).toBeVisible();
    for (const header of ["날짜", "요일", "이름", "구분", "동작"]) {
      await expect(table.getByRole("columnheader", { name: header, exact: true })).toBeVisible();
    }

    const count = await holidayCount(NEXT_YEAR);
    expect(count).toBeGreaterThan(0);
    await expect(table.locator("tbody tr")).toHaveCount(count);
    await expect(page.getByText(`후보 · 공휴일 ${count}일`, { exact: true })).toBeVisible();

    const confirm = page.getByRole("button", { name: `${NEXT_YEAR}년 공휴일 확정` });
    await confirm.click();

    await expect(confirm).toHaveCount(0);
    await expect(
      page.getByText(new RegExp(`^확정 · \\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2} E2E Admin · 공휴일 ${count}일$`)),
    ).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "확정" })).toHaveCount(0);
    expect(await db.select().from(holidayYearConfirmations).where(eq(holidayYearConfirmations.year, NEXT_YEAR))).toHaveLength(1);
  });

  test("보기만 가진 계급은 표를 보지만 확정 버튼과 동작 칸이 없고, 권한 없는 계급은 404다", async ({ page }) => {
    await resetConfirmation(NEXT_YEAR);
    const tempRoleId = `role-e2e-holiday-view-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: tempRoleId, name: `E2E 임시 계급 ${tempRoleId.slice(-12)}`, sortOrder: 99 });
    await setPermissionCell(SYSTEM_VIEWER, { roleId: tempRoleId, menu: "admin.holidays", action: "view", allowed: true });

    try {
      await login(page, await createFixtureUser({ roleId: tempRoleId }));
      const response = await page.goto(`/admin/holidays?year=${NEXT_YEAR}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("table", { name: `${NEXT_YEAR}년 공휴일` })).toBeVisible();
      await expect(page.getByText(/^후보 · 공휴일 \d+일$/)).toBeVisible();
      await expect(page.getByRole("button", { name: /공휴일 확정/ })).toHaveCount(0);
      await expect(page.getByRole("columnheader", { name: "동작" })).toHaveCount(0);
    } finally {
      await setRoleArchived(SYSTEM_VIEWER, tempRoleId, true);
    }
  });

  test("admin.holidays view가 없는 계급(기획 PM)에게 /admin/holidays는 404다", async ({ page }) => {
    await login(page, await createFixtureUser({ roleId: DEFAULT_ROLE_ID }));
    const response = await page.goto("/admin/holidays");
    expect(response?.status()).toBe(404);
  });
});
