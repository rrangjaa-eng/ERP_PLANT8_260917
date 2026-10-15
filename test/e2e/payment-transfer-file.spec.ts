import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { db } from "@/db/client";
import { expenses, projects, quoteLines } from "@/db/schema";
import { insertVendor } from "@/repositories/vendors";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { confirmEvidence } from "@/domain/evidence-reviews";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { encrypt } from "@/lib/crypto";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { createRevisionFromCurrent, setCustomerApproval } from "@/domain/quotes/revisions";
import { approvalBasis } from "@/repositories/quote-revisions";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { submitReadyDraft, testVendorAccount } from "../integration/fixtures/expenses";
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

// hidden — 끄는 정보 항목(버튼 게이트 확인용) · vendorsWrite — 거래처 관리 보기 ∧ 쓰기(막힌 줄 끝 링크 — 보기 없으면 거래처 화면이 404라 링크도 없다).
async function makeTransferPayer(fx: ExpenseE2E, opts: { hidden?: readonly string[]; vendorsWrite?: boolean } = {}): Promise<Person> {
  const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E이체파일-${randomUUID().slice(0, 8)}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.team", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.payments", action: "write", allowed: true });
  if (opts.vendorsWrite) {
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "admin.vendors", action: "view", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "admin.vendors", action: "write", allowed: true });
  }
  for (const infoItem of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: !opts.hidden?.includes(infoItem) });
  return makePerson("경영관리", role.id, await teamOf(fx), `${seoulToday().slice(0, 4)}-01-01`);
}

// 줄 하나 → 제출 → 결재선 넷 승인 → 지급 권한자가 증빙 확인 = P4(지급 대상 · 고를 수 있음). 픽스처 거래처는 신한 계좌가 있다.
async function approvedTarget(fx: ExpenseE2E, key: LineKey, confirmer: Person): Promise<string> {
  return approvedLine(fx, fx.lines[key].id, confirmer);
}

async function approvedLine(fx: ExpenseE2E, lineId: string, confirmer: Person): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [lineId] });
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

