import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// 02-08 갭 클로저 — 페이지 층(body 아홉 선언 · §4-4 브라우저 표면 · 컨트롤 서체 ·
// FormAlert · KvList · PageHeader · WR-01 aria-current)의 계산값을 고정한다.
// 데스크톱 프로젝트 전용(파일명이 "mobile-"로 시작하지 않는다, playwright.config.ts).
//
// 행간·자간은 parseFloat 뒤 toBeCloseTo로 비교한다 — 브라우저마다 부동소수 표기가
// 다를 수 있다(예: "22.4px" vs "22.3999px").
function px(value: string): number {
  return Number.parseFloat(value);
}

async function loginAs(page: Page, roleId: string): Promise<{ email: string; password: string }> {
  const user = await createFixtureUser({ roleId });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return user;
}

test.describe("페이지 층 — body 아홉 선언 (02-08 Task 1)", () => {
  test("/login body 계산값이 토큰을 반영한다", async ({ page }) => {
    await page.goto("/login");
    const body = page.locator("body");

    await expect(body).toHaveCSS("color", "rgb(11, 21, 18)");
    await expect(body).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(body).toHaveCSS("font-size", "14px");
    await expect(body).toHaveCSS("word-break", "keep-all");
    await expect(body).toHaveCSS("overflow-wrap", "anywhere");
    await expect(body).toHaveCSS("margin", "0px");

    const lineHeight = await body.evaluate((el) => getComputedStyle(el).lineHeight);
    expect(px(lineHeight)).toBeCloseTo(22.4, 1);

    const letterSpacing = await body.evaluate((el) => getComputedStyle(el).letterSpacing);
    expect(px(letterSpacing)).toBeCloseTo(-0.21, 1);

    const tabSize = await body.evaluate((el) => getComputedStyle(el).tabSize ?? getComputedStyle(el).getPropertyValue("tab-size"));
    expect(String(tabSize)).toBe("4");
  });
});

test.describe("§4-4 브라우저 기본 표면 (02-08 Task 1)", () => {
  test("/login 문서 표면 값이 토큰이다", async ({ page }) => {
    await page.goto("/login");

    const docStyles = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        accentColor: style.accentColor,
        scrollbarWidth: style.scrollbarWidth,
        scrollbarColor: style.scrollbarColor,
      };
    });
    expect(docStyles.accentColor).toBe("rgb(0, 84, 70)");
    expect(docStyles.scrollbarWidth).toBe("thin");
    expect(docStyles.scrollbarColor).toContain("rgb(124, 138, 134)");

    const emailInput = page.getByLabel("이메일");
    await expect(emailInput).toHaveCSS("caret-color", "rgb(0, 84, 70)");

    const selection = await page.evaluate(() => {
      const style = getComputedStyle(document.body, "::selection");
      return { backgroundColor: style.backgroundColor, color: style.color };
    });
    expect(selection.backgroundColor).toBe("rgb(220, 232, 228)");
    expect(selection.color).toBe("rgb(11, 21, 18)");
  });

  test("/login 컨트롤이 Pretendard 서체로 렌더된다", async ({ page }) => {
    await page.goto("/login");

    const emailFont = await page.getByLabel("이메일").evaluate((el) => getComputedStyle(el).fontFamily);
    expect(emailFont.startsWith('"Pretendard Variable"')).toBe(true);

    const buttonFont = await page
      .getByRole("button", { name: "로그인" })
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(buttonFont.startsWith('"Pretendard Variable"')).toBe(true);
  });
});

test.describe("로그인 실패 문구 — FormAlert (02-08 Task 1, §6-7 A②)", () => {
  test("form 안 role=alert 문구가 --danger 색이다", async ({ page }) => {
    const user = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "로그인" }).click();

    const alert = page.locator("form [role='alert']");
    await expect(alert).toBeVisible();
    await expect(alert).toHaveCSS("color", "rgb(155, 28, 28)");
  });
});

test.describe("전역 포커스 링 (02-08 Task 1, §4-4)", () => {
  test("컴포넌트 포커스 스타일이 없는 3차 링크에 전역 포커스 링이 적용된다", async ({ page }) => {
    await loginAs(page, DEFAULT_ROLE_ID);
    await page.goto("/projects");

    // Phase 4(04-01): /projects의 EMPTY 다음 한 수가 "지출결의 보기"(임시
    // 자리표시자)에서 "프로젝트 등록"(실제 등록 동선)으로 바뀌었다 — 이
    // 테스트는 "컴포넌트 포커스 스타일이 없는 3차 링크" 아무거나 검증하면
    // 충분하므로 같은 화면의 새 링크로 옮긴다.
    const link = page.getByRole("link", { name: "프로젝트 등록" });
    await link.focus();

    await expect(link).toHaveCSS("outline-style", "solid");
    await expect(link).toHaveCSS("outline-width", "2px");
    await expect(link).toHaveCSS("outline-color", "rgb(0, 84, 70)");
    await expect(link).toHaveCSS("outline-offset", "2px");
  });
});

test.describe("시스템 상태 라벨·값 목록 — KvList (02-08 Task 1, §6-8 B①)", () => {
  test("dt·dd 계산값이 KvList 골격이다", async ({ page }) => {
    await loginAs(page, SYSADMIN_ROLE_ID);
    await page.goto("/admin/system-status");

    const firstDt = page.locator("main dt").first();
    await expect(firstDt).toHaveCSS("font-size", "12px");
    await expect(firstDt).toHaveCSS("font-weight", "600");
    await expect(firstDt).toHaveCSS("color", "rgb(78, 93, 89)");
    await expect(firstDt).toHaveCSS("border-bottom-style", "dotted");
    await expect(firstDt).toHaveCSS("border-bottom-color", "rgb(207, 219, 215)");

    const box = await firstDt.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(95);
    expect(box!.width).toBeLessThanOrEqual(97);

    const firstDd = page.locator("main dd").first();
    await expect(firstDd).toHaveCSS("margin-left", "0px");

    await expect(page.getByText("배포 버전")).toBeVisible();
    await expect(page.getByText("확인 불가")).toBeVisible();
  });
});

