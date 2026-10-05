import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { insertRole } from "@/repositories/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createOrgUnit, createTeam } from "@/domain/org";
import { seoulToday } from "@/lib/dates";
import { loginPage, makePerson, waitForHydration } from "./leave-org";
import { makeEvidenceManagerE2E, setupExpenseE2E, submitLineExpense, uniqueReceipt } from "./expense-fixture";

// 05-10 Task 2 — 결재함의 지출결의: PC 행 승인은 확인 없이 즉시(토스트 `승인 · 결재 요청됨 → {다음}`) · 0건 빈 화면의 행동은 expenses 보기 권한이 있을 때만 ·
// 시트를 연 뒤 경영관리 권한자가 증빙을 바꾸면 승인이 `{붙인 사람}이 HH:MM에 증빙을 바꿈 · 새로 고침`으로 거부되고 시트는 열려 있다.

test.describe("결재함 — 지출결의 (05-10)", () => {
  test("PC 행 승인은 확인 창 없이 즉시 — 토스트 `승인 · 결재 요청됨 → {다음 담당}` · 행은 내 결재에서 빠진다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const line = fx.lines.tracer;
    await submitLineExpense(browser, baseURL, fx, "tracer");

    const lead = await loginPage(browser, baseURL, fx.lead);
    await lead.goto("/approvals");
    const label = `지출결의 · ${fx.projectName} · ${line.itemName}`;
    const row = lead.getByRole("row").filter({ hasText: label });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("12,400,000");

    const approve = row.getByRole("button", { name: /^승인/ });
    await waitForHydration(approve);
    await approve.click();

    await expect(lead.getByRole("dialog")).toHaveCount(0);
    await expect(lead.getByRole("status").filter({ hasText: "승인 · " })).toContainText(`승인 · 결재 요청됨 → ${fx.divisionHead.name}`);
    await expect(lead.getByRole("row").filter({ hasText: label }).getByRole("button", { name: /^승인/ })).toHaveCount(0);
  });

  test("0건 빈 화면 — expenses 보기 권한이 있으면 `지출결의 목록 보기`(→ /expenses), 없으면 문장만", async ({ browser, baseURL }) => {
    const manager = await makeEvidenceManagerE2E();
    const suffix = randomUUID().slice(0, 8);
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E보기없음-${suffix}`, workScope: "team" });
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E없음본부-${suffix}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E없음팀-${suffix}` });
    const outsider = await makePerson("보기없음", role.id, team.id, `${seoulToday().slice(0, 4)}-01-01`);

    const withView = await loginPage(browser, baseURL, manager);
    await withView.goto("/approvals");
    await expect(withView.getByText("결재할 건이 없습니다")).toBeVisible();
    const link = withView.getByRole("link", { name: "지출결의 목록 보기" });
    await expect(link).toHaveAttribute("href", "/expenses");
    await expect(withView.getByText("연차 목록 보기")).toHaveCount(0);

    const withoutView = await loginPage(browser, baseURL, outsider);
    await withoutView.goto("/approvals");
    await expect(withoutView.getByText("결재할 건이 없습니다")).toBeVisible();
    await expect(withoutView.getByRole("link", { name: "지출결의 목록 보기" })).toHaveCount(0);
    await expect(withoutView.getByRole("link", { name: "연차 목록 보기" })).toHaveCount(0);
  });

  test("시트를 연 뒤 경영관리 권한자가 증빙을 붙이면 `승인`이 거부 문구 한 줄로 막히고 시트는 열려 있다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const manager = await makeEvidenceManagerE2E();
    const line = fx.lines.phone;
    const expenseId = await submitLineExpense(browser, baseURL, fx, "phone");

    const lead = await loginPage(browser, baseURL, fx.lead);
    await lead.goto("/approvals");
    const label = `지출결의 · ${fx.projectName} · ${line.itemName}`;
    const row = lead.getByRole("row").filter({ hasText: label });
    const open = row.getByRole("button", { name: label });
    await waitForHydration(open);
    await open.click();
    const sheet = lead.getByRole("dialog");
    await expect(sheet.getByRole("button", { name: "승인" })).toBeVisible();

    // 같은 때 경영관리 권한자가 하나 더 붙인다.
    const attach = await loginPage(browser, baseURL, manager);
    await attach.goto(`/expenses/${expenseId}`);
    const more = attach.getByRole("button", { name: /^하나 더/ });
    await waitForHydration(more);
    await attach.getByTestId("attachments-input").setInputFiles(await uniqueReceipt(attach));
    await expect(attach.locator('[data-ui="attachments"] li').getByText(/^\d+KB · \d{2}-\d{2}$/)).toHaveCount(2, { timeout: 20_000 });
    await attach.context().close();

    await sheet.getByRole("button", { name: "승인" }).click();
    await expect(sheet).toContainText(new RegExp(`${manager.name}[이가] \\d{2}:\\d{2}에 증빙을 바꿈 · 새로 고침`));
    await expect(lead.getByRole("dialog")).toHaveCount(1);
  });

  // 05-16 — 승인 뒤 포커스가 다음 줄의 `승인`으로 가면 Enter를 한 번 더 눌러 다음 문서가 승인된다. 다음 줄의 열기(문서 칸 · 줄 대상)로 보낸다.
  test("PC 결재함 — 승인한 뒤 포커스는 다음 줄의 열기 버튼으로 가고 `승인`이 아니다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    await submitLineExpense(browser, baseURL, fx, "tracer");
    await submitLineExpense(browser, baseURL, fx, "phone");

    const lead = await loginPage(browser, baseURL, fx.lead);
    await lead.goto("/approvals");
    const rows = lead.getByRole("row").filter({ has: lead.getByRole("button", { name: /^승인/ }) });
    await expect(rows).toHaveCount(2);
    const secondLabel = (await rows.nth(1).locator('button[aria-haspopup="dialog"]').innerText()).trim();
    const approve = rows.nth(0).getByRole("button", { name: /^승인/ });
    await waitForHydration(approve);
    await approve.focus();
    await lead.keyboard.press("Enter");

    await expect(lead.getByRole("status").filter({ hasText: "승인 · " })).toBeVisible();
    await expect(rows).toHaveCount(1);
    await expect(lead.getByRole("button", { name: secondLabel })).toBeFocused();
    await expect(lead.getByRole("button", { name: /^승인/ })).not.toBeFocused();
  });

  test("PC 첫 화면 내 차례 — 승인한 뒤 포커스는 다음 줄의 대상 글자로 가고 `승인`이 아니다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    await submitLineExpense(browser, baseURL, fx, "tracer");
    await submitLineExpense(browser, baseURL, fx, "phone");

    const lead = await loginPage(browser, baseURL, fx.lead);
    await lead.goto("/");
    const items = lead.locator("li").filter({ has: lead.getByRole("button", { name: /^승인/ }) });
    await expect(items).toHaveCount(2);
    const secondLabel = lead.locator("li").filter({ has: lead.getByRole("button", { name: /^승인/ }) }).nth(1).locator('[id^="next-turn-label-"]');
    const secondText = (await secondLabel.innerText()).trim();
    const approve = items.nth(0).getByRole("button", { name: /^승인/ });
    await waitForHydration(approve);
    await approve.focus();
    await lead.keyboard.press("Enter");

    await expect(lead.getByRole("status").filter({ hasText: "승인 · " })).toBeVisible();
    await expect(items).toHaveCount(1);
    await expect(lead.locator('[id^="next-turn-label-"]').filter({ hasText: secondText })).toBeFocused();
    await expect(lead.getByRole("button", { name: /^승인/ })).not.toBeFocused();
  });
});
