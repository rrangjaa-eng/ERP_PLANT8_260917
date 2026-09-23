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
    // /projects는 Phase 4부터 실제 목록이라 전체 스위트에서는 desktop 스펙이 만든
    // 프로젝트가 보여 EMPTY가 아니다 — 그때 페이지 전체의 첫 매치는 필터 줄의
    // 「프로젝트 등록」이다. 이 스펙의 대상은 EMPTY 행(ui/list-empty — 「…없습니다」
    // + 다음 한 수)뿐이라 그 행으로 범위를 좁힌다.
    let measured = 0;
    for (const path of ["/projects", "/expenses", "/cards", "/approvals"]) {
      await page.goto(path);
      const emptyRow = page.locator("p").filter({ hasText: /없습니다/ });
      const link = emptyRow.locator("a").filter({ hasText: /보기|올리기|만들기|등록/ }).first();
      const count = await link.count();
      // 목록에 행이 있어 EMPTY가 아니거나, EMPTY 문구만 있고 행동이 없는 화면은 건너뛴다.
      if (count === 0) continue;

      // /projects는 loading.tsx(Suspense) 경계라 page.goto가 끝난 시점에 본문이 아직
      // 숨은 스트리밍 조각(<div hidden id="S:0">) 안에 있을 수 있다 — boundingBox()는
      // 기다리지 않고 null을 돌려주므로 드러날 때까지 먼저 기다린다.
      await expect(link).toBeVisible();
      const box = await link.boundingBox();
      expect(box, `${path}: 링크 상자를 잴 수 없다`).not.toBeNull();
      expect(box!.height, `${path}: 세로 터치 목표`).toBeGreaterThanOrEqual(44);
      expect(box!.width, `${path}: 가로 터치 목표`).toBeGreaterThanOrEqual(44);
      measured++;
    }
    // 건너뛰기만 하고 아무것도 재지 않은 채 초록이 되지 않게 한다.
    expect(measured, "EMPTY 행의 다음 한 수를 하나도 재지 못했다").toBeGreaterThan(0);
  });
});
