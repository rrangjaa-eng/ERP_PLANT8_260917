import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { settingsSimple } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { TAX_BASIS_DATE_VAT } from "@/domain/settings/keys";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { addDays, kstToday } from "@/lib/kst-date";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertIssueRequest } from "@/repositories/revenue-issue-requests";
import { insertRole } from "@/repositories/roles";
import { findSimpleValue, upsertSimpleValue } from "@/repositories/settings";
import { insertVendor } from "@/repositories/vendors";

// 06-21(UI-SPEC S17 error · 「Error — 목록 로드」) — 발행 요청 목록 오류 경계. 폰 스펙에 둔 이유(mobile-projects-error 선례): 이 테스트는
// 공용 설정 tax.basis_date.vat를 잠깐 잘못된 값으로 바꿔 목록의 부가세 계산(서버)을 실패시킨다. desktop과는 mobile-375의
// dependencies: ["desktop"]으로, 다른 폰 스펙과는 mobile-375 `workers: 1`로 겹치지 않는다.
test.describe("폰 375 발행 요청 목록 오류 경계 (06-21 S17)", () => {
  test("잘못된 부가세 기준일 설정 → `발행 요청 목록 불러오지 못함` · `다시 시도` → 값 되돌림 → 다시 시도 → 목록이 돌아온다", async ({ page }) => {
    const today = kstToday(new Date());
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E발행목록오류-${randomUUID()}`, viewScope: "own" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects.revenue", action: "view", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "project.value", visible: true });
    const email = `e2e-board-error-${randomUUID()}@example.test`;
    const account = await createAccount(SYSTEM_VIEWER, { email, name: "E2E 목록 오류", roleId: role.id });
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E발행목록오류-${randomUUID()}`, normalizedName: `e2e발행목록오류-${randomUUID()}` });
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
    await assignTeam(SYSTEM_VIEWER, { userId: account.userId, teamId: team.id, effectiveFrom: today });
    const project = await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId: team.id, pmUserId: account.userId, name: `E2E발행목록오류-${randomUUID().slice(0, 8)}`, startDate: today, endDate: addDays(today, 10) });
    await insertIssueRequest(
      SYSTEM_VIEWER,
      { id: randomUUID(), projectId: project.id, requestedBy: account.userId, desiredIssueDate: today, amountCurrency: "KRW", amountForeignAmount: null, amountFxRate: "1.0000", amountAmountKrw: 1_000_000, memo: "오류 뒤 복귀" },
      db,
    );

    await page.goto("/login");
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호").fill(account.tempPassword);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    // 잘못된 값이 쓰이는 창은 goto 한 번과 오류 화면 단언까지다. 되돌리기는 두 번이다 — 「다시 시도」 전(본문)과 finally(멱등).
    const key = TAX_BASIS_DATE_VAT.key;
    const original = await findSimpleValue(SYSTEM_VIEWER, key);
    const restore = async () => {
      if (original) await upsertSimpleValue(SYSTEM_VIEWER, key, original.value, original.updatedBy);
      else await db.delete(settingsSimple).where(eq(settingsSimple.key, key));
    };
    try {
      await upsertSimpleValue(SYSTEM_VIEWER, key, "e2e-invalid", null);
      await page.goto("/projects/issue-requests");
      const errorMessage = page.getByText("발행 요청 목록 불러오지 못함", { exact: true });
      await expect(errorMessage).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: "발행 요청" })).toBeVisible();
      const retry = page.getByRole("button", { name: "다시 시도" });
      await expect(retry).toBeVisible();
      await restore();

      await retry.click();
      await expect(errorMessage).toHaveCount(0);
      // 폰은 메모가 접힌 줄에 선다(P2 칸 자체는 숨는다).
      await expect(page.getByText("오류 뒤 복귀", { exact: true }).filter({ visible: true })).toBeVisible();
    } finally {
      await restore();
    }
  });
});
