import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page, type Request } from "@playwright/test";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, certSubmissions, privacySessionActivity, sessions } from "@/db/schema";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { findUserByEmail } from "@/repositories/users";
import { insertRole, setRoleArchived } from "@/repositories/roles";
import { upsertVisibility } from "@/repositories/permissions";
import { createFixtureUser } from "./fixtures";
import { seedSubmittedCert, withCertFeatureOff } from "./helpers/cert";

// 04.3-07 Task 3 — I4 확인증 확인 · 정정(데스크톱). 가림 · 전체 보기 로그 · 가리기 · 고친 값 재열람 ·
// 정정 · 동시 정정 · 브라우저 인쇄 차단 · 권한 404(비활동 시계 안 건드림) · 비활동 만료 · 게이트 꺼짐 직접 POST.
// 전제: 이 권한은 시드 기본값이 아니라 cert.setup이 켠 것이다(E3-13) — role-sysadmin의 certs.submissions(보기 · 쓰기) ·
// cert.rrn_unmasked · cert_submission.value는 test/e2e/cert.setup.ts가 이 스펙보다 먼저 한 번 켠다. 이 스펙은 공유 계급의
// 권한 · 설정을 바꾸지 않고(「보기만」은 이 스펙이 만든 임시 계급), 게이트를 끄는 케이스는 withCertFeatureOff 안에서만 한다(C4).
// 제출 표본은 seedSubmittedCert()만으로 만든다(E3-32). 오류 문구는 사용자 결정 A — 명사형.

test.describe.configure({ mode: "serial" });

const RRN_FULL = "930412-2123458";
const RRN_DIGITS = /\d{6}-?\d{7}/;
const PRINT_LINE = "이 화면은 인쇄하지 않습니다 · 머리의 「인쇄」 버튼으로 확인증을 열어 주세요";

type Account = { email: string; password: string };

let admin: Account;
let admin2: Account;
let pm: Account;

test.beforeAll(async () => {
  admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  admin2 = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
});

async function login(page: Page, account: Account): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function loggedInPage(browser: Browser, account: Account): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, account);
  return page;
}

function isServerAction(request: Request): boolean {
  return request.method() === "POST" && request.headers()["next-action"] !== undefined;
}

async function countLogs(actionType: string, entityId: string): Promise<number> {
  const rows = await db.select().from(actionLog).where(eq(actionLog.actionType, actionType));
  return rows.filter((row) => row.entityId === entityId).length;
}

async function submission(id: string) {
  const [row] = await db.select().from(certSubmissions).where(eq(certSubmissions.id, id));
  if (!row) throw new Error("제출 행 없음");
  return row;
}

async function sessionIdsOf(account: Account): Promise<string[]> {
  const user = await findUserByEmail(SYSTEM_VIEWER, account.email);
  if (!user) throw new Error("사용자 없음");
  const rows = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, user.id));
  return rows.map((row) => row.id);
}

const reviewPath = (id: string) => `/certs/submissions/${id}`;
const notFoundHeading = (page: Page) => page.getByRole("heading", { name: "페이지 찾을 수 없음" });
const saveButton = (page: Page) => page.getByRole("button", { name: "고친 내용 저장" });
// 가린 상태의 「주민등록번호」 묶음(group)과 겹치지 않게 입력 칸은 역할로 찾는다.
const rrnInput = (page: Page) => page.getByRole("textbox", { name: "주민등록번호" });

// 서버 액션 요청을 ms만큼 늦춰 보낸다(대기 중 상태를 재기 위해).
async function delayServerActions(page: Page, ms: number): Promise<void> {
  await page.route("**/certs/submissions/**", async (route) => {
    if (isServerAction(route.request())) await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue();
  });
}

function nextActionResponse(page: Page) {
  return page.waitForResponse((response) => isServerAction(response.request()));
}

