import { test, expect, type Browser, type Page, type Request } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, certSubmissions, privacySessionActivity, sessions } from "@/db/schema";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { findUserByEmail } from "@/repositories/users";
import { createFixtureUser } from "./fixtures";
import { seedSubmittedCert, withCertFeatureOff } from "./helpers/cert";

// 04.3-07 Task 3 — I4 확인증 확인 · 정정(데스크톱). 가림 · 전체 보기 로그 · 가리기 · 고친 값 재열람 ·
// 정정 · 동시 정정 · 브라우저 인쇄 차단 · 권한 404(비활동 시계 안 건드림) · 비활동 만료 · 게이트 꺼짐 직접 POST.
// 전제: 이 권한은 시드 기본값이 아니라 cert.setup이 켠 것이다(E3-13) — role-sysadmin의 certs.submissions(보기 · 쓰기) ·
// cert.rrn_unmasked · cert_submission.value는 test/e2e/cert.setup.ts가 이 스펙보다 먼저 한 번 켠다. 이 스펙은 권한 ·
// 설정을 직접 바꾸지 않고, 게이트를 끄는 케이스는 withCertFeatureOff 안에서만 한다(C4).
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

test("가림 · 전체 보기(로그) · 가리기 · 연락처 정정 · 동시 정정 · 다시 불러오기", async ({ page, browser }) => {
  const seeded = await seedSubmittedCert();
  await login(page, admin);
  await page.goto(reviewPath(seeded.submissionId));

  await expect(page.getByRole("heading", { name: `기타소득 확인증 — ${seeded.name}` })).toBeVisible();
  await expect(page.getByText("930412-2******")).toBeVisible();
  expect(await page.content()).not.toContain(RRN_FULL);
  expect(await page.content()).not.toContain("2123458");
  await expect(page.getByLabel("주소")).toHaveCount(0); // 현장 수령
  await expect(page.getByText("수령자 서명 · 고칠 수 없음")).toBeVisible();
  await expect(page.getByText("바뀐 칸 없음")).toBeVisible();

  await page.getByRole("button", { name: "전체 보기" }).click();
  await expect(page.getByLabel("주민등록번호")).toHaveValue(RRN_FULL);
  expect(await countLogs("mask_reveal", seeded.submissionId)).toBe(1);

  await page.getByRole("button", { name: "가리기" }).click();
  await expect(page.getByText("930412-2******")).toBeVisible();
  await expect(page.getByLabel("주민등록번호")).toHaveCount(0);
  expect(await page.content()).not.toContain(RRN_FULL);

  await page.getByLabel("연락처").fill("010-5555-6666");
  await saveButton(page).click();
  await expect(page.getByText(/^저장됨 · 연락처 · \d{2}:\d{2}$/)).toBeVisible();
  const logs = (await db.select().from(actionLog).where(eq(actionLog.actionType, "cert_correct"))).filter(
    (row) => row.entityId === seeded.submissionId,
  );
  expect(logs).toHaveLength(1);
  expect(logs[0]?.detail).toEqual({ fields: ["연락처"] });

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
  await page.getByLabel("주민등록번호").fill("930412-1234560");
  await page.getByRole("button", { name: "가리기" }).click();
  await expect(page.getByText("930412-1****** · 저장 안 함")).toBeVisible();
  expect(await page.content()).not.toContain("930412-1234560");
  expect(await countLogs("mask_reveal", seeded.submissionId)).toBe(1);

  await page.getByRole("button", { name: "전체 보기" }).click();
  await expect(page.getByLabel("주민등록번호")).toHaveValue("930412-1234560");
  expect(await countLogs("mask_reveal", seeded.submissionId)).toBe(2);

  await saveButton(page).click();
  await expect(page.getByText(/^저장됨 · 주민등록번호 · \d{2}:\d{2}$/)).toBeVisible();
  await expect(page.getByText("930412-1******")).toBeVisible();
  await expect(page.getByLabel("주민등록번호")).toHaveCount(0);
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

test("비활동 만료 — 활동 행을 121분 전으로 돌리고 새로 고치면 로그인 화면", async ({ page }) => {
  const seeded = await seedSubmittedCert();
  const account = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await login(page, account);
  await page.goto(reviewPath(seeded.submissionId));
  await expect(page.getByText("930412-2******")).toBeVisible();

  const ids = await sessionIdsOf(account);
  await db
    .update(privacySessionActivity)
    .set({ lastSeenAt: new Date(Date.now() - 121 * 60_000) })
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
  await page.getByLabel("주민등록번호").fill("930412-1234560");
  await page.getByRole("button", { name: "가리기" }).click();
  await page.getByRole("button", { name: "전체 보기" }).click();
  await expect(page.getByLabel("주민등록번호")).toHaveValue("930412-1234560");
  await page.getByLabel("주민등록번호").fill(RRN_FULL);
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
