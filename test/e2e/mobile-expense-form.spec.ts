import { test, expect, type Browser, type Page, type Route } from "@playwright/test";
import { createExpenseFromLines } from "@/domain/expenses";
import { loginPage, waitForHydration } from "./leave-org";
import { setupExpenseE2E, submitLineExpense, uniqueReceipt, type ExpenseE2E, type LineKey } from "./expense-fixture";

// 05-05 Task 2 — 폰(UX-03 · D-69): 견적 줄 행 시트의 문서 행동 3차 하나(U2) · 폰 폼 고정 제출 줄 · 사진 축소 업로드. 파일 이름이 `mobile-*`라
// mobile-375 프로젝트가 잡는다. 크기 · 간격 기대 값은 계산된 토큰 값과 비교한다(px 리터럴 없음).

const PHONE = { width: 375, height: 800 };
const DESKTOP = { width: 1280, height: 800 };
const OPEN_LABEL = "지출결의 올리기";
const FAILURE_LINE = "지출결의 만들기 실패 · 다시 시도";

// CSS 토큰(`--touch-min` · `--s-4`)을 그 화면에서 픽셀로 푼다.
async function tokenPx(page: Page, name: string): Promise<number> {
  return page.evaluate((token) => {
    const probe = document.createElement("div");
    probe.style.cssText = `position:absolute;visibility:hidden;height:var(${token})`;
    document.body.append(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();
    return height;
  }, name);
}

async function openProject(page: Page, fx: ExpenseE2E): Promise<void> {
  await page.goto(`/projects/${fx.projectId}`);
}

// 폰 행 탭 → 행 시트(제목 = 항목명).
async function openSheet(page: Page, itemName: string) {
  const tap = page.getByRole("button", { name: `${itemName} 상세 보기` });
  await waitForHydration(tap);
  await tap.click();
  const sheet = page.getByRole("dialog", { name: itemName });
  await expect(sheet).toBeVisible();
  return sheet;
}

async function phoneProject(browser: Browser, baseURL: string | undefined, fx: ExpenseE2E, viewport = PHONE): Promise<Page> {
  const page = await loginPage(browser, baseURL, fx.pm, viewport);
  await openProject(page, fx);
  return page;
}

// 만들기 요청(서버 액션 POST)을 500으로 막는다 — 해제하려면 반환 함수를 부른다.
async function failActionPosts(page: Page): Promise<() => Promise<void>> {
  const handler = async (route: Route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
      await route.fulfill({ status: 500, body: "" });
      return;
    }
    await route.continue();
  };
  await page.route("**/*", handler);
  return () => page.unroute("**/*", handler);
}

