import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { loginPage, waitForHydration, type Person } from "./leave-org";
import { moveToInProgressE2E, setupSettlementE2E, submitSettlementE2E } from "./settlement-fixture";
import { setupExpenseE2E, submitLineExpense } from "./expense-fixture";

// 05-11 웨이브 13 화면 검토(D1–D3) 고침의 DOM 실측 — 판정은 계산값으로만 한다(스크린샷 육안 없음).

const CLS_INIT = `
  window.__cls = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
  }).observe({ type: "layout-shift", buffered: true });
`;

// 수화 뒤 글꼴 · 두 프레임을 기다린 다음 누적 레이아웃 이동을 읽는다.
async function settledCls(page: Page, hydrated: Locator): Promise<number> {
  await waitForHydration(hydrated);
  await page.waitForLoadState("networkidle");
  return page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    return (window as unknown as { __cls: number }).__cls;
  });
}

async function clsOf(browser: Browser, baseURL: string | undefined, person: Person, path: string, viewport: { width: number; height: number }, hydrated: (page: Page) => Locator): Promise<number> {
  const page = await loginPage(browser, baseURL, person, viewport);
  await page.addInitScript(CLS_INIT);
  await page.goto(path);
  const cls = await settledCls(page, hydrated(page));
  await page.context().close();
  return cls;
}

// D1 — 프로젝트 상세 머리 줄 행동 묶음이 서버 렌더와 수화 뒤에 같은 자리 · 크기다(폭 판정으로 1차를 넣었다 빼지 않는다).
test("D1 정산 프로젝트 상세 — 수화 뒤 레이아웃 이동(CLS) 0.1 미만 · 320 · 375 · 768 · 문서 없음 PM · 결재 중 PM · 대표", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const fx = await setupSettlementE2E();
  const path = `/projects/${fx.projectId}`;
  const widths = [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 768, height: 1024 },
  ];
  const results: Record<string, number> = {};
  for (const viewport of widths) {
    results[`nodoc-pm-${viewport.width}`] = await clsOf(browser, baseURL, fx.pm, path, viewport, (page) => page.getByRole("button", { name: "정산 결재 올리기" }));
  }
  await submitSettlementE2E(fx);
  for (const viewport of widths) {
    for (const [key, person] of [["pm", fx.pm], ["ceo", fx.ceo]] as const) {
      results[`pending-${key}-${viewport.width}`] = await clsOf(browser, baseURL, person, path, viewport, (page) => page.getByRole("link", { name: "정산 결재 중" }));
    }
  }
  for (const [state, cls] of Object.entries(results)) expect(cls, `${state} CLS`).toBeLessThan(0.1);
});

// D2 — 폰 결재 시트의 막힌 `승인`: 이유 글자는 버튼 옆에 끼지 않고 버튼 아래 자기 줄에 한 줄로 선다(문서 화면 행동 줄과 같다).
for (const width of [375, 320]) {
  test(`D2 폰 결재 시트 막힌 승인 — 이유는 버튼 아래 한 줄 (${width})`, async ({ browser, baseURL }) => {
    const fx = await setupSettlementE2E();
    await submitSettlementE2E(fx);
    await moveToInProgressE2E(fx);

    const ceo = await loginPage(browser, baseURL, fx.ceo, { width, height: 800 });
    await ceo.goto("/approvals");
    const open = ceo.getByRole("button", { name: new RegExp(fx.projectName) });
    await waitForHydration(open);
    await open.click();
    const sheet = ceo.getByRole("dialog");
    const approve = sheet.getByRole("button", { name: /^승인/ });
    await expect(approve).toHaveAttribute("aria-disabled", "true");
    const reasonId = await approve.getAttribute("aria-describedby");
    expect(reasonId).toBeTruthy();
    const geometry = await ceo.evaluate(
      ({ id }) => {
        const reason = document.getElementById(id);
        const button = [...document.querySelectorAll("dialog[open] button")].find((element) => element.getAttribute("aria-describedby") === id);
        if (!reason || !button) return null;
        const range = document.createRange();
        range.selectNodeContents(reason);
        const lineTops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
        return { text: reason.textContent, reasonTop: reason.getBoundingClientRect().top, buttonBottom: button.getBoundingClientRect().bottom, lines: lineTops.size };
      },
      { id: reasonId ?? "" },
    );
    expect(geometry?.text).toBe("진행으로 바뀜 · 반려");
    expect(geometry?.reasonTop ?? 0).toBeGreaterThanOrEqual((geometry?.buttonBottom ?? Infinity) - 0.5);
    expect(geometry?.lines).toBe(1);
    await ceo.context().close();
  });
}

// D3 — 폰 결재함에서 시트 `승인` 뒤 포커스는 다음 줄의 열기(문서 칸 버튼)다 — `승인`이나 BODY가 아니다(사용자 결정 10/5 12:41).
test("D3 폰 결재함 — 시트 승인 뒤 포커스는 다음 줄의 열기", async ({ browser, baseURL }) => {
  const fx = await setupExpenseE2E();
  await submitLineExpense(browser, baseURL, fx, "tracer");
  await submitLineExpense(browser, baseURL, fx, "phone");

  const lead = await loginPage(browser, baseURL, fx.lead, { width: 375, height: 800 });
  await lead.goto("/approvals");
  const opens = lead.getByRole("main").locator('button[aria-haspopup="dialog"]');
  await expect(opens).toHaveCount(2);
  const secondLabel = (await opens.nth(1).innerText()).trim();
  await waitForHydration(opens.nth(0));
  await opens.nth(0).click();
  const sheet = lead.getByRole("dialog");
  await sheet.getByRole("button", { name: /^승인/ }).click();

  await expect(lead.getByRole("status").filter({ hasText: "승인 · " })).toBeVisible();
  await expect(opens).toHaveCount(1);
  await expect(lead.getByRole("button", { name: secondLabel })).toBeFocused();
  await lead.context().close();
});
