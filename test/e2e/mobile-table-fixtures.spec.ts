import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { reserveEntries, expenses, expensePayments } from "@/db/schema";
import { submitLeave } from "@/domain/leave";
import { createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createCardUsage, precheckCardUsage } from "@/domain/corp-card-usages";
import { createCorpCard } from "@/domain/corp-cards";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND, saveExpenseDraft, submitExpense } from "@/domain/expenses";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { completeExpensePayment, previewPayable } from "@/domain/payments";
import { insertIssueRequest } from "@/repositories/revenue-issue-requests";
import { insertVendor } from "@/repositories/vendors";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { seoulToday } from "@/lib/dates";
import { createFixtureUser } from "./fixtures";
import { expectPhoneRows } from "./helpers/phone-rows";
import { makePrepaidOverdue, makeTeamPayer, paidExpense } from "./helpers/phone-fixtures";
import { leaveWeekdayRange, onStableSeoulDay } from "./leave-dates";
import { loginPage, makePerson, setupLeaveOrg } from "./leave-org";
import { setupExpenseE2E } from "./expense-fixture";
import { loginAsSysadmin } from "./row-actions-helpers";

// 07.1-18 게이트 반영(#326 review ③ · 플랜 :187 · :188) — 빠진 폰 픽스처 스펙. 7자리 금액 · 긴 이름 · 긴 상태 글자 같은 실제 길이 데이터로
// 행 시트 표(/pnl/reserves · 견적 표)와 행 링크 표(휴가 · 발행 요청 · 지급 완료 · 지급 대상), 접힌 줄 탭 칸의 :active 면을 375 · 320에서 DOM으로 잰다.

// 07.1-18 게이트 3차 — 날짜 nowrap은 폰에서만 건다. PC(768 · 1024)의 열 폭은 main과 같아야 한다(768 넘침 43 → 95 회귀).
for (const width of [1024, 768] as const) {
  test(`/pnl/reserves — PC ${width}: 날짜 칸은 nowrap이 아니다 (열 폭은 main 그대로)`, async ({ page }) => {
    test.setTimeout(180_000);
    const name = `E2E리저브PC-${randomUUID().slice(0, 6)}`;
    const client = await insertVendor(SYSTEM_VIEWER, { name, normalizedName: name.toLowerCase() });
    await db.insert(reserveEntries).values({ clientId: client.id, entryDate: seoulToday(), direction: "deposit", amountCurrency: "KRW", amountForeignAmount: null, amountFxRate: "1", amountAmountKrw: 1_234_567, note: null });
    await loginAsSysadmin(page);
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/pnl/reserves");
    const table = page.locator("main table[data-row-sheet]").first();
    await expect(table).toBeVisible({ timeout: 30_000 });
    const whiteSpaces = await table.evaluate((node) =>
      Array.from(node.querySelectorAll("td span")).filter((el) => /^\d{4}-\d{2}-\d{2}$/.test((el.textContent ?? "").trim())).map((el) => getComputedStyle(el).whiteSpace),
    );
    expect(whiteSpaces.length).toBeGreaterThan(0);
    expect(whiteSpaces.filter((v) => v === "nowrap"), `PC에서 날짜 nowrap ${width}`).toEqual([]);
    // 폰 말줄임 감싸개는 PC에서 상자를 만들지 않는다(display: contents) — 셀 글자는 감싸개 이전(main)과 같은 줄 상자로 그려진다.
    const boxed = await table.evaluate((node) =>
      Array.from(node.querySelectorAll<HTMLElement>("[data-cell-text], [data-cell-text] > div")).filter((el) => getComputedStyle(el).display !== "contents").length,
    );
    expect(boxed, `PC ${width} 감싸개 상자`).toBe(0);
  });
}

