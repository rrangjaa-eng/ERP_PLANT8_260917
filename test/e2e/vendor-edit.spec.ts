import { test, expect, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { randomUUID, randomBytes, createCipheriv } from "node:crypto";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertVendor, setVendorHidden } from "@/repositories/vendors";

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
    // 04.6-04(UQ-8 B): 등록 성공 뒤 패널은 열린 채 결과 한 줄을 보인다 — Esc로 닫고 목록을 이어 본다.
    await expect(page.locator('dialog[data-ui="side-panel"]').getByRole("status")).toHaveText("거래처 등록됨");
    await page.keyboard.press("Escape");
    await expect(page.locator('dialog[data-ui="side-panel"]')).toHaveCount(0);
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
    // 04.6-04(UQ-8 B): 등록 성공 뒤 패널은 열린 채 결과 한 줄을 보인다 — Esc로 닫고 목록을 이어 본다.
    await expect(page.locator('dialog[data-ui="side-panel"]').getByRole("status")).toHaveText("거래처 등록됨");
    await page.keyboard.press("Escape");
    await expect(page.locator('dialog[data-ui="side-panel"]')).toHaveCount(0);
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

// 04.6-11 · D14 · M2: 수정 패널 폼은 라벨 위 · 칸 전폭이고, 「기본 증빙 종류」 select 높이가 같은 패널 「이름」 입력 높이(--field-h)와 같다.
test.describe("거래처 수정 패널 칸 배치 (04.6-11 D14 · M2)", () => {
  test("select 높이 = 입력 높이 · 라벨이 칸 위 · 칸이 패널 폭 전체", async ({ page }) => {
    const vendor = await insertVendor(SYSTEM_VIEWER, {
      name: `패널칸-${randomUUID().slice(0, 8)}`,
      normalizedName: `패널칸-${randomUUID()}`,
      accountNumberLast4: "4455",
    });
    try {
      await loginAsSysadmin(page);
      await page.goto(`/admin/vendors?editId=${vendor.id}`);
      const form = page.locator("#vendor-form");
      const name = form.getByLabel("이름", { exact: true });
      const select = form.getByLabel("기본 증빙 종류");
      await expect(select).toBeVisible();
      const nameBox = await name.boundingBox();
      const selectBox = await select.boundingBox();
      expect(Math.abs(selectBox!.height - nameBox!.height), `select ${selectBox!.height}px · 입력 ${nameBox!.height}px`).toBeLessThanOrEqual(0.5);
      expect(Math.abs(selectBox!.width - nameBox!.width), "select 폭 = 입력 폭(전폭)").toBeLessThanOrEqual(0.5);
      const labelBox = await form.locator('label[for="defaultEvidenceType"]').boundingBox();
      expect(labelBox!.y + labelBox!.height, "라벨이 select 위").toBeLessThanOrEqual(selectBox!.y + 0.5);
      const accountBox = await form.getByLabel("새 계좌번호").boundingBox();
      expect(Math.abs(accountBox!.width - nameBox!.width), "계좌번호 칸 폭 = 입력 폭(전폭)").toBeLessThanOrEqual(0.5);
    } finally {
      await setVendorHidden(SYSTEM_VIEWER, vendor.id, true);
    }
  });
});

// 스테이징 신고(2026-10-06): 「번호 보기」가 실패하면 오류 문구가 번호 옆 같은 줄에 끼어 계좌 값이 「상태」 열 쪽으로 밀렸고,
// 머리글 「계좌」만 왼쪽에 있어 값과 반대편에 붙었다. 다른 키로 잠근 암호문(지금 키로 못 푼다)으로 실패를 재현한다.
test.describe("거래처 계좌 칸 정렬 · 해제 실패 줄", () => {
  test("머리글과 값이 같은 오른쪽 끝 · 실패 문구는 번호 아래 줄", async ({ page }) => {
    const otherKey = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", otherKey, iv);
    const data = Buffer.concat([cipher.update("110-222-334455", "utf8"), cipher.final()]);
    const foreign = `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${data.toString("base64")}`;
    const name = `계좌정렬-${randomUUID().slice(0, 8)}`;
    const vendor = await insertVendor(SYSTEM_VIEWER, {
      name,
      normalizedName: `계좌정렬-${randomUUID()}`,
      accountNumberEncrypted: foreign,
      accountNumberLast4: "4455",
    });
    try {
      await loginAsSysadmin(page);
      await page.goto("/admin/vendors");
      const row = page.locator("tr", { hasText: name });
      await row.getByRole("button", { name: "번호 보기" }).click();
      const error = row.getByText("번호 불러오기 실패 · 다시 시도");
      await expect(error).toBeVisible();

      // 머리글 글자 자체의 상자(칸 상자가 아니라) — 칸 오른쪽 안쪽 끝과의 거리를 잰다.
      const headerGap = await page.getByRole("columnheader", { name: "계좌" }).evaluate((th) => {
        const range = document.createRange();
        range.selectNodeContents(th);
        const text = range.getBoundingClientRect();
        const box = th.getBoundingClientRect();
        const padRight = parseFloat(getComputedStyle(th).paddingRight);
        return box.right - padRight - text.right;
      });
      const masked = await row.getByText("****-**-4455").boundingBox();
      const button = await row.getByRole("button", { name: "번호 보기" }).boundingBox();
      const errorBox = await error.boundingBox();
      // 머리글 글자가 칸 오른쪽에 붙는다(값과 같은 쪽).
      expect(headerGap, "머리글 글자가 칸 오른쪽 끝에 붙는다").toBeLessThanOrEqual(1);
      // 실패 문구는 번호 · 버튼 줄 아래에 있다.
      expect(errorBox!.y, "실패 문구가 번호 아래 줄").toBeGreaterThanOrEqual(Math.max(masked!.y + masked!.height, button!.y + button!.height) - 1);
    } finally {
      await setVendorHidden(SYSTEM_VIEWER, vendor.id, true);
    }
  });
});
