import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// MAST-03: 법인카드를 개인/팀 구분과 함께 등록·비활성화할 수 있고, 소지자와
// 팀이 동시에 채워진 카드를 만들 수 없다는 것을 화면·액션·domain 세 곳에서
// 막는다.
test.describe("법인카드 관리 화면 (MAST-03)", () => {
  test("개인 카드·팀 카드 등록, 중복 거부, 비활성 토글, 기본 계급 404", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    // 이 카드 화면이 참조할 소지자·팀이 존재해야 하므로 먼저 사람 한 명을 등록한다.
    await page.goto("/admin/people");
    const holderEmail = `e2e-card-holder-${Date.now()}@example.test`;
    await page.getByLabel("이름").fill("카드소지자");
    await page.getByLabel("이메일").fill(holderEmail);
    await page.getByLabel("계급").selectOption(DEFAULT_ROLE_ID);
    await page.getByRole("button", { name: "사람 등록" }).click();
    await expect(page.getByText(`초기 비밀번호 — ${holderEmail}`)).toBeVisible();

    const response = await page.goto("/admin/corp-cards");
    expect(response?.status()).toBe(200);

    const issuer = `E2E카드사-${Date.now()}`;
    const last4 = String(Math.floor(1000 + Math.random() * 9000));

    // 개인 카드 등록
    await page.getByLabel("발급사").fill(issuer);
    await page.getByLabel("뒤 4자리").fill(last4);
    await page.getByLabel("별칭").fill("개인카드1");
    await page.getByLabel("종류").selectOption("personal");
    await page.getByLabel("소지자").selectOption({ label: "카드소지자" });
    await page.getByRole("button", { name: "법인카드 등록" }).click();
    await expect(page.getByText(issuer)).toBeVisible();
    await expect(page.getByText("개인카드1")).toBeVisible();

    // 같은 발급사·뒤 4자리로 다시 등록하면 거부
    await page.getByLabel("발급사").fill(issuer);
    await page.getByLabel("뒤 4자리").fill(last4);
    await page.getByLabel("별칭").fill("중복카드");
    await page.getByLabel("종류").selectOption("personal");
    await page.getByLabel("소지자").selectOption({ label: "카드소지자" });
    await page.getByRole("button", { name: "법인카드 등록" }).click();
    // defect 1 회귀 방지: 예전에는 이 자리에 drizzle의 원시 SQL·바인딩 값(내부
    // user id 포함)이 그대로 떴다. 이제 운영자가 읽을 수 있는 문장만 나가야 한다.
    // getByRole("alert")는 Next.js의 route announcer(빈 텍스트, 항상 role="alert")도
    // 잡으므로 FormAlert가 렌더하는 <p role="alert">만 좁혀서 본다.
    const alert = page.locator('p[role="alert"]');
    await expect(alert).toBeVisible();
    await expect(alert).toHaveText("이미 등록된 카드입니다 · 발급사와 뒤 4자리를 확인하세요");
    await expect(alert).not.toContainText("insert into");
    await expect(alert).not.toContainText("params:");

    // 팀 카드 등록
    const teamIssuer = `E2E팀카드사-${Date.now()}`;
    const teamLast4 = String(Math.floor(1000 + Math.random() * 9000));
    await page.getByLabel("발급사").fill(teamIssuer);
    await page.getByLabel("뒤 4자리").fill(teamLast4);
    await page.getByLabel("별칭").fill("팀카드1");
    await page.getByLabel("종류").selectOption("team");
    await page.getByLabel("팀").selectOption({ label: "기획본부 · 기획1팀" });
    await page.getByRole("button", { name: "법인카드 등록" }).click();
    await expect(page.getByText("팀카드1")).toBeVisible();

    // 개인카드1을 비활성화하면 기본 목록에서 사라지고 "숨김 포함"으로 다시 보인다
    const row = page.locator("tr", { hasText: "개인카드1" });
    await row.getByRole("button", { name: "비활성화" }).click();
    await expect(page.getByText("개인카드1")).toHaveCount(0);

    await page.getByRole("link", { name: "숨김 포함" }).click();
    await expect(page.getByText("개인카드1")).toBeVisible();
  });

  test("기본 계급(기획 PM)으로는 법인카드 화면이 404다", async ({ page }) => {
    const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(pm.email);
    await page.getByLabel("비밀번호").fill(pm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const response = await page.goto("/admin/corp-cards");
    expect(response?.status()).toBe(404);
  });
});
