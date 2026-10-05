import { test, expect, type Locator, type Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { createExpenseFromLines } from "@/domain/expenses";
import { loginPage, waitForHydration } from "./leave-org";
import { setupExpenseE2E, submitLineExpense, type ExpenseE2E, type LineKey } from "./expense-fixture";
import { setupSettlementE2E, submitSettlementE2E } from "./settlement-fixture";

// 05-13 Task 2(UI-SPEC a11y backstop S4 · S6 · S14 · 페이즈 게이트): 지출결의 목록 · 새 문서 · 작성 중 폼 · 골라내기 열린 상태 · 제출된 문서 ·
// 결재함(지출결의 행) · 결재 시트 · 정산 결재 문서에서 axe 위반 0과 포커스 규칙. test/e2e/a11y.spec.ts는 고치지 않는다(04.1 leave-a11y와 같은 모양).

// 시트 · 확인 창의 열림 모션 동안 axe가 혼합 색을 잰다 — 유한 모션이 끝난 정지 상태를 잰다(leave-a11y와 같은 규칙).
async function expectNoAxeViolations(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.getAnimations().filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity && animation.playState === "running").length,
      ),
    )
    .toBe(0);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([]);
}

async function openDraft(page: Page, fx: ExpenseE2E, key: LineKey): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  await page.goto(`/expenses/${expenseId}`);
  await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
  return expenseId;
}

// 보이는 글자(공백 정리) = 접근 이름.
async function visibleText(target: Locator): Promise<string> {
  return (await target.evaluate((element) => (element as HTMLElement).innerText)).replace(/\s+/g, " ").trim();
}

