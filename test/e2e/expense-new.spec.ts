import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses } from "@/db/schema";
import { createExpenseFromLines, getExpense } from "@/domain/expenses";
import { getCurrentQuoteRevision } from "@/domain/quotes/lines";
import { createRevisionFromCurrent, setCustomerApproval } from "@/domain/quotes/revisions";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { approvalBasis } from "@/repositories/quote-revisions";
import { insertVendor } from "@/repositories/vendors";
import { normalizeVendorName } from "@/domain/vendors";
import { seoulToday } from "@/lib/dates";
import { delayServerActions, loginPage, waitForHydration } from "./leave-org";
import { addDays } from "./pay-schedule-e2e";
import { addPayeeCandidates, addPayeeEmployee, setupExpenseE2E, submitLineExpense, uniqueReceipt, type ExpenseE2E, type LineKey } from "./expense-fixture";

// 05-07(EXP-08 · UX-06 · UI-SPEC S3 두 입구 · S14 골라내기): `/expenses/new` 팀 비용 지출결의 — 종류 · 사용일 · 팀 · 내용 → 거래처 고르기 →
// 첫 저장(주소 교체) → 증빙 → 제출 `T26-` 번호 → 결재선 승인 → 문서 화면 `프로젝트 미연결 · 팀 관리비`. 판정은 DOM 실측(포커스 · 값 · 글자)이다.

const UPLOAD_WAIT = 20_000;
const META = /^\d+KB · \d{2}-\d{2}$/;

async function openDraft(page: Page, fx: ExpenseE2E, key: LineKey): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  await page.goto(`/expenses/${expenseId}`);
  await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
  return expenseId;
}

// 07-16 D-714 · SC-02: 기안자는 지급 예정일 칸이 없다 — 희망 지급일 · 희망 사유 한 쌍만 저장되고, 예정일은 읽기 줄(자동값)로 보인다.
const HOPE_DATE = addDays(seoulToday(), 7);
const HOPE_REASON = "행사 전 선금";

async function fillHope(page: Page): Promise<void> {
  await page.getByLabel("희망 지급일").fill(HOPE_DATE);
  await page.getByLabel("희망 사유").fill(HOPE_REASON);
}

async function expectAutoPayDate(page: Page, fx: ExpenseE2E): Promise<void> {
  const expenseId = page.url().split("/").at(-1) ?? "";
  const [row] = await db
    .select({ date: expenses.scheduledPaymentDate, hope: expenses.requestedPaymentDate, reason: expenses.requestedPaymentReason })
    .from(expenses)
    .where(eq(expenses.id, expenseId));
  expect(row).toEqual({ date: null, hope: HOPE_DATE, reason: HOPE_REASON });
  const effective = (await getExpense(fx.pm.viewer, { expenseId }))?.scheduledPaymentDate;
  expect(effective).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByLabel("지급 예정일", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("expense-schedule-value")).toHaveText(`${(effective ?? "").slice(5)} (자동)`);
  await expect(page.getByLabel("희망 지급일")).toHaveValue(HOPE_DATE);
  await expect(page.getByLabel("희망 사유")).toHaveValue(HOPE_REASON);
}

async function openNew(page: Page): Promise<void> {
  await page.goto("/expenses/new");
  await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
}

// 지급처 골라내기를 열어 이름으로 찾아 첫 행을 Enter로 고른다(키보드만).
async function pickVendorByKeyboard(page: Page, fx: ExpenseE2E): Promise<void> {
  await page.getByRole("button", { name: "지급처 고르기" }).click();
  const dialog = page.getByRole("dialog", { name: "지급처 고르기" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "지급처 이름 검색" })).toBeFocused();
  await dialog.getByRole("textbox", { name: "지급처 이름 검색" }).fill(fx.vendorName);
  const option = dialog.getByRole("option", { name: new RegExp(fx.vendorName) });
  // 검색이 좁혀진 목록이 올 때까지(이름이 겹치지 않아 한 행) — 지난 목록에서 ↓를 누르면 행이 바뀌며 포커스가 검색 칸으로 돌아간다.
  await expect(dialog.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await expect(option).toBeFocused();
  await expect(option).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
}

