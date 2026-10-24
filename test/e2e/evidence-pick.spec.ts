import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses, projects, purchaseRequests } from "@/db/schema";
import { approveDocument, getApprovalView, rejectDocument } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND, submitExpense } from "@/domain/expenses";
import { createIntakeManager, insertLinkFixture, insertRecordFixture, setRecordVisibilityFixture } from "@/test/integration/fixtures/evidence";
import { attachEvidence } from "@/test/integration/fixtures/expenses";
import { createOrgUnit, createTeam } from "@/domain/org";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { setupExpenseE2E, submitLineExpense, type ExpenseE2E } from "./expense-fixture";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { clearEvidence, holdServerAction, isServerAction, loginAs } from "./helpers/evidence";

// 06.1-08 S5(EVID-07 · RP-4): 작성자 증빙 고르기 — 임시 지출결의 화면 → `증빙 고르기 N` → PickDialog 다중 → 붙임 → 문서 섹션 읽기 행.
// 판정은 CI=true 프로덕션 빌드에서 한다(CLAUDE.md §5). 등록 권한자는 회사 전체 증빙을 보므로 케이스마다 증빙 표를 비우고 시작한다.

test.beforeEach(async () => {
  await clearEvidence();
});

test("작성자 PM: 임시 지출결의 → 증빙 고르기 1 → 검색 칸 포커스 · 다중 목록 · 1위 선택 → Enter → 읽기 행 · 트리거 사라짐", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const fx = await setupExpenseE2E();
  const manager = await createIntakeManager();
  const recordId = await insertRecordFixture(manager, { nameOnDocument: fx.vendorName });
  await setRecordVisibilityFixture(recordId, { visibility: "team", teamId: fx.teamId });
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.tracer.id], fields: { note: "행사 운영비" } });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");

  const page = await loginPage(browser, baseURL, fx.pm);
  await page.goto(`/expenses/${expenseId}`);
  const trigger = page.getByRole("button", { name: "증빙 고르기 1" });
  await waitForHydration(trigger);
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "증빙 고르기" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "거래처 · 금액" })).toBeFocused();
  const list = dialog.getByRole("listbox");
  await expect(list).toHaveAttribute("aria-multiselectable", "true");
  await expect(dialog.locator("[aria-busy]")).toHaveCount(0);
  const option = list.getByRole("option");
  await expect(option).toHaveCount(1);
  await expect(option.first()).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByText("고른 1건")).toBeVisible();
  const primary = dialog.getByRole("button", { name: /^증빙 붙이기 1/ });
  await expect(primary).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();

  const rows = page.getByRole("table", { name: "붙은 증빙" }).locator("tbody tr:visible");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(fx.vendorName);
  await expect(rows.first()).toContainText(`${fx.pm.name} 고름`);
  await expect(page.getByRole("button", { name: /^증빙 고르기/ })).toHaveCount(0);
  await page.context().close();
});

