import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page, type Request } from "@playwright/test";
import { createAccount } from "@/domain/auth/accounts";
import { lockoutConfig, windowStart } from "@/domain/auth/lockout";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
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

// 07-17 Task 2(U1 · U2 · U6): `잠김 N` 끝 링크 · `?locked=1` · 이름 · 이메일 검색 · EMPTY. 잠긴 수는 회사 전체(공유 시험 DB에서 다른 스펙이
// 바꿀 수 있다)라 정확한 수 대신 같은 화면 안의 증감으로 본다 — 0이면 링크가 없는 갈래는 단위 시험(people-list-hidden-id)이 고정한다.
test.describe("사람 목록 잠김 N · 검색 · 쪽 (SC-11 Task 2)", () => {
  function lockedLink(page: Page) {
    return page.getByRole("search", { name: "사람 검색" }).getByRole("link", { name: /^잠김 \d+$/ });
  }

  async function lockedCount(page: Page): Promise<number> {
    const text = await lockedLink(page).textContent();
    return Number(text?.replace("잠김 ", ""));
  }

  test("`잠김 N`을 누르면 ?locked=1 · 잠긴 재직자만, 필터 중 풀면 그 행이 빠지고 결과 줄과 N-1, 다 풀면 EMPTY", async ({ page }) => {
    const token = `잠김E2E${randomUUID().slice(0, 6)}`;
    const a = await makePerson(token, "가");
    const b = await makePerson(token, "나");
    const free = await makePerson(token, "다");
    await lock(a.email);
    await lock(b.email);
    await loginAsAdmin(page);
    await page.goto("/admin/people");
    await expect(lockedLink(page)).toBeVisible();
    await lockedLink(page).click();
    await expect(page).toHaveURL(/[?&]locked=1(&|$)/);

    await page.goto(`/admin/people?locked=1&q=${encodeURIComponent(token)}`);
    await expect(personRow(page, a.email)).toHaveCount(1);
    await expect(personRow(page, b.email)).toHaveCount(1);
    await expect(personRow(page, free.email)).toHaveCount(0);
    const before = await lockedCount(page);

    await personRow(page, a.email).getByRole("button", { name: "잠금 풀기" }).click();
    const result = page.getByRole("status").filter({ hasText: "잠금 풀기 ·" });
    await expect(result).toHaveText(`잠금 풀기 · ${a.name}`);
    await expect(personRow(page, a.email)).toHaveCount(0);
    await expect.poll(() => lockedCount(page)).toBe(before - 1);

    await personRow(page, b.email).getByRole("button", { name: "잠금 풀기" }).click();
    await expect(result).toHaveText(`잠금 풀기 · ${b.name}`);
    await expect(page.getByText("조건에 맞는 사람이 없습니다")).toBeVisible();
    await expect(page.getByRole("link", { name: "필터 지우기" })).toBeVisible();
    // 행이 빠졌으니 포커스는 결과 줄로.
    await expect(result).toBeFocused();
    if (before - 2 === 0) await expect(lockedLink(page)).toHaveCount(0);
  });

  test("검색칸에 이메일 일부 → Enter → 그 사람, `지우기` → 전체, 결과 0 → EMPTY + `필터 지우기`", async ({ page }) => {
    const token = `검색E2E${randomUUID().slice(0, 6)}`;
    const a = await makePerson(token, "가");
    await loginAsAdmin(page);
    await page.goto("/admin/people");
    const search = page.getByRole("searchbox", { name: "검색" });
    await search.fill(a.email.slice(0, 24));
    await search.press("Enter");
    await expect(page).toHaveURL(/[?&]q=/);
    await expect(personRow(page, a.email)).toHaveCount(1);
    await expect(page.locator("tbody tr:has(th[scope='row'])")).toHaveCount(1);

    await page.getByRole("search", { name: "사람 검색" }).getByRole("link", { name: "지우기" }).click();
    await expect(page).toHaveURL(/\/admin\/people$/);
    await expect(page.getByRole("searchbox", { name: "검색" })).toHaveValue("");

    await page.getByRole("searchbox", { name: "검색" }).fill(`없는사람${randomUUID()}`);
    await page.getByRole("searchbox", { name: "검색" }).press("Enter");
    await expect(page.getByText("조건에 맞는 사람이 없습니다")).toBeVisible();
    await page.getByRole("link", { name: "필터 지우기" }).click();
    await expect(page).toHaveURL(/\/admin\/people$/);
  });

  test("50명/쪽 — 51명이 넘는 검색 결과는 페이지 줄이 있고 2쪽으로 간다", async ({ page }) => {
    const token = `쪽E2E${randomUUID().slice(0, 6)}`;
    for (let i = 0; i < 51; i += 1) await makePerson(token, String(i).padStart(2, "0"));
    await loginAsAdmin(page);
    await page.goto(`/admin/people?q=${encodeURIComponent(token)}`);
    await expect(page.locator("tbody tr:has(th[scope='row'])")).toHaveCount(50);
    const nav = page.getByRole("navigation", { name: "사람 페이지" });
    await expect(page.getByText("1–50 / 51명")).toBeVisible();
    await nav.getByRole("link", { name: "2", exact: true }).click();
    await expect(page).toHaveURL(/[?&]page=2/);
    await expect(page.locator("tbody tr:has(th[scope='row'])")).toHaveCount(1);
  });
});

