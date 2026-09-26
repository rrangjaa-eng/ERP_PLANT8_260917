import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor, setVendorArchived, setVendorHidden } from "@/repositories/vendors";
import { insertCorpCard, setCorpCardArchived } from "@/repositories/corp-cards";
import { findUserByEmail, setUserArchived } from "@/repositories/users";
import { insertOrgUnit, renameOrgUnit, setOrgUnitArchived } from "@/repositories/org-units";
import { insertTeam, renameTeam, setTeamArchived } from "@/repositories/teams";
import { createAccount } from "@/domain/auth/accounts";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// SYSTEM.md 반응형 규칙 — 320px까지 어느 화면도 문서가 가로로 넘치지 않는다.
// 넘치면 실패 메시지에 "처음 경계를 넘는 요소"(부모는 안 넘고 자신은 넘는
// 요소)를 적어 어디를 고칠지 바로 보이게 한다. 폰 폭(<700)에서는 넘침을
// 가로 스크롤 상자로 가리는 것도 실패다(§7-3 가로 스크롤 금지). 700 이상에서는
// 권한표의 PC 가로 스크롤(§7-13)이 허용이라 문서 넘침만 잰다.
test.use({ viewport: { width: 320, height: 640 } });

type Overflow = { scrollWidth: number; clientWidth: number; culprits: string[]; scrollers: string[] };

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
    const scrollers =
      window.matchMedia("(max-width: 699.98px)").matches
        ? Array.from(document.body.querySelectorAll("*"))
            .filter((el) => ["auto", "scroll"].includes(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth + 1)
            .map((el) => `${el.tagName.toLowerCase()}.${typeof el.className === "string" ? el.className : ""} ${el.scrollWidth}>${el.clientWidth}`)
        : [];
    return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, culprits, scrollers };
  });
}

function expectMeasured(label: string, { scrollWidth, clientWidth, culprits, scrollers }: Overflow): void {
  expect.soft(scrollWidth, `${label} 가로 넘침\n  ${culprits.join("\n  ")}`).toBeLessThanOrEqual(clientWidth);
  expect.soft(scrollers, `${label} 가로 스크롤 상자`).toEqual([]);
}

// §7-3 — 폰의 접힌 줄은 자기 행에 붙는다: 주 행 아래에는 선이 없고 접힌 줄 아래에 선이 있다.
async function expectFoldAttached(page: Page, rowText: string): Promise<void> {
  const mainRow = page.locator("tr", { hasText: rowText });
  const fold = mainRow.locator("xpath=following-sibling::tr[1]");
  await expect(fold).toBeVisible();
  const mainBorder = await mainRow.locator("td").first().evaluate((td) => getComputedStyle(td).borderBottomWidth);
  const foldBorder = await fold.locator("td").first().evaluate((td) => getComputedStyle(td).borderBottomWidth);
  expect.soft(mainBorder, `${rowText} 주 행 아래 선`).toBe("0px");
  expect.soft(foldBorder, `${rowText} 접힌 줄 아래 선`).not.toBe("0px");
}

