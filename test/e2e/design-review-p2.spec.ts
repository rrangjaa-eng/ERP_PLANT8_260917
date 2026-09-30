import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertVendor, setVendorArchived } from "@/repositories/vendors";

// /design-review 2026-09-24(Phase 2 화면) 회귀 — 실측 결함의 재발 방지.
//   FINDING-002: 상단 바 메뉴·사용자 트리거에 hover 상태가 없었다(§5 hover 120ms).
//   FINDING-003: PC 사용자 트리거 히트 영역이 19px — 같은 바의 메뉴 링크는 37px.
//   FINDING-004: /account의 「로그아웃」이 1차 버튼 바로 밑에 0px로 붙어 있었다
//                (§3 폼 묶음 사이 24px + 1px 선).
const USER_NAME = "E2E Employee";

async function login(page: Page): Promise<void> {
  const user = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe("Phase 2 셸·내 계정 (/design-review 2026-09-24)", () => {
  test("FINDING-002: 상단 바 메뉴에 hover하면 --bar-fg로 밝아지고, 사용자 트리거는 밑줄이 생긴다", async ({
    page,
  }) => {
    await login(page);
    const barFg = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--bar-fg)";
      document.body.append(probe);
      const rgb = getComputedStyle(probe).color;
      probe.remove();
      return rgb;
    });

    const cards = page.getByRole("banner").getByRole("link", { name: "법인카드", exact: true });
    await cards.hover();
    await expect(cards).toHaveCSS("color", barFg);

    const trigger = page.getByRole("button", { name: USER_NAME });
    await trigger.hover();
    await expect(trigger).toHaveCSS("text-decoration-line", "underline");
  });

  test("FINDING-003: PC 사용자 트리거의 히트 영역이 32px 이상이다(§10 PC 컨트롤 하한)", async ({ page }) => {
    await login(page);
    const box = await page.getByRole("button", { name: USER_NAME }).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(32);
  });

  test("FINDING-004: 「로그아웃」은 비밀번호 변경 폼과 24px 이상 떨어진 별도 묶음이다", async ({ page }) => {
    await login(page);
    const submit = await page.getByRole("button", { name: "비밀번호 변경" }).boundingBox();
    const logout = await page.getByRole("main").getByRole("button", { name: "로그아웃" }).boundingBox();
    expect(submit).not.toBeNull();
    expect(logout).not.toBeNull();
    expect(logout!.y - (submit!.y + submit!.height)).toBeGreaterThanOrEqual(24);
  });
});

// 260930-f3l /design-review FINDING-002: 공유 Button .tertiary의 밑줄이 border-bottom이라 hover에서 상자 높이가
// 19→20px로 자랐고 같은 칸의 「수정」 링크(글자 밑줄)와 모양이 달랐다. 글자 밑줄로 맞춘다(SYSTEM §4-4 · §7-1).
const PARITY_PROPERTIES = [
  "fontSize",
  "fontWeight",
  "color",
  "textDecorationLine",
  "textDecorationThickness",
  "textUnderlineOffset",
  "textDecorationColor",
] as const;

function parityStyle(locator: Locator): Promise<Record<(typeof PARITY_PROPERTIES)[number], string>> {
  return locator.evaluate((element, properties) => {
    const style = getComputedStyle(element);
    return Object.fromEntries(properties.map((property) => [property, style[property]])) as Record<
      (typeof PARITY_PROPERTIES)[number],
      string
    >;
  }, PARITY_PROPERTIES);
}

test.describe("PC 1280 공유 Button 3차(표 행 「숨기기」)의 글자 밑줄 (260930-f3l FINDING-002)", () => {
  test("hover해도 상자 높이가 그대로고 밑줄이 1px→2px이며, 같은 행 「수정」 링크와 모양이 같다", async ({ page }) => {
    const vendor = await insertVendor(SYSTEM_VIEWER, {
      name: `밑줄점검거래처-${randomUUID().slice(0, 8)}`,
      normalizedName: `밑줄점검-${randomUUID()}`,
    });
    try {
      const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
      await page.goto("/login");
      await page.getByLabel("이메일").fill(admin.email);
      await page.getByLabel("비밀번호").fill(admin.password);
      await page.getByRole("button", { name: "로그인" }).click();
      await expect(page).toHaveURL(/\/account$/);

      await page.goto("/admin/vendors");
      const row = page.locator("tr", { hasText: vendor.name });
      const hide = row.getByRole("button", { name: "숨기기" });
      await expect(hide).toBeVisible();

      // D4: 같은 칸의 「수정」 링크와 「숨기기」 버튼은 같은 3차 모양이다(요소 종류는 <a>/<button> 그대로).
      const link = await parityStyle(row.getByRole("link", { name: "수정" }));
      const button = await parityStyle(hide);
      expect(button).toEqual(link);

      const before = await hide.boundingBox();
      await expect(hide).toHaveCSS("text-decoration-thickness", "1px");
      await hide.hover();
      await expect(hide).toHaveCSS("text-decoration-thickness", "2px");
      const after = await hide.boundingBox();
      expect(after!.height).toBe(before!.height);
    } finally {
      await setVendorArchived(SYSTEM_VIEWER, vendor.id, true);
    }
  });
});