test.describe("팀 비용 지출결의 (EXP-08)", () => {
  test("PM이 종류 · 내용 · 거래처 · 공급가액을 채워 첫 저장하고 증빙을 올려 제출하면 T26 번호이고 결재선이 승인하면 문서 화면에 프로젝트 미연결 · 팀 관리비", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openNew(page);

    // 첫 저장 전 첫 포커스 = 맨 위 3차 `견적 줄 고르기`(R6-06).
    await expect(page.getByRole("button", { name: "견적 줄 고르기" })).toBeFocused();

    // 알 수 있는 값은 채워 열린다 — 종류만 사용자의 결정(`—`), 사용일 = 서울 오늘, 팀 = 내 소속.
    const kind = page.getByLabel("종류", { exact: true });
    await expect(kind).toHaveValue("");
    await expect(kind.locator("option:checked")).toHaveText("—");
    await expect(page.getByLabel("사용일")).toHaveValue(seoulToday());
    const teamName = (await page.getByTestId("expense-team").textContent()) ?? "";
    expect(teamName).toMatch(/^E2E결재팀-/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`지출결의 — ${teamName}`);

    await kind.selectOption("team_overhead");
    await page.getByLabel("내용", { exact: true }).fill("팀 회식");

    // 거래처 고르기 → 증빙 종류가 그 거래처 기본값.
    await pickVendorByKeyboard(page, fx);
    await expect(page.getByTestId("expense-vendor")).toHaveText(fx.vendorName);
    await expect(page.getByLabel("증빙 종류")).toHaveValue("tax_invoice");
    await expect(page.getByRole("button", { name: "지급처 바꾸기", exact: true })).toBeVisible();

    await page.getByLabel("공급가액").fill("440000");
    await page.getByLabel("지급 방식").selectOption("bank_transfer");
    await page.getByLabel("상세", { exact: true }).fill("팀 회식 상세");

    // 임시 저장 = 첫 저장 — 주소가 `/expenses/{uuid}`로 바뀐다(두 번 눌러도 하나).
    const save = page.getByRole("button", { name: /^임시 저장/ });
    await save.click();
    await save.click({ force: true });
    await expect(page).toHaveURL(/\/expenses\/[0-9a-f-]{36}$/);
    const expenseId = page.url().split("/").at(-1) ?? "";
    await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
    // 첫 저장 뒤 첫 포커스 = 막힘 이유가 가리키는 칸(증빙 없음 → 첨부 영역).
    await expect(page.locator("#evidence-picker")).toBeFocused();
    await expect(page.getByTestId("expense-team")).toHaveText(teamName);
    await expect(page.getByLabel("공급가액")).toHaveValue("440,000");

    await page.getByTestId("attachments-input").setInputFiles(await uniqueReceipt(page));
    await expect(page.locator('[data-ui="attachments"] li').getByText(META)).toBeVisible({ timeout: UPLOAD_WAIT });
    const submit = page.getByRole("button", { name: /^지출결의 제출/ });
    await expect(submit).not.toHaveAttribute("aria-disabled", "true");
    await submit.focus();
    await page.keyboard.press("Control+Enter");
    await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}\\?submitted=1$`));
    const yy = seoulToday().slice(2, 4);
    await expect(page.locator('[data-ui="screen-meta"]')).toHaveText(new RegExp(`^T${yy}-\\d{4}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`지출결의 — ${teamName} · 팀 회식`);

    // 결재선(팀장 → 본부장 → 경영 → 대표) — 각자 문서 화면 `승인`. 대표 뒤 태그 `승인`.
    let last: Page | null = null;
    for (const person of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) {
      const approver = await loginPage(browser, baseURL, person);
      last = approver;
      await approver.goto(`/expenses/${expenseId}`);
      const approve = approver.getByRole("button", { name: /^승인/ });
      await waitForHydration(approve);
      await approve.click();
      await expect(approver.getByRole("button", { name: /^승인/ })).toHaveCount(0);
    }
    if (!last) throw new Error("대표 화면이 없다");
    const head = last.locator('[data-ui="screen-title"]').locator("..");
    await expect(head.getByText("승인", { exact: true })).toBeVisible();
    await expect(last.getByText("프로젝트 미연결 · 팀 관리비")).toBeVisible();
    await expect(last.locator("dt", { hasText: /^프로젝트$/ })).toHaveCount(1);
  });

  test("종류와 내용이 비면 첫 저장 뒤 막힘 이유 `종류, 내용 2칸 비어 있음`이고 사용일을 소속 없는 날로 바꾸면 사용일 칸 오류", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openNew(page);
    // 소속 없는 날(발령 1월 1일 이전) — 새 문서도 팀 텍스트가 미리보기로 다시 온다.
    await page.getByLabel("사용일").fill("2000-01-01");
    await expect(page.getByText("사용일에 소속 팀 없음 · 사용일 고치기")).toBeVisible();
    await expect(page.getByTestId("expense-team")).toHaveText("—");
    await page.getByLabel("사용일").fill(seoulToday());
    await expect(page.getByText("사용일에 소속 팀 없음 · 사용일 고치기")).toHaveCount(0);
    await expect(page.getByTestId("expense-team")).toHaveText(/^E2E결재팀-/);

    await pickVendorByKeyboard(page, fx);
    await page.getByLabel("공급가액").fill("440000");
    await page.getByLabel("지급 방식").selectOption("bank_transfer");
    await page.getByLabel("상세", { exact: true }).fill("팀 회식 상세");
    await page.getByRole("button", { name: /^임시 저장/ }).click();
    await expect(page).toHaveURL(/\/expenses\/[0-9a-f-]{36}$/);
    await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
    // ⑥ 묶음 — 종류 · 내용 두 칸. 첫 포커스는 가리킨 칸(종류), 다음 한 수 3차는 그 칸으로 포커스.
    await expect(page.getByText(/^종류, 내용 2칸 비어 있음 · /)).toBeVisible();
    await expect(page.getByLabel("종류", { exact: true })).toBeFocused();
    await page.getByLabel("공급가액").focus();
    await page.getByRole("button", { name: "종류 고르기" }).click();
    await expect(page.getByLabel("종류", { exact: true })).toBeFocused();
  });

  // 06.2-09(S5 · D-6216 · D-6224): 새 문서(문서 팀 없음)의 결재선 1단은 `행사 담당 팀장` 단계 이름만 — 앞에 사람 이름이 없다.
  test("새 문서 결재선 한 줄은 행사 담당 팀장 단계 이름만이고 그 앞에 사람 이름이 없다 (06.2 S5)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openNew(page);
    const line = page.getByTestId("approval-route-line");
    await expect(line).toContainText("행사 담당 팀장");
    await expect(line).toHaveText(/→ 행사 담당 팀장 →/);
    await expect(line).not.toContainText(fx.lead.name);
  });

  // 06.2-09(S5 · D-6215): 첫 저장 뒤 작성 중 문서는 문서 팀(팀 비용 = 귀속 팀)의 팀장 이름까지 그린다.
  test("첫 저장해 작성 중 문서가 되면 결재선 한 줄이 {귀속 팀 팀장 이름} 행사 담당 팀장 (06.2 S5)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openNew(page);
    await page.getByRole("button", { name: /^임시 저장/ }).click();
    await expect(page).toHaveURL(/\/expenses\/[0-9a-f-]{36}$/);
    await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
    await expect(page.getByTestId("approval-route-line")).toContainText(`${fx.lead.name} 행사 담당 팀장`);
  });
});

