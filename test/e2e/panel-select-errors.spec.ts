import { randomUUID } from "node:crypto";
import { test, expect, type Locator } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { loginAsSysadmin } from "./row-actions-helpers";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { findUserByEmail } from "@/repositories/users";
import { insertCorpCard, setCorpCardActive } from "@/repositories/corp-cards";

// 04.6 최종 /qa 이슈 1 회귀 — 옆 패널 폼은 `<form noValidate>`라 비운 필수 select가 제출을 막지 못하고, 서버가 돌려준
// `validationErrors`(roleId · orgUnitId · holderUserId)를 칸이 그리지 않으면 버튼이 아무 일도 안 하는 것처럼 보인다.
// 세 패널 모두: 해당 칸 `aria-invalid="true"` + 칸 아래 오류 한 줄 + 행동 줄 이유 한 줄에 그 칸이 나오고 패널은 열린 채다.
const PANEL = 'dialog[data-ui="side-panel"]';

async function expectSelectError(dialog: Locator, select: Locator, submit: Locator, text: string, fieldName: string) {
  await expect(dialog).toBeVisible();
  await expect(select).toHaveAttribute("aria-invalid", "true");
  const describedBy = await select.getAttribute("aria-describedby");
  expect(describedBy, `${fieldName} 칸 aria-describedby`).toBeTruthy();
  await expect(dialog.locator(`[id="${describedBy}"]`)).toHaveText(text);
  await expect(submit).toHaveAccessibleDescription(new RegExp(fieldName));
}

