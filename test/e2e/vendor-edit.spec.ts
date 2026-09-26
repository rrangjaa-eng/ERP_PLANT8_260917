import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// 재검증(2026-09-21)이 남긴 사람 판정 항목: 거래처 수정은 도메인·단위 수준은
// 증명돼 있지만 화면 경로(폼 → 액션 → 도메인)를 태우는 e2e가 없었다
// (`vendors.spec.ts`에 editId 0건, 실측). 코드표·법인카드는 이번 라운드에
// master-edit.spec.ts로 닫았고, 거래처만 남아 있었다.
//
// 이 스펙을 쓰다가 진짜 결함을 찾았다: 보관된 거래처도 ?editId=로 직접 열면
// 수정 폼이 떴다. vendors/page.tsx의 editingVendor에 archivedAt 필터가 없어서다.
// 저장은 도메인(ArchivedVendorError)이 막지만, 고칠 수 있는 폼을 보여 놓고
// 제출한 뒤에 실패시키면 안 된다 — 법인카드 화면에는 그 필터가 있었고
// 거래처만 빠져 있었다.
//
// 계좌번호 왕복(/review M-5 「칸을 비운 채 제출해도 암호문 보존」)의 화면 경로
// 증명은 아직 없다. 계좌 칸이 마스킹 값 + 「번호 보기」로 173px까지 넓어져
// (실측) 폰 375 가로 넘침을 유발하는데, 그 넘침은 Phase 4 이월 항목이다
// (03-OPEN-ITEMS.md). 거래처 표 작업이 끝난 뒤에 붙인다 — 도메인·단위
// 수준은 planAccountNumberUpdate 6건이 이미 덮는다.

async function loginAsSysadmin(page: Page): Promise<void> {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe("거래처 수정 화면 경로 (MAST-01)", () => {
  test("보관된 거래처는 ?editId=로 직접 열어도 수정 폼이 뜨지 않는다", async ({ page }) => {
    await loginAsSysadmin(page);

    // 계좌번호는 이 테스트에 필요 없다 — 거래처 표의 계좌 칸은 마스킹 값과
    // 「번호 보기」로 173px까지 넓어지고(실측), 폰 375 가로 넘침은 Phase 4
    // 이월 항목이다(03-OPEN-ITEMS.md). 필요 없는 칸을 넓히지 않는다.
    const name = `V보${Date.now() % 100000}`;
    await page.goto("/admin/vendors?new=1");
    await page.getByLabel("이름").fill(name);
    await page.getByRole("button", { name: "거래처 등록" }).click();
    await expect(page.getByRole("cell", { name })).toBeVisible();

    const row = page.locator("tr", { hasText: name });
    const editHref = await row.getByRole("link", { name: "수정" }).getAttribute("href");
    expect(editHref).toBeTruthy();

    // 보관한다(두 단계 확인).
    await row.getByRole("button", { name: "삭제" }).click();
    await row.getByRole("button", { name: "삭제" }).click();
    await expect(page.locator("tr", { hasText: name }).getByRole("link", { name: "수정" })).toHaveCount(0);

    // 링크가 사라진 뒤에도 주소를 직접 치면? 폼이 열리면 안 된다.
    await page.goto(editHref!);
    await expect(page.getByRole("button", { name: "거래처 수정" })).toHaveCount(0);
  });
});

// 04-25(D-93 · UI-SPEC S14): 코드표 값을 고르는 자리의 첫 사용처. 고른 증빙
// 종류의 설명이 칸 바로 아래 한 줄로 보이고, 설명이 없는 값·빈 값이면 힌트
// 줄 자체가 없다(`—` 힌트 금지). 시드 증빙 종류는 전부 설명이 있어서 설명
// 없는 값은 이 테스트가 코드표 화면에서 직접 만든다.
test.describe("거래처 기본 증빙 종류 설명 힌트 (D-93, S14)", () => {
  test("고른 증빙 종류의 설명이 칸 아래 한 줄로 보이고, 설명 없는 값·빈 값이면 힌트 줄이 없다", async ({ page }) => {
    await loginAsSysadmin(page);

    const stamp = Date.now() % 100000;
    const noDescValue = `e2e-nodesc-${stamp}`;
    const noDescLabel = `설명없음${stamp}`;
    await page.goto("/admin/code-tables?tableKey=evidence_type&new=1");
    const codeForm = page.locator("#code-item-form");
    await codeForm.getByLabel("값", { exact: true }).fill(noDescValue);
    await codeForm.getByLabel("이름", { exact: true }).fill(noDescLabel);
    await page.getByRole("button", { name: "코드 추가" }).click();
    await expect(page.getByRole("cell", { name: noDescValue })).toBeVisible();

    const name = `V설${stamp}`;
    await page.goto("/admin/vendors?new=1");
    await page.getByLabel("이름").fill(name);
    await page.getByLabel("기본 증빙 종류").selectOption({ label: "세금계산서" });
    await page.getByRole("button", { name: "거래처 등록" }).click();
    await expect(page.getByRole("cell", { name })).toBeVisible();

    await page.locator("tr", { hasText: name }).getByRole("link", { name: "수정" }).click();
    await expect(page.getByRole("button", { name: "거래처 수정" })).toBeVisible();

    const select = page.getByLabel("기본 증빙 종류");
    const field = select.locator("xpath=..");

    // 저장된 값의 설명이 폼을 열 때부터 보인다.
    await expect(select).toHaveAccessibleDescription("과세 거래 · 부가세가 붙는 세금계산서");

    // 다른 값으로 바꾸면 즉시 그 값의 설명으로 바뀐다.
    await select.selectOption({ label: "기타소득" });
    await expect(page.getByText("강사료·경품 등 일시 소득 · 원천징수 대상")).toBeVisible();
    await expect(select).toHaveAccessibleDescription("강사료·경품 등 일시 소득 · 원천징수 대상");
    await expect(page.getByText("과세 거래 · 부가세가 붙는 세금계산서")).toHaveCount(0);

    // 설명이 없는 값 — 힌트 줄 자체가 없다(빈 줄·`—` 힌트 금지).
    await select.selectOption({ label: noDescLabel });
    await expect(field.locator("p")).toHaveCount(0);
    await expect(select).not.toHaveAttribute("aria-describedby");

    // 빈 값(선택 없음)도 힌트 줄이 없다.
    await select.selectOption({ label: "기타소득" });
    await expect(field.locator("p")).toHaveCount(1);
    await select.selectOption({ value: "" });
    await expect(field.locator("p")).toHaveCount(0);

    // `<option>` 안에 설명을 넣지 않는다(§7-2, S14).
    await expect(select.locator("option", { hasText: "원천징수 대상" })).toHaveCount(0);
  });
});
