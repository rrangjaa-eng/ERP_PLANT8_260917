import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createFixtureUser, uniqueBusinessNo } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { insertRole, setRoleArchived } from "@/repositories/roles";
import { upsertVisibility } from "@/repositories/permissions";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { planAccountNumberUpdate } from "@/domain/vendors";
import {
  adjacentActionGaps,
  expectGapsAtLeastToken,
  expectNoRowOverflow,
  loginAsSysadmin,
  textLineCount,
  tokenNumber,
} from "./row-actions-helpers";
import { findVendorsByNormalizedName, insertVendor, setVendorArchived, setVendorHidden } from "@/repositories/vendors";
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
    const businessNo = uniqueBusinessNo();
    await page.getByLabel("사업자 번호").fill(businessNo);
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
    // 07-20 C-35: 계좌번호는 하이픈 · 공백을 지운 숫자로 저장한다.
    await expect(row.getByText(accountNumber.replaceAll("-", ""))).toBeVisible();
    await expect(row.getByRole("button", { name: "가리기" })).toBeVisible();

    // 「가리기」를 누르면 다시 마스킹된다(클라이언트 상태만, 서버 재호출 없음).
    await row.getByRole("button", { name: "가리기" }).click();
    await expect(row.getByText("****-**-4455")).toBeVisible();
    await expect(row.getByText(accountNumber.replaceAll("-", ""))).toHaveCount(0);

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
    await page.getByRole("button", { name: "거래처 저장" }).click();

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
    // 07-20 C-35: 계좌번호는 하이픈 · 공백을 지운 숫자로 저장한다.
    await expect(row.getByText(accountNumber.replaceAll("-", ""))).toBeVisible();

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

