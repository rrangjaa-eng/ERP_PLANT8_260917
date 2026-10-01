import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, certEvents, certSubmissions, privacySessionActivity, sessions } from "@/db/schema";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { CERT_EVENT_NAME_MAX } from "@/domain/certs/events";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { findUserByEmail } from "@/repositories/users";
import { getSignatureStore } from "@/lib/storage/signature-store";
import { createFixtureUser } from "./fixtures";
import { seedSubmittedCert, withCertFeatureOff } from "./helpers/cert";

// 04.3-11 Task 2 · 3 — 인쇄 라우트 `/print/certs/[id]`(P1) · I4 머리 「인쇄」. 묶음 둘: `인쇄 라우트`(주소를 바로 연다) ·
// `I4 인쇄 버튼`. 전제: 이 권한은 시드 기본값이 아니라 cert.setup이 켠 것이다(E3-13) — role-sysadmin의 certs.submissions
// (보기 · 쓰기) · cert.rrn_unmasked · cert_submission.value는 test/e2e/cert.setup.ts가 이 스펙보다 먼저 한 번 켠다. 이 스펙은
// 그 권한도 공유 설정도 바꾸지 않고, 게이트를 끄는 케이스는 withCertFeatureOff 안에서만 한다(C4). 제출 표본은
// seedSubmittedCert()만으로 만든다(E3-32). 오류 문구는 사용자 결정 A — 명사형(04.3-07 문구 대응표와 같다).

test.describe.configure({ mode: "serial" });

const RRN_LAST7 = "2123458";
const PRINT_NOT_READY = "인쇄물이 아직 준비되지 않았습니다 · 화면이 다 뜬 뒤 다시 인쇄해 주세요";
const PRINT_ERROR = "인쇄물 만들기 실패 ·";
const notFoundHeading = (page: Page) => page.getByRole("heading", { name: "페이지 찾을 수 없음" });

type Account = { email: string; password: string };

let admin: Account;
let pm: Account;

test.beforeAll(async () => {
  admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
});

// codex #26 — 「인쇄」가 새 탭을 여므로 탭이 생기기 전에 컨텍스트에 건다(page.addInitScript는 새 탭에 닿지 않는다).
async function printSpyContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const target = window as unknown as { __printCalls: number };
    target.__printCalls = 0;
    window.print = () => {
      target.__printCalls += 1;
    };
  });
  return context;
}

const printCalls = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { __printCalls: number }).__printCalls);

async function login(page: Page, account: Account): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function loggedInContext(browser: Browser, account: Account): Promise<{ context: BrowserContext; page: Page }> {
  const context = await printSpyContext(browser);
  const page = await context.newPage();
  await login(page, account);
  return { context, page };
}

async function sessionIdsOf(account: Account): Promise<string[]> {
  const user = await findUserByEmail(SYSTEM_VIEWER, account.email);
  if (!user) throw new Error("사용자 없음");
  const own = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, user.id));
  return own.map((row) => row.id);
}

async function countMaskReveal(submissionId: string): Promise<number> {
  const rows = await db.select().from(actionLog).where(eq(actionLog.actionType, "mask_reveal"));
  return rows.filter((row) => row.entityId === submissionId).length;
}

// 서명 객체 키를 새 객체 키로 바꾼다(망가진 PNG 바이트를 넣거나 객체를 넣지 않는다).
async function repointSignature(submissionId: string, png: Buffer | null): Promise<void> {
  const key = `signatures/e2e-print-${randomUUID()}.png`;
  if (png) await getSignatureStore().put(key, png);
  await db.update(certSubmissions).set({ signatureKey: key }).where(eq(certSubmissions.id, submissionId));
}


// 공백이 섞인 한글 문장을 정확히 len자로 만든다(실제 행사 이름 · 도로명 주소처럼 어절 단위로 꺾이게).
function textOfLength(len: number, unit: string): string {
  const out = Array.from({ length: len }, (_, index) => unit[index % unit.length] ?? "가").join("");
  return out.trimEnd().length === len ? out : `${out.slice(0, -1)}가`;
}