async function setVisibility(page: Page, state: "hidden" | "visible"): Promise<void> {
  await page.evaluate((value) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

// 검토 R-M1 — DOM 밖(React 훅 상태 · props)에 문자열이 남았는지. 정정 폼(ReviewForm) 아래 트리만 훑는다.
async function reactStateHas(page: Page, needles: string[]): Promise<boolean> {
  return page.evaluate((targets) => {
    type Fiber = {
      tag: number;
      stateNode: unknown;
      return: Fiber | null;
      child: Fiber | null;
      sibling: Fiber | null;
      memoizedState: unknown;
      memoizedProps: unknown;
    };
    const form = document.getElementById("cert-review-form");
    if (!form) throw new Error("정정 폼 없음");
    const key = Object.keys(form).find((name) => name.startsWith("__reactFiber$"));
    if (!key) throw new Error("React fiber 없음");
    const isReviewForm = (fiber: Fiber): boolean => {
      const props = fiber.memoizedProps;
      // ReviewForm에만 있는 prop 둘(submissionId만으로는 RrnField props와 겹친다 — E4-B7).
      return typeof props === "object" && props !== null && "submissionId" in props && "signatureDataUrl" in props;
    };
    // DOM 노드의 fiber는 지난 렌더의 짝(alternate)일 수 있다 — HostRoot(tag 3)의 FiberRoot.current에서
    // 지금 커밋된 트리를 다시 내려가 ReviewForm을 찾는다.
    let up: Fiber | null = (form as unknown as Record<string, Fiber>)[key] ?? null;
    while (up && up.tag !== 3) up = up.return;
    const committed = (up?.stateNode as { current?: Fiber } | undefined)?.current ?? null;
    let root: Fiber | null = null;
    const search: Fiber[] = committed ? [committed] : [];
    while (search.length > 0 && !root) {
      const fiber = search.pop();
      if (!fiber) break;
      if (isReviewForm(fiber)) root = fiber;
      if (fiber.child) search.push(fiber.child);
      if (fiber.sibling) search.push(fiber.sibling);
    }
    if (!root) throw new Error("ReviewForm 없음");

    const seen = new Set<object>();
    const hit = (value: unknown, depth: number): boolean => {
      if (typeof value === "string") return targets.some((target) => value.includes(target));
      if (value === null || typeof value !== "object" || depth > 12 || seen.has(value)) return false;
      seen.add(value);
      if (value instanceof Node) return false;
      if ("return" in value && "memoizedProps" in value) return false; // 다른 fiber — 트리 순회가 따로 본다
      for (const name of Object.keys(value)) {
        let inner: unknown;
        try {
          inner = (value as Record<string, unknown>)[name];
        } catch {
          continue;
        }
        if (hit(inner, depth + 1)) return true;
      }
      return false;
    };

    const stack: Fiber[] = [root];
    while (stack.length > 0) {
      const fiber = stack.pop();
      if (!fiber) break;
      if (hit(fiber.memoizedState, 0) || hit(fiber.memoizedProps, 0)) return true;
      if (fiber.child) stack.push(fiber.child);
      if (fiber !== root && fiber.sibling) stack.push(fiber.sibling);
    }
    return false;
  }, needles);
}

// 폰 제출 줄(sticky)의 위쪽 좌표 — 저장 버튼에서 위로 올라가 sticky 조상을 찾는다.
async function stickyBarTop(page: Page): Promise<number> {
  return page.evaluate(() => {
    let node = document.querySelector("#cert-review-form button[type=submit]")?.parentElement ?? null;
    while (node && getComputedStyle(node).position !== "sticky") node = node.parentElement;
    if (!node) throw new Error("sticky 제출 줄 없음");
    return node.getBoundingClientRect().top;
  });
}

test("가림 · 전체 보기(로그) · 가리기 · 연락처 정정 · 동시 정정 · 다시 불러오기", async ({ page, browser }) => {
  const seeded = await seedSubmittedCert();
  await login(page, admin);
  await page.goto(reviewPath(seeded.submissionId));

  await expect(page.getByRole("heading", { name: `기타소득 확인증 — ${seeded.name}` })).toBeVisible();
  // 문서 제목(브라우저 기록 · 탭)에 수령자 이름이 없다 — 고정 제목.
  await expect(page).toHaveTitle("확인증 확인");
  await expect(page).not.toHaveTitle(new RegExp(seeded.name));
  await expect(page.getByText("930412-2******")).toBeVisible();
  expect(await page.content()).not.toContain(RRN_FULL);
  expect(await page.content()).not.toContain("2123458");
  await expect(page.getByLabel("주소")).toHaveCount(0); // 현장 수령
  await expect(page.getByText("수령자 서명 · 고칠 수 없음")).toBeVisible();
  await expect(page.getByText("바뀐 칸 없음")).toBeVisible();

  await page.getByRole("button", { name: "전체 보기" }).click();
  await expect(rrnInput(page)).toHaveValue(RRN_FULL);
  expect(await countLogs("mask_reveal", seeded.submissionId)).toBe(1);

  await page.getByRole("button", { name: "가리기" }).click();
  await expect(page.getByText("930412-2******")).toBeVisible();
  await expect(rrnInput(page)).toHaveCount(0);
  expect(await page.content()).not.toContain(RRN_FULL);

  await page.getByLabel("연락처").fill("010-5555-6666");
  await saveButton(page).click();
  await expect(page.getByText(/^저장됨 · 연락처 · \d{2}:\d{2}$/)).toBeVisible();
  const logs = (await db.select().from(actionLog).where(eq(actionLog.actionType, "cert_correct"))).filter(
    (row) => row.entityId === seeded.submissionId,
  );
  expect(logs).toHaveLength(1);
  // 04.3-14 사용자 결정 ⑤ — 정정 기록에 접속지 · 확인증 id(로컬 서버는 소켓 주소가 접속지).
  expect(logs[0]?.detail).toMatchObject({ fields: ["연락처"], submissionId: seeded.submissionId });
  expect(typeof (logs[0]?.detail as { ip?: unknown }).ip).toBe("string");

  // 두 번째 브라우저 컨텍스트가 이름을 먼저 저장 → 첫 컨텍스트 저장은 충돌
  const other = await loggedInPage(browser, admin2);
  await other.goto(reviewPath(seeded.submissionId));
  await other.getByLabel("이름").fill("김하나");
  await saveButton(other).click();
  await expect(other.getByText(/^저장됨 · 이름 · /)).toBeVisible();
  await other.context().close();

  await page.getByLabel("연락처").fill("010-7777-8888");
  await saveButton(page).click();
  await expect(page.getByText(/저장 실패 · .+ \d{2}:\d{2}에 먼저 고침 · 다시 불러오기/)).toBeVisible();
  await expect(page.getByLabel("연락처")).toHaveValue("010-7777-8888");
  expect((await submission(seeded.submissionId)).phone).toBe("01055556666");

  await page.getByRole("button", { name: "다시 불러오기" }).click();
  await expect(page.getByLabel("이름")).toHaveValue("김하나");
  await expect(page.getByLabel("연락처")).toHaveValue("010-5555-6666");
});

test("택배는 주소 칸 · 주민등록번호를 고쳐 가리면 「저장 안 함」 · 다시 전체 보기는 기록 뒤 고친 값으로 · 저장 뒤 가림", async ({
  page,
}) => {
  const seeded = await seedSubmittedCert({ delivery: "parcel", address: "서울시 강남구 테헤란로 1" });
  await login(page, admin);
  await page.goto(reviewPath(seeded.submissionId));
  await expect(page.getByLabel("주소")).toHaveValue("서울시 강남구 테헤란로 1");

  await page.getByRole("button", { name: "전체 보기" }).click();
  await rrnInput(page).fill("930412-1234564");
  await page.getByRole("button", { name: "가리기" }).click();
  await expect(page.getByText("930412-1****** · 저장 안 함")).toBeVisible();
  expect(await page.content()).not.toContain("930412-1234564");
  expect(await countLogs("mask_reveal", seeded.submissionId)).toBe(1);

  await page.getByRole("button", { name: "전체 보기" }).click();
  await expect(rrnInput(page)).toHaveValue("930412-1234564");
  expect(await countLogs("mask_reveal", seeded.submissionId)).toBe(2);

  await saveButton(page).click();
  await expect(page.getByText(/^저장됨 · 주민등록번호 · \d{2}:\d{2}$/)).toBeVisible();
  await expect(page.getByText("930412-1******")).toBeVisible();
  await expect(rrnInput(page)).toHaveCount(0);
  expect((await submission(seeded.submissionId)).rrnMasked).toBe("930412-1******");
});

test("브라우저 인쇄 미디어에서는 인쇄 차단 한 줄만 보인다", async ({ page }) => {
  const seeded = await seedSubmittedCert();
  await login(page, admin);
  await page.goto(reviewPath(seeded.submissionId));
  await expect(page.getByText("930412-2******")).toBeVisible();

  await page.emulateMedia({ media: "print" });
  const visibleText = (await page.locator("body").innerText()).trim();
  expect(visibleText).toBe(PRINT_LINE);
  await page.emulateMedia({ media: "screen" });
  await expect(page.getByText(PRINT_LINE)).toBeHidden();
});

test("기획 PM은 404이고 PM 세션의 비활동 활동 행이 생기지 않는다(RB-5)", async ({ page }) => {
  const seeded = await seedSubmittedCert();
  await login(page, pm);
  await page.goto(reviewPath(seeded.submissionId));
  await expect(notFoundHeading(page)).toBeVisible();
  expect(await page.content()).not.toContain(seeded.name);

  const ids = await sessionIdsOf(pm);
  expect(ids.length).toBeGreaterThan(0);
  const rows = await db.select().from(privacySessionActivity).where(inArray(privacySessionActivity.sessionId, ids));
  expect(rows).toHaveLength(0);
});

test("비활동 만료 — 활동 행을 31분 전으로 돌리고(기본 30) 새로 고치면 로그인 화면", async ({ page }) => {
  const seeded = await seedSubmittedCert();
  const account = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await login(page, account);
  await page.goto(reviewPath(seeded.submissionId));
  await expect(page.getByText("930412-2******")).toBeVisible();

  const ids = await sessionIdsOf(account);
  await db
    .update(privacySessionActivity)
    .set({ lastSeenAt: new Date(Date.now() - 31 * 60_000) })
    .where(inArray(privacySessionActivity.sessionId, ids));
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
});

test("게이트 꺼짐 — 잡아 둔 세 액션을 직접 보내도 평문 · 로그 · 변경이 없고, 관리자 · PM 모두 I4가 404", async ({
  page,
  browser,
}) => {
  const seeded = await seedSubmittedCert();
  await login(page, admin);
  await page.goto(reviewPath(seeded.submissionId));

  const captured: Request[] = [];
  page.on("request", (request) => {
    if (isServerAction(request)) captured.push(request);
  });

  await page.getByRole("button", { name: "전체 보기" }).click();
  await rrnInput(page).fill("930412-1234564");
  await page.getByRole("button", { name: "가리기" }).click();
  await page.getByRole("button", { name: "전체 보기" }).click();
  await expect(rrnInput(page)).toHaveValue("930412-1234564");
  await rrnInput(page).fill(RRN_FULL);
  await page.getByLabel("연락처").fill("010-5555-6666");
  await saveButton(page).click();
  await expect(page.getByText(/^저장됨 · /)).toBeVisible();
  expect(captured).toHaveLength(3);

  const before = {
    reveal: await countLogs("mask_reveal", seeded.submissionId),
    correct: await countLogs("cert_correct", seeded.submissionId),
    version: (await submission(seeded.submissionId)).version,
  };

  await withCertFeatureOff(async () => {
    for (const request of captured) {
      const response = await page.request.post(request.url(), {
        headers: {
          "next-action": request.headers()["next-action"]!,
          "content-type": request.headers()["content-type"] ?? "text/plain;charset=UTF-8",
        },
        data: request.postData() ?? "",
      });
      const body = await response.text();
      expect(body).not.toMatch(RRN_DIGITS);
      expect(body).not.toContain("saved");
    }

    expect(await countLogs("mask_reveal", seeded.submissionId)).toBe(before.reveal);
    expect(await countLogs("cert_correct", seeded.submissionId)).toBe(before.correct);
    expect((await submission(seeded.submissionId)).version).toBe(before.version);

    await page.goto(reviewPath(seeded.submissionId));
    await expect(notFoundHeading(page)).toBeVisible();
    const pmPage = await loggedInPage(browser, pm);
    await pmPage.goto(reviewPath(seeded.submissionId));
    await expect(notFoundHeading(pmPage)).toBeVisible();
    await pmPage.context().close();
  });
});

// ── 04.3-07 검토 · 독립 DOM 감사 반영 ────────────────────────────────────────────────

test("전체 보기 뒤 가리기 · 번호 저장 뒤에는 React 상태에도 평문이 남지 않는다(검토 R-M1)", async ({ page }) => {
  const seeded = await seedSubmittedCert();
  await login(page, admin);
  await page.goto(reviewPath(seeded.submissionId));

  await page.getByRole("button", { name: "전체 보기" }).click();
  await expect(rrnInput(page)).toHaveValue(RRN_FULL);
  expect(await reactStateHas(page, ["2123458"])).toBe(true); // 훑개가 연 상태의 평문은 찾는다

  await page.getByRole("button", { name: "가리기" }).click();
  await expect(rrnInput(page)).toHaveCount(0);
  await expect.poll(() => reactStateHas(page, ["2123458"])).toBe(false);

  await page.getByRole("button", { name: "전체 보기" }).click();
  await rrnInput(page).fill("930412-1234564");
  await saveButton(page).click();
  await expect(page.getByText(/^저장됨 · 주민등록번호 · \d{2}:\d{2}$/)).toBeVisible();
  await expect.poll(() => reactStateHas(page, ["2123458", "1234564"])).toBe(false);
});

test("화면이 가려진 동안 늦게 온 전체 보기 응답은 칸을 열지 않는다(검토 R-L5)", async ({ page }) => {
  const seeded = await seedSubmittedCert();
  await login(page, admin);
  await page.goto(reviewPath(seeded.submissionId));
  await delayServerActions(page, 1000);

  const response = nextActionResponse(page);
  await page.getByRole("button", { name: "전체 보기" }).click();
  await setVisibility(page, "hidden");
  await response;
  await expect.poll(() => countLogs("mask_reveal", seeded.submissionId)).toBe(1);

  // 응답 처리가 끝날 때까지(대기 중 「전체 보기」가 사라질 때까지) 기다린 뒤 잰다.
  await expect(page.locator('button[aria-disabled="true"]', { hasText: "전체 보기" })).toHaveCount(0);
  await expect(rrnInput(page)).toHaveCount(0);
  await expect.poll(() => reactStateHas(page, ["2123458"])).toBe(false);
  await setVisibility(page, "visible");
  await expect(page.getByText("930412-2******")).toBeVisible();
});

test("세션이 없어진 뒤 전체 보기 · 저장은 로그인 화면으로 보낸다(검토 R-L2)", async ({ page }) => {
  const seeded = await seedSubmittedCert();
  const account = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  const dropSessions = async () => {
    await db.delete(sessions).where(inArray(sessions.id, await sessionIdsOf(account)));
  };

  await login(page, account);
  await page.goto(reviewPath(seeded.submissionId));
  await dropSessions();
  await page.getByRole("button", { name: "전체 보기" }).click();
  await expect(page).toHaveURL(/\/login/);

  await login(page, account);
  await page.goto(reviewPath(seeded.submissionId));
  await page.getByLabel("연락처").fill("010-5555-6666");
  await dropSessions();
  await saveButton(page).click();
  await expect(page).toHaveURL(/\/login/);
  expect((await submission(seeded.submissionId)).version).toBe(1);
});

test("액션 단 비활동 만료는 로그인으로 · 화면 가림 · 입력 3분 없으면 저절로 가린다(검토 R-L6 · 결정 ③)", async ({ page }) => {
  const seeded = await seedSubmittedCert();
  const account = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await login(page, account);
  await page.goto(reviewPath(seeded.submissionId));

  await page.getByRole("button", { name: "전체 보기" }).click();
  await expect(rrnInput(page)).toHaveValue(RRN_FULL);
  await setVisibility(page, "hidden");
  await expect(rrnInput(page)).toHaveCount(0);
  await setVisibility(page, "visible");

  await page.clock.install();
  await page.goto(reviewPath(seeded.submissionId));
  await page.getByRole("button", { name: "전체 보기" }).click();
  await expect(rrnInput(page)).toHaveValue(RRN_FULL);
  await page.clock.fastForward("03:05");
  await expect(rrnInput(page)).toHaveCount(0);
  await expect.poll(() => reactStateHas(page, ["2123458"])).toBe(false);

  await db
    .update(privacySessionActivity)
    .set({ lastSeenAt: new Date(Date.now() - 31 * 60_000) })
    .where(inArray(privacySessionActivity.sessionId, await sessionIdsOf(account)));
  await page.getByRole("button", { name: "전체 보기" }).click();
  await expect(page).toHaveURL(/\/login\?reason=privacy-session&next=/);
});

test("저장 대기 중에는 칸 · 가리기가 잠기고, 결과는 보낸 값 기준이다(DOM 감사 H1 · L1)", async ({ page }) => {
  const seeded = await seedSubmittedCert();
  await login(page, admin);
  await page.goto(reviewPath(seeded.submissionId));
  await page.getByRole("button", { name: "전체 보기" }).click();
  await expect(rrnInput(page)).toHaveValue(RRN_FULL);
  await page.getByLabel("연락처").fill("010-5555-6666");
  await delayServerActions(page, 1500);

  const response = nextActionResponse(page);
  await saveButton(page).click();
  await expect(page.getByLabel("이름")).toHaveAttribute("readonly", "");
  await expect(page.getByLabel("연락처")).toHaveAttribute("readonly", "");
  await expect(rrnInput(page)).toHaveAttribute("readonly", "");
  await expect(page.getByRole("button", { name: "가리기" })).toHaveAttribute("aria-disabled", "true");
  await page.getByLabel("이름").focus();
  await page.keyboard.type("가");
  await expect(page.getByLabel("이름")).toHaveValue(seeded.name);
  await response;

  await expect(page.getByText(/^저장됨 · 연락처 · \d{2}:\d{2}$/)).toBeVisible();
  expect((await submission(seeded.submissionId)).name).toBe(seeded.name);
  await expect(page.getByLabel("이름")).toHaveValue(seeded.name);

  // 전체 보기 대기 중에도 바뀐 칸이 있는 저장은 잠긴다
  await page.getByLabel("연락처").fill("010-7777-8888");
  const revealResponse = nextActionResponse(page);
  await page.getByRole("button", { name: "전체 보기" }).click();
  await expect(saveButton(page)).toHaveAttribute("aria-disabled", "true");
  await revealResponse;
  await expect(rrnInput(page)).toHaveValue(RRN_FULL);
  await expect(saveButton(page)).not.toHaveAttribute("aria-disabled", "true");
});

test("가린 주민등록번호는 이름 붙은 묶음이고 「전체 보기」가 번호 오류 줄을 가리킨다(DOM 감사 M1)", async ({ page }) => {
  const seeded = await seedSubmittedCert();
  await login(page, admin);
  await page.goto(reviewPath(seeded.submissionId));
  await expect(page.getByRole("group", { name: "주민등록번호" })).toContainText("930412-2******");

  await page.getByRole("button", { name: "전체 보기" }).click();
  await rrnInput(page).fill("931312-1234567");
  await saveButton(page).click();
  await expect(page.locator("#cert-review-rrn-error")).toHaveText("주민등록번호 맞지 않음 · 앞 6자리와 뒤 7자리 확인");
  await page.getByRole("button", { name: "가리기" }).click();

  await expect(page.getByRole("group", { name: "주민등록번호" })).toContainText("저장 안 함");
  const describedBy = await page.getByRole("button", { name: "전체 보기" }).getAttribute("aria-describedby");
  expect(describedBy?.split(" ")).toContain("cert-review-rrn-error");
});

test("정정 주민등록번호 되물음 — 검증번호 불일치는 첫 저장이 오류 줄만 · 같은 번호 다시 저장은 저장 · 번호를 고치면 다시 되묻는다", async ({ page }) => {
  const seeded = await seedSubmittedCert();
  await login(page, admin);
  await page.goto(reviewPath(seeded.submissionId));
  const before = (await submission(seeded.submissionId)).rrnMasked;

  await page.getByRole("button", { name: "전체 보기" }).click();
  await rrnInput(page).fill("930412-1234560");
  await saveButton(page).click();
  await expect(page.locator("#cert-review-rrn-error")).toHaveText("주민등록번호 맞지 않음 · 앞 6자리와 뒤 7자리 확인");
  expect((await submission(seeded.submissionId)).rrnMasked).toBe(before);

  await rrnInput(page).fill("930412-1234561");
  await saveButton(page).click();
  await expect(page.locator("#cert-review-rrn-error")).toBeVisible();
  expect((await submission(seeded.submissionId)).rrnMasked).toBe(before);

  await rrnInput(page).fill("930412-1234561");
  await saveButton(page).click();
  await expect(page.getByText(/^저장됨 · 주민등록번호 · \d{2}:\d{2}$/)).toBeVisible();
  expect((await submission(seeded.submissionId)).rrnMasked).toBe("930412-1******");
});

test("저장 결과 · 실패는 늘 있는 알림 영역에서 읽히고, 성공하면 포커스가 제목으로 간다(DOM 감사 M2 · M3)", async ({ page }) => {
  const seeded = await seedSubmittedCert();
  await login(page, admin);
  await page.goto(reviewPath(seeded.submissionId));
  const live = page.locator('#cert-review-form [aria-live="polite"]');
  await expect(live).toHaveCount(1);

  await page.getByLabel("연락처").fill("02-1");
  await saveButton(page).click();
  await expect(live).toContainText("저장 실패 · 연락처 1칸");

  await page.getByLabel("연락처").fill("010-5555-6666");
  await saveButton(page).click();
  await expect(live).toContainText(/저장됨 · 연락처 · \d{2}:\d{2}/);
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
});

test("폰 — 1차 저장은 44 높이 · 넓게, 포커스된 주소 칸이 제출 줄에 가리지 않는다(DOM 감사 M4 · L2)", async ({ page }) => {
  const seeded = await seedSubmittedCert({ delivery: "parcel", address: "서울시 강남구 테헤란로 1" });
  await login(page, admin);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(reviewPath(seeded.submissionId));
  const box = await saveButton(page).boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(box?.width).toBeGreaterThanOrEqual(195);

  await page.setViewportSize({ width: 320, height: 640 });
  const address = page.getByLabel("주소");
  const assertAddressClear = async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await address.focus();
    const rect = await address.boundingBox();
    expect((rect?.y ?? 0) + (rect?.height ?? 0)).toBeLessThanOrEqual(await stickyBarTop(page));
  };
  await assertAddressClear();

  await address.fill("");
  await saveButton(page).click();
  await expect(page.locator("#cert-review-address-error")).toBeVisible();
  await assertAddressClear();
});

test("보기만 계급은 값이 입력 칸이 아니라 글자다(DOM 감사 L3)", async ({ page }) => {
  const roleId = `role-e2e-cert-view-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id: roleId, name: `E2E 보기만 ${roleId.slice(-12)}`, sortOrder: 99 });
  await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "certs.submissions", action: "view", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "cert_submission.value", visible: true });
  const viewer = await createFixtureUser({ roleId });
  const seeded = await seedSubmittedCert({ delivery: "parcel", address: "서울시 강남구 테헤란로 1" });

  try {
    await login(page, viewer);
    await page.goto(reviewPath(seeded.submissionId));
    await expect(page.getByText("930412-2******")).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByRole("definition").filter({ hasText: "010-4821-7730" })).toBeVisible();
    await expect(page.getByRole("definition").filter({ hasText: "서울시 강남구 테헤란로 1" })).toBeVisible();
    await expect(saveButton(page)).toHaveCount(0);
  } finally {
    await setRoleArchived(SYSTEM_VIEWER, roleId, true);
  }
});

// PR #88 /review F2 — 화면을 연 뒤 권한이 거둬지면 정정 거부는 「다시 시도」가 아니라 확정 사실 줄(대조 제외 거부와 같은 꼴).
test("화면을 연 뒤 제출 내용 항목이 꺼지면 저장은 「저장 실패 · 권한 없음」 · 다시 시도 · 다시 불러오기 없음 · 무변경", async ({ page }) => {
  const roleId = `role-e2e-cert-revoke-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id: roleId, name: `E2E 거둠 ${roleId.slice(-12)}`, sortOrder: 99 });
  await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "certs.submissions", action: "view", allowed: true });
  await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "certs.submissions", action: "write", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "cert_submission.value", visible: true });
  const writer = await createFixtureUser({ roleId });
  const seeded = await seedSubmittedCert();

  try {
    await login(page, writer);
    await page.goto(reviewPath(seeded.submissionId));
    await page.getByLabel("연락처").fill("010-5555-6666");
    await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "cert_submission.value", visible: false });
    await saveButton(page).click();
    await expect(page.getByText("저장 실패 · 권한 없음", { exact: true })).toBeVisible();
    await expect(page.getByText("저장 실패 · 다시 시도")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "다시 불러오기" })).toHaveCount(0);
    expect((await submission(seeded.submissionId)).phone).toBe("01048217730");
  } finally {
    await setRoleArchived(SYSTEM_VIEWER, roleId, true);
  }
});

