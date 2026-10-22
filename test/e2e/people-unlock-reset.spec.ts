import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page, type Request } from "@playwright/test";
import { createAccount } from "@/domain/auth/accounts";
import { lockoutConfig, windowStart } from "@/domain/auth/lockout";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { countOpenFailures, recordAttempt } from "@/repositories/login-attempts";
import { updateUserResignationDate } from "@/repositories/users";
import { addDays } from "@/lib/kst-date";
import { seoulToday } from "@/lib/dates";
import { createDelegatedAccount } from "./admin-cap-fixtures";
import { loginAsAdmin, personRow, statusCell } from "./people-list-helpers";

// 07-17 SC-11(U1 · U2 · U6 · D-728 · N4): 사람 목록 `잠김` · 그 줄 `잠금 풀기` → 표 위 결과 줄.
test.describe.configure({ timeout: 90_000 });

type Person = { userId: string; email: string; name: string; password: string };

async function makePerson(token: string, suffix: string): Promise<Person> {
  const email = `e2e-unlock-${randomUUID()}@example.test`;
  const name = `${token}${suffix}`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name, roleId: DEFAULT_ROLE_ID });
  return { userId, email, name, password: tempPassword };
}

// 로그인 거부와 같은 판정(창 안 열린 실패 수 ≥ 임계)을 만든다 — 실패 행을 임계만큼.
async function lock(email: string): Promise<void> {
  const { threshold } = await lockoutConfig();
  for (let i = 0; i < threshold; i += 1) {
    await recordAttempt(SYSTEM_VIEWER, { email, success: false, ip: null });
  }
}

async function openFailures(email: string): Promise<number> {
  const { windowMinutes } = await lockoutConfig();
  return countOpenFailures(SYSTEM_VIEWER, email, windowStart(new Date(), windowMinutes));
}

// 쪽 나눔에 견디게 이름 토큰으로 거른다(Task 2 `?q=` — 그 전에는 쿼리를 무시하고 전부 보인다).
async function openPeople(page: Page, q: string): Promise<void> {
  await page.goto(`/admin/people?q=${encodeURIComponent(q)}`);
}

function isActionPost(request: Request): boolean {
  return request.method() === "POST" && request.headers()["next-action"] !== undefined;
}

// 잡아 둔 액션 요청을 다른 대상 id로 다시 보낸다(화면에 링크가 없는 대상 · 권한 없는 세션의 직접 호출).
async function replay(page: Page, captured: Request, fromId: string, toId: string): Promise<void> {
  const headers = captured.headers();
  const keep: Record<string, string> = {};
  for (const key of ["next-action", "next-router-state-tree", "content-type", "accept"]) {
    if (headers[key]) keep[key] = headers[key];
  }
  const body = (captured.postData() ?? "").replaceAll(fromId, toId);
  await page.request.post(captured.url(), { headers: keep, data: body });
}

async function statusColorIsDanger(page: Page, email: string): Promise<boolean> {
  const tag = statusCell(personRow(page, email)).getByText("잠김", { exact: true });
  return tag.evaluate((el) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--status-danger)";
    document.body.append(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    return getComputedStyle(el).color === expected;
  });
}

async function loginAs(browser: Browser, email: string, password: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return page;
}