test.describe("폰 행 시트 문서 행동 3차 하나 (05-05 U2 · R6-07)", () => {
  test("문 열림 줄 — 3차 `지출결의 올리기`(터치 높이 · 본문과 사이 · 1차 면 아님) → 누르면 시트가 닫히고 폼으로 간다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await phoneProject(browser, baseURL, fx);
    const sheet = await openSheet(page, fx.lines.phone.itemName);

    const action = sheet.getByRole("button", { name: OPEN_LABEL });
    await expect(action).toHaveCount(1);
    await action.scrollIntoViewIfNeeded();
    const [box, listBox, touchMin, space] = [await action.boundingBox(), await sheet.locator("dl").boundingBox(), await tokenPx(page, "--touch-min"), await tokenPx(page, "--s-4")];
    expect(box && listBox, "3차 · 본문 상자").toBeTruthy();
    expect(box!.height).toBeGreaterThanOrEqual(touchMin - 0.5);
    expect(box!.y - (listBox!.y + listBox!.height), "본문과 3차 사이").toBeGreaterThanOrEqual(space - 0.5);
    // 3차 모양 — 1차 면 색이 아니다.
    await expect(action).not.toHaveAttribute("data-ui", "primary-button");
    await expect(action).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    // 시트 안 버튼은 닫기 · 3차 둘뿐이다(1차 · 2차 행동 줄이 없다).
    await expect(sheet.getByRole("button")).toHaveCount(2);

    await action.click();
    await expect(page).toHaveURL(/\/expenses\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`지출결의 — ${fx.projectName} · ${fx.lines.phone.itemName}`);
  });

  test("거래처 없는 줄 = 3차 없이 글자 한 줄 · 취소 줄 = 행동 자리째 없음 · 제출된 비분할 줄 = 3차 링크 `지출결의 열기`", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const closedId = await submitLineExpense(browser, baseURL, fx, "closed");
    const page = await phoneProject(browser, baseURL, fx);

    const noVendor = await openSheet(page, fx.lines.noVendor.itemName);
    await expect(noVendor.getByText("거래처 없음 · PC 견적 표에서 고르기")).toBeVisible();
    await expect(noVendor.getByRole("button")).toHaveCount(1);
    await expect(noVendor.getByRole("link")).toHaveCount(0);
    await noVendor.getByRole("button", { name: "닫기" }).click();
    await expect(noVendor).toBeHidden();

    const cancelled = await openSheet(page, fx.lines.cancelled.itemName);
    await expect(cancelled.getByRole("button")).toHaveCount(1);
    await expect(cancelled.getByRole("link")).toHaveCount(0);
    await expect(cancelled.getByText(/지출결의|거래처 없음/)).toHaveCount(0);
    await cancelled.getByRole("button", { name: "닫기" }).click();

    const closed = await openSheet(page, fx.lines.closed.itemName);
    await expect(closed.getByRole("button")).toHaveCount(1);
    const link = closed.getByRole("link", { name: "지출결의 열기" });
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute("href", `/expenses/${closedId}`);
  });

  test("만들기가 실패하면 시트는 열린 채 3차 바로 위에 한 줄뿐이고 두 번째 버튼이 없으며 3차를 다시 누르면 폼으로 간다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await phoneProject(browser, baseURL, fx);
    const sheet = await openSheet(page, fx.lines.retry.itemName);
    const action = sheet.getByRole("button", { name: OPEN_LABEL });
    await waitForHydration(action);

    const release = await failActionPosts(page);
    await action.click();
    const failure = sheet.getByText(FAILURE_LINE);
    await expect(failure).toBeVisible();
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("button", { name: "다시 시도" })).toHaveCount(0);
    await expect(sheet.getByRole("button")).toHaveCount(2);
    const [failureBox, actionBox] = [await failure.boundingBox(), await action.boundingBox()];
    expect(failureBox!.y + failureBox!.height, "실패 줄이 3차 바로 위").toBeLessThanOrEqual(actionBox!.y + 0.5);

    await release();
    await action.click();
    await expect(page).toHaveURL(/\/expenses\/[0-9a-f-]{36}$/);
  });
});