// 06.1 UAT #29 — 기록 붙임 · 떼기 뒤 같은 화면 제출 1차 재판정(.planning/debug/0601-pick-submit-disabled.md)
test("(G-06.1-29) 증빙 고르기로 붙인 직후 — 새로 고침 없이 제출 1차가 열리고 비고는 그대로이며 제출된다", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const fx = await setupExpenseE2E();
  const manager = await createIntakeManager();
  const recordId = await insertRecordFixture(manager, { nameOnDocument: fx.vendorName });
  await setRecordVisibilityFixture(recordId, { visibility: "team", teamId: fx.teamId });
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.tracer.id], fields: { note: "행사 운영비" } });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");

  const page = await loginPage(browser, baseURL, fx.pm);
  await page.goto(`/expenses/${expenseId}`);
  const trigger = page.getByRole("button", { name: "증빙 고르기 1" });
  await waitForHydration(trigger);
  const submit = page.getByRole("button", { name: /^지출결의 제출/ });
  await expect(submit).toHaveAttribute("aria-disabled", "true");
  const describedBy = (await submit.getAttribute("aria-describedby")) ?? "";
  expect(describedBy).not.toBe("");
  await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(/^증빙 없음 · /);

  const memo = page.getByLabel("상세", { exact: true });
  await memo.fill("저장 안 한 비고");
  await trigger.click();
  const picker = page.getByRole("dialog", { name: "증빙 고르기" });
  await expect(picker.locator("[aria-busy]")).toHaveCount(0);
  // 미리보기 요청만 붙잡는다(고르기 · 떼기 액션은 통과) — 응답이 오기 전 구간이 폴링 지연과 상관없이 유지된다.
  const preview = holdServerAction(page, "preview");
  await preview.ready;
  await page.keyboard.press("Enter");
  await expect(picker).toBeHidden();
  await expect(page.getByRole("table", { name: "붙은 증빙" }).locator("tbody tr:visible")).toHaveCount(1);
  await preview.arrived;

  // 그 자리 측정 — 미리보기 응답이 붙잡힌 동안 1차는 막힌 채다(재시도 단언 아님).
  expect(await submit.getAttribute("aria-disabled")).toBe("true");
  preview.release();
  await expect.poll(() => submit.getAttribute("aria-disabled")).not.toBe("true");
  await expect(memo).toHaveValue("저장 안 한 비고");
  await submit.click();
  await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}\\?submitted=1$`));
  await page.context().close();
});

test("(G-06.1-29 저장 겹침) 고르기 직후 저장이 진행 중이어도 — 미리보기가 건너뛰어진 채 남지 않고 제출 1차가 열린다", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const fx = await setupExpenseE2E();
  const manager = await createIntakeManager();
  const recordId = await insertRecordFixture(manager, { nameOnDocument: fx.vendorName });
  await setRecordVisibilityFixture(recordId, { visibility: "team", teamId: fx.teamId });
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.tracer.id], fields: { note: "행사 운영비" } });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");

  const page = await loginPage(browser, baseURL, fx.pm);
  await page.goto(`/expenses/${expenseId}`);
  const trigger = page.getByRole("button", { name: "증빙 고르기 1" });
  await waitForHydration(trigger);
  const submit = page.getByRole("button", { name: /^지출결의 제출/ });
  await expect(submit).toHaveAttribute("aria-disabled", "true");

  const memo = page.getByLabel("상세", { exact: true });
  await memo.fill("저장 겹침 비고");
  // 읽기 행이 서는 같은 갱신 안에서 저장을 누르고(미리보기 타이머 250ms보다 먼저) 저장 요청은 붙잡아 저장 중(busy)을 유지한다.
  // Next 서버 액션은 한 줄로 서므로 고르기를 끝낸 뒤에 저장이 나가야 한다.
  await trigger.click();
  const picker = page.getByRole("dialog", { name: "증빙 고르기" });
  await expect(picker.locator("[aria-busy]")).toHaveCount(0);
  const save = holdServerAction(page, "save");
  await save.ready;
  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      const rowShown = [...document.querySelectorAll("tbody tr")].some((row) => row.textContent?.includes("고름"));
      if (!rowShown) return;
      observer.disconnect();
      const button = [...document.querySelectorAll("button")].find((el) => el.textContent?.trim().startsWith("임시 저장"));
      button?.click();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  await page.keyboard.press("Enter");
  await expect(picker).toBeHidden();
  await save.arrived;
  // 타이머(250ms)가 저장 중에 지나가도록 둔다 — 건너뛰어지는 것이 시험 대상이다.
  await page.waitForTimeout(600);
  save.release();
  await expect.poll(() => submit.getAttribute("aria-disabled")).not.toBe("true");
  await expect(memo).toHaveValue("저장 겹침 비고");
  await submit.click();
  await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}\\?submitted=1$`));
  await page.context().close();
});

