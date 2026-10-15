import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { db } from "@/db/client";
import { expenses, projects } from "@/db/schema";
import { insertVendor } from "@/repositories/vendors";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { confirmEvidence } from "@/domain/evidence-reviews";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { submitReadyDraft } from "../integration/fixtures/expenses";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { setupExpenseE2E, type ExpenseE2E, type LineKey, archiveTempRoles, insertTempRole } from "./expense-fixture";

// 06.5-06(D-6504 · UI-SPEC V5): 지급 대상의 2차 `이체 파일 받기` — 고른 계좌이체 건을 신한 대량이체 xlsx로 내려받는다.
// 지급 권한자 계급은 payment-batch.spec.ts의 팀 업무 범위 꼴에 버튼 게이트 항목(거래처 계좌 해제)을 더한다. 문서는 도메인 함수로 만든다.

const INFO_ITEMS = [
  "expense.value",
  "expense.amount",
  "approval.value",
  "project.value",
  "quote.amount",
  "vendor.value",
  "team.value",
  "person.value",
  "vendor.account_number_unmasked",
];

async function teamOf(fx: ExpenseE2E): Promise<string> {
  const [row] = await db.select({ teamId: projects.teamId }).from(projects).where(eq(projects.id, fx.projectId));
  if (!row?.teamId) throw new Error("프로젝트 팀 없음");
  return row.teamId;
}

// hidden — 끄는 정보 항목(버튼 게이트 확인용) · vendorsWrite — 거래처 관리 쓰기(막힌 줄 끝 링크).
async function makeTransferPayer(fx: ExpenseE2E, opts: { hidden?: readonly string[]; vendorsWrite?: boolean } = {}): Promise<Person> {
  const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E이체파일-${randomUUID().slice(0, 8)}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.team", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.payments", action: "write", allowed: true });
  if (opts.vendorsWrite) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "admin.vendors", action: "write", allowed: true });
  for (const infoItem of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: !opts.hidden?.includes(infoItem) });
  return makePerson("경영관리", role.id, await teamOf(fx), `${seoulToday().slice(0, 4)}-01-01`);
}

// 줄 하나 → 제출 → 결재선 넷 승인 → 지급 권한자가 증빙 확인 = P4(지급 대상 · 고를 수 있음). 픽스처 거래처는 신한 계좌가 있다.
async function approvedTarget(fx: ExpenseE2E, key: LineKey, confirmer: Person): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  const submitted = await submitReadyDraft(fx.pm.viewer, expenseId);
  if (submitted.kind !== "submitted") throw new Error("제출 실패");
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 인스턴스 없음");
  let version = view.version;
  for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) {
    const result = await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: version });
    version = result.version;
  }
  const [doc] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!doc) throw new Error("문서 없음");
  await confirmEvidence(confirmer.viewer, { expenseId, version: doc.version });
  return expenseId;
}

function rowOf(page: Page, itemName: string) {
  return page.locator("tbody tr").filter({ hasText: itemName });
}