// 04.3-17 — I4 `수량` 정정(N3 a · E30): 짧은 칸 · 「고친 내용 저장」 · 결과 줄 · 새로 고친 뒤 값.
test("수량 정정 — 3 → 고친 내용 저장 → 결과 줄 · 새로 고친 뒤 3", async ({ page }) => {
  const seeded = await seedSubmittedCert();
  await login(page, admin);
  await page.goto(reviewPath(seeded.submissionId));
  const quantity = page.getByRole("textbox", { name: "수량" });
  await expect(quantity).toHaveValue("1");
  await quantity.fill("3");
  await saveButton(page).click();
  await expect(page.getByText(/^저장됨 · 수량 · \d{2}:\d{2}$/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "수량" })).toHaveValue("3");
  expect((await submission(seeded.submissionId)).quantity).toBe(3);
});

// 04.3-17 ⑥-b — 「주민번호만 비운 I4」(CS-2 a — UI-SPEC 「개정 (2026-10-01 결정 확정)」 Copywriting): 열린다 · 값 `—` ·
// 전체 보기 · 인쇄 없음(인쇄 라우트 404) · 태그 · 부제 추가 없음 · 연락처 정정 칸은 있다.
test("주민번호만 비운 I4 — 열림 · 주민등록번호 `—` · 전체 보기 · 인쇄 0 · 연락처 칸 있음 · 인쇄 라우트 404", async ({ page }) => {
  const seeded = await seedSubmittedCert();
  await db.update(certSubmissions).set({ rrnEncrypted: null, rrnMasked: null }).where(eq(certSubmissions.id, seeded.submissionId));
  await login(page, admin);
  await page.goto(reviewPath(seeded.submissionId));
  await expect(notFoundHeading(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(seeded.name);
  await expect(page.getByRole("group", { name: "주민등록번호" })).toHaveText("—");
  await expect(page.getByRole("button", { name: "전체 보기" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /인쇄/ })).toHaveCount(0);
  // 머리 태그는 그대로 `제출됨`(태그 · 부제 추가 없음 — 「대조 제외」 태그가 아니다).
  await expect(page.getByText("제출됨", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "연락처" })).toBeVisible();
  // 인쇄 라우트는 404 화면(스트리밍 응답이라 HTTP 상태가 아니라 404 제목으로 본다 — cert-print.spec 선례).
  await page.goto(`/print/certs/${seeded.submissionId}`);
  await expect(notFoundHeading(page)).toBeVisible();
});

// 04.3-14 Task 1(사용자 결정 ⑤ · E4-B2 · E4-B11) — I4를 열 때마다 끌 수 없는 cert_view 한 줄(접속지 IP · 확인증 id).
// 미리 가져오기는 프로덕션 빌드(CI=true)에서만 켜진다 — I3를 열고 끝까지 스크롤하고 링크 위에 머무는 동안 0줄이어야 한다.
test("접속기록 cert_view — I3 로드 · 스크롤 · 링크 머무름 0줄 · 누르면 1줄(IP) · 새로 고치면 2줄", async ({ page }) => {
  const IP = "203.0.113.7";
  const seeded = await seedSubmittedCert();
  await page.setExtraHTTPHeaders({ "x-forwarded-for": IP });
  await login(page, admin);

  const viewRows = async () =>
    (await db.select().from(actionLog).where(eq(actionLog.actionType, "cert_view"))).filter(
      (row) => row.entityId === seeded.submissionId,
    );
  const base = (await viewRows()).length;

  const reviewRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes(`/certs/submissions/${seeded.submissionId}`)) reviewRequests.push(request.url());
  });

  await page.goto(`/certs/events/${seeded.eventId}`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const link = page.getByRole("link", { name: new RegExp(`^제출 내용 · ${seeded.name} · `) });
  await link.scrollIntoViewIfNeeded();
  await expect(link).toBeVisible();
  await link.hover();
  await page.waitForTimeout(1000);
  expect(reviewRequests).toEqual([]);
  expect((await viewRows()).length).toBe(base);

  await link.click();
  await expect(page.getByRole("heading", { name: `기타소득 확인증 — ${seeded.name}` })).toBeVisible();
  const opened = await viewRows();
  expect(opened.length).toBe(base + 1);
  expect(opened.at(-1)?.detail).toEqual({ ip: IP, submissionId: seeded.submissionId });

  await page.reload();
  await expect(page.getByRole("heading", { name: `기타소득 확인증 — ${seeded.name}` })).toBeVisible();
  expect((await viewRows()).length).toBe(base + 2);
});