test("(G-06.1-29 대칭) 붙은 채 연 문서에서 마지막 기록을 떼면 — 새로 고침 없이 제출 1차가 다시 막히고 이유 줄이 선다", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const fx = await setupExpenseE2E();
  const manager = await createIntakeManager();
  const recordId = await insertRecordFixture(manager, { nameOnDocument: fx.vendorName });
  await setRecordVisibilityFixture(recordId, { visibility: "team", teamId: fx.teamId });
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.tracer.id], fields: { note: "행사 운영비" } });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");

  const page = await loginPage(browser, baseURL, fx.pm);
  await page.goto(`/expenses/${expenseId}`);
  const trigger = page.getByRole("button", { name: "증빙 고르기 1" });
  await waitForHydration(trigger);
  await trigger.click();
  const picker = page.getByRole("dialog", { name: "증빙 고르기" });
  await expect(picker.locator("[aria-busy]")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(picker).toBeHidden();
  await expect(page.getByRole("table", { name: "붙은 증빙" }).locator("tbody tr:visible")).toHaveCount(1);

  await page.reload();
  const submit = page.getByRole("button", { name: /^지출결의 제출/ });
  const detach = detachButton(page);
  await waitForHydration(detach);
  await expect(submit).not.toHaveAttribute("aria-disabled", "true");
  await detach.click();
  const dialog = page.getByRole("dialog", { name: "증빙 떼기" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("사유").fill("잘못 고름");
  await dialog.getByRole("button", { name: /^증빙 떼기/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("table", { name: "붙은 증빙" })).toHaveCount(0);

  // 그 자리 측정 — 붙은 증빙 표가 사라진 바로 다음 읽기: 서버 미리보기가 돌아오기 전에도 1차는 이미 막혀 있다(재시도 단언 아님).
  expect(await submit.getAttribute("aria-disabled")).toBe("true");
  await expect(submit).toHaveAttribute("aria-disabled", "true");
  const describedBy = (await submit.getAttribute("aria-describedby")) ?? "";
  expect(describedBy).not.toBe("");
  await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(/^증빙 없음 · /);
  await page.context().close();
});

// PR #256 Codex 봇 P2 — 미리보기가 실패해도 judgedLinked가 먼저 갱신돼 임시 막힘(NEW_DOC_BLOCK)이 걷히고 묵은 서버 판정(null)으로 1차가 열리던 건.
test("(G-06.1-29 미리보기 실패) 마지막 기록을 뗀 뒤 미리보기가 실패해도 — 제출 1차가 계속 막혀 있다", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const fx = await setupExpenseE2E();
  const manager = await createIntakeManager();
  const recordId = await insertRecordFixture(manager, { nameOnDocument: fx.vendorName });
  await setRecordVisibilityFixture(recordId, { visibility: "team", teamId: fx.teamId });
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.tracer.id], fields: { note: "행사 운영비" } });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");

  const page = await loginPage(browser, baseURL, fx.pm);
  await page.goto(`/expenses/${expenseId}`);
  const trigger = page.getByRole("button", { name: "증빙 고르기 1" });
  await waitForHydration(trigger);
  await trigger.click();
  const picker = page.getByRole("dialog", { name: "증빙 고르기" });
  await expect(picker.locator("[aria-busy]")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(picker).toBeHidden();
  await expect(page.getByRole("table", { name: "붙은 증빙" }).locator("tbody tr:visible")).toHaveCount(1);

  await page.reload();
  const submit = page.getByRole("button", { name: /^지출결의 제출/ });
  const detach = detachButton(page);
  await waitForHydration(detach);
  await expect(submit).not.toHaveAttribute("aria-disabled", "true");
  // 미리보기 서버 액션(`fields`만 있고 `expectedVersion` 없음)만 끊는다 — 떼기 액션은 그대로 지나간다.
  await page.route("**/*", async (route) => {
    const request = route.request();
    const body = request.postData() ?? "";
    if (isServerAction(request) && body.includes('"fields"') && !body.includes('"expectedVersion"')) {
      await route.abort("failed");
      return;
    }
    await route.fallback();
  });
  await detach.click();
  const dialog = page.getByRole("dialog", { name: "증빙 떼기" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("사유").fill("잘못 고름");
  await dialog.getByRole("button", { name: /^증빙 떼기/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("table", { name: "붙은 증빙" })).toHaveCount(0);

  // 실패한 미리보기가 끝날 때까지 기다린 뒤에도(디바운스 250ms 이상) 1차는 계속 막혀 있다.
  await page.waitForTimeout(1500);
  await expect(submit).toHaveAttribute("aria-disabled", "true");
  await page.context().close();
});

// 번호 있는 반려 문서(06.1-06 evidence-attach.spec.ts와 같은 갈래) — 경영관리 여러 장 붙이기의 문서.
async function returnedExpense(browser: Browser, baseURL: string | undefined, fx: ExpenseE2E): Promise<{ expenseId: string; number: string }> {
  const expenseId = await submitLineExpense(browser, baseURL, fx, "tracer");
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 문서를 읽지 못했다");
  await rejectDocument(fx.lead.viewer, { instanceId: view.instanceId, expectedVersion: view.version, reason: "금액 다시" });
  const [row] = await db.select({ number: expenses.number }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row?.number) throw new Error("번호 없음");
  return { expenseId, number: row.number };
}

test("경영관리: 여러 장 — 21째 고르기는 막히고(상한 줄 · 1차 켜짐) 20건이 한 번에 붙는다 · 넘침 줄", async ({ page, browser, baseURL }) => {
  test.setTimeout(240_000);
  const fx = await setupExpenseE2E();
  const manager = await createIntakeManager();
  if (!manager.roleId) throw new Error("계급 없음");
  const doc = await returnedExpense(browser, baseURL, fx);
  for (let index = 0; index < 22; index += 1) await insertRecordFixture(manager, { nameOnDocument: `상한후보${String(index).padStart(2, "0")}`, supplyKrw: 1_000_000 + index });
  await loginAs(page, manager.roleId);
  await page.goto(`/expenses/${doc.expenseId}`);
  const trigger = page.getByRole("button", { name: "증빙 고르기 22" });
  await waitForHydration(trigger);
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "증빙 고르기" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[aria-busy]")).toHaveCount(0);
  const options = dialog.getByRole("option");
  await expect(options).toHaveCount(20);
  await expect(dialog.getByText("20건 넘음 · 검색으로 좁히기")).toBeVisible();
  // 반려 문서 — 서버가 1위를 미리 골라 둔다. 나머지 19개를 눌러 20건을 채운다.
  await expect(dialog.getByText("고른 1건")).toBeVisible();
  const listed = (await options.allTextContents()).join(" ");
  const leftOut = Array.from({ length: 22 }, (_, index) => `상한후보${String(index).padStart(2, "0")}`).filter((name) => !listed.includes(name));
  expect(leftOut).toHaveLength(2);
  for (let index = 1; index < 20; index += 1) await options.nth(index).click();
  await expect(dialog.getByRole("button", { name: /^증빙 붙이기 20/ })).toBeVisible();

  // 21째 — 목록에 없는 후보를 검색해 누른다: 고름은 20 그대로 · 상한 줄 · 1차는 막히지 않는다.
  const search = dialog.getByRole("textbox", { name: "거래처 · 금액" });
  await search.fill(leftOut[0] ?? "");
  await expect(dialog.locator("[aria-busy]")).toHaveCount(0);
  const unselected = dialog.getByRole("option", { selected: false });
  await expect(unselected.first()).toBeVisible();
  await unselected.first().click();
  await expect(dialog.getByText("20건 상한 · 나눠 붙이기")).toBeVisible();
  const primary = dialog.getByRole("button", { name: /^증빙 붙이기 20/ });
  await expect(primary).not.toHaveAttribute("aria-disabled", "true");

  await primary.click();
  await expect(dialog).toBeHidden();
  const rows = page.getByRole("table", { name: "붙은 증빙" }).locator("tbody tr:visible");
  await expect(rows).toHaveCount(20);
  // 남은 2건 — 트리거는 후보가 남아 있어 그대로 선다.
  await expect(page.getByRole("button", { name: "증빙 고르기 2" })).toBeVisible();
});

test("경영관리: 모달을 연 뒤 다른 경로로 하나가 먼저 붙으면 Enter → 경합 줄 + 새로 고침 → 그 행이 빠지고 붙은 것은 0", async ({ page, browser, baseURL }) => {
  test.setTimeout(240_000);
  const fx = await setupExpenseE2E();
  const manager = await createIntakeManager();
  if (!manager.roleId) throw new Error("계급 없음");
  const doc = await returnedExpense(browser, baseURL, fx);
  const taken = await insertRecordFixture(manager, { nameOnDocument: "먼저붙은곳", supplyKrw: 5_000_000 });
  await insertRecordFixture(manager, { nameOnDocument: "남는곳", supplyKrw: 4_000_000 });
  await loginAs(page, manager.roleId);
  await page.goto(`/expenses/${doc.expenseId}`);
  const trigger = page.getByRole("button", { name: "증빙 고르기 2" });
  await waitForHydration(trigger);
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "증빙 고르기" });
  await expect(dialog.locator("[aria-busy]")).toHaveCount(0);
  const options = dialog.getByRole("option");
  await expect(options).toHaveCount(2);
  await options.nth(1).click();
  await expect(dialog.getByText("고른 2건")).toBeVisible();

  // 「다른 문서가 먼저 붙임」 — 이 문서와 다른 임의 id. 문서 id 끝 한 글자를 바꾸는 방식은 id가 이미 0으로 끝나면(16분의 1) 같은 문서가 돼 경합이 안 난다.
  await insertLinkFixture({ recordId: taken, ownerId: randomUUID(), attachedBy: manager.id });
  await dialog.getByRole("button", { name: /^증빙 붙이기 2/ }).click();
  await expect(dialog.getByText(/^다른 사람이 먼저 붙임 · 먼저붙은곳/)).toBeVisible();
  await dialog.getByRole("button", { name: "새로 고침" }).click();
  await expect(dialog.locator("[aria-busy]")).toHaveCount(0);
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText("남는곳");
  await expect(page.getByRole("table", { name: "붙은 증빙" })).toHaveCount(0);
});