// 261006-biv — 거래처 갈래(D-3 · D-4 · D-5): 등록 기본 협력사 · 수정 저장값 · 목록 「구분」 열 · kind 걸러보기 · 링크가 kind를 지킴.
test.describe("거래처 구분 (261006-biv)", () => {
  test("구분 — 등록 기본 협력사 · 수정 저장값 · 목록 구분 열 · kind 걸러보기", async ({ page }) => {
    const tag = `구분-${randomUUID().slice(0, 8)}`;
    const make = (suffix: string, kind: "client" | "supplier" | "both") =>
      insertVendor(SYSTEM_VIEWER, { name: `${tag}-${suffix}`, normalizedName: `${tag}-${suffix}-${randomUUID()}`, kind });
    const client = await make("클라", "client");
    const supplier = await make("협력", "supplier");
    const both = await make("둘다", "both");
    const created: string[] = [];
    const rowOf = (name: string) => page.locator("tbody tr", { hasText: name }).first();
    const kindNav = page.getByRole("navigation", { name: "갈래" });
    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await loginAsSysadmin(page);
      await page.goto("/admin/vendors");

      await expect(page.getByRole("columnheader", { name: "갈래" })).toBeVisible();
      await expect(rowOf(client.name).getByRole("cell", { name: "클라이언트", exact: true })).toBeVisible();
      await expect(rowOf(supplier.name).getByRole("cell", { name: "협력사", exact: true })).toBeVisible();
      await expect(rowOf(both.name).getByRole("cell", { name: "둘 다", exact: true })).toBeVisible();

      await kindNav.getByRole("link", { name: "클라이언트" }).click();
      await expect(page).toHaveURL(/kind=client/);
      await expect(kindNav.getByRole("link", { name: "클라이언트" })).toHaveAttribute("aria-current", "page");
      await expect(rowOf(client.name)).toBeVisible();
      await expect(rowOf(both.name)).toBeVisible();
      await expect(page.locator("tbody tr", { hasText: supplier.name })).toHaveCount(0);
      // kind=client 상태에서 「숨김 포함」 · 「수정」 · 「거래처 등록」이 kind를 지킨다.
      await expect(page.getByRole("link", { name: "숨김 포함" })).toHaveAttribute("href", /kind=client/);
      await expect(rowOf(client.name).getByRole("link", { name: "수정" })).toHaveAttribute("href", /kind=client/);
      await expect(page.getByRole("link", { name: "거래처 등록" })).toHaveAttribute("href", /kind=client/);

      await kindNav.getByRole("link", { name: "협력사" }).click();
      await expect(page).toHaveURL(/kind=supplier/);
      await expect(rowOf(supplier.name)).toBeVisible();
      await expect(rowOf(both.name)).toBeVisible();
      await expect(page.locator("tbody tr", { hasText: client.name })).toHaveCount(0);

      await kindNav.getByRole("link", { name: "전체" }).click();
      await expect(page).not.toHaveURL(/kind=/);
      for (const vendor of [client, supplier, both]) await expect(rowOf(vendor.name)).toBeVisible();

      // 등록 — 「구분」은 협력사로 열리고, 이름만 넣고 등록하면 새 행 구분이 「협력사」다.
      await page.getByRole("link", { name: "거래처 등록" }).click();
      const panel = page.locator('dialog[data-ui="side-panel"]');
      await expect(panel.getByLabel("갈래")).toHaveValue("supplier");
      const newName = `${tag}-새거래처`;
      created.push(newName);
      await panel.getByLabel("이름").fill(newName);
      await panel.getByRole("button", { name: "거래처 등록" }).click();
      await expect(panel.getByRole("status")).toHaveText("거래처 등록됨");
      await page.keyboard.press("Escape");
      await expect(panel).toHaveCount(0);
      await expect(rowOf(newName).getByRole("cell", { name: "협력사", exact: true })).toBeVisible();

      // 수정 — 저장값으로 열리고, 「둘 다」로 바꿔 저장하면 그 행 구분이 「둘 다」다.
      await rowOf(client.name).getByRole("link", { name: "수정" }).click();
      const form = page.locator("#vendor-form");
      await expect(form.getByLabel("갈래")).toHaveValue("client");
      await form.getByLabel("갈래").selectOption("both");
      await page.getByRole("button", { name: "거래처 저장" }).click();
      await expect(form).toHaveCount(0);
      await page.goto("/admin/vendors");
      await expect(rowOf(client.name).getByRole("cell", { name: "둘 다", exact: true })).toBeVisible();
    } finally {
      for (const vendor of [client, supplier, both]) await setVendorHidden(SYSTEM_VIEWER, vendor.id, true);
      for (const name of created) {
        for (const vendor of await findVendorsByNormalizedName(SYSTEM_VIEWER, name.normalize("NFC").toLowerCase())) await setVendorHidden(SYSTEM_VIEWER, vendor.id, true);
      }
    }
  });

  test("?new=1&kind=client로 열면 등록 「구분」이 클라이언트다(프로젝트 화면 「클라이언트 등록」)", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/vendors?new=1&kind=client");
    await expect(page.locator('dialog[data-ui="side-panel"]').getByLabel("갈래")).toHaveValue("client");
  });

  test("검증 숫자가 틀린 사업자번호는 칸 아래 문구로 막히고 저장되지 않는다", async ({ page }) => {
    await loginAsSysadmin(page);
    const name = `E2E틀린번호-${randomUUID()}`;
    await page.goto("/admin/vendors?new=1");
    const dialog = page.locator('dialog[data-ui="side-panel"]');
    await dialog.getByLabel("이름").fill(name);
    await dialog.getByLabel("사업자 번호").fill("214-86-10231");
    await dialog.getByRole("button", { name: "거래처 등록" }).click();
    await expect(dialog.getByText("사업자 번호 확인 · 다시 입력")).toBeVisible();
    await expect(dialog.getByLabel("사업자 번호")).toHaveValue("214-86-10231");
    expect(await findVendorsByNormalizedName(SYSTEM_VIEWER, name.toLowerCase())).toHaveLength(0);
  });

  test("같은 사업자번호 등록은 칸 아래 문구와 요약으로 막히고, 다른 갈래면 「구분 더하기」로 그 거래처 수정 패널로 넘어간다", async ({ page }) => {
    await loginAsSysadmin(page);
    const businessNo = uniqueBusinessNo();
    const existingName = `E2E중복원본-${randomUUID()}`;
    const existing = await insertVendor(SYSTEM_VIEWER, { name: existingName, normalizedName: existingName.toLowerCase(), businessNo, kind: "client" });
    try {
      await page.goto("/admin/vendors?new=1");
      const dialog = page.locator('dialog[data-ui="side-panel"]');
      await dialog.getByLabel("이름").fill(`E2E중복신규-${randomUUID()}`);
      await dialog.getByLabel("갈래").selectOption("supplier");
      await dialog.getByLabel("사업자 번호").fill(businessNo.replaceAll("-", ""));
      await dialog.getByRole("button", { name: "거래처 등록" }).click();

      // 다음 한 수는 오류 줄 안에 붙는다(「원인 · 다음 행동」 — field-definition-form 「보관함에서 복원」과 같은 모양).
      await expect(dialog.locator("#businessNo-error")).toHaveText(`이미 등록됨 · ${existingName}(클라이언트) · 갈래 더하기`);
      await expect(dialog.locator("#businessNo-error").getByRole("button", { name: "갈래 더하기" })).toBeVisible();
      await expect(dialog.getByLabel("사업자 번호")).toHaveAttribute("aria-describedby", "businessNo-error");
      await expect(dialog.locator("#vendor-form-reason")).toContainText("사업자 번호 1칸");
      await expect(dialog.getByLabel("사업자 번호")).toHaveValue(businessNo.replaceAll("-", ""));

      await dialog.getByRole("button", { name: "갈래 더하기" }).click();
      await expect(page).toHaveURL(new RegExp(`editId=${existing.id}`));
      await expect(page.locator("#vendor-form").getByLabel("갈래")).toHaveValue("both");
    } finally {
      await setVendorHidden(SYSTEM_VIEWER, existing.id, true);
    }
  });
  test("「구분 더하기」가 실패하면(그 사이 보관됨) 칸 아래 기존 오류 자리에 서버 오류 문구를 보인다", async ({ page }) => {
    await loginAsSysadmin(page);
    const businessNo = uniqueBusinessNo();
    const existingName = `E2E구분실패-${randomUUID()}`;
    const existing = await insertVendor(SYSTEM_VIEWER, { name: existingName, normalizedName: existingName.toLowerCase(), businessNo, kind: "client" });
    try {
      await page.goto("/admin/vendors?new=1");
      const dialog = page.locator('dialog[data-ui="side-panel"]');
      await dialog.getByLabel("이름").fill(`E2E구분실패신규-${randomUUID()}`);
      await dialog.getByLabel("갈래").selectOption("supplier");
      await dialog.getByLabel("사업자 번호").fill(businessNo);
      await dialog.getByRole("button", { name: "거래처 등록" }).click();
      await expect(dialog.getByRole("button", { name: "갈래 더하기" })).toBeVisible();

      await setVendorArchived(SYSTEM_VIEWER, existing.id, true);
      await dialog.getByRole("button", { name: "갈래 더하기" }).click();
      await expect(dialog.locator("#businessNo-error")).toHaveText("보관됐거나 존재하지 않는 거래처는 수정할 수 없음");
      // 다시 눌러도 같은 실패라 「구분 더하기」를 치운다(할 수 없는 선택지는 숨김 — 보관함 복원 거부 행과 같은 처리).
      await expect(dialog.getByRole("button", { name: "갈래 더하기" })).toHaveCount(0);
      await expect(page).not.toHaveURL(/editId=/);
    } finally {
      await setVendorHidden(SYSTEM_VIEWER, existing.id, true);
    }
  });
  // Regression: /qa ISSUE-001 — 「구분 더하기」 실패 문구가 다음 제출 뒤에도 사업자 번호 칸에 남았다(등록이 성공해도 칸이 오류로 보임).
  // Found by /qa on 2026-10-06 · Report: /mnt/project-files/notes/vendor-kind/178-qa.md
  test("「구분 더하기」가 실패한 뒤 번호를 고쳐 다시 등록하면 칸 오류가 남지 않는다", async ({ page }) => {
    await loginAsSysadmin(page);
    const businessNo = uniqueBusinessNo();
    const existingName = `E2E구분실패재등록-${randomUUID()}`;
    const existing = await insertVendor(SYSTEM_VIEWER, { name: existingName, normalizedName: existingName.toLowerCase(), businessNo, kind: "client" });
    const newName = `E2E구분실패재등록신규-${randomUUID()}`;
    try {
      await page.goto("/admin/vendors?new=1");
      const dialog = page.locator('dialog[data-ui="side-panel"]');
      await dialog.getByLabel("이름").fill(newName);
      await dialog.getByLabel("갈래").selectOption("supplier");
      await dialog.getByLabel("사업자 번호").fill(businessNo);
      await dialog.getByRole("button", { name: "거래처 등록" }).click();
      await expect(dialog.getByRole("button", { name: "갈래 더하기" })).toBeVisible();
      await setVendorArchived(SYSTEM_VIEWER, existing.id, true);
      await dialog.getByRole("button", { name: "갈래 더하기" }).click();
      await expect(dialog.locator("#businessNo-error")).toHaveText("보관됐거나 존재하지 않는 거래처는 수정할 수 없음");

      await dialog.getByLabel("사업자 번호").fill(uniqueBusinessNo());
      await dialog.getByRole("button", { name: "거래처 등록" }).click();
      await expect(dialog.getByRole("status")).toContainText("거래처 등록됨");
      await expect(dialog.locator("#businessNo-error")).toHaveCount(0);
      await expect(dialog.getByLabel("사업자 번호")).not.toHaveAttribute("aria-invalid", "true");
    } finally {
      await setVendorHidden(SYSTEM_VIEWER, existing.id, true);
      for (const row of await findVendorsByNormalizedName(SYSTEM_VIEWER, newName.toLowerCase())) await setVendorHidden(SYSTEM_VIEWER, row.id, true);
    }
  });
});