for (const width of [375, 320] as const) {
  test.describe(`폰 ${width} 픽스처`, () => {
    test(`/pnl/reserves — 외화 · 7자리 원화 · 긴 클라이언트 · 긴 메모 줄: 행 두 줄 · 접힌 줄 한 줄 (${width})`, async ({ page }) => {
      test.setTimeout(180_000);
      const suffix = randomUUID().slice(0, 6);
      const name = `E2E리저브 아주 긴 클라이언트 이름 대행사 주식회사-${suffix}`;
      const client = await insertVendor(SYSTEM_VIEWER, { name, normalizedName: name.toLowerCase() });
      const today = seoulToday();
      await db.insert(reserveEntries).values([
        { clientId: client.id, entryDate: today, direction: "deposit", amountCurrency: "USD", amountForeignAmount: "1234.56", amountFxRate: "1474.89", amountAmountKrw: 1_820_830, note: "해외 광고 집행분 선입금 — 환율 변동 정산 예정" },
        { clientId: client.id, entryDate: today, direction: "deposit", amountCurrency: "KRW", amountForeignAmount: null, amountFxRate: "1", amountAmountKrw: 12_345_678, note: "분기 계약금 선입금 및 추가 집행 예치분 일체 메모가 길어 한 줄을 넘는다" },
        { clientId: client.id, entryDate: today, direction: "withdrawal", amountCurrency: "KRW", amountForeignAmount: null, amountFxRate: "1", amountAmountKrw: 1_234_567, note: null },
      ]);
      await loginAsSysadmin(page);
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/pnl/reserves");
      const table = page.locator("main table[data-row-sheet]").first();
      await expect(table).toBeVisible({ timeout: 30_000 });
      const shape = await expectPhoneRows(page, table, `/pnl/reserves @${width}`, { minRows: 3 });
      // 날짜는 말줄임하지 않는다 — 날짜 글자 칸이 글자 전체를 담는다.
      const dates = await table.evaluate((node) =>
        Array.from(node.querySelectorAll<HTMLElement>("[data-cell-text]"))
          .filter((box) => /^\d{4}-\d{2}-\d{2}$/.test((box.textContent ?? "").trim()))
          .map((box) => ({ text: box.textContent, fits: box.scrollWidth <= box.clientWidth && box.scrollHeight <= box.clientHeight })),
      );
      expect(dates.length, "날짜 칸이 있다").toBeGreaterThanOrEqual(3);
      expect(dates.filter((d) => !d.fits), `날짜가 잘렸다 ${JSON.stringify(dates)}`).toEqual([]);
      expect(shape.foldedTexts.some((text) => text.includes("USD")), `외화 줄이 접힌 줄 글자로 간다 ${JSON.stringify(shape.foldedTexts)}`).toBe(true);
    });

    test(`견적 표 B-R1 — 기한 경과 선결제 줄: 상태 칸은 태그 한 줄 · 메모는 접힌 줄 글자 (${width})`, async ({ browser, baseURL }) => {
      test.setTimeout(300_000);
      const fx = await setupExpenseE2E();
      // 선결제 문서(증빙 없이 제출) → 결재 통과 → 지급 → 기한 지난 날짜로 옮김 = 상태 2행 `증빙 2일 경과`.
      const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.hold.id], fields: { note: "행사 운영비" } });
      const expenseId = created.created[0]?.expenseId;
      if (!expenseId) throw new Error("작성 중 문서 없음");
      const versionOf = async () => {
        const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
        if (!row) throw new Error("지출결의 없음");
        return row.version;
      };
      await saveExpenseDraft(fx.pm.viewer, { expenseId, expectedVersion: await versionOf(), fields: { prepaid: true, prepaidReason: "행사장 선결제 요구" } });
      await submitExpense(fx.pm.viewer, { expenseId, expectedVersion: await versionOf() });
      const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
      if (!view) throw new Error("결재 인스턴스 없음");
      let approvalVersion = view.version;
      for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) approvalVersion = (await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: approvalVersion })).version;
      const payer = await makeTeamPayer(fx);
      const preview = await previewPayable(payer.viewer, { expenseId, payDate: seoulToday() });
      if (preview.payableKrw === null || preview.payableKrw === undefined) throw new Error("지급 총액 없음");
      await completeExpensePayment(payer.viewer, { expenseId, payDate: seoulToday(), expectedPayableKrw: preview.payableKrw, version: await versionOf() });
      await makePrepaidOverdue(expenseId);

      const page = await loginPage(browser, baseURL, fx.pm, { width, height: 800 });
      await page.goto(`/projects/${fx.projectId}`);
      // 고객 승인이 끝난 차수는 읽기 표(role table)다 — 수주 중 차수는 편집 격자(grid).
      const table = page.getByRole("grid", { name: "견적 줄" }).or(page.getByRole("table", { name: "견적 줄" }));
      await expect(table).toBeVisible({ timeout: 30_000 });
      const shape = await expectPhoneRows(page, table, `견적 표 @${width}`, { minRows: 4 });
      expect(shape.foldedTexts.some((text) => text.includes("증빙 2일 경과")), `메모가 접힌 줄 글자에 있다 ${JSON.stringify(shape.foldedTexts)}`).toBe(true);
      // 상태 칸 주 행은 태그만 — 메모 글자가 주 행 셀 안에 없다.
      const memoInMain = await table.evaluate((node) => Array.from(node.querySelectorAll("tbody > tr")).filter((tr) => !String(tr.className).includes("collapsedRow")).some((tr) => (tr.textContent ?? "").includes("증빙 2일 경과") && getComputedStyle(tr).display !== "none" && Array.from(tr.querySelectorAll("*")).some((el) => el.children.length === 0 && (el.textContent ?? "").includes("증빙 2일 경과") && (el as HTMLElement).getClientRects().length > 0)));
      expect(memoInMain, "주 행에 보이는 메모 글자").toBe(false);
      await page.context().close();
    });

    test(`견적 표 B-R1 — 실행가 초과 줄(카드가 붙잡은 줄): 메모는 접힌 줄 글자 (${width})`, async ({ browser, baseURL }) => {
      test.setTimeout(240_000);
      const suffix = randomUUID().slice(0, 8);
      const year = seoulToday().slice(0, 4);
      const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E초과본부-${suffix}` });
      const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E초과팀-${suffix}` });
      const pm = await makePerson("초과", "role-pm", team.id, `${year}-01-01`);
      const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E초과클라이언트-${suffix}`, normalizedName: `e2e초과클라이언트-${suffix}` });
      const project = await createProject(pm.viewer, { clientId: client.id, teamId: team.id, pmUserId: pm.viewer.id, name: `E2E초과-${suffix}`, startDate: `${year}-01-01`, endDate: `${year}-12-31` });
      const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
      if (!revision || !project.id) throw new Error("프로젝트 · 1차 차수가 없습니다");
      const subcategory = (await firstSelectableSubcategory()).value;
      const itemName = `현장 소모품 및 운영 인력 식대 다과 음료 일체-${suffix}`;
      const lineId = randomUUID();
      const money = (amount: number) => ({ currency: "KRW" as const, amount, fxRate: 1 });
      const saved = await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [{ id: lineId, isNew: true as const, subcategory, itemName, vendorId: null, unitPrice: money(1_500_000), execution: money(1_000_000) }] });
      const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `신한-${suffix}`, numberLast4: String(1000 + Math.floor(Math.random() * 9000)), label: `E2E초과카드-${suffix}`, kind: "personal", holderUserId: pm.viewer.id });
      if (!card.id) throw new Error("카드 id 없음");
      const usage = { corpCardId: card.id, usedOn: seoulToday(), merchantVendorId: null, total: money(600_000), evidenceTypeCode: "invoice", linkKind: "quote_line" as const, lineId, memo: null };
      await createCardUsage(pm.viewer, usage, await precheckCardUsage(pm.viewer, usage));
      const current = saved.lines.find((line) => line.id === lineId);
      if (!current) throw new Error("저장된 줄 없음");
      await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [{ id: lineId, version: current.version, subcategory, itemName, vendorId: null, unitPrice: money(1_500_000), execution: money(500_000) }] });

      const page = await loginPage(browser, baseURL, pm, { width, height: 800 });
      await page.goto(`/projects/${project.id}`);
      const table = page.getByRole("grid", { name: "견적 줄" }).or(page.getByRole("table", { name: "견적 줄" }));
      await expect(table).toBeVisible({ timeout: 30_000 });
      const shape = await expectPhoneRows(page, table, `견적 표(실행가 초과) @${width}`);
      expect(shape.foldedTexts.some((text) => text.includes("실행가 초과 100,000")), `메모가 접힌 줄 글자에 있다 ${JSON.stringify(shape.foldedTexts)}`).toBe(true);
      await page.context().close();
    });

    test(`지급 완료 · 지급 대상 — 행 링크 표: 행은 두 줄 (${width})`, async ({ browser, baseURL }) => {
      test.setTimeout(300_000);
      const fx = await setupExpenseE2E();
      const payer = await makeTeamPayer(fx);
      await paidExpense(fx, "tracer", payer);
      await paidExpense(fx, "worst", payer);
      await paidExpense(fx, "retry", payer, { pay: false });
      const page = await loginPage(browser, baseURL, payer, { width, height: 800 });
      const linkTable = (view: string) => page.locator("main table").filter({ has: page.locator("a[data-row-link]") }).first().locator(view);
      await page.goto(`/expenses?${new URLSearchParams({ status: "지급 완료", team: fx.teamId })}`);
      const paid = page.locator("main table").filter({ has: page.locator("a[data-row-link]") }).first();
      await expect(paid).toBeVisible();
      await expectPhoneRows(page, paid, `지급 완료 @${width}`, { minRows: 2 });
      await page.goto("/expenses");
      const targets = page.locator("main table").filter({ has: page.locator("a[data-row-link]") }).first();
      await expect(targets).toBeVisible();
      await expectPhoneRows(page, targets, `지급 대상 @${width}`, { minRows: 1, maxMain: width === 375 ? 1 : 2 });
      void linkTable;
      await page.context().close();
    });

    test(`휴가 목록 — 행 링크 표: 행은 두 줄 (${width})`, async ({ browser, baseURL }) => {
      test.setTimeout(180_000);
      await onStableSeoulDay(async (today) => {
        const org = await setupLeaveOrg(today);
        const range = leaveWeekdayRange(today, { week: 12, weekdays: 3 });
        await submitLeave(org.drafter.viewer, { kind: "full_day", half: "", startDate: range.startDate, endDate: range.endDate, note: "연속 휴가 사유 메모가 길어도 행은 두 줄" });
        const page = await loginPage(browser, baseURL, org.drafter, { width, height: 800 });
        await page.goto("/leave");
        const table = page.getByRole("table", { name: "내 연차" });
        await expect(table).toBeVisible({ timeout: 30_000 });
        await expectPhoneRows(page, table, `휴가 @${width}`);
        await page.context().close();
      });
    });

    test(`발행 요청 — 행 링크 표: 긴 프로젝트 이름 · 7자리 합계에서도 행은 두 줄 (${width})`, async ({ page }) => {
      test.setTimeout(180_000);
      const user = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID, withTeam: true });
      const suffix = randomUUID().slice(0, 8);
      const today = seoulToday();
      const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E발행긴클라이언트 주식회사 대행-${suffix}`, normalizedName: `e2e발행긴클라이언트-${suffix}` });
      const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E발행본부-${suffix}` });
      const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E발행팀-${suffix}` });
      const pm = await makePerson("발행", "role-pm", team.id, `${today.slice(0, 4)}-01-01`);
      const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId: pm.viewer.id, name: `E2E발행 가을 브랜드 팝업스토어 운영 대행 아주 긴 프로젝트-${suffix}`, startDate: `${today.slice(0, 4)}-01-01`, endDate: `${today.slice(0, 4)}-12-31` });
      for (const amount of [12_345_678, 1_234_567]) {
        await insertIssueRequest(SYSTEM_VIEWER, { id: randomUUID(), projectId: project.id, requestedBy: pm.viewer.id, desiredIssueDate: today, amountCurrency: "KRW", amountForeignAmount: null, amountFxRate: "1.0000", amountAmountKrw: amount, memo: "7자리 금액 · 긴 메모 행" }, db);
      }
      await page.goto("/login");
      await page.getByLabel("이메일").fill(user.email);
      await page.getByLabel("비밀번호").fill(user.password);
      await page.getByRole("button", { name: "로그인" }).click();
      await expect(page).toHaveURL(/\/account$/);
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/projects/issue-requests");
      const table = page.locator("main table").filter({ has: page.locator("a[data-row-link]") }).first();
      await expect(table).toBeVisible({ timeout: 30_000 });
      await expectPhoneRows(page, table, `발행 요청 @${width}`, { minRows: 2 });
    });
  });
}

void expensePayments;
