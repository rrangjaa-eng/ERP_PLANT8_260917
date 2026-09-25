import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { test, expect } from "@playwright/test";
import { db } from "@/db/client";
import { notificationLog } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { runTick, type TickResult } from "@/domain/notify/tick";
import { createTestConditionKind, testCandidate, type TestConditionKind } from "@/test/support/notify-tick";

// Task 3(알림함 목록 완성) 준비 도우미 — tick으로 만든 행을 테스트 DB에서 직접
// 고친다(email_status·created_at). 프로덕션 코드에는 이런 경로가 없다
// (04.2-09-PLAN.md Task 3 action ①).
async function patchNotification(
  entityId: string,
  patch: { emailStatus?: string; createdAt?: Date },
): Promise<void> {
  await db.update(notificationLog).set(patch).where(eq(notificationLog.entityId, entityId));
}

// now로부터 daysAgo일 전, KST 09:30(UTC 00:30)으로 고정한 시각 — 서로 다른
// daysAgo 값은 서로 다른 KST 달력 날짜가 되고, 90일 보관 창(D-4206) 안에 있다.
function kstMidUtcInstant(daysAgo: number): Date {
  const instant = new Date();
  instant.setUTCDate(instant.getUTCDate() - daysAgo);
  instant.setUTCHours(0, 30, 0, 0);
  return instant;
}