// 행 아래 줄(막힘 · 담김)은 주 행 바로 다음 줄에 선다(DOM 감사 W-2 — 데이터 열 전부를 덮는 줄).
function lineUnder(row: Locator) {
  return row.locator("xpath=following-sibling::tr[1]");
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
    const line = lineUnder(badRow).locator("p").filter({ hasText: "계좌 없음 · " });
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
    await expect(lineUnder(okRow).locator("p").filter({ hasText: /^\d{2}:\d{2} 이체 파일에 담김$/ })).toHaveCount(1);

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
      await expect(lineUnder(row).locator("p").filter({ hasText: "계좌 없음 · 거래처 수정은 경영관리" })).toHaveCount(1);
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

// 06.5-06 DOM 감사 W-1 · W-2 · M-1 · M-2 회귀(1280): 2차는 필터 칸 줄에 서고, 행 아래 줄(V5 이유 표의 가장 긴 문구 · 담김 줄)은 행 폭 아래 한 줄,
// 막힌 행 안 Tab은 그 행 칸들을 다 지난 뒤 아래 줄 끝 링크로 간다(시각 차례). 잰 값은 MEASURE 줄로 남긴다.
test.describe("지급 대상 · 이체 파일 받기 — 필터 줄 정렬 · 행 아래 줄 (06.5-06 DOM 감사)", () => {
  test("1280 — 2차 · 결과 글자는 필터 칸 줄 · 가장 긴 막힘 줄과 담김 줄은 한 줄 · 막힌 행 Tab은 행 칸 다음 끝 링크", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const plain = await makeTransferPayer(fx);
    await approvedTarget(fx, "tracer", plain);
    const broken = await approvedTarget(fx, "worst", plain);
    // V5 이유 표의 가장 긴 문구 — 계좌번호 형식 오류(평문 담당 꼬리 `거래처 수정은 경영관리`).
    const suffix = randomUUID().slice(0, 6);
    const vendor = await insertVendor(SYSTEM_VIEWER, {
      name: `E2E계좌형식-${suffix}`,
      normalizedName: `e2e계좌형식-${suffix}`,
      ...testVendorAccount(),
      accountNumberEncrypted: encrypt("110-123-45678A"),
    });
    await db.update(expenses).set({ vendorId: vendor.id }).where(eq(expenses.id, broken));

    const page = await loginPage(browser, baseURL, plain, { width: 1280, height: 900 });
    await page.goto("/expenses");
    const okRow = rowOf(page, fx.lines.tracer.itemName);
    const badRow = rowOf(page, fx.lines.worst.itemName);
    await waitForHydration(okRow.getByRole("checkbox"));
    await okRow.getByRole("checkbox").check();
    await badRow.getByRole("checkbox").check();
    const waiting = page.waitForEvent("download");
    await page.getByRole("button", { name: "이체 파일 받기" }).click();
    await waiting;
    await expect(liveText(page)).toHaveText(/^\d{2}:\d{2} 이체 파일 1건 · 막힘 1건$/);
    const blockedLine = lineUnder(badRow).locator("p");
    await expect(blockedLine).toHaveText("계좌번호 형식 오류 · 거래처 수정은 경영관리");
    const noteLine = lineUnder(okRow).locator("p");
    await expect(noteLine).toHaveText(/^\d{2}:\d{2} 이체 파일에 담김$/);

    const box = async (locator: Locator) => {
      const rect = await locator.evaluate((element) => {
        const r = element.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: r.height, width: r.width, lineHeight: parseFloat(getComputedStyle(element).lineHeight) };
      });
      return rect;
    };
    const select = await box(page.getByLabel("상태", { exact: true }));
    const secondary = await box(page.getByRole("button", { name: "이체 파일 받기" }));
    const primary = await box(page.getByRole("button", { name: /^지급 완료/ }));
    const result = await box(liveText(page));
    const blocked = await box(blockedLine);
    const note = await box(noteLine);
    console.log(`MEASURE ${JSON.stringify({ select, secondary, primary, result, blocked, note })}`);
    expect(Math.abs(secondary.top - select.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(secondary.bottom - select.bottom)).toBeLessThanOrEqual(1);
    expect(Math.abs(primary.bottom - select.bottom)).toBeLessThanOrEqual(1);
    expect(result.top).toBeGreaterThanOrEqual(select.top - 1);
    expect(result.bottom).toBeLessThanOrEqual(select.bottom + 1);
    // 한 줄 — 높이가 줄 높이의 1.5배 미만(끝 링크 14px가 줄 상자를 조금 키울 수 있다).
    expect(blocked.height).toBeLessThan(blocked.lineHeight * 1.5);
    expect(note.height).toBeLessThan(note.lineHeight * 1.5);
    // 주 행과 아래 줄은 한 행으로 읽힌다 — 행 선은 아래 줄 밑에만(표의 마지막 행이면 선 없음), 아래 줄은 고른 행 면(--accent-weak)을 잇는다.
    for (const row of [okRow, badRow]) {
      const borders = await row.evaluate((tr) => {
        const bodies = tr.closest("table")?.tBodies;
        return {
          last: bodies ? tr.parentElement === bodies[bodies.length - 1] : false,
          main: [...tr.children].map((cell) => getComputedStyle(cell).borderBottomWidth),
          under: [...(tr.nextElementSibling?.children ?? [])].map((cell) => getComputedStyle(cell).borderBottomWidth),
          mainBg: getComputedStyle(tr.children[1] ?? tr).backgroundColor,
          underBg: getComputedStyle(tr.nextElementSibling?.children[1] ?? tr).backgroundColor,
        };
      });
      console.log(`MEASURE borders ${JSON.stringify(borders)}`);
      expect(new Set(borders.main)).toEqual(new Set(["0px"]));
      expect(new Set(borders.under)).toEqual(new Set([borders.last ? "0px" : "1px"]));
      expect(borders.underBg).toBe(borders.mainBg);
    }
    await page.context().close();

    // M-2 — 거래처 관리 쓰기가 있으면 같은 막힘이 끝 링크 `계좌 고치기`로 선다. 막힌 행 체크박스에서 Tab: 행 칸들 → 아래 줄 링크 → 다음 행.
    const linked = await makeTransferPayer(fx, { vendorsWrite: true });
    const second = await loginPage(browser, baseURL, linked, { width: 1280, height: 900 });
    await second.goto("/expenses");
    const bad = rowOf(second, fx.lines.worst.itemName);
    await waitForHydration(bad.getByRole("checkbox"));
    await bad.getByRole("checkbox").check();
    await second.getByRole("button", { name: "이체 파일 받기" }).click();
    const link = lineUnder(bad).getByRole("link", { name: "계좌 고치기" });
    await expect(link).toHaveCount(1);
    await bad.getByRole("checkbox").focus();
    const label = `${await bad.getByRole("checkbox").getAttribute("aria-label")}`;
    const order: string[] = [];
    for (let step = 0; step < 30; step += 1) {
      await second.keyboard.press("Tab");
      const where = await second.evaluate((checkboxLabel) => {
        const active = document.activeElement;
        const main = document.querySelector(`[aria-label="${CSS.escape(checkboxLabel)}"]`)?.closest("tr");
        const tr = active?.closest("tr");
        if (!active || !main || !tr) return "out";
        if (tr === main) return "row";
        if (tr === main.nextElementSibling) return active.textContent === "계좌 고치기" ? "link" : "under";
        return "out";
      }, label);
      order.push(where);
      if (where !== "row") break;
    }
    console.log(`MEASURE tab ${JSON.stringify(order)}`);
    expect(order.at(-1)).toBe("link");
    expect(order.slice(0, -1).every((where) => where === "row")).toBe(true);
    await second.keyboard.press("Tab");
    const afterLink = await second.evaluate((checkboxLabel) => {
      const main = document.querySelector(`[aria-label="${CSS.escape(checkboxLabel)}"]`)?.closest("tr");
      const tr = document.activeElement?.closest("tr");
      return tr === main || tr === main?.nextElementSibling ? "same" : "next";
    }, label);
    expect(afterLink).toBe("next");
    await second.context().close();
  });
});

