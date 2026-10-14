import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { registerPerson } from "@/domain/people";
import { updatePersonPayoutAccount } from "@/domain/people/account";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { insertRole } from "@/repositories/roles";
import { insertVisibilityIfAbsent } from "@/repositories/permissions";
import { createFixtureUser } from "./fixtures";

// 06.5-04(D-6505 · UI-SPEC V2): 사람 상세 「지급 계좌」 섹션 + 옆 패널 「지급 계좌 수정」.
// 대상은 이 스펙이 만든 전용 사람이다(다른 사례와 계좌가 섞이지 않게).

async function login(page: Page, creds: { email: string; password: string }): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(creds.email);
  await page.getByLabel("비밀번호").fill(creds.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function makeTarget(): Promise<string> {
  const { userId } = await registerPerson(SYSTEM_VIEWER, {
    name: `계좌대상${randomUUID().slice(0, 5)}`,
    email: `e2e-payout-${randomUUID()}@example.test`,
    roleId: DEFAULT_ROLE_ID,
  });
  return userId;
}

const panel = (page: Page) => page.locator('dialog[data-ui="side-panel"]');
const section = (page: Page) => page.getByRole("region", { name: "지급 계좌" });

test.describe("사람 상세 지급 계좌(06.5 D-6505)", () => {
  test("계좌 적기 → 패널 저장 → 섹션에 끝 4자리 마스킹 · 3차 계좌 바꾸기 · 포커스 복귀", async ({ page }) => {
    await login(page, await createFixtureUser({ roleId: SYSADMIN_ROLE_ID }));
    const userId = await makeTarget();
    await page.goto(`/admin/people/${userId}`);

    await expect(section(page).getByRole("heading", { name: "지급 계좌" })).toBeVisible();
    await expect(section(page).locator("dd")).toHaveText(["—", "—", "—"]);
    await section(page).getByRole("link", { name: "계좌 적기" }).click();

    await expect(page).toHaveURL(/editAccount=1/);
    await expect(page.getByRole("dialog", { name: "지급 계좌 수정" })).toBeVisible();
    await panel(page).getByLabel("계좌 은행").fill("신한");
    await panel(page).getByLabel("예금주").fill("김직원");
    await panel(page).getByLabel("새 계좌번호").fill("110-123-456789");
    await panel(page).getByRole("button", { name: "계좌 저장" }).click();

    await expect(panel(page)).toHaveCount(0);
    await expect(section(page).locator("dd")).toHaveText(["신한", "김직원", /\*{4}-\*{2}-6789/]);
    const tertiary = section(page).getByRole("link", { name: "계좌 바꾸기" });
    await expect(tertiary).toBeVisible();
    await expect(tertiary).toBeFocused();
  });

  test("번호 보기 · 가리기(서버 한 번) · aria-live · 새 계좌번호 숫자 자판 · 계좌번호 지우기", async ({ page }) => {
    await login(page, await createFixtureUser({ roleId: SYSADMIN_ROLE_ID }));
    const userId = await makeTarget();
    await updatePersonPayoutAccount(SYSTEM_VIEWER, userId, { accountBank: "신한", accountHolder: "김직원", accountNumber: "110-123-456789" });
    await page.goto(`/admin/people/${userId}`);

    let actionPosts = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.headers()["next-action"]) actionPosts += 1;
    });
    const number = section(page).locator('[aria-live="polite"]');
    await section(page).getByRole("button", { name: "번호 보기" }).click();
    await expect(number).toHaveText("110-123-456789");
    await section(page).getByRole("button", { name: "가리기" }).click();
    await expect(number).toHaveText(/\*{4}-\*{2}-6789/);
    expect(actionPosts).toBe(1);

    await section(page).getByRole("link", { name: "계좌 바꾸기" }).click();
    await expect(panel(page).getByLabel("새 계좌번호")).toHaveAttribute("inputmode", "numeric");
    await panel(page).getByLabel("계좌번호 지우기").check();
    await panel(page).getByRole("button", { name: "계좌 저장" }).click();
    await expect(panel(page)).toHaveCount(0);
    await expect(section(page).locator("dd")).toHaveText(["신한", "김직원", "—"]);
    await expect(section(page).getByRole("link", { name: "계좌 바꾸기" })).toBeVisible();
  });

  test("직원 본인 · 사람 보기만 가진 계급에게는 지급 계좌가 없다(주소로 열어도 패널 없음)", async ({ page, browser, baseURL }) => {
    await login(page, await createFixtureUser({ roleId: DEFAULT_ROLE_ID }));
    await page.goto("/account");
    await expect(page.getByText("지급 계좌")).toHaveCount(0);

    // 「admin.people 보기만」 계급 — 지급 처리 쓰기가 없어 게이트가 거짓이다.
    const roleId = `role-e2e-payout-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: roleId, name: `E2E 사람보기 ${roleId.slice(-8)}`, sortOrder: 99 });
    await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "admin.people", action: "view", allowed: true });
    await insertVisibilityIfAbsent(SYSTEM_VIEWER, { roleId, infoItem: "person.value", visible: true });
    const viewerPage = await (await browser.newContext({ baseURL })).newPage();
    await login(viewerPage, await createFixtureUser({ roleId }));
    const userId = await makeTarget();
    await updatePersonPayoutAccount(SYSTEM_VIEWER, userId, { accountBank: "신한", accountHolder: "김직원", accountNumber: "110-123-456789" });
    await viewerPage.goto(`/admin/people/${userId}`);
    await expect(viewerPage.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(viewerPage.getByText("지급 계좌")).toHaveCount(0);
    await viewerPage.goto(`/admin/people/${userId}?editAccount=1`);
    await expect(viewerPage.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(viewerPage.locator('dialog[data-ui="side-panel"]')).toHaveCount(0);
    await expect(viewerPage.getByText("지급 계좌")).toHaveCount(0);
    await viewerPage.context().close();
  });

  test("칸 오류 — 예금주 한글 11자는 길이 초과, 은행 + 번호 + 빈 예금주는 예금주 없음 · 포커스 예금주", async ({ page }) => {
    await login(page, await createFixtureUser({ roleId: SYSADMIN_ROLE_ID }));
    const userId = await makeTarget();
    await page.goto(`/admin/people/${userId}?editAccount=1`);
    await panel(page).getByLabel("계좌 은행").fill("신한");
    await panel(page).getByLabel("예금주").fill("가나다라마바사아자차카");
    await panel(page).getByRole("button", { name: "계좌 저장" }).click();
    await expect(panel(page).locator("#accountHolder-error")).toHaveText("예금주 길이 초과 · 예금주 줄이기");

    await panel(page).getByLabel("예금주").fill("");
    await panel(page).getByLabel("새 계좌번호").fill("110-123-456789");
    await panel(page).getByRole("button", { name: "계좌 저장" }).click();
    await expect(panel(page).locator("#accountHolder-error")).toHaveText("예금주 없음 · 예금주 적기");
    await expect(panel(page).getByLabel("예금주")).toBeFocused();
    await expect(panel(page).getByLabel("계좌 은행")).toHaveValue("신한");
  });
});