test.describe("사람 목록 잠김 · 잠금 풀기 (SC-11)", () => {
  test("잠긴 사람은 `잠김`(danger) · 그 줄 `잠금 풀기` → 확인 창 · 토스트 없이 결과 줄, 상태가 다음 값, 포커스는 같은 행", async ({ page }) => {
    const token = `잠김E2E${randomUUID().slice(0, 6)}`;
    const a = await makePerson(token, "가");
    const b = await makePerson(token, "나");
    await lock(a.email);
    await loginAsAdmin(page);
    await openPeople(page, token);

    const rowA = personRow(page, a.email);
    const rowB = personRow(page, b.email);
    await expect(statusCell(rowA)).toHaveText("잠김");
    expect(await statusColorIsDanger(page, a.email)).toBe(true);
    // 잠기지 않은 행에는 `잠금 풀기`가 없다.
    await expect(rowB.getByRole("button", { name: "잠금 풀기" })).toHaveCount(0);

    await rowA.getByRole("button", { name: "잠금 풀기" }).click();
    const result = page.getByRole("status").filter({ hasText: "잠금 풀기 ·" });
    await expect(result).toHaveText(`잠금 풀기 · ${a.name}`);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("[class*='Toast-module__']")).toHaveCount(0);
    // 다음 우선 값 — 발급 직후 계정은 첫 로그인 전 · 임시 비밀번호 사용 중.
    await expect(statusCell(rowA)).not.toContainText("잠김");
    await expect(statusCell(rowA)).toContainText("임시 비밀번호 사용 중");
    await expect(rowA.getByRole("button", { name: "잠금 풀기" })).toHaveCount(0);
    // 사라진 `잠금 풀기` 자리 — 같은 행의 남은 행동(`상세`)으로.
    await expect(rowA.getByRole("link", { name: "상세" })).toBeFocused();
    expect(await openFailures(a.email)).toBe(0);
  });

  test("두 사람을 차례로 풀면 결과 줄은 마지막 한 건만", async ({ page }) => {
    const token = `잠김E2E${randomUUID().slice(0, 6)}`;
    const a = await makePerson(token, "가");
    const b = await makePerson(token, "나");
    await lock(a.email);
    await lock(b.email);
    await loginAsAdmin(page);
    await openPeople(page, token);

    await personRow(page, a.email).getByRole("button", { name: "잠금 풀기" }).click();
    await expect(page.getByRole("status").filter({ hasText: "잠금 풀기 ·" })).toHaveText(`잠금 풀기 · ${a.name}`);
    await personRow(page, b.email).getByRole("button", { name: "잠금 풀기" }).click();
    const result = page.getByRole("status").filter({ hasText: "잠금 풀기 ·" });
    await expect(result).toHaveCount(1);
    await expect(result).toHaveText(`잠금 풀기 · ${b.name}`);
  });

  test("U6 — 요청 중 그 `잠금 풀기`는 aria-busy · aria-disabled, 연타해도 요청 하나, 다른 행은 그대로", async ({ page }) => {
    const token = `잠김E2E${randomUUID().slice(0, 6)}`;
    const a = await makePerson(token, "가");
    const b = await makePerson(token, "나");
    await lock(a.email);
    await lock(b.email);
    await loginAsAdmin(page);
    await openPeople(page, token);

    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let posts = 0;
    await page.route("**/admin/people**", async (route) => {
      if (!isActionPost(route.request())) return route.fallback();
      posts += 1;
      await gate;
      return route.fallback();
    });

    const unlockA = personRow(page, a.email).getByRole("button", { name: /잠금 풀기/ });
    await unlockA.click();
    await unlockA.click({ force: true });
    await unlockA.click({ force: true });
    await expect(unlockA).toHaveAttribute("aria-busy", "true");
    await expect(unlockA).toHaveAttribute("aria-disabled", "true");
    // 다른 행은 그대로 조작할 수 있다.
    await expect(personRow(page, b.email).getByRole("button", { name: "잠금 풀기" })).not.toHaveAttribute("aria-disabled", "true");
    expect(posts).toBe(1);
    release();
    await expect(page.getByRole("status").filter({ hasText: "잠금 풀기 ·" })).toHaveText(`잠금 풀기 · ${a.name}`);
    expect(posts).toBe(1);
  });

  test("D-728 · U2 — 퇴직 + 잠김은 상태 `퇴직` · 링크 없음 · 액션 직접 호출 거부(실패 행 그대로)", async ({ page }) => {
    const token = `잠김E2E${randomUUID().slice(0, 6)}`;
    const live = await makePerson(token, "가");
    const control = await makePerson(token, "나");
    const retiree = await makePerson(token, "다");
    await updateUserResignationDate(SYSTEM_VIEWER, retiree.userId, addDays(seoulToday(), -1));
    await lock(live.email);
    await lock(control.email);
    await lock(retiree.email);
    await loginAsAdmin(page);
    await openPeople(page, token);

    const retireeRow = personRow(page, retiree.email);
    await expect(statusCell(retireeRow)).toHaveText("퇴직");
    await expect(retireeRow.getByRole("button", { name: "잠금 풀기" })).toHaveCount(0);

    const captured = page.waitForRequest(isActionPost);
    await personRow(page, live.email).getByRole("button", { name: "잠금 풀기" }).click();
    const request = await captured;
    await expect(page.getByRole("status").filter({ hasText: "잠금 풀기 ·" })).toHaveText(`잠금 풀기 · ${live.name}`);

    // 같은 요청 꼴이 통하는지 먼저 본다(대조군) — 그다음 퇴직자에게 보낸 같은 호출은 거부.
    await replay(page, request, live.userId, control.userId);
    await expect.poll(() => openFailures(control.email)).toBe(0);
    const before = await openFailures(retiree.email);
    await replay(page, request, live.userId, retiree.userId);
    expect(await openFailures(retiree.email)).toBe(before);
    expect(before).toBeGreaterThan(0);
  });

  test("부록 ND — 이메일 대소문자가 다른 실패 행도 `잠김`으로 센다", async ({ page }) => {
    const token = `잠김E2E${randomUUID().slice(0, 6)}`;
    const a = await makePerson(token, "가");
    await lock(a.email.toUpperCase());
    await loginAsAdmin(page);
    await openPeople(page, token);
    await expect(statusCell(personRow(page, a.email))).toHaveText("잠김");
  });

  test("admin.people 쓰기 없는 계정 — 링크 없음 · 액션 직접 호출 거부", async ({ page, browser }) => {
    const token = `잠김E2E${randomUUID().slice(0, 6)}`;
    const a = await makePerson(token, "가");
    const b = await makePerson(token, "나");
    await lock(a.email);
    await lock(b.email);
    await loginAsAdmin(page);
    await openPeople(page, token);
    const captured = page.waitForRequest(isActionPost);
    await personRow(page, a.email).getByRole("button", { name: "잠금 풀기" }).click();
    const request = await captured;

    const viewer = await createDelegatedAccount({
      menus: [{ menu: "admin.people", action: "view" }],
      infoItems: ["person.value"],
    });
    const viewerPage = await loginAs(browser, viewer.email, viewer.password);
    await openPeople(viewerPage, token);
    await expect(statusCell(personRow(viewerPage, b.email))).toHaveText("잠김");
    await expect(viewerPage.getByRole("button", { name: "잠금 풀기" })).toHaveCount(0);
    const before = await openFailures(b.email);
    await replay(viewerPage, request, a.userId, b.userId);
    expect(await openFailures(b.email)).toBe(before);
    await viewerPage.context().close();
  });

  test("풀린 뒤 올바른 비밀번호로 로그인된다", async ({ page, browser }) => {
    const token = `잠김E2E${randomUUID().slice(0, 6)}`;
    const a = await makePerson(token, "가");
    await lock(a.email);
    await loginAsAdmin(page);
    await openPeople(page, token);
    await personRow(page, a.email).getByRole("button", { name: "잠금 풀기" }).click();
    await expect(page.getByRole("status").filter({ hasText: "잠금 풀기 ·" })).toHaveText(`잠금 풀기 · ${a.name}`);
    const personPage = await loginAs(browser, a.email, a.password);
    await personPage.context().close();
  });
});
