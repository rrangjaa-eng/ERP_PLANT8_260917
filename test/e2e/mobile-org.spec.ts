import { test, expect, type Locator, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { makeWorstCaseDuplicates } from "./admin-cap-fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// defect 3(wave 5 DOM 감사, 375px): /admin/people/org의 scrollWidth(399)가
// clientWidth(375)를 넘었다 — 원인은 people.module.css의 .select(본부·팀
// 이름 인라인 입력이 쓰는 클래스)에 width가 없어 <select>와 달리 <td>/<li>
// 안에서 브라우저 기본 입력 폭(~170px+)을 그대로 쓴 것(측정으로 확인).
// width: 100%를 넣어 해결했다 — 이 스펙은 375px 실제 렌더에서 문서 가로
// 스크롤 폭이 뷰포트를 넘지 않는지를 잰다. 파일명 접두어 "mobile-"이
// mobile-375 프로젝트에서만 돌게 한다(playwright.config.ts).

async function loginAs(page: Page): Promise<void> {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe("폰 375 /admin/people/org 가로 스크롤 금지 (defect 3)", () => {
  test("문서 가로 스크롤 폭이 뷰포트 폭을 넘지 않는다", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people/org");

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("본부·팀 이름 변경 입력이 컨테이너 폭을 넘지 않는다(width: 100%)", async ({ page }) => {
    await loginAs(page);
    await page.goto("/admin/people/org");

    const inputs = page.locator("li input");
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    for (let i = 0; i < count; i += 1) {
      const box = await inputs.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x + box!.width).toBeLessThanOrEqual(clientWidth);
    }
  });
});

// 06.4-04 DOM 감사 ①(PLAN :345): 팀장 · 책임자 중복 줄은 4폭 모두 이름 입력 1줄 + 행동 1줄 = 2줄 이하.
// 감사 실측 — 최악 본부 줄(본부 20자 · 책임자 둘 6자)이 320 · 375에서 li 228(3줄 이상), 중복 팀 줄(14자)이 폰에서 3줄(li 144).
// 줄 수는 그 줄 자신의 보이는 끝 요소(자식 없는 요소 + 이름 입력, 안쪽 팀 목록 제외) 상자를 위에서부터 묶어 센다.
function rowOf(page: Page, name: string): Locator {
  return page.getByLabel(`${name} 이름`, { exact: true }).locator("xpath=..");
}

async function lineCount(row: Locator): Promise<number> {
  return row.evaluate((li) => {
    const boxes = [...li.querySelectorAll("*")]
      .filter((element) => element.closest("li") === li && (element.tagName === "INPUT" || element.children.length === 0))
      // 접힌 details 안은 상자가 남아도(content-visibility) 보이지 않는다 — checkVisibility가 둘 다 거른다.
      .filter((element) => element.checkVisibility({ visibilityProperty: true }))
      .map((element) => element.getBoundingClientRect())
      .filter((box) => box.width > 1 && box.height > 1)
      .sort((a, b) => a.top - b.top);
    let lines = 0;
    let bottom = -Infinity;
    for (const box of boxes) {
      if (box.top >= bottom - 2) {
        lines += 1;
        bottom = box.bottom;
      } else bottom = Math.max(bottom, box.bottom);
    }
    return lines;
  });
}

async function ownHeight(row: Locator): Promise<number> {
  return row.evaluate((li) => {
    const top = li.getBoundingClientRect().top;
    const nested = li.querySelector(":scope > ul");
    const end = nested && nested.children.length > 0 ? nested.getBoundingClientRect().top : li.getBoundingClientRect().bottom;
    return Math.round((end - top) * 10) / 10;
  });
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

async function expectTouchTargets(row: Locator, name: string): Promise<void> {
  const targets = row.locator(":scope a:visible, :scope button:visible, :scope summary:visible");
  for (let i = 0; i < (await targets.count()); i += 1) {
    const box = await targets.nth(i).boundingBox();
    if (!box) throw new Error(`${name} 행동 상자를 잴 수 없다`);
    expect(box.height, `${name} 행동 ${i} 높이`).toBeGreaterThanOrEqual(44);
    expect(box.width, `${name} 행동 ${i} 폭`).toBeGreaterThanOrEqual(44);
  }
}

// SYSTEM §7-19 줄 안 「더보기」(DECISIONS 2026-10-13): 폰(<700) 중복 줄은 태그 + 「더보기」 한 줄, 보유자 · 「팀 추가」 · 「삭제」는 펼침 안.
// 그 줄 자신의 「더보기」만 — 본부 줄 안쪽 팀 목록의 「더보기」는 제외한다.
function moreOf(row: Locator): Locator {
  return row.locator(":scope > div > details > summary");
}

test.describe("조직 화면 중복 줄 2줄 이하 (06.4-04 DOM 감사 ①)", () => {
  for (const width of [375, 320, 768, 1280]) {
    test(`${width} — 최악 본부 줄 · 중복 팀 줄이 2줄 이하이고 태그 · 보유자 · 「팀 추가」 · 「삭제」에 닿는다`, async ({ page }) => {
      const phone = width < 700;
      const world = await makeWorstCaseDuplicates();
      await page.setViewportSize({ width, height: 900 });
      await loginAs(page);
      await page.goto("/admin/people/org");

      const rows = [
        { name: world.orgUnitName, tag: "책임자 2명", labels: ["책임자가나다", "책임자라마바", "팀 추가", "삭제"] },
        { name: world.teamName, tag: "팀장 2명", labels: ["팀장가나다라", "팀장마바사아", "삭제"] },
      ] as const;

      // 접힌 상태 — 이름 입력 1줄 + 행동 1줄.
      for (const { name, tag } of rows) {
        const row = rowOf(page, name);
        await expect(row.getByText(tag, { exact: true }).locator("visible=true")).toHaveCount(1);
        const lines = await lineCount(row);
        expect(lines, `${width} ${name} 줄 수(높이 ${await ownHeight(row)})`).toBeLessThanOrEqual(2);
        if (phone) {
          await expect(moreOf(row)).toBeVisible();
          await expect(moreOf(row)).toHaveAccessibleName(`${name} 더보기`);
          await expectTouchTargets(row, name);
        } else {
          await expect(moreOf(row)).toBeHidden();
        }
      }
      await expectNoHorizontalScroll(page);

      // 닿음 — 폰은 그 줄의 「더보기」를 키보드로 펼치면(Enter) 다음 Tab이 첫 보유자 이름이다. PC · 태블릿은 줄에 바로 있다.
      for (const { name, labels } of rows) {
        const row = rowOf(page, name);
        if (phone) {
          await moreOf(row).focus();
          await page.keyboard.press("Enter");
          await expect(row.locator(":scope > div > details")).toHaveAttribute("open", "");
          await page.keyboard.press("Tab");
          await expect(row.getByRole("link", { name: labels[0], exact: true })).toBeFocused();
        }
        for (const label of labels) {
          await expect(row.getByRole(label === "삭제" ? "button" : "link", { name: label, exact: true }).first()).toBeVisible();
        }
        if (phone) await expectTouchTargets(row, name);
      }
      await expectNoHorizontalScroll(page);
      const holder = rowOf(page, world.teamName).getByRole("link", { name: "팀장가나다라", exact: true });
      await expect(holder).toHaveAttribute("href", /^\/admin\/people\/[0-9a-zA-Z-]+$/);
    });
  }
});