test.describe("폰 폼 — 고정 제출 줄 · 사진 축소", () => {
  async function openDraft(browser: Browser, baseURL: string | undefined, fx: ExpenseE2E, key: LineKey, viewport: { width: number; height: number }): Promise<Page> {
    const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id] });
    const expenseId = created.created[0]?.expenseId;
    if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
    const page = await loginPage(browser, baseURL, fx.pm, viewport);
    await page.goto(`/expenses/${expenseId}`);
    await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
    return page;
  }

  test("제출 줄이 하단 탭 위에 고정되고 결재선을 가리지 않으며 2차 `임시 저장`이 1차 왼쪽 · DOM 앞 · Tab 먼저다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await openDraft(browser, baseURL, fx, "hold", PHONE);
    const bar = page.getByTestId("expense-form-actions");
    const save = page.getByRole("button", { name: /^임시 저장/ });
    const submit = page.getByRole("button", { name: /^지출결의 제출/ });

    await expect(bar).toHaveCSS("position", "fixed");
    const [barBox, tabsBox] = [await bar.boundingBox(), await page.getByRole("navigation", { name: "하단 탭" }).boundingBox()];
    expect(barBox && tabsBox, "제출 줄 · 하단 탭 상자").toBeTruthy();
    expect(barBox!.y + barBox!.height, "제출 줄이 하단 탭 위").toBeLessThanOrEqual(tabsBox!.y + 1);

    // 결재선(마지막 값 칸) 아래끝 ≤ 제출 줄 위끝 — 스크롤 끝에서.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const routeBox = await page.locator("dl dd").last().boundingBox();
    const barAfter = await bar.boundingBox();
    expect(routeBox!.y + routeBox!.height, "결재선이 제출 줄에 가려지지 않는다").toBeLessThanOrEqual(barAfter!.y + 1);

    // 보이는 순서: 2차 왼쪽 · 1차 오른쪽. 수화 뒤 DOM · Tab 순서도 같다.
    const [saveBox, submitBox] = [await save.boundingBox(), await submit.boundingBox()];
    expect(saveBox!.x, "2차가 1차 왼쪽").toBeLessThan(submitBox!.x);
    const saveFirst = await save.evaluate((node, target) => Boolean(node.compareDocumentPosition(target as Node) & Node.DOCUMENT_POSITION_FOLLOWING), await submit.elementHandle());
    expect(saveFirst, "DOM에서 `임시 저장`이 1차보다 앞").toBe(true);
    await save.focus();
    await page.keyboard.press("Tab");
    await expect(submit).toBeFocused();
  });

  test("같은 폼을 1280에서 열면 1차가 `임시 저장`보다 DOM 앞이다(PC 1차 왼쪽 그대로)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await openDraft(browser, baseURL, fx, "hold", DESKTOP);
    const save = page.getByRole("button", { name: /^임시 저장/ });
    const submit = page.getByRole("button", { name: /^지출결의 제출/ });
    const submitFirst = await submit.evaluate((node, target) => Boolean(node.compareDocumentPosition(target as Node) & Node.DOCUMENT_POSITION_FOLLOWING), await save.elementHandle());
    expect(submitFirst, "DOM에서 1차가 `임시 저장`보다 앞").toBe(true);
    await expect(page.getByTestId("expense-form-actions")).not.toHaveCSS("position", "fixed");
  });

  test("폰 첨부 문구에서 3000×2000 사진을 올리면 JPEG으로 저장되고 크게 보기 이미지의 긴 변이 2000 이하다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await openDraft(browser, baseURL, fx, "phone", PHONE);
    await expect(page.getByText("사진·파일 올리기 · 이미지·PDF 10MB")).toBeVisible();
    await page.getByTestId("attachments-input").setInputFiles(await uniqueReceipt(page));
    const row = page.locator('[data-ui="attachments"] li');
    await expect(row.getByText(/^\d+KB · \d{2}-\d{2}$/)).toBeVisible({ timeout: 20_000 });

    const [popup] = await Promise.all([page.context().waitForEvent("page"), row.getByRole("link", { name: "크게 보기" }).click()]);
    await popup.waitForURL(/\/api\/storage-local\//);
    const measured = await popup.evaluate(async () => {
      const response = await fetch(location.href);
      const bitmap = await createImageBitmap(await response.blob());
      return { contentType: response.headers.get("content-type"), longSide: Math.max(bitmap.width, bitmap.height) };
    });
    expect(measured.contentType).toBe("image/jpeg");
    expect(measured.longSide).toBeLessThanOrEqual(2000);
  });
});

// R6-10 — 시트 3차 자리 DOM 감사. 두 크기 × 두 줄(ⓐ 일반 ⓑ 최악 — 두 줄 항목명 · 두 줄 비고 · 만들기 실패 줄 표시)에서 본문을 끝까지 스크롤한 3차가 `--touch-min` 이상이고
// 가로 넘침이 없음을 단언하고, 스크롤 전에 3차가 시트에 보이는지를 annotation으로 남긴다(거짓이면 U2 재검토 신호 — 단언으로 실패시키지 않는다).
test.describe("폰 시트 3차 자리 — 375×667 · 320×568", () => {
  const SIZES = [
    { width: 375, height: 667 },
    { width: 320, height: 568 },
  ];
  for (const size of SIZES) {
    for (const kind of ["일반 줄", "최악 줄"] as const) {
      test(`${size.width}×${size.height} ${kind}`, async ({ browser, baseURL }, testInfo) => {
        const fx = await setupExpenseE2E();
        const page = await phoneProject(browser, baseURL, fx, size);
        const line = kind === "일반 줄" ? fx.lines.phone : fx.lines.worst;
        const sheet = await openSheet(page, line.itemName);
        const action = sheet.getByRole("button", { name: OPEN_LABEL });
        await waitForHydration(action);
        if (kind === "최악 줄") {
          await failActionPosts(page);
          await action.click();
          await expect(sheet.getByText(FAILURE_LINE)).toBeVisible();
        }

        // 스크롤 전 — 3차가 시트의 보이는 영역 안에 있는가(시트 상자 = dialog).
        const [beforeAction, sheetBox] = [await action.boundingBox(), await sheet.boundingBox()];
        const visibleBefore = Boolean(beforeAction && sheetBox && beforeAction.y >= sheetBox.y && beforeAction.y + beforeAction.height <= sheetBox.y + sheetBox.height);
        testInfo.annotations.push({ type: "3차 스크롤 전 보임", description: `${size.width}x${size.height} ${kind}: ${visibleBefore}` });

        // 본문을 끝까지 스크롤한 뒤 — 높이 · 가로 넘침.
        await action.scrollIntoViewIfNeeded();
        const touchMin = await tokenPx(page, "--touch-min");
        const finalBox = await action.boundingBox();
        expect(finalBox!.height).toBeGreaterThanOrEqual(touchMin - 0.5);
        const overflow = await sheet.evaluate((node) => {
          const body = node.querySelector("dl")?.parentElement;
          return {
            page: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            sheet: node.scrollWidth > node.clientWidth,
            body: body ? body.scrollWidth > body.clientWidth : false,
          };
        });
        expect(overflow).toEqual({ page: false, sheet: false, body: false });
      });
    }
  }
});

