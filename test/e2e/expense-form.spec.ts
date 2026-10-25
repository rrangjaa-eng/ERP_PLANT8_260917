import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { getApprovalView, rejectDocument } from "@/domain/approvals";
import { createExpenseFromLines, createTeamExpenseDraft, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { insertTempRole } from "./temp-roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertVendor, updateVendor, updateVendorAccountNumber } from "@/repositories/vendors";
import { delayServerActions, loginPage, waitForHydration, type Person } from "./leave-org";
import { setupExpenseE2E, submitLineExpense, uniqueReceipt, type ExpenseE2E, type LineKey } from "./expense-fixture";

// 05-06(EXP-15 · UX-06 · UI-SPEC S5 · S6): 지출결의 폼의 즉시 재계산 한 줄과 제출 막힘 이유. 계산 · 판정은 서버 하나 — 화면은 서버가 보낸
// 문자열만 그린다. 색은 DOM 실측(계산된 color = 토큰 값)으로 판정한다.

const UPLOAD_WAIT = 20_000;
const META = /^\d+KB · \d{2}-\d{2}$/;

async function openDraft(page: Page, fx: ExpenseE2E, key: LineKey): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id], fields: { note: "행사 운영비" } });
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
  // 06.5 D-6501 · EP1-7: 기타소득은 회사 대납 22% 역산 — 12,400,000 ÷ 0.78 − 12,400,000 = 3,497,435.89… → 10원 절사 3,497,430(식으로 계산한 값).
  test("증빙 종류를 기타소득으로 바꾸면 회사 대납 한 줄이 오고, 오는 동안 이전 줄이 흐린 색으로 남으며, 제출한 문서 화면에 같은 한 줄", async ({ browser, baseURL }) => {
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
    await expect(line).toHaveText("회사 대납 세금 22% 3,497,430 · 지급 총액 12,400,000 · 기타소득 규칙", { timeout: 10_000 });
    expect(await colorOf(line)).toBe(muted);
    // 숫자 조각만 700.
    const bold = await line.locator("span").evaluateAll((spans) =>
      spans.filter((span) => getComputedStyle(span).fontWeight === "700" && span.children.length === 0).map((span) => span.textContent),
    );
    expect(bold).toEqual(["22%", "3,497,430", "12,400,000"]);

    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.getByTestId("attachments-input").setInputFiles(await uniqueReceipt(page));
    await expect(page.locator('[data-ui="attachments"] li').getByText(META)).toBeVisible({ timeout: UPLOAD_WAIT });
    await page.getByRole("button", { name: /^지출결의 제출/ }).click();
    await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}\\?submitted=1$`));
    await expect(page.getByTestId("expense-tax-line")).toHaveText("회사 대납 세금 22% 3,497,430 · 지급 총액 12,400,000 · 기타소득 규칙");
    await expect(page.getByTestId("expense-tax-drift")).toHaveCount(0);
  });
});

test.describe("계산 한 줄 폭 (D1)", () => {
  test("PC에서 계산 한 줄은 증빙 종류와 상관없이 한 줄이고 아래 칸이 움직이지 않는다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openDraft(page, fx, "tracer");

    const line = page.getByTestId("expense-tax-line");
    // 07-16(D-714): 계산 줄 아래 날짜 칸은 희망 지급일(지급 예정일은 읽기 줄).
    const below = page.getByLabel("희망 지급일");
    const metrics = async () => ({
      lineHeight: (await line.boundingBox())?.height ?? 0,
      lineHeightOne: await line.evaluate((element) => Math.round(parseFloat(getComputedStyle(element).lineHeight))),
      belowY: Math.round((await below.boundingBox())?.y ?? 0),
    });
    await expect(line).toHaveText(/세금계산서 규칙$/);
    const vat = await metrics();
    expect(vat.lineHeight).toBeLessThanOrEqual(vat.lineHeightOne + 1);

    await page.getByLabel("증빙 종류").selectOption({ label: "계산서" });
    await expect(line).toHaveText(/계산서 규칙$/);
    await expect(line).not.toHaveText(/세금계산서 규칙$/);
    const none = await metrics();
    expect(none.lineHeight).toBeLessThanOrEqual(none.lineHeightOne + 1);
    expect(none.belowY).toBe(vat.belowY);

    await page.getByLabel("증빙 종류").selectOption({ label: "기타소득" });
    await expect(line).toHaveText(/기타소득 규칙$/);
    const other = await metrics();
    expect(other.lineHeight).toBeLessThanOrEqual(other.lineHeightOne + 1);
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
    await page.getByLabel("상세", { exact: true }).focus();
    await submit.click({ force: true });
    await expect(picker).toBeFocused();
    await page.getByLabel("상세", { exact: true }).focus();
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

test.describe("결과 줄 aria-live (05 /review B4)", () => {
  test("임시 저장이 통신 실패로 끝나면 실패 줄이 polite 라이브 영역 안에 선다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openDraft(page, fx, "tracer");

    const failed = "임시 저장 실패 · 다시 시도";
    await expect(page.locator('[aria-live="polite"]').filter({ hasText: failed })).toHaveCount(0);
    await page.route("**/*", async (route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) await route.abort("failed");
      else await route.continue();
    });
    await page.getByRole("button", { name: /^임시 저장/ }).click();
    await expect(page.getByText(failed, { exact: true })).toBeVisible();
    await expect(page.locator('[aria-live="polite"]').filter({ hasText: failed })).toHaveCount(1);
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.context().close();
  });
});

// 06.5 V15(카드 ①): 받는 인원 칸 — 회사 대납 증빙 종류에서만, 공급가액 바로 뒤 · 분할 지급 앞. 기본 1 · 숫자만 · 비우면 한 문구 ·
// 바꾸면 계산 한 줄이 면제 ↔ 세금으로 다시 온다. 증빙 종류를 바꿨다 되돌리면 적어 둔 값이 남는다.
test.describe("받는 인원 칸 (06.5 V15)", () => {
  test("기타소득에서만 칸이 서고, 숫자만 받고, 비우면 칸 오류 · 포커스, 바꾸면 계산 한 줄이 다시 온다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openDraft(page, fx, "tracer");
    const headcount = page.locator("#headcount");
    const line = page.getByTestId("expense-tax-line");

    await expect(headcount).toHaveCount(0);
    await page.getByLabel("증빙 종류").selectOption("other_income");
    await expect(headcount).toHaveCount(1);
    await expect(page.getByLabel("받는 인원", { exact: true })).toHaveValue("1");
    await expect(headcount).toHaveAttribute("inputmode", "numeric");
    const order = await page.locator("#supplyAmount, #headcount, #installment, #requestedPaymentDate").evaluateAll((elements) => elements.map((element) => element.id));
    expect(order.slice(0, 2)).toEqual(["supplyAmount", "headcount"]);
    expect(order.at(-1)).toBe("requestedPaymentDate");

    await page.locator("#supplyAmount").fill("150000");
    await headcount.fill("5");
    await expect(line).toHaveText("회사 대납 세금 0 · 면제 기준 이하 · 지급 총액 150,000 · 기타소득 규칙", { timeout: 10_000 });
    await headcount.fill("1");
    await expect(line).toHaveText("회사 대납 세금 22% 42,300 · 지급 총액 150,000 · 기타소득 규칙", { timeout: 10_000 });

    // 숫자 아닌 글자는 칸에 남지 않는다.
    await headcount.click();
    await headcount.press("End");
    await headcount.pressSequentially("a,.");
    await expect(headcount).toHaveValue("1");

    // 비우고 임시 저장 → 한 문구 · aria · 포커스.
    await headcount.fill("");
    await page.getByRole("button", { name: /^임시 저장/ }).click();
    await expect(page.locator("#headcount-error")).toHaveText("받는 인원 1 미만 · 1 이상 적기");
    await expect(headcount).toHaveAttribute("aria-invalid", "true");
    await expect(headcount).toHaveAttribute("aria-describedby", "headcount-error");
    await expect(headcount).toBeFocused();

    // 증빙 종류를 바꿨다 되돌리면 적어 둔 값이 남는다.
    await headcount.fill("3");
    await page.getByLabel("증빙 종류").selectOption("tax_invoice");
    await expect(headcount).toHaveCount(0);
    await page.getByLabel("증빙 종류").selectOption("other_income");
    await expect(headcount).toHaveValue("3");
    await page.context().close();
  });
});

// 06.5 D-6520: 기안자 폼에 증빙 금액 칸이 없다(금액은 공급가액 하나) — 증빙일 칸은 그대로.
test.describe("증빙 금액 칸 없음 (06.5 D-6520)", () => {
  test("작성 중 폼 · 새 팀 비용 폼에 `증빙 금액` 라벨 0 · `증빙일` 칸은 있다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openDraft(page, fx, "tracer");
    await expect(page.getByText("증빙 금액", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("증빙일", { exact: true })).toHaveCount(1);

    await page.goto("/expenses/new");
    await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
    await expect(page.getByText("증빙 금액", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("증빙일", { exact: true })).toHaveCount(1);
    await page.context().close();
  });
});

test.describe("증빙 첨부 영역 (05 /review B5 · B7)", () => {
  test("여러 파일을 한 번에 올려도 문서 화면 새로 고침은 마지막에 한 번이다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openDraft(page, fx, "tracer");

    let refreshes = 0;
    page.on("request", (request) => {
      const headers = request.headers();
      if (request.method() === "GET" && headers["rsc"] === "1" && !headers["next-router-prefetch"]) refreshes += 1;
    });
    await page.getByTestId("attachments-input").setInputFiles([await uniqueReceipt(page), await uniqueReceipt(page)]);
    const rows = page.locator('[data-ui="attachments"] li');
    await expect(rows).toHaveCount(2, { timeout: UPLOAD_WAIT });
    await expect(rows.getByText(META)).toHaveCount(2, { timeout: UPLOAD_WAIT });
    await page.waitForLoadState("networkidle");
    expect(refreshes).toBe(1);
    await page.context().close();
  });

  test("완료 파일 행의 크게 보기 · 삭제는 파일명을 가리키고, 삭제 실패는 행 안에 한 줄이 서며, 지운 뒤 포커스는 첨부 영역에 남는다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openDraft(page, fx, "tracer");

    const receipt = await uniqueReceipt(page);
    await page.getByTestId("attachments-input").setInputFiles(receipt);
    const row = page.locator('[data-ui="attachments"] li');
    await expect(row.getByText(META)).toBeVisible({ timeout: UPLOAD_WAIT });
    await expect(row.getByRole("link", { name: "크게 보기" })).toHaveAccessibleDescription(receipt.name);
    const remove = row.getByRole("button", { name: "삭제" });
    await expect(remove).toHaveAccessibleDescription(receipt.name);

    await page.route("**/*", async (route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) await route.abort("failed");
      else await route.continue();
    });
    await remove.click();
    await expect(row.getByText("삭제 실패 · 다시 시도", { exact: true })).toBeVisible();
    await expect(row).toHaveCount(1);
    await page.unrouteAll({ behavior: "ignoreErrors" });

    await remove.click();
    await expect(row).toHaveCount(0);
    await expect(page.locator('[data-ui="attachments"]').locator(":focus")).toHaveCount(1);
    await page.context().close();
  });
});

// 05 /review C8(adversarial F7): 결과 줄 라이브 영역은 display: contents가 아닌 상자다(WebKit은 contents 요소를 접근성 트리에서 뺄 수 있다).
// 비었을 때는 배치에 끼지 않고(떼어 내도 행동 줄 실측이 같다), 결과가 서면 PC는 1차와 같은 줄이다(B4 전 배치).
test.describe("결과 줄 라이브 영역 상자 (05 /review C8)", () => {
  test("라이브 영역은 상자이고 비었을 때 떼어도 행동 줄 실측이 같으며, 임시 저장 결과는 1차와 같은 줄에 선다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openDraft(page, fx, "tracer");
    const bar = page.getByTestId("expense-form-actions");
    const region = bar.locator('[aria-live="polite"]');
    await expect(region).toHaveCount(1);
    expect(await region.evaluate((el) => getComputedStyle(el).display)).not.toBe("contents");

    const measured = await region.evaluate((el) => {
      const actions = el.parentElement;
      if (!actions) throw new Error("행동 줄 없음");
      const measure = () => ({
        height: Math.round(actions.getBoundingClientRect().height),
        buttons: [...actions.querySelectorAll("button")].map((button) => {
          const rect = button.getBoundingClientRect();
          return [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width)];
        }),
      });
      const withRegion = measure();
      const next = el.nextSibling;
      el.remove();
      const without = measure();
      actions.insertBefore(el, next);
      return { withRegion, without };
    });
    expect(measured.withRegion).toEqual(measured.without);

    await page.getByRole("button", { name: /^임시 저장/ }).click();
    const saved = region.getByText(/^임시 저장됨 /);
    await expect(saved).toBeVisible();
    const [line, submit] = [await saved.boundingBox(), await page.getByRole("button", { name: /^지출결의 제출/ }).boundingBox()];
    expect(line!.y, "결과 줄이 1차와 같은 줄").toBeLessThan(submit!.y + submit!.height);
    expect(line!.y + line!.height, "결과 줄이 1차와 같은 줄").toBeGreaterThan(submit!.y);
    await page.context().close();
  });
});

test.describe("견적 줄 바꾸기 포커스 플래그 (05 /review B9)", () => {
  test("같은 줄을 다시 골라 폼이 새로 그려지지 않아도 다음에 여는 다른 지출결의 폼의 첫 포커스를 가로채지 않는다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    const firstId = await openDraft(page, fx, "tracer");
    const second = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.hold.id], fields: { note: "행사 운영비" } });
    const secondId = second.created[0]?.expenseId;
    if (!secondId) throw new Error("두 번째 작성 중 문서를 만들지 못했다");

    // 현재 줄을 그대로 고른다 — 서버가 아무것도 바꾸지 않아 폼은 같은 key로 남는다.
    await page.getByRole("button", { name: "바꾸기", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "견적 줄 바꾸기" });
    await expect(dialog.getByRole("option").first()).toBeVisible();
    await dialog.getByRole("option", { name: new RegExp(fx.lines.tracer.itemName) }).click();
    await dialog.getByRole("button", { name: /^이 줄로/ }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/expenses/${firstId}$`));

    // 앱 안 이동(새로 고침 없이)으로 다른 문서 폼을 연다 — 모듈 상태가 남아 있으면 `바꾸기` 3차가 포커스를 가져간다.
    await page.evaluate((id) => (window as unknown as { next: { router: { push: (href: string) => void } } }).next.router.push(`/expenses/${id}`), secondId);
    await expect(page).toHaveURL(new RegExp(`/expenses/${secondId}$`));
    await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
    await expect(page.locator("#line-pick")).not.toBeFocused();
    await expect(page.locator(":focus")).toHaveCount(1);
    await page.context().close();
  });
});

