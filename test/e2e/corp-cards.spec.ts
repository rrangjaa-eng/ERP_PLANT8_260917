import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { expectGapsAtLeastToken, expectNoRowOverflow, loginAsSysadmin, textLineCount } from "./row-actions-helpers";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { findUserByEmail } from "@/repositories/users";
import { insertCorpCard, setCorpCardActive } from "@/repositories/corp-cards";

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
    // 2026-09-21 스테이징 QA 수정: 등록 폼이 기본 진입에는 없다(§6-1) —
    // 목록 머리글의 「사람 등록」이 그 폼을 연다.
    await page.goto("/admin/people");
    await page.getByRole("link", { name: "사람 등록" }).click();
    const holderEmail = `e2e-card-holder-${Date.now()}@example.test`;
    await page.getByLabel("이름").fill("카드소지자");
    await page.getByLabel("이메일").fill(holderEmail);
    await page.getByLabel("계급").selectOption(DEFAULT_ROLE_ID);
    await page.getByLabel("입사일").fill("2026-01-01");
    await page.getByRole("button", { name: "사람 등록" }).click();
    await expect(page.getByText(`초기 비밀번호 — ${holderEmail}`)).toBeVisible();

    const response = await page.goto("/admin/corp-cards");
    expect(response?.status()).toBe(200);

    // 2026-09-21 스테이징 QA 수정: 등록 폼이 기본 진입에는 없다(§6-1) —
    // 목록 머리글의 「법인카드 등록」이 그 폼을 연다. 제출해도 폼은 열린
    // 채로 남으므로(필드만 reset) 아래 세 번 등록에 한 번만 열면 된다.
    await expect(page.getByLabel("발급사")).toHaveCount(0);
    await page.getByRole("link", { name: "법인카드 등록" }).click();

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
    await expect(alert).toHaveText("이미 등록된 카드 · 발급사와 뒤 4자리 확인");
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

  // 소지자를 고른 뒤 종류를 팀으로 바꾸면 팀 칸이 첫 팀으로 저절로 골라지던
  // 결함의 회귀 — 팀 칸은 빈 값으로 남아 제출이 막혀야 한다.
  test("소지자를 고른 뒤 종류를 팀으로 바꾸면 팀 칸은 비어 있다", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/admin/corp-cards?new=1");
    await page.getByLabel("소지자").selectOption({ index: 1 });
    await page.getByLabel("종류").selectOption("team");

    const state = await page.getByLabel("팀").evaluate((el) => {
      const select = el as HTMLSelectElement;
      return { value: select.value, valid: select.checkValidity() };
    });
    expect(state.value).toBe("");
    expect(state.valid).toBe(false);
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

// 260930-f3l /design-review FINDING-001: 법인카드 표 행 동작 「수정 · 비활성화 · 삭제」 사이 가로 간격이 0px라 한 낱말처럼 읽혔다.
// 사람 목록(PR #108)의 .rowActions 규칙(--s-4)을 같은 이름으로 적용한다(SYSTEM §6-1). 700은 .rowActions가 nowrap을 지키는 가장 좁은 폭(D3).
test.describe("법인카드 행 동작 간격 --s-4 (260930-f3l FINDING-001)", () => {
  async function seed(): Promise<{ target: string; cleanup: () => Promise<void> }> {
    const stamp = randomUUID().slice(0, 8);
    const holder = await findUserByEmail(SYSTEM_VIEWER, (await createFixtureUser({ roleId: DEFAULT_ROLE_ID })).email);
    const issuer = `간격카드사-${stamp}`;
    // 다른 열이 긴 행이 있어야 동작 칸이 눌린다 — 앞 테스트가 남긴 데이터에 기대지 않는다.
    const long = await insertCorpCard(SYSTEM_VIEWER, {
      issuer,
      numberLast4: "1111",
      label: `${"가".repeat(60)}${stamp}`,
      kind: "personal",
      holderUserId: holder!.id,
    });
    const target = await insertCorpCard(SYSTEM_VIEWER, {
      issuer,
      numberLast4: "2222",
      label: `간격대상-${stamp}`,
      kind: "personal",
      holderUserId: holder!.id,
    });
    return {
      target: target.label,
      cleanup: async () => {
        await setCorpCardActive(SYSTEM_VIEWER, long.id, false);
        await setCorpCardActive(SYSTEM_VIEWER, target.id, false);
      },
    };
  }

  for (const width of [1280, 768, 700]) {
    test(`${width}: 수정 · 비활성화 · 삭제 사이가 한 줄에서 --s-4 이상이고 표가 넘치지 않는다`, async ({ page }) => {
      const { target, cleanup } = await seed();
      try {
        await page.setViewportSize({ width, height: 800 });
        await loginAsSysadmin(page);
        await page.goto("/admin/corp-cards");
        const row = page.locator("tr", { hasText: target });
        const edit = row.getByRole("link", { name: "수정" });
        const deactivate = row.getByRole("button", { name: "비활성화" });
        const remove = row.getByRole("button", { name: "삭제" });
        await expectNoRowOverflow(page, row, `${width}px 일반 상태`);
        const gaps = await expectGapsAtLeastToken(page, [edit, deactivate, remove], `${width}px`);
        expect(gaps.every((item) => item.horizontal), `${width}px 한 줄`).toBe(true);
        expect(await textLineCount(edit), "「수정」 글자 줄 수").toBe(1);
      } finally {
        await cleanup();
      }
    });
  }

  for (const width of [700, 768, 1024, 1280]) {
    test(`${width}: 「삭제」를 누른 뒤에도 페이지와 표가 가로로 넘치지 않는다`, async ({ page }) => {
      const { target, cleanup } = await seed();
      try {
        await page.setViewportSize({ width, height: 800 });
        await loginAsSysadmin(page);
        await page.goto("/admin/corp-cards");
        const row = page.locator("tr", { hasText: target });
        await row.getByRole("button", { name: "삭제" }).click();
        await expect(row.getByRole("button", { name: "취소" })).toBeVisible();
        await expectNoRowOverflow(page, row, `${width}px 확인 상태`);
      } finally {
        await cleanup();
      }
    });
  }
});
