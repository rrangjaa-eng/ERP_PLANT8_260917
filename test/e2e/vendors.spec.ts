import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { insertRole, setRoleArchived } from "@/repositories/roles";
import { upsertVisibility } from "@/repositories/permissions";
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

    // 2026-09-21 스테이징 QA 수정: 등록 폼이 기본 진입에는 없다(§6-1) —
    // 목록 머리글의 「거래처 등록」이 그 폼을 연다.
    await expect(page.getByLabel("이름")).toHaveCount(0);
    await page.getByRole("link", { name: "거래처 등록" }).click();

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
    // 기획 PM(role-pm)의 칸을 켜면 같은 순간 다른 워커의 admin-nav.spec.ts
    // 「기획 PM은 /admin 404」가 깨진다(겹쳐 돌리면 재현) — 이 테스트만 쓰는
    // 임시 계급을 쓴다(permissions-grid.spec.ts와 같은 방식).
    const tempRoleId = `role-e2e-vendors-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: tempRoleId, name: `E2E 임시 계급 ${tempRoleId.slice(-12)}`, sortOrder: 99 });
    // 기획 PM은 시드에서 거래처 정보(vendor.value)를 볼 수 있다 — 임시 계급도 같게.
    await upsertVisibility(SYSTEM_VIEWER, { roleId: tempRoleId, infoItem: "vendor.value", visible: true });
    const pm = await createFixtureUser({ roleId: tempRoleId });
    try {
      await setPermissionCell(SYSTEM_VIEWER, {
        roleId: tempRoleId,
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
        roleId: tempRoleId,
        menu: "admin.vendors",
        action: "view",
        allowed: false,
      });
      const deniedResponse = await pmPage.goto("/admin/vendors");
      expect(deniedResponse?.status()).toBe(404);

      if (pmContext) await pmContext.close();
    } finally {
      await setRoleArchived(SYSTEM_VIEWER, tempRoleId, true);
    }
  });
});

// 03-VERIFICATION.md human_verification 3번 — 거래처 수정 왕복을 화면 경로로
// 고정한다. 코드표·법인카드는 master-edit.spec.ts가 같은 왕복을 이미 덮고
// 있는데 거래처만 없었다(재검증 3회차가 `editId` 0건으로 실측). M-5(빈 칸 =
// 「안 바꿈」)의 분기는 단위·통합에 있고, 여기서 증명하는 것은 그 분기까지
// 화면이 실제로 닿는다는 것이다.
//
// 마지막에 숨김 처리하는 이유: 계좌번호 있는 거래처가 기본 목록에 남으면
// mobile-admin-master-list-first.spec.ts의 375px 폭 단언(계좌 칸 때문에
// 481>375)이 깨진다. 같은 파일 위쪽 스펙이 쓰는 정리 방식과 같다.
test.describe("거래처 수정 왕복 (MAST-01 · M-5)", () => {
  test("「수정」 진입 → 이름 변경 반영 → 계좌번호 칸을 비워 저장해도 기존 번호 보존", async ({
    page,
  }) => {
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const stamp = Date.now();
    const before = `E2E수정전-${stamp}`;
    const after = `E2E수정후-${stamp}`;
    const accountNumber = "110-222-334455";

    await page.goto("/admin/vendors");
    await page.getByRole("link", { name: "거래처 등록" }).click();
    await page.getByLabel("이름").fill(before);
    await page.getByLabel("계좌 은행").fill("국민은행");
    await page.getByLabel("예금주").fill("홍길동");
    await page.getByLabel("계좌번호").fill(accountNumber);
    await page.getByRole("button", { name: "거래처 등록" }).click();
    await expect(page.getByText(before)).toBeVisible();

    // 「수정」으로 들어간다 — 등록 폼이 아니라 수정 폼이 열린다(버튼이
    // 「거래처 수정」이고, 계좌번호 칸 라벨이 「새 계좌번호」로 바뀐다).
    await page.locator("tr", { hasText: before }).getByRole("link", { name: "수정" }).click();
    const form = page.locator("#vendor-form");
    await expect(form.getByLabel("새 계좌번호")).toBeVisible();
    await expect(form.getByText(`현재 ****-**-4455`)).toBeVisible();

    // 이름만 바꾸고, 「새 계좌번호」는 비워 둔 채 저장한다.
    await form.getByLabel("이름").fill(after);
    await page.getByRole("button", { name: "거래처 수정" }).click();

    // 저장이 끝나면 수정 모드를 나간다(vendor-form.tsx의 onSuccess가
    // router.replace로 목록으로 돌아간다) — 그것을 먼저 확인하고 이동한다.
    // 기다리지 않고 바로 이동하면 이동이 일으킨 SELECT가 수정 UPDATE의
    // 커밋보다 먼저 읽혀 바뀌기 전 이름이 렌더된다(워커 2개가 erp_test
    // 하나를 공유할 때 전체 스위트에서 실제로 졌다).
    await expect(form.getByLabel("새 계좌번호")).toHaveCount(0);

    await page.goto("/admin/vendors");
    await expect(page.getByText(after)).toBeVisible();
    await expect(page.getByText(before)).toHaveCount(0);

    // 계좌번호는 그대로다 — 뒤 4자리도, 「번호 보기」가 푸는 평문도.
    const row = page.locator("tr", { hasText: after });
    await expect(row.getByText("****-**-4455")).toBeVisible();
    await row.getByRole("button", { name: "번호 보기" }).click();
    await expect(row.getByText(accountNumber)).toBeVisible();

    // 정리 — 계좌번호 있는 거래처를 기본 목록에 남기지 않는다.
    await row.getByRole("button", { name: "숨기기" }).click();
    await expect(page.getByText(after)).toHaveCount(0);
  });
});

// 260922-o2b 후속(/review + 독립 DOM 감사) — SYSTEM.md §2-4 「값이 없으면 —
// 하나. 빈칸을 두지 않는다」. account-number.tsx의 AccountNumberCell이
// masked가 빈 문자열("" — 계좌번호 미등록)일 때 빈 <span/>을 그려 빈칸으로
// 보였다.
test.describe("거래처 목록 — 계좌번호 없음 빈 칸 em dash (§2-4 후속)", () => {
  test("계좌번호 없이 등록한 거래처의 계좌 칸이 빈칸이 아니라 —를 보인다", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/admin/vendors");
    await page.getByRole("link", { name: "거래처 등록" }).click();

    const vendorName = `E2E계좌없음-${Date.now()}`;
    await page.getByLabel("이름").fill(vendorName);
    await page.getByRole("button", { name: "거래처 등록" }).click();
    await expect(page.getByText(vendorName)).toBeVisible();

    const row = page.locator("tr", { hasText: vendorName });
    const accountCell = row.locator("td").nth(3);
    await expect(accountCell).toHaveText("—");
    // 계좌번호가 없으므로 「번호 보기」 버튼도 렌더되지 않는다(해제할 값이 없다).
    await expect(row.getByRole("button", { name: "번호 보기" })).toHaveCount(0);

    // 정리 — 계좌번호 없는 거래처는 표를 넓히지 않지만, 목록을 늘리지 않는다.
    await row.getByRole("button", { name: "숨기기" }).click();
    await expect(page.getByText(vendorName)).toHaveCount(0);
  });
});