// 07-20 Task 1(J5 · V3 · D-745 · N6 · U12): 지급 기한 칸 · 동시 수정 FormAlert · 행동 줄 하단 고정.
test.describe("거래처 지급 기한 · 동시 수정 (07-20 SC-17)", () => {
  const panelOf = (page: import("@playwright/test").Page) => page.locator('dialog[data-ui="side-panel"]');

  test("등록 갈래 기본 협력사 · 지급 기한 placeholder 60 · aux 1~180 · 30 저장 → 다시 열면 30 · 클라이언트로 바꾸면 칸이 사라진다", async ({ page }) => {
    const name = `E2E지급기한-${randomUUID()}`;
    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await loginAsSysadmin(page);
      await page.goto("/admin/vendors?new=1");
      const panel = panelOf(page);
      await expect(panel.getByLabel("갈래")).toHaveValue("supplier");
      const term = panel.getByLabel("지급 기한");
      await expect(term).toHaveAttribute("placeholder", "60");
      await expect(panel.locator("#paymentTermDays-hint")).toHaveText("1~180");
      await expect(panel.locator("#paymentTermDays-unit")).toHaveText("일");
      await panel.getByLabel("이름").fill(name);
      await term.fill("30");
      await panel.getByRole("button", { name: "거래처 등록" }).click();
      await expect(panel.getByRole("status")).toHaveText("거래처 등록됨");
      await page.keyboard.press("Escape");
      await expect(panel).toHaveCount(0);

      await page.locator("tbody tr", { hasText: name }).getByRole("link", { name: "수정" }).click();
      await expect(panel.getByLabel("지급 기한")).toHaveValue("30");
      await panel.getByLabel("갈래").selectOption("client");
      await expect(panel.getByLabel("지급 기한")).toHaveCount(0);
      await panel.getByLabel("갈래").selectOption("both");
      await expect(panel.getByLabel("지급 기한")).toHaveValue("");
      await panel.getByLabel("갈래").selectOption("client");
      await panel.getByRole("button", { name: "거래처 저장" }).click();
      await expect(panel).toHaveCount(0);
      const [row] = await findVendorsByNormalizedName(SYSTEM_VIEWER, name.toLowerCase());
      expect(row?.kind).toBe("client");
      expect(row?.paymentTermDays).toBeNull();
    } finally {
      for (const row of await findVendorsByNormalizedName(SYSTEM_VIEWER, name.toLowerCase())) await setVendorHidden(SYSTEM_VIEWER, row.id, true);
    }
  });

  test("지급 기한 단위 `일`이 입력 칸과 같은 세로 중심에 선다 (375 · 1280, ±4px)", async ({ page }) => {
    await loginAsSysadmin(page);
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/admin/vendors?new=1");
      const panel = panelOf(page);
      // 패널 열림 모션 중에는 두 상자가 따로 움직여 보인다 — 한 번의 평가로 같은 순간의 두 중심을 잰다.
      const gap = await panel.locator("#paymentTermDays").evaluate((input) => {
        const unit = document.getElementById("paymentTermDays-unit")!;
        const center = (el: Element) => el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2;
        return Math.abs(center(input) - center(unit));
      });
      expect(gap, `폭 ${width} 입력 중심 ↔ 단위 중심 차`).toBeLessThanOrEqual(4);
    }
  });

  test("같은 거래처를 두 페이지로 열고 A 저장 → B 저장은 패널 상단 FormAlert · 본문 맨 위 · 포커스 알림 → 새로 불러오기로 최신 값", async ({ page, context }) => {
    const name = `E2E동시수정-${randomUUID()}`;
    const vendor = await insertVendor(SYSTEM_VIEWER, { name, normalizedName: name.toLowerCase(), kind: "supplier" });
    try {
      await page.setViewportSize({ width: 1280, height: 560 });
      await loginAsSysadmin(page);
      const other = await context.newPage();
      await other.setViewportSize({ width: 1280, height: 560 });
      for (const p of [page, other]) await p.goto(`/admin/vendors?editId=${vendor.id}`);

      await panelOf(other).getByLabel("이름").fill(`${name}-A`);
      await panelOf(other).getByRole("button", { name: "거래처 저장" }).click();
      await expect(panelOf(other)).toHaveCount(0);

      const panel = panelOf(page);
      await panel.getByLabel("이름").fill(`${name}-B`);
      const body = panel.locator("#vendor-form > div").first();
      await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await panel.getByRole("button", { name: "거래처 저장" }).click();
      const alert = panel.locator("#vendor-form-alert");
      await expect(alert.getByRole("alert")).toContainText("다른 사람이 먼저 수정 · 새로 불러오기");
      await expect(alert).toBeFocused();
      expect(await body.evaluate((el) => el.scrollTop)).toBe(0);
      const [stored] = await findVendorsByNormalizedName(SYSTEM_VIEWER, `${name}-a`.toLowerCase());
      expect(stored?.name).toBe(`${name}-A`);

      await alert.getByRole("button", { name: "새로 불러오기" }).click();
      await expect(panel.getByLabel("이름")).toHaveValue(`${name}-A`);
      await expect(panel.locator("#vendor-form-alert")).toHaveCount(0);
      // 새로 불러오기는 폼을 새로 마운트한다 — 포커스가 body로 떨어지지 않고 패널 안(이름 칸)에 남는다.
      await expect(panel.locator("#name")).toBeFocused();
    } finally {
      await setVendorHidden(SYSTEM_VIEWER, vendor.id, true);
    }
  });

  test("U12 — 수정 패널 본문을 맨 아래로 내려도 1차 `거래처 저장` · `취소 Esc`가 뷰포트 안이고 행동 줄 bottom = 패널 bottom", async ({ page }) => {
    const name = `E2E행동줄-${randomUUID()}`;
    const vendor = await insertVendor(SYSTEM_VIEWER, { name, normalizedName: name.toLowerCase(), kind: "supplier" });
    try {
      await page.setViewportSize({ width: 1280, height: 480 });
      await loginAsSysadmin(page);
      await page.goto(`/admin/vendors?editId=${vendor.id}`);
      const panel = panelOf(page);
      await panel.locator("#vendor-form > div").first().evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await expect(panel.getByRole("button", { name: "거래처 저장" })).toBeInViewport();
      await expect(panel.getByRole("button", { name: /취소/ })).toBeInViewport();
      const [actionsBottom, panelBottom] = await panel.evaluate((dialog) => {
        const actions = dialog.querySelector("#vendor-form > div:last-child") as HTMLElement;
        return [actions.getBoundingClientRect().bottom, dialog.getBoundingClientRect().bottom];
      });
      expect(Math.abs(actionsBottom - panelBottom)).toBeLessThanOrEqual(1);
    } finally {
      await setVendorHidden(SYSTEM_VIEWER, vendor.id, true);
    }
  });
});

