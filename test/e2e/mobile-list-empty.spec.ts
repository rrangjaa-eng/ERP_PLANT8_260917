import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";

// design-review H-1: 폰에서 빈 목록의 「다음 한 수」 링크가 25px 높이다.
// ui/list-empty/ListEmpty.module.css의 .tertiary는 공유 Button의 .tertiary와
// 별개 규칙이라, 오늘 공유 Button에 넣은 폰 44×44 처리를 못 받았다.
// 빈 화면에서는 이 링크가 본문의 유일한 행동 요소라 미달이 특히 아프다.
test.describe("폰 375 빈 목록의 다음 한 수 (§3, design-review H-1)", () => {
  test("EMPTY 상태의 3차 링크가 44×44 이상이다", async ({ page }) => {
    const user = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    // 이 계급이 볼 수 있고 Phase 3 시점에 비어 있는 목록 화면들.
    for (const path of ["/projects", "/expenses", "/cards", "/approvals"]) {
      await page.goto(path);
      const link = page.locator("a").filter({ hasText: /보기|올리기|만들기|등록/ }).first();
      const count = await link.count();
      if (count === 0) continue; // EMPTY 문구만 있고 행동이 없는 화면은 건너뛴다

      const box = await link.boundingBox();
      expect(box, `${path}: 링크 상자를 잴 수 없다`).not.toBeNull();
      expect(box!.height, `${path}: 세로 터치 목표`).toBeGreaterThanOrEqual(44);
      expect(box!.width, `${path}: 가로 터치 목표`).toBeGreaterThanOrEqual(44);
    }
  });
});
