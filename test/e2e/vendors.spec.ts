import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { insertRole, setRoleArchived } from "@/repositories/roles";
import { upsertVisibility } from "@/repositories/permissions";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import {
  adjacentActionGaps,
  expectGapsAtLeastToken,
  expectNoRowOverflow,
  loginAsSysadmin,
  textLineCount,
  tokenNumber,
} from "./row-actions-helpers";
import { insertVendor, setVendorHidden } from "@/repositories/vendors";
import { checkPrinciples } from "./principles-check";
import { isStrict } from "./design-principles";

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
    // 04.6-04(UQ-8 B): 등록 성공 뒤 패널은 열린 채 결과 한 줄을 보인다 — Esc로 닫고 목록을 이어 본다.
    await expect(page.locator('dialog[data-ui="side-panel"]').getByRole("status")).toHaveText("거래처 등록됨");
    await page.keyboard.press("Escape");
    await expect(page.locator('dialog[data-ui="side-panel"]')).toHaveCount(0);
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
    // 04.6-04(UQ-8 B): 등록 성공 뒤 패널은 열린 채 결과 한 줄을 보인다 — Esc로 닫고 목록을 이어 본다.
    await expect(page.locator('dialog[data-ui="side-panel"]').getByRole("status")).toHaveText("거래처 등록됨");
    await page.keyboard.press("Escape");
    await expect(page.locator('dialog[data-ui="side-panel"]')).toHaveCount(0);
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
    // 04.6-04(UQ-8 B): 등록 성공 뒤 패널은 열린 채 결과 한 줄을 보인다 — Esc로 닫고 목록을 이어 본다.
    await expect(page.locator('dialog[data-ui="side-panel"]').getByRole("status")).toHaveText("거래처 등록됨");
    await page.keyboard.press("Escape");
    await expect(page.locator('dialog[data-ui="side-panel"]')).toHaveCount(0);
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