// ── 06.1-08 Task 3 — 문서 상태 × 자격 · 자기 떼기 ──────────────────────────────────────────────────────────

const LOCKED_IN_REVIEW = "결재 중 · 증빙은 경영관리";
const LOCKED_APPROVED = "승인됨 · 떼기는 증빙 무효 담당";
const LOCKED_COMPLETED = "완료 프로젝트 · 증빙은 경영관리";

// 결재 중(번호 있음) 문서 — 05 파일 한 장을 붙여 제출한다(도메인 경로). 화면 업로드를 거치지 않아 빠르다.
async function inReviewDocument(fx: ExpenseE2E): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.tracer.id], fields: { note: "행사 운영비" } });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  await attachEvidence(fx.pm.viewer, expenseId);
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("문서 없음");
  const submitted = await submitExpense(fx.pm.viewer, { expenseId, expectedVersion: row.version });
  if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
  return expenseId;
}

async function approvedDocument(fx: ExpenseE2E): Promise<string> {
  const expenseId = await inReviewDocument(fx);
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 문서를 읽지 못했다");
  let version = view.version;
  let status = "submitted";
  for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) {
    if (status === "approved") break;
    const result = await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: version });
    version = result.version;
    status = result.status;
  }
  if (status !== "approved") throw new Error(`결재 통과 안 됨: ${status}`);
  return expenseId;
}