test.describe("지급 대상 · 이체 파일 받기 (06.5-06 Task 1)", () => {
  test("한 건 고르고 `이체 파일 받기` → 다운로드 1회 · 파일 이름 `이체파일_{KST 오늘}.xlsx` · 결과 글자 · 선택 그대로", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const payer = await makeTransferPayer(fx);
    await approvedTarget(fx, "tracer", payer);

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    const row = rowOf(page, fx.lines.tracer.itemName);
    await waitForHydration(row.getByRole("checkbox"));
    await row.getByRole("checkbox").check();

    // 이 컨테이너의 Chromium은 한글 download 속성을 제안 파일 이름에 싣지 않는다(ASCII 이름은 싣는다 — 브라우저 쪽 동작).
    // 그래서 이름은 화면이 누른 링크의 download 속성으로, 내용은 내려받은 파일 바이트로 본다.
    await page.evaluate(() => {
      const names: string[] = [];
      Object.assign(window, { transferFileNames: names });
      HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
        if (this.download) names.push(this.download);
        HTMLElement.prototype.click.call(this);
      };
    });
    let downloads = 0;
    page.on("download", () => (downloads += 1));
    const waiting = page.waitForEvent("download");
    await page.getByRole("button", { name: "이체 파일 받기" }).click();
    const download = await waiting;
    expect(await page.evaluate(() => (window as unknown as { transferFileNames: string[] }).transferFileNames)).toEqual([`이체파일_${seoulToday()}.xlsx`]);
    const path = await download.path();
    const book = XLSX.read(await readFile(path), { type: "buffer" });
    expect(book.SheetNames).toEqual(["입력정보"]);
    expect((book.Sheets["입력정보"]?.["A2"] as XLSX.CellObject | undefined)?.v).toBe("088");

    const live = page.locator('[aria-live="polite"]').filter({ hasText: "이체 파일" });
    await expect(live).toHaveText(/^\d{2}:\d{2} 이체 파일 1건$/);
    await expect(row.getByRole("checkbox")).toBeChecked();
    expect(downloads).toBe(1);
    await page.context().close();
  });

  test("고른 건 0 → 버튼 aria-disabled · 이유 `고른 건 없음`", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const payer = await makeTransferPayer(fx);
    await approvedTarget(fx, "hold", payer);

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    await waitForHydration(rowOf(page, fx.lines.hold.itemName).getByRole("checkbox"));
    const button = page.getByRole("button", { name: "이체 파일 받기" });
    await expect(button).toHaveAttribute("aria-disabled", "true");
    await expect(button).toHaveAccessibleDescription("고른 건 없음");
    await page.context().close();
  });
});

