import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID, DEFAULT_ROLE_ID } from "@/domain/permissions/roles";

// 2026-09-21 스테이징 QA: "한 화면에 왜 이렇게 값과 입력하는 페이지가 길어" —
// 거래처·코드표·사람·법인카드 관리 화면이 항상 열려 있는 등록 폼을 목록
// 위에 두어, 일반 모니터에서도 목록(§6-1 원장)이 첫 화면 아래로 밀렸다.
//
// 이 스펙은 그 회귀를 세 가지로 고정한다.
// 1) 기본 진입(쿼리 없음)에는 등록 폼이 없고, 목록 머리글의 행동 링크가
//    뷰포트 안(스크롤 없이)에 있다 — "목록이 화면"이다.
// 2) 그 행동 링크를 누르면(한 클릭) 등록 폼이 열린다.
// 3) 그 상태에서 제출은 그대로 동작한다(회귀 없음).

async function loginAs(page: Page, roleId: string): Promise<void> {
  const user = await createFixtureUser({ roleId });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

// 행동 링크가 뷰포트 안(스크롤 없이)에 있다는 것을 "폼이 그 위를 채우지
// 않는다"의 증거로 쓴다 — 예전 결함(6필드 거래처 폼)에서는 이 자리 자체가
// 뷰포트 밖으로 밀려났다.
async function expectReachableWithoutScrolling(page: Page, linkName: string): Promise<void> {
  const link = page.getByRole("link", { name: linkName });
  await expect(link).toBeVisible();
  const box = await link.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.y).toBeLessThan(viewport!.height);
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY).toBe(0);
}

test.describe("거래처 화면 — 목록이 첫 화면, 등록은 행동 (§6-1)", () => {
  test("기본 진입에 폼이 없고, 「거래처 등록」이 스크롤 없이 닿으며, 누르면 폼이 열리고 제출된다", async ({
    page,
  }) => {
    await loginAs(page, SYSADMIN_ROLE_ID);
    const response = await page.goto("/admin/vendors");
    expect(response?.status()).toBe(200);

    // 1) 기본 진입 — 폼 없음, 등록 행동은 스크롤 없이.
    await expect(page.getByLabel("이름")).toHaveCount(0);
    await expectReachableWithoutScrolling(page, "거래처 등록");

    // 2) 누르면 열린다.
    await page.getByRole("link", { name: "거래처 등록" }).click();
    await expect(page).toHaveURL(/[?&]new=1/);
    await expect(page.getByLabel("이름")).toBeVisible();

    // 3) 제출은 그대로 동작한다.
    const vendorName = `E2E목록우선-${Date.now()}`;
    await page.getByLabel("이름").fill(vendorName);
    await page.getByRole("button", { name: "거래처 등록" }).click();
    await expect(page.getByText(vendorName)).toBeVisible();
  });
});

test.describe("코드표 화면 — 목록이 첫 화면, 등록은 행동 (§6-1)", () => {
  test("기본 진입에 폼이 없고, 「코드 추가」가 스크롤 없이 닿으며, 누르면 폼이 열리고 제출된다", async ({
    page,
  }) => {
    await loginAs(page, SYSADMIN_ROLE_ID);
    const response = await page.goto("/admin/code-tables");
    expect(response?.status()).toBe(200);

    await expect(page.getByLabel("값")).toHaveCount(0);
    await expectReachableWithoutScrolling(page, "코드 추가");

    await page.getByRole("link", { name: "코드 추가" }).click();
    await expect(page).toHaveURL(/[?&]new=1/);
    await expect(page.getByLabel("값")).toBeVisible();

    const value = `e2e-목록우선-${Date.now()}`;
    await page.getByLabel("값").fill(value);
    await page.getByLabel("이름").fill("목록 우선 E2E");
    await page.getByRole("button", { name: "코드 추가" }).click();
    await expect(page.getByText(value)).toBeVisible();
  });
});

test.describe("사람 화면 — 목록이 첫 화면, 등록은 행동 (§6-1)", () => {
  test("기본 진입에 폼이 없고, 「사람 등록」이 스크롤 없이 닿으며, 누르면 폼이 열리고 제출된다", async ({
    page,
  }) => {
    await loginAs(page, SYSADMIN_ROLE_ID);
    const response = await page.goto("/admin/people");
    expect(response?.status()).toBe(200);

    await expect(page.getByLabel("이름")).toHaveCount(0);
    await expectReachableWithoutScrolling(page, "사람 등록");

    await page.getByRole("link", { name: "사람 등록" }).click();
    await expect(page).toHaveURL(/[?&]new=1/);
    await expect(page.getByLabel("이름")).toBeVisible();

    // 이메일 로컬 파트는 ASCII로 둔다 — 한글을 넣으면 등록 자체가 검증에서 막혀
    // 이 테스트가 재려는 「목록 우선 배치」와 무관한 이유로 실패한다.
    const newEmail = `e2e-listfirst-${Date.now()}@example.test`;
    await page.getByLabel("이름").fill("목록우선대상");
    await page.getByLabel("이메일").fill(newEmail);
    await page.getByLabel("계급").selectOption(DEFAULT_ROLE_ID);
    await page.getByRole("button", { name: "사람 등록" }).click();
    await expect(page.getByText(`초기 비밀번호 — ${newEmail}`)).toBeVisible();
  });
});

test.describe("법인카드 화면 — 목록이 첫 화면, 등록은 행동 (§6-1)", () => {
  test("기본 진입에 폼이 없고, 「법인카드 등록」이 스크롤 없이 닿으며, 누르면 폼이 열리고 제출된다", async ({
    page,
  }) => {
    await loginAs(page, SYSADMIN_ROLE_ID);
    const response = await page.goto("/admin/corp-cards");
    expect(response?.status()).toBe(200);

    await expect(page.getByLabel("발급사")).toHaveCount(0);
    await expectReachableWithoutScrolling(page, "법인카드 등록");

    await page.getByRole("link", { name: "법인카드 등록" }).click();
    await expect(page).toHaveURL(/[?&]new=1/);
    await expect(page.getByLabel("발급사")).toBeVisible();

    const issuer = `E2E목록우선카드사-${Date.now()}`;
    const last4 = String(Math.floor(1000 + Math.random() * 9000));
    await page.getByLabel("발급사").fill(issuer);
    await page.getByLabel("뒤 4자리").fill(last4);
    await page.getByLabel("별칭").fill("목록우선카드");
    // 종류 기본값은 개인 카드 — 로그인한 관리자 자신도 people 목록에 있어
    // 소지자 선택 상자에 옵션이 최소 하나(플레이스홀더 제외) 있다.
    await page.getByLabel("소지자").selectOption({ index: 1 });
    await page.getByRole("button", { name: "법인카드 등록" }).click();
    await expect(page.getByRole("cell", { name: "목록우선카드" }).first()).toBeVisible();
  });
});
