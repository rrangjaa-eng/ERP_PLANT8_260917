import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// 2026-09-21 관리자 화면 design-review A-H4: 사람 목록의 「상세」가 스타일
// 규칙을 하나도 받지 못해 브라우저 기본 파랑(#0000EE) 14px 400으로 렌더됐다.
// 관리자 화면 20개 상태를 전수 조사했을 때 팔레트(`docs/design/tokens.css`)
// 밖의 색은 이것 하나뿐이었다 — §11 「새 색 0개」 게이트가 이 링크 때문에
// 깨진다. 같은 파일의 `.toggle`(3차 버튼: `--accent` 600 + 밑줄)이 정답
// 모양이고, `.detailLink`만 기본 규칙이 통째로 빠져 있었다.
//
// CSS 선언이 아니라 렌더된 계산값으로 잰다.
test.describe("사람 목록 「상세」가 §7-1 3차 버튼 모양이다 (A-H4)", () => {
  test("색이 팔레트의 --accent이고 크기·굵기가 3차 버튼 계약과 같다", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/admin/people");
    const detail = page.getByRole("link", { name: "상세" }).first();
    await expect(detail).toBeVisible();

    const style = await detail.evaluate((el) => {
      const computed = getComputedStyle(el);
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
      // --accent를 같은 문서에서 rgb로 환산해 비교한다(리터럴 기대값 금지).
      const probe = document.createElement("span");
      probe.style.color = accent;
      document.body.append(probe);
      const accentRgb = getComputedStyle(probe).color;
      probe.remove();
      return {
        color: computed.color,
        accentRgb,
        fontSize: computed.fontSize,
        fontWeight: computed.fontWeight,
        textDecorationLine: computed.textDecorationLine,
      };
    });

    expect(style.color).toBe(style.accentRgb);
    expect(style.fontSize).toBe("12px"); // --fs-sm
    expect(style.fontWeight).toBe("600"); // --fw-medium
    expect(style.textDecorationLine).toBe("underline");
  });
});