test.describe("골라내기 (S14) · 지급처", () => {
  test("Esc는 닫고 트리거로 돌아가며 검색 0건은 `조건에 맞는 지급처가 없습니다 · 검색 지우기`, 조회 실패는 `목록 불러오기 실패 · 다시 시도`", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openNew(page);

    const trigger = page.getByRole("button", { name: "지급처 고르기" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "지급처 고르기" });
    const search = dialog.getByRole("textbox", { name: "지급처 이름 검색" });
    await expect(search).toBeFocused();
    // 주 버튼은 고른 행이 있어야 켜진다(꺼진 동안 aria-disabled, 이유는 목록).
    const primary = dialog.getByRole("button", { name: /^이 지급처로/ });
    await expect(primary).toHaveAttribute("aria-disabled", "true");
    // UX-06 — 꺼진 1차는 이유 한 줄을 aria-describedby로 가리킨다(05 /review B1).
    await expect(primary).toHaveAccessibleDescription("고른 지급처 없음");

    await search.fill("없는거래처-zzzz");
    await expect(dialog.getByText("조건에 맞는 지급처가 없습니다 ·")).toBeVisible();
    await dialog.getByRole("button", { name: "검색 지우기" }).click();
    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    // 조회 실패 — 요청 가로채기(500) → 실패 줄 · 검색 칸은 살아 있다 → 다시 시도로 복구.
    await page.route("**/*", async (route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) await route.fulfill({ status: 500, body: "" });
      else await route.continue();
    });
    await trigger.click();
    await expect(dialog.getByText("목록 불러오기 실패 ·")).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "지급처 이름 검색" })).toBeEnabled();
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await dialog.getByRole("button", { name: "다시 시도" }).click();
    await expect(dialog.getByRole("option").first()).toBeVisible();
    await expect(dialog.getByText("목록 불러오기 실패")).toHaveCount(0);
  });

  test("저장된 팀 비용 문서의 `바꾸기`는 서버가 거래처와 증빙 종류를 바꾸고 막힘 ⑤의 다음 한 수 `지급처 고르기`가 같은 골라내기를 연다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openNew(page);
    await page.getByLabel("종류", { exact: true }).selectOption("lost_bid");
    await page.getByLabel("내용", { exact: true }).fill("시안 제작");
    await page.getByRole("button", { name: /^임시 저장/ }).click();
    await expect(page).toHaveURL(/\/expenses\/[0-9a-f-]{36}$/);
    await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));

    // 지급처가 비어 있어 막힘 이유가 ⑤ `지급처 없음 · 지급처 고르기` — 그 다음 한 수 3차가 골라내기를 연다.
    await delayServerActions(page, 100);
    await expect(page.getByText(/^지급처 없음 · /)).toBeVisible();
    await page.locator("#expense-next-step").click();
    const dialog = page.getByRole("dialog", { name: "지급처 고르기" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("textbox", { name: "지급처 이름 검색" }).fill(fx.vendorName);
    await dialog.getByRole("option", { name: new RegExp(fx.vendorName) }).click();
    await expect(dialog.getByText("증빙 종류 → 세금계산서")).toBeVisible();
    await dialog.getByRole("button", { name: /^이 지급처로/ }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("expense-vendor")).toHaveText(fx.vendorName);
    await expect(page.getByLabel("증빙 종류")).toHaveValue("tax_invoice");
    await expect(page.getByText(/^지급처 없음 · /)).toHaveCount(0);

    // 새로 열어도 저장돼 있다(서버 값).
    await page.reload();
    await expect(page.getByTestId("expense-vendor")).toHaveText(fx.vendorName);
    await expect(page.getByRole("button", { name: "지급처 바꾸기", exact: true })).toBeVisible();
  });
});