// 07-20 Task 2(V5 · V6 · K20 · C-35 · R8): 사업자 번호 줄 · `열기` · `갈래` 용어 · 계좌번호 자릿수 · 계좌 권한 읽기 줄.
test.describe("거래처 사업자 번호 · 계좌 칸 (07-20 SC-17)", () => {
  const panelOf = (page: import("@playwright/test").Page) => page.locator('dialog[data-ui="side-panel"]');

  test("검증합 틀린 번호는 blur에서 `사업자 번호 확인 · 다시 입력` · 입력 중 숫자 · 하이픈만 남는다", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/vendors?new=1");
    const panel = panelOf(page);
    const field = panel.getByLabel("사업자 번호");
    await field.pressSequentially("123-45-678a90");
    await expect(field).toHaveValue("123-45-67890");
    await field.blur();
    await expect(panel.locator("#businessNo-error")).toHaveText("사업자 번호 확인 · 다시 입력");
    await field.fill(uniqueBusinessNo());
    await field.blur();
    await expect(panel.locator("#businessNo-error")).toHaveCount(0);
  });

  test("같은 갈래의 기존 번호 → `이미 등록됨 · {이름}` + `열기` → ?editId= 그 거래처 수정 패널", async ({ page }) => {
    await loginAsSysadmin(page);
    const businessNo = uniqueBusinessNo();
    const existingName = `E2E열기-${randomUUID()}`;
    const existing = await insertVendor(SYSTEM_VIEWER, { name: existingName, normalizedName: existingName.toLowerCase(), businessNo, kind: "supplier" });
    try {
      await page.goto("/admin/vendors?new=1");
      const panel = panelOf(page);
      await panel.getByLabel("이름").fill(`E2E열기신규-${randomUUID()}`);
      await panel.getByLabel("사업자 번호").fill(businessNo);
      await panel.getByRole("button", { name: "거래처 등록" }).click();
      await expect(panel.locator("#businessNo-error")).toHaveText(`이미 등록됨 · ${existingName} · 열기`);
      const open = panel.locator("#businessNo-error").getByRole("link", { name: "열기" });
      await expect(open).toHaveAttribute("href", `/admin/vendors?editId=${existing.id}`);
      // backstop: 오류 줄의 행동이 Tab으로 닿는다
      await panel.getByLabel("사업자 번호").focus();
      await page.keyboard.press("Tab");
      await expect(open).toBeFocused();
      await open.click();
      await expect(page).toHaveURL(new RegExp(`editId=${existing.id}`));
      await expect(page.locator("#vendor-form").getByLabel("이름")).toHaveValue(existingName);
    } finally {
      await setVendorHidden(SYSTEM_VIEWER, existing.id, true);
    }
  });

  test("목록 열 머리글 · 갈래 nav · 패널 라벨이 `갈래`이고 `구분` 낱말이 화면에 없다", async ({ page }) => {
    // 열 머리글은 보이는 거래처가 있을 때만 그려진다 — 앞 시험이 남긴 행에 기대지 않고 하나 만든다.
    const name = `E2E갈래-${randomUUID().slice(0, 8)}`;
    const vendor = await insertVendor(SYSTEM_VIEWER, { name, normalizedName: name.toLowerCase(), kind: "supplier" });
    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await loginAsSysadmin(page);
      await page.goto("/admin/vendors?new=1");
      await expect(page.getByRole("columnheader", { name: "갈래" })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "갈래" })).toBeVisible();
      await expect(panelOf(page).getByLabel("갈래")).toBeVisible();
      await expect(page.getByText("구분", { exact: true })).toHaveCount(0);
    } finally {
      await setVendorHidden(SYSTEM_VIEWER, vendor.id, true);
    }
  });

  test("계좌번호 `110-123 4567` blur → `1101234567` · 9자리 blur → `숫자 10~16자리 · 다시 입력`", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/vendors?new=1");
    const field = panelOf(page).getByLabel("계좌번호");
    await field.fill("110-123 4567");
    await field.blur();
    await expect(field).toHaveValue("1101234567");
    await field.fill("123456789");
    await field.blur();
    await expect(panelOf(page).locator("#accountNumber-error")).toHaveText("숫자 10~16자리 · 다시 입력");
  });

  test("R8 — `vendors.account` 없는 계정의 수정 패널은 계좌 세 칸이 읽기 줄(마스킹)이고, 이름만 저장해도 계좌가 그대로 · 있는 계정은 입력 칸", async ({ page, browser }) => {
    const name = `E2E계좌권한-${randomUUID()}`;
    const vendor = await insertVendor(SYSTEM_VIEWER, {
      name,
      normalizedName: name.toLowerCase(),
      kind: "supplier",
      accountBank: "신한",
      accountHolder: "홍길동",
      accountNumberEncrypted: "v1:e2e-cipher",
      accountNumberLast4: "4567",
    });
    const roleId = `role-e2e-vendor-writer-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: roleId, name: `E2E 거래처 쓰기 ${roleId.slice(-12)}`, sortOrder: 99 });
    try {
      for (const action of ["view", "write"] as const) await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "admin.vendors", action, allowed: true });
      await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "vendor.value", visible: true });
      const writer = await createFixtureUser({ roleId });
      const context = await browser.newContext();
      const writerPage = await context.newPage();
      await writerPage.goto("/login");
      await writerPage.getByLabel("이메일").fill(writer.email);
      await writerPage.getByLabel("비밀번호").fill(writer.password);
      await writerPage.getByRole("button", { name: "로그인" }).click();
      await expect(writerPage).toHaveURL(/\/account$/);
      await writerPage.goto(`/admin/vendors?editId=${vendor.id}`);
      const panel = panelOf(writerPage);
      for (const label of ["계좌 은행", "예금주", "새 계좌번호", "계좌번호"]) await expect(panel.getByRole("textbox", { name: label })).toHaveCount(0);
      await expect(panel.getByText("신한", { exact: true })).toBeVisible();
      await expect(panel.getByText("홍길동", { exact: true })).toBeVisible();
      await expect(panel.getByText("****-**-4567")).toBeVisible();
      await panel.getByLabel("이름").fill(`${name}-고침`);
      await panel.getByRole("button", { name: "거래처 저장" }).click();
      await expect(panel).toHaveCount(0);
      const [after] = await findVendorsByNormalizedName(SYSTEM_VIEWER, `${name}-고침`.toLowerCase());
      expect(after).toMatchObject({ accountBank: "신한", accountHolder: "홍길동", accountNumberEncrypted: "v1:e2e-cipher" });
      await context.close();

      await loginAsSysadmin(page);
      await page.goto(`/admin/vendors?editId=${vendor.id}`);
      await expect(panelOf(page).getByRole("textbox", { name: "계좌 은행" })).toBeVisible();
      await expect(panelOf(page).getByRole("textbox", { name: "새 계좌번호" })).toBeVisible();
    } finally {
      await setVendorHidden(SYSTEM_VIEWER, vendor.id, true);
      await setRoleArchived(SYSTEM_VIEWER, roleId, true);
    }
  });
});

// 07-20 Task 3(V1 · V2 · K12 · D-736 · U16): 검색칸 · 필터 줄 2차 `파일 받기`.
test.describe("거래처 검색 · 파일 받기 (07-20 SC-16)", () => {
  test("검색칸 Enter → ?q= · 결과 · `지우기` · 결과 0 → EMPTY + `필터 지우기`", async ({ page }) => {
    const t = `E2E검색-${randomUUID().slice(0, 8)}`;
    const a = await insertVendor(SYSTEM_VIEWER, { name: `${t}-하나`, normalizedName: `${t}-하나`.toLowerCase(), kind: "supplier" });
    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await loginAsSysadmin(page);
      await page.goto("/admin/vendors");
      const search = page.getByRole("searchbox", { name: "검색" });
      await expect(search).toHaveAttribute("placeholder", "거래처 이름·사업자 번호");
      await search.fill(t);
      await search.press("Enter");
      await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(t)}`));
      await expect(page.locator("tbody tr:visible")).toHaveCount(1);
      await expect(page.locator("tbody tr", { hasText: a.name })).toBeVisible();
      await page.getByRole("link", { name: "지우기", exact: true }).click();
      await expect(page).not.toHaveURL(/q=/);

      await page.goto(`/admin/vendors?q=${encodeURIComponent(`${t}-없음`)}`);
      await expect(page.getByText("조건에 맞는 거래처가 없습니다")).toBeVisible();
      await page.getByRole("link", { name: "필터 지우기" }).click();
      await expect(page).not.toHaveURL(/q=/);
    } finally {
      await setVendorHidden(SYSTEM_VIEWER, a.id, true);
    }
  });

  test("필터 줄 2차 `파일 받기` → 내려받기 · 첫 줄 머리글 · 행 수 = 화면 결과 수 · 결과 줄 · 토스트 없음", async ({ page }) => {
    const t = `E2E파일-${randomUUID().slice(0, 8)}`;
    const made = [];
    for (const suffix of ["가", "나"]) made.push(await insertVendor(SYSTEM_VIEWER, { name: `${t}-${suffix}`, normalizedName: `${t}-${suffix}`.toLowerCase(), kind: "supplier" }));
    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await loginAsSysadmin(page);
      await page.goto(`/admin/vendors?q=${encodeURIComponent(t)}`);
      const button = page.getByRole("button", { name: "파일 받기" });
      await expect(button).toHaveClass(/secondary/);
      const downloadPromise = page.waitForEvent("download");
      await button.click();
      const download = await downloadPromise;
      const text = (await (await import("node:fs/promises")).readFile((await download.path()) ?? "", "utf8")).replace(/^﻿/, "");
      const lines = text.trimEnd().split("\r\n");
      expect(lines[0]).toBe("이름,갈래,사업자 번호,지급 기한,계좌 은행,예금주,계좌번호,기본 증빙 종류,숨김");
      expect(lines.length - 1).toBe(await page.locator("tbody tr:visible").count());
      // 결과 줄 · 토스트 없음(ui/toast 요소가 없다).
      await expect(page.locator('[class*="Toast-module"]')).toHaveCount(0);
      await expect(page.locator("#vendors-export-error")).toHaveCount(0);
    } finally {
      for (const vendor of made) await setVendorHidden(SYSTEM_VIEWER, vendor.id, true);
    }
  });

  test("U16 — 생성 중 `aria-busy` · `aria-disabled` · 다시 눌러도 요청 1회 / 실패 → 버튼 아래 `파일 받기 실패 · 다시 시도`(--status-danger) · 토스트 없음", async ({ page }) => {
    // `파일 받기`는 보이는 거래처가 있을 때만 그려진다 — 앞 시험이 남긴 행에 기대지 않고 하나 만든다.
    const name = `E2E받기실패-${randomUUID().slice(0, 8)}`;
    const vendor = await insertVendor(SYSTEM_VIEWER, { name, normalizedName: name.toLowerCase(), kind: "supplier" });
    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await loginAsSysadmin(page);
      await page.goto(`/admin/vendors?q=${encodeURIComponent(name)}`);
      const button = page.getByRole("button", { name: "파일 받기" });
      let posts = 0;
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route("**/admin/vendors**", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        posts += 1;
        await held;
        await route.abort();
      });
      await button.click();
      await expect(button).toHaveAttribute("aria-busy", "true");
      await expect(button).toHaveAttribute("aria-disabled", "true");
      await button.click({ force: true });
      expect(posts).toBe(1);
      release();
      const error = page.locator("#vendors-export-error");
      await expect(error).toHaveText("파일 받기 실패 · 다시 시도");
      const [errorColor, dangerColor] = await error.evaluate((el) => {
        const probe = document.createElement("span");
        probe.style.color = "var(--status-danger)";
        document.body.append(probe);
        const pair = [getComputedStyle(el).color, getComputedStyle(probe).color];
        probe.remove();
        return pair;
      });
      expect(errorColor).toBe(dangerColor);
      // 토스트 없음 — 실패는 버튼 아래 오류 줄 하나뿐이다(ui/toast 요소가 없다).
      await expect(page.locator('[class*="Toast-module"]')).toHaveCount(0);
      await expect(error).toHaveAttribute("role", "alert");
      await expect(button).not.toHaveAttribute("aria-busy", "true");
    } finally {
      await setVendorHidden(SYSTEM_VIEWER, vendor.id, true);
    }
  });
});

