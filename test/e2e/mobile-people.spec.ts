import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { createAccount } from "@/domain/auth/accounts";
import { createOrgUnit } from "@/domain/org";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import {
  collapsedRowOf,
  loginAsAdmin,
  noHorizontalOverflow,
  personRow,
  registerPerson,
  statusCell,
  visibleText,
} from "./people-list-helpers";

// defect 4(wave 5 DOM 감사, 375px): 사람 목록의 「상세」 링크가 13×42로
// §3 터치 목표(44×44) 미만이었다. people.module.css에 폰 전용 .detailLink를
// 추가해 히트 영역만 44×44로 키웠다(PC는 그대로, 글자 크기·문구 불변).

async function loginAs(page: Page): Promise<void> {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe("폰 375 /admin/people 「상세」 링크 터치 목표 (defect 4)", () => {
  test("「상세」 링크의 터치 목표가 44×44 이상이다", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people");

    // 2026-09-21 스테이징 QA 수정: 등록 폼이 기본 진입에는 없다(§6-1) —
    // 목록 머리글의 「사람 등록」이 그 폼을 연다.
    await page.getByRole("link", { name: "사람 등록" }).click();

    const newEmail = `e2e-mobile-detail-${Date.now()}@example.test`;
    await page.getByLabel("이름").fill("폰상세대상");
    await page.getByLabel("이메일").fill(newEmail);
    await page.getByLabel("계급").selectOption(DEFAULT_ROLE_ID);
    await page.getByLabel("입사일").fill("2026-01-01");
    await page.getByRole("button", { name: "사람 등록" }).click();
    await expect(page.getByText(`초기 비밀번호 — ${newEmail}`)).toBeVisible();

    await page.goto("/admin/people");
    const detailLink = page.getByRole("link", { name: "상세" }).first();
    const box = await detailLink.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe("폰 375 사람 상세 발령 이력 섹션 제목 (/design-review 발견 2)", () => {
  // SYSTEM.md §7-14 이력 목록은 §6-3 폼 화면의 한 섹션(2px 선으로 시작)에
  // 열린다 — /admin/settings의 §7-14 이력 섹션과 같은 패턴.
  test("발령 이력 표 위에 「소속 발령 이력」 제목이 보인다", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people");

    await page.getByRole("link", { name: "상세" }).first().click();
    await expect(page).toHaveURL(/\/admin\/people\/.+/);

    await expect(page.getByRole("heading", { name: "소속 발령 이력", level: 2 })).toBeVisible();
  });
});

// 04.4-05 Task 2(D8-07 · UI-SPEC Responsive · 접근성 관계 ①~④ · 검증 조건 둘): 폰 칸 접기.
// P1 = 이름 · 상태 · 동작, P2 = 이메일 · 계급 · 현재 소속(각 행 아래 접힌 줄 하나).
const LONG_NAME = "ABCDEFGHIJKLMNOPQRSTUVWXYZABCD"; // 공백 없는 영문 30자

async function expectTouchTarget(page: Page, target: Locator): Promise<void> {
  const box = await target.boundingBox();
  const width = page.viewportSize()!.width;
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width);
}

test.describe("폰 사람 목록 로그인 배지 · 칸 접기 (04.4-05, D8-07)", () => {
  test("375: 두 배지가 세로로 쌓이고 P2 칸은 접힌 줄 하나로 모인다", async ({ page }) => {
    await loginAsAdmin(page);
    const email = await registerPerson(page, "폰배지대상");
    // 07-17 U6: 목록이 검색(`?q=`)으로 열려 대상이 표의 마지막 줄이 되면 마지막 행 선 없음 규칙이 아래 선 단언을 덮는다 — 이름순으로
    // 뒤에 서는 사람을 하나 더 두고 공통 이름으로 찾아 대상이 마지막 줄이 아니게 한다.
    await createAccount(SYSTEM_VIEWER, { email: `e2e-${randomUUID()}@example.test`, name: "폰배지대상-뒤", roleId: DEFAULT_ROLE_ID });
    await page.goto(`/admin/people?q=${encodeURIComponent("폰배지대상")}`);
    const row = personRow(page, email);
    const status = statusCell(row);

    const first = await status.getByText("첫 로그인 전", { exact: true }).boundingBox();
    const second = await status.getByText("임시 비밀번호 사용 중", { exact: true }).boundingBox();
    expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height - 1);
    const separatorsShown = await status.evaluate((el) =>
      Array.from(el.querySelectorAll("span"))
        .filter((span) => span.textContent?.trim() === "·")
        .map((span) => getComputedStyle(span).display),
    );
    expect(separatorsShown).toEqual(["none"]);

    for (const name of ["이메일", "계급", "현재 소속"]) {
      await expect(page.getByRole("columnheader", { name, exact: true })).toBeHidden();
    }
    for (const index of [0, 1, 2]) {
      await expect(row.locator("td").nth(index)).toBeHidden();
    }
    const collapsed = collapsedRowOf(row);
    await expect(collapsed).toBeVisible();
    expect(await visibleText(collapsed.locator("td"))).toBe(`${email} · 기획 PM · —`);

    // §7-3: 접힌 줄은 자기 행에 붙는다 — 선은 주 행 아래가 아니라 접힌 줄 아래에 긋는다.
    const mainBorders = await row.evaluate((tr) =>
      Array.from(tr.children)
        .filter((cell) => getComputedStyle(cell).display !== "none")
        .map((cell) => getComputedStyle(cell).borderBottomWidth),
    );
    expect(mainBorders.length).toBeGreaterThan(0);
    expect(new Set(mainBorders)).toEqual(new Set(["0px"]));
    const lineWidth = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--line-w").trim(),
    );
    expect(await collapsed.locator("td").evaluate((td) => getComputedStyle(td).borderBottomWidth)).toBe(lineWidth);
  });

  test.describe("360", () => {
    test.use({ viewport: { width: 360, height: 800 } });

    test("긴 이름 행도 넘치지 않고 행 머리글 · headers · 숨은 라벨 · 터치 목표가 맞다", async ({ page }) => {
      await loginAsAdmin(page);
      const email = await registerPerson(page, LONG_NAME);
      const row = personRow(page, email);
      const rowHeader = row.locator("th[scope='row']");

      expect(await noHorizontalOverflow(page)).toEqual({ doc: true, table: true });
      const header = await rowHeader.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { fits: el.scrollWidth <= el.clientWidth, whiteSpace: cs.whiteSpace, fontWeight: cs.fontWeight };
      });
      expect(header).toEqual({ fits: true, whiteSpace: expect.not.stringMatching(/^nowrap$/), fontWeight: "400" });

      const collapsedCell = collapsedRowOf(row).locator("td");
      const id = await rowHeader.getAttribute("id");
      expect(id).toBeTruthy();
      expect(await collapsedCell.getAttribute("headers")).toBe(id);
      expect(await page.locator(`[id="${id}"]`).count()).toBe(1);
      expect(await collapsedCell.evaluate((el) => el.closest("[aria-hidden]") === null)).toBe(true);

      const snapshot = await collapsedRowOf(row).ariaSnapshot();
      for (const label of ["이메일", "계급", "현재 소속"]) expect(snapshot).toContain(label);

      await expectTouchTarget(page, row.getByRole("link", { name: "상세" }));
      await expectTouchTarget(page, row.getByRole("button", { name: "삭제" }));
    });
  });

  test.describe("640 · 200% 확대(1280px)", () => {
    test.use({ viewport: { width: 640, height: 800 }, deviceScaleFactor: 2 });

    test("긴 이름 행에서도 넘치지 않고 접힌 줄이 보인다", async ({ page }) => {
      await loginAsAdmin(page);
      const email = await registerPerson(page, LONG_NAME);
      const row = personRow(page, email);

      expect(await noHorizontalOverflow(page)).toEqual({ doc: true, table: true });
      await expect(collapsedRowOf(row)).toBeVisible();
      await expect(row.locator("td").first()).toBeHidden();
      await expectTouchTarget(page, row.getByRole("link", { name: "상세" }));
      await expectTouchTarget(page, row.getByRole("button", { name: "삭제" }));
    });
  });
});

