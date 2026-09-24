import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// §3 터치 목표: 폰에서 모든 행동 요소 최소 44×44. code-tables.module.css의
// .toggle은 밑줄 링크라 글자 줄 높이(20px 안팎)로 찌그러져 있다 — 공유
// Button .tertiary에서 고친 것과 같은 결함이 이 화면별 CSS 모듈에 남아 있었다.
test.describe("폰 375 /admin/code-tables 터치 목표 (§3)", () => {
  test("코드표 선택 링크와 숨김 토글이 44×44 이상이다", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/admin/code-tables");

    const targets = [
      page.getByRole("navigation", { name: "코드표 선택" }).getByRole("link").first(),
      page.getByRole("link", { name: /숨김 포함|숨김 제외/ }),
    ];

    for (const target of targets) {
      const box = await target.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});

// 04-25(D-93 · UI-SPEC S14 overflow, 2026-09-23 사용자 확정): 폰(<700)에서
// 설명은 P2 — 각 행 아래 접힌 줄에 한 번만 보이고, 값·정렬·동작 열은 P3로
// 숨는다(SYSTEM.md §7-3 「폰 전략 = 칸 접기」). 가로 스크롤 0.
test.describe("폰 375 /admin/code-tables 설명 접힌 줄 (S14 overflow)", () => {
  test("설명이 이름 아래 접힌 줄에 한 번만 보이고 값·정렬·동작 열이 숨는다, 가로 스크롤 0", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const stamp = Date.now();
    const value = `m-desc-${stamp}`;
    const label = `폰설명${stamp % 100000}`;
    // 40자 상한 안에서 폰 폭을 넘는 긴 설명 — 말줄임 없이 줄바꿈해야 한다.
    const description = "무대·부스 설치와 철거 공사 · 현장 인력과 장비 반입까지 포함";

    await page.goto("/admin/code-tables?new=1");
    const form = page.locator("#code-item-form");
    await form.getByLabel("값", { exact: true }).fill(value);
    await form.getByLabel("이름", { exact: true }).fill(label);
    await form.getByLabel("설명", { exact: true }).fill(description);
    await page.getByRole("button", { name: "코드 추가" }).click();

    const nameInput = page.getByLabel(`${label} 이름`);
    const descriptionInput = page.getByLabel(`${label} 설명`);
    await expect(descriptionInput).toHaveValue(description);

    // 한 번만 — 같은 설명을 두 번 렌더하지 않는다.
    await expect(descriptionInput).toHaveCount(1);
    await expect(descriptionInput).toBeVisible();

    // P2: 설명은 이름 칸 아래 줄에 있고, 행 폭 전체를 쓴다.
    const nameBox = await nameInput.boundingBox();
    const descriptionBox = await descriptionInput.boundingBox();
    expect(nameBox).not.toBeNull();
    expect(descriptionBox).not.toBeNull();
    expect(descriptionBox!.y).toBeGreaterThanOrEqual(nameBox!.y + nameBox!.height);
    expect(descriptionBox!.width).toBeGreaterThan(nameBox!.width);

    // P3: 값·정렬·동작 열(머리글과 칸)이 숨는다. P2는 라벨 없이 값만이라
    // 「설명」 머리글도 없다. P1 머리글(이름·상태)이 보이는 것부터 확인해
    // 표 역할이 살아 있음을 고정한다 — 역할이 사라지면 아래 숨김 단언이
    // 빈 목록에 대해 참이 되어 버린다.
    for (const header of ["이름", "상태"]) {
      await expect(page.getByRole("columnheader", { name: header, exact: true })).toBeVisible();
    }
    for (const header of ["값", "설명", "정렬", "동작"]) {
      await expect(page.getByRole("columnheader", { name: header, exact: true })).toBeHidden();
    }
    await expect(page.getByText(value, { exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: "비활성화" }).first()).toBeHidden();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});
