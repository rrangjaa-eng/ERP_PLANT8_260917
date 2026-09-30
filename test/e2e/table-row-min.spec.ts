import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createRole, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { setRoleArchived } from "@/repositories/roles";
import { setPermissionCell, setVisibilityCell } from "@/domain/permissions/matrix";
import { archivePerson, listPeople } from "@/domain/people";
import { createVendor } from "@/domain/vendors";
import { createCorpCard } from "@/domain/corp-cards";
import { createCodeItem } from "@/domain/code-tables";
import { createFixtureUser } from "./fixtures";
import { loginAsAdmin } from "./people-list-helpers";

// 04.4 후속 항목 6(DR-8): 수작업 표(ui/table 밖 표 칸)의 `min-height: var(--row-min)`은 표 칸에 적용되지 않아 주 행이
// --row-min(PC 36 · 폰 44)보다 낮아질 수 있다. 표마다 CI=true 프로덕션 빌드에서 주 행(접힌 줄 제외) 높이를 재
// 1280 · 375에서 --row-min 이상임을 고정한다. 수치는 getBoundingClientRect / getComputedStyle로만 판정한다(스크린샷 육안 금지).
// 계획 기준은 주 행 ≥ --row-min 그대로다 — 소수점 반올림 오차만 허용한다(0.5px는 실제 미달 35.69px를 가렸다).
const TOLERANCE = 0.05;
const WIDTHS = [
  { width: 1280, height: 720 },
  { width: 375, height: 800 },
] as const;

type Measure = { rowMin: number; heights: number[] };

async function measureMainRows(page: Page, caption?: string): Promise<Measure> {
  return page.evaluate((captionText) => {
    const rowMin = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--row-min"));
    const tables = Array.from(document.querySelectorAll("table")).filter(
      (table) => !captionText || table.querySelector("caption")?.textContent?.trim() === captionText,
    );
    const heights: number[] = [];
    for (const table of tables) {
      for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
        if (row.className.includes("collapsedRow")) continue;
        if (row.firstElementChild?.getAttribute("colspan")) continue;
        const height = row.getBoundingClientRect().height;
        if (height > 0) heights.push(height);
      }
    }
    return { rowMin, heights };
  }, caption ?? null);
}

// 두 폭에서 주 행 높이를 재 최저값이 --row-min − 0.05 이상인지 단언한다. 실패 메시지에 표 이름 · 폭 · 최저 행 높이가 나온다.
// 한 폭이 미달해도 다른 폭 수치를 함께 얻도록 두 폭을 다 잰 뒤에 단언한다.
async function expectRowsAtRowMin(page: Page, name: string, path: string, caption?: string): Promise<void> {
  const shortfalls: string[] = [];
  for (const viewport of WIDTHS) {
    await page.setViewportSize(viewport);
    await page.goto(path);
    const { rowMin, heights } = await measureMainRows(page, caption);
    expect(heights.length, `${name} ${viewport.width}px 주 행 수`).toBeGreaterThan(0);
    const lowest = Math.min(...heights);
    if (lowest < rowMin - TOLERANCE) shortfalls.push(`${name} ${viewport.width}px 최저 행 높이 ${lowest}px < --row-min ${rowMin}px`);
  }
  expect(shortfalls).toEqual([]);
}

async function loginFresh(browser: Browser, baseURL: string | undefined, creds: { email: string; password: string }): Promise<Page> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("이메일").fill(creds.email);
  await page.getByLabel("비밀번호").fill(creds.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return page;
}

async function personIdByEmail(email: string): Promise<string> {
  const person = (await listPeople(SYSTEM_VIEWER)).find((candidate) => candidate.email === email);
  if (!person) throw new Error(`사람을 못 찾음: ${email}`);
  return person.id;
}

