import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor } from "@/repositories/vendors";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { createProject } from "@/domain/projects";
import { db } from "@/db/client";
import { teams } from "@/db/schema";

// 04-04 Task 3 — 견적 줄 표의 키보드 계약·범위 선택·붙여넣기·전부 거부를
// E2E로 증명한다. 실제 엑셀 붙여넣기(인용 규칙)는 자동화가 닿지 못해
// 사람 확인으로 넘긴다(04-VALIDATION.md Manual-Only Verifications) — 이
// 스펙은 그 앞단계인 "브라우저 클립보드 이벤트가 표에 정확히 반영되는지"
// 까지만 증명한다.

async function loginAndOpenProject(page: Page): Promise<{ projectId: string }> {
  const client = await insertVendor(SYSTEM_VIEWER, {
    name: `E2Equote클라이언트-${Date.now()}`,
    normalizedName: `e2equote클라이언트-${Date.now()}`,
  });
  const email = `e2e-quote-${randomUUID()}@example.test`;
  const { userId: pmUserId, tempPassword } = await createAccount(SYSTEM_VIEWER, {
    email,
    name: "E2E Employee",
    roleId: DEFAULT_ROLE_ID,
  });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");

  const projectName = `E2Equote프로젝트-${Date.now()}`;
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

async function pasteIntoFocusedCell(page: Page, text: string) {
  await page.evaluate((clipboardText) => {
    const el = document.activeElement;
    const dt = new DataTransfer();
    dt.setData("text/plain", clipboardText);
    const event = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
    el?.dispatchEvent(event);
  }, text);
}

test.describe("견적 줄 표 — 키보드 계약·붙여넣기·전부 거부(04-04)", () => {
  test("(a) 마우스 클릭 없이 키보드만으로 줄 하나를 끝까지 입력하고 저장한다", async ({ page }) => {
    await loginAndOpenProject(page);

    const emptyButton = page.getByRole("button", { name: /첫 줄 만들기/ });
    await emptyButton.focus();
    await page.keyboard.press("Enter"); // 클릭 호출 없이 첫 줄을 만든다.

    const dataRow = page.locator("tbody tr").nth(1);
    const gridcell = (index: number) => dataRow.getByRole("gridcell").nth(index);

    // 항목(2) — Enter로 편집 진입 → 타이핑 → Enter로 커밋.
    await gridcell(2).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.type("키보드로만 적은 항목");
    await page.keyboard.press("Enter");

    // 단가(5) — 금액만 입력(통화는 기본 KRW를 그대로 둔다).
    await gridcell(5).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.type("1200000");
    await page.keyboard.press("Enter");

    // 실행가(7).
    await gridcell(7).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.type("800000");
    await page.keyboard.press("Enter");

    // 저장 — ⌘S/Ctrl+S(그리드에 포커스가 있는 채로).
    await gridcell(7).focus();
    await page.keyboard.press("Control+s");

    await expect(page.getByText(/저장됨/)).toBeVisible();
    await expect(page.getByText("1,200,000").first()).toBeVisible();
    await expect(page.getByText("400,000").first()).toBeVisible(); // 차익 = 1,200,000 - 800,000
  });

  test("(b) 클립보드 여러 칸 붙여넣기가 활성 셀부터 오른쪽·아래로 채운다", async ({ page }) => {
    await loginAndOpenProject(page);

    await page.getByRole("button", { name: /첫 줄 만들기/ }).click();
    const dataRow = page.locator("tbody tr").nth(1);
    const gridcell = (index: number) => dataRow.getByRole("gridcell").nth(index);

    // 항목(2)에 한 칸, 수량(4)부터 오른쪽으로 "수량\t단가" 두 칸 — 활성
    // 셀에서 오른쪽·아래로 채워지는 것을 두 자리에서 각각 확인한다.
    await gridcell(2).focus();
    await pasteIntoFocusedCell(page, "붙여넣은 항목");
    await expect(page.getByText("붙여넣은 항목")).toBeVisible();

    await gridcell(4).focus();
    await pasteIntoFocusedCell(page, "7\t50000");

    await expect(gridcell(4)).toHaveText("7"); // 수량
    await expect(gridcell(5)).toHaveText("50,000"); // 단가(KRW 서식)
  });

  test("(c)(d)(e) 숫자 아닌 값을 숫자 열에 붙여넣으면 오류로 고정되고 저장이 전부 거부되며, 다른 셀 편집값은 남는다", async ({ page }) => {
    await loginAndOpenProject(page);

    await page.getByRole("button", { name: /첫 줄 만들기/ }).click();
    const dataRow = page.locator("tbody tr").nth(1);
    const gridcell = (index: number) => dataRow.getByRole("gridcell").nth(index);

    // 항목을 먼저 채운다(UX-04 — 오류 뒤에도 이 값이 남아야 한다).
    await gridcell(2).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.type("오류 검증용 항목");
    await page.keyboard.press("Enter");

    // 단가에 숫자가 아닌 값을 붙여넣는다 — 오류 셀로 고정되어야 한다.
    await gridcell(5).focus();
    await pasteIntoFocusedCell(page, "숫자아님");

    await expect(gridcell(5)).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText(/숫자가 아닙니다/)).toBeVisible();

    // (c) 저장 버튼 자체가 오류 이유와 함께 비활성 — 서버 왕복 없이 거부.
    const saveButton = page.getByRole("button", { name: /일괄 저장/ });
    await expect(saveButton).toBeDisabled();
    await expect(page.getByText(/오류.*고쳐야 저장됩니다/)).toBeVisible();

    // (e) 항목 편집값은 오류가 있어도 그대로 남아 있다.
    await expect(page.getByText("오류 검증용 항목")).toBeVisible();

    // (d) 오류를 고치면 저장이 다시 가능해지고 전부 반영된다.
    await gridcell(5).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Control+a");
    await page.keyboard.type("1500000");
    await page.keyboard.press("Enter");

    await expect(gridcell(5)).not.toHaveAttribute("aria-invalid", "true");
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    await expect(page.getByText(/저장됨/)).toBeVisible();
    await expect(page.getByText("1,500,000").first()).toBeVisible();
  });

  test("(f) 폰 뷰포트에서 줄을 탭하면 행 시트가 열리고 행동 줄이 없다", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await loginAndOpenProject(page);

    await page.getByRole("button", { name: /첫 줄 만들기/ }).click();

    const dataRow = page.locator("tbody tr").nth(1);
    await dataRow.locator("td[role='gridcell']").nth(2).click();
    await page.keyboard.press("Enter");
    await page.keyboard.type("폰 시트 확인용 항목");
    await page.keyboard.press("Enter");

    // 접힌 요약 행(P2/P3 값)이 폰에서만 렌더되고 탭하면 시트가 열린다.
    const collapsedRow = page.locator('[role="button"][aria-label*="상세 보기"]');
    await collapsedRow.click();

    const sheet = page.getByRole("dialog", { name: /폰 시트 확인용 항목|항목명 없음/ });
    await expect(sheet).toBeVisible();
    // 행동 줄이 없다 — 시트 안에 button 요소가 "닫기" 하나뿐이다.
    const sheetButtons = sheet.getByRole("button");
    await expect(sheetButtons).toHaveCount(1);
    await expect(sheetButtons.first()).toHaveAccessibleName("닫기");
  });
});