// 07-23 Task 1(V9 · AQ-35 · SC-17 ⑩): 수정 패널 맨 아래 `계좌 변경 기록` — 변경 뒤 `····1234 → ····5678` · 변경한 사람 · 일시, 이력 없으면 `이력 없음`.
test.describe("거래처 계좌 변경 기록 (07-23 SC-17 ⑩)", () => {
  const panelOf = (page: import("@playwright/test").Page) => page.locator('dialog[data-ui="side-panel"]');

  test("계좌번호를 바꿔 저장 → 다시 열면 맨 아래 `계좌 변경 기록`에 일시 · 변경한 사람 · `····1234 → ····5678` / 바꾸기 전은 `이력 없음` / 등록 패널에는 없음", async ({ page }) => {
    const name = `E2E계좌기록-${randomUUID()}`;
    const plan = planAccountNumberUpdate("110123451234");
    if (plan.kind !== "set") throw new Error("계좌 계획 없음");
    const vendor = await insertVendor(SYSTEM_VIEWER, {
      name,
      normalizedName: name.toLowerCase(),
      kind: "supplier",
      accountBank: "신한은행",
      accountHolder: "홍길동",
      accountNumberEncrypted: plan.accountNumberEncrypted,
      accountNumberLast4: plan.accountNumberLast4,
    });
    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await loginAsSysadmin(page);
      await page.goto("/admin/vendors?new=1");
      await expect(panelOf(page).getByRole("heading", { name: "계좌 변경 기록" })).toHaveCount(0);

      await page.goto(`/admin/vendors?editId=${vendor.id}`);
      const panel = panelOf(page);
      const history = panel.getByRole("region", { name: "계좌 변경 기록" });
      await expect(history.getByText("이력 없음")).toBeVisible();

      await panel.getByLabel("새 계좌번호").fill("220987655678");
      await panel.getByRole("button", { name: "거래처 저장" }).click();
      await expect(panel).toHaveCount(0);

      await page.goto(`/admin/vendors?editId=${vendor.id}`);
      const rows = panelOf(page).getByRole("region", { name: "계좌 변경 기록" }).getByRole("listitem");
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText("····1234 → ····5678");
      await expect(rows.first()).toContainText("E2E Admin");
      await expect(rows.first()).toContainText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
      await expect(rows.first()).not.toContainText("220987655678");
    } finally {
      await setVendorHidden(SYSTEM_VIEWER, vendor.id, true);
    }
  });
});

