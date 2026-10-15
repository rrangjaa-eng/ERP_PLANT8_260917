import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { db } from "@/db/client";
import { expenses, projects } from "@/db/schema";
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

async function makeTransferPayer(fx: ExpenseE2E): Promise<Person> {
  const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E이체파일-${randomUUID().slice(0, 8)}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.team", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.payments", action: "write", allowed: true });
  for (const infoItem of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
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

test.afterAll(archiveTempRoles);
