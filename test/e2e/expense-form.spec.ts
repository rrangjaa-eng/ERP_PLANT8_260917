import { test, expect, type Locator, type Page } from "@playwright/test";
import { createExpenseFromLines } from "@/domain/expenses";
import { delayServerActions, loginPage, waitForHydration } from "./leave-org";
import { setupExpenseE2E, uniqueReceipt, type ExpenseE2E, type LineKey } from "./expense-fixture";

// 05-06(EXP-15 · UX-06 · UI-SPEC S5 · S6): 지출결의 폼의 즉시 재계산 한 줄과 제출 막힘 이유. 계산 · 판정은 서버 하나 — 화면은 서버가 보낸
// 문자열만 그린다. 색은 DOM 실측(계산된 color = 토큰 값)으로 판정한다.

const UPLOAD_WAIT = 20_000;
const META = /^\d+KB · \d{2}-\d{2}$/;

async function openDraft(page: Page, fx: ExpenseE2E, key: LineKey): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  await page.goto(`/expenses/${expenseId}`);
  await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
  return expenseId;
}

// 토큰 하나의 계산된 색(rgb) — 같은 문서에 임시 요소를 붙여 브라우저가 해석한 값을 읽는다.
async function tokenColor(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);
}

async function colorOf(target: Locator): Promise<string> {
  return target.evaluate((element) => getComputedStyle(element).color);
}

test.describe("계산 한 줄 즉시 재계산 (S5)", () => {
  test("증빙 종류를 기타소득으로 바꾸면 원천징수 한 줄이 오고, 오는 동안 이전 줄이 흐린 색으로 남으며, 제출한 문서 화면에 같은 한 줄", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    const expenseId = await openDraft(page, fx, "tracer");

    const line = page.getByTestId("expense-tax-line");
    await expect(line).toHaveText("부가세 10% 1,240,000 · 지급 총액 13,640,000 · 세금계산서 규칙");
    const muted = await tokenColor(page, "--text-muted");
    const faint = await tokenColor(page, "--text-faint");
    expect(await colorOf(line)).toBe(muted);

    await delayServerActions(page, 1_500);
    await page.getByLabel("증빙 종류").selectOption("other_income");
    // 오는 동안 — 이전 줄이 그대로(빈칸 · 뼈대 없음) 흐린 색.
    await expect.poll(() => colorOf(line)).toBe(faint);
    await expect(line).toHaveText("부가세 10% 1,240,000 · 지급 총액 13,640,000 · 세금계산서 규칙");
    await expect(line).toHaveText("원천징수 8.8% 1,091,200 · 실지급액 11,308,800 · 기타소득 규칙", { timeout: 10_000 });
    expect(await colorOf(line)).toBe(muted);
    // 숫자 조각만 700.
    const bold = await line.locator("span").evaluateAll((spans) =>
      spans.filter((span) => getComputedStyle(span).fontWeight === "700" && span.children.length === 0).map((span) => span.textContent),
    );
    expect(bold).toEqual(["8.8%", "1,091,200", "11,308,800"]);

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.getByTestId("attachments-input").setInputFiles(await uniqueReceipt(page));
    await expect(page.locator('[data-ui="attachments"] li').getByText(META)).toBeVisible({ timeout: UPLOAD_WAIT });
    await page.getByRole("button", { name: /^지출결의 제출/ }).click();
    await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}\\?submitted=1$`));
    await expect(page.getByTestId("expense-tax-line")).toHaveText("원천징수 8.8% 1,091,200 · 실지급액 11,308,800 · 기타소득 규칙");
    await expect(page.getByTestId("expense-tax-drift")).toHaveCount(0);
  });
});

// 서버 액션 POST(`next-action` 헤더) 수.
function countActionPosts(page: Page): { count: () => number } {
  let total = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) total += 1;
  });
  return { count: () => total };
}

test.describe("막힘 이유 (S6)", () => {
  test("증빙 없는 폼: 1차 aria-disabled + 이유 글자 · 첫 포커스 첨부 영역 · 눌러도 요청 0건 · 올리면 풀린다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openDraft(page, fx, "hold");

    const submit = page.getByRole("button", { name: /^지출결의 제출/ });
    const picker = page.locator("#evidence-picker");
    await expect(submit).toHaveAttribute("aria-disabled", "true");
    expect(await submit.getAttribute("disabled")).toBeNull();
    const describedBy = (await submit.getAttribute("aria-describedby")) ?? "";
    expect(describedBy).not.toBe("");
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(/^증빙 없음 · 증빙 올리기\s*Ctrl\+U$/);
    await expect(picker).toBeFocused();

    const posts = countActionPosts(page);
    await page.getByLabel("비고").focus();
    await submit.click({ force: true });
    await expect(picker).toBeFocused();
    await page.getByLabel("비고").focus();
    await page.keyboard.press("Control+Enter");
    await expect(picker).toBeFocused();
    expect(posts.count()).toBe(0);

    await page.getByTestId("attachments-input").setInputFiles(await uniqueReceipt(page));
    await expect(page.locator('[data-ui="attachments"] li').getByText(META)).toBeVisible({ timeout: UPLOAD_WAIT });
    await expect(submit).not.toHaveAttribute("aria-disabled", "true", { timeout: 10_000 });
    await expect(page.getByText(/^증빙 없음/)).toHaveCount(0);
  });

  test("빈 칸이면 그 칸 이유 · 다음 한 수 3차가 그 칸으로 포커스, 채우면 다음 막힘으로 바뀐다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openDraft(page, fx, "hold");

    const submit = page.getByRole("button", { name: /^지출결의 제출/ });
    await page.getByLabel("지급 방식").selectOption("");
    const describedBy = () => submit.getAttribute("aria-describedby").then((id) => page.locator(`[id="${id ?? ""}"]`));
    await expect(await describedBy()).toHaveText(/^지급 방식 비어 있음 · 지급 방식 고르기$/, { timeout: 10_000 });
    await page.getByRole("button", { name: "지급 방식 고르기" }).click();
    await expect(page.getByLabel("지급 방식")).toBeFocused();

    await page.getByLabel("지급 방식").selectOption("bank_transfer");
    await expect(await describedBy()).toHaveText(/^증빙 없음 · 증빙 올리기\s*Ctrl\+U$/, { timeout: 10_000 });
  });
});
