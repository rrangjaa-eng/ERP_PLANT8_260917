import { test, expect, type Page, type Locator } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";

// SYSTEM.md §11 브리프 2("마우스를 한 번도 잡지 않고 끝낼 수 있는가?") + ROADMAP.md
// Phase 2 성공 기준 3("키보드만으로 로그인·내비게이션·비밀번호 변경이 된다") + §10
// 포커스 규칙(첫 Tab = 스킵 링크, 순서 = 시각 순서, 모달/시트 Esc·복귀)을 검사한다.
// 이 파일에 마우스 클릭 호출이 하나라도 있으면 계획의 자동 검사(node -e 스크립트)가 실패한다.
//
// §6-0 (a) PC 사용자 진입점은 02-01 체크포인트 항목 G① — "사용자 이름이 작은 메뉴를
// 연다"로 확정되었다(ui/shell/TopBar.tsx 주석, STATE.md). 비밀번호 변경 동선은 그
// 형태 하나에만 대응한다 — 메뉴가 열리는 것을 기다리는 단계와 Esc 복귀 단언이 있다.
// §6-0 (a)가 나중에 ②(직접 /account 링크)·③(항목 나열)로 바뀌면 이 파일도 다시
// 써야 한다는 뜻이고, 그 신호는 TopBar.tsx의 위 주석이 먼저 알린다.

async function loginWithKeyboard(page: Page): Promise<{ email: string; password: string }> {
  const user = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
  await page.goto("/login");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("이메일")).toBeFocused();
  await page.keyboard.type(user.email);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("비밀번호")).toBeFocused();
  await page.keyboard.type(user.password);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/account$/);
  return user;
}

// 대상 요소에 포커스가 갈 때까지 Tab을 누른다 — 메뉴 항목 수가 바뀌어도(정보
// 노출표, Phase 3+) 정확한 Tab 횟수를 하드코딩하지 않게 한다. Tab 순서 자체를
// 검사하는 테스트는 이 헬퍼를 쓰지 않고 순서대로 직접 누른다.
async function tabUntilFocused(page: Page, target: Locator, maxPresses = 20): Promise<void> {
  for (let i = 0; i < maxPresses; i += 1) {
    await page.keyboard.press("Tab");
    const isTarget = await target.evaluate((el) => el === document.activeElement).catch(() => false);
    if (isTarget) return;
  }
  throw new Error(`Tab ${maxPresses}회 안에 대상 요소에 도달하지 못했다`);
}

test.describe("키보드 전용 동선 (성공 기준 3)", () => {
  test("로그인: Tab으로 이메일·비밀번호에 닿아 입력하고 Enter로 제출된다", async ({ page }) => {
    // loginWithKeyboard 자체가 이 동선을 마우스 없이 끝낸다(Tab×2 + type + Enter).
    const user = await loginWithKeyboard(page);
    await expect(page.getByText(user.email)).toBeVisible();
  });

  test("내비게이션: Tab으로 1차 메뉴에 닿아 Enter로 이동한다", async ({ page }) => {
    await loginWithKeyboard(page);

    const projectsLink = page.getByRole("link", { name: "프로젝트", exact: true });
    await tabUntilFocused(page, projectsLink);
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole("heading", { name: "프로젝트" })).toBeVisible();
  });

  test("비밀번호 변경: Tab으로 §6-0 (a) 사용자 메뉴를 열어 내 정보로 이동하고 마우스 없이 바꾼다", async ({
    page,
  }) => {
    const user = await loginWithKeyboard(page);

    // §6-0 (a) G①: 사용자 이름이 트리거 — 열리는 상태를 기다린다.
    const trigger = page.getByRole("button", { name: "E2E Employee" });
    await tabUntilFocused(page, trigger);
    await page.keyboard.press("Enter");

    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    // 열릴 때 첫 행동 요소에 포커스(§7-8과 같은 결 — TopBar.tsx firstItemRef). 04.2-09부터
    // accountGroup 맨 앞이 「알림함」이라 첫 항목은 그것이고, 「내 정보」는 그다음이다.
    const notificationsItem = menu.getByRole("menuitem", { name: "알림함" });
    await expect(notificationsItem).toBeFocused();
    await page.keyboard.press("ArrowDown");
    const accountItem = menu.getByRole("menuitem", { name: "내 정보" });
    await expect(accountItem).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/account$/);

    await tabUntilFocused(page, page.getByLabel("현재 비밀번호"));
    await page.keyboard.type(user.password);
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("새 비밀번호")).toBeFocused();
    await page.keyboard.type("kbd-only-new-password-1");
    await page.keyboard.press("Enter");

    // D-10: 비밀번호 변경 성공 → 전 세션 만료 → /login으로 안내(change-password.spec.ts
    // 가 이미 이 문구·URL을 단언한다 — 여기서는 반복하지 않고 도달만 확인한다).
    await expect(page).toHaveURL(/\/login\?reason=password-changed$/);
  });

  // ①(열리는 메뉴) 전용 동작 — ②·③에는 "열린 상태"가 없어 이 단언이 성립하지 않는다.
  test("§6-0 (a) 사용자 메뉴는 Esc로 닫히고 포커스가 트리거로 돌아온다", async ({ page }) => {
    await loginWithKeyboard(page);

    const trigger = page.getByRole("button", { name: "E2E Employee" });
    await tabUntilFocused(page, trigger);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("로드 후 첫 Tab이 본문 건너뛰기 링크에 닿고, 포커스 전에는 보이지 않다가 포커스 시 보인다", async ({
    page,
  }) => {
    await loginWithKeyboard(page);

    const skipLink = page.getByRole("link", { name: "본문으로 건너뛰기" });
    // position:absolute + top:-80px(화면 밖) — display:none이 아니라 isVisible()로는
    // 구분되지 않는다. 실제 렌더 위치(y)로 화면 밖/안을 판정한다.
    const before = await skipLink.boundingBox();
    expect(before).not.toBeNull();
    expect(before!.y).toBeLessThan(0);

    await page.keyboard.press("Tab");
    await expect(skipLink).toBeFocused();
    const after = await skipLink.boundingBox();
    expect(after).not.toBeNull();
    expect(after!.y).toBeGreaterThanOrEqual(0);
  });

  test("Enter로 스킵 링크를 쓰면 포커스가 본문으로 간다", async ({ page }) => {
    await loginWithKeyboard(page);

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "본문으로 건너뛰기" })).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.locator("#main-content")).toBeFocused();
  });

  // 포커스 순서 = 시각 순서(§10) — 상단 바 왼쪽에서 오른쪽으로: 스킵 링크 →
  // 워드마크(「내 차례」 홈 링크, 2026-09-24 FINDING-001) → 1차 메뉴 5개
  // (role-menu.ts TOP_BAR_MENU 순서) → 사용자 트리거.
  test("주요 요소의 Tab 도달 순서가 시각 순서(좌→우)와 같다", async ({ page }) => {
    await loginWithKeyboard(page);

    const expectedOrder = [
      page.getByRole("link", { name: "본문으로 건너뛰기" }),
      page.getByRole("link", { name: "PLANT8 내 차례", exact: true }),
      page.getByRole("link", { name: "프로젝트", exact: true }),
      page.getByRole("link", { name: "지출결의", exact: true }),
      page.getByRole("link", { name: "법인카드", exact: true }),
      page.getByRole("link", { name: "결재", exact: true }),
      page.getByRole("link", { name: "손익", exact: true }),
      page.getByRole("button", { name: "E2E Employee" }),
    ];

    for (const target of expectedOrder) {
      await page.keyboard.press("Tab");
      await expect(target).toBeFocused();
    }
  });
});
