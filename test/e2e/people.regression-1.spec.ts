import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createOrgUnit, createTeam } from "@/domain/org";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { loginAsAdmin } from "./people-list-helpers";

// Regression: ISSUE-001 — 팀을 고르고 발령일을 비운 채 「사람 등록」을 누르면 서버 검증 오류(effectiveFrom)를 화면이 그리지 않아
// 아무 일도 없는 것처럼 보였다(등록도 안 되고 이유도 없음).
// Found by /qa on 2026-10-13
// Report: scratchpad 064-pr-b-qa.md (PR #207 /qa)
test("팀을 고르고 발령일을 비우면 발령일 칸 오류가 보이고 패널이 남는다", async ({ page }) => {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E발령본부-${randomUUID().slice(0, 6)}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E발령팀-${randomUUID().slice(0, 6)}` });
  await loginAsAdmin(page);
  await page.goto("/admin/people?new=1");
  const form = page.locator("#person-form");
  await form.getByLabel("이름").fill("E2E발령일없음");
  await form.getByLabel("이메일").fill(`e2e-${randomUUID()}@example.test`);
  await form.locator("#roleId").selectOption({ label: "기획 PM" });
  await form.locator("#teamId").selectOption(team.id);
  await form.locator("#hireDate").fill("2026-10-01");
  await page.getByRole("button", { name: /사람 등록/ }).last().click();

  await expect(form.locator("#effectiveFrom")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#effectiveFrom-error")).toBeVisible();
  await expect(form).toBeVisible();
});