// 05-VERIFICATION 갭(/review #3): 반려된 번호 있는 문서도 기안자가 고칠 수 있다(05-09) — `바꾸기`로 같은 프로젝트의 다른 줄로 옮겨진다.
test.describe("반려된 번호 있는 문서의 견적 줄 바꾸기 (05-09)", () => {
  test("`바꾸기` 목록이 서고 다른 줄을 고르면 그 줄로 바뀐다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await submitLineExpense(browser, baseURL, fx, "tracer");
    const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
    if (!view) throw new Error("결재 문서를 읽지 못했다");
    await rejectDocument(fx.lead.viewer, { instanceId: view.instanceId, expectedVersion: view.version, reason: "줄 다시" });

    const page = await loginPage(browser, baseURL, fx.pm);
    await page.goto(`/expenses/${expenseId}`);
    const change = page.locator("#line-pick");
    await waitForHydration(change);
    await change.click();
    const dialog = page.getByRole("dialog", { name: "견적 줄 바꾸기" });
    await dialog.getByRole("option", { name: new RegExp(fx.lines.hold.itemName) }).click();
    await dialog.getByRole("button", { name: /^이 줄로/ }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("없는 지출결의 · 새로 고침")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(fx.lines.hold.itemName);
    await page.context().close();
  });
});