// 07-17 Task 3(U1 · U2 · R15 · SC-12 · D-P2-2 · D-P2-7 · N4): 사람 상세 로그인 섹션 · 비밀번호 초기화 결과 단계 · 상한 밖 숨김.
test.describe("사람 상세 로그인 섹션 · 비밀번호 초기화 (SC-12 Task 3)", () => {
  const loginSection = (page: Page) => page.getByRole("region", { name: "로그인" });
  const loginStatusValue = (page: Page) => loginSection(page).locator("dt:text-is('로그인 상태') + dd");

  test("잠김 → 3차 `잠금 풀기` → 값만 바뀐다(토스트 · 결과 줄 없음), 포커스는 `비밀번호 초기화`", async ({ page }) => {
    const token = `상세E2E${randomUUID().slice(0, 6)}`;
    const a = await makePerson(token, "가");
    await lock(a.email);
    await loginAsAdmin(page);
    await page.goto(`/admin/people/${a.userId}`);
    await expect(loginStatusValue(page)).toHaveText("잠김");
    await expect(loginSection(page).getByRole("button", { name: "비밀번호 초기화" })).toBeVisible();
    await loginSection(page).getByRole("button", { name: "잠금 풀기" }).click();
    await expect(loginStatusValue(page)).toHaveText("임시 비밀번호 사용 중");
    await expect(loginSection(page).getByRole("button", { name: "잠금 풀기" })).toHaveCount(0);
    await expect(page.locator("[class*='Toast-module__']")).toHaveCount(0);
    await expect(loginSection(page).getByRole("button", { name: "비밀번호 초기화" })).toBeFocused();
    expect(await openFailures(a.email)).toBe(0);
  });

  test("D-728 — 퇴직 + 잠김은 값 `퇴직` · `잠금 풀기` 없음, 정상(안 잠김)도 `잠금 풀기` 없음", async ({ page }) => {
    const token = `상세E2E${randomUUID().slice(0, 6)}`;
    const retiree = await makePerson(token, "퇴");
    const free = await makePerson(token, "정");
    await updateUserResignationDate(SYSTEM_VIEWER, retiree.userId, addDays(seoulToday(), -1));
    await lock(retiree.email);
    await loginAsAdmin(page);
    await page.goto(`/admin/people/${retiree.userId}`);
    await expect(loginStatusValue(page)).toHaveText("퇴직");
    await expect(page.getByRole("button", { name: "잠금 풀기" })).toHaveCount(0);
    await page.goto(`/admin/people/${free.userId}`);
    await expect(loginStatusValue(page)).toHaveText("임시 비밀번호 사용 중");
    await expect(page.getByRole("button", { name: "잠금 풀기" })).toHaveCount(0);
    await expect(loginSection(page).getByRole("button", { name: "비밀번호 초기화" })).toBeVisible();
  });

  test("U1 — 결과 단계: 값 선택된 채 · Esc · 바깥 누름 무시 · `복사됨` · `복사 실패 · 직접 선택` · `닫기` 뒤 값 파기 · 임시 비밀번호로 로그인(잠금도 풀림)", async ({ page, browser, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const token = `상세E2E${randomUUID().slice(0, 6)}`;
    const a = await makePerson(token, "가");
    await lock(a.email);
    await loginAsAdmin(page);
    await page.goto(`/admin/people/${a.userId}`);
    const trigger = loginSection(page).getByRole("button", { name: "비밀번호 초기화" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "비밀번호 초기화" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("기존 비밀번호는 쓸 수 없게 됨 · 잠금도 풀림");
    await dialog.getByRole("button", { name: /^비밀번호 초기화/ }).click();

    const value = dialog.locator("[data-ui='confirm-result-value']");
    await expect(value).toBeVisible();
    const temp = (await value.textContent())?.trim() ?? "";
    expect(temp.length).toBeGreaterThan(5);
    await expect(value).toBeFocused();
    // 감사 P2 — 첫 포커스는 이름 있는 값(읽기 전용 textbox `임시 비밀번호`), 라벨 글자가 창에 보인다.
    await expect(dialog.getByRole("textbox", { name: "임시 비밀번호" })).toBeFocused();
    await expect(dialog.getByText("임시 비밀번호", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(temp);
    await expect(dialog).toContainText("닫으면 다시 볼 수 없음");
    await expect(dialog.getByRole("button", { name: "닫기" })).toHaveCount(1);

    // Esc(두 번 — 브라우저 닫기 요청 연타 포함) · 바깥 누름 → 창 · 값 그대로.
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(value).toHaveText(temp);
    await page.mouse.click(5, 5);
    await expect(dialog).toBeVisible();
    await expect(value).toHaveText(temp);

    await dialog.getByRole("button", { name: "복사" }).click();
    await expect(dialog.getByRole("status")).toHaveText("복사됨");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(temp);

    // 클립보드 거부 주입 → 같은 자리 실패 aux · 값 다시 선택.
    await page.evaluate(() => {
      navigator.clipboard.writeText = () => Promise.reject(new Error("denied"));
    });
    await dialog.getByRole("button", { name: "복사됨" }).click();
    await expect(dialog.getByRole("status")).toHaveText("복사 실패 · 직접 선택");
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(temp);

    // 값은 URL · 토스트 · 페이지 HTML 재요청 · 행동 로그 화면에 없다.
    expect(page.url()).not.toContain(temp);
    await expect(page.locator("[class*='Toast-module__']")).toHaveCount(0);
    expect(await (await page.request.get(`/admin/people/${a.userId}`)).text()).not.toContain(temp);
    expect(await (await page.request.get("/admin/action-log")).text()).not.toContain(temp);

    await dialog.getByRole("button", { name: "닫기" }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("[data-ui='confirm-result-value']")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: /^비밀번호 초기화/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    expect(await openFailures(a.email)).toBe(0);
    const personPage = await loginAs(browser, a.email, temp);
    await personPage.goto("/account");
    await expect(personPage.getByText("임시 비밀번호를 쓰고 있습니다 — 바꾸세요.")).toBeVisible();
    await personPage.context().close();
  });

  test("R15 — 상한 밖 대상 상세에는 쓰기 버튼(연차 조정 추가 · 새 이력 추가 · 잠금 풀기 · 비밀번호 초기화)이 없고 이유 한 줄, 직접 호출은 거부", async ({ page, browser }) => {
    const token = `상세E2E${randomUUID().slice(0, 6)}`;
    const victim = await makePerson(token, "가");
    const email = `e2e-unlock-${randomUUID()}@example.test`;
    const { userId: adminId } = await createAccount(SYSTEM_VIEWER, { email, name: `${token}관리자`, roleId: SYSADMIN_ROLE_ID });
    await lock(email);

    // 관리자 화면에서 상한 안 대상의 초기화 요청 꼴을 잡는다.
    await loginAsAdmin(page);
    await page.goto(`/admin/people/${victim.userId}`);
    await loginSection(page).getByRole("button", { name: "비밀번호 초기화" }).click();
    const dialog = page.getByRole("dialog", { name: "비밀번호 초기화" });
    const captured = page.waitForRequest(isActionPost);
    await dialog.getByRole("button", { name: /^비밀번호 초기화/ }).click();
    const request = await captured;
    await expect(dialog.locator("[data-ui='confirm-result-value']")).toBeVisible();

    const delegate = await createDelegatedAccount();
    const delegatePage = await loginAs(browser, delegate.email, delegate.password);
    await delegatePage.goto(`/admin/people/${adminId}`);
    await expect(delegatePage.getByText("계급 지정 권한 없음 · 시스템 관리자", { exact: true })).toBeVisible();
    for (const name of ["연차 조정 추가", "새 이력 추가", "잠금 풀기", "비밀번호 초기화"]) {
      await expect(delegatePage.getByRole("button", { name })).toHaveCount(0);
    }
    await replay(delegatePage, request, victim.userId, adminId);
    // 거부되면 초기화(잠금 해소 포함)가 일어나지 않는다 — 열린 실패가 그대로다.
    expect(await openFailures(email)).toBeGreaterThan(0);
    await delegatePage.context().close();
  });
});