// ── 04.3-14 Task 2 — 첫 접근 판정 · 평문 3분 가림 · 무입력 화면 이동 · 되돌아가기 · 5분 활동 기록 ──────────────────────

const PRIVACY_REASON_LINE = "개인정보 화면 · 다시 로그인";
// 경로 인코딩 결과(영문 · 숫자 · `-` · `%2F`)에는 정규식 특수 문자가 없다.
const privacyLoginUrl = (path: string) => new RegExp(`/login\\?reason=privacy-session&next=${encodeURIComponent(path)}$`);

// 지금 열린 로그인 화면에서 폼만 채운다(되돌아갈 곳은 그 화면 주소의 next=가 정한다).
async function submitLogin(page: Page, account: Account): Promise<void> {
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
}

async function viewLogCount(submissionId: string): Promise<number> {
  return countLogs("cert_view", submissionId);
}

test("평문은 입력 3분 없으면 가려진다 — 2분 55초에는 남고 3분 5초에는 가림 · 칸에 한 글자 치면 다시 3분부터", async ({ page }) => {
  const seeded = await seedSubmittedCert();
  await login(page, admin);
  await page.clock.install();
  await page.goto(reviewPath(seeded.submissionId));
  await page.getByRole("button", { name: "전체 보기" }).click();
  await expect(rrnInput(page)).toHaveValue(RRN_FULL);

  await page.clock.fastForward("02:55");
  await expect(rrnInput(page)).toHaveValue(RRN_FULL);
  await rrnInput(page).press("End");
  await rrnInput(page).pressSequentially("1");
  await page.clock.fastForward("02:55");
  await expect(rrnInput(page)).toHaveCount(1);
  await page.clock.fastForward("00:10");
  await expect(rrnInput(page)).toHaveCount(0);
});

