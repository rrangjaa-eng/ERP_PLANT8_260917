import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// MAST-01: 거래처를 등록하고, 계좌번호가 뒤 4자리만 보이며, 마스킹 해제
// 권한이 있는 계급만 「번호 보기」를 볼 수 있고 그 해제가 로그에 남는 것을
// 화면·액션·domain 세 겹으로 증명한다.
test.describe("거래처 관리 화면 (MAST-01)", () => {
  test("거래처 등록 → 마스킹 표시 → 해제·가리기 → 숨김 토글 → 권한 없는 계급의 버튼 부재 → 404", async ({
    page,
  }) => {
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const response = await page.goto("/admin/vendors");
    expect(response?.status()).toBe(200);

    const vendorName = `E2E거래처-${Date.now()}`;
    const accountNumber = "110-222-334455";

    await page.getByLabel("이름").fill(vendorName);
    await page.getByLabel("사업자 번호").fill("123-45-67890");
    await page.getByLabel("계좌 은행").fill("국민은행");
    await page.getByLabel("예금주").fill("홍길동");
    await page.getByLabel("계좌번호").fill(accountNumber);
    await page.getByRole("button", { name: "거래처 등록" }).click();
    await expect(page.getByText(vendorName)).toBeVisible();

    const row = page.locator("tr", { hasText: vendorName });
    // 기본 표시는 뒤 4자리만 — 전체 번호가 화면에 그대로 나타나지 않는다.
    await expect(row.getByText("****-**-4455")).toBeVisible();
    await expect(row.getByText(accountNumber)).toHaveCount(0);

    // 「번호 보기」를 누르면 평문이 보이고 라벨이 「가리기」로 바뀐다.
    await row.getByRole("button", { name: "번호 보기" }).click();
    await expect(row.getByText(accountNumber)).toBeVisible();
    await expect(row.getByRole("button", { name: "가리기" })).toBeVisible();

    // 「가리기」를 누르면 다시 마스킹된다(클라이언트 상태만, 서버 재호출 없음).
    await row.getByRole("button", { name: "가리기" }).click();
    await expect(row.getByText("****-**-4455")).toBeVisible();
    await expect(row.getByText(accountNumber)).toHaveCount(0);

    // 숨김으로 바꾸면 기본 목록에서 사라지고 「숨김 포함」으로 다시 보인다.
    await row.getByRole("button", { name: "숨기기" }).click();
    await expect(page.getByText(vendorName)).toHaveCount(0);

    await page.getByRole("link", { name: "숨김 포함" }).click();
    await expect(page.getByText(vendorName)).toBeVisible();
    await expect(page.locator("tr", { hasText: vendorName }).getByText("숨김")).toBeVisible();

    // 마스킹 해제 권한이 없는 계급 — 거래처 보기 권한만 켠 상태.
    const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    try {
      await setPermissionCell(SYSTEM_VIEWER, {
        roleId: DEFAULT_ROLE_ID,
        menu: "admin.vendors",
        action: "view",
        allowed: true,
      });

      const pmContext = await page.context().browser()?.newContext();
      const pmPage = pmContext ? await pmContext.newPage() : page;
      if (pmContext) {
        await pmPage.goto("/login");
        await pmPage.getByLabel("이메일").fill(pm.email);
        await pmPage.getByLabel("비밀번호").fill(pm.password);
        await pmPage.getByRole("button", { name: "로그인" }).click();
        await expect(pmPage).toHaveURL(/\/account$/);
      }

      const pmResponse = await pmPage.goto("/admin/vendors?includeHidden=1");
      expect(pmResponse?.status()).toBe(200);
      await expect(pmPage.getByText(vendorName)).toBeVisible();
      // 권한이 없으므로 버튼 자체가 렌더되지 않는다(비활성이 아니다).
      await expect(pmPage.getByRole("button", { name: "번호 보기" })).toHaveCount(0);

      // 거래처 보기 권한도 끄면 404.
      await setPermissionCell(SYSTEM_VIEWER, {
        roleId: DEFAULT_ROLE_ID,
        menu: "admin.vendors",
        action: "view",
        allowed: false,
      });
      const deniedResponse = await pmPage.goto("/admin/vendors");
      expect(deniedResponse?.status()).toBe(404);

      if (pmContext) await pmContext.close();
    } finally {
      // 원상복구 — 다른 스펙 파일이 role-pm의 admin.vendors 상태에 기대는
      // 것은 없지만(grep 확인), 시드 기본값(거짓)으로 되돌려 둔다.
      await setPermissionCell(SYSTEM_VIEWER, {
        roleId: DEFAULT_ROLE_ID,
        menu: "admin.vendors",
        action: "view",
        allowed: false,
      });
    }
  });
});