// 260930-f3l /design-review FINDING-001: 거래처 표 행 동작 「수정 · 숨기기 · 삭제」 사이 가로 간격이 0px라 한 낱말처럼 읽혔다.
// 공용 `RowActions`(04.6-05 · ui/row-actions)가 사이 --s-4, 위험 「삭제」는 맨 끝 앞 --s-8로 그린다(SYSTEM §6-1). 700은 PC 폭의 가장 좁은 값(D3).
test.describe("거래처 행 동작 간격 --s-4 (260930-f3l FINDING-001)", () => {
  async function seed(): Promise<{ target: string; cleanup: () => Promise<void> }> {
    const stamp = randomUUID().slice(0, 8);
    // 다른 열이 긴 행이 있어야 동작 칸이 눌린다 — 앞 테스트가 남긴 데이터에 기대지 않는다.
    const long = await insertVendor(SYSTEM_VIEWER, { name: `${"가".repeat(60)}${stamp}`, normalizedName: `긴행-${randomUUID()}` });
    const target = await insertVendor(SYSTEM_VIEWER, { name: `간격대상-${stamp}`, normalizedName: `간격대상-${randomUUID()}` });
    return {
      target: target.name,
      cleanup: async () => {
        await setVendorHidden(SYSTEM_VIEWER, long.id, true);
        await setVendorHidden(SYSTEM_VIEWER, target.id, true);
      },
    };
  }

  for (const width of [1280, 768, 700]) {
    test(`${width}: 수정 · 숨기기 · 삭제 사이가 한 줄에서 --s-4 이상이고 표가 넘치지 않는다`, async ({ page }) => {
      const { target, cleanup } = await seed();
      try {
        await page.setViewportSize({ width, height: 800 });
        await loginAsSysadmin(page);
        await page.goto("/admin/vendors");
        const row = page.locator("tr", { hasText: target });
        const edit = row.getByRole("link", { name: "수정" });
        const hide = row.getByRole("button", { name: "숨기기" });
        const remove = row.getByRole("button", { name: "삭제" });
        await expectNoRowOverflow(page, row, `${width}px 일반 상태`);
        const gaps = await expectGapsAtLeastToken(page, [edit, hide, remove], `${width}px`);
        expect(gaps.every((item) => item.horizontal), `${width}px 한 줄`).toBe(true);
        expect(await textLineCount(edit), "「수정」 글자 줄 수").toBe(1);
      } finally {
        await cleanup();
      }
    });
  }

  // 04.6-11 · M13 · D21: 간격은 글자 박스 기준 — 「수정」↔「숨기기」 = --s-4, 「숨기기」↔「삭제」 ≥ --s-8(위험 행동 떨어뜨림).
  // PC 폭에서는 RowAction에 좌우 패딩이 없어 요소 상자 = 글자 상자라 기존 도우미(요소 상자)로 잰다.
  for (const width of [1280, 768, 700]) {
    test(`${width}: 행 행동 간격이 글자 박스 기준 --s-4 · 삭제 앞 --s-8이고 세 행동의 모양이 같다 (D21 · M13)`, async ({ page }) => {
      const { target, cleanup } = await seed();
      try {
        await page.setViewportSize({ width, height: 800 });
        await loginAsSysadmin(page);
        await page.goto("/admin/vendors");
        const row = page.locator("tr", { hasText: target });
        const edit = row.getByRole("link", { name: "수정" });
        const hide = row.getByRole("button", { name: "숨기기" });
        const remove = row.getByRole("button", { name: "삭제" });
        const s4 = await tokenNumber(page, "--s-4");
        const s8 = await tokenNumber(page, "--s-8");
        const gaps = await adjacentActionGaps([edit, hide, remove]);
        expect(gaps.every((item) => item.horizontal), `${width}px 세 행동 한 줄`).toBe(true);
        expect(Math.abs(gaps[0]!.gap - s4), `${width}px 수정↔숨기기 ${gaps[0]!.gap}px`).toBeLessThanOrEqual(0.5);
        expect(gaps[1]!.gap, `${width}px 숨기기↔삭제 ${gaps[1]!.gap}px`).toBeGreaterThanOrEqual(s8 - 0.5);

        // 글자 박스 전제 — 요소 상자 너비와 안 글자 Range 너비의 차 ≤ 0.5.
        for (const action of [edit, hide, remove]) {
          const delta = await action.evaluate((element) => {
            const range = document.createRange();
            range.selectNodeContents(element);
            const rects = Array.from(range.getClientRects());
            const glyph = Math.max(...rects.map((rect) => rect.right)) - Math.min(...rects.map((rect) => rect.left));
            return element.getBoundingClientRect().width - glyph;
          });
          expect(Math.abs(delta), `${width}px 요소 상자 − 글자 상자 ${delta}px`).toBeLessThanOrEqual(0.5);
        }

        // 세 행동의 글자 크기 · 굵기 · 밑줄이 같고, 위험 색은 「삭제」 하나뿐이다.
        const looks = await Promise.all(
          [edit, hide, remove].map((action) =>
            action.evaluate((element) => {
              const style = getComputedStyle(element);
              return { size: style.fontSize, weight: style.fontWeight, line: style.textDecorationLine, color: style.color };
            }),
          ),
        );
        expect(looks[1]!.size).toBe(looks[0]!.size);
        expect(looks[2]!.size).toBe(looks[0]!.size);
        expect(looks[1]!.weight).toBe(looks[0]!.weight);
        expect(looks[2]!.weight).toBe(looks[0]!.weight);
        expect(looks[1]!.line).toBe(looks[0]!.line);
        expect(looks[2]!.line).toBe(looks[0]!.line);
        expect(looks[1]!.color, "수정 · 숨기기 같은 색").toBe(looks[0]!.color);
        expect(looks[2]!.color, "위험 색은 삭제 하나뿐").not.toBe(looks[0]!.color);
      } finally {
        await cleanup();
      }
    });
  }

  // D21: 폰 390의 누르는 영역(요소 상자) 높이 ≥ 44 — PC 글자 박스 기준 간격과 따로 잰다.
  test("390: 세 행동의 누르는 영역 높이가 44 이상이다 (D21)", async ({ page }) => {
    const { target, cleanup } = await seed();
    try {
      await page.setViewportSize({ width: 390, height: 800 });
      await loginAsSysadmin(page);
      await page.goto("/admin/vendors");
      const row = page.locator("tr", { hasText: target });
      for (const action of [
        row.getByRole("link", { name: "수정" }),
        row.getByRole("button", { name: "숨기기" }),
        row.getByRole("button", { name: "삭제" }),
      ]) {
        const box = await action.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
    } finally {
      await cleanup();
    }
  });

  for (const width of [700, 768, 1024, 1280]) {
    test(`${width}: 「삭제」를 누른 뒤에도 페이지와 표가 가로로 넘치지 않는다`, async ({ page }) => {
      const { target, cleanup } = await seed();
      try {
        await page.setViewportSize({ width, height: 800 });
        await loginAsSysadmin(page);
        await page.goto("/admin/vendors");
        const row = page.locator("tr", { hasText: target });
        await row.getByRole("button", { name: "삭제" }).click();
        await expect(row.getByRole("button", { name: "취소" })).toBeVisible();
        await expectNoRowOverflow(page, row, `${width}px 확인 상태`);
      } finally {
        await cleanup();
      }
    });
  }
});

// 04.6-11 · R1: 필터 토글은 next/link scroll={false}라 스크롤이 유지되고, 서버 표(StaticTable)라 목록 응답이 200이다.
test.describe("거래처 필터 토글 · 서버 표 (04.6-11 R1)", () => {
  test("「숨김 포함」을 눌러도 스크롤이 유지되고 목록 응답이 200이다", async ({ page }) => {
    const stamp = randomUUID().slice(0, 8);
    const rows = [];
    for (let index = 0; index < 30; index += 1) {
      rows.push(await insertVendor(SYSTEM_VIEWER, { name: `스크롤-${stamp}-${index}`, normalizedName: `스크롤-${randomUUID()}` }));
    }
    try {
      await page.setViewportSize({ width: 1280, height: 400 });
      await loginAsSysadmin(page);
      const response = await page.goto("/admin/vendors");
      expect(response?.status()).toBe(200);
      // 링크가 보이는 위치에서 잰다 — 화면 밖 링크는 Playwright가 먼저 스크롤해 측정이 깨진다(04.6-04 E2E 요령).
      await page.evaluate(() => window.scrollTo(0, 40));
      const before = await page.evaluate(() => window.scrollY);
      expect(before).toBeGreaterThan(0);
      await page.getByRole("link", { name: "숨김 포함" }).click();
      await expect(page.getByRole("link", { name: "숨김 제외" })).toBeVisible();
      expect(await page.evaluate(() => window.scrollY)).toBe(before);
    } finally {
      for (const vendor of rows) await setVendorHidden(SYSTEM_VIEWER, vendor.id, true);
    }
  });
});

// 04.6-11 · R11 · 공통 §10: 옮긴 화면의 원칙 막는 모드 — 목록 · 등록 패널 · 수정 패널 모두 경고 0.
test.describe("거래처 화면 사용성 원칙 (04.6-11 R11)", () => {
  test("화면 사용성 원칙(막는 모드) — 거래처", async ({ page }) => {
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: `원칙점검-${randomUUID().slice(0, 8)}`, normalizedName: `원칙점검-${randomUUID()}` });
    try {
      await loginAsSysadmin(page);
      await checkPrinciples(page, ["/admin/vendors", "/admin/vendors?new=1", `/admin/vendors?editId=${vendor.id}`], {
        strict: isStrict(process.env.DESIGN_PRINCIPLES_STRICT),
      });
    } finally {
      await setVendorHidden(SYSTEM_VIEWER, vendor.id, true);
    }
  });
});