const pickTrigger = (page: Page) => page.getByRole("button", { name: /^증빙 고르기/ });
const detachButton = (page: Page) => page.getByRole("button", { name: "떼기" });

test("결재 중 문서 × 네 자격 — 작성자 · 팀장은 `증빙 고르기` 0 · 경영관리(키 있음)는 열면 고른 행 0 · 키 없음은 0 + 잠김 한 줄 · `떼기` 0", async ({ page, browser, baseURL }) => {
  test.setTimeout(240_000);
  const fx = await setupExpenseE2E();
  const keyed = await createIntakeManager("키있음", { attach: true });
  const keyless = await createIntakeManager("키없음", { attach: false });
  if (!keyed.roleId || !keyless.roleId) throw new Error("계급 없음");
  const expenseId = await inReviewDocument(fx);
  await insertLinkFixture({ recordId: await insertRecordFixture(keyed, { nameOnDocument: "이미붙음" }), ownerId: expenseId, attachMode: "author", attachedBy: fx.pm.viewer.id });
  const candidate = await insertRecordFixture(keyed, { nameOnDocument: fx.vendorName });
  await setRecordVisibilityFixture(candidate, { visibility: "team", teamId: fx.teamId });

  const author = await loginPage(browser, baseURL, fx.pm);
  await author.goto(`/expenses/${expenseId}`);
  await expect(author.getByRole("table", { name: "붙은 증빙" })).toBeVisible();
  await expect(pickTrigger(author)).toHaveCount(0);
  await expect(detachButton(author)).toHaveCount(0);
  await expect(author.getByText(LOCKED_IN_REVIEW, { exact: true })).toHaveCount(1);
  await author.context().close();

  const lead = await loginPage(browser, baseURL, fx.lead);
  await lead.goto(`/expenses/${expenseId}`);
  await expect(lead.getByRole("table", { name: "붙은 증빙" })).toBeVisible();
  await expect(pickTrigger(lead)).toHaveCount(0);
  await lead.context().close();

  await loginAs(page, keyless.roleId);
  await page.goto(`/expenses/${expenseId}`);
  await expect(page.getByRole("table", { name: "붙은 증빙" })).toBeVisible();
  await expect(pickTrigger(page)).toHaveCount(0);
  await expect(page.getByText(LOCKED_IN_REVIEW, { exact: true })).toHaveCount(1);
  await expect(detachButton(page)).toHaveCount(0);

  const keyedPage = await browser.newPage({ baseURL });
  await loginAs(keyedPage, keyed.roleId);
  await keyedPage.goto(`/expenses/${expenseId}`);
  const trigger = keyedPage.getByRole("button", { name: /^증빙 고르기 \d+$/ });
  await waitForHydration(trigger);
  await expect(detachButton(keyedPage)).toHaveCount(0);
  await trigger.click();
  const dialog = keyedPage.getByRole("dialog", { name: "증빙 고르기" });
  await expect(dialog.locator("[aria-busy]")).toHaveCount(0);
  await expect(dialog.getByRole("option").first()).toBeVisible();
  await expect(dialog.getByRole("option", { selected: true })).toHaveCount(0);
  await keyedPage.context().close();
});