test.describe("§6-0 화면 제목·부제 · §6-9 오류 제목 (02-08 Task 2)", () => {
  test("/projects 제목·부제 계산값이 PageHeader 골격이다", async ({ page }) => {
    await loginAs(page, DEFAULT_ROLE_ID);
    await page.goto("/projects");

    const h1 = page.locator("main h1");
    await expect(h1).toHaveCSS("font-size", "18px");
    await expect(h1).toHaveCSS("font-weight", "700");
    const letterSpacing = await h1.evaluate((el) => getComputedStyle(el).letterSpacing);
    expect(px(letterSpacing)).toBeCloseTo(-0.36, 1);
    const lineHeight = await h1.evaluate((el) => getComputedStyle(el).lineHeight);
    expect(px(lineHeight)).toBeCloseTo(25.2, 1);

    const subtitle = page.getByText("진행 중인 프로젝트 원장");
    await expect(subtitle).toHaveCSS("font-size", "12px");
    await expect(subtitle).toHaveCSS("color", "rgb(78, 93, 89)");
  });

  test("/account 제목·부제(이메일) 계산값이 PageHeader 골격이다", async ({ page }) => {
    const user = await loginAs(page, DEFAULT_ROLE_ID);
    await page.goto("/account");

    const h1 = page.locator("main h1");
    await expect(h1).toHaveCSS("font-size", "18px");

    const subtitle = page.getByText(user.email);
    await expect(subtitle).toHaveCSS("font-size", "12px");
    await expect(subtitle).toHaveCSS("color", "rgb(78, 93, 89)");
  });

  test("루트 404(셸 밖) 제목이 --fs-2xl 자간·행간이다", async ({ page }) => {
    await page.goto("/e2e-page-chrome-nonexistent");

    const h1 = page.locator("main h1");
    await expect(h1).toHaveCSS("font-size", "32px");
    const letterSpacing = await h1.evaluate((el) => getComputedStyle(el).letterSpacing);
    expect(px(letterSpacing)).toBeCloseTo(-0.64, 1);
    const lineHeight = await h1.evaluate((el) => getComputedStyle(el).lineHeight);
    expect(px(lineHeight)).toBeCloseTo(41.6, 1);
  });

  test("셸 안 404(직원 → /admin/system-status) 제목이 --fs-2xl 자간·행간이다", async ({ page }) => {
    await loginAs(page, DEFAULT_ROLE_ID);
    const response = await page.goto("/admin/system-status");
    expect(response?.status()).toBe(404);

    const h1 = page.locator("main h1");
    const letterSpacing = await h1.evaluate((el) => getComputedStyle(el).letterSpacing);
    expect(px(letterSpacing)).toBeCloseTo(-0.64, 1);
    const lineHeight = await h1.evaluate((el) => getComputedStyle(el).lineHeight);
    expect(px(lineHeight)).toBeCloseTo(41.6, 1);
  });
});

test.describe("§6-0 현재 메뉴(WR-01)", () => {
  test("/projects에서 주 메뉴 현재 링크가 하나이고 계산값이 현재 표시다", async ({ page }) => {
    await loginAs(page, DEFAULT_ROLE_ID);
    await page.goto("/projects");

    const current = page.locator('nav[aria-label="주 메뉴"] a[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText("프로젝트");
    await expect(current).toHaveCSS("font-weight", "700");
    await expect(current).toHaveCSS("color", "rgb(220, 232, 228)");
    const boxShadow = await current.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(boxShadow).toContain("inset");
  });

  test("/account에서는 주 메뉴 현재 링크가 없다", async ({ page }) => {
    await loginAs(page, DEFAULT_ROLE_ID);
    await page.goto("/account");

    const current = page.locator('nav[aria-label="주 메뉴"] a[aria-current="page"]');
    await expect(current).toHaveCount(0);
  });
});

// F-09(260922-o2b) — SYSTEM.md §6-7 「최대 폭 360, 가운데 정렬」. AuthFrame이
// --modal-w(480)를 재사용하고 있었다 — --auth-max(360)로 좁힌다.
test.describe("로그인 틀 폭 (F-09)", () => {
  test("/login form 폭이 360 이하 · 300 초과이고 가로 중심이 640이다", async ({ page }) => {
    expect(page.viewportSize()?.width).toBe(1280);
    await page.goto("/login");

    const form = page.locator("form").first();
    const box = await form.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(360);
    expect(box!.width).toBeGreaterThan(300);
    expect(Math.abs(box!.x + box!.width / 2 - 640)).toBeLessThanOrEqual(1);
  });
});

// F-10(260922-o2b) — SYSTEM.md §2-2 --fs-lg(18/1.4/700). /account의 「비밀번호
// 변경」 h2는 클래스가 없어 브라우저 기본값(1.5em ≈ 21px)이 적용되고 있었다.
test.describe("/account 섹션 제목 타입 스케일 (F-10)", () => {
  test("「비밀번호 변경」 h2가 18px·700이다", async ({ page }) => {
    await loginAs(page, DEFAULT_ROLE_ID);
    await page.goto("/account");

    const heading = page.getByRole("heading", { level: 2, name: "비밀번호 변경" });
    await expect(heading).toHaveCSS("font-size", "18px");
    await expect(heading).toHaveCSS("font-weight", "700");
  });
});
