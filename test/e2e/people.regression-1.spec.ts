import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createOrgUnit, createTeam } from "@/domain/org";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { kstToday } from "@/lib/kst-date";
import { loginAsAdmin } from "./people-list-helpers";

// Regression: ISSUE-001 — 팀을 고르고 발령일을 비운 채 「사람 등록」을 누르면 서버 검증 오류(effectiveFrom)를 화면이 그리지 않아
// 아무 일도 없는 것처럼 보였다(등록도 안 되고 이유도 없음).
// Found by /qa on 2026-10-13
// Report: scratchpad 064-pr-b-qa.md (PR #207 /qa)
test("팀을 고른 뒤 발령일을 지우면 발령일 칸 오류가 보이고 패널이 남는다", async ({ page }) => {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E발령본부-${randomUUID().slice(0, 6)}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E발령팀-${randomUUID().slice(0, 6)}` });
  await loginAsAdmin(page);
  await page.goto("/admin/people?new=1");
  const form = page.locator("#person-form");
  await form.getByLabel("이름").fill("E2E발령일없음");
  await form.getByLabel("이메일").fill(`e2e-${randomUUID()}@example.test`);
  await form.locator("#roleId").selectOption({ label: "기획 PM" });
  await form.locator("#teamId").selectOption(team.id);
  await form.locator("#effectiveFrom").fill("");
  await form.locator("#hireDate").fill("2026-10-01");
  await page.getByRole("button", { name: /사람 등록/ }).last().click();

  await expect(form.locator("#effectiveFrom")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#effectiveFrom-error")).toBeVisible();
  await expect(form).toBeVisible();
});

// QA ISSUE-002 — 사용자 카드 2026-10-13 「오늘로 채우기」: 팀을 고르면 비어 있는 발령일을 오늘(KST)로 채운다.
test("팀을 고르면 발령일이 오늘로 채워지고 날짜를 채우지 않아도 등록된다", async ({ page }) => {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E발령본부-${randomUUID().slice(0, 6)}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E발령팀-${randomUUID().slice(0, 6)}` });
  await loginAsAdmin(page);
  await page.goto("/admin/people?new=1");
  const form = page.locator("#person-form");
  await form.getByLabel("이름").fill("E2E발령일오늘");
  await form.getByLabel("이메일").fill(`e2e-${randomUUID()}@example.test`);
  await form.locator("#roleId").selectOption({ label: "기획 PM" });
  await expect(form.locator("#effectiveFrom")).toHaveValue("");
  await form.locator("#teamId").selectOption(team.id);
  await expect(form.locator("#effectiveFrom")).toHaveValue(kstToday(new Date()));
  await form.locator("#hireDate").fill("2026-10-01");
  await page.getByRole("button", { name: /사람 등록/ }).last().click();

  // 등록 뒤 사람 목록 전체를 다시 그린다 — 공유 테스트 DB에 사람이 쌓일수록 결과가 늦게 뜬다.
  await expect(page.getByText(/초기 비밀번호/)).toBeVisible({ timeout: 15_000 });
});

test("이미 입력한 발령일은 팀을 바꿔도 덮어쓰지 않는다", async ({ page }) => {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E발령본부-${randomUUID().slice(0, 6)}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E발령팀-${randomUUID().slice(0, 6)}` });
  await loginAsAdmin(page);
  await page.goto("/admin/people?new=1");
  const form = page.locator("#person-form");
  await form.locator("#effectiveFrom").fill("2026-09-18");
  await form.locator("#teamId").selectOption(team.id);
  await expect(form.locator("#effectiveFrom")).toHaveValue("2026-09-18");
});