test("승인 문서 작성자 — 완료 아닌 프로젝트는 `증빙 고르기` 있음 · `떼기` 0 · `승인됨 · 떼기는 증빙 무효 담당` / 완료 프로젝트는 `증빙 고르기` 0 · `완료 프로젝트 · 증빙은 경영관리` 한 줄", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const fx = await setupExpenseE2E();
  const manager = await createIntakeManager();
  const expenseId = await approvedDocument(fx);
  await insertLinkFixture({ recordId: await insertRecordFixture(manager, { nameOnDocument: "이미붙음" }), ownerId: expenseId, attachMode: "author", attachedBy: fx.pm.viewer.id });
  const candidate = await insertRecordFixture(manager, { nameOnDocument: fx.vendorName });
  await setRecordVisibilityFixture(candidate, { visibility: "team", teamId: fx.teamId });

  const open = await loginPage(browser, baseURL, fx.pm);
  await open.goto(`/expenses/${expenseId}`);
  await expect(pickTrigger(open)).toHaveCount(1);
  await expect(detachButton(open)).toHaveCount(0);
  await expect(open.getByText(LOCKED_APPROVED, { exact: true })).toHaveCount(1);
  await open.context().close();

  await db.update(projects).set({ status: "completed" }).where(eq(projects.id, fx.projectId));
  const closed = await loginPage(browser, baseURL, fx.pm);
  await closed.goto(`/expenses/${expenseId}`);
  await expect(closed.getByRole("table", { name: "붙은 증빙" })).toBeVisible();
  await expect(pickTrigger(closed)).toHaveCount(0);
  await expect(closed.getByText(LOCKED_COMPLETED, { exact: true })).toHaveCount(1);
  await closed.context().close();
});

