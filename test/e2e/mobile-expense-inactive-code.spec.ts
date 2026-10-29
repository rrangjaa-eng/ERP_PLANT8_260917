import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { createTeamExpenseDraft } from "@/domain/expenses";
import { INACTIVE_EVIDENCE_TYPE } from "@/domain/expenses/gate";
import { createCodeItem, setCodeItemActive } from "@/domain/code-tables";
import { createOrgUnit, createTeam } from "@/domain/org";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertVendor } from "@/repositories/vendors";
import { seoulToday } from "@/lib/dates";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { testVendorAccount } from "../integration/fixtures/expenses";

// 07.1-14(F5 · R2-2): 작성 중 지출결의의 저장된 증빙 종류 · 지급 방식이 꺼진 코드면 상세 Select에 그 옵션이 선택된 채 비활성이다 — 다시
// 고를 수 없고 다른 활성 값으로는 바꾼다. 제출 막힘 줄 · 저장 동작은 그대로다. 공용 코드표에 E2E 전용 항목을 더하고 끄므로(desktop 병렬
// 스펙과 겹치지 않게) 한 워커로 도는 mobile-375 프로젝트가 가져가는 이름이다. 기존 공용 코드는 끄지 않는다.

const WIDTHS = [
  { width: 375, height: 800 },
  { width: 1280, height: 900 },
];

async function draftWithInactiveCodes(): Promise<{ pm: Person; expenseId: string; evidence: { id: string; value: string }; payment: { id: string; value: string } }> {
  const suffix = randomUUID().slice(0, 6);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E비활성코드본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E비활성코드팀-${suffix}` });
  const pm = await makePerson("비활성코드", DEFAULT_ROLE_ID, team.id, `${seoulToday().slice(0, 4)}-01-01`);
  // 제출 막힘은 차례표의 첫 줄 하나다 — 지급처(확인된 거래처)를 채워 두어야 쓰지 않는 코드 줄이 첫 막힘이 된다.
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E비활성코드처-${suffix}`, normalizedName: `e2e비활성코드처-${suffix}`, ...testVendorAccount(), confirmedAt: new Date() });
  const evidence = await createCodeItem(SYSTEM_VIEWER, { tableKey: "evidence_type", value: `e2e_off_ev_${suffix}`, label: `끈 증빙-${suffix}` });
  const payment = await createCodeItem(SYSTEM_VIEWER, { tableKey: "payment_method", value: `e2e_off_pm_${suffix}`, label: `끈 지급-${suffix}` });
  try {
    const { expenseId } = await createTeamExpenseDraft(pm.viewer, {
      idempotencyKey: randomUUID(),
      fields: {
        teamExpenseKind: "team_overhead",
        content: "비활성 코드 확인",
        note: "비활성 코드 확인",
        vendorId: vendor.id,
        evidenceType: evidence.value,
        paymentMethod: payment.value,
        supply: { currency: "KRW", amount: 10_000, fxRate: 1 },
      },
    });
    return { pm, expenseId, evidence: { id: evidence.id, value: evidence.value }, payment: { id: payment.id, value: payment.value } };
  } finally {
    // 만든 코드는 저장 직후 끈다 — 저장이 실패해도 공용 코드 목록에 켠 채 남지 않는다.
    await setCodeItemActive(SYSTEM_VIEWER, evidence.id, false);
    await setCodeItemActive(SYSTEM_VIEWER, payment.id, false);
  }
}

async function openExpense(browser: Browser, baseURL: string | undefined, pm: Person, expenseId: string, viewport: { width: number; height: number }): Promise<Page> {
  const page = await loginPage(browser, baseURL, pm, viewport);
  await page.goto(`/expenses/${expenseId}`);
  await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
  return page;
}

test.describe("지출결의 상세 — 꺼진 저장값은 선택된 비활성 옵션(07.1-14 F5)", () => {
  test("두 Select의 저장값 옵션은 선택된 채 비활성 · 다른 옵션은 활성 · 바꾼 뒤에도 비활성 · 바꾸기 전 제출 막힘 줄 그대로", async ({ browser, baseURL }) => {
    const fx = await draftWithInactiveCodes();
    for (const viewport of WIDTHS) {
      const page = await openExpense(browser, baseURL, fx.pm, fx.expenseId, viewport);
      for (const [id, value] of [["evidenceType", fx.evidence.value], ["paymentMethod", fx.payment.value]] as const) {
        const select = page.locator(`#${id}`);
        await expect(select, `${id} ${viewport.width}`).toHaveValue(value);
        await expect(select.locator(`option[value="${value}"]`)).toBeDisabled();
        await expect(select.locator(`option:not([value="${value}"]):not([value=""])`).first()).toBeEnabled();
      }
      await expect(page.getByText(INACTIVE_EVIDENCE_TYPE, { exact: true })).toBeVisible();

      const evidence = page.locator("#evidenceType");
      const other = await evidence.locator(`option:not([value="${fx.evidence.value}"]):not([value=""])`).first().getAttribute("value");
      await evidence.selectOption(other ?? "");
      await expect(evidence).toHaveValue(other ?? "");
      await expect(evidence.locator(`option[value="${fx.evidence.value}"]`)).toBeDisabled();
      await page.context().close();
    }
  });

  test("두 Select는 그대로 두고 다른 칸을 바꿔 임시 저장한 뒤 새로 고쳐도 저장값 그대로 · 그 옵션 비활성(P3 #2)", async ({ browser, baseURL }) => {
    const fx = await draftWithInactiveCodes();
    const page = await openExpense(browser, baseURL, fx.pm, fx.expenseId, WIDTHS[0]!);
    await page.locator("#note").fill("비활성 코드 확인 · 고침");
    await page.getByRole("button", { name: /^임시 저장/ }).click();
    await expect(page.getByText(/^임시 저장됨/)).toBeVisible();
    await page.reload();
    await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
    await expect(page.locator("#note")).toHaveValue("비활성 코드 확인 · 고침");
    for (const [id, value] of [["evidenceType", fx.evidence.value], ["paymentMethod", fx.payment.value]] as const) {
      await expect(page.locator(`#${id}`)).toHaveValue(value);
      await expect(page.locator(`#${id} option[value="${value}"]`)).toBeDisabled();
    }
    await page.context().close();
  });
});