// 05 /review C1(adversarial F1): 기안자의 지출결의 쓰기 권한이 그 뒤 빠지면 자기 작성 중 문서는 오류 화면이 아니라 읽기 화면이다.
// 06.5 D-6507(UI-SPEC V4): 계좌이체인데 지급처에 계좌가 없으면 1차가 막히고 이유는 담당을 적는다(고칠 권한 없는 기안자 — 3차 없음).
test.describe("지급처 계좌 없음 (06.5 V4)", () => {
  test("계좌 없는 거래처의 계좌이체 팀 비용 문서: 1차 aria-disabled + `지급처 계좌 없음 · 계좌 등록은 경영관리` · 3차 없음", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const suffix = randomUUID().slice(0, 6);
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E계좌없음-${suffix}`, normalizedName: `e2e계좌없음-${suffix}`, defaultEvidenceType: "tax_invoice" });
    const { expenseId } = await createTeamExpenseDraft(fx.pm.viewer, {
      idempotencyKey: randomUUID(),
      fields: {
        teamExpenseKind: "team_overhead",
        usageDate: seoulToday(),
        content: `계좌없음 회식-${suffix}`,
        note: "행사 운영비",
        vendorId: vendor.id,
        supply: { currency: "KRW", amount: 100_000, fxRate: 1 },
        evidenceType: "tax_invoice",
        paymentMethod: "bank_transfer",
      },
    });
    const page = await loginPage(browser, baseURL, fx.pm);
    await page.goto(`/expenses/${expenseId}`);
    await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));

    const submit = page.getByRole("button", { name: /^지출결의 제출/ });
    await expect(submit).toHaveAttribute("aria-disabled", "true");
    const describedBy = (await submit.getAttribute("aria-describedby")) ?? "";
    expect(describedBy).not.toBe("");
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText("지급처 계좌 없음 · 계좌 등록은 경영관리", { timeout: 10_000 });
    await expect(page.locator("#expense-next-step")).toHaveCount(0);
    await page.context().close();
  });
});

// 06.5 PR-C QA D-1: 새 탭에서 계좌를 등록하고 돌아오면 원래 탭의 막힘이 저절로 풀려야 한다(탭 복귀 = 미리보기 다시 호출).
test.describe("지급처 계좌 등록 뒤 탭 복귀 (06.5 D-1)", () => {
  test("계좌 없음으로 막힌 문서: 다른 곳에서 계좌를 등록하고 탭에 돌아오면 1차 막힘이 풀리고 제출된다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const suffix = randomUUID().slice(0, 6);
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E계좌복귀-${suffix}`, normalizedName: `e2e계좌복귀-${suffix}`, defaultEvidenceType: "tax_invoice" });
    const { expenseId } = await createTeamExpenseDraft(fx.pm.viewer, {
      idempotencyKey: randomUUID(),
      fields: {
        teamExpenseKind: "team_overhead",
        usageDate: seoulToday(),
        content: `계좌복귀 회식-${suffix}`,
        note: "행사 운영비",
        vendorId: vendor.id,
        supply: { currency: "KRW", amount: 100_000, fxRate: 1 },
        evidenceType: "tax_invoice",
        paymentMethod: "bank_transfer",
      },
    });
    const page = await loginPage(browser, baseURL, fx.pm);
    await page.goto(`/expenses/${expenseId}`);
    await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
    const submit = page.getByRole("button", { name: /^지출결의 제출/ });
    await expect(submit).toHaveAttribute("aria-disabled", "true");

    // 새 탭에서 계좌를 등록한 것과 같다 — 같은 DB 값을 바꾸고 원래 탭은 손대지 않는다.
    await updateVendor(SYSTEM_VIEWER, vendor.id, { accountBank: "국민은행", accountHolder: "E2E" });
    await updateVendorAccountNumber(SYSTEM_VIEWER, vendor.id, { accountNumberEncrypted: "e2e-encrypted", accountNumberLast4: "1234" });
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

    // 계좌 막힘은 풀리고 다음 이유(증빙 없음)가 온다 — 증빙을 올리면 1차가 열려 제출된다.
    const describedBy = (await submit.getAttribute("aria-describedby")) ?? "";
    await expect(page.locator(`[id="${describedBy}"]`)).toContainText("증빙 없음");
    await page.getByTestId("attachments-input").setInputFiles(await uniqueReceipt(page));
    await expect(submit).not.toHaveAttribute("aria-disabled", "true", { timeout: UPLOAD_WAIT });
    await submit.click();
    await expect(page.getByRole("button", { name: /^지출결의 제출/ })).toHaveCount(0);
    await page.context().close();
  });
});