function kstDateLabel(instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const p: Record<string, string> = {};
  for (const part of parts) p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day}`;
}

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

async function createAdmin(): Promise<{ email: string; password: string; userId: string }> {
  const email = `e2e-notify-admin-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, {
    email,
    name: "E2E Admin",
    roleId: SYSADMIN_ROLE_ID,
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

test.describe("PC 사용자 메뉴 — 「알림함 N」 (04.2-09 Task 1 · S1-b)", () => {
  test("직원 — 사용자 메뉴 첫 항목이 알림함 1이고 누르면 /notifications로 간다(관리 권한 없음)", async ({
    page,
  }) => {
    const user = await createEmployee();
    const kind = createTestConditionKind([
      testCandidate({ recipientId: user.userId, entityId: randomUUID(), referenceDate: "2026-01-01" }),
    ]);
    await tickOnce(kind);

    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const trigger = page.locator('header button[aria-haspopup="menu"]');
    await trigger.click();
    const items = page.getByRole("menuitem");
    await expect(items.first()).toHaveText("알림함 1");

    await items.first().click();
    await expect(page).toHaveURL(/\/notifications$/);
  });

  test("관리자 — 사용자 메뉴 순서가 「관리」 다음 「알림함 1」이다", async ({ page }) => {
    const admin = await createAdmin();
    const kind = createTestConditionKind([
      testCandidate({ recipientId: admin.userId, entityId: randomUUID(), referenceDate: "2026-01-01" }),
    ]);
    await tickOnce(kind);

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const trigger = page.locator('header button[aria-haspopup="menu"]');
    await trigger.click();
    const items = page.getByRole("menuitem");
    await expect(items.nth(0)).toHaveText("관리");
    await expect(items.nth(1)).toHaveText("알림함 1");
  });
});

test.describe("배지 상태 전부와 이동 갱신 (Task 3 · D-4219 개정 · #4 R13 · #18)", () => {
  // 이 셸에서 실제 next/link의 <Link>는 TopBar.tsx의 워드마크 하나뿐이다(1차
  // 메뉴·하단 탭·사용자 메뉴 항목은 전부 생 <a href> — 각 이동이 문서를 새로
  // 불러온다). 그래서 "셸 내비의 Link로 이동"을 증명하려면 워드마크(href="/")를
  // 쓴다 — 로그인 뒤 도착하는 /account에서 그 Link로 /로 이동한다.
  test("로그인한 세션에서 새 알림이 생기고 Link로 이동하면 새로 고침 없이 배지가 맞아진다(Codex #19)", async ({
    page,
  }) => {
    const user = await createEmployee();

    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    // 로그인 뒤에야 알림을 만든다 — 로그인 전에 만들면 Codex #19(이동 중 갱신)를
    // 놓치고 첫 서버 조회만 증명하게 된다.
    const kind = createTestConditionKind([
      testCandidate({ recipientId: user.userId, entityId: randomUUID(), referenceDate: "2026-01-01" }),
    ]);
    await tickOnce(kind);

    await expect(page.getByRole("button", { name: /안 읽은 알림/ })).toHaveCount(0);

    await page.getByRole("link", { name: "PLANT8 내 차례" }).click();
    await expect(page).toHaveURL(/\/$/);

    const trigger = page.getByRole("button", { name: /안 읽은 알림 1건/ });
    await expect(trigger).toBeVisible();
    await expect(trigger.locator('[aria-hidden="true"]')).toHaveText("1");
  });

  test("다시 받는 동안·실패 때 배지는 이전 값을 유지한다(#4 · R13)", async ({ page }) => {
    const user = await createEmployee();
    const kind = createTestConditionKind([
      testCandidate({ recipientId: user.userId, entityId: randomUUID(), referenceDate: "2026-01-01" }),
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

    // 배지 다시 받기(Next-Action POST) 하나만 1초 붙잡았다가 끊는다 — 다른
    // 요청(문서·정적 자산)은 그대로 흘려보낸다.
    let intercepted = false;
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (!intercepted && request.method() === "POST" && request.headers()["next-action"]) {
        intercepted = true;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await route.abort();
        return;
      }
      await route.continue();
    });

    const requestFailed = page.waitForEvent(
      "requestfailed",
      (request) => request.method() === "POST" && !!request.headers()["next-action"],
    );

    await page.getByRole("link", { name: "PLANT8 내 차례" }).click();
    await expect(page).toHaveURL(/\/$/);

    // 붙잡힌 동안에도 배지 1이 그대로다(빈 배지·0이 아니다).
    await expect(trigger.locator('[aria-hidden="true"]')).toHaveText("1");

    // route.abort()가 실제로 끝날 때까지 기다린 뒤에 판정한다(1초 타임아웃에
    // 기대어 넘어가지 않는다).
    await requestFailed;

    // 요청이 끊겨도 배지 값(및 접근 가능 이름)은 여전히 이전 값 1이다.
    await expect(trigger.locator('[aria-hidden="true"]')).toHaveText("1");
    await expect(page.getByRole("button", { name: /안 읽은 알림 1건/ })).toBeVisible();
    expect(intercepted).toBe(true);

    await page.unroute("**/*");
  });

  test("100건 이상은 보이는 배지 99+, 접근 가능 이름은 실제 수 100건이다(#18)", async ({ page }) => {
    const user = await createEmployee();
    const candidates = Array.from({ length: 100 }, (_, i) =>
      testCandidate({
        recipientId: user.userId,
        entityId: `${randomUUID()}-${i}`,
        referenceDate: "2026-01-01",
      }),
    );
    const kind = createTestConditionKind(candidates);
    await tickOnce(kind);

    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    // 접근 가능 이름은 unreadCountLabel의 "99+"가 아니라 실제 수다.
    const trigger = page.getByRole("button", { name: /안 읽은 알림 100건/ });
    await expect(trigger).toBeVisible();
    await expect(trigger.locator('[aria-hidden="true"]')).toHaveText("99+");
  });

  test.describe("폰 375 배지 넘침 (S1-a · §10 터치 목표)", () => {
    test.use({ viewport: { width: 375, height: 800 } });

    test("20자 한글·영문 혼용 이름 + 배지가 트리거 안에서 한 줄로 보이고 트리거는 44×44 이상이다", async ({
      page,
    }) => {
      const longName = `${"가".repeat(10)}abcdefghij`;
      const email = `e2e-notify-long-${randomUUID()}@example.test`;
      const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, {
        email,
        name: longName,
        roleId: DEFAULT_ROLE_ID,
      });
      const kind = createTestConditionKind([
        testCandidate({ recipientId: userId, entityId: randomUUID(), referenceDate: "2026-01-01" }),
      ]);
      await tickOnce(kind);

      await page.goto("/login");
      await page.getByLabel("이메일").fill(email);
      await page.getByLabel("비밀번호").fill(tempPassword);
      await page.getByRole("button", { name: "로그인" }).click();
      await expect(page).toHaveURL(/\/account$/);

      const trigger = page.locator('header button[aria-haspopup="menu"]');
      const triggerBox = await trigger.boundingBox();
      expect(triggerBox).not.toBeNull();
      expect(triggerBox!.width).toBeGreaterThanOrEqual(44);
      expect(triggerBox!.height).toBeGreaterThanOrEqual(44);

      const badge = trigger.locator('[aria-hidden="true"]');
      await expect(badge).toBeVisible();
      const badgeBox = await badge.boundingBox();
      expect(badgeBox).not.toBeNull();

      // 배지 오른쪽 끝이 트리거 경계 안(±1px 오차 허용)이다.
      expect(badgeBox!.x + badgeBox!.width).toBeLessThanOrEqual(triggerBox!.x + triggerBox!.width + 1);

      // 배지 글자가 줄바꿈 없이 한 줄이다.
      const whiteSpace = await badge.evaluate((el) => getComputedStyle(el).whiteSpace);
      expect(whiteSpace).toBe("nowrap");
    });
  });
});

