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

    // M1(04.2-09 Task 3 사후 수정 — Opus 적대적 디자인 검토): 그룹 머리글의
    // 실제 렌더 값이 계약(§7-3 — 위 12px · 아래 1px --line-strong)과 같은지
    // computed style로 잰다. `.table th`가 특이도로 덮어써 죽은 규칙이 되는
    // 회귀를 막는다.
    const firstHeaderStyle = await firstHeader.evaluate((el) => {
      const style = getComputedStyle(el);
      return { paddingTop: style.paddingTop, borderBottomWidth: style.borderBottomWidth };
    });
    expect(firstHeaderStyle.paddingTop).toBe("12px");
    expect(firstHeaderStyle.borderBottomWidth).toBe("1px");
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

    // 「더 보기」 Next-Action POST만 골라(본문에 "cursor" — M5 수정, 04.2-09
    // Task 3 사후: 마운트 때 openInboxAction·배지 다시 받기 POST와 섞이면
    // 타이밍에 따라 엉뚱한 요청이 끊길 수 있었다) 500ms 뒤 HTTP 500으로
    // 응답한다(route.fulfill — abort는 로컬호스트 keep-alive에서 간헐적으로
    // 같은 요청을 다시 성공시켜 결정적이지 않았다).
    let intercepted = false;
    await page.route("**/*", async (route) => {
      const request = route.request();
      const postData = request.postData() ?? "";
      if (
        !intercepted &&
        request.method() === "POST" &&
        request.headers()["next-action"] &&
        postData.includes('"cursor"')
      ) {
        intercepted = true;
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.fulfill({ status: 500 });
        return;
      }
      await route.continue();
    });

    const failedResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        !!response.request().headers()["next-action"] &&
        response.status() === 500,
    );

    await loadMore.click();
    // 요청 중: 이미 보이는 행은 그대로, 버튼만 비활성.
    await expect(rows).toHaveCount(50);
    await expect(loadMore).toBeDisabled();

    await failedResponse;
    await page.unroute("**/*");

    // 실패: 행은 그대로이고 버튼 자리가 오류 문구 + 「다시 시도」로 바뀐다.
    // 오류 줄은 role="status"(M2 — 포커스를 잃어도 스크린 리더가 실패를 안다).
    await expect(rows).toHaveCount(50);
    await expect(page.getByText("불러오기 실패")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "불러오기 실패" })).toBeVisible();
    const retry = page.getByRole("button", { name: "다시 시도" });
    await expect(retry).toBeVisible();
    await expect(loadMore).toHaveCount(0);

    // 재시도 요청 중에도 라벨이 「다시 시도」로 남고 비활성이다(L1 — next-safe-action의
    // status가 "executing"으로 바뀌면 hasErrored가 거짓이 되지만, 화면은 실패
    // 상태를 유지해야 한다는 플랜 계약).
    let retryIntercepted = false;
    await page.route("**/*", async (route) => {
      const request = route.request();
      const postData = request.postData() ?? "";
      if (
        !retryIntercepted &&
        request.method() === "POST" &&
        request.headers()["next-action"] &&
        postData.includes('"cursor"')
      ) {
        retryIntercepted = true;
        await new Promise((resolve) => setTimeout(resolve, 300));
        await route.continue();
        return;
      }
      await route.continue();
    });

    await retry.click();
    await expect(page.getByRole("button", { name: "다시 시도" })).toBeDisabled();
    await page.unroute("**/*");

    // 성공: 51번째 행이 붙고, 같은 커서라 중복이 없으며, 버튼이 사라지고
    // 포커스가 새로 붙은 51번째 행으로 간다. 그 행도 이번 열기가 읽음
    // 처리한 행이라 인셋(안 읽음)이 있다.
    await expect(rows).toHaveCount(51);
    await expect(page.getByRole("button", { name: /더 보기/ })).toHaveCount(0);
    const lastRow = rows.last();
    await expect(lastRow).toBeFocused();
    await expect(lastRow).toContainText("안 읽음");
  });

  test("51건 — openInboxAction이 끝나기 전엔 「더 보기」가 비활성(연 결과와 더 보기 결과가 rows를 서로 덮어쓰는 경합 방지)", async ({
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

    // 마운트 때 한 번 도는 openInboxAction(cursor 없는 유일한 next-action POST)만
    // 500ms 늦춘다 — 그사이 서버가 먼저 준 rows(더 보기 버튼 포함)는 이미
    // 그려져 있다. 버튼이 이 요청이 끝나기 전에 눌리면 그 성공 결과가 rows를
    // 통째로 덮어써 그사이 더 보기로 받은 행이 사라진다.
    let intercepted = false;
    await page.route("**/*", async (route) => {
      const request = route.request();
      const postData = request.postData() ?? "";
      if (
        !intercepted &&
        request.method() === "POST" &&
        request.headers()["next-action"] &&
        !postData.includes('"cursor"')
      ) {
        intercepted = true;
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.continue();
        return;
      }
      await route.continue();
    });

    await page.goto("/notifications");
    const loadMore = page.getByRole("button", { name: "더 보기 50건" });
    await expect(loadMore).toBeVisible();
    await expect(loadMore).toBeDisabled();

    await page.unroute("**/*");
    await expect(loadMore).toBeEnabled();
  });

  test("101건 — 더 보기 성공 뒤에도 hasMore면 포커스가 버튼에 남는다(M2)", async ({ page }) => {
    const user = await createEmployee();
    const candidates = Array.from({ length: 101 }, (_, i) =>
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
    await loadMore.focus();
    await loadMore.click();

    // 성공(101건 중 50+50=100건까지만 붙어 hasMore가 아직 참) 뒤 버튼은 다시
    // 켜지고, 포커스도 그 버튼으로 되돌아온다(Button의 pending은 네이티브
    // disabled라 브라우저가 요청 중 포커스를 문서로 돌리기 때문).
    await expect(rows).toHaveCount(100);
    await expect(loadMore).toBeEnabled();
    await expect(loadMore).toBeFocused();
  });

  test("읽음 처리 POST가 실패해도 화면 오류 없이 배지만 남는다(M4/S1-inbox-list error (c))", async ({ page }) => {
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

    // 하드 내비게이션으로 들어가면(뒤 pathname이 앞과 같아 UnreadCountProvider의
    // 경로-변경 갱신 effect가 발동하지 않는다) openInboxAction의 마운트 POST
    // 하나만 깔끔하게 가로챌 수 있다(독립 DOM 감사 참고 — dom-audit-04.2-09.md).
    let intercepted = false;
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (!intercepted && request.method() === "POST" && request.headers()["next-action"]) {
        intercepted = true;
        await route.fulfill({ status: 500 });
        return;
      }
      await route.continue();
    });

    await page.goto("/notifications");
    const row = page.locator("table tbody tr[data-row]");
    await expect(row).toHaveCount(1);

    // 화면에 오류가 보이지 않는다 — role="alert" 안에 보이는 글자가 없고
    // (Next.js 내장 AppRouterAnnouncer는 항상 마운트돼 있어 개수가 아니라
    // 텍스트 유무로 판정한다), 본문에도 오류 낱말이 없다.
    await expect(page.getByRole("alert")).toHaveText("");
    await expect(page.getByText("불러오기 실패")).toHaveCount(0);

    // 배지·인셋은 그대로(열기 실패라 openedAt이 갱신되지 않아도 readAt===null
    // 인 안 읽은 행은 여전히 안 읽음이다).
    await expect(row).toContainText("안 읽음");
    await expect(page.getByRole("button", { name: /안 읽은 알림 1건/ })).toBeVisible();

    await page.unroute("**/*");
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
