import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { createVendor } from "@/domain/vendors";
import { SYSTEM_VIEWER } from "@/domain/viewer";
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

// 토큰 값을 브라우저 계산 값으로 바꿔 비교한다(역할 토큰 이름으로 단언 — 값은 tokens.css가 정한다).
function tokenAsColor(page: Page, name: string): Promise<string> {
  return page.evaluate((token) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${token})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, name);
}

function tokenValue(page: Page, name: string): Promise<string> {
  return page.evaluate((token) => getComputedStyle(document.documentElement).getPropertyValue(token).trim(), name);
}

async function loginAs(
  page: Page,
  roleId: string,
  options: { withTeam?: boolean } = {},
): Promise<{ email: string; password: string }> {
  const user = await createFixtureUser({ roleId, withTeam: options.withTeam });
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

    await expect(body).toHaveCSS("color", await tokenAsColor(page, "--text-strong"));
    await expect(body).toHaveCSS("background-color", await tokenAsColor(page, "--surface-canvas"));
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
    // 팀 발령이 없는 팀 업무 범위 사람에게는 「프로젝트 등록」이 보이지 않는다 — 팀을 준다.
    // 거래처가 하나도 없으면 등록할 수 없어 링크가 빠진다(quick 261001-85g) — 다른 스펙이 먼저 만든 거래처에 기대지 않고 직접 만든다.
    await createVendor(SYSTEM_VIEWER, { name: `포커스링거래처-${randomUUID().slice(0, 8)}` });
    await loginAs(page, DEFAULT_ROLE_ID, { withTeam: true });
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
    const titleSize = await tokenValue(page, "--text-title");
    await expect(h1).toHaveCSS("font-size", titleSize);
    await expect(h1).toHaveCSS("font-weight", "700");
    const letterSpacing = await h1.evaluate((el) => getComputedStyle(el).letterSpacing);
    expect(px(letterSpacing)).toBeCloseTo(px(titleSize) * -0.02, 1);
    const lineHeight = await h1.evaluate((el) => getComputedStyle(el).lineHeight);
    expect(px(lineHeight)).toBeCloseTo(px(titleSize) * 1.3, 1);

    // 코디네이터 대리 결정 2026-09-26 /design-review FINDING-014 — 기본 보기가 올해 · 전체 상태라 「진행 중인」을 뺀다.
    const subtitle = page.getByText("프로젝트 원장", { exact: true });
    await expect(subtitle).toHaveCSS("font-size", await tokenValue(page, "--text-aux"));
    await expect(subtitle).toHaveCSS("color", await tokenAsColor(page, "--text-muted"));
  });

  test("/account 제목·부제(이메일) 계산값이 PageHeader 골격이다", async ({ page }) => {
    const user = await loginAs(page, DEFAULT_ROLE_ID);
    await page.goto("/account");

    const h1 = page.locator("main h1");
    await expect(h1).toHaveCSS("font-size", await tokenValue(page, "--text-title"));

    const subtitle = page.getByText(user.email);
    await expect(subtitle).toHaveCSS("font-size", await tokenValue(page, "--text-aux"));
    await expect(subtitle).toHaveCSS("color", await tokenAsColor(page, "--text-muted"));
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

test.describe("§6-0 상단 바 — 스킨 A (04.6-08)", () => {
  test("바 높이가 --bar-h이고 아래 선이 없고 면이 --bar-bg다", async ({ page }) => {
    await loginAs(page, DEFAULT_ROLE_ID);
    await page.goto("/projects");

    const bar = page.getByRole("banner");
    await expect(bar).toHaveCSS("height", await tokenValue(page, "--bar-h"));
    await expect(bar).toHaveCSS("border-bottom-width", "0px");
    await expect(bar).toHaveCSS("background-color", await tokenAsColor(page, "--bar-bg"));
  });

  test("바 위 메뉴 링크 포커스 윤곽은 --focus-on-bar, 바 밖 사용자 메뉴 항목은 --focus다", async ({ page }) => {
    await loginAs(page, DEFAULT_ROLE_ID);
    await page.goto("/projects");

    const navLink = page.getByRole("banner").getByRole("link", { name: "프로젝트", exact: true });
    await navLink.focus();
    await expect(navLink).toHaveCSS("outline-color", await tokenAsColor(page, "--focus-on-bar"));

    // 마우스로 연 뒤의 스크립트 포커스는 :focus-visible이 아니다 — 키보드로 열어 키보드 포커스 상태로 만든다.
    const trigger = page.locator('header button[aria-haspopup="menu"]');
    await trigger.focus();
    await page.keyboard.press("Enter");
    const item = page.getByRole("menuitem").first();
    await item.focus();
    await expect(item).toHaveCSS("outline-color", await tokenAsColor(page, "--focus"));
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
    await expect(current).toHaveCSS("color", await tokenAsColor(page, "--bar-fg"));
    // 현재 표시 = 아래 2px(--underline-w-hover) --bar-leaf 밑줄(04.6-08 — inset 그림자 대신 투명 자리를 채운다).
    await expect(current).toHaveCSS("border-bottom-width", await tokenValue(page, "--underline-w-hover"));
    await expect(current).toHaveCSS("border-bottom-color", await tokenAsColor(page, "--bar-leaf"));
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
