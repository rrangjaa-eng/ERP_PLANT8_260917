import { expect, type Locator, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// 04.4-05 Task 2: 사람 목록 배지 · 행 머리글 · 폰 칸 접기 E2E가 함께 쓰는 도우미.
export async function loginAsAdmin(page: Page): Promise<{ email: string }> {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return { email: admin.email };
}

// 「사람 등록」 폼으로 만든다 — 발급 직후라 두 배지(첫 로그인 전 · 임시 비밀번호 사용 중)가 다 보인다.
export async function registerPerson(page: Page, name: string): Promise<string> {
  await page.goto("/admin/people");
  await page.getByRole("link", { name: "사람 등록" }).click();
  const email = `e2e-badge-${Date.now()}@example.test`;
  await page.getByLabel("이름").fill(name);
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("계급").selectOption(DEFAULT_ROLE_ID);
  await page.getByRole("button", { name: "사람 등록" }).click();
  await expect(page.getByText(`초기 비밀번호 — ${email}`)).toBeVisible();
  await page.goto("/admin/people");
  return email;
}

// 목록의 사람 행(행 머리글이 있는 행)만 — 접힌 줄은 같은 이메일을 담지만 행 머리글이 없다.
export function personRow(page: Page, email: string): Locator {
  return page.locator("tbody tr:has(th[scope='row'])").filter({ hasText: email });
}

export function collapsedRowOf(row: Locator): Locator {
  return row.locator("xpath=following-sibling::tr[1]");
}

// 상태 칸 = 행 머리글 뒤 네 번째 td(이메일 · 계급 · 현재 소속 · 상태 · 동작).
export function statusCell(row: Locator): Locator {
  return row.locator("td").nth(3);
}

// 보이는 텍스트 — 전역 .sr-only 라벨 span을 뺀 글자(.sr-only는 clip 방식이라 innerText에 섞인다).
export function visibleText(cell: Locator): Promise<string> {
  return cell.evaluate((el) => {
    const walk = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
      if (node instanceof Element && node.classList.contains("sr-only")) return "";
      return Array.from(node.childNodes).map(walk).join("");
    };
    return walk(el).replace(/\s+/g, " ").trim();
  });
}

export function noHorizontalOverflow(page: Page): Promise<{ doc: boolean; table: boolean }> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const table = document.querySelector("table");
    return {
      doc: doc.scrollWidth <= doc.clientWidth,
      table: table ? table.scrollWidth <= table.clientWidth : false,
    };
  });
}