test.describe("옆 패널 필수 select 비움 오류 (04.6 QA-1)", () => {
  test("사람 등록: 계급을 비운 채 제출하면 계급 칸 오류가 보인다", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/people?new=1");
    const dialog = page.locator(PANEL);
    await dialog.getByLabel("이름").fill("계급없음");
    await dialog.getByLabel("이메일").fill(`e2e-norole-${randomUUID().slice(0, 8)}@example.test`);
    await dialog.getByLabel("입사일").fill("2026-01-01");
    const submit = dialog.getByRole("button", { name: "사람 등록" });
    await submit.click();
    await expectSelectError(dialog, dialog.locator("#roleId"), submit, "계급 필요 · 계급 선택", "계급");
  });

  test("팀 추가: 본부를 비운 채 제출하면 본부 칸 오류가 보인다", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/people/org?new=team");
    const dialog = page.locator(PANEL);
    await dialog.getByLabel("이름").fill(`E2E본부없음-${randomUUID().slice(0, 8)}`);
    const submit = dialog.getByRole("button", { name: "팀 추가" });
    await submit.click();
    await expectSelectError(dialog, dialog.locator("#team-org-unit-id"), submit, "본부 필요 · 본부 선택", "본부");
  });

  test("법인카드 소유자 변경: 팀 종류에서 팀을 비운 채 제출하면 팀 칸 오류가 보인다", async ({ page }) => {
    const stamp = randomUUID().slice(0, 8);
    const holder = await findUserByEmail(SYSTEM_VIEWER, (await createFixtureUser({ roleId: DEFAULT_ROLE_ID })).email);
    const card = await insertCorpCard(SYSTEM_VIEWER, {
      issuer: `패널오류카드사-${stamp}`,
      numberLast4: String(Math.floor(1000 + Math.random() * 9000)),
      label: `패널오류-${stamp}`,
      kind: "personal",
      holderUserId: holder!.id,
    });
    try {
      await loginAsSysadmin(page);
      await page.goto("/admin/corp-cards");
      await page.locator("tr", { hasText: card.label }).getByRole("link", { name: "수정" }).click();
      const dialog = page.locator(PANEL);
      await dialog.getByLabel("종류").selectOption("team");
      const submit = dialog.getByRole("button", { name: "소유자 변경" });
      await submit.click();
      await expectSelectError(dialog, dialog.locator("#owner-teamId"), submit, "소지자·팀 중 하나 필요 · 하나만 선택", "소지자·팀");
    } finally {
      await setCorpCardActive(SYSTEM_VIEWER, card.id, false);
    }
  });
  // 06-30 검토 P3-1 — 종류를 바꾸면 없는 칸에 대한 앞 제출의 오류 줄이 남지 않는다(행동 줄 + 1차 aria-describedby).
  test("법인카드 소유자 변경: 오류가 뜬 뒤 종류를 공용으로 바꾸면 오류 줄과 describedby가 사라진다", async ({ page }) => {
    const stamp = randomUUID().slice(0, 8);
    const holder = await findUserByEmail(SYSTEM_VIEWER, (await createFixtureUser({ roleId: DEFAULT_ROLE_ID })).email);
    const card = await insertCorpCard(SYSTEM_VIEWER, {
      issuer: `종류전환카드사-${stamp}`,
      numberLast4: String(Math.floor(1000 + Math.random() * 9000)),
      label: `종류전환-${stamp}`,
      kind: "personal",
      holderUserId: holder!.id,
    });
    try {
      await loginAsSysadmin(page);
      await page.goto("/admin/corp-cards");
      await page.locator("tr", { hasText: card.label }).getByRole("link", { name: "수정" }).click();
      const dialog = page.locator(PANEL);
      await dialog.getByLabel("종류").selectOption("team");
      const submit = dialog.getByRole("button", { name: "소유자 변경" });
      await submit.click();
      await expect(dialog.locator("#corp-card-owner-form-reason")).toBeVisible();
      await dialog.getByLabel("종류").selectOption("shared");
      await expect(dialog.locator("#corp-card-owner-form-reason")).toHaveCount(0);
      await expect(submit).not.toHaveAttribute("aria-describedby", /.+/);
    } finally {
      await setCorpCardActive(SYSTEM_VIEWER, card.id, false);
    }
  });

  test("법인카드 등록: 오류가 뜬 뒤 종류를 공용으로 바꾸면 오류 줄과 describedby가 사라진다", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/corp-cards?new=1");
    const dialog = page.locator(PANEL);
    await dialog.getByLabel("발급사").fill(`종류전환카드사-${randomUUID().slice(0, 8)}`);
    await dialog.getByLabel("뒤 4자리").fill(String(Math.floor(1000 + Math.random() * 9000)));
    await dialog.getByLabel("별칭").fill("종류전환");
    const submit = dialog.getByRole("button", { name: "법인카드 등록" });
    await submit.click();
    await expect(dialog.locator("#corp-card-form-reason")).toBeVisible();
    await dialog.getByLabel("종류").selectOption("shared");
    await expect(dialog.locator("#corp-card-form-reason")).toHaveCount(0);
    await expect(submit).not.toHaveAttribute("aria-describedby", /.+/);
  });
  // 06-30 검토 P3-2 — 등록 폼도 소유 칸 누락 오류를 그 칸에 붙인다(aria-invalid + 칸 아래 한 줄 + describedby). 종류별 행동형 문구.
  for (const [kind, selector, text, fieldName] of [
    ["personal", "#holderUserId", "소지자 필요 · 소지자 선택", "소지자"],
    ["team", "#teamId", "팀 필요 · 팀 선택", "팀"],
  ] as const) {
    test(`법인카드 등록: 종류 ${kind}에서 소유 칸을 비운 채 제출하면 그 칸 오류가 보인다`, async ({ page }) => {
      await loginAsSysadmin(page);
      await page.goto("/admin/corp-cards?new=1");
      const dialog = page.locator(PANEL);
      await dialog.getByLabel("발급사").fill(`등록오류카드사-${randomUUID().slice(0, 8)}`);
      await dialog.getByLabel("뒤 4자리").fill(String(Math.floor(1000 + Math.random() * 9000)));
      await dialog.getByLabel("별칭").fill("등록오류");
      await dialog.getByLabel("종류").selectOption(kind);
      const submit = dialog.getByRole("button", { name: "법인카드 등록" });
      await submit.click();
      await expectSelectError(dialog, dialog.locator(selector), submit, text, fieldName);
    });
  }
});
