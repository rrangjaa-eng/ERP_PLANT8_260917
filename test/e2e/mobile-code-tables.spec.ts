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
// 설명은 P2 — 각 행 아래 접힌 줄에 한 번만 보이고, 값·정렬 열은 P3로
// 숨는다(SYSTEM.md §7-3 「폰 전략 = 칸 접기」). 가로 스크롤 0.
test.describe("폰 375 /admin/code-tables 설명 접힌 줄 (S14 overflow)", () => {
  test("설명이 이름 아래 접힌 줄에 한 번만 보이고 값·정렬 열이 숨고 동작 열은 보인다, 가로 스크롤 0", async ({ page }) => {
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
    // 04.6-15: 「코드 추가」는 아래 시트 패널이다 — 성공하면 시트가 열린 채 칸이 비므로 Esc로 닫고 목록을 본다.
    const dialog = page.locator('dialog[data-ui="side-panel"]');
    const form = dialog.locator("#code-item-form");
    await form.getByLabel("값", { exact: true }).fill(value);
    await form.getByLabel("이름", { exact: true }).fill(label);
    await form.getByLabel("설명", { exact: true }).fill(description);
    await dialog.getByRole("button", { name: "코드 추가" }).click();
    await expect(dialog.getByRole("status")).toHaveText("코드 추가됨");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    // 사용자 결정 2026-10-03 14:57 KST 카드 「폰은 읽기만」 — 폰의 표 안에는 입력 칸 · 선택 상자가 없고 이름 · 설명이 글자로 보인다.
    // 동작 열(「비활성화」 · 「삭제」)은 Q4 A · SYSTEM 876대로 폰에서도 보인다(아래 44px 단언) — 그 두 버튼 말고 보이는 버튼은 없다.
    // 폰의 편집 요소는 DOM에 있되 CSS로 숨는다(첫 렌더부터 — 04.6 W5 D-1) — 의미는 「보이는 입력 0」이다.
    await expect(page.locator("table input, table select").filter({ visible: true })).toHaveCount(0);
    await expect(page.locator("table button").filter({ visible: true }).filter({ hasNotText: /^(비활성화|활성화|삭제)$/ })).toHaveCount(0);
    const nameText = page.locator("tbody td").filter({ visible: true, hasText: label }).first();
    // 한 번만 — 같은 설명을 폰에서 두 번 보이지 않는다.
    const descriptionText = page.locator("tbody td").filter({ visible: true, hasText: description });
    await expect(descriptionText).toHaveCount(1);
    await expect(nameText).toBeVisible();

    // P2: 설명은 이름 칸 아래 줄에 있고, 행 폭 전체를 쓴다.
    const nameBox = await nameText.boundingBox();
    const descriptionBox = await descriptionText.boundingBox();
    expect(nameBox).not.toBeNull();
    expect(descriptionBox).not.toBeNull();
    expect(descriptionBox!.y).toBeGreaterThanOrEqual(nameBox!.y + nameBox!.height);
    expect(descriptionBox!.width).toBeGreaterThan(nameBox!.width);

    // P3: 값·정렬 열(머리글과 칸)이 숨는다. P1 머리글(이름·상태·동작)이 보이는 것부터 확인해 표 역할이 살아 있음을 고정한다.
    // 04.6-15 Q4 A · SYSTEM 876 — 동작 열은 폰에서도 P1로 보이고 두 버튼은 44px 이상이다(편집 칸 · 추가 행만 폰에 없다).
    for (const header of ["이름", "상태", "동작"]) {
      await expect(page.getByRole("columnheader", { name: header, exact: true })).toBeVisible();
    }
    for (const button of await page.locator("tbody button").filter({ visible: true }).all()) {
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    for (const header of ["값", "설명", "정렬"]) {
      await expect(page.getByRole("columnheader", { name: header, exact: true })).toBeHidden();
    }
    await expect(page.getByText(value, { exact: true })).toBeHidden();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});
