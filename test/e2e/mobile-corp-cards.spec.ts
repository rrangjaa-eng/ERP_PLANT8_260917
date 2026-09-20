import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// defect 4(wave 5 DOM 감사, 375px):
// 1) ui/button/Button.module.css의 .tertiary는 height: auto + padding: 0라,
//    좁은 "동작" 칸에서 한글이 한 글자씩 세로로 꺾여 「비활성화」 버튼이
//    19×78처럼 찌그러졌다(측정으로 확인). white-space: nowrap을 추가해
//    한 줄로 고정했다 — 표는 여전히 375 안에 들어간다(측정 확인 완료).
// 2) 「숨김 포함」 링크가 43×19로 §3 터치 목표(44×44) 미만이었다. 폰
//    전용 미디어쿼리로 히트 영역만 44×44로 키웠다(PC는 그대로).

async function loginAs(page: Page, roleId: string): Promise<{ email: string; password: string }> {
  const user = await createFixtureUser({ roleId });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return user;
}

test.describe("폰 375 /admin/corp-cards 3차 버튼·터치 목표 (defect 4)", () => {
  test("법인카드 등록 후 비활성화 버튼이 한 줄로 렌더되고 문서 가로 스크롤이 없다", async ({ page }) => {
    await loginAs(page, SYSADMIN_ROLE_ID);
    await page.goto("/admin/people");
    const holderEmail = `e2e-mobile-card-holder-${Date.now()}@example.test`;
    await page.getByLabel("이름").fill("폰카드소지자");
    await page.getByLabel("이메일").fill(holderEmail);
    await page.getByLabel("계급").selectOption(DEFAULT_ROLE_ID);
    await page.getByRole("button", { name: "사람 등록" }).click();
    await expect(page.getByText(`초기 비밀번호 — ${holderEmail}`)).toBeVisible();

    await page.goto("/admin/corp-cards");
    const issuer = `폰E2E카드사-${Date.now()}`;
    const last4 = String(Math.floor(1000 + Math.random() * 9000));
    await page.getByLabel("발급사").fill(issuer);
    await page.getByLabel("뒤 4자리").fill(last4);
    await page.getByLabel("별칭").fill("폰카드1");
    await page.getByLabel("소지자").selectOption({ label: "폰카드소지자" });
    await page.getByRole("button", { name: "법인카드 등록" }).click();
    await expect(page.getByText("폰카드1")).toBeVisible();

    const toggleButton = page.getByRole("button", { name: "비활성화" }).first();
    const box = await toggleButton.boundingBox();
    expect(box).not.toBeNull();
    // 재현 당시 폭 19 · 높이 78(세로 텍스트로 찌그러짐). 정상 렌더는 한 줄
    // 텍스트라 높이가 --control-h(폰 40) 근방이어야 하고, 폭은 "비활성화" 네
    // 글자가 다 들어갈 만큼은 돼야 한다.
    expect(box!.height).toBeLessThan(30);
    expect(box!.width).toBeGreaterThan(30);

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test("「숨김 포함」 링크의 터치 목표가 44×44 이상이다", async ({ page }) => {
    await loginAs(page, SYSADMIN_ROLE_ID);
    await page.goto("/admin/corp-cards");

    const hideLink = page.getByRole("link", { name: /숨김 포함|숨김 제외/ });
    const box = await hideLink.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});
