import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createExpenseFromLines } from "@/domain/expenses";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { getCurrentQuoteRevision } from "@/domain/quotes/lines";
import { createRevisionFromCurrent } from "@/domain/quotes/revisions";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { seoulToday } from "@/lib/dates";
import { delayServerActions, expectSheetDocumentLink, loginPage, waitForHydration, type Person } from "./leave-org";
import { setupExpenseE2E, submitLineExpense, uniqueReceipt, type ExpenseE2E } from "./expense-fixture";

// 05-05 Task 1 화면 트레이서(ROADMAP 05 기준 3): 견적 줄 `지출결의 올리기` → 폼(자동 채움) → 사진 한 장(브라우저 축소 · 해시 · 로컬 서명 주소) →
// `Ctrl+Enter` 제출 → 문서 화면 → 팀장 폰 결재 시트 `승인` → 대표 문서 화면 `승인`. 줄마다 테스트가 따로라 서로 겹치지 않는다.

const RECEIPT = "test/e2e/assets/receipt-3000x2000.jpg";
const PHONE = { width: 375, height: 800 };
// 3000×2000 사진을 브라우저가 줄이고 해시하는 시간이 기본 5초를 넘는 때가 있다(느린 러너).
const UPLOAD_WAIT = 20_000;
const META = /^\d+KB · \d{2}-\d{2}$/;

function titleOf(fx: ExpenseE2E, itemName: string): string {
  return `지출결의 — ${fx.projectName} · ${itemName}`;
}

// 서버 액션 POST(`next-action` 헤더)를 센다 — 액션 이름은 헤더에 없어 건수만 본다.
function countActionPosts(page: Page): { count: () => number } {
  let total = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) total += 1;
  });
  return { count: () => total };
}