async function expectNoOverflow(page: Page, url: string): Promise<void> {
  const response = await page.goto(url);
  expect.soft(response?.status(), `${url} 응답`).toBe(200);
  // 리다이렉트로 다른 화면을 재지 않는다.
  expect.soft(new URL(page.url()).pathname, `${url} 도착`).toBe(new URL(url, page.url()).pathname);
  // loading.tsx(Suspense) 경계는 goto가 끝나도 본문이 숨은 스트리밍 조각
  // (<div hidden id="S:0">)에 남아 있을 수 있다 — 드러난 뒤에 잰다.
  await page.waitForFunction(() => !document.querySelector("div[hidden][id^='S:']"));
  expectMeasured(`${page.viewportSize()?.width}px ${url}`, await measure(page));
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
    // 거래처의 「번호 보기」, 긴 이름)를 넣고 잰다. 필터 select는 가장 긴
    // 선택지 폭만큼 넓어지므로 긴 팀 이름(프로젝트 「팀」 필터)과 긴 사람
    // 이름(행동 로그 「사람」 필터)도 넣는다. 다른 폰 스펙이 같은 목록 폭을
    // 재므로 끝나면 긴 값을 목록에서 치운다 — 시스템 관리자는 보관된 행도
    // 보므로 보관만으로는 안 된다(거래처는 숨기고, 조직은 짧은 이름으로 바꾼다).
    // 긴 이름 계정은 이름을 바꿀 저장소 함수가 없어 보관만 한다 — 사람 목록·
    // 행동 로그 필터·보관함에 남지만, 320에서 넘치지 않음을 이 스펙이 잰다.
    // 보관함은 보관 거래처·카드·계정이 있는 상태에서 잰다.
    const stamp = Date.now();
    const orgUnit = await insertOrgUnit(SYSTEM_VIEWER, { name: `E2E320브랜드익스피리언스마케팅본부${stamp}` });
    const team = await insertTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `통합캠페인운영및디지털콘텐츠제작팀${stamp}` });
    const { userId: longNamedUserId } = await createAccount(SYSTEM_VIEWER, {
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
    const archivedVendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E320보관-${stamp}`, normalizedName: `e2e320보관-${stamp}` });
    await setVendorArchived(SYSTEM_VIEWER, archivedVendor.id, true);
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

      // §7-3 — 폰에서 숨은 P2 값은 행 아래 접힌 줄에 남는다(넘침만 막고 정보를 잃지 않는다).
      await expectNoOverflow(page, "/admin/vendors");
      const vendorRow = page.locator("tr", { hasText: vendor.name });
      await expect(vendorRow.locator("xpath=following-sibling::tr[1]")).toContainText("123-45-67890");
      await expect(page.getByRole("columnheader", { name: "사업자 번호" })).toBeHidden();
      await expectFoldAttached(page, vendor.name);

      // 번호 보기가 실패하면 칸 안에 오류 한 줄이 뜬다 — 그 줄도 넘치지 않는다
      // (자리 표시 암호문이라 복호화가 실패한다).
      await vendorRow.getByRole("button", { name: "번호 보기" }).click();
      await expect(vendorRow.getByText("번호를 불러오지 못했습니다 · 다시 시도")).toBeVisible();
      expectMeasured("번호 보기 실패", await measure(page));

      // 폰 칸 접기가 풀리는 가장 좁은 태블릿 폭(700)에서도 같은 화면이 넘치지 않는다.
      await page.setViewportSize({ width: 700, height: 900 });
      for (const url of ADMIN_SCREENS) await expectNoOverflow(page, url);
      await page.setViewportSize({ width: 320, height: 640 });
    } finally {
      await setVendorHidden(SYSTEM_VIEWER, vendor.id, true);
      await setCorpCardArchived(SYSTEM_VIEWER, card.id, true);
      await setUserArchived(SYSTEM_VIEWER, longNamedUserId, true);
      await renameTeam(SYSTEM_VIEWER, team.id, `E2E320팀-${stamp}`);
      await setTeamArchived(SYSTEM_VIEWER, team.id, true);
      await renameOrgUnit(SYSTEM_VIEWER, orgUnit.id, `E2E320본부-${stamp}`);
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
    const projectName = `E2E320프로젝트-${Date.now()}`;
    try {
      await login(page, DEFAULT_ROLE_ID);
      await expectNoOverflow(page, "/projects?new=1");

      await page.getByLabel("클라이언트").selectOption({ label: vendor.name });
      await page.getByLabel("팀").selectOption({ index: 1 });
      await page.getByLabel("담당 PM").selectOption({ index: 1 });
      await page.getByLabel("프로젝트명").fill(projectName);
      await page.getByRole("button", { name: "프로젝트 등록" }).click();
      await expect(page).toHaveURL(/\/projects\/.+/);
      const detailUrl = new URL(page.url()).pathname;
      await expectNoOverflow(page, detailUrl);

      // 폰에서는 셀 편집이 없어(§7-3) 「첫 줄 만들기」가 PC 폭에만 있다 — PC 폭에서
      // 줄을 만들고 320으로 돌아와 견적 줄이 있는 상태를 잰다.
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.getByRole("button", { name: /첫 줄 만들기/ }).click();
      await page.setViewportSize({ width: 320, height: 640 });
      await expect(page.locator("tbody tr").nth(1)).toBeVisible();
      expectMeasured(`${detailUrl} 견적 줄 1개`, await measure(page));

      // 공용 ui/table(프로젝트 목록)의 접힌 줄도 같은 선 규칙을 따른다.
      await expectNoOverflow(page, "/projects");
      // 목록은 50건씩이라 다른 스펙이 만든 프로젝트에 밀려 첫 쪽에 없을 수 있다 — 이름으로 좁혀서 본다.
      await expectNoOverflow(page, `/projects?q=${encodeURIComponent(projectName)}`);
      await expectFoldAttached(page, projectName);
    } finally {
      await setVendorArchived(SYSTEM_VIEWER, vendor.id, true);
    }
  });
});