// 07-23 Task 2(V7 · V8 · V4 · N4 · U6 · U12): 수정 패널 담당자 줄(최대 5 · 폼 상태 삭제 · Enter 포커스) · 서류 두 자리 · 머리 확인 표시 · 목록 상태 한 값.
test.describe("거래처 담당자 · 서류 · 확인 표시 (07-23 SC-17 ⑦⑨ · SC-16)", () => {
  const panelOf = (page: import("@playwright/test").Page) => page.locator('dialog[data-ui="side-panel"]');
  const isActionPost = (request: { method: () => string; url: () => string }) => request.method() === "POST" && request.url().includes("/admin/vendors");

  async function freshVendor(prefix: string) {
    const name = `${prefix}-${randomUUID().slice(0, 8)}`;
    // 저장소 직접 insert = 자동 등록과 같은 경로(confirmed_at NULL — 확인 전).
    const vendor = await insertVendor(SYSTEM_VIEWER, { name, normalizedName: name.toLowerCase(), kind: "supplier" });
    return { name, id: vendor.id };
  }

  test("`담당자 더하기` 다섯 번 → 다섯 줄 · 버튼 비활성 / 이메일 칸 Enter → 다음 줄 이름 칸(마지막 줄은 `담당자 더하기`) · 저장 요청 0 / 저장 뒤 다시 열면 남음 / 줄 `삭제` → 바로 사라짐 · 알림 · 결과 줄 없음 / `취소 Esc` → 다시 열면 지우기 전 그대로", async ({ page }) => {
    const vendor = await freshVendor("E2E담당자");
    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await loginAsSysadmin(page);
      await page.goto(`/admin/vendors?editId=${vendor.id}`);
      const panel = panelOf(page);
      const add = panel.getByRole("button", { name: "담당자 더하기" });
      const rows = panel.locator("[data-contact-row]");
      await expect(rows).toHaveCount(0);

      for (let i = 0; i < 5; i += 1) await add.click();
      await expect(rows).toHaveCount(5);
      await expect(add).toHaveAttribute("aria-disabled", "true");
      // 새 줄을 더하면 그 줄 이름 칸으로 간다 — 다섯째 줄.
      await expect(rows.nth(4).getByLabel("이름", { exact: true })).toBeFocused();
      for (let i = 0; i < 5; i += 1) await rows.nth(i).getByLabel("이름", { exact: true }).fill(`담당${i + 1}`);

      let posts = 0;
      page.on("request", (request) => {
        if (isActionPost(request)) posts += 1;
      });
      await rows.nth(0).getByLabel("이메일").press("Enter");
      await expect(rows.nth(1).getByLabel("이름", { exact: true })).toBeFocused();
      await rows.nth(4).getByLabel("이메일").press("Enter");
      await expect(add).toBeFocused();
      expect(posts).toBe(0);

      await panel.getByRole("button", { name: "거래처 저장" }).click();
      await expect(panel).toHaveCount(0);

      await page.goto(`/admin/vendors?editId=${vendor.id}`);
      const saved = panelOf(page).locator("[data-contact-row]");
      await expect(saved).toHaveCount(5);
      await expect(saved.nth(1).getByLabel("이름", { exact: true })).toHaveValue("담당2");

      await saved.nth(1).getByRole("button", { name: "삭제" }).click();
      await expect(saved).toHaveCount(4);
      await expect(saved.nth(1).getByLabel("이름", { exact: true })).toHaveValue("담당3");
      await expect(page.locator('[class*="Toast-module"]')).toHaveCount(0);
      await expect(panelOf(page).getByText(/삭제됨|담당자 삭제/)).toHaveCount(0);

      // 저장 전 폼 상태 — `취소 Esc`(바뀐 칸 확인 창 `입력 버리기`)가 되돌리기다.
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "입력 버리기" }).click();
      await expect(panelOf(page)).toHaveCount(0);
      await page.goto(`/admin/vendors?editId=${vendor.id}`);
      const reopened = panelOf(page).locator("[data-contact-row]");
      await expect(reopened).toHaveCount(5);
      await expect(reopened.nth(1).getByLabel("이름", { exact: true })).toHaveValue("담당2");
    } finally {
      await setVendorHidden(SYSTEM_VIEWER, vendor.id, true);
    }
  });

  test("수정 패널 맨 아래 소제목 `서류` · `계좌 변경 기록` — 두 자리 `사업자등록증` · `통장 사본` 붙이기 · `교체` / 등록 패널에는 두 섹션 없음", async ({ page }) => {
    const vendor = await freshVendor("E2E서류");
    const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4\n% ${randomUUID()}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`) });
    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await loginAsSysadmin(page);
      await page.goto("/admin/vendors?new=1");
      await expect(panelOf(page).getByRole("heading", { name: "서류" })).toHaveCount(0);
      await expect(panelOf(page).getByRole("heading", { name: "계좌 변경 기록" })).toHaveCount(0);

      await page.goto(`/admin/vendors?editId=${vendor.id}`);
      const panel = panelOf(page);
      const documents = panel.getByRole("region", { name: "서류" });
      await expect(documents.getByRole("heading", { name: "서류", exact: true })).toBeVisible();
      await expect(panel.getByRole("heading", { name: "계좌 변경 기록" })).toBeVisible();
      // 소제목 = aux · muted(U12) — 두 섹션 머리가 같은 모양.
      const [docTitle, historyTitle] = await Promise.all([
        documents.getByRole("heading").evaluate((el) => [getComputedStyle(el).fontSize, getComputedStyle(el).color]),
        panel.getByRole("heading", { name: "계좌 변경 기록" }).evaluate((el) => [getComputedStyle(el).fontSize, getComputedStyle(el).color]),
      ]);
      expect(docTitle).toEqual(historyTitle);

      const inputs = documents.getByTestId("attachments-input");
      await expect(inputs).toHaveCount(2);
      await expect(documents.getByText("사업자등록증", { exact: true })).toBeVisible();
      await expect(documents.getByText("통장 사본", { exact: true })).toBeVisible();

      await inputs.nth(0).setInputFiles(pdf("등록증1.pdf"));
      await expect(documents.locator('[data-ui="attachments"] li').filter({ hasText: "등록증1.pdf" })).toBeVisible({ timeout: 20_000 });
      await inputs.nth(1).setInputFiles(pdf("통장.pdf"));
      await expect(documents.locator('[data-ui="attachments"] li').filter({ hasText: "통장.pdf" })).toBeVisible({ timeout: 20_000 });
      await expect(documents.getByRole("button", { name: /^교체/ })).toHaveCount(2);

      await inputs.nth(0).setInputFiles(pdf("등록증2.pdf"));
      await expect(documents.locator('[data-ui="attachments"] li').filter({ hasText: "등록증2.pdf" })).toBeVisible({ timeout: 20_000 });
      await page.goto(`/admin/vendors?editId=${vendor.id}`);
      const again = panelOf(page).getByRole("region", { name: "서류" });
      await expect(again.locator('[data-ui="attachments"] li')).toHaveCount(2);
      await expect(again.getByText("등록증1.pdf")).toHaveCount(0);
    } finally {
      await setVendorHidden(SYSTEM_VIEWER, vendor.id, true);
    }
  });

  test("목록 상태 `확인 전` → 패널 머리 `확인 전` + `확인됨으로 표시`(저장 중 aria-busy · 두 번 눌러도 요청 1회) → `확인됨` + 같은 줄 `되돌리기`(포커스 · 알림 없음) → `되돌리기` → `확인 전` → 다시 표시 → 목록 `—`", async ({ page }) => {
    const vendor = await freshVendor("E2E확인");
    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await loginAsSysadmin(page);
      await page.goto(`/admin/vendors?q=${encodeURIComponent(vendor.name)}`);
      const row = page.getByRole("row").filter({ hasText: vendor.name });
      await expect(row.getByText("확인 전", { exact: true })).toBeVisible();

      await page.goto(`/admin/vendors?q=${encodeURIComponent(vendor.name)}&editId=${vendor.id}`);
      const panel = panelOf(page);
      await expect(panel.getByText("확인 전", { exact: true })).toBeVisible();
      const mark = panel.getByRole("button", { name: "확인됨으로 표시" });

      let posts = 0;
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route("**/admin/vendors**", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        posts += 1;
        await held;
        await route.continue();
      });
      await mark.click();
      await expect(mark).toHaveAttribute("aria-busy", "true");
      await expect(mark).toHaveAttribute("aria-disabled", "true");
      await mark.click({ force: true });
      expect(posts).toBe(1);
      release();

      const undo = panelOf(page).getByRole("button", { name: "되돌리기" });
      await expect(undo).toBeFocused();
      await expect(panelOf(page).getByText("확인됨", { exact: true })).toBeVisible();
      await expect(panelOf(page).getByText("확인 전", { exact: true })).toHaveCount(0);
      await expect(page.locator('[class*="Toast-module"]')).toHaveCount(0);
      await page.unroute("**/admin/vendors**");

      await undo.click();
      const markAgain = panelOf(page).getByRole("button", { name: "확인됨으로 표시" });
      await expect(markAgain).toBeFocused();
      await expect(panelOf(page).getByText("확인 전", { exact: true })).toBeVisible();

      await markAgain.click();
      await expect(panelOf(page).getByRole("button", { name: "되돌리기" })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(panelOf(page)).toHaveCount(0);
      await expect(page.getByRole("row").filter({ hasText: vendor.name }).getByText("확인 전", { exact: true })).toHaveCount(0);
    } finally {
      await setVendorHidden(SYSTEM_VIEWER, vendor.id, true);
    }
  });
});
