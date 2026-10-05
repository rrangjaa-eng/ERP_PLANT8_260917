import { test, expect, type Locator, type Page } from "@playwright/test";
import { loginPage, waitForHydration } from "./leave-org";
import {
  approveSettlementE2E,
  moveToInProgressE2E,
  rejectSettlementE2E,
  setupSettlementE2E,
  submitSettlementE2E,
} from "./settlement-fixture";

// 05-11(D-98 · UI-SPEC S10 · 확정 #3 · #4): 담당 PM이 프로젝트 상세 머리 줄 2차 `정산 결재 올리기`를 누르면 확인 창 없이 기안되고 그 자리가
// 3차 링크 `정산 결재 중`이 된다. 대표가 정산 결재 문서 화면에서 `승인`을 누르면 최종 승인과 프로젝트 완료가 한 번에 일어난다.

const KRW = /^\d{1,3}(,\d{3})+$/;
const BACK_TO_PROGRESS = "진행으로 바뀜 · 반려";

// 토큰 값을 브라우저 계산 색(rgb(...))으로 바꿔 비교한다(system-status.spec 선례).
function tokenAsColor(page: Page, name: string): Promise<string> {
  return page.evaluate((token) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${token})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, name);
}

// 막힌 행(design-review D4): `승인` 버튼 0 · 이유 글자(--status-danger) · 3차 `반려` → 04.1 반려 확인(제목 `정산 결재 반려`).
async function expectBlockedRow(page: Page, row: Locator): Promise<void> {
  await expect(row.getByRole("button", { name: /^승인/ })).toHaveCount(0);
  const reason = row.getByText(BACK_TO_PROGRESS, { exact: true });
  await expect(reason).toBeVisible();
  expect(await reason.evaluate((element) => getComputedStyle(element).color)).toBe(await tokenAsColor(page, "--status-danger"));
  const reject = row.getByRole("button", { name: "반려" });
  await waitForHydration(reject);
  await reject.click();
  const dialog = page.getByRole("dialog", { name: "정산 결재 반려" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
}

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
    // 스트리밍 중에는 loading.tsx의 제목 `정산 결재`가 잠깐 함께 있다 — 본문 제목을 이름으로 찾는다.
    await expect(ceo.getByRole("heading", { level: 1, name: `정산 결재 — ${fx.projectName}`, exact: true })).toBeVisible();
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

  test("진행 복귀(D-80) 뒤 대표: 결재함 · 첫 화면 PC 행에 `승인` 대신 이유 글자 · `반려`, 문서 화면 `승인` aria-disabled · 반려 뒤 PM 문서 화면 = 1차 없음 + `진행 중 · 정산 뒤 다시 올리기`", async ({ browser, baseURL }) => {
    const fx = await setupSettlementE2E();
    await submitSettlementE2E(fx);
    await moveToInProgressE2E(fx);

    const ceo = await loginPage(browser, baseURL, fx.ceo);
    await ceo.goto("/approvals");
    await expectBlockedRow(ceo, ceo.getByRole("row").filter({ hasText: fx.projectName }));

    await ceo.goto("/");
    await expectBlockedRow(ceo, ceo.locator("li").filter({ has: ceo.locator('[id^="next-turn-label-"]', { hasText: fx.projectName }) }));

    await ceo.goto(`/projects/${fx.projectId}/settlement`);
    const approve = ceo.getByRole("button", { name: /^승인/ });
    await waitForHydration(approve);
    await expect(approve).toHaveAttribute("aria-disabled", "true");
    await expect(ceo.getByText(BACK_TO_PROGRESS, { exact: true })).toBeVisible();
    await expect(ceo.getByRole("button", { name: "반려" })).not.toHaveAttribute("aria-disabled", "true");
    await ceo.context().close();

    await rejectSettlementE2E(fx, "기간 늘어남");
    const pm = await loginPage(browser, baseURL, fx.pm);
    await pm.goto(`/projects/${fx.projectId}/settlement`);
    await expect(pm.getByText("진행 중 · 정산 뒤 다시 올리기", { exact: true })).toBeVisible();
    await expect(pm.getByRole("button", { name: /^정산 결재 다시 올리기/ })).toHaveCount(0);
    await expect(pm.getByRole("button", { name: /^승인/ })).toHaveCount(0);
    await pm.context().close();
  });

  test("반려 뒤 정산 그대로면 PM 문서 화면 1차 `정산 결재 다시 올리기 Ctrl+Enter` — Ctrl+Enter로 다시 올리면 토스트 · 1차 사라짐", async ({ browser, baseURL }) => {
    const fx = await setupSettlementE2E();
    await submitSettlementE2E(fx);
    await rejectSettlementE2E(fx, "실행가 확인");

    const pm = await loginPage(browser, baseURL, fx.pm);
    await pm.goto(`/projects/${fx.projectId}/settlement`);
    const again = pm.getByRole("button", { name: /^정산 결재 다시 올리기/ });
    await waitForHydration(again);
    await expect(again).toContainText("Ctrl+Enter");
    await expect(pm.getByText("진행 중 · 정산 뒤 다시 올리기", { exact: true })).toHaveCount(0);
    await pm.keyboard.press("Control+Enter");
    await expect(pm.getByRole("status").filter({ hasText: /^정산 결재 다시 올리기 · 결재 요청됨/ })).toBeVisible();
    await expect(again).toHaveCount(0);
    await pm.context().close();
  });

  test("올린 직후 대표가 승인하면 PM 토스트 `되돌리기`는 오류 토스트 `{대표}가(이) HH:MM에 승인함` + `새로 고침`", async ({ browser, baseURL }) => {
    const fx = await setupSettlementE2E();
    const pm = await loginPage(browser, baseURL, fx.pm);
    await pm.goto(`/projects/${fx.projectId}`);
    const submit = pm.getByRole("button", { name: "정산 결재 올리기" });
    await waitForHydration(submit);
    await submit.click();
    const toast = pm.getByRole("status").filter({ hasText: /^정산 결재 올리기 · 결재 요청됨/ });
    await expect(toast).toBeVisible();

    await approveSettlementE2E(fx);
    await toast.getByRole("button", { name: "되돌리기" }).click();

    const refused = pm.getByRole("alert").filter({ hasText: new RegExp(`^${fx.ceo.name}(이|가) \\d{2}:\\d{2}에 승인함`) });
    await expect(refused).toBeVisible();
    await expect(refused.getByRole("button", { name: "새로 고침" })).toBeVisible();
    await pm.context().close();
  });
});
