import { eq } from "drizzle-orm";
import { test, expect, type Page } from "@playwright/test";
import { db } from "@/db/client";
import { notificationRules } from "@/db/schema";
import { CONDITION_KINDS } from "@/domain/notify/condition-kinds";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { createFixtureUser } from "./fixtures";

// 07-19 SC-05 알림 규칙 화면(N1 · N2 · N4 · U6 · D-744). 규칙 표는 전역 한 벌이라 이 스펙은 직렬로 돌고 자기가 만진 규칙 행을 끝에 지운다.
test.describe.configure({ mode: "serial" });

const TOUCHED_KINDS = ["approval-waiting", "expense-result", "project-end-no-expense"];

test.afterEach(async () => {
  for (const kind of TOUCHED_KINDS) await db.delete(notificationRules).where(eq(notificationRules.kind, kind));
});

async function loginAsSysadmin(page: Page): Promise<void> {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

function ruleRow(page: Page, label: string) {
  return page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: label, exact: true }) });
}

function nameOf(page: Page, label: string) {
  return page.getByRole("rowheader", { name: label, exact: true }).locator("[data-enabled]");
}

function onBox(page: Page, label: string) {
  return page.getByRole("checkbox", { name: `${label} 켬` });
}

test("관리 인덱스 설정·권한 그룹에서 시스템 설정 다음에 알림 규칙으로 닿는다", async ({ page }) => {
  await loginAsSysadmin(page);
  await page.goto("/admin");
  const group = page.locator("section").filter({ has: page.getByRole("heading", { name: "설정·권한" }) });
  await expect(group.getByRole("link")).toHaveText(["권한표", "정보 노출표", "시스템 설정", "알림 규칙"]);
  await group.getByRole("link", { name: "알림 규칙" }).click();
  await expect(page).toHaveURL(/\/admin\/notification-rules$/);
  await expect(page.getByRole("heading", { name: "알림 규칙", level: 1 })).toBeVisible();
});

test("표는 등록 순서 그대로 모든 종류를 보이고 지급 규칙 행이 따로 없다(N1 · D-744)", async ({ page }) => {
  await loginAsSysadmin(page);
  await page.goto("/admin/notification-rules");
  const names = await page.locator("tbody tr th[scope='row']").allTextContents();
  expect(names.map((name) => name.trim())).toEqual(CONDITION_KINDS.map((kind) => kind.label));
  expect(names.some((name) => name.includes("지급 완료") || name.includes("지급 취소"))).toBe(false);
  await expect(page.getByRole("columnheader")).toContainText(["규칙", "일수", "켬", "받는 사람", "이메일"]);
  await expect(onBox(page, "결재 결과")).not.toBeChecked();
  await expect(ruleRow(page, "결재 차례").getByRole("cell").nth(0)).toHaveText("3영업일");
});

test("켬 해제는 토스트 없이 즉시 저장 · 행이 muted · 위치 그대로 · 새로 불러와도 해제 · 다시 체크하면 켬(N4)", async ({ page }) => {
  await loginAsSysadmin(page);
  await page.goto("/admin/notification-rules");
  const before = await page.locator("tbody tr th[scope='row']").allTextContents();
  const box = onBox(page, "결재 차례");
  await expect(box).toBeChecked();
  const mutedColor = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--text-muted)";
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  await box.uncheck();
  await expect(box).not.toBeChecked();
  await expect(nameOf(page, "결재 차례")).toHaveAttribute("data-enabled", "false");
  await expect(nameOf(page, "결재 차례")).toHaveCSS("color", mutedColor);
  await expect(page.getByText(/규칙 저장|저장됨/)).toHaveCount(0);
  expect(await page.locator("tbody tr th[scope='row']").allTextContents()).toEqual(before);
  await expect.poll(async () => (await db.select().from(notificationRules).where(eq(notificationRules.kind, "approval-waiting")))[0]?.enabled).toBe(false);
  await page.reload();
  await expect(onBox(page, "결재 차례")).not.toBeChecked();
  await onBox(page, "결재 차례").check();
  await expect(onBox(page, "결재 차례")).toBeChecked();
  await expect(nameOf(page, "결재 차례")).toHaveAttribute("data-enabled", "true");
  await page.reload();
  await expect(onBox(page, "결재 차례")).toBeChecked();
});

test("켬 저장 중에는 그 체크박스만 aria-busy · aria-disabled이고 연타해도 요청 하나 · 다른 행은 눌린다(U6)", async ({ page }) => {
  await loginAsSysadmin(page);
  await page.goto("/admin/notification-rules");
  let posts = 0;
  await page.route("**/admin/notification-rules", async (route) => {
    if (route.request().method() === "POST") {
      posts += 1;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    await route.continue();
  });
  const box = onBox(page, "결재 차례");
  await box.click();
  await expect(box).toHaveAttribute("aria-busy", "true");
  await expect(box).toHaveAttribute("aria-disabled", "true");
  await box.click({ force: true });
  await box.click({ force: true });
  const other = onBox(page, "종료 후 지출결의 없음");
  await expect(other).not.toHaveAttribute("aria-busy", "true");
  await expect(other).not.toHaveAttribute("aria-disabled", "true");
  await expect(box).not.toHaveAttribute("aria-busy", "true", { timeout: 10_000 });
  expect(posts).toBe(1);
  await expect(box).not.toBeChecked();
});

test("켬 저장이 끊기면 응답 뒤 체크가 원래대로 · 표 위 오류 줄 · 다시 시도로 저장(N4)", async ({ page }) => {
  await loginAsSysadmin(page);
  await page.goto("/admin/notification-rules");
  await page.route("**/admin/notification-rules", async (route) => {
    if (route.request().method() === "POST") {
      await route.abort();
      return;
    }
    await route.continue();
  });
  const box = onBox(page, "결재 차례");
  await box.uncheck();
  const line = page.getByRole("alert").filter({ hasText: "켬 저장 실패 · 다시 시도" });
  await expect(line).toBeVisible();
  await expect(box).toBeChecked();
  await page.unroute("**/admin/notification-rules");
  const retry = line.getByRole("button", { name: "다시 시도" });
  await retry.focus();
  await page.keyboard.press("Enter");
  await expect(line).toHaveCount(0);
  await expect(box).not.toBeChecked();
  await expect.poll(async () => (await db.select().from(notificationRules).where(eq(notificationRules.kind, "approval-waiting")))[0]?.enabled).toBe(false);
});

test("알림 규칙 권한이 없는 계급은 404", async ({ page }) => {
  const employee = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(employee.email);
  await page.getByLabel("비밀번호").fill(employee.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  const response = await page.goto("/admin/notification-rules");
  expect(response?.status()).toBe(404);
});
