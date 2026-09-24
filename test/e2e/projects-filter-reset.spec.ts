import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";

// Regression: ISSUE-001 — 「필터 지우기」·뒤로 가기로 URL 필터가 바뀌어도
// 상태·연도 select가 이전 값을 그대로 보였다(목록은 필터 없이 그려지는데
// 필터 칸은 「수주중」). 다음 필터 변경이 그 낡은 값을 다시 제출한다.
// Found by /qa on 2026-09-24
// Report: .gstack/qa-reports/qa-report-127-0-0-1-2026-09-24.md
test.describe("프로젝트 목록 필터 — URL과 필터 칸이 어긋나지 않는다", () => {
  test.beforeEach(async ({ page }) => {
    const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(pm.email);
    await page.getByLabel("비밀번호").fill(pm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
  });

  test("「필터 지우기」를 누르면 상태 칸이 「전체 상태」로 돌아간다", async ({ page }) => {
    await page.goto("/projects");
    await page.locator("#status").selectOption("bidding");
    await expect(page).toHaveURL(/status=bidding/);

    await page.getByRole("link", { name: "필터 지우기" }).first().click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.locator("#status")).toHaveValue("");
  });

  test("뒤로 가기로 필터 없는 URL에 돌아오면 연도 칸도 비어 있다", async ({ page }) => {
    await page.goto("/projects");
    await page.locator("#year").selectOption({ index: 1 });
    await expect(page).toHaveURL(/year=\d{4}/);

    await page.goBack();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.locator("#year")).toHaveValue("");
  });
});
