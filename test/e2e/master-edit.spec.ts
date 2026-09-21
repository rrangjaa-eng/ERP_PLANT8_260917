import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// 재검증(2026-09-21)이 찾은 미달 2건 — 둘 다 「수정」 진입점이 없었다.
//
// 1. MAST-04 원문은 코드표를 「추가·수정·비활성화」하라고 한다. 도메인에
//    값·라벨 수정 함수 자체가 없었다.
// 2. ROADMAP 성공 기준 5는 법인카드를 「등록·수정·비활성화」하라고 한다.
//    updateCorpCardOwnerAction이 정의·registry 등록까지 돼 있고 호출자가 0이었다
//    — 이전 검증이 updateVendorAction의 완전히 같은 상태를 미달로 세고 고쳤던
//    것과 같은 모양이다.
//
// 이 스펙은 두 화면의 「수정」 왕복을 고정한다.

async function loginAsSysadmin(page: Page): Promise<void> {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe("코드표 항목 이름 수정 (MAST-04 「수정」)", () => {
  test("항목을 추가하고 이름을 바꾸면 목록에 새 이름이 남고 값은 그대로다", async ({ page }) => {
    await loginAsSysadmin(page);

    // 값과 이름 둘 다 유니크로 둔다 — e2e DB는 실행 사이에 남아서, 고정
    // 문자열을 쓰면 이전 실행이 남긴 행과 접근 가능한 이름이 겹친다.
    const stamp = Date.now();
    const value = `e2e-label-${stamp}`;
    const before = `수정전-${stamp}`;
    const after = `수정후-${stamp}`;

    await page.goto("/admin/code-tables?new=1");
    await page.getByLabel("값").fill(value);
    await page.getByLabel("이름", { exact: true }).fill(before);
    await page.getByRole("button", { name: "코드 추가" }).click();
    await expect(page.getByRole("cell", { name: value })).toBeVisible();

    // 행의 이름 칸이 편집 가능해야 한다 — 계급 화면의 인라인 입력과 같은 결.
    const labelInput = page.getByLabel(`${before} 이름`);
    await expect(labelInput).toBeVisible();
    await labelInput.fill(after);
    await labelInput.blur();

    await expect(page.getByLabel(`${after} 이름`)).toBeVisible();

    // 값은 그대로다 — value는 수정 대상이 아니다(vendors.default_evidence_type이
    // FK 없이 이 문자열을 참조한다).
    await page.reload();
    await expect(page.getByRole("cell", { name: value })).toBeVisible();
    await expect(page.getByLabel(`${after} 이름`)).toHaveValue(after);
  });
});

test.describe("법인카드 소유자 수정 (성공 기준 5 「수정」)", () => {
  test("등록한 카드의 「수정」을 눌러 개인 → 팀으로 바꾸면 종류와 소유가 함께 바뀐다", async ({
    page,
  }) => {
    await loginAsSysadmin(page);

    const issuer = `E2E수정카드사-${Date.now()}`;
    const last4 = String(Math.floor(1000 + Math.random() * 9000));
    const label = `수정대상-${Date.now()}`;

    await page.goto("/admin/corp-cards?new=1");
    await page.getByLabel("발급사").fill(issuer);
    await page.getByLabel("뒤 4자리").fill(last4);
    await page.getByLabel("별칭").fill(label);
    await page.getByLabel("소지자").selectOption({ index: 1 });
    await page.getByRole("button", { name: "법인카드 등록" }).click();

    const row = page.getByRole("row", { name: new RegExp(label) });
    await expect(row).toBeVisible();
    await expect(row.getByRole("cell", { name: "개인", exact: true })).toBeVisible();

    // 행의 「수정」 링크가 있어야 한다(거래처 선례와 같은 ?editId= 토글).
    await row.getByRole("link", { name: "수정" }).click();
    await expect(page).toHaveURL(/[?&]editId=/);

    // 팀으로 바꾼다.
    await page.getByLabel("종류").selectOption("team");
    await page.getByLabel("팀").selectOption({ index: 1 });
    await page.getByRole("button", { name: "소유자 변경" }).click();

    const updatedRow = page.getByRole("row", { name: new RegExp(label) });
    await expect(updatedRow.getByRole("cell", { name: "팀", exact: true })).toBeVisible();
    // kind만 바뀌고 소유 칸이 "—"로 남으면 안 된다(결함 3의 회귀).
    await expect(updatedRow.getByRole("cell", { name: "—", exact: true })).toHaveCount(0);
  });

  // /review H-1 주장: 종류를 바꾸면 React가 <select> 노드를 재사용해
  // defaultValue를 다시 적용하지 않고, 브라우저가 자리표시자를 건너뛰어 첫
  // 팀을 자동 선택한다 → 팀을 고르지 않아도 저장된다. 실측으로 반증됐다
  // (value "" · selectedIndex 0 「팀 선택」 · checkValidity false).
  // 위 왕복 테스트는 종류 전환 직후 {index:1}을 고르므로 이 경로를 덮지
  // 못한다 — 그 지적은 맞았고, 그래서 이 단언을 따로 둔다.
  test("종류를 팀으로 바꾸고 팀을 고르지 않으면 제출이 막힌다", async ({ page }) => {
    await loginAsSysadmin(page);

    const stamp = Date.now();
    await page.goto("/admin/corp-cards?new=1");
    await page.getByLabel("발급사").fill(`전환카드사-${stamp}`);
    await page.getByLabel("뒤 4자리").fill(String(Math.floor(1000 + Math.random() * 9000)));
    await page.getByLabel("별칭").fill(`전환대상-${stamp}`);
    await page.getByLabel("소지자").selectOption({ index: 1 });
    await page.getByRole("button", { name: "법인카드 등록" }).click();

    const row = page.getByRole("row", { name: new RegExp(`전환대상-${stamp}`) });
    await expect(row).toBeVisible();
    await row.getByRole("link", { name: "수정" }).click();

    // 종류만 바꾸고 팀 선택은 건드리지 않는다.
    await page.getByLabel("종류").selectOption("team");

    const state = await page.getByLabel("팀").evaluate((el) => {
      const select = el as HTMLSelectElement;
      return { value: select.value, valid: select.checkValidity() };
    });
    expect(state.value).toBe("");
    expect(state.valid).toBe(false);

    // 이 상태로 제출해도 소유가 팀으로 바뀌지 않는다.
    await page.getByRole("button", { name: "소유자 변경" }).click();
    const afterRow = page.getByRole("row", { name: new RegExp(`전환대상-${stamp}`) });
    await expect(afterRow.getByRole("cell", { name: "개인", exact: true })).toBeVisible();
  });

  test("보관된 카드에는 「수정」 링크가 없다", async ({ page }) => {
    await loginAsSysadmin(page);

    const issuer = `E2E보관카드사-${Date.now()}`;
    const last4 = String(Math.floor(1000 + Math.random() * 9000));
    const label = `보관대상-${Date.now()}`;

    await page.goto("/admin/corp-cards?new=1");
    await page.getByLabel("발급사").fill(issuer);
    await page.getByLabel("뒤 4자리").fill(last4);
    await page.getByLabel("별칭").fill(label);
    await page.getByLabel("소지자").selectOption({ index: 1 });
    await page.getByRole("button", { name: "법인카드 등록" }).click();

    const row = page.getByRole("row", { name: new RegExp(label) });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "삭제" }).click();
    await row.getByRole("button", { name: "삭제" }).click();

    await page.goto("/admin/corp-cards?includeInactive=1");
    const archivedRow = page.getByRole("row", { name: new RegExp(label) });
    await expect(archivedRow).toBeVisible();
    await expect(archivedRow.getByRole("link", { name: "수정" })).toHaveCount(0);
  });
});