test("첫 접근 판정 — 로그인 31분 뒤 처음 I4를 열면 로그인 화면(이유 줄 · next=) · cert_view 0줄 · 다시 로그인하면 그 I4로", async ({
  page,
}) => {
  const seeded = await seedSubmittedCert();
  const account = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await login(page, account);
  await db
    .update(sessions)
    .set({ createdAt: new Date(Date.now() - 31 * 60_000) })
    .where(inArray(sessions.id, await sessionIdsOf(account)));

  const path = reviewPath(seeded.submissionId);
  await page.goto(path);
  await expect(page).toHaveURL(privacyLoginUrl(path));
  expect(await viewLogCount(seeded.submissionId)).toBe(0);
  const status = page.getByRole("status").filter({ hasText: PRIVACY_REASON_LINE });
  await expect(status).toBeVisible();
  await expect(status).toHaveText(PRIVACY_REASON_LINE);
  expect(await page.content()).not.toContain(seeded.name);

  await submitLogin(page, account);
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(page.getByRole("heading", { name: `기타소득 확인증 — ${seeded.name}` })).toBeVisible();
  expect(await viewLogCount(seeded.submissionId)).toBe(1);
});

test("무입력 30분이면 I4가 스스로 로그인 화면으로 · 29분에 누르면 다시 셈 · 뒤로 가기로 개인정보가 되살아나지 않음 · 다시 로그인 뒤 뒤로는 로그인 폼이 아님", async ({
  page,
}) => {
  const seeded = await seedSubmittedCert();
  const account = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await login(page, account);
  await page.clock.install();
  const path = reviewPath(seeded.submissionId);
  await page.goto(path);
  const heading = page.getByRole("heading", { name: `기타소득 확인증 — ${seeded.name}` });
  await expect(heading).toBeVisible();

  await page.clock.fastForward("29:00");
  await heading.click();
  await page.clock.fastForward("29:00");
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await page.clock.fastForward("01:05");
  await expect(page).toHaveURL(privacyLoginUrl(path));
  await expect(page.getByRole("status").filter({ hasText: PRIVACY_REASON_LINE })).toBeVisible();

  // G0 DR-5 · F6 — 이동은 location.replace라 I4 항목이 기록에 없다. 뒤로 가도 개인정보가 보이지 않는다.
  await page.goBack();
  await expect(page).not.toHaveURL(new RegExp(`${path}$`));
  await expect(page.getByText(seeded.name, { exact: false })).toHaveCount(0);
  await page.goForward();
  await expect(page).toHaveURL(privacyLoginUrl(path));

  // G0 F8 — 다시 로그인하면 그 I4로 가고, 로그인 화면은 기록에 남지 않는다.
  await submitLogin(page, account);
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(heading).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/\/login/);
});