test.describe("골라내기 (S14) · 견적 줄", () => {
  test("바꾸기 — 첫 포커스 검색 칸 · ↓ 첫 행 · 고를 수 없는 행 Enter 무반응(이유 글자) · 열린 행 Enter → 폼이 그 줄 값 · 트리거로 포커스 복귀", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    await submitLineExpense(browser, baseURL, fx, "closed");
    const page = await loginPage(browser, baseURL, fx.pm);
    await openDraft(page, fx, "tracer");

    const trigger = page.getByRole("button", { name: "바꾸기", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "견적 줄 바꾸기" });
    const search = dialog.getByRole("textbox", { name: "견적 줄 검색" });
    await expect(search).toBeFocused();
    await expect(dialog.getByText(/ · 견적 줄 7 · 고를 수 있는 줄 \d+$/)).toBeVisible();
    // ↓ → 첫 행(현재 줄) aria-selected.
    await page.keyboard.press("ArrowDown");
    const rows = dialog.getByRole("option");
    await expect(rows.first()).toBeFocused();
    await expect(rows.first()).toHaveAttribute("aria-selected", "true");

    // 고를 수 없는 행 — 거래처 없음 · 문 닫힘(번호 · 상태 · 금액). Enter는 아무 일 없다.
    const noVendor = dialog.getByRole("option", { name: new RegExp(fx.lines.noVendor.itemName) });
    await expect(noVendor).toHaveAttribute("aria-disabled", "true");
    await expect(noVendor).toContainText("거래처 없음");
    const closed = dialog.getByRole("option", { name: new RegExp(fx.lines.closed.itemName) });
    await expect(closed).toHaveAttribute("aria-disabled", "true");
    await expect(closed).toContainText(/지출결의 \S+-\d{4} 결재 중 · 12,400,000/);
    const primary = dialog.getByRole("button", { name: /^이 줄로/ });
    await noVendor.click({ force: true });
    await expect(noVendor).toBeFocused();
    await expect(noVendor).toHaveAttribute("aria-selected", "false");
    await expect(primary).toHaveAttribute("aria-disabled", "true");
    await expect(primary).toHaveAccessibleDescription("고른 줄 없음");
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();

    // 열린 행 Enter → 폼 값이 그 줄 · 트리거로 포커스 복귀.
    const phone = dialog.getByRole("option", { name: new RegExp(fx.lines.phone.itemName) });
    await phone.click();
    await expect(primary).not.toHaveAttribute("aria-disabled", "true");
    await expect(dialog.getByText("지급처 · 증빙 종류 · 공급가액이 그 줄 값으로 바뀜")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`지출결의 — ${fx.projectName} · ${fx.lines.phone.itemName}`);
    await expect(page.getByLabel("공급가액")).toHaveValue("12,400,000");
    await expect(page.getByTestId("expense-vendor")).toHaveText(fx.vendorName);
    await expect(page.getByRole("button", { name: "바꾸기", exact: true })).toBeFocused();
  });

  test("/expenses/new — 담당 프로젝트가 없으면 `담당 프로젝트 줄이 없습니다 · 검색으로 찾기`, 검색 0건 · 조회 실패도 검색 칸이 살아 있다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.mgmt);
    await openNew(page);
    await page.getByRole("button", { name: "견적 줄 고르기" }).click();
    const dialog = page.getByRole("dialog", { name: "견적 줄 고르기" });
    const search = dialog.getByRole("textbox", { name: "견적 줄 검색" });
    await expect(search).toBeFocused();
    await expect(dialog.getByText("담당 프로젝트 줄이 없습니다 ·")).toBeVisible();
    await search.blur();
    await dialog.getByRole("button", { name: "검색으로 찾기" }).click();
    await expect(search).toBeFocused();

    await search.fill("존재하지않는줄-zzzz");
    await expect(dialog.getByText("조건에 맞는 줄이 없습니다 ·")).toBeVisible();
    await dialog.getByRole("button", { name: "검색 지우기" }).click();
    await expect(search).toHaveValue("");

    await page.route("**/*", async (route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) await route.fulfill({ status: 500, body: "" });
      else await route.continue();
    });
    await search.fill("무대");
    await expect(dialog.getByText("목록 불러오기 실패 ·")).toBeVisible();
    await expect(search).toBeEnabled();
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await dialog.getByRole("button", { name: "다시 시도" }).click();
    await expect(dialog.getByText("목록 불러오기 실패")).toHaveCount(0);
  });

  test("/expenses/new에서 줄을 고르면 그 줄의 지출결의로 열리고 팀 비용 칸은 사라진다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openNew(page);
    await page.getByLabel("종류", { exact: true }).selectOption("team_overhead");
    await page.getByLabel("내용", { exact: true }).fill("버려질 값");
    await page.getByRole("button", { name: "견적 줄 고르기" }).click();
    const dialog = page.getByRole("dialog", { name: "견적 줄 고르기" });
    await expect(dialog.getByText(new RegExp(fx.projectName))).toBeVisible();
    await dialog.getByRole("textbox", { name: "견적 줄 검색" }).fill(fx.lines.hold.itemName);
    const row = dialog.getByRole("option", { name: new RegExp(fx.lines.hold.itemName) });
    await expect(dialog.getByRole("option")).toHaveCount(1);
    await row.click();
    await expect(dialog.getByText("· 팀 비용 칸 지워짐")).toBeVisible();
    await dialog.getByRole("button", { name: /^이 줄로/ }).click();
    await expect(page).toHaveURL(/\/expenses\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`지출결의 — ${fx.projectName} · ${fx.lines.hold.itemName}`);
    await expect(page.getByLabel("종류", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("공급가액")).toHaveValue("12,400,000");
  });

  test("웨이브 9 D1 — 저장된 문서에서 줄을 바꾸면 저장 안 한 비고가 먼저 저장돼 남는다 · 희망 지급일 · 사유도 남고 지급 예정일은 자동값 읽기 줄(07-01 D-714 · 07-16 SC-02)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openDraft(page, fx, "tracer");
    await page.getByLabel("상세", { exact: true }).fill("웨이브9 저장 안 한 메모");
    await fillHope(page);
    await page.getByRole("button", { name: "바꾸기", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "견적 줄 바꾸기" });
    await dialog.getByRole("option", { name: new RegExp(fx.lines.phone.itemName) }).click();
    await dialog.getByRole("button", { name: /^이 줄로/ }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`지출결의 — ${fx.projectName} · ${fx.lines.phone.itemName}`);
    await expect(page.getByLabel("상세", { exact: true })).toHaveValue("웨이브9 저장 안 한 메모");
    await expectAutoPayDate(page, fx);
  });

  test("05-16 — /expenses/new에서 비고 · 희망 지급일 · 사유를 적고 줄을 고르면 지워짐 글자 없이 만들어진 문서에 남고, 지급 예정일은 자동값 읽기 줄로 보인다(07-01 D-714 · 07-06 D-704 · 07-16 SC-02)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openNew(page);
    await page.getByLabel("상세", { exact: true }).fill("새 문서 메모");
    await fillHope(page);
    await page.getByRole("button", { name: "견적 줄 고르기" }).click();
    const dialog = page.getByRole("dialog", { name: "견적 줄 고르기" });
    await dialog.getByRole("textbox", { name: "견적 줄 검색" }).fill(fx.lines.hold.itemName);
    await expect(dialog.getByRole("option")).toHaveCount(1);
    await dialog.getByRole("option", { name: new RegExp(fx.lines.hold.itemName) }).click();
    await expect(dialog.getByText(/지워짐/)).toHaveCount(0);
    await dialog.getByRole("button", { name: /^이 줄로/ }).click();
    await expect(page).toHaveURL(/\/expenses\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`지출결의 — ${fx.projectName} · ${fx.lines.hold.itemName}`);
    await expect(page.getByLabel("상세", { exact: true })).toHaveValue("새 문서 메모");
    await expectAutoPayDate(page, fx);
  });

  test("웨이브 9 D2 · D3 · D5 — 1차 버튼 설명은 결과 줄 · 검색 칸은 거르는 동안 제자리 · 부제 `프로젝트 N · 고를 수 있는 줄 M` · `지급처 N`", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openNew(page);
    await page.getByRole("button", { name: "견적 줄 고르기" }).click();
    const dialog = page.getByRole("dialog", { name: "견적 줄 고르기" });
    const search = dialog.getByRole("textbox", { name: "견적 줄 검색" });
    await expect(dialog.getByText(/^프로젝트 \d+ · 고를 수 있는 줄 \d+$/)).toBeVisible();
    const before = await search.boundingBox();
    await search.fill(fx.lines.hold.itemName);
    await expect(dialog.getByRole("option")).toHaveCount(1);
    expect((await search.boundingBox())?.y).toBeCloseTo(before?.y ?? -1, 0);
    await page.keyboard.press("ArrowDown");
    expect((await search.boundingBox())?.y).toBeCloseTo(before?.y ?? -1, 0);
    const primary = dialog.getByRole("button", { name: /^이 줄로/ });
    await expect(primary).toHaveAttribute("aria-describedby", /.+/);
    const describedBy = (await primary.getAttribute("aria-describedby")) ?? "";
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(/그 줄 값으로 채워짐/);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "지급처 고르기" }).click();
    const vendors = page.getByRole("dialog", { name: "지급처 고르기" });
    await expect(vendors.getByText(/^지급처 \d+$/)).toBeVisible();
  });

  test("막힘 ③(작성 중에 새 차수가 생긴 문서)의 다음 한 수 `견적 줄 바꾸기`가 골라내기를 연다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    const expenseId = await openDraft(page, fx, "retry");
    const current = await getCurrentQuoteRevision(SYSTEM_VIEWER, fx.projectId);
    if (!current) throw new Error("현재 차수가 없다");
    const second = await createRevisionFromCurrent(fx.pm.viewer, { projectId: fx.projectId, fromRevisionId: current.id });
    const basis = await approvalBasis(SYSTEM_VIEWER, second.revisionId);
    await setCustomerApproval(fx.pm.viewer, second.revisionId, { approvalBasis: "verbal", approvedOn: seoulToday(), seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken });

    await page.goto(`/expenses/${expenseId}`);
    await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
    await expect(page.getByText(/^견적 줄이 현재 차수에 없음 · /)).toBeVisible();
    await page.locator("#expense-next-step").click();
    const dialog = page.getByRole("dialog", { name: "견적 줄 바꾸기" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("option", { name: new RegExp(fx.lines.retry.itemName) })).toBeVisible();
  });
});