test.afterAll(archiveTempRoles);

// 06.5-06 Task 3(D-6519 · V14 · SP-65-7): 지급처마다 한 줄 · `지급 완료` 대화상자 소계 칸.
// 지급처가 넷 이상 필요한 시험은 새 고객 승인 차수에 거래처별 줄을 더해 문서를 만든다(픽스처 줄은 거래처 하나).
async function payeeVendor(label: string): Promise<{ id: string; name: string }> {
  const suffix = randomUUID().slice(0, 6);
  const name = `E2E지급처${label}-${suffix}`;
  // 증빙 종류 기본값이 없으면 제출 게이트가 막는다(픽스처 거래처와 같은 세금계산서).
  const vendor = await insertVendor(SYSTEM_VIEWER, { name, normalizedName: name.toLowerCase(), defaultEvidenceType: "tax_invoice", ...testVendorAccount() });
  return { id: vendor.id, name };
}

async function payeeTargets(fx: ExpenseE2E, confirmer: Person, vendorIds: readonly string[]): Promise<{ id: string; itemName: string }[]> {
  const current = await getCurrentQuoteRevision(SYSTEM_VIEWER, fx.projectId);
  if (!current) throw new Error("차수 없음");
  const next = await createRevisionFromCurrent(fx.pm.viewer, { projectId: fx.projectId, fromRevisionId: current.id });
  const subcategory = (await firstSelectableSubcategory()).value;
  const names = vendorIds.map((_, index) => `지급처 줄 ${index + 1}-${randomUUID().slice(0, 4)}`);
  await saveQuoteLines(SYSTEM_VIEWER, next.revisionId, {
    rows: names.map((itemName, index) => ({
      id: randomUUID(),
      isNew: true as const,
      subcategory,
      itemName,
      vendorId: vendorIds[index] ?? null,
      unitPrice: { currency: "KRW" as const, amount: 2_000_000, fxRate: 1 },
      execution: { currency: "KRW" as const, amount: 1_000_000 + index * 10_000, fxRate: 1 },
    })),
  });
  const basis = await approvalBasis(SYSTEM_VIEWER, next.revisionId);
  await setCustomerApproval(fx.pm.viewer, next.revisionId, { approvedOn: seoulToday(), seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken });
  const lines = await db.select({ id: quoteLines.id, itemName: quoteLines.itemName }).from(quoteLines).where(eq(quoteLines.revisionId, next.revisionId));
  const targets: { id: string; itemName: string }[] = [];
  for (const itemName of names) {
    const line = lines.find((row) => row.itemName === itemName);
    if (!line) throw new Error(`줄 없음: ${itemName}`);
    targets.push({ id: await approvedLine(fx, line.id, confirmer), itemName });
  }
  return targets;
}

