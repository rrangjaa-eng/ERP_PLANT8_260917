import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { createFixtureUser } from "./fixtures";
import { db } from "@/db/client";
import { settingsSimple } from "@/db/schema";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { FX_RECENT_RATE_USD } from "@/domain/settings/keys";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { findSimpleValue, upsertSimpleValue } from "@/repositories/settings";

// 04-52(G-04-4 · UAT 4) — 프로젝트 목록 오류 경계. 폰 스펙에 둔 이유: 이 테스트는 공용 설정 fx.recent_rate.USD를 잠깐 잘못된 값으로 바꾼다.
// desktop과는 mobile-375의 dependencies: ["desktop"]으로, 다른 폰 스펙과는 mobile-375 `workers: 1`로 겹치지 않는다.
test.describe("폰 375 프로젝트 목록 오류 경계 (G-04-4 · UAT 4)", () => {
  test("잘못된 USD 환율 설정 → 「프로젝트 목록 불러오기 실패」 · 「다시 시도」 → 값 되돌림 → 다시 시도 → 새로고침 없이 목록이 돌아온다", async ({ page }) => {
    const key = FX_RECENT_RATE_USD.key;
    const user = await createFixtureUser({ roleId: DEFAULT_ROLE_ID, withTeam: true });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    // 잘못된 값이 쓰이는 창은 goto 한 번과 오류 화면 단언까지다. 되돌리기는 두 번이다 — 「다시 시도」 전(본문)과 finally(멱등).
    const original = await findSimpleValue(SYSTEM_VIEWER, key);
    const restore = async () => {
      if (original) await upsertSimpleValue(SYSTEM_VIEWER, key, original.value, original.updatedBy);
      else await db.delete(settingsSimple).where(eq(settingsSimple.key, key));
    };
    try {
      await upsertSimpleValue(SYSTEM_VIEWER, key, 0, null);
      await page.goto("/projects?new=1");
      const errorMessage = page.getByText("프로젝트 목록 불러오기 실패", { exact: true });
      await expect(errorMessage).toBeVisible();
      const retry = page.getByRole("button", { name: "다시 시도" });
      await expect(retry).toBeVisible();
      await expect(page.getByRole("form", { name: "프로젝트 필터" })).toHaveCount(0);
      await restore();

      // 새로고침·이동이 없었다는 증거 — 문서에 단 표식이 「다시 시도」 뒤에도 남는다.
      await page.evaluate(() => {
        (window as unknown as { __g0404NoReload: boolean }).__g0404NoReload = true;
      });
      await retry.click();
      await expect(errorMessage).toHaveCount(0);
      await expect(page.getByRole("form", { name: "프로젝트 필터" })).toBeVisible();
      await expect(page).toHaveURL(/\/projects\?new=1$/);
      expect(await page.evaluate(() => (window as unknown as { __g0404NoReload?: boolean }).__g0404NoReload)).toBe(true);
    } finally {
      await restore();
    }

    const after = await findSimpleValue(SYSTEM_VIEWER, key);
    expect(after?.value).toEqual(original?.value);
    if (!original) expect(after).toBeNull();
  });
});