test.describe("알림함 목록 완성 (Task 3 · S1-c · S1-d)", () => {
  test("0건 — 알림이 없습니다 한 줄, 표·더 보기 버튼 없음", async ({ page }) => {
    const user = await createEmployee();

    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/notifications");
    await expect(page.getByText("알림이 없습니다")).toBeVisible();
    await expect(page.locator("table")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /더 보기/ })).toHaveCount(0);
  });

  test("서로 다른 KST 날짜 두 날 — 날짜마다 tbody + rowgroup 머리글", async ({ page }) => {
    const user = await createEmployee();
    const recentId = randomUUID();
    const olderId = randomUUID();
    const recentAt = kstMidUtcInstant(1);
    const olderAt = kstMidUtcInstant(2);
    const kind = createTestConditionKind([
      testCandidate({ recipientId: user.userId, entityId: recentId, referenceDate: "2026-01-01" }),
      testCandidate({ recipientId: user.userId, entityId: olderId, referenceDate: "2026-01-01" }),
    ]);
    await tickOnce(kind);
    await patchNotification(recentId, { createdAt: recentAt });
    await patchNotification(olderId, { createdAt: olderAt });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/notifications");
    const tbodies = page.locator("table tbody");
    await expect(tbodies).toHaveCount(2);

    const recentLabel = kstDateLabel(recentAt).slice(5);
    const olderLabel = kstDateLabel(olderAt).slice(5);

    const firstHeader = tbodies.nth(0).locator("tr").first().locator('th[scope="rowgroup"]');
    await expect(firstHeader).toHaveText(recentLabel);
    await expect(firstHeader).toHaveAttribute("colspan", "2");
    await expect(page.locator('table th[scope="colgroup"]')).toHaveCount(0);

    const secondHeader = tbodies.nth(1).locator("tr").first().locator('th[scope="rowgroup"]');
    await expect(secondHeader).toHaveText(olderLabel);
  });

  test("email_status='failed' 행에만 이메일 발송 실패 보조 줄, 결과 불명(unknown)엔 없음", async ({ page }) => {
    const user = await createEmployee();
    const failedId = randomUUID();
    const unknownId = randomUUID();
    const kind = createTestConditionKind([
      testCandidate({ recipientId: user.userId, entityId: failedId, referenceDate: "2026-01-01" }),
      testCandidate({ recipientId: user.userId, entityId: unknownId, referenceDate: "2026-01-01" }),
    ]);
    await tickOnce(kind);
    await patchNotification(failedId, { emailStatus: "failed" });
    await patchNotification(unknownId, { emailStatus: "unknown" });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/notifications");
    const failedRow = page.locator("table tbody tr").filter({ hasText: failedId });
    await expect(failedRow).toContainText("이메일 발송 실패");
    const unknownRow = page.locator("table tbody tr").filter({ hasText: unknownId });
    await expect(unknownRow).not.toContainText("이메일 발송 실패");
  });

  test("정확히 50건 — 더 보기 버튼이 없다", async ({ page }) => {
    const user = await createEmployee();
    const candidates = Array.from({ length: 50 }, (_, i) =>
      testCandidate({ recipientId: user.userId, entityId: `${randomUUID()}-${i}`, referenceDate: "2026-01-01" }),
    );
    const kind = createTestConditionKind(candidates);
    await tickOnce(kind);

    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/notifications");
    await expect(page.locator("table tbody tr[data-row]")).toHaveCount(50);
    await expect(page.getByRole("button", { name: /더 보기/ })).toHaveCount(0);
  });

  test("51건 — 더 보기 요청 중·실패(다시 시도)·마지막 쪽 인셋과 포커스(디자인 리뷰 #5 · R14)", async ({
    page,
  }) => {
    const user = await createEmployee();
    const candidates = Array.from({ length: 51 }, (_, i) =>
      testCandidate({ recipientId: user.userId, entityId: `${randomUUID()}-${i}`, referenceDate: "2026-01-01" }),
    );
    const kind = createTestConditionKind(candidates);
    await tickOnce(kind);

    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/notifications");
    const rows = page.locator("table tbody tr[data-row]");
    await expect(rows).toHaveCount(50);
    const loadMore = page.getByRole("button", { name: "더 보기 50건" });
    await expect(loadMore).toBeVisible();

    // 「더 보기」 Next-Action POST 하나만 붙잡아 500ms 뒤 끊는다(실패 흉내).
    let intercepted = false;
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (!intercepted && request.method() === "POST" && request.headers()["next-action"]) {
        intercepted = true;
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.abort();
        return;
      }
      await route.continue();
    });

    const requestFailed = page.waitForEvent(
      "requestfailed",
      (request) => request.method() === "POST" && !!request.headers()["next-action"],
    );

    await loadMore.click();
    // 요청 중: 이미 보이는 행은 그대로, 버튼만 비활성.
    await expect(rows).toHaveCount(50);
    await expect(loadMore).toBeDisabled();

    await requestFailed;
    await page.unroute("**/*");

    // 실패: 행은 그대로이고 버튼 자리가 오류 문구 + 「다시 시도」로 바뀐다.
    await expect(rows).toHaveCount(50);
    await expect(page.getByText("불러오지 못했습니다")).toBeVisible();
    const retry = page.getByRole("button", { name: "다시 시도" });
    await expect(retry).toBeVisible();
    await expect(loadMore).toHaveCount(0);

    await retry.click();

    // 성공: 51번째 행이 붙고, 같은 커서라 중복이 없으며, 버튼이 사라지고
    // 포커스가 새로 붙은 51번째 행으로 간다. 그 행도 이번 열기가 읽음
    // 처리한 행이라 인셋(안 읽음)이 있다.
    await expect(rows).toHaveCount(51);
    await expect(page.getByRole("button", { name: /더 보기/ })).toHaveCount(0);
    const lastRow = rows.last();
    await expect(lastRow).toBeFocused();
    await expect(lastRow).toContainText("안 읽음");
  });

  test("HTML 글자가 그대로 보이고 요소로 해석되지 않는다", async ({ page }) => {
    const user = await createEmployee();
    const entityId = `<b>굵게</b> & "따옴표"-${randomUUID()}`;
    const kind = createTestConditionKind([
      testCandidate({ recipientId: user.userId, entityId, referenceDate: "2026-01-01" }),
    ]);
    await tickOnce(kind);

    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/notifications");
    await expect(page.locator("table b")).toHaveCount(0);
    await expect(page.getByText(`테스트 알림 · ${entityId}`)).toBeVisible();
  });
});
