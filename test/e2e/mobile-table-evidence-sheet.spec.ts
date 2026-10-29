import { test, expect } from "@playwright/test";
import { runSeed } from "../../scripts/codex-design-review/seeds";
import { expectPhoneRows } from "./helpers/phone-rows";

// 07.1-18 게이트 반영(#326 review ③ · 플랜 :187) — D-7106 증빙 목록: 확인 필요(취소 표시) 줄의 사유는 접힌 줄 글자로 가고, 같은 사유가 탭이 여는 행 시트 `상태` 줄에 있다.
// 접힌 줄 탭 칸의 :active 면은 hover와 같은 면(`--surface-muted`, U-12)이다.

for (const width of [375, 320] as const) {
  test(`증빙 목록 D-7106 — 확인 필요 줄: 접힌 줄 글자 · 행 시트 상태 줄 · 눌림 면 (${width})`, async ({ browser, baseURL, page }) => {
    test.setTimeout(300_000);
    const seeded = await runSeed("evidence-intake-filled", browser, baseURL);
    await page.goto("/login");
    await page.getByLabel("이메일").fill(seeded.viewer.email);
    await page.getByLabel("비밀번호").fill(seeded.viewer.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/expenses/evidence");
    const table = page.locator("table[data-row-sheet]");
    await expect(table).toBeVisible();
    const shape = await expectPhoneRows(page, table, `증빙 목록 @${width}`, { minRows: 4 });
    // D-7106: 취소 표시가 붙은 줄의 사유 글자(`취소 표시 줄 · 원거래 확인`)는 말줄임에 잘리지 않고 접힌 줄에 있다.
    const reason = "취소 표시 줄 · 원거래 확인";
    expect(shape.foldedTexts.some((text) => text.includes(reason)), `접힌 줄 글자 ${JSON.stringify(shape.foldedTexts)}`).toBe(true);
    const tap = table.locator("td[role='button']").filter({ hasText: reason }).first();
    await expect(tap).toHaveAttribute("title", /취소 표시 줄 · 원거래 확인/);
    // 눌림 면 — 누르고 있는 동안 배경이 `--surface-muted`(hover와 같은 면, U-12)이고 놓으면 돌아온다.
    const muted = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.background = "var(--surface-muted)";
      document.body.append(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
    });
    const before = await tap.evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(before, "눌리기 전 면").not.toBe(muted);
    const box = await tap.boundingBox();
    if (!box) throw new Error("접힌 줄 탭 칸 상자 없음");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect.poll(() => tap.evaluate((node) => getComputedStyle(node).backgroundColor), { message: "눌린 면" }).toBe(muted);
    await page.mouse.up();
    // 탭하면 행 시트가 열리고 `상태` 줄에 확인 필요 낱말이 있다(접힌 줄 글자와 같은 정보가 시트에도 있다).
    const sheet = page.getByRole("dialog").filter({ has: page.getByText("상태", { exact: true }) }).first();
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText("확인 필요");
  });
}
