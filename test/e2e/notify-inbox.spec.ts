import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createAccount } from "@/domain/auth/accounts";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { runTick, type TickResult } from "@/domain/notify/tick";
import { createTestConditionKind, testCandidate, type TestConditionKind } from "@/test/support/notify-tick";

// <probe_fallback> 「E2E의 tick」: 워커가 병렬이라 다른 파일의 tick과 advisory
// lock이 겹칠 수 있다 — locked면 짧게 다시 부른다(최대 20회).
async function tickOnce(kind: TestConditionKind): Promise<TickResult> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await runTick({ conditionKinds: [kind], isBusinessDay: () => Promise.resolve(true) });
    if (result.status !== "locked") return result;
  }
  throw new Error("notify tick: advisory lock 재시도 초과(20회)");
}

async function createEmployee(): Promise<{ email: string; password: string; userId: string }> {
  const email = `e2e-notify-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, {
    email,
    name: "E2E Employee",
    roleId: DEFAULT_ROLE_ID,
  });
  return { email, password: tempPassword, userId };
}

test.describe("알림함 트레이서 — tick → 배지 1 → 열람 → 배지 0 (D-4219 · D-4218)", () => {
  test("tick 1건이 배지로 보이고, 알림함을 열면 같은 화면에서 배지가 사라진다", async ({ page }) => {
    const user = await createEmployee();
    const entityId = randomUUID();
    const kind = createTestConditionKind([
      testCandidate({ recipientId: user.userId, entityId, referenceDate: "2026-01-01" }),
    ]);
    await tickOnce(kind);

    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const trigger = page.getByRole("button", { name: /안 읽은 알림 1건/ });
    await expect(trigger).toBeVisible();
    await expect(trigger.locator('[aria-hidden="true"]')).toHaveText("1");

    await page.goto("/notifications");
    const row = page.locator("table tbody tr").filter({ hasText: entityId });
    await expect(row).toContainText("안 읽음");

    // 열람 뒤 같은 화면에서 배지가 사라진다(같은 UnreadCountProvider — 이동 없음).
    await expect(page.getByRole("button", { name: /안 읽은 알림/ })).toHaveCount(0);
    await expect(page.locator('header button[aria-haspopup="menu"]')).toBeVisible();

    // 새로 고침하면 인셋 표시가 사라진다(다음 방문의 openedAt은 이미 읽은 이 행을
    // 다시 표시하지 않는다 — S1-d).
    await page.reload();
    const rowAfterReload = page.locator("table tbody tr").filter({ hasText: entityId });
    await expect(rowAfterReload).not.toContainText("안 읽음");
  });
});