test.describe("쓰기 권한이 빠진 기안자의 작성 중 문서 (05 /review C1)", () => {
  test("오류 화면 없이 문서 읽기 화면이 서고 폼(임시 저장 · 제출)이 없다", async ({ browser, baseURL }) => {
    const suffix = randomUUID().slice(0, 8);
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E권한본부-${suffix}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E권한팀-${suffix}` });
    const role = await insertTempRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E쓰기회수-${suffix}`, workScope: "company" });
    for (const action of ["view", "write"] as const) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action, allowed: true });
    for (const infoItem of ["expense.value", "expense.amount", "approval.value", "project.value", "quote.amount", "vendor.value", "team.value", "person.value"]) {
      await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
    }
    const email = `e2e-nowrite-${randomUUID()}@example.test`;
    const name = `회수${suffix.slice(0, 4)}`;
    const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name, roleId: role.id });
    const today = seoulToday();
    await assignTeam(SYSTEM_VIEWER, { userId, teamId: team.id, effectiveFrom: `${today.slice(0, 4)}-01-01` });
    const drafter: Person = { name, email, password: tempPassword, viewer: { id: userId, roleId: role.id } };
    const content = `권한회수 회식-${suffix}`;
    const { expenseId } = await createTeamExpenseDraft(drafter.viewer, {
      idempotencyKey: randomUUID(),
      fields: { teamExpenseKind: "team_overhead", usageDate: today, content },
    });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "write", allowed: false });

    const page = await loginPage(browser, baseURL, drafter);
    await page.goto(`/expenses/${expenseId}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(content);
    await expect(page.getByText("지출결의 불러오기 실패")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^임시 저장/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /제출/ })).toHaveCount(0);
    await page.context().close();
  });
});

// 05 /qa I1: 없는 날짜(02/30)로 「임시 저장」을 누르면 결과 줄이 저장 문구다 — 제출 문구가 아니다.
test.describe("없는 날짜로 임시 저장 (05 /qa I1)", () => {
  // 07-16(D-714): 작성자 날짜 칸은 희망 지급일 — 같은 뜻을 그 칸으로 옮겼다.
  test("결과 줄이 `임시 저장 실패 · 희망 지급일 1칸`이고 칸 오류가 선다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openDraft(page, fx, "tracer");

    const input = page.getByLabel("희망 지급일");
    await input.click({ position: { x: 8, y: 10 } });
    for (const part of ["02", "30", "2026"]) await page.keyboard.type(part);
    expect(await input.evaluate((element) => (element as HTMLInputElement).validity.badInput)).toBe(true);
    await page.getByRole("button", { name: /^임시 저장/ }).click();

    await expect(page.getByText("임시 저장 실패 · 희망 지급일 1칸")).toBeVisible();
    await expect(page.getByText(/제출 실패 · 희망 지급일/)).toHaveCount(0);
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await page.context().close();
  });
});

// 05 /qa I3: 결재 정보(approval.value)를 끈 계급의 기안자가 반려 문서를 봐도 값 없는 읽기 행(`반려`)이 남지 않는다.
test.describe("결재 정보를 끈 기안자의 반려 문서 (05 /qa I3)", () => {
  test("이름 · 사유와 함께 빈 `반려` 행도 없다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const id = await submitLineExpense(browser, baseURL, fx, "retry");
    const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: id });
    await rejectDocument(fx.lead.viewer, { instanceId: view!.instanceId, expectedVersion: view!.version, reason: "QA 숨김 사유" });
    const roleId = String(fx.pm.viewer.roleId);
    try {
      await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "approval.value", visible: false });
      const page = await loginPage(browser, baseURL, fx.pm);
      await page.goto(`/expenses/${id}`);
      await waitForHydration(page.getByRole("button", { name: /^지출결의 다시 제출/ }));
      const main = page.locator("main");
      await expect(main).not.toContainText(fx.lead.name);
      await expect(main).not.toContainText("QA 숨김 사유");
      await expect(main.locator("dt", { hasText: /^반려$/ })).toHaveCount(0);
      await page.context().close();
    } finally {
      await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "approval.value", visible: true });
    }
  });
});

// 06.5 V12 R-2: 프로젝트 비용 폼에는 `바꾸기`가 둘(견적 줄 · 지급처) — 지급처 쪽만 접근 이름 `지급처 바꾸기`이고 보이는 글자는 `바꾸기` 그대로.
test.describe("지급처 바꾸기 접근 이름 (06.5 V12 R-2)", () => {
  test("견적 줄 있음 + 지급처 값 있음 폼에서 접근 이름 `지급처 바꾸기` 버튼은 하나 · 견적 줄 `바꾸기`는 그 이름이 아니다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openDraft(page, fx, "tracer");
    await expect(page.getByTestId("expense-vendor")).toHaveText(fx.vendorName);
    const payee = page.getByRole("button", { name: "지급처 바꾸기", exact: true });
    await expect(payee).toHaveCount(1);
    await expect(payee).toHaveText("바꾸기");
    await expect(page.locator("#line-pick")).not.toHaveAccessibleName("지급처 바꾸기");
    await expect(page.locator("#line-pick")).toHaveText("바꾸기");
  });
});