// 도메인 함수로 작성 중 문서를 만들어 폼을 연다(견적 줄 표 클릭은 트레이서가 따로 증명한다).
async function openDraftForm(page: Page, fx: ExpenseE2E, key: "hold" | "retry"): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  await page.goto(`/expenses/${expenseId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(titleOf(fx, fx.lines[key].itemName));
  await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
  return expenseId;
}

test.describe("지출결의 올리기 → 제출 → 폰 결재 시트 승인 → 대표 승인 (05-05 트레이서)", () => {
  test("PM이 견적 줄에서 폼을 열어 사진 한 장을 붙여 제출하고 팀장이 폰에서, 대표가 문서 화면에서 승인한다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const line = fx.lines.tracer;

    // 1) 견적 줄 행 행동 → 폼(자동 채움).
    const pm = await loginPage(browser, baseURL, fx.pm);
    await pm.goto(`/projects/${fx.projectId}`);
    const lineRow = pm.getByRole("row").filter({ hasText: line.itemName });
    const open = lineRow.getByRole("button", { name: "지출결의 올리기" });
    await waitForHydration(open);
    await open.click();
    await expect(pm).toHaveURL(/\/expenses\/[0-9a-f-]{36}$/);
    const expenseId = pm.url().split("/").at(-1) ?? "";
    await expect(pm.getByRole("heading", { level: 1 })).toHaveText(titleOf(fx, line.itemName));
    const head = pm.locator('[data-ui="screen-title"]').locator("..");
    await expect(head.getByText("작성 중", { exact: true })).toBeVisible();
    await expect(pm.getByText(fx.vendorName)).toBeVisible();
    await expect(pm.getByLabel("증빙 종류")).toHaveValue("tax_invoice");
    await expect(pm.getByLabel("공급가액")).toHaveValue("12,400,000");
    await expect(pm.getByLabel("지급 방식")).toHaveValue("bank_transfer");

    // 2) 사진 한 장 — 메타가 `KB · MM-DD` 꼴로 바뀐다.
    await waitForHydration(pm.getByRole("button", { name: /^임시 저장/ }));
    await pm.getByTestId("attachments-input").setInputFiles(RECEIPT);
    const evidenceRow = pm.locator('[data-ui="attachments"] li');
    await expect(evidenceRow).toHaveCount(1);
    await expect(evidenceRow.getByText(META)).toBeVisible();

    // 3) Ctrl+Enter 제출 — 요청 한 건 · 제출 중 나머지 버튼 aria-disabled(disabled 속성 없음).
    await delayServerActions(pm, 600);
    const posts = countActionPosts(pm);
    const submit = pm.getByRole("button", { name: /^지출결의 제출/ });
    await submit.focus();
    await pm.keyboard.press("Control+Enter");
    await pm.keyboard.press("Control+Enter");
    await submit.click({ force: true });
    const save = pm.getByRole("button", { name: /^임시 저장/ });
    await expect(save).toHaveAttribute("aria-disabled", "true");
    await expect(save).not.toHaveAttribute("disabled", /.*/);
    await expect(pm).toHaveURL(new RegExp(`/expenses/${expenseId}\\?submitted=1$`));
    expect(posts.count()).toBe(1);

    // 4) 제출 결과 — 토스트 · 번호 · 태그 · 증빙 섹션.
    // 05-09부터 제출 토스트에 3차 `되돌리기`가 붙는다 — 결과 문장은 토스트의 첫 글자 칸이다.
    const submittedToast = pm.getByRole("status").filter({ hasText: "지출결의 제출" });
    await expect(submittedToast.locator("span").first()).toHaveText(`지출결의 제출 · 결재 요청됨 → ${fx.lead.name}`);
    await expect(submittedToast.getByRole("button", { name: "되돌리기" })).toBeVisible();
    await expect(pm.locator('[data-ui="screen-meta"]')).toHaveText(`${fx.projectNumber}-0001`);
    await expect(head.getByText("결재 중", { exact: true })).toBeVisible();
    const evidenceSection = pm.getByRole("heading", { level: 2, name: "증빙" }).locator("..");
    await expect(evidenceSection.getByRole("listitem")).toHaveCount(1);
    await expect(pm.locator("#evidence")).toBeVisible();

    // 5) 팀장 — 폰 결재 시트(행이 button + aria-haspopup="dialog" — 링크가 아니다).
    const lead = await loginPage(browser, baseURL, fx.lead, PHONE);
    await lead.goto("/approvals");
    const trigger = lead.getByRole("button", { name: `지출결의 · ${fx.projectName} · ${line.itemName}` });
    await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    await waitForHydration(trigger);
    await trigger.click();
    const sheet = lead.getByRole("dialog");
    await expect(sheet.getByRole("heading", { level: 2 })).toHaveText(titleOf(fx, line.itemName));
    await expect(sheet.locator("dt", { hasText: /^공급가액$/ })).toHaveCount(1);
    await expectSheetDocumentLink(sheet, expenseId, `/expenses/${expenseId}`);
    await sheet.getByRole("button", { name: "승인" }).click();
    await expect(sheet).toBeHidden();
    // 처리함 — 그 문서 행은 이제 문서 링크다.
    await expect(lead.getByRole("link", { name: `지출결의 · ${fx.projectName} · ${line.itemName}` })).toBeVisible();

    // 6) 본부장 · 경영 · 대표 — 각자 문서 화면 `승인 Ctrl+Enter`(결재선 넷 — 앞 사람이 승인해야 다음 사람이 문서를 본다). 대표 뒤 태그 `승인`.
    let ceoPage: Page | null = null;
    for (const person of [fx.divisionHead, fx.mgmt, fx.ceo]) {
      const approver = await loginPage(browser, baseURL, person);
      ceoPage = approver;
      await approver.goto(`/expenses/${expenseId}`);
      const approve = approver.getByRole("button", { name: /^승인/ });
      await waitForHydration(approve);
      await approve.click();
      await expect(approver.getByRole("button", { name: /^승인/ })).toHaveCount(0);
    }
    if (!ceoPage) throw new Error("대표 화면이 없다");
    const ceoHead = ceoPage.locator('[data-ui="screen-title"]').locator("..");
    await expect(ceoHead.getByText("승인", { exact: true })).toBeVisible();
  });
});

test.describe("결재 시트 승인 통신 실패 (05 /review B3)", () => {
  test("승인 요청이 실패하면 결재함 시트와 홈 시트 모두 `승인 실패` 한 줄이 서고 시트는 열린 채 승인이 다시 눌린다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const line = fx.lines.hold;
    await submitLineExpense(browser, baseURL, fx, "hold");
    const lead = await loginPage(browser, baseURL, fx.lead, PHONE);
    const title = `지출결의 · ${fx.projectName} · ${line.itemName}`;

    // 결재함 시트.
    await lead.goto("/approvals");
    const trigger = lead.getByRole("button", { name: title });
    await waitForHydration(trigger);
    await trigger.click();
    const sheet = lead.getByRole("dialog");
    await expect(sheet.getByRole("heading", { level: 2 })).toHaveText(titleOf(fx, line.itemName));
    await lead.route("**/*", async (route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) await route.abort("failed");
      else await route.continue();
    });
    await sheet.getByRole("button", { name: "승인" }).click();
    await expect(sheet.getByRole("alert")).toContainText("승인 실패");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("button", { name: "승인" })).not.toHaveAttribute("aria-disabled", "true");
    await lead.unrouteAll({ behavior: "ignoreErrors" });

    // 홈 시트(같은 문서 — 아직 승인 전).
    await lead.goto("/");
    const open = lead.locator("[data-home-open]").first();
    await waitForHydration(open);
    await open.click();
    const homeSheet = lead.getByRole("dialog");
    await expect(homeSheet.getByRole("heading", { level: 2 })).toHaveText(titleOf(fx, line.itemName));
    await lead.route("**/*", async (route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) await route.abort("failed");
      else await route.continue();
    });
    await homeSheet.getByRole("button", { name: "승인" }).click();
    await expect(homeSheet.getByRole("alert")).toContainText("승인 실패");
    await expect(homeSheet).toBeVisible();
    await lead.context().close();
  });
});

test.describe("올리는 중 제출 · 다시 올리기", () => {
  test("올리는 행이 있는 동안 1차가 막히고 떠나면 beforeunload가 뜨며 끝나면 풀린다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openDraftForm(page, fx, "hold");

    // 로컬 저장소 PUT을 붙잡아 둔다.
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let putHeld = false;
    await page.route("**/api/storage-local/**", async (route) => {
      putHeld = true;
      await held;
      await route.continue();
    });
    await page.getByTestId("attachments-input").setInputFiles(await uniqueReceipt(page));
    const row = page.locator('[data-ui="attachments"] li');
    await expect(row.getByText("올리는 중…")).toBeVisible({ timeout: UPLOAD_WAIT });
    // 서명 주소를 받는 서버 액션이 끝나 PUT이 붙들린 뒤부터 센다(그 앞의 액션 POST는 올리기 자체다).
    await expect.poll(() => putHeld, { timeout: UPLOAD_WAIT }).toBe(true);

    const submit = page.getByRole("button", { name: /^지출결의 제출/ });
    await expect(submit).toHaveAttribute("aria-disabled", "true");
    const describedBy = (await submit.getAttribute("aria-describedby")) ?? "";
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText("증빙 올리는 중 · 잠시 뒤 제출");

    // 1차 클릭 · Ctrl+Enter는 서버를 부르지 않는다.
    const posts = countActionPosts(page);
    await submit.click({ force: true });
    await submit.focus();
    await page.keyboard.press("Control+Enter");
    expect(posts.count()).toBe(0);

    // beforeunload — 대화상자는 dismiss로 닫고 페이지를 이어 쓴다.
    const dialogs: string[] = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.type());
      void dialog.dismiss();
    });
    await page.close({ runBeforeUnload: true });
    await expect.poll(() => dialogs).toEqual(["beforeunload"]);
    expect(page.isClosed()).toBe(false);

    release();
    await expect(row.getByText(META)).toBeVisible({ timeout: UPLOAD_WAIT });
    await expect(page.getByText("증빙 올리는 중 · 잠시 뒤 제출")).toHaveCount(0);
  });

  test("첫 PUT이 실패하면 실패 행 `올리지 못함 · 다시 올리기` → 3차 `다시 올리기` → 성공 메타", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm);
    await openDraftForm(page, fx, "retry");

    let failedOnce = false;
    await page.route("**/api/storage-local/**", async (route) => {
      if (!failedOnce) {
        failedOnce = true;
        await route.fulfill({ status: 500, body: "" });
        return;
      }
      await route.continue();
    });
    await page.getByTestId("attachments-input").setInputFiles(await uniqueReceipt(page));
    const row = page.locator('[data-ui="attachments"] li');
    await expect(row.getByText("올리지 못함 · 다시 올리기")).toBeVisible({ timeout: UPLOAD_WAIT });
    await row.getByRole("button", { name: "다시 올리기" }).click();
    await expect(row.getByText(META)).toBeVisible({ timeout: UPLOAD_WAIT });
    await expect(page.getByText("올리지 못함 · 다시 올리기")).toHaveCount(0);
  });
});

// 웨이브 6 화면 검토 수정(D3 · D4) — PC 견적 줄 표의 행동 열. 만들기 실패 줄은 합계 행 오른쪽 한 줄이고(UI-SPEC S1 · DR-16) 열 폭을 키우지 않는다.
test.describe("웨이브 6 — 견적 줄 행동 열 실패 줄 · 접근 이름", () => {
  test("실패 줄이 합계 행에 서고 행동 열 폭이 그대로이며 버튼이 그 줄 항목 칸을 aria-describedby로 가리킨다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm, { width: 1280, height: 800 });
    await page.goto(`/projects/${fx.projectId}`);
    const line = fx.lines.retry;
    const button = page.getByRole("row").filter({ hasText: line.itemName }).getByRole("button", { name: "지출결의 올리기" });
    await waitForHydration(button);

    const describedBy = await button.getAttribute("aria-describedby");
    expect.soft(describedBy, "D4 aria-describedby").toBeTruthy();
    if (describedBy) await expect.soft(page.locator(`[id="${describedBy}"]`)).toHaveText(line.itemName);

    const cell = button.locator("xpath=ancestor::td");
    const before = (await cell.boundingBox())!.width;
    await page.route("**/*", async (route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) await route.fulfill({ status: 500, body: "" });
      else await route.continue();
    });
    await button.click();
    const failure = page.getByText("지출결의 만들기 실패 · 다시 시도");
    await expect(failure).toBeVisible();
    const after = (await cell.boundingBox())!.width;
    expect(after, "D3 행동 열 폭 불변").toBe(before);
    expect(await failure.evaluate((node) => node.closest("td")?.getAttribute("colspan") !== null), "D3 실패 줄이 합계 행 칸 안").toBe(true);
  });
});

// 05-15 D-66 — 제출된 지출결의(번호 있음)가 붙은 견적 줄은 상태 `지출결의 중` · 금액 셀 읽기 전용(이유 한 줄). 격자 열 순서는 Phase 4 표 그대로(실행가 = 7).
const EXECUTION_COLUMN = 7;

test.describe("D-66 잠금", () => {
  test("제출한 뒤 프로젝트 상세로 돌아오면 줄 상태가 지출결의 중이고 금액 셀이 편집되지 않고 이유가 보인다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const expenseId = await submitLineExpense(browser, baseURL, fx, "closed");
    expect(expenseId).toMatch(/^[0-9a-f-]{36}$/);

    const page = await loginPage(browser, baseURL, fx.pm, { width: 1280, height: 800 });
    await page.goto(`/projects/${fx.projectId}`);
    const row = page.getByRole("row").filter({ hasText: fx.lines.closed.itemName });
    await expect(row.getByRole("gridcell").filter({ hasText: "지출결의 중" })).toHaveCount(1);

    const reason = `지출결의 ${fx.projectNumber}-0001 연결됨 · 고치려면 새 차수`;
    const amount = row.getByRole("gridcell").nth(EXECUTION_COLUMN);
    await waitForHydration(amount);
    await expect(async () => {
      await amount.focus();
      await page.keyboard.press("Enter");
      await expect(amount.getByText(reason, { exact: true })).toBeVisible({ timeout: 1000 });
    }).toPass();
    await expect(amount.locator("input, select")).toHaveCount(0);

    // 웨이브 7 D3 — 닫힌 줄의 3차 `지출결의 열기`도 그 줄 항목 칸을 aria-describedby로 가리킨다(줄마다 같은 이름).
    const open = row.getByRole("link", { name: "지출결의 열기" });
    const describedBy = await open.getAttribute("aria-describedby");
    expect(describedBy, "D3 aria-describedby").toBeTruthy();
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(fx.lines.closed.itemName);

    // 연결 없는 줄은 그대로 미착수다.
    const free = page.getByRole("row").filter({ hasText: fx.lines.hold.itemName });
    await expect(free.getByRole("gridcell").filter({ hasText: "미착수" })).toHaveCount(1);
  });
});

// 05-15 Task 2 — 견적 줄 표 행 행동 셀 나머지 갈래 · 표 위 한 줄 · 누름 중 · 미저장 편집 · 한 줄 Ctrl+E · 힌트 줄. 열 순서는 Phase 4 표 그대로(비고 10 · 행동 11).
const VENDOR_COLUMN = 3;
const ITEM_COLUMN = 2;
const NOTE_COLUMN = 10;
const DESKTOP = { width: 1280, height: 800 };

async function currentRevisionId(fx: ExpenseE2E): Promise<string> {
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, fx.projectId);
  if (!revision) throw new Error("현재 차수가 없다");
  return revision.id;
}

function rowOf(page: Page, itemName: string) {
  return page.getByRole("row").filter({ hasText: itemName });
}

function doorCellOf(page: Page, itemName: string) {
  return rowOf(page, itemName).getByRole("gridcell").last();
}

// 거래처 정보(vendor.value)만 가린 company 범위 계급 — 지출결의 · 프로젝트 쓰기 권한은 있다(거래처 열이 없다).
async function makeVendorHiddenPerson(): Promise<Person> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E가림본부-${randomUUID().slice(0, 8)}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E가림팀-${randomUUID().slice(0, 8)}` });
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E가림-${randomUUID().slice(0, 8)}`, workScope: "company" });
  for (const menu of ["projects", "expenses"]) {
    for (const action of ["view", "write"] as const) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu, action, allowed: true });
  }
  for (const infoItem of ["project.value", "quote.amount", "vendor.value", "team.value", "person.value"]) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: infoItem !== "vendor.value" });
  }
  const name = `가림${randomUUID().slice(0, 4)}`;
  const email = `e2e-hidden-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name, roleId: role.id });
  await assignTeam(SYSTEM_VIEWER, { userId, teamId: team.id, effectiveFrom: `${seoulToday().slice(0, 4)}-01-01` });
  return { name, email, password: tempPassword, viewer: { id: userId, roleId: role.id } };
}