// 07.1-14(D-7127): 본부 칸 — 폰 375 · 320에서 새로 만들기 · 상세 둘 다 가로 넘침 0 · 입력 높이 40 · 라벨-칸 간격은 옆 칸(팀 · 계급 변경)과 같다.
test.describe("폰 375 · 320 본부 칸 (07.1-14 D-7127)", () => {
  async function labelGap(page: Page, id: string): Promise<{ height: number; gap: number }> {
    return page.evaluate((fieldId) => {
      const control = document.getElementById(fieldId)!;
      const label = document.querySelector(`label[for="${fieldId}"]`)!;
      const controlBox = control.getBoundingClientRect();
      return { height: controlBox.height, gap: controlBox.top - label.getBoundingClientRect().bottom };
    }, id);
  }

  for (const width of [375, 320]) {
    test(`${width}: 새로 만들기 · 상세의 본부 칸 — 넘침 0 · 높이 40 · 라벨 간격이 옆 칸과 같다`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await loginAs(page);
      await createOrgUnit(SYSTEM_VIEWER, { name: `폰본부칸-${randomUUID().slice(0, 8)}` });

      await page.goto("/admin/people?new=1");
      await expect(page.locator("#divisionId")).toBeVisible();
      expect((await noHorizontalOverflow(page)).doc).toBe(true);
      const created = await labelGap(page, "divisionId");
      const team = await labelGap(page, "teamId");
      expect(created.height).toBe(40);
      expect(created.gap).toBe(team.gap);

      const { userId } = await createAccount(SYSTEM_VIEWER, { email: `e2e-mobile-division-${randomUUID()}@example.test`, name: "폰본부칸", roleId: DEFAULT_ROLE_ID });
      await page.goto(`/admin/people/${userId}`);
      await expect(page.locator("#person-division")).toBeVisible();
      expect((await noHorizontalOverflow(page)).doc).toBe(true);
      const detail = await labelGap(page, "person-division");
      const role = await labelGap(page, "person-role-change");
      expect(detail.height).toBe(40);
      expect(detail.gap).toBe(role.gap);
    });
  }
});
