import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// 03-UI-SPEC: 쓰기 권한이 없는 계급에는 "이유 있는 비활성" 대신 "버튼 자체가
// 없음". 거래처·법인카드·사람 화면은 전부 canWrite로 막는데 코드표만 막지
// 않았다 — 독립 DOM 감사가 view만 허용한 계급으로 들어가 편집 가능한 입력
// 13개를 실측했다. 도메인이 거부하므로 데이터는 안전하지만, 사용자는 고칠 수
// 있다고 믿고 고쳤다가 실패 문구를 본다.
test("보기 권한만 있는 계급의 코드표 화면에는 편집 수단이 0개다", async ({ page }) => {
  const viewer = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });

  await setPermissionCell(SYSTEM_VIEWER, {
    roleId: DEFAULT_ROLE_ID,
    menu: "admin.code-tables",
    action: "view",
    allowed: true,
  });
  await setPermissionCell(SYSTEM_VIEWER, {
    roleId: DEFAULT_ROLE_ID,
    menu: "admin.code-tables",
    action: "write",
    allowed: false,
  });

  try {
    await page.goto("/login");
    await page.getByLabel("이메일").fill(viewer.email);
    await page.getByLabel("비밀번호").fill(viewer.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const response = await page.goto("/admin/code-tables");
    expect(response?.status()).toBe(200);

    // 목록은 보인다.
    await expect(page.getByRole("heading", { name: "코드표" })).toBeVisible();
    await expect(page.locator("table tbody tr").first()).toBeVisible();

    // 편집 수단은 하나도 없다 — 비활성이 아니라 부재다.
    await expect(page.locator("#main-content table input")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "코드 추가" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "비활성화" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "활성화" })).toHaveCount(0);

    // ?new=1을 직접 쳐도 폼이 열리지 않는다.
    await page.goto("/admin/code-tables?new=1");
    await expect(page.locator("#code-item-form")).toHaveCount(0);

    // 증빙 종류 표는 행마다 세율 편집 패널이 더 있다 — 그것도 쓰기 수단이다.
    await page.goto("/admin/code-tables?tableKey=evidence_type");
    await expect(page.locator("#main-content table input")).toHaveCount(0);
    await expect(page.locator("#main-content table select")).toHaveCount(0);
  } finally {
    await setPermissionCell(SYSTEM_VIEWER, {
      roleId: DEFAULT_ROLE_ID,
      menu: "admin.code-tables",
      action: "view",
      allowed: false,
    });
  }
});