test.describe("수작업 표 주 행 높이 ≥ --row-min (1280 · 375)", () => {
  test("사람 목록 — 관리자(모든 열)", async ({ page }) => {
    await loginAsAdmin(page);
    await expectRowsAtRowMin(page, "사람(관리자)", "/admin/people");
  });

  test("사람 목록 — person.value가 꺼진 계급(계급 · 현재 소속만)", async ({ browser, baseURL }) => {
    const suffix = randomUUID().slice(0, 8);
    const role = await createRole(SYSTEM_VIEWER, { name: `E2E 사람가림 ${suffix}` });
    await setPermissionCell(SYSTEM_VIEWER, { roleId: role.id, menu: "admin.people", action: "view", allowed: true });
    for (const infoItem of ["role.value", "team.value"] as const) {
      await setVisibilityCell(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
    }
    const page = await loginFresh(browser, baseURL, await createFixtureUser({ roleId: role.id, withTeam: true }));
    try {
      await expectRowsAtRowMin(page, "사람(person.value 꺼짐)", "/admin/people");
    } finally {
      await page.context().close();
      await setRoleArchived(SYSTEM_VIEWER, role.id, true);
    }
  });

  test("계급 표", async ({ page }) => {
    await loginAsAdmin(page);
    await expectRowsAtRowMin(page, "계급", "/admin/people/roles");
  });

  test("거래처 표", async ({ page }) => {
    await createVendor(SYSTEM_VIEWER, { name: `E2E 행높이 거래처 ${randomUUID().slice(0, 8)}` });
    await loginAsAdmin(page);
    await expectRowsAtRowMin(page, "거래처", "/admin/vendors");
  });

  test("법인카드 표", async ({ page }) => {
    const holder = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
    await createCorpCard(SYSTEM_VIEWER, {
      issuer: `E2E카드사-${randomUUID().slice(0, 8)}`,
      numberLast4: "1234",
      label: "행높이",
      holderUserId: await personIdByEmail(holder.email),
    });
    await loginAsAdmin(page);
    await expectRowsAtRowMin(page, "법인카드", "/admin/corp-cards");
  });

  test("코드표 항목 표", async ({ page }) => {
    await createCodeItem(SYSTEM_VIEWER, {
      tableKey: "evidence_type",
      value: `e2e-row-${randomUUID().slice(0, 8)}`,
      label: "E2E 행높이",
    });
    await loginAsAdmin(page);
    await expectRowsAtRowMin(page, "코드표", "/admin/code-tables?tableKey=evidence_type");
  });

  // 관리자 행의 이름·설명 칸에는 입력(44.5px)이 있어 칸 높이가 가려진다 — 쓰기 권한 없는 계급은 글자 행이라 min-height 무효가 드러난다.
  test("코드표 항목 표 — 보기만 하는 계급(글자 행)", async ({ browser, baseURL }) => {
    const role = await createRole(SYSTEM_VIEWER, { name: `E2E 코드표보기 ${randomUUID().slice(0, 8)}` });
    await setPermissionCell(SYSTEM_VIEWER, { roleId: role.id, menu: "admin.code-tables", action: "view", allowed: true });
    const page = await loginFresh(browser, baseURL, await createFixtureUser({ roleId: role.id }));
    try {
      await expectRowsAtRowMin(page, "코드표(보기만)", "/admin/code-tables");
    } finally {
      await page.context().close();
      await setRoleArchived(SYSTEM_VIEWER, role.id, true);
    }
  });

  test("행동 로그 표", async ({ page }) => {
    await loginAsAdmin(page);
    await expectRowsAtRowMin(page, "행동 로그", "/admin/action-log");
  });

  test("보관함 표", async ({ page }) => {
    const archived = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
    await archivePerson(SYSTEM_VIEWER, await personIdByEmail(archived.email));
    await loginAsAdmin(page);
    await expectRowsAtRowMin(page, "보관함", "/admin/archive");
  });

  test("사람 상세 「소속 발령 이력」 표(ui/history-list)", async ({ page }) => {
    const member = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID, withTeam: true });
    const memberId = await personIdByEmail(member.email);
    await loginAsAdmin(page);
    await expectRowsAtRowMin(page, "소속 발령 이력", `/admin/people/${memberId}`, "소속 발령 이력");
  });
});
