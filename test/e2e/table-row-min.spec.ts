import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createRole, DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { setPermissionCell, setVisibilityCell } from "@/domain/permissions/matrix";
import { archivePerson, listPeople } from "@/domain/people";
import { createVendor } from "@/domain/vendors";
import { createCorpCard } from "@/domain/corp-cards";
import { createCodeItem } from "@/domain/code-tables";
import { archive } from "@/domain/archive";
import { createFixtureUser } from "./fixtures";
import { loginAsAdmin } from "./people-list-helpers";

// 04.4 후속 항목 6(DR-8): 수작업 표의 주 행(접힌 줄 제외) 높이가 --row-min 이상이다(PC 1280 = 36 · 폰 375 = 44).
// 표 칸에는 min-height가 적용되지 않는다 — 실측으로 미달이 재현된 표만 CSS(height: var(--row-min))를 고친다.
const WIDTHS = [
  { width: 1280, height: 720 },
  { width: 375, height: 800 },
] as const;

async function userIdOf(email: string): Promise<string> {
  const person = (await listPeople(SYSTEM_VIEWER)).find((candidate) => candidate.email === email);
  if (!person) throw new Error(`사람을 찾을 수 없다: ${email}`);
  return person.id;
}

async function loginAs(page: Page, creds: { email: string; password: string }): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(creds.email);
  await page.getByLabel("비밀번호").fill(creds.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

// 주 행 = tbody의 tr 중 접힌 줄이 아니고 높이가 있는 것. --row-min은 그 폭에서 계산된 값이다.
function measure(table: Locator): Promise<{ rowMin: number; heights: number[] }> {
  return table.evaluate((element) => {
    const rowMin = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--row-min"));
    const heights = Array.from(element.querySelectorAll("tbody tr"))
      .filter((row) => !Array.from(row.classList).some((name) => name.includes("collapsedRow")))
      .map((row) => row.getBoundingClientRect().height)
      .filter((value) => value > 0);
    return { rowMin, heights };
  });
}

async function expectRowsAtLeastRowMin(page: Page, name: string, table: Locator): Promise<void> {
  for (const viewport of WIDTHS) {
    await page.setViewportSize(viewport);
    await expect(table).toBeVisible();
    const { rowMin, heights } = await measure(table);
    expect(heights.length, `${name} @${viewport.width}: 주 행이 없다`).toBeGreaterThan(0);
    const lowest = Math.min(...heights);
    expect.soft(lowest, `${name} @${viewport.width}: 가장 낮은 주 행 ${lowest}px < --row-min ${rowMin}px`).toBeGreaterThanOrEqual(rowMin - 0.5);
  }
}

test.describe("수작업 표 주 행 높이 ≥ --row-min (04.4 후속 항목 6)", () => {
  let personId = "";

  test.beforeAll(async () => {
    const holder = await createFixtureUser({ roleId: DEFAULT_ROLE_ID, withTeam: true });
    personId = await userIdOf(holder.email);
    await createVendor(SYSTEM_VIEWER, { name: `행높이거래처-${randomUUID().slice(0, 8)}` });
    await createCorpCard(SYSTEM_VIEWER, {
      issuer: `행높이카드사-${randomUUID().slice(0, 8)}`,
      numberLast4: String(1000 + Math.floor(Math.random() * 9000)),
      label: `행높이카드-${randomUUID().slice(0, 8)}`,
      holderUserId: personId,
    });
    await createCodeItem(SYSTEM_VIEWER, {
      tableKey: "project_status",
      value: `row-min-${randomUUID().slice(0, 8)}`,
      label: "행높이코드",
    });
    // 보관된 코드 항목은 입력 칸이 없어 행이 가장 낮다 — 다른 스펙의 보관 · 복원 순서에 기대지 않게 직접 만든다.
    const archivedCode = await createCodeItem(SYSTEM_VIEWER, {
      tableKey: "project_status",
      value: `row-min-archived-${randomUUID().slice(0, 8)}`,
      label: "행높이보관코드",
    });
    await archive(SYSTEM_VIEWER, "code_items", archivedCode.id);
    const archived = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    await archivePerson(SYSTEM_VIEWER, await userIdOf(archived.email));
  });

  test("사람 목록(관리자)", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/people");
    await expectRowsAtLeastRowMin(page, "사람(관리자)", page.getByRole("table", { name: "사람" }));
  });

  test("사람 목록(person.value 꺼짐 · 계급 · 팀 켜짐 · 보기 권한 계급)", async ({ page }) => {
    const role = await createRole(SYSTEM_VIEWER, { name: `E2E 행높이 ${randomUUID().slice(0, 8)}` });
    await setPermissionCell(SYSTEM_VIEWER, { roleId: role.id, menu: "admin.people", action: "view", allowed: true });
    await setVisibilityCell(SYSTEM_VIEWER, { roleId: role.id, infoItem: "role.value", visible: true });
    await setVisibilityCell(SYSTEM_VIEWER, { roleId: role.id, infoItem: "team.value", visible: true });
    await loginAs(page, await createFixtureUser({ roleId: role.id }));
    await page.goto("/admin/people");
    await expectRowsAtLeastRowMin(page, "사람(가림)", page.getByRole("table", { name: "사람" }));
  });

  test("계급 표", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/people/roles");
    await expectRowsAtLeastRowMin(page, "계급", page.getByRole("table", { name: "계급" }));
  });

  test("거래처 표", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/vendors");
    await expectRowsAtLeastRowMin(page, "거래처", page.getByRole("table", { name: "거래처" }));
  });

  test("법인카드 표", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/corp-cards");
    await expectRowsAtLeastRowMin(page, "법인카드", page.getByRole("table", { name: "법인카드" }));
  });

  test("코드표", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/code-tables");
    await expectRowsAtLeastRowMin(page, "코드표", page.getByRole("table", { name: /^코드표/ }));
  });

  test("행동 로그 표", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/action-log");
    await expectRowsAtLeastRowMin(page, "행동 로그", page.getByRole("table", { name: "행동 로그" }));
  });

  test("보관함 표", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/archive");
    await expectRowsAtLeastRowMin(page, "보관함", page.getByRole("table", { name: "보관함" }));
  });

  test("사람 상세 「소속 발령 이력」 표(ui/history-list)", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`/admin/people/${personId}`);
    await expectRowsAtLeastRowMin(page, "소속 발령 이력", page.getByRole("table", { name: "소속 발령 이력" }));
  });
});