// 독립 검토 Y1 · Y4 — 앱 안 이동(셸 링크)으로 떠났다가 브라우저 뒤로 오면 Next 라우터 캐시가 I4를 서버 요청 없이 되살린다.
// 다시 붙은 화면은 마지막 서버 활동부터 잰다: 1분을 넘었으면 활동 기록 한 번(결과대로), 한도를 넘었으면 곧바로 로그인.
test("라우터 캐시 복원 — 셸 링크로 떠났다가 10분 뒤 돌아오면 활동 기록 한 번 · 한도를 넘겨 돌아오면 로그인 화면 · 개인정보 없음(검토 Y1)", async ({
  page,
}) => {
  const seeded = await seedSubmittedCert();
  const account = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await login(page, account);
  await page.clock.install();
  const path = reviewPath(seeded.submissionId);
  const heading = page.getByRole("heading", { name: `기타소득 확인증 — ${seeded.name}` });
  const home = page.getByRole("link", { name: "PLANT8 내 차례" });
  await page.goto(path);
  await expect(heading).toBeVisible();
  const views = await viewLogCount(seeded.submissionId);
  const ids = await sessionIdsOf(account);
  const lastSeen = async () => {
    const rows = await db.select().from(privacySessionActivity).where(inArray(privacySessionActivity.sessionId, ids));
    return rows[0]?.lastSeenAt.getTime() ?? 0;
  };

  // 서버 시계는 진짜 시각이다 — 화면 시계를 10분 넘기는 만큼 서버 활동 시각도 10분 앞으로 돌린다. 돌아온 화면이 활동 기록을
  // 보내면 그 시각이 지금으로 다시 찍힌다(셸의 알림 수 갱신 같은 다른 서버 액션과 섞이지 않게 DB로 본다).
  await home.click();
  await expect(page).not.toHaveURL(new RegExp(`${path}$`));
  await page.clock.fastForward("10:00");
  await db
    .update(privacySessionActivity)
    .set({ lastSeenAt: new Date(Date.now() - 10 * 60_000) })
    .where(inArray(privacySessionActivity.sessionId, ids));
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(heading).toBeVisible();
  await expect.poll(lastSeen).toBeGreaterThan(Date.now() - 60_000);
  expect(await viewLogCount(seeded.submissionId)).toBe(views);

  await home.click();
  await expect(page).not.toHaveURL(new RegExp(`${path}$`));
  await page.clock.fastForward("31:00");
  await page.goBack();
  await expect(page).toHaveURL(privacyLoginUrl(path));
  await expect(page.getByText(seeded.name, { exact: false })).toHaveCount(0);
  expect(await viewLogCount(seeded.submissionId)).toBe(views);
});