// 인쇄 미디어 · A4 폭에서 흐름이 하단 여백(20mm) 안에 있고 PDF가 한 장인지 잰다(독립 DOM 감사 M1).
async function measureA4(page: Page): Promise<{
  labelBottom: number;
  footTop: number;
  limit: number;
  scrollHeight: number;
  clientHeight: number;
  pdfPages: number;
}> {
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.emulateMedia({ media: "print" });
  const box = await page.evaluate(() => {
    const sheet = document.querySelector("main > section");
    if (!sheet) throw new Error("인쇄 본문 없음");
    const top = sheet.getBoundingClientRect().top;
    const spans = [...sheet.querySelectorAll("span")];
    const label = spans.find((el) => el.textContent === "서명");
    const foot = spans.find((el) => el.textContent === "PLANT8 ERP");
    if (!label || !foot) throw new Error("서명 라벨 · 바닥줄 없음");
    return {
      sheetHeight: sheet.getBoundingClientRect().height,
      labelBottom: label.getBoundingClientRect().bottom - top,
      footTop: foot.getBoundingClientRect().top - top,
      scrollHeight: sheet.scrollHeight,
      clientHeight: sheet.clientHeight,
    };
  });
  const pdf = await page.pdf({ preferCSSPageSize: true });
  const pdfPages = (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
  return { ...box, limit: (box.sheetHeight * (297 - 20)) / 297, pdfPages };
}

const printPath = (id: string) => `/print/certs/${id}`;
const reviewPath = (id: string) => `/certs/submissions/${id}`;

async function expectNoFullRrn(page: Page): Promise<void> {
  const html = await page.content();
  expect(html).not.toContain(RRN_LAST7);
  expect(html).not.toMatch(/\d{6}-\d{7}/);
  expect(await page.locator("body").innerText()).not.toMatch(/\d{13}/);
}

test.describe("인쇄 라우트", () => {
  test("택배 확인증을 바로 열면 템플릿 값 · 가린 번호 · data-ready · 서명 decode 뒤 인쇄 1번 · mask_reveal 0줄", async ({
    browser,
  }) => {
    const seeded = await seedSubmittedCert({ delivery: "parcel", address: "서울시 마포구 월드컵로 1" });
    const { context, page } = await loggedInContext(browser, admin);
    await page.goto(printPath(seeded.submissionId));

    await expect(page).toHaveTitle("확인증 인쇄");
    await expect(page.getByRole("heading", { name: "기타소득 지급 확인증" })).toBeVisible();
    await expect(page.getByText(seeded.certNo)).toBeVisible();
    await expect(page.getByText("930412-2******")).toBeVisible();
    await expect(page.locator("[data-ready]")).toHaveCount(1);
    await expect.poll(() => printCalls(page)).toBe(1);
    await page.waitForTimeout(300);
    expect(await printCalls(page)).toBe(1);

    const text = await page.locator("body").innerText();
    expect(text).toMatch(/지출결의\s*—/);
    expect(text).toMatch(/프로젝트\s+—/);
    expect(text).toContain(`당첨일 2026-01-01`);
    expect(text).toMatch(/소득 종류\s+기타소득/);
    expect(text).toMatch(/경품\s+갤럭시 탭 S10 1개/);
    expect(text).toMatch(/주소\s+서울시 마포구 월드컵로 1/);
    expect(text).toMatch(/연락처\s+010-4821-7730/);
    expect(text).toMatch(/계좌\s+—/);
    expect(text).toMatch(/지급액\s+—/);
    expect(text).toMatch(/원천징수\s+—/);
    expect(text).toMatch(/실지급액\s+—/);
    expect(text).not.toMatch(/원정|소득세|지방소득세/);
    expect(text).toContain("위 금액을 기타소득으로 지급받았음을 확인합니다.");
    expect(text).toContain("1 / 1");
    await expect(page.getByAltText("김하늘 서명")).toBeVisible();
    await expectNoFullRrn(page);
    expect(await countMaskReveal(seeded.submissionId)).toBe(0);
    await context.close();
  });

  for (const size of [
    { label: "플랜 최악치(행사 이름 40자 + 주소 71자)", event: 40, address: 71 },
    { label: "주소가 한 줄 더 꺾인 경우(40자 + 100자)", event: 40, address: 100 },
    { label: "입력 한도 최대치(행사 이름 80자 + 주소 200자)", event: CERT_EVENT_NAME_MAX, address: 200 },
  ]) {
    test(`A4 한 장 — ${size.label}: 흐름이 하단 여백 안 · 바닥줄과 겹치지 않음 · PDF 1장(M1)`, async ({ browser }) => {
      const seeded = await seedSubmittedCert({
        delivery: "parcel",
        address: textOfLength(size.address, "서울특별시 마포구 월드컵북로 "),
      });
      await db
        .update(certEvents)
        .set({ name: textOfLength(size.event, "2026 현대자동차 아이오닉 미디어 론칭 ") })
        .where(eq(certEvents.id, seeded.eventId));
      const { context, page } = await loggedInContext(browser, admin);
      await page.goto(printPath(seeded.submissionId));
      await expect(page.locator("[data-ready]")).toHaveCount(1);

      const m = await measureA4(page);
      expect(m.labelBottom, "서명 라벨 아래가 하단 여백(20mm) 안").toBeLessThanOrEqual(m.limit);
      expect(m.labelBottom, "서명 라벨이 바닥줄을 침범하지 않음").toBeLessThan(m.footTop);
      expect(m.scrollHeight, "본문이 종이 밖으로 넘치지 않음").toBeLessThanOrEqual(m.clientHeight);
      expect(m.pdfPages, "PDF 쪽수").toBe(1);
      await context.close();
    });
  }

  test("숫자 칸은 줄바꿈하지 않는다 · 제목이 화면 문서에 있다(L4)", async ({ browser }) => {
    const seeded = await seedSubmittedCert();
    const { context, page } = await loggedInContext(browser, admin);
    await page.goto(printPath(seeded.submissionId));
    await expect(page.locator("[data-ready]")).toHaveCount(1);
    const whiteSpace = await page.getByText("930412-2******").evaluate((el) => getComputedStyle(el).whiteSpace);
    expect(whiteSpace).toBe("nowrap");
    await context.close();
  });

  test("404 변종은 제목이 확인증 인쇄로 남지 않고 바탕이 --surface다(L3)", async ({ browser }) => {
    const seeded = await seedSubmittedCert();
    const pmSession = await loggedInContext(browser, pm);
    const admin404 = await loggedInContext(browser, admin);
    for (const { page, url } of [
      { page: pmSession.page, url: printPath(seeded.submissionId) },
      { page: admin404.page, url: printPath(randomUUID()) },
      { page: admin404.page, url: "/print/certs/not-a-uuid" },
    ]) {
      await page.goto(url);
      await expect(notFoundHeading(page)).toBeVisible();
      await expect(page).not.toHaveTitle("확인증 인쇄");
      const [surface, main] = await page.evaluate(() => {
        const probe = document.createElement("div");
        probe.style.background = "var(--surface)";
        document.body.append(probe);
        const expected = getComputedStyle(probe).backgroundColor;
        probe.remove();
        const target = document.querySelector("main");
        return [expected, target ? getComputedStyle(target).backgroundColor : "main 없음"];
      });
      expect(main).toBe(surface);
    }
    await pmSession.context.close();
    await admin404.context.close();
  });

  test("현장 확인증의 주소는 —다", async ({ browser }) => {
    const seeded = await seedSubmittedCert();
    const { context, page } = await loggedInContext(browser, admin);
    await page.goto(printPath(seeded.submissionId));

    await expect(page.locator("[data-ready]")).toHaveCount(1);
    expect(await page.locator("body").innerText()).toMatch(/주소\s+—/);
    await context.close();
  });

  test("서명 이미지가 망가졌으면 인쇄하지 않고 화면에 실패 줄 · 인쇄 미디어에는 준비 전 한 줄뿐", async ({ browser }) => {
    const seeded = await seedSubmittedCert();
    await repointSignature(seeded.submissionId, Buffer.from("PNG 아님"));
    const { context, page } = await loggedInContext(browser, admin);
    await page.goto(printPath(seeded.submissionId));

    await expect(page.getByText(PRINT_ERROR)).toBeVisible();
    await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: PRINT_ERROR })).toHaveCount(1);
    await expect(page.locator("[data-ready]")).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(await printCalls(page)).toBe(0);

    await page.emulateMedia({ media: "print" });
    expect((await page.locator("body").innerText()).trim()).toBe(PRINT_NOT_READY);
    await context.close();
  });

  test("서명 객체가 없으면 같은 실패 · 인쇄 0번", async ({ browser }) => {
    const seeded = await seedSubmittedCert();
    await repointSignature(seeded.submissionId, null);
    const { context, page } = await loggedInContext(browser, admin);
    await page.goto(printPath(seeded.submissionId));

    await expect(page.getByText(PRINT_ERROR)).toBeVisible();
    await page.waitForTimeout(300);
    expect(await printCalls(page)).toBe(0);
    await page.emulateMedia({ media: "print" });
    expect((await page.locator("body").innerText()).trim()).toBe(PRINT_NOT_READY);
    await context.close();
  });

  test("기획 PM은 404이고 PM 세션의 활동 행이 없다(RB-5) · 같은 주소를 관리자는 번호와 함께 연다(대조)", async ({
    browser,
  }) => {
    const seeded = await seedSubmittedCert();
    const control = await loggedInContext(browser, admin);
    await control.page.goto(printPath(seeded.submissionId));
    await expect(control.page.getByText(seeded.certNo)).toBeVisible();
    await control.context.close();

    const pmSession = await loggedInContext(browser, pm);
    await pmSession.page.goto(printPath(seeded.submissionId));
    await expect(notFoundHeading(pmSession.page)).toBeVisible();
    await expect(pmSession.page.getByText(seeded.certNo)).toHaveCount(0);
    const ids = await sessionIdsOf(pm);
    const rows = await db.select().from(privacySessionActivity).where(inArray(privacySessionActivity.sessionId, ids));
    expect(rows).toHaveLength(0);
    await pmSession.context.close();
  });

  test("비활동 만료 — 활동 행을 121분 전으로 돌리고 다시 열면 로그인 화면(대조: 열려 있을 땐 번호가 보인다)", async ({
    browser,
  }) => {
    const seeded = await seedSubmittedCert();
    const account = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
    const { context, page } = await loggedInContext(browser, account);
    await page.goto(printPath(seeded.submissionId));
    await expect(page.getByText(seeded.certNo)).toBeVisible();

    await db
      .update(privacySessionActivity)
      .set({ lastSeenAt: new Date(Date.now() - 121 * 60_000) })
      .where(inArray(privacySessionActivity.sessionId, await sessionIdsOf(account)));
    await page.goto(printPath(seeded.submissionId));
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test("게이트 꺼짐 직접 열기 — 켜진 동안은 번호가 보이고(대조), 꺼지면 404 · 값 없음 · 인쇄 0번", async ({ browser }) => {
    const seeded = await seedSubmittedCert();
    const { context, page } = await loggedInContext(browser, admin);
    await page.goto(printPath(seeded.submissionId));
    await expect(page.getByText(seeded.certNo)).toBeVisible();

    await withCertFeatureOff(async () => {
      const response = await page.goto(printPath(seeded.submissionId));
      expect(response?.status()).toBe(404);
      const html = await response!.text();
      for (const value of [seeded.certNo, "930412-2", "김하늘"]) expect(html).not.toContain(value);
      await expect(notFoundHeading(page)).toBeVisible();
      expect(await printCalls(page)).toBe(0);
    });
    await context.close();
  });

  test("로그아웃 + 게이트 꺼짐은 로그인 화면이 아니라 404 · 게이트가 켜지면 로그인 화면(대조)", async ({ browser }) => {
    const seeded = await seedSubmittedCert();
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();

    await withCertFeatureOff(async () => {
      const response = await page.goto(printPath(seeded.submissionId));
      expect(response?.status()).toBe(404);
      expect(new URL(page.url()).pathname).not.toBe("/login");
    });

    await page.goto(printPath(seeded.submissionId));
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test("설정 읽기가 늦어도 게이트 꺼짐은 HTTP 404다(스트리밍 200 고정 방지 — codex final3 C3)", async ({ browser }) => {
    const seeded = await seedSubmittedCert();
    const { context, page } = await loggedInContext(browser, admin);
    await page.goto(printPath(seeded.submissionId));
    await expect(page.getByText(seeded.certNo)).toBeVisible();

    await withCertFeatureOff(async () => {
      let navigation: ReturnType<Page["goto"]> | null = null;
      try {
        await db.transaction(async (tx) => {
          // 게이트의 getSettingValue가 읽는 표 — 읽기가 이 잠금에 막힌다. 되돌릴 쓰기는 없다.
          await tx.execute(sql`LOCK TABLE settings_simple IN ACCESS EXCLUSIVE MODE`);
          navigation = page.goto(printPath(seeded.submissionId));
          navigation.catch(() => undefined);
          await new Promise((resolve) => setTimeout(resolve, 1500));
        });
      } finally {
        // 트랜잭션이 끝나 잠금이 풀린 뒤 이동을 마친다(콜백 안에서 기다리면 서로 막힌다).
      }
      const response = await navigation!;
      expect(response?.status()).toBe(404);
      const html = await response!.text();
      for (const value of [seeded.certNo, "930412-2", "김하늘"]) expect(html).not.toContain(value);
      expect(await printCalls(page)).toBe(0);
    });
    await context.close();
  });
});

test.describe("I4 인쇄 버튼", () => {
  test("I4 머리 「인쇄」는 새 탭으로 인쇄물을 열고 새 탭이 서명 decode 뒤 인쇄 1번 호출한다", async ({ browser }) => {
    const seeded = await seedSubmittedCert();
    const { context, page } = await loggedInContext(browser, admin);
    await page.goto(reviewPath(seeded.submissionId));

    const popupPromise = context.waitForEvent("page");
    await page.getByRole("button", { name: "인쇄", exact: true }).click();
    const popup = await popupPromise;

    await expect(popup).toHaveURL(new RegExp(`/print/certs/${seeded.submissionId}$`));
    await expect(popup.getByRole("heading", { name: "기타소득 지급 확인증" })).toBeVisible();
    await expect(popup.locator("[data-ready]")).toHaveCount(1);
    await expect.poll(() => printCalls(popup)).toBe(1);
    await expectNoFullRrn(popup);
    await context.close();
  });

  test("연락처를 고친 채 「인쇄」는 aria-disabled + 이유 · 눌러도 탭이 열리지 않고, 저장하면 다시 열린다", async ({
    browser,
  }) => {
    const seeded = await seedSubmittedCert();
    const { context, page } = await loggedInContext(browser, admin);
    await page.goto(reviewPath(seeded.submissionId));

    const printButton = page.getByRole("button", { name: "인쇄", exact: true });
    await expect(printButton).not.toHaveAttribute("aria-disabled", "true");

    await page.getByLabel("연락처").fill("010-5555-6666");
    await expect(printButton).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText("저장 안 한 칸 1 · 먼저 저장", { exact: true })).toBeVisible();
    const pagesBefore = context.pages().length;
    // aria-disabled 버튼은 Playwright 동작 가능성 검사에서 「사용 불가」라 force로 눌러 컴포넌트의 클릭 막기를 잰다.
    await printButton.click({ force: true });
    await page.waitForTimeout(500);
    expect(context.pages().length).toBe(pagesBefore);

    await page.getByRole("button", { name: "고친 내용 저장" }).click();
    await expect(page.getByText(/^저장됨 · /)).toBeVisible();
    await expect(printButton).not.toHaveAttribute("aria-disabled", "true");
    const popupPromise = context.waitForEvent("page");
    await printButton.click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(new RegExp(`/print/certs/${seeded.submissionId}$`));
    await context.close();
  });
});

// 04.3-14 Task 1(사용자 결정 U3 a) — 인쇄 라우트를 열 때도 끌 수 없는 cert_view 한 줄(detail via: "print").
test.describe("인쇄 접속기록", () => {
  test("그 테스트 안에서 로그인한 계정이 인쇄 라우트를 한 번 열면 via print인 cert_view가 정확히 1줄", async ({ browser }) => {
    const seeded = await seedSubmittedCert();
    const { context, page } = await loggedInContext(browser, admin);
    await page.goto(printPath(seeded.submissionId));
    await expect(page.getByText(seeded.certNo)).toBeVisible();

    const rows = (await db.select().from(actionLog).where(eq(actionLog.actionType, "cert_view"))).filter(
      (row) => row.entityId === seeded.submissionId && (row.detail as { via?: string }).via === "print",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.detail).toMatchObject({ submissionId: seeded.submissionId, via: "print" });
    await context.close();
  });
});