// 결재를 통과한 문서의 지급처를 계좌 없는 거래처로 바꾼다(06.5-05 V4 제출 게이트 뒤의 옛 데이터 꼴).
async function withoutAccount(expenseId: string): Promise<void> {
  const suffix = randomUUID().slice(0, 6);
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E계좌없음-${suffix}`, normalizedName: `e2e계좌없음-${suffix}` });
  await db.update(expenses).set({ vendorId: vendor.id }).where(eq(expenses.id, expenseId));
}

function liveText(page: Page) {
  return page.locator('[aria-live="polite"]').filter({ hasText: "이체 파일" });
}

test.describe("지급 대상 · 이체 파일 받기 — 막힌 건 · 담김 줄 (06.5-06 Task 2)", () => {
  test("계좌 없는 행 + 정상 행 → 결과 `1건 · 막힘 1건` · 막힌 행 아래 위험 색 줄 + 새 탭 3차 링크 · 선택 유지 · 정상 행 담김 줄 · 지급 완료 뒤 이유 줄 지움", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const payer = await makeTransferPayer(fx, { vendorsWrite: true });
    await approvedTarget(fx, "tracer", payer);
    const broken = await approvedTarget(fx, "hold", payer);
    await withoutAccount(broken);

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    const okRow = rowOf(page, fx.lines.tracer.itemName);
    const badRow = rowOf(page, fx.lines.hold.itemName);
    await waitForHydration(okRow.getByRole("checkbox"));
    await okRow.getByRole("checkbox").check();
    await badRow.getByRole("checkbox").check();
    const waiting = page.waitForEvent("download");
    await page.getByRole("button", { name: "이체 파일 받기" }).click();
    await waiting;

    await expect(liveText(page)).toHaveText(/^\d{2}:\d{2} 이체 파일 1건 · 막힘 1건$/);
    const line = badRow.locator("p").filter({ hasText: "계좌 없음 · " });
    await expect(line).toHaveText("계좌 없음 · 거래처 계좌 등록");
    const link = line.getByRole("link", { name: "거래처 계좌 등록" });
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener");
    const style = await line.evaluate((element) => {
      const probe = document.createElement("span");
      probe.style.color = "var(--status-danger)";
      document.body.append(probe);
      const danger = getComputedStyle(probe).color;
      probe.remove();
      const own = getComputedStyle(element);
      return { color: own.color, danger, background: own.backgroundColor };
    });
    expect(style.color).toBe(style.danger);
    expect(style.background).toBe("rgba(0, 0, 0, 0)");
    const linkFont = await link.evaluate((element) => ({ size: getComputedStyle(element).fontSize, weight: getComputedStyle(element).fontWeight }));
    expect(linkFont).toEqual({ size: "14px", weight: "600" });
    await expect(badRow.getByRole("checkbox")).toBeChecked();
    await expect(okRow.locator("p").filter({ hasText: /^\d{2}:\d{2} 이체 파일에 담김$/ })).toHaveCount(1);

    await page.getByRole("button", { name: /^지급 완료 2/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /^지급 완료 2건/ }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("link", { name: "거래처 계좌 등록" })).toHaveCount(0);
    await page.context().close();
  });

  test("버튼 노출 — 1023 · 768 · 375 폭과 계좌 해제 · 금액 숨김 계급에는 DOM 0, 직원 지급처 행이 있어도 게이트를 가진 계급에는 유지", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const payer = await makeTransferPayer(fx);
    await approvedTarget(fx, "retry", payer);
    const personDoc = await approvedTarget(fx, "phone", payer);
    await db.update(expenses).set({ vendorId: null, payeeUserId: payer.viewer.id }).where(eq(expenses.id, personDoc));

    for (const width of [1023, 768, 375]) {
      const page = await loginPage(browser, baseURL, payer, { width, height: 900 });
      await page.goto("/expenses");
      await expect(page.getByText(fx.lines.retry.itemName).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "이체 파일 받기" })).toHaveCount(0);
      await page.context().close();
    }
    for (const hidden of ["vendor.account_number_unmasked", "expense.amount"]) {
      const other = await makeTransferPayer(fx, { hidden: [hidden] });
      const page = await loginPage(browser, baseURL, other, { width: 1280, height: 900 });
      await page.goto("/expenses");
      await expect(page.getByText(fx.lines.retry.itemName).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "이체 파일 받기" })).toHaveCount(0);
      await page.context().close();
    }
    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    await expect(rowOf(page, fx.lines.phone.itemName)).toHaveCount(1);
    await expect(page.getByRole("button", { name: "이체 파일 받기" })).toHaveCount(1);
    await page.context().close();
  });

  for (const width of [1024, 1280]) {
    test(`전부 막힘(${width}) → 다운로드 없음 · 결과 \`0건 · 막힘 1건\` · 1차는 필터 줄 오른쪽 끝`, async ({ browser, baseURL }) => {
      const fx = await setupExpenseE2E();
      const payer = await makeTransferPayer(fx);
      const broken = await approvedTarget(fx, "worst", payer);
      await withoutAccount(broken);

      const page = await loginPage(browser, baseURL, payer, { width, height: 900 });
      await page.goto("/expenses");
      const row = rowOf(page, fx.lines.worst.itemName);
      await waitForHydration(row.getByRole("checkbox"));
      await row.getByRole("checkbox").check();
      let downloads = 0;
      page.on("download", () => (downloads += 1));
      await page.getByRole("button", { name: "이체 파일 받기" }).click();
      await expect(liveText(page)).toHaveText(/^\d{2}:\d{2} 이체 파일 0건 · 막힘 1건$/);
      await expect(row.locator("p").filter({ hasText: "계좌 없음 · 거래처 수정은 경영관리" })).toHaveCount(1);
      expect(downloads).toBe(0);
      const edges = await page.getByRole("button", { name: /^지급 완료/ }).evaluate((button) => {
        let bar = button.parentElement;
        while (bar && !bar.querySelector('form[aria-label="지출결의 보기"]')) bar = bar.parentElement;
        return { button: button.getBoundingClientRect().right, bar: bar?.getBoundingClientRect().right ?? -1 };
      });
      expect(Math.abs(edges.button - edges.bar)).toBeLessThanOrEqual(1);
      await page.context().close();
    });
  }
});

test.afterAll(archiveTempRoles);
