import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";

// ADMN-12: 삭제 → 보관함 → 복원 end-to-end와 권한 없는 계급의 404.
test.describe("보관함 화면 (ADMN-12)", () => {
  test("코드표 삭제(두 단계) → 보관함에 보임 → 복원 → 빈 보관함 → 권한 없는 계급 404", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: "role-sysadmin" });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    // 코드표 항목 하나를 등록한다. 이름도 값과 함께 매 실행 유일하게 만든다
    // — 로컬 DB가 이전 실행의 데이터를 남길 수 있어 이름 중복으로 인한
    // strict mode 충돌을 피한다.
    const unique = Date.now();
    const codeValue = `e2e-archive-${unique}`;
    const codeLabel = `보관함 E2E ${unique}`;
    await page.goto("/admin/code-tables");
    await page.getByLabel("값").fill(codeValue);
    await page.getByLabel("이름").fill(codeLabel);
    await page.getByRole("button", { name: "코드 추가" }).click();
    await expect(page.getByText(codeValue)).toBeVisible();

    // 삭제 — 두 단계 제출. 확인 문구에 보관함·복원 문구가 보인다.
    const row = page.locator("tr", { hasText: codeValue });
    await row.getByRole("button", { name: "삭제" }).click();
    await expect(page.getByText(/보관함으로 이동합니다 · 관리자가 복원할 수 있습니다/)).toBeVisible();
    await row.getByRole("button", { name: "삭제" }).click();

    // 보관 직후 그 행에 「보관됨」 표시가 남는다 — 이 계급(시스템 관리자)은
    // admin.archive 보기 권한도 있어 스코프가 보관된 행도 함께 돌려준다
    // (03-01의 scopeFor 계약: includeArchived는 보관함 보기 권한 판정
    // 결과다). 완전히 사라지는 것은 아니고, 동작 버튼(삭제·활성화)이
    // 없어진다.
    await expect(row.getByText("보관됨")).toBeVisible();
    await expect(row.getByRole("button", { name: "삭제" })).toHaveCount(0);

    // 보관함 화면에 그 항목이 보인다.
    const archiveResponse = await page.goto("/admin/archive");
    expect(archiveResponse?.status()).toBe(200);
    const archiveRow = page.locator("tr", { hasText: codeLabel });
    await expect(archiveRow).toBeVisible();

    // 복원 — 확인 없이 즉시 실행하고 토스트가 나온다. 다른 세션이 남긴
    // 보관 항목과 섞이지 않게 이 행으로 범위를 좁힌다.
    await archiveRow.getByRole("button", { name: "복원" }).click();
    await expect(page.getByText(`복원 · ${codeLabel} 복원됨`)).toBeVisible();

    // 코드표 목록에서 「보관됨」 표시가 사라지고 동작 버튼이 되돌아온다.
    await page.goto("/admin/code-tables");
    await expect(page.getByText(codeValue)).toBeVisible();
    const restoredRow = page.locator("tr", { hasText: codeValue });
    await expect(restoredRow.getByText("보관됨")).toHaveCount(0);
    await expect(restoredRow.getByRole("button", { name: "삭제" })).toBeVisible();

    // 보관함이 비면 메시지만 보이고 버튼이 없다(다음 한 수 없음) — ListEmpty가
    // 렌더한 한 줄(<p>) 안에 링크·버튼이 전혀 없는지 그 요소로 범위를
    // 좁혀 확인한다(상단 바 등 화면의 다른 링크와 섞이지 않게).
    await page.goto("/admin/archive");
    const emptyRow = page.getByText("보관함이 비어 있습니다").locator("..");
    await expect(emptyRow).toBeVisible();
    await expect(emptyRow.getByRole("button")).toHaveCount(0);
    await expect(emptyRow.getByRole("link")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "복원" })).toHaveCount(0);

    // 권한 없는 계급(기본 계급)에는 보관함 화면이 404다.
    const pm = await createFixtureUser({ roleId: "role-pm" });
    const pmContext = await page.context().browser()?.newContext();
    const pmPage = pmContext ? await pmContext.newPage() : page;
    if (pmContext) {
      await pmPage.goto("/login");
      await pmPage.getByLabel("이메일").fill(pm.email);
      await pmPage.getByLabel("비밀번호").fill(pm.password);
      await pmPage.getByRole("button", { name: "로그인" }).click();
      await expect(pmPage).toHaveURL(/\/account$/);
    }
    const pmResponse = await pmPage.goto("/admin/archive");
    expect(pmResponse?.status()).toBe(404);
    if (pmContext) await pmContext.close();
  });
});
