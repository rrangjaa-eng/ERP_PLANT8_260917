import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor, setVendorArchived } from "@/repositories/vendors";
import { insertCorpCard, setCorpCardArchived } from "@/repositories/corp-cards";
import { findUserByEmail } from "@/repositories/users";
import { insertOrgUnit, setOrgUnitArchived } from "@/repositories/org-units";
import { insertTeam, setTeamArchived } from "@/repositories/teams";
import { createAccount } from "@/domain/auth/accounts";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// SYSTEM.md 반응형 규칙 — 320px까지 어느 화면도 문서가 가로로 넘치지 않는다.
// 넘치면 실패 메시지에 "처음 경계를 넘는 요소"(부모는 안 넘고 자신은 넘는
// 요소)를 적어 어디를 고칠지 바로 보이게 한다. 가로 스크롤 컨테이너 안의
// 요소는 문서를 넘치게 하지 않으므로 세지 않는다.
test.use({ viewport: { width: 320, height: 640 } });

type Overflow = { scrollWidth: number; clientWidth: number; culprits: string[] };

async function measure(page: Page): Promise<Overflow> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const limit = root.clientWidth + 0.5;
    const clipped = (el: Element): boolean => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        if (getComputedStyle(a).overflowX !== "visible") return true;
      }
      return false;
    };
    const overflows = (el: Element | null): boolean => !!el && el.getBoundingClientRect().right > limit;
    const culprits: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      if (!overflows(el) || overflows(el.parentElement) || clipped(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const cls = typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/).join(".")}` : "";
      const text = (el.textContent ?? "").trim().slice(0, 30);
      culprits.push(`${el.tagName.toLowerCase()}${cls} right=${Math.round(rect.right)} w=${Math.round(rect.width)} "${text}"`);
    }
    return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, culprits };
  });
}

async function expectNoOverflow(page: Page, url: string): Promise<void> {
  const response = await page.goto(url);
  expect.soft(response?.status(), `${url} 응답`).toBe(200);
  const { scrollWidth, clientWidth, culprits } = await measure(page);
  expect.soft(scrollWidth, `${url} 가로 넘침\n  ${culprits.join("\n  ")}`).toBeLessThanOrEqual(clientWidth);
}

async function login(page: Page, roleId: string): Promise<void> {
  const user = await createFixtureUser({ roleId });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

const ADMIN_SCREENS = [
  "/",
  "/account",
  "/settings",
  "/approvals",
  "/cards",
  "/expenses",
  "/pnl",
  "/projects",
  "/admin",
  "/admin/action-log",
  "/admin/archive",
  "/admin/code-tables",
  "/admin/code-tables?new=1",
  "/admin/corp-cards",
  "/admin/corp-cards?new=1",
  "/admin/people",
  "/admin/people?new=1",
  "/admin/people/org",
  "/admin/people/roles",
  "/admin/permissions",
  "/admin/settings",
  "/admin/system-status",
  "/admin/vendors",
  "/admin/vendors?new=1",
  "/admin/visibility",
];

test.describe("폭 320 — 어느 화면도 가로로 넘치지 않는다", () => {
  test("로그인 화면", async ({ page }) => {
    await expectNoOverflow(page, "/login");
  });

  test("시스템 관리자가 여는 화면 전부", async ({ page }) => {
    // 빈 목록은 넘치지 않는다 — 행이 가장 넓어지는 데이터(계좌번호 있는
    // 거래처의 「번호 보기」, 긴 이름)를 넣고 재고, 끝나면 보관해 목록에서
    // 치운다(다른 폰 스펙이 같은 목록 폭을 잰다). 보관한 행으로 보관함도
    // 행이 있는 상태에서 잰다. 필터 select는 가장 긴 선택지 폭만큼 넓어지므로
    // 긴 팀 이름(프로젝트 「팀」 필터)과 긴 사람 이름(행동 로그 「사람」 필터)도 넣는다.
    const stamp = Date.now();
    const orgUnit = await insertOrgUnit(SYSTEM_VIEWER, { name: `E2E320브랜드익스피리언스마케팅본부${stamp}` });
    const team = await insertTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `통합캠페인운영및디지털콘텐츠제작팀${stamp}` });
    await createAccount(SYSTEM_VIEWER, {
      email: `e2e-320-${stamp}@example.test`,
      name: `알렉산드라크리스티나반데르사르${stamp}`,
      roleId: DEFAULT_ROLE_ID,
    });
    const vendor = await insertVendor(SYSTEM_VIEWER, {
      name: `E2E320거래처-아주긴이름의주식회사플랜트에이트-${Date.now()}`,
      normalizedName: `e2e320거래처-${Date.now()}`,
      businessNo: "123-45-67890",
      accountBank: "국민은행",
      accountHolder: "홍길동",
      accountNumberEncrypted: "e2e-320-placeholder",
      accountNumberLast4: "4455",
    });
    const holder = await findUserByEmail(SYSTEM_VIEWER, (await createFixtureUser({ roleId: DEFAULT_ROLE_ID })).email);
    const card = await insertCorpCard(SYSTEM_VIEWER, {
      issuer: "신한카드",
      numberLast4: "1234",
      label: `E2E320카드-${Date.now()}`,
      kind: "personal",
      holderUserId: holder!.id,
    });
    try {
      await login(page, SYSADMIN_ROLE_ID);
      for (const url of ADMIN_SCREENS) await expectNoOverflow(page, url);
    } finally {
      await setVendorArchived(SYSTEM_VIEWER, vendor.id, true);
      await setCorpCardArchived(SYSTEM_VIEWER, card.id, true);
      await setTeamArchived(SYSTEM_VIEWER, team.id, true);
      await setOrgUnitArchived(SYSTEM_VIEWER, orgUnit.id, true);
    }
    await expectNoOverflow(page, "/admin/archive");

    await page.goto("/admin/people");
    const href = await page
      .locator("a[href^='/admin/people/']")
      .evaluateAll((links) =>
        links.map((a) => a.getAttribute("href") ?? "").find((h) => /^\/admin\/people\/(?!org$|roles$)[^/?]+$/.test(h)),
      );
    expect(href, "사람 상세 링크").toBeTruthy();
    await expectNoOverflow(page, href!);
  });

  test("PM이 여는 프로젝트 등록·상세(견적 줄 포함)", async ({ page }) => {
    const vendor = await insertVendor(SYSTEM_VIEWER, {
      name: `E2E320클라이언트-${Date.now()}`,
      normalizedName: `e2e320클라이언트-${Date.now()}`,
    });
    await login(page, DEFAULT_ROLE_ID);
    await expectNoOverflow(page, "/projects?new=1");

    await page.getByLabel("클라이언트").selectOption({ label: vendor.name });
    await page.getByLabel("팀").selectOption({ index: 1 });
    await page.getByLabel("담당 PM").selectOption({ index: 1 });
    await page.getByLabel("프로젝트명").fill(`E2E320프로젝트-${Date.now()}`);
    await page.getByRole("button", { name: "프로젝트 등록" }).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    const detailUrl = new URL(page.url()).pathname;
    await expectNoOverflow(page, detailUrl);

    await page.getByRole("button", { name: /첫 줄 만들기/ }).click();
    await expect(page.locator("tbody tr").nth(1)).toBeVisible();
    const { scrollWidth, clientWidth, culprits } = await measure(page);
    expect.soft(scrollWidth, `${detailUrl} 견적 줄 1개 가로 넘침\n  ${culprits.join("\n  ")}`).toBeLessThanOrEqual(clientWidth);
  });
});