async function checkAll(page: Page, itemNames: readonly string[]): Promise<void> {
  for (const itemName of itemNames) await rowOf(page, itemName).getByRole("checkbox").check();
}

// 소계 칸 · 결과 줄 칸(소계 칸 바로 다음 형제) · 지급일 · 1차 버튼의 위쪽 좌표.
async function dialogTops(page: Page) {
  const dialog = page.getByRole("dialog");
  const box = dialog.locator('[data-ui="confirm-subtotals"]');
  const top = async (locator: ReturnType<Page["locator"]>) => (await locator.boundingBox())?.y ?? Number.NaN;
  return {
    title: await top(dialog.getByRole("heading", { name: "지급 완료" })),
    results: await top(box.locator("xpath=following-sibling::div[1]")),
    payDate: await top(dialog.getByLabel("지급일")),
    primary: await top(dialog.getByRole("button", { name: /^지급 완료 \d+건/ })),
  };
}

test.describe("지급 대상 · 이체 파일 받기 — 지급처 합치기 · 소계 칸 (06.5-06 Task 3)", () => {
  test("같은 거래처 두 문서 + 다른 거래처 한 문서 → 결과 `2줄 · 문서 3건` · 대화상자 소계 칸에 2건 지급처 한 행 · 결과 줄 p ≤ 3 · 첫 포커스 지급일", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const payer = await makeTransferPayer(fx);
    await approvedTarget(fx, "tracer", payer);
    await approvedTarget(fx, "hold", payer);
    const other = await approvedTarget(fx, "retry", payer);
    const otherVendor = await payeeVendor("다른");
    await db.update(expenses).set({ vendorId: otherVendor.id }).where(eq(expenses.id, other));

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    await waitForHydration(rowOf(page, fx.lines.tracer.itemName).getByRole("checkbox"));
    await checkAll(page, [fx.lines.tracer.itemName, fx.lines.hold.itemName, fx.lines.retry.itemName]);
    const waiting = page.waitForEvent("download");
    await page.getByRole("button", { name: "이체 파일 받기" }).click();
    await waiting;
    await expect(liveText(page)).toHaveText(/^\d{2}:\d{2} 이체 파일 2줄 · 문서 3건$/);

    await page.getByRole("button", { name: /^지급 완료 3/ }).click();
    const dialog = page.getByRole("dialog");
    const box = dialog.locator('[data-ui="confirm-subtotals"]');
    await expect(box.locator("li")).toHaveCount(1);
    await expect(dialog.getByRole("group", { name: "지급처 소계" })).toHaveCount(1);
    await expect(box.locator("li")).toHaveText(new RegExp(`^${fx.vendorName} [\\d,]+ · 2건$`));
    await expect(box).toHaveAttribute("tabindex", "0");
    await expect(box.locator("xpath=following-sibling::div[1]").locator("p")).toHaveCount(1);
    await expect(dialog.locator("p").filter({ hasText: "· 2건" })).toHaveCount(0);
    await expect(dialog.getByLabel("지급일")).toBeFocused();
    await expect(page.locator("tbody").getByText(/ · 2건$/)).toHaveCount(0);
    await page.context().close();
  });

  test("지급처 넷(각 두 문서) → 소계 행 4 · 칸 안 스크롤(행 셋 높이) · 제목 · 결과 줄 · 지급일 · 1차 위치는 지급처 셋일 때와 같다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const payer = await makeTransferPayer(fx);
    const vendors = [await payeeVendor("A"), await payeeVendor("B"), await payeeVendor("C"), await payeeVendor("D")];
    const targets = await payeeTargets(fx, payer, vendors.flatMap((vendor) => [vendor.id, vendor.id]));

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    await waitForHydration(rowOf(page, take(targets, 0).itemName).getByRole("checkbox"));
    await checkAll(page, targets.slice(0, 6).map((target) => target.itemName));
    await page.getByRole("button", { name: /^지급 완료 6/ }).click();
    const dialog = page.getByRole("dialog");
    const box = dialog.locator('[data-ui="confirm-subtotals"]');
    await expect(box.locator("li")).toHaveCount(3);
    await expect(dialog.getByRole("button", { name: /^지급 완료 6건/ })).not.toHaveAttribute("aria-disabled", "true");
    const three = await dialogTops(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await checkAll(page, targets.slice(6).map((target) => target.itemName));
    await page.getByRole("button", { name: /^지급 완료 8/ }).click();
    await expect(box.locator("li")).toHaveCount(4);
    await expect(dialog.getByRole("button", { name: /^지급 완료 8건/ })).not.toHaveAttribute("aria-disabled", "true");
    const measured = await box.evaluate((element) => {
      const row = element.querySelector("li");
      return {
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        overflowY: getComputedStyle(element).overflowY,
        rowHeight: row ? row.getBoundingClientRect().height : 0,
      };
    });
    expect(measured.scrollHeight).toBeGreaterThan(measured.clientHeight);
    expect(measured.overflowY).toBe("auto");
    expect(Math.abs(measured.clientHeight - measured.rowHeight * 3)).toBeLessThanOrEqual(2);
    const four = await dialogTops(page);
    for (const key of ["title", "results", "payDate", "primary"] as const) expect(Math.abs(four[key] - three[key])).toBeLessThanOrEqual(1);
    await page.context().close();
  });

  test("같은 거래처 계좌이체 두 문서 + 현금 한 문서 → 소계 행 `· 2건`(현금은 빠진다 · R-6)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const payer = await makeTransferPayer(fx);
    await approvedTarget(fx, "tracer", payer);
    await approvedTarget(fx, "hold", payer);
    const cash = await approvedTarget(fx, "retry", payer);
    await db.update(expenses).set({ paymentMethod: "cash" }).where(eq(expenses.id, cash));

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    await waitForHydration(rowOf(page, fx.lines.tracer.itemName).getByRole("checkbox"));
    await checkAll(page, [fx.lines.tracer.itemName, fx.lines.hold.itemName, fx.lines.retry.itemName]);
    await page.getByRole("button", { name: /^지급 완료 3/ }).click();
    const box = page.getByRole("dialog").locator('[data-ui="confirm-subtotals"]');
    await expect(box.locator("li")).toHaveCount(1);
    await expect(box.locator("li")).toHaveText(new RegExp(`^${fx.vendorName} [\\d,]+ · 2건$`));
    await page.context().close();
  });

  test("소계 읽기 실패 → 칸 없음 · 오류 문구 없음 · 1차는 막히지 않고 지급 완료가 끝난다(R-5)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const payer = await makeTransferPayer(fx);
    await approvedTarget(fx, "tracer", payer);
    await approvedTarget(fx, "hold", payer);

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await page.goto("/expenses");
    await waitForHydration(rowOf(page, fx.lines.tracer.itemName).getByRole("checkbox"));
    await checkAll(page, [fx.lines.tracer.itemName, fx.lines.hold.itemName]);
    // 여는 순간의 서버 액션 중 지급 행 스냅숏(expectedPayableKrw)을 싣는 것은 소계 읽기뿐이다(합 요청은 id · 이체액만) — 그 하나만 끊는다.
    let aborted = false;
    const failed = page.waitForEvent("requestfailed");
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (!aborted && request.method() === "POST" && request.headers()["next-action"] && (request.postData() ?? "").includes("expectedPayableKrw")) {
        aborted = true;
        await route.abort();
        return;
      }
      await route.fallback();
    });
    await page.getByRole("button", { name: /^지급 완료 2/ }).click();
    await failed;
    await page.unroute("**/*");
    const dialog = page.getByRole("dialog");
    const primary = dialog.getByRole("button", { name: /^지급 완료 2건/ });
    await expect(primary).not.toHaveAttribute("aria-disabled", "true");
    await expect(dialog.locator('[data-ui="confirm-subtotals"]')).toHaveCount(0);
    await expect(dialog.getByText(/실패|오류|소계/)).toHaveCount(0);
    await primary.click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('[aria-live="polite"]').filter({ hasText: "지급 완료" })).toHaveText(/^\d{2}:\d{2} 지급 완료 2건$/);
    await page.context().close();
  });
});

function take<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error("픽스처 모자람");
  return item;
}