test("작성자 자기 떼기 — 고른 증빙 읽기 행 `떼기` → 사유 비면 1차 막힘 → 사유 적고 떼면 그 행이 사라지고 `증빙 고르기 1`이 다시 선다", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const fx = await setupExpenseE2E();
  const manager = await createIntakeManager();
  const recordId = await insertRecordFixture(manager, { nameOnDocument: fx.vendorName });
  await setRecordVisibilityFixture(recordId, { visibility: "team", teamId: fx.teamId });
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.tracer.id], fields: { note: "행사 운영비" } });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");

  const page = await loginPage(browser, baseURL, fx.pm);
  await page.goto(`/expenses/${expenseId}`);
  const trigger = page.getByRole("button", { name: "증빙 고르기 1" });
  await waitForHydration(trigger);
  await trigger.click();
  const picker = page.getByRole("dialog", { name: "증빙 고르기" });
  await expect(picker.locator("[aria-busy]")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(picker).toBeHidden();

  const rows = page.getByRole("table", { name: "붙은 증빙" }).locator("tbody tr:visible");
  await expect(rows).toHaveCount(1);
  const detach = detachButton(page);
  await waitForHydration(detach);
  await detach.click();
  const dialog = page.getByRole("dialog", { name: "증빙 떼기" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("사유 없음 · 사유 적기");
  const confirm = dialog.getByRole("button", { name: /^증빙 떼기/ });
  await expect(confirm).toHaveAttribute("aria-disabled", "true");
  await dialog.getByLabel("사유").fill("잘못 고름");
  await confirm.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("table", { name: "붙은 증빙" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "증빙 고르기 1" })).toBeVisible();
  await page.context().close();
});

test("PR-C D-2 작성자 자기 떼기 2건 — 첫 떼기 뒤 포커스는 남은 행 `떼기` · 마지막 떼기 뒤 다시 선 `증빙 고르기 2`", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const fx = await setupExpenseE2E();
  const manager = await createIntakeManager();
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.tracer.id], fields: { note: "행사 운영비" } });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  for (const name of ["앞뗄곳", "뒤뗄곳"]) {
    const recordId = await insertRecordFixture(manager, { nameOnDocument: name });
    await setRecordVisibilityFixture(recordId, { visibility: "team", teamId: fx.teamId });
    await insertLinkFixture({ recordId, ownerId: expenseId, attachMode: "author", attachedBy: fx.pm.viewer.id });
  }

  const page = await loginPage(browser, baseURL, fx.pm);
  await page.goto(`/expenses/${expenseId}`);
  const rows = page.getByRole("table", { name: "붙은 증빙" }).locator("tbody tr:visible");
  await expect(rows).toHaveCount(2);
  async function detachFirst(): Promise<void> {
    const detach = detachButton(page).first();
    await waitForHydration(detach);
    await detach.click();
    const dialog = page.getByRole("dialog", { name: "증빙 떼기" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("사유").fill("잘못 고름");
    await dialog.getByRole("button", { name: /^증빙 떼기/ }).click();
    await expect(dialog).toHaveCount(0);
  }
  await detachFirst();
  await expect(rows).toHaveCount(1);
  await expect(detachButton(page)).toBeFocused();
  await detachFirst();
  await expect(page.getByRole("table", { name: "붙은 증빙" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "증빙 고르기 2" })).toBeFocused();
  await page.context().close();
});

// ── 06.1-08 Task 3 — 구매 요청 목록의 `증빙 고르기` (PA-PRLINE · PA-PRSHEET · 카드 G1) ────────────────────────