test.describe("지출결의 화면 접근성 (05-13)", () => {
  test("목록 · 새 문서 · 작성 중 폼 — axe 0, 막힌 1차 aria-disabled + 이유 aria-describedby(disabled 없음), 첨부 영역 button · aria-live", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);

    await page.goto("/expenses");
    await expect(page.getByRole("heading", { level: 1, name: "지출결의" })).toBeVisible();
    await expectNoAxeViolations(page);

    await page.goto("/expenses/new");
    await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
    await expectNoAxeViolations(page);

    await openDraft(page, fx, "hold");
    await expectNoAxeViolations(page);

    // S6 — 막힌 1차는 탭 순서에 남는다: aria-disabled + 이유 글자, 네이티브 disabled 아님.
    const submit = page.getByRole("button", { name: /^지출결의 제출/ });
    await expect(submit).toHaveAttribute("aria-disabled", "true");
    expect(await submit.getAttribute("disabled")).toBeNull();
    const describedBy = (await submit.getAttribute("aria-describedby")) ?? "";
    expect(describedBy).not.toBe("");
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(/^증빙 없음 · /);

    // S4 — 첨부 영역은 button이고 접근 이름 = 보이는 글자, 상태 변화는 aria-live="polite" 안에서 읽힌다.
    const attachments = page.locator('[data-ui="attachments"]');
    const drop = attachments.getByRole("button").first();
    await expect(drop).toBeVisible();
    expect(await drop.evaluate((element) => element.tagName)).toBe("BUTTON");
    await expect(drop).toHaveAccessibleName(await visibleText(drop));
    await expect(attachments.locator('[aria-live="polite"]')).toHaveCount(1);
  });

  test("골라내기(견적 줄) — listbox · option · aria-selected, axe 0, 포커스 트랩 · Esc · 트리거 복귀, 고를 수 없는 행 aria-disabled + 이유", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openDraft(page, fx, "tracer");

    const trigger = page.getByRole("button", { name: "바꾸기" });
    await waitForHydration(trigger);
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "견적 줄 바꾸기" });
    await expect(dialog.getByRole("textbox", { name: "견적 줄 검색" })).toBeFocused();
    await expect(dialog.getByRole("listbox")).toHaveCount(1);
    // 목록이 다 온 뒤에 ↓(오기 전 ↓는 갈 행이 없다).
    await expect(dialog.getByRole("option", { name: new RegExp(fx.lines.noVendor.itemName) })).toBeVisible();
    await page.keyboard.press("ArrowDown");
    const first = dialog.getByRole("option").first();
    await expect(first).toBeFocused();
    await expect(first).toHaveAttribute("aria-selected", "true");

    // 고를 수 없는 행(거래처 없음) — aria-disabled + 이유 글자를 가리키는 aria-describedby.
    const noVendor = dialog.getByRole("option", { name: new RegExp(fx.lines.noVendor.itemName) });
    await expect(noVendor).toHaveAttribute("aria-disabled", "true");
    const reasonId = (await noVendor.getAttribute("aria-describedby")) ?? "";
    expect(reasonId).not.toBe("");
    await expect(page.locator(`[id="${reasonId}"]`).first()).toContainText("거래처 없음");

    await expectNoAxeViolations(page);

    // 포커스 트랩(네이티브 showModal) — Tab · Shift+Tab이 대화 상자 밖의 버튼 · 링크 · 입력으로 나가지 않는다. Chromium은 끝 요소 다음
    // 한 단계만 activeElement를 <body>로 두었다가 다음 키에서 안으로 돌아온다(quote-table.spec.ts 「견적 줄 삭제」와 같은 판정).
    for (const key of ["Tab", "Shift+Tab"]) {
      let previous: "inside" | "body" | "outside" = "inside";
      let insideSteps = 0;
      for (let i = 0; i < 12; i += 1) {
        await page.keyboard.press(key);
        const where = await dialog.evaluate((node) => (node.contains(document.activeElement) ? "inside" : document.activeElement === document.body ? "body" : "outside"));
        expect(where, `${key} ${i + 1}번째`).not.toBe("outside");
        if (where === "body") expect(previous, `${key} ${i + 1}번째 — body는 한 단계뿐`).toBe("inside");
        if (where === "inside") insideSteps += 1;
        previous = where;
      }
      expect(insideSteps).toBeGreaterThanOrEqual(8);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("제출된 문서 · 결재함(지출결의 행) · 결재 시트 — axe 0, 시트 Esc 뒤 트리거 복귀", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await submitLineExpense(browser, baseURL, fx, "tracer");

    const pm = await loginPage(browser, baseURL, fx.pm);
    await pm.goto(`/expenses/${expenseId}`);
    await expect(pm.getByTestId("expense-tax-line")).toBeVisible();
    await expectNoAxeViolations(pm);
    await pm.context().close();

    const lead = await loginPage(browser, baseURL, fx.lead);
    await lead.goto("/approvals");
    const label = `지출결의 · ${fx.projectName} · ${fx.lines.tracer.itemName}`;
    const row = lead.getByRole("row").filter({ hasText: label });
    await expect(row).toHaveCount(1);
    await expectNoAxeViolations(lead);

    const open = row.getByRole("button", { name: label });
    await waitForHydration(open);
    await open.click();
    const sheet = lead.getByRole("dialog");
    await expect(sheet.getByRole("button", { name: "승인" })).toBeVisible();
    await expectNoAxeViolations(lead);
    await lead.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(open).toBeFocused();
  });

  test("정산 결재 문서 — 기안자 · 결재자 화면 axe 0", async ({ browser, baseURL }) => {
    const fx = await setupSettlementE2E();
    await submitSettlementE2E(fx);
    const heading = { level: 1, name: `정산 결재 — ${fx.projectName}`, exact: true } as const;

    const pm = await loginPage(browser, baseURL, fx.pm);
    await pm.goto(`/projects/${fx.projectId}/settlement`);
    await expect(pm.getByRole("heading", heading)).toBeVisible();
    await expectNoAxeViolations(pm);
    await pm.context().close();

    const ceo = await loginPage(browser, baseURL, fx.ceo);
    await ceo.goto(`/projects/${fx.projectId}/settlement`);
    await expect(ceo.getByRole("heading", heading)).toBeVisible();
    await expectNoAxeViolations(ceo);
  });
});
