import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { insertTempRole } from "./temp-roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createOrgUnit, createTeam } from "@/domain/org";
import { seoulToday } from "@/lib/dates";
import { loginPage, makePerson, waitForHydration } from "./leave-org";
import { expectSeededReasonOptions, seedReasonOptions } from "./reason-options";
import { makeEvidenceManagerE2E, setupExpenseE2E, submitLineExpense, uniqueReceipt, type ExpenseE2E } from "./expense-fixture";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses, projects } from "@/db/schema";
import { rejectDocument } from "@/domain/approvals";
import { submitExpense } from "@/domain/expenses";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses/access";
import { findApprovalGraphByDocument } from "@/repositories/approvals";

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

  // 07.2-07 X3(D-7285 · D-7288) — 반려 확인 창이 관리자가 등록한 사유를 고르게 하고, 덧붙인 글이 그대로 저장된다.
  test("반려 창 — 등록한 사유 3개가 자리표시 + 3 + 기타로 보이고, 고른 문구에 덧붙여 반려하면 기안자 화면에 그 글이 보인다", async ({ browser, baseURL }) => {
    const { labels, restore } = await seedReasonOptions("reject_reason", ["예산 초과", "증빙 누락", "금액 오류"]);
    const [budget, missing] = labels as [string, string, string];
    try {
      const fx = await setupExpenseE2E();
      const line = fx.lines.hold;
      const expenseId = await submitLineExpense(browser, baseURL, fx, "hold");

      const lead = await loginPage(browser, baseURL, fx.lead);
      await lead.goto("/approvals");
      const label = `지출결의 · ${fx.projectName} · ${line.itemName}`;
      const row = lead.getByRole("row").filter({ hasText: label });
      const reject = row.getByRole("button", { name: "반려" });
      await waitForHydration(reject);
      await reject.click();

      const dialog = lead.getByRole("dialog");
      const select = dialog.locator("select");
      await expectSeededReasonOptions(select.locator("option"), labels);
      await expect(dialog.getByRole("button", { name: /^반려/ })).toHaveAttribute("aria-disabled", "true");

      await select.selectOption(budget);
      const reason = dialog.getByLabel("사유");
      await expect(reason).toHaveValue(budget);
      await reason.press("End");
      await reason.pressSequentially(" · 3월분");
      await expect(select).toHaveValue(budget);

      await select.selectOption(missing);
      await expect(reason).toHaveValue(`${missing} · 3월분`);

      // 글을 모두 지우면 고르개도 처음으로 · 직접 쓴 글은 기타를 골라도 남는다(2026-11-10 사용자 카드 답).
      await reason.fill("");
      await expect(select).toHaveValue("");
      await reason.fill("직접 쓴 글");
      await select.selectOption("기타");
      await expect(reason).toHaveValue("직접 쓴 글");
      await reason.fill(`${missing} · 3월분`);

      await dialog.getByRole("button", { name: /^반려/ }).click();
      await expect(lead.getByRole("status").filter({ hasText: "반려 · " })).toBeVisible();
      await lead.context().close();

      const pm = await loginPage(browser, baseURL, fx.pm);
      await pm.goto(`/expenses/${expenseId}`);
      await expect(pm.getByText(`사유 · ${missing} · 3월분`)).toBeVisible();
      await pm.context().close();
    } finally {
      await restore();
    }
  });

  test("0건 빈 화면 — expenses 보기 권한이 있으면 `지출결의 목록 보기`(→ /expenses), 없으면 문장만", async ({ browser, baseURL }) => {
    const manager = await makeEvidenceManagerE2E();
    const suffix = randomUUID().slice(0, 8);
    const role = await insertTempRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E보기없음-${suffix}`, workScope: "team" });
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
    // 07.2-16: 필터 줄 1차 `승인`(일괄)도 같은 낱말이라 행 안의 `승인`만 본다.
    await expect(lead.locator("tbody").getByRole("button", { name: /^승인/ })).not.toBeFocused();
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

  // 07.2-16(PU7 · UI-SPEC S12): fixture 프로젝트 시작일은 1월 1일 — 오늘 상신한 지출결의는 사후 추인이다. 시작일을 오늘로 옮기면(당일) 읽을 때 사라진다.
  test("사후 추인 — 결재함 행 · 지출결의 목록 행 · 상세 머리 세 자리 정확히 1회 · 375 목록 행 2줄 이내 · 시작일을 오늘로 고치면 사라짐", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await submitLineExpense(browser, baseURL, fx, "tracer");
    const label = `지출결의 · ${fx.projectName} · ${fx.lines.tracer.itemName}`;

    const lead = await loginPage(browser, baseURL, fx.lead);
    await lead.goto("/approvals");
    const inboxRow = lead.getByRole("row").filter({ hasText: label });
    await expect(inboxRow).toHaveCount(1);
    await expect(inboxRow.getByText("사후 추인", { exact: true })).toHaveCount(1);

    const pm = await loginPage(browser, baseURL, fx.pm);
    await pm.goto("/expenses");
    const listRow = pm.getByRole("row").filter({ hasText: fx.projectName });
    await expect(listRow).toHaveCount(1);
    await expect(listRow.getByText("사후 추인", { exact: true })).toHaveCount(1);
    await pm.goto(`/expenses/${expenseId}`);
    await expect(pm.getByText("사후 추인", { exact: true })).toHaveCount(1);

    // 375 — 상태 칸의 조각은 숨고 접힌 줄 끝에 한 번, 행(문서 줄 + 접힌 줄)은 2줄 이내.
    const phone = await loginPage(browser, baseURL, fx.pm, { width: 375, height: 812 });
    await phone.goto("/expenses");
    const phoneRow = phone.getByRole("row").filter({ hasText: fx.projectName }).first();
    await expect(phoneRow).toBeVisible();
    await expect(phone.getByText("사후 추인", { exact: true }).filter({ visible: true })).toHaveCount(1);
    // 보이는 글자 조각의 줄 위치만 센다(칸 · 요소 상자는 빼고, 같은 줄의 다른 글자 크기는 10px 안에서 한 줄로 묶는다).
    const lineTops = await phoneRow.evaluate((row) => {
      const rows = [row, row.nextElementSibling].filter((element): element is Element => element !== null && (element === row || element.querySelector("[colspan]") !== null));
      const tops: number[] = [];
      for (const element of rows) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) if (rect.width > 0 && rect.height > 0) tops.push(rect.top);
        }
      }
      tops.sort((a, b) => a - b);
      return tops.filter((top, index) => index === 0 || top - (tops[index - 1] ?? top) > 10).length;
    });
    expect(lineTops).toBeLessThanOrEqual(2);

    await db.update(projects).set({ startDate: seoulToday() }).where(eq(projects.id, fx.projectId));
    await lead.reload();
    await expect(lead.getByRole("row").filter({ hasText: label })).toHaveCount(1);
    await expect(lead.getByText("사후 추인", { exact: true })).toHaveCount(0);
    await pm.reload();
    await expect(pm.getByText("사후 추인", { exact: true })).toHaveCount(0);
  });

  // 07.2-16(PU18 · UI-SPEC S14): 두 번 반려된 뒤 다시 올라온 문서 — 결재 시트와 문서 화면에 직전(2번째) 사유 전문 + `총 2회`.
  test("지난 반려 — 2회 반려 뒤 재상신 문서의 결재 시트 · 문서 화면에 2번째 사유 전문(500자 · 넘침 없음) + 2행 `총 2회`", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await submitLineExpense(browser, baseURL, fx, "tracer");
    const second = `${"금액과 증빙을 다시 확인 ".repeat(35).trim()} 끝`;
    expect(second.length).toBeLessThanOrEqual(500);
    await rejectAndResubmit(fx, expenseId, "첫 번째 사유");
    await rejectAndResubmit(fx, expenseId, second);

    const lead = await loginPage(browser, baseURL, fx.lead);
    await lead.goto("/approvals");
    const row = lead.getByRole("row").filter({ hasText: fx.lines.tracer.itemName });
    const open = row.locator('button[aria-haspopup="dialog"]');
    await waitForHydration(open);
    await open.click();
    const sheet = lead.getByRole("dialog");
    await expectPreviousRejection(sheet.locator("dt", { hasText: /^지난 반려$/ }), second);

    await lead.goto(`/expenses/${expenseId}`);
    await expectPreviousRejection(lead.locator("dt", { hasText: /^지난 반려$/ }), second);
  });
});

async function rejectAndResubmit(fx: ExpenseE2E, expenseId: string, reason: string): Promise<void> {
  const graph = await findApprovalGraphByDocument(SYSTEM_VIEWER, { documentKind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!graph) throw new Error("결재 인스턴스가 없다");
  await rejectDocument(fx.lead.viewer, { instanceId: graph.instance.id, expectedVersion: graph.instance.version, reason });
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  await submitExpense(fx.pm.viewer, { expenseId, expectedVersion: row?.version ?? -1 });
}

async function expectPreviousRejection(label: import("@playwright/test").Locator, reason: string): Promise<void> {
  await expect(label).toHaveCount(1);
  const value = label.locator("xpath=following-sibling::dd[1]");
  const lines = value.locator(":scope > span");
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(0)).toHaveText(reason);
  await expect(lines.nth(1)).toHaveText(new RegExp(`^${"[^·]+"} · \\d{2}-\\d{2} \\d{2}:\\d{2} · 총 2회$`));
  // 전문이 넘치지 않고 줄바꿈된다(keep-all) — 값 칸 가로 넘침 0 · 여러 줄.
  expect(await value.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await lines.nth(0).evaluate((element) => element.getBoundingClientRect().height > parseFloat(getComputedStyle(element).lineHeight) * 1.5)).toBe(true);
}

