import { test, expect, type Page } from "@playwright/test";
import { createExpenseFromLines } from "@/domain/expenses";
import { delayServerActions, expectSheetDocumentLink, loginPage, waitForHydration } from "./leave-org";
import { setupExpenseE2E, type ExpenseE2E } from "./expense-fixture";

// 05-05 Task 1 화면 트레이서(ROADMAP 05 기준 3): 견적 줄 `지출결의 올리기` → 폼(자동 채움) → 사진 한 장(브라우저 축소 · 해시 · 로컬 서명 주소) →
// `Ctrl+Enter` 제출 → 문서 화면 → 팀장 폰 결재 시트 `승인` → 대표 문서 화면 `승인`. 줄마다 테스트가 따로라 서로 겹치지 않는다.

const RECEIPT = "test/e2e/assets/receipt-3000x2000.jpg";
const PHONE = { width: 375, height: 800 };
const META = /^\d+KB · \d{2}-\d{2}$/;

function titleOf(fx: ExpenseE2E, itemName: string): string {
  return `지출결의 — ${fx.projectName} · ${itemName}`;
}

// 서버 액션 POST(`next-action` 헤더)를 센다 — 액션 이름은 헤더에 없어 건수만 본다.
function countActionPosts(page: Page): { count: () => number } {
  let total = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) total += 1;
  });
  return { count: () => total };
}