// 독립 검토 Y4 ② — 입력에 딸려 간 활동 기록이 끊김(expired)을 받으면 화면이 곧바로 로그인으로 간다(서버는 세션을 지웠다).
test("활동 기록이 끊김을 받으면 로그인 화면(이유 줄 · 그 I4 next=)(검토 Y4)", async ({ page }) => {
  const seeded = await seedSubmittedCert();
  const account = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await login(page, account);
  await page.clock.install();
  const path = reviewPath(seeded.submissionId);
  const heading = page.getByRole("heading", { name: `기타소득 확인증 — ${seeded.name}` });
  await page.goto(path);
  await expect(heading).toBeVisible();

  await page.clock.fastForward("05:01");
  await db
    .update(privacySessionActivity)
    .set({ lastSeenAt: new Date(Date.now() - 31 * 60_000) })
    .where(inArray(privacySessionActivity.sessionId, await sessionIdsOf(account)));
  await heading.click();
  await expect(page).toHaveURL(privacyLoginUrl(path));
  await expect(page.getByRole("status").filter({ hasText: PRIVACY_REASON_LINE })).toBeVisible();
  expect(await sessionIdsOf(account)).toHaveLength(0);
});

// 독립 검토 Y4 ① — 브라우저 뒤로 · 앞으로 캐시(bfcache)로 되살아난 화면은 곧바로 다시 불러와 서버 판정을 거친다. Playwright
// 브라우저는 bfcache를 끄므로 그 복원이 보내는 사건(pageshow persisted)을 직접 보낸다.
test("pageshow persisted면 다시 불러와 서버 판정 · 조회 기록을 다시 거친다(검토 Y4)", async ({ page }) => {
  const seeded = await seedSubmittedCert();
  const account = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await login(page, account);
  await page.goto(reviewPath(seeded.submissionId));
  await expect(page.getByRole("heading", { name: `기타소득 확인증 — ${seeded.name}` })).toBeVisible();
  const views = await viewLogCount(seeded.submissionId);

  await page.evaluate(() => {
    (window as unknown as { __restored?: boolean }).__restored = true;
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  await expect.poll(() => viewLogCount(seeded.submissionId)).toBe(views + 1);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __restored?: boolean }).__restored ?? null))
    .toBeNull();
});

