import { test, expect } from "@playwright/test";
import { expectSheetDocumentLink, loginPage, waitForHydration } from "./leave-org";
import { setupExpenseE2E, submitLineExpense } from "./expense-fixture";

// 05-10 Task 1 트레이서(UX-03 · 기준 3): 폰 첫 화면 「내 차례」 `[결재]` 지출결의 행 탭 → 결재 시트(지출결의 본문 · 증빙 썸네일) → `승인` → 행이 사라진다.
// 파일명 접두어 mobile-*로 mobile-375 프로젝트(375 폭)에서 돈다.

const PHONE = { width: 375, height: 800 };

test.describe("폰 첫 화면 [결재] → 결재 시트 → 승인 (05-10 트레이서)", () => {
  test("팀장 폰 첫 화면의 [결재] 지출결의 행을 탭하면 시트가 열리고 승인하면 그 행과 블록이 사라진다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const line = fx.lines.tracer;
    const expenseId = await submitLineExpense(browser, baseURL, fx, "tracer");
    const targetText = `${fx.projectName} · ${line.itemName}`;

    const lead = await loginPage(browser, baseURL, fx.lead, PHONE);
    await lead.goto("/");

    // 블록 · 행 — 한 줄 `대상 — 상황`, 숫자는 공급가액.
    await expect(lead.getByRole("heading", { level: 2, name: "내 차례 1" })).toBeVisible();
    const row = lead.getByRole("listitem").filter({ hasText: targetText });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(`${targetText} — 지출결의, ${fx.pm.name}`);
    await expect(row).toContainText("12,400,000");

    // 행 탭 — `button` + aria-haspopup="dialog"(링크가 아니다).
    const tap = row.getByRole("button", { name: "열기" });
    await expect(tap).toHaveAttribute("aria-haspopup", "dialog");
    await waitForHydration(tap);
    await tap.click();

    const sheet = lead.getByRole("dialog");
    await expect(sheet.getByRole("heading", { level: 2 })).toHaveText(`지출결의 — ${targetText}`);
    await expect(sheet.getByText(`${fx.projectNumber}-0001 · ${fx.pm.name}`)).toBeVisible();
    // 계산 한 줄 · 증빙 썸네일 한 장(주소는 시트가 열린 뒤 서버가 만든다).
    await expect(sheet.getByText("부가세 10% 1,240,000 · 지급 총액 13,640,000 · 세금계산서 규칙")).toBeVisible();
    const thumbs = sheet.getByTestId("sheet-evidence-thumb");
    await expect(thumbs).toHaveCount(1);
    await expect.poll(() => thumbs.first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(sheet.getByRole("button", { name: "크게 보기" })).toHaveCount(1);
    await expectSheetDocumentLink(sheet, expenseId, `/expenses/${expenseId}`);

    // 승인 — 시트가 닫히고 그 행 · 블록째 없다(항목 0).
    await sheet.getByRole("button", { name: "승인" }).click();
    await expect(sheet).toBeHidden();
    await expect(lead.getByRole("heading", { level: 2, name: /^내 차례/ })).toHaveCount(0);
    await expect(lead.getByText(targetText)).toHaveCount(0);
  });
});
