import { test, expect } from "@playwright/test";
import { loginPage, waitForHydration } from "./leave-org";
import { setupSettlementE2E } from "./settlement-fixture";

// 05-11(D-98 · UI-SPEC S10 · 확정 #3 · #4): 담당 PM이 프로젝트 상세 머리 줄 2차 `정산 결재 올리기`를 누르면 확인 창 없이 기안되고 그 자리가
// 3차 링크 `정산 결재 중`이 된다. 대표가 정산 결재 문서 화면에서 `승인`을 누르면 최종 승인과 프로젝트 완료가 한 번에 일어난다.

const KRW = /^\d{1,3}(,\d{3})+$/;

test.describe("정산 결재 — PM 올리기(확인 없음) → 대표 승인 → 완료", () => {
  test("올리기 토스트 · 머리 줄 링크 · 문서 화면 두 합(손익 행 없음) · 승인 토스트 · 프로젝트 완료 · 승인 링크", async ({ browser, baseURL }) => {
    const fx = await setupSettlementE2E();

    const pm = await loginPage(browser, baseURL, fx.pm);
    await pm.goto(`/projects/${fx.projectId}`);
    const submit = pm.getByRole("button", { name: "정산 결재 올리기" });
    await waitForHydration(submit);
    // 정산에는 「상태 바꾸기」가 없다 — 그 자리가 정산 결재 올리기다.
    await expect(pm.getByRole("button", { name: "상태 바꾸기" })).toHaveCount(0);
    await submit.click();
    await expect(pm.getByRole("dialog")).toHaveCount(0);
    await expect(pm.getByRole("status").filter({ hasText: /^정산 결재 올리기 · 결재 요청됨 → / })).toBeVisible();
    const pending = pm.getByRole("link", { name: "정산 결재 중" });
    await expect(pending).toBeVisible();
    await expect(pending).toHaveAttribute("href", `/projects/${fx.projectId}/settlement`);
    await expect(pm.getByRole("button", { name: "정산 결재 올리기" })).toHaveCount(0);
    await pm.context().close();

    const ceo = await loginPage(browser, baseURL, fx.ceo);
    await ceo.goto(`/projects/${fx.projectId}/settlement`);
    await expect(ceo.locator('[data-ui="screen-title"]')).toHaveText(`정산 결재 — ${fx.projectName}`);
    await expect(ceo.getByText(fx.projectNumber, { exact: true }).first()).toBeVisible();
    const terms = ceo.locator("dl dt");
    await expect(terms.filter({ hasText: /^견적가 합$/ })).toHaveCount(1);
    await expect(terms.filter({ hasText: /^실행가 합$/ })).toHaveCount(1);
    await expect(terms.filter({ hasText: /손익/ })).toHaveCount(0);
    const amountOf = (label: string) => terms.filter({ hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::dd[1]");
    await expect(amountOf("견적가 합")).toHaveText(KRW);
    await expect(amountOf("실행가 합")).toHaveText(KRW);

    const approve = ceo.getByRole("button", { name: /^승인/ });
    await waitForHydration(approve);
    await approve.click();
    await expect(ceo.getByRole("status").filter({ hasText: `승인 · 최종 승인 · ${fx.projectNumber} 완료` })).toBeVisible();

    await ceo.goto(`/projects/${fx.projectId}`);
    await expect(ceo.locator('[data-ui="screen-title"]').locator("..").getByText("완료", { exact: true })).toBeVisible();
    await expect(ceo.getByRole("link", { name: "정산 결재 승인" })).toHaveAttribute("href", `/projects/${fx.projectId}/settlement`);
    await ceo.context().close();
  });
});
