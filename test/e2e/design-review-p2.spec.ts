import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";

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