async function purchaseAuthor(candidateName: string): Promise<{ person: Person; teamId: string }> {
  const suffix = randomUUID().slice(0, 8);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E증빙본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E증빙팀-${suffix}` });
  const person = await makePerson("증빙요청", DEFAULT_ROLE_ID, team.id, `${seoulToday().slice(0, 4)}-01-01`);
  const manager = await createIntakeManager();
  const recordId = await insertRecordFixture(manager, { nameOnDocument: candidateName, supplyKrw: 110_000 });
  await setRecordVisibilityFixture(recordId, { visibility: "team", teamId: team.id });
  return { person, teamId: team.id };
}

async function ownRequest(requestedBy: string, itemName: string, status: "requested" | "purchased"): Promise<string> {
  const number = `TCEV${randomUUID().slice(0, 6)}`;
  await db.insert(purchaseRequests).values({
    number,
    linkKind: "team_cost",
    requestedBy,
    itemName,
    estimateAmountKrw: 33_000,
    ...(status === "purchased" ? { status: "purchased", completedBy: requestedBy, completedAt: new Date() } : {}),
  });
  return number;
}

test("구매 요청 목록(PC) — 내 `신청됨` 행의 `증빙 고르기 1` → Enter → 그 행 트리거 사라지고 품목 칸 2행 `증빙 {거래처} · {합계}`", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const author = await purchaseAuthor("행증빙상회");
  const number = await ownRequest(author.person.viewer.id, "PC 증빙 물건", "requested");
  const page = await loginPage(browser, baseURL, author.person);
  await page.goto("/cards/purchases");
  const row = page.getByRole("row").filter({ hasText: number });
  const trigger = row.getByRole("button", { name: `${number} 증빙 고르기 1` });
  await waitForHydration(trigger);
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "증빙 고르기" });
  await expect(dialog.locator("[aria-busy]")).toHaveCount(0);
  await expect(dialog.getByRole("option", { selected: true })).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(row.getByRole("button", { name: /증빙 고르기/ })).toHaveCount(0);
  await expect(row).toContainText("증빙 행증빙상회 · 110,000");
  // D-2: 붙인 뒤 포커스는 body로 빠지지 않는다 — 보이는 행 행동(`요청 취소`).
  await expect(row.getByRole("button", { name: `${number} 요청 취소` })).toBeFocused();
  await page.context().close();
});

test("구매 요청 목록(폰 375) — 구매 완료 미배정 내 행은 시트에 `증빙 고르기 1` 한 줄 · `신청됨` 내 행은 위 `증빙 고르기 1` · 아래 `요청 취소` 두 줄(각 높이 ≥ 44)", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const author = await purchaseAuthor("시트증빙상회");
  const doneNumber = await ownRequest(author.person.viewer.id, "시트 완료 물건", "purchased");
  const openNumber = await ownRequest(author.person.viewer.id, "시트 신청 물건", "requested");
  const page = await loginPage(browser, baseURL, author.person, { width: 375, height: 700 });
  await page.goto("/cards/purchases?status=전체");

  const tapDone = page.getByRole("button", { name: `${doneNumber} 상세 보기` });
  await waitForHydration(tapDone);
  await tapDone.click();
  const doneSheet = page.getByRole("dialog", { name: "시트 완료 물건" });
  await expect(doneSheet).toBeVisible();
  await expect(doneSheet.getByRole("button", { name: "증빙 고르기 1" })).toHaveCount(1);
  await expect(doneSheet.getByRole("button", { name: /요청 취소/ })).toHaveCount(0);
  await doneSheet.getByRole("button", { name: "닫기" }).click();
  await expect(doneSheet).toBeHidden();

  // PR-C ISSUE-003 — 시트를 겹치지 않는다(§7-8): 고르기를 열면 읽기 시트는 닫히고, 고르기를 닫으면 읽기 시트가 다시 서고 포커스는 그 `증빙 고르기 1`.
  await tapDone.click();
  await expect(doneSheet).toBeVisible();
  await doneSheet.getByRole("button", { name: "증빙 고르기 1" }).click();
  const picker = page.getByRole("dialog", { name: "증빙 고르기" });
  await expect(picker).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  await expect(picker.locator("[aria-busy]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  await expect(doneSheet).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  await expect(doneSheet.getByRole("button", { name: "증빙 고르기 1" })).toBeFocused();
  await doneSheet.getByRole("button", { name: "닫기" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(tapDone).toBeFocused();

  const tapOpen = page.getByRole("button", { name: `${openNumber} 상세 보기` });
  await tapOpen.click();
  const openSheet = page.getByRole("dialog", { name: "시트 신청 물건" });
  await expect(openSheet).toBeVisible();
  const pick = openSheet.getByRole("button", { name: "증빙 고르기 1" });
  const cancel = openSheet.getByRole("button", { name: `${openNumber} 요청 취소` });
  const pickBox = await pick.boundingBox();
  const cancelBox = await cancel.boundingBox();
  expect(pickBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(cancelBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(pickBox?.y ?? Number.MAX_SAFE_INTEGER).toBeLessThan(cancelBox?.y ?? 0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.context().close();
});