test("입력이 이어지면 5분에 한 번 활동 기록 — 정정 칸에 4분마다 한 글자씩 35분 입력해도 저장이 끊기지 않는다(G3 a)", async ({ page }) => {
  const seeded = await seedSubmittedCert();
  const account = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await login(page, account);
  await page.clock.install();
  // 활동 기록은 입력 때도, 5분 창 끝의 뒤따르는 기록(검토 Y2)으로도 간다 — 보낸 때를 화면 시계로 재려고 서버 액션 fetch를 감싼다.
  await page.addInitScript(() => {
    const target = window as unknown as { __actionTimes: number[] };
    target.__actionTimes = [];
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (new Headers(init?.headers).has("next-action")) target.__actionTimes.push(Date.now());
      return original(input, init);
    };
  });
  await page.goto(reviewPath(seeded.submissionId));
  await expect(page.getByLabel("이름")).toBeVisible();

  const touches: number[] = [];
  let answered = 0;
  page.on("request", (request) => {
    if (isServerAction(request)) touches.push(-1);
  });
  page.on("response", (response) => {
    if (isServerAction(response.request())) answered += 1;
  });

  // 서버 시계는 진짜 시각이다 — 화면 시계를 4분 넘길 때마다 세션 · 활동 시각도 4분 앞으로 밀어 서버가 본 경과를 맞춘다.
  const ids = await sessionIdsOf(account);
  const shiftServerClock = async (minutes: number) => {
    await db
      .update(sessions)
      .set({ createdAt: sql`${sessions.createdAt} - make_interval(mins => ${minutes})` })
      .where(inArray(sessions.id, ids));
    await db
      .update(privacySessionActivity)
      .set({ lastSeenAt: sql`${privacySessionActivity.lastSeenAt} - make_interval(mins => ${minutes})` })
      .where(inArray(privacySessionActivity.sessionId, ids));
  };

  const nameField = page.getByLabel("이름");
  for (let step = 0; step < 9; step += 1) {
    await page.clock.fastForward("04:00");
    await shiftServerClock(4);
    await nameField.press("End");
    await nameField.pressSequentially("가");
    await expect.poll(() => answered).toBe(touches.length);
  }

  const browserTimes = await page.evaluate(() => (window as unknown as { __actionTimes: number[] }).__actionTimes);
  expect(browserTimes.length).toBe(touches.length);
  expect(browserTimes.length).toBeGreaterThan(0);
  for (let index = 1; index < browserTimes.length; index += 1) {
    expect(browserTimes[index]! - browserTimes[index - 1]!).toBeGreaterThanOrEqual(5 * 60_000);
  }
  await saveButton(page).click();
  await expect(page.getByText(/^저장됨 · 이름 · /)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${reviewPath(seeded.submissionId)}$`));
});

test("긴 실행 — 3시간 전 세션(A)은 I4에서 끊기고 같은 계정의 새 세션(B)은 열린다(판정은 세션 단위)", async ({ browser }) => {
  const seeded = await seedSubmittedCert();
  // 이 테스트만 쓰는 계정 — sessionIdsOf가 그 계정의 모든 세션을 돌려주므로 공유 계정을 쓰지 않는다(E4-B12).
  const account = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  const pageA = await loggedInPage(browser, account);
  const [sessionA] = await sessionIdsOf(account);
  if (!sessionA) throw new Error("A 세션 없음");
  await db
    .update(sessions)
    .set({ createdAt: new Date(Date.now() - 3 * 60 * 60_000) })
    .where(eq(sessions.id, sessionA));

  const pageB = await loggedInPage(browser, account);
  const sessionB = (await sessionIdsOf(account)).find((id) => id !== sessionA);
  if (!sessionB) throw new Error("B 세션 없음");
  const path = reviewPath(seeded.submissionId);
  await pageB.goto(path);
  await expect(pageB.getByRole("heading", { name: `기타소득 확인증 — ${seeded.name}` })).toBeVisible();

  await pageA.goto(path);
  await expect(pageA).toHaveURL(privacyLoginUrl(path));

  const left = await sessionIdsOf(account);
  expect(left).not.toContain(sessionA);
  expect(left).toContain(sessionB);
  await pageA.context().close();
  await pageB.context().close();
});

// 04.3-14 Task 3(사용자 결정 ①) — I4의 동의 줄이 라벨 「수집 안내」 · 값 「확인함 · {제출 일시}」로 바뀐다.
test("I4 수집 안내 줄 — 라벨 수집 안내 · 값 확인함 · 일시", async ({ page }) => {
  const seeded = await seedSubmittedCert();
  await login(page, admin);
  await page.goto(reviewPath(seeded.submissionId));
  await expect(page.getByText("수집 안내", { exact: true })).toBeVisible();
  await expect(page.getByText(/^확인함 · \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)).toBeVisible();
  await expect(page.getByText("동의함", { exact: false })).toHaveCount(0);
});
