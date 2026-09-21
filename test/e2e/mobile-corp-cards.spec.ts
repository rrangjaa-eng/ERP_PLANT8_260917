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
    // 재현 당시 폭 19 · 높이 78 — "비활성화"가 한 글자씩 세로로 꺾인 모습이다.
    // 결함의 정체는 "텍스트가 여러 줄로 꺾였다"이므로 줄 수를 직접 잰다.
    // (이전에는 대리 지표로 버튼 높이 < 30을 썼는데, 같은 .tertiary에 §3 폰
    //  터치 목표 44×44를 채우면서 높이가 44가 돼 대리 지표만 깨졌다 — 의도는
    //  그대로고 표현이 틀렸던 것이라, 느슨하게 푸는 대신 의도를 직접 잰다.)
    const textLines = await toggleButton.evaluate((el) => {
      // 버튼 안 텍스트 노드의 줄 상자를 직접 센다. 래퍼 <span>까지 포함되면
      // 같은 한 줄이 상자 두 개로 잡히므로 텍스트 노드만 본다.
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const rects: DOMRect[] = [];
      let node = walker.nextNode();
      while (node) {
        if ((node.textContent ?? "").trim() !== "") {
          const range = document.createRange();
          range.selectNodeContents(node);
          rects.push(...Array.from(range.getClientRects()).filter((r) => r.width > 0));
        }
        node = walker.nextNode();
      }
      return { count: rects.length, height: Math.max(...rects.map((r) => r.height)) };
    });
    expect(textLines.count).toBe(1);
    expect(textLines.height).toBeLessThan(30);
    expect(box!.width).toBeGreaterThan(30);
    // 줄 수를 재게 된 이상 버튼 자체의 §3 터치 목표는 여기서도 같이 지킨다
    // (대리 지표를 걷어내며 44×44 보장이 사라지지 않도록).
    expect(box!.height).toBeGreaterThanOrEqual(44);

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