// 도메인 함수로 작성 중 문서를 만들어 폼을 연다(견적 줄 표 클릭은 트레이서가 따로 증명한다).
async function openDraftForm(page: Page, fx: ExpenseE2E, key: "hold" | "retry"): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  await page.goto(`/expenses/${expenseId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(titleOf(fx, fx.lines[key].itemName));
  await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
  return expenseId;
}

test.describe("지출결의 올리기 → 제출 → 폰 결재 시트 승인 → 대표 승인 (05-05 트레이서)", () => {
  test("PM이 견적 줄에서 폼을 열어 사진 한 장을 붙여 제출하고 팀장이 폰에서, 대표가 문서 화면에서 승인한다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const line = fx.lines.tracer;

    // 1) 견적 줄 행 행동 → 폼(자동 채움).
    const pm = await loginPage(browser, baseURL, fx.pm);
    await pm.goto(`/projects/${fx.projectId}`);
    const lineRow = pm.getByRole("row").filter({ hasText: line.itemName });
    const open = lineRow.getByRole("button", { name: "지출결의 올리기" });
    await waitForHydration(open);
    await open.click();
    await expect(pm).toHaveURL(/\/expenses\/[0-9a-f-]{36}$/);
    const expenseId = pm.url().split("/").at(-1) ?? "";
    await expect(pm.getByRole("heading", { level: 1 })).toHaveText(titleOf(fx, line.itemName));
    const head = pm.locator('[data-ui="screen-title"]').locator("..");
    await expect(head.getByText("작성 중", { exact: true })).toBeVisible();
    await expect(pm.getByText(fx.vendorName)).toBeVisible();
    await expect(pm.getByLabel("증빙 종류")).toHaveValue("tax_invoice");
    await expect(pm.getByLabel("공급가액")).toHaveValue("12,400,000");
    await expect(pm.getByLabel("지급 방식")).toHaveValue("bank_transfer");

    // 2) 사진 한 장 — 메타가 `KB · MM-DD` 꼴로 바뀐다.
    await waitForHydration(pm.getByRole("button", { name: /^임시 저장/ }));
    await pm.getByTestId("attachments-input").setInputFiles(RECEIPT);
    const evidenceRow = pm.locator('[data-ui="attachments"] li');
    await expect(evidenceRow).toHaveCount(1);
    await expect(evidenceRow.getByText(META)).toBeVisible();

    // 3) Ctrl+Enter 제출 — 요청 한 건 · 제출 중 나머지 버튼 aria-disabled(disabled 속성 없음).
    await delayServerActions(pm, 600);
    const posts = countActionPosts(pm);
    const submit = pm.getByRole("button", { name: /^지출결의 제출/ });
    await submit.focus();
    await pm.keyboard.press("Control+Enter");
    await pm.keyboard.press("Control+Enter");
    await submit.click({ force: true });
    const save = pm.getByRole("button", { name: /^임시 저장/ });
    await expect(save).toHaveAttribute("aria-disabled", "true");
    await expect(save).not.toHaveAttribute("disabled", /.*/);
    await expect(pm).toHaveURL(new RegExp(`/expenses/${expenseId}\\?submitted=1$`));
    expect(posts.count()).toBe(1);

    // 4) 제출 결과 — 토스트 · 번호 · 태그 · 증빙 섹션.
    await expect(pm.getByRole("status").filter({ hasText: "지출결의 제출" })).toHaveText(`지출결의 제출 · 결재 요청됨 → ${fx.lead.name}`);
    await expect(pm.locator('[data-ui="screen-meta"]')).toHaveText(`${fx.projectNumber}-0001`);
    await expect(head.getByText("결재 중", { exact: true })).toBeVisible();
    const evidenceSection = pm.getByRole("heading", { level: 2, name: "증빙" }).locator("..");
    await expect(evidenceSection.getByRole("listitem")).toHaveCount(1);
    await expect(pm.locator("#evidence")).toBeVisible();

    // 5) 팀장 — 폰 결재 시트(행이 button + aria-haspopup="dialog" — 링크가 아니다).
    const lead = await loginPage(browser, baseURL, fx.lead, PHONE);
    await lead.goto("/approvals");
    const trigger = lead.getByRole("button", { name: `지출결의 · ${fx.projectName} · ${line.itemName}` });
    await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    await waitForHydration(trigger);
    await trigger.click();
    const sheet = lead.getByRole("dialog");
    await expect(sheet.getByRole("heading", { level: 2 })).toHaveText(titleOf(fx, line.itemName));
    await expect(sheet.locator("dt", { hasText: /^공급가액$/ })).toHaveCount(1);
    await expectSheetDocumentLink(sheet, expenseId, `/expenses/${expenseId}`);
    await sheet.getByRole("button", { name: "승인" }).click();
    await expect(sheet).toBeHidden();
    // 처리함 — 그 문서 행은 이제 문서 링크다.
    await expect(lead.getByRole("link", { name: `지출결의 · ${fx.projectName} · ${line.itemName}` })).toBeVisible();

    // 6) 대표 — 문서 화면 `승인 Ctrl+Enter` → 태그 `승인`.
    const ceo = await loginPage(browser, baseURL, fx.ceo);
    await ceo.goto(`/expenses/${expenseId}`);
    const approve = ceo.getByRole("button", { name: /^승인/ });
    await waitForHydration(approve);
    await approve.click();
    await expect(ceo.getByRole("button", { name: /^승인/ })).toHaveCount(0);
    const ceoHead = ceo.locator('[data-ui="screen-title"]').locator("..");
    await expect(ceoHead.getByText("승인", { exact: true })).toBeVisible();
  });
});

test.describe("올리는 중 제출 · 다시 올리기", () => {
  test("올리는 행이 있는 동안 1차가 막히고 떠나면 beforeunload가 뜨며 끝나면 풀린다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openDraftForm(page, fx, "hold");

    // 로컬 저장소 PUT을 붙잡아 둔다.
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/storage-local/**", async (route) => {
      await held;
      await route.continue();
    });
    await page.getByTestId("attachments-input").setInputFiles(RECEIPT);
    const row = page.locator('[data-ui="attachments"] li');
    await expect(row.getByText("올리는 중…")).toBeVisible();

    const submit = page.getByRole("button", { name: /^지출결의 제출/ });
    await expect(submit).toHaveAttribute("aria-disabled", "true");
    const describedBy = (await submit.getAttribute("aria-describedby")) ?? "";
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText("증빙 올리는 중 · 잠시 뒤 제출");

    // 1차 클릭 · Ctrl+Enter는 서버를 부르지 않는다.
    const posts = countActionPosts(page);
    await submit.click();
    await submit.focus();
    await page.keyboard.press("Control+Enter");
    expect(posts.count()).toBe(0);

    // beforeunload — 대화상자는 dismiss로 닫고 페이지를 이어 쓴다.
    const dialogs: string[] = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.type());
      void dialog.dismiss();
    });
    await page.close({ runBeforeUnload: true });
    await expect.poll(() => dialogs).toEqual(["beforeunload"]);
    expect(page.isClosed()).toBe(false);

    release();
    await expect(row.getByText(META)).toBeVisible();
    await expect(page.getByText("증빙 올리는 중 · 잠시 뒤 제출")).toHaveCount(0);
  });

  test("첫 PUT이 실패하면 실패 행 `올리지 못함 · 다시 올리기` → 3차 `다시 올리기` → 성공 메타", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openDraftForm(page, fx, "retry");

    let failedOnce = false;
    await page.route("**/api/storage-local/**", async (route) => {
      if (!failedOnce) {
        failedOnce = true;
        await route.fulfill({ status: 500, body: "" });
        return;
      }
      await route.continue();
    });
    await page.getByTestId("attachments-input").setInputFiles(RECEIPT);
    const row = page.locator('[data-ui="attachments"] li');
    await expect(row.getByText("올리지 못함 · 다시 올리기")).toBeVisible();
    await row.getByRole("button", { name: "다시 올리기" }).click();
    await expect(row.getByText(META)).toBeVisible();
    await expect(page.getByText("올리지 못함 · 다시 올리기")).toHaveCount(0);
  });
});
