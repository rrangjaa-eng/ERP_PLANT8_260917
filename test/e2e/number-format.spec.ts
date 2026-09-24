import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor } from "@/repositories/vendors";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { createProject } from "@/domain/projects";
import { db } from "@/db/client";
import { teams } from "@/db/schema";

// 04-09 — D-95(숫자는 모두 천 단위 쉼표) E2E. Task 1은 트레이서(외화 견적
// 줄 단가 2행) 한 경로만 증명한다 — 나머지 표시·입력 경로는 Task 2·3이 더한다.

async function loginAndOpenProject(page: Page): Promise<{ projectId: string }> {
  const client = await insertVendor(SYSTEM_VIEWER, {
    name: `E2Enumber클라이언트-${Date.now()}`,
    normalizedName: `e2enumber클라이언트-${Date.now()}`,
  });
  const email = `e2e-number-${randomUUID()}@example.test`;
  const { userId: pmUserId, tempPassword } = await createAccount(SYSTEM_VIEWER, {
    email,
    name: "E2E Employee",
    roleId: DEFAULT_ROLE_ID,
  });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");

  const projectName = `E2Enumber프로젝트-${Date.now()}`;
  const project = await createProject(SYSTEM_VIEWER, {
    clientId: client.id,
    teamId: team.id,
    pmUserId,
    name: projectName,
  });

  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(tempPassword);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);

  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

  return { projectId: project.id };
}

test.describe("숫자 서식(D-95, 04-09)", () => {
  test("Task 1 — 외화 견적 줄 단가 2행이 USD 4,400.00 @1,318.1818로 저장·표시된다", async ({ page }) => {
    await loginAndOpenProject(page);

    await page.getByRole("button", { name: /첫 줄 만들기/ }).click();
    const dataRow = page.locator("tbody tr").nth(1);
    const gridcell = (index: number) => dataRow.getByRole("gridcell").nth(index);

    await gridcell(2).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.type("외화 단가 확인용 항목");
    await page.keyboard.press("Enter");

    await gridcell(5).focus();
    await page.keyboard.press("Enter");
    await page.getByLabel("단가 통화").selectOption("USD");
    await page.getByLabel("단가", { exact: true }).fill("4400");
    const fxRateInput = page.getByLabel("단가 환율");
    await fxRateInput.fill("1318.1818");
    await fxRateInput.press("Enter");

    await expect(page.getByText("USD 4,400.00 @1,318.1818")).toBeVisible();

    await gridcell(5).focus();
    await page.keyboard.press("Control+s");
    await expect(page.getByText(/저장됨/)).toBeVisible();

    await expect(page.getByText("USD 4,400.00 @1,318.1818")).toBeVisible();
  });
});
