import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// /review M-2: archivePerson은 보관과 세션 만료 두 단계이고 두 단계의 권한이
// 서로 독립이다. 두 번째 단계가 실패하면(권한 부족·인프라 오류) 행은 보관됐는데
// 그 사람의 기존 세션 쿠키는 만료일(30일)까지 그대로 동작한다.
//
// 보관은 사용자에게 「삭제」로 보이는 상태다. 삭제된 사람이 계속 로그인 상태로
// 남아 있으면 안 된다. 로그인 훅(domain/auth/hooks.ts:60)은 보관된 사람의 새
// 로그인을 막지만, 이미 발급된 세션은 보지 않았다 — 정본 게이트인 getSession이
// 판정해야 한다(fail-closed).
test.describe("보관된 사람의 기존 세션 (M-2)", () => {
  test("로그인한 뒤 보관되면 그 세션으로 더 이상 화면에 들어갈 수 없다", async ({ page }) => {
    const victim = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(victim.email);
    await page.getByLabel("비밀번호").fill(victim.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    // 세션이 살아 있는 상태에서 그 사람을 보관한다(세션은 건드리지 않는다 —
    // revokeAllSessions가 실패한 상황을 그대로 재현한다).
    const { archive } = await import("@/domain/archive");
    const { SYSTEM_VIEWER } = await import("@/domain/viewer");
    const { findUserByEmail } = await import("@/repositories/users");
    const row = await findUserByEmail(SYSTEM_VIEWER, victim.email);
    expect(row).not.toBeNull();
    await archive(SYSTEM_VIEWER, "user", row!.id);

    // 같은 브라우저 컨텍스트(같은 쿠키)로 다시 들어가면 로그인으로 떨어져야 한다.
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login/);
  });
});