// 04.6-07 F1 (DOM 감사): P2 열이 있는 표의 PC 폭에서 보이는 마지막 행 칸 아래 선은 0이다(SYSTEM §2-4 「마지막 행 선 없음」).
// 숨긴 접힌 줄(tr.collapsedRow)이 마지막 줄로 잡히면 주 행 선이 1px로 남는다.
test.describe("거래처 표 마지막 행 선 없음 (04.6-07 F1)", () => {
  test("1280: 보이는 마지막 행의 모든 칸 아래 선이 0이고 그 앞 행은 1px이다", async ({ page }) => {
    const stamp = randomUUID().slice(0, 8);
    const a = await insertVendor(SYSTEM_VIEWER, { name: `끝선A-${stamp}`, normalizedName: `끝선A-${randomUUID()}` });
    const b = await insertVendor(SYSTEM_VIEWER, { name: `끝선B-${stamp}`, normalizedName: `끝선B-${randomUUID()}` });
    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await loginAsSysadmin(page);
      await page.goto("/admin/vendors");
      const widths = await page.locator("table tbody tr").evaluateAll((rows) =>
        rows
          .filter((tr) => getComputedStyle(tr).display !== "none")
          .map((tr) => [...tr.querySelectorAll("td, th")].map((cell) => getComputedStyle(cell).borderBottomWidth)),
      );
      expect(widths.length).toBeGreaterThanOrEqual(2);
      const last = widths[widths.length - 1]!;
      const prev = widths[widths.length - 2]!;
      expect(last.every((w) => w === "0px"), `마지막 행 칸 아래 선 ${last.join(",")}`).toBe(true);
      expect(prev.every((w) => w === "1px"), `앞 행 칸 아래 선 ${prev.join(",")}`).toBe(true);
    } finally {
      await setVendorHidden(SYSTEM_VIEWER, a.id, true);
      await setVendorHidden(SYSTEM_VIEWER, b.id, true);
    }
  });
});