test.describe("행 행동 갈래", () => {
  test("거래처 없는 줄은 글자 `거래처 없음` + 3차 `거래처 고르기`(누르면 그 줄 거래처 셀 편집), 취소 줄 셀은 비어 있다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm, DESKTOP);
    await page.goto(`/projects/${fx.projectId}`);

    const none = doorCellOf(page, fx.lines.noVendor.itemName);
    await expect(none).toContainText("거래처 없음");
    const pick = none.getByRole("button", { name: "거래처 고르기" });
    await waitForHydration(pick);
    await pick.click();
    await expect(rowOf(page, fx.lines.noVendor.itemName).getByRole("gridcell").nth(VENDOR_COLUMN).getByRole("combobox", { name: "거래처" })).toBeVisible();

    const cancelled = doorCellOf(page, fx.lines.cancelled.itemName);
    await expect(cancelled).toHaveText("");
    await expect(cancelled.getByRole("button")).toHaveCount(0);
    await expect(cancelled.getByRole("link")).toHaveCount(0);
  });

  test("800 폭에서는 거래처 없는 줄 셀이 글자 `거래처 없음`만이고 `거래처 고르기`가 없다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm, { width: 800, height: 900 });
    await page.goto(`/projects/${fx.projectId}`);
    // 1024 미만 표는 보기 전용이라 칸이 gridcell이 아니라 cell이다(DR-36).
    const none = rowOf(page, fx.lines.noVendor.itemName).getByRole("cell").last();
    await expect(none).toHaveText("거래처 없음");
    await expect(none.getByRole("button")).toHaveCount(0);
  });

  test("2차가 고객 승인 전이면 표 위 한 줄 하나가 이유를 말하고 어느 줄에도 `지출결의 올리기`가 없다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    await createRevisionFromCurrent(fx.pm.viewer, { projectId: fx.projectId, fromRevisionId: await currentRevisionId(fx) });
    const page = await loginPage(browser, baseURL, fx.pm, DESKTOP);
    await page.goto(`/projects/${fx.projectId}`);

    await expect(page.getByText("2차 고객 승인 전 · 고객 승인 표시", { exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "지출결의 올리기" })).toHaveCount(0);
  });

  test("누르는 동안 그 버튼이 `지출결의 올리기…`이고 같은 열 나머지 버튼은 aria-disabled이다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm, DESKTOP);
    await page.goto(`/projects/${fx.projectId}`);
    const mine = doorCellOf(page, fx.lines.hold.itemName).getByRole("button");
    const other = doorCellOf(page, fx.lines.retry.itemName).getByRole("button");
    await waitForHydration(mine);
    // 웨이브 7 D2 — 누름 중 「…」이 행동 열을 넓히지 않는다(열 폭 = 쉬는 라벨, UI-SPEC S1 :334).
    const doorWidth = async () => (await doorCellOf(page, fx.lines.hold.itemName).boundingBox())!.width;
    const idleWidth = await doorWidth();
    await delayServerActions(page, 2000);
    await mine.click();
    await expect(mine).toContainText("지출결의 올리기…");
    expect(await doorWidth(), "D2 행동 열 폭 불변").toBe(idleWidth);
    await expect(other).toHaveAttribute("aria-disabled", "true");
    await expect(page).toHaveURL(/\/expenses\/[0-9a-f-]{36}$/);
  });

  test("저장 안 한 편집이 있으면 이동하지 않고 합계 행 오른쪽에 `저장 안 한 편집 1칸 · 먼저 일괄 저장`", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm, DESKTOP);
    await page.goto(`/projects/${fx.projectId}`);
    const button = doorCellOf(page, fx.lines.hold.itemName).getByRole("button");
    await waitForHydration(button);

    const note = rowOf(page, fx.lines.retry.itemName).getByRole("gridcell").nth(NOTE_COLUMN);
    await expect(async () => {
      await note.focus();
      await page.keyboard.press("Enter");
      await expect(note.locator("input")).toBeFocused({ timeout: 1000 });
    }).toPass();
    await page.keyboard.type("메모");
    await page.keyboard.press("Enter");

    await button.click();
    // 같은 글자가 일괄 저장 이유 · 확인 창에도 있어 합계 행(표 안)으로 좁힌다.
    await expect(page.getByRole("grid", { name: "견적 줄" }).getByText("저장 안 한 편집 1칸 · 먼저 일괄 저장", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/projects/${fx.projectId}$`));
  });

  test("편집 중이 아닐 때 활성 셀 줄에서 Ctrl+E는 폼으로 가고, 힌트 줄 끝 항목 · 셀 3차는 탭 순서 밖이며 항목 칸을 가리킨다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const page = await loginPage(browser, baseURL, fx.pm, DESKTOP);
    await page.goto(`/projects/${fx.projectId}`);
    const hint = page.locator("p", { has: page.locator("kbd", { hasText: "Ctrl+E" }) });
    await expect(hint).toHaveCount(1);
    await expect(hint).toContainText("범위 복사 Ctrl+C / 붙여넣기 Ctrl+V");
    await expect(hint).toHaveText(/지출결의 올리기 Ctrl\+E$/);
    await expect(hint.locator("kbd")).toHaveCount(7);

    const button = doorCellOf(page, fx.lines.hold.itemName).getByRole("button", { name: "지출결의 올리기" });
    await waitForHydration(button);
    await expect(button).toHaveAttribute("tabindex", "-1");
    const describedBy = (await button.getAttribute("aria-describedby")) ?? "";
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(fx.lines.hold.itemName);

    const item = rowOf(page, fx.lines.hold.itemName).getByRole("gridcell").nth(ITEM_COLUMN);
    await expect(async () => {
      await item.focus();
      await page.keyboard.press("Control+e");
      await expect(page).toHaveURL(/\/expenses\/[0-9a-f-]{36}$/, { timeout: 1500 });
    }).toPass();
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test("거래처 정보가 가려진 계급(거래처 열 없음)에게 거래처 있는 줄은 `지출결의 올리기`, 정말 없는 줄은 글자 `거래처 없음`만이다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const hidden = await makeVendorHiddenPerson();
    const page = await loginPage(browser, baseURL, hidden, DESKTOP);
    await page.goto(`/projects/${fx.projectId}`);
    await expect(page.getByRole("columnheader", { name: "거래처" })).toHaveCount(0);

    const withVendor = doorCellOf(page, fx.lines.hold.itemName);
    await expect(withVendor.getByRole("button", { name: "지출결의 올리기" })).toBeVisible();
    await expect(withVendor).not.toContainText("거래처 없음");
    const none = doorCellOf(page, fx.lines.noVendor.itemName);
    await expect(none).toHaveText("거래처 없음");
    await expect(none.getByRole("button")).toHaveCount(0);
  });
});