// 웨이브 6 화면 검토 수정(D1 · D2 · D5 · D6) — DOM 실측. 기대 값은 토큰을 그 화면에서 푼 값이다.
test.describe("웨이브 6 화면 검토 수정 — 증빙 · 문서 · 폼", () => {
  const SIZES = [
    { width: 375, height: 667 },
    { width: 320, height: 568 },
    DESKTOP,
  ];

  async function openDraftForm(browser: Browser, baseURL: string | undefined, fx: ExpenseE2E, viewport: { width: number; height: number }): Promise<Page> {
    const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.hold.id] });
    const expenseId = created.created[0]?.expenseId;
    if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
    const page = await loginPage(browser, baseURL, fx.pm, viewport);
    await page.goto(`/expenses/${expenseId}`);
    await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
    return page;
  }

  for (const size of SIZES) {
    test(`${size.width}×${size.height} D2 빈 첨부 칸 글자 = --text-aux · D1 증빙 행 썸네일 radius 0`, async ({ browser, baseURL }) => {
      const fx = await setupExpenseE2E();
      const page = await openDraftForm(browser, baseURL, fx, size);
      const drop = page.locator('[data-ui="attachments"] button').first();
      const aux = await tokenPx(page, "--text-aux");
      const fontSize = await drop.evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
      expect.soft(fontSize, "빈 첨부 칸 글자 크기").toBe(aux);

      // 미리보기 <img>는 올리는 행(+ 서버 목록이 새로 그려지기 전)에만 있고 끝나면 클립 칸으로 바뀐다(UI-SPEC S4) — 실측으로 약 0.4초 창이다.
      // 그 창을 폴링으로 쫓으면 기계가 붐빌 때 창이 지난 뒤에 읽어 실패한다(05-13 게이트 감사 #4). 서버 액션을 풀어 줄 때까지 붙잡아 행이 올리는 중으로 머물게 한다.
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route("**/*", async (route) => {
        if (route.request().method() === "POST" && route.request().headers()["next-action"]) await gate;
        await route.continue();
      });
      await page.getByTestId("attachments-input").setInputFiles(await uniqueReceipt(page));
      const thumb = page.locator('[data-ui="attachments"] li[data-state="uploading"] img');
      await expect(thumb).toHaveCount(1);
      expect(await thumb.evaluate((node) => getComputedStyle(node).borderRadius), "썸네일 radius").toBe("0px");
      release();
    });
  }

  for (const size of SIZES.slice(0, 2)) {
    test(`${size.width}×${size.height} D6 분할 지급 체크 칸이 --touch-min`, async ({ browser, baseURL }) => {
      const fx = await setupExpenseE2E();
      const page = await openDraftForm(browser, baseURL, fx, size);
      const box = await page.locator("#installment").boundingBox();
      const touchMin = await tokenPx(page, "--touch-min");
      expect(box!.width, "체크 칸 너비").toBeGreaterThanOrEqual(touchMin - 0.5);
      expect(box!.height, "체크 칸 높이").toBeGreaterThanOrEqual(touchMin - 0.5);
    });

    test(`${size.width}×${size.height} D5 문서 화면 프로젝트 3차 링크가 --touch-min`, async ({ browser, baseURL }) => {
      const fx = await setupExpenseE2E();
      const expenseId = await submitLineExpense(browser, baseURL, fx, "hold");
      const page = await loginPage(browser, baseURL, fx.pm, size);
      await page.goto(`/expenses/${expenseId}`);
      const link = page.locator(`main a[href="/projects/${fx.projectId}"]`).first();
      await expect(link).toBeVisible();
      const box = await link.boundingBox();
      const touchMin = await tokenPx(page, "--touch-min");
      expect(box!.height, "프로젝트 링크 높이").toBeGreaterThanOrEqual(touchMin - 0.5);
    });
  }
});