// 06.5 V12(D-6517 · 결정 맥락 16 · R-1 · R-8): 지급처 = 거래처 또는 직원 — 고르기 대화상자 하나 · 목록 하나 · 폼 상태 하나.
test.describe("지급처 고르기 — 직원 지급처 (06.5 V12)", () => {
  async function payeeDialog(page: Page, open: string, title: string, query: string) {
    await page.getByRole("button", { name: open, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: title });
    await dialog.getByRole("textbox", { name: "지급처 이름 검색" }).fill(query);
    return dialog;
  }

  test("새 팀 비용 문서에서 직원을 고르고 첫 저장하면 폼 · 목록 지급처 칸에 직원 이름 (EP1-9)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const tag = `지급${randomUUID().slice(0, 6)}`;
    const employee = await addPayeeEmployee(fx, `${tag}김`);
    await insertVendor(SYSTEM_VIEWER, { name: `${tag}거래처`, normalizedName: normalizeVendorName(`${tag}거래처`), defaultEvidenceType: "tax_invoice" });
    const page = await loginPage(browser, baseURL, fx.pm);
    await openNew(page);
    await page.getByLabel("종류", { exact: true }).selectOption("team_overhead");
    await page.getByLabel("내용", { exact: true }).fill("직원 정산");

    const dialog = await payeeDialog(page, "지급처 고르기", "지급처 고르기", tag);
    await expect(dialog.getByRole("option")).toHaveCount(2);
    await expect(dialog.getByText("지급처 2", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("option", { name: new RegExp(`${tag}거래처`) })).toContainText("기본 증빙 세금계산서");
    const person = dialog.getByRole("option", { name: new RegExp(employee.name) });
    await expect(person).toContainText(`직원 · ${fx.teamName}`);
    await person.click();
    await dialog.getByRole("button", { name: /^이 지급처로/ }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("expense-vendor")).toHaveText(employee.name);
    await expect(page.getByText(`직원 · ${fx.teamName}`, { exact: true })).toBeVisible();
    // 직원은 증빙 종류를 건드리지 않는다.
    await expect(page.getByLabel("증빙 종류")).toHaveValue("");

    await page.getByRole("button", { name: /^임시 저장/ }).click();
    await expect(page).toHaveURL(/\/expenses\/[0-9a-f-]{36}$/);
    await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
    await expect(page.getByTestId("expense-vendor")).toHaveText(employee.name);
    await expect(page.getByText(`직원 · ${fx.teamName}`, { exact: true })).toBeVisible();

    await page.goto("/expenses");
    // 지급처 칸(.vendorCell)이 첫째 — 둘째는 같은 행의 좁은 폭 요약 조각이다.
    await expect(page.locator("main table").getByText(employee.name, { exact: true }).first()).toBeVisible();
  });

  test("저장된 문서에서 거래처 → 직원 → 거래처로 바꾸면 칸에 매번 그 이름 하나 · 직원은 증빙 종류를 두고 거래처는 결과 줄 (EP2-B7)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const tag = `바꿈${randomUUID().slice(0, 6)}`;
    const employee = await addPayeeEmployee(fx, `${tag}박`);
    const page = await loginPage(browser, baseURL, fx.pm);
    await openNew(page);
    await page.getByLabel("종류", { exact: true }).selectOption("lost_bid");
    await page.getByLabel("내용", { exact: true }).fill("시안 제작");
    await pickVendorByKeyboard(page, fx);
    await page.getByRole("button", { name: /^임시 저장/ }).click();
    await expect(page).toHaveURL(/\/expenses\/[0-9a-f-]{36}$/);
    await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
    await expect(page.getByTestId("expense-vendor")).toHaveText(fx.vendorName);
    await expect(page.getByLabel("증빙 종류")).toHaveValue("tax_invoice");

    let dialog = await payeeDialog(page, "지급처 바꾸기", "지급처 바꾸기", employee.name);
    await dialog.getByRole("option", { name: new RegExp(employee.name) }).click();
    await expect(dialog.getByText(/^증빙 종류 → /)).toHaveCount(0);
    await dialog.getByRole("button", { name: /^이 지급처로/ }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("expense-vendor")).toHaveText(employee.name);
    await expect(page.getByLabel("증빙 종류")).toHaveValue("tax_invoice");

    dialog = await payeeDialog(page, "지급처 바꾸기", "지급처 바꾸기", fx.vendorName);
    await dialog.getByRole("option", { name: new RegExp(fx.vendorName) }).click();
    await expect(dialog.getByText("증빙 종류 → 세금계산서")).toBeVisible();
    await dialog.getByRole("button", { name: /^이 지급처로/ }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("expense-vendor")).toHaveText(fx.vendorName);

    await page.reload();
    await expect(page.getByTestId("expense-vendor")).toHaveText(fx.vendorName);
  });

  test("프로젝트 비용 문서에서도 `바꾸기`가 서고 · 계좌이체면 계좌 없는 후보 부제 끝 ` · 계좌 없음`, 현금이면 꼬리 없음 (결정 맥락 16)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const tag = `꼬리${randomUUID().slice(0, 6)}`;
    const employee = await addPayeeEmployee(fx, `${tag}최`);
    const page = await loginPage(browser, baseURL, fx.pm);
    await openDraft(page, fx, "tracer");
    await expect(page.getByLabel("지급 방식")).toHaveValue("bank_transfer");

    let dialog = await payeeDialog(page, "지급처 바꾸기", "지급처 바꾸기", employee.name);
    await expect(dialog.getByRole("option", { name: new RegExp(employee.name) })).toContainText(`직원 · ${fx.teamName} · 계좌 없음`);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await page.getByLabel("지급 방식").selectOption("cash");
    dialog = await payeeDialog(page, "지급처 바꾸기", "지급처 바꾸기", employee.name);
    const option = dialog.getByRole("option", { name: new RegExp(employee.name) });
    await expect(option).toContainText(`직원 · ${fx.teamName}`);
    await expect(option).not.toContainText("계좌 없음");
    await option.click();
    await dialog.getByRole("button", { name: /^이 지급처로/ }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("expense-vendor")).toHaveText(employee.name);
  });

  test("거래처 30 · 직원 30이 걸리는 검색은 option 50 · 넘침 한 줄 · 머리 `지급처 50` · 이름순 · radio 0 (R-1 · R-8)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const tag = `합침${randomUUID().slice(0, 6)}`;
    await addPayeeCandidates(tag, 30);
    const page = await loginPage(browser, baseURL, fx.pm);
    await openNew(page);

    const dialog = await payeeDialog(page, "지급처 고르기", "지급처 고르기", tag);
    await expect(dialog.getByRole("listbox")).toHaveCount(1);
    await expect(dialog.getByRole("option")).toHaveCount(50);
    await expect(dialog.getByRole("radio")).toHaveCount(0);
    await expect(dialog.getByText("50건 넘음 · 검색으로 좁히기", { exact: true })).toHaveCount(1);
    await expect(dialog.getByText("지급처 50", { exact: true })).toHaveCount(1);
    const titles = (await dialog.getByRole("option").allInnerTexts()).map((text) => new RegExp(`${tag}-[uv]\\d{2}`).exec(text)?.[0] ?? "");
    expect(titles.every((title) => title !== "")).toBe(true);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, "ko")));
    expect(titles.some((title) => title.includes("-u"))).toBe(true);
    expect(titles.some((title) => title.includes("-v"))).toBe(true);
  });
});
