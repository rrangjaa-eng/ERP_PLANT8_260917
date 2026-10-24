import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { expensePayments, expenses, projects } from "@/db/schema";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { EVIDENCE_REQUIRED } from "@/domain/settings/keys";
import { getSettingValue } from "@/domain/settings/registry";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { archiveTempRoles, insertTempRole, setupExpenseE2E, uniqueReceipt, type ExpenseE2E, type LineKey } from "./expense-fixture";

// 06-24(ROADMAP 기준 5 · D-602 · D-604): 경영관리 흐름 — PM 제출 → 결재 → 홈 「[오늘] 지급」 → 증빙 확인 → 지급 완료 → 지급 완료 목록.
// 업로드는 05 로컬 저장 드라이버를 그대로 탄다(B-4 — 새 흉내 없음). 이미지는 05 `uniqueReceipt`, PDF는 이 파일 안 최소 PDF 바이트(바이너리 픽스처 없음).
// E2E DB는 스펙끼리 초기화 없이 공유한다 — 홈 지급 묶음 건수는 처리 전 N을 읽어 지급 완료 뒤 N−1로 본다(E-28). 증빙 필수 설정은 켜고 끄지 않고 읽기만 한다.

const DESKTOP = { width: 1280, height: 900 };
const INFO_ITEMS = ["expense.value", "expense.amount", "approval.value", "project.value", "quote.amount", "vendor.value", "team.value", "person.value"];
const PAYMENT_DUE = /지급 — 예정일 지남·오늘 (\d+)건/;

test.afterAll(async () => {
  await archiveTempRoles();
});

async function teamOf(fx: ExpenseE2E): Promise<string> {
  const [row] = await db.select({ teamId: projects.teamId }).from(projects).where(eq(projects.id, fx.projectId));
  if (!row?.teamId) throw new Error("프로젝트 팀 없음");
  return row.teamId;
}

// 테스트 계급 「경영관리」 — 팀 업무 범위 · 지출결의 보기(+ 팀 보기) + 지급 처리 쓰기. 이 스펙 프로젝트의 팀에 발령한다(06-23 · 06-15 스펙과 같은 꼴).
async function makeTeamPayer(fx: ExpenseE2E): Promise<Person> {
  const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E경영관리흐름-${randomUUID().slice(0, 8)}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.team", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.payments", action: "write", allowed: true });
  for (const infoItem of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return makePerson("경영관리", role.id, await teamOf(fx), `${seoulToday().slice(0, 4)}-01-01`);
}

type Upload = { name: string; mimeType: string; buffer: Buffer };

// 05 중복 검사는 파일 해시가 같으면 다른 문서의 파일도 막는다 — 호출마다 한 바이트를 달리한 최소 PDF.
function uniquePdf(): Upload {
  return { name: `영수증-${randomUUID().slice(0, 8)}.pdf`, mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4\n% ${randomUUID()}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`) };
}

// PM이 줄 하나의 작성 중 문서를 만들고 폼에서 증빙 한 장을 올려 제출한다(화면). 문서 id를 돌려준다.
async function pmSubmits(browser: Browser, baseURL: string | undefined, fx: ExpenseE2E, key: LineKey, upload: (page: Page) => Promise<Upload> | Upload): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id], fields: { note: "행사 운영비" } });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  const page = await loginPage(browser, baseURL, fx.pm);
  await page.goto(`/expenses/${expenseId}`);
  await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
  await page.getByTestId("attachments-input").setInputFiles(await upload(page));
  await expect(page.locator('[data-ui="attachments"] li').getByText(/^\d+KB · \d{2}-\d{2}$/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /^지출결의 제출/ }).click();
  await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}\\?submitted=1$`));
  await page.context().close();
  return expenseId;
}

// 결재선 넷 승인(approved).
async function approveAll(fx: ExpenseE2E, expenseId: string): Promise<void> {
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 인스턴스 없음");
  let version = view.version;
  for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) {
    const result = await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: version });
    version = result.version;
    if (approver === fx.ceo && result.status !== "approved") throw new Error(`결재 통과 안 됨: ${result.status}`);
  }
}

async function dueCount(page: Page): Promise<number> {
  const label = page.getByText(PAYMENT_DUE);
  if ((await label.count()) === 0) return 0;
  const match = PAYMENT_DUE.exec((await label.first().textContent()) ?? "");
  return Number(match?.[1] ?? 0);
}

function rowOf(page: Page, itemName: string) {
  return page.locator("tbody tr").filter({ hasText: itemName });
}

// 한 줄 흐름 전체. 증빙 형식만 다르다(이미지 · PDF).
async function runManagementFlow(browser: Browser, baseURL: string | undefined, key: LineKey, upload: (page: Page) => Promise<Upload> | Upload): Promise<void> {
  // 증빙 필수는 기본값(켜짐) 그대로 돈다 — 읽기만 한다(E-28: E2E에 설정 바꾸는 길이 없다).
  expect(await getSettingValue(EVIDENCE_REQUIRED), "증빙 필수 설정이 기본값이 아님").toBe(true);

  const fx = await setupExpenseE2E();
  const payer = await makeTeamPayer(fx);
  const itemName = fx.lines[key].itemName;

  const expenseId = await pmSubmits(browser, baseURL, fx, key, upload);
  await approveAll(fx, expenseId);
  // 지급 예정일 = 오늘(06-23 스펙과 같은 꼴 — 홈 「[오늘] 지급」 묶음에 서려면 예정일이 지났거나 오늘이어야 한다).
  await db.update(expenses).set({ scheduledPaymentDate: seoulToday() }).where(eq(expenses.id, expenseId));
  const [doc] = await db.select({ number: expenses.number, supply: expenses.supplyAmountKrw }).from(expenses).where(eq(expenses.id, expenseId));
  if (!doc?.number || !doc.supply) throw new Error("문서 번호 · 공급가 없음");

  // 경영관리 홈 — 처리 전 N(E-28 상대 건수).
  const page = await loginPage(browser, baseURL, payer, DESKTOP);
  await page.goto("/");
  const row = page.getByRole("listitem").filter({ hasText: PAYMENT_DUE });
  await expect(row).toHaveCount(1);
  const before = await dueCount(page);
  expect(before).toBeGreaterThanOrEqual(1);

  // 홈 → 지급 대상 → 문서.
  await row.getByRole("link", { name: "지급 대상 보기" }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/expenses");
  expect(new URL(page.url()).searchParams.get("status")).toBe("지급 대상");
  await rowOf(page, itemName).locator("a[data-row-link]").click();
  await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}(\\?|$)`));

  // 증빙 확인 전에는 `지급 완료`가 서 있지 않다(EVID-02 · D-603 — 1차 자리는 확인 · 06.5 D-6520 글자 `공급가액과 같음`).
  const confirm = page.getByRole("button", { name: /^공급가액과 같음/ });
  await waitForHydration(confirm);
  const payButtons = page.getByRole("button", { name: /^지급 완료/ });
  expect(await payButtons.count()).toBeLessThanOrEqual(1);
  if ((await payButtons.count()) === 1) await expect(payButtons).toHaveAttribute("aria-disabled", "true");

  // 06.5 D-6520 — 금액은 공급가액 하나라 빈 증빙 금액 칸이 없다. 고침 없이 `공급가액과 같음`으로 확인한다(화면 조작).
  await expect(confirm).not.toHaveAttribute("aria-disabled", "true");
  await confirm.click();
  const review = page.getByTestId("evidence-review");
  await expect(review.getByText("확인됨", { exact: true })).toBeVisible();

  // 지급 완료(이체액 입력 칸은 지급 총액이 채워져 있다).
  await expect(page.locator("#payment-transfer")).toBeFocused();
  await page.getByRole("button", { name: /^지급 완료/ }).click();
  await expect(page.getByTestId("payment-result")).toHaveText(/^지급 완료 → \d{4}-\d{2}-\d{2} · \d{2}:\d{2}$/);
  const live = await db
    .select({ id: expensePayments.id })
    .from(expensePayments)
    .where(and(eq(expensePayments.expenseId, expenseId), isNull(expensePayments.cancelledAt)));
  expect(live).toHaveLength(1);

  // 지급 완료 목록에 그 번호.
  await page.goto(`/expenses?${new URLSearchParams({ status: "지급 완료" })}`);
  await expect(rowOf(page, itemName).getByRole("link", { name: `${doc.number} 지출결의 열기` })).toHaveCount(1);
  // 지급 대상 목록에서는 빠졌다.
  await page.goto(`/expenses?${new URLSearchParams({ status: "지급 대상" })}`);
  await expect(rowOf(page, itemName)).toHaveCount(0);

  // 홈 지급 묶음 건수 = N−1(N = 1이면 그 줄이 없다).
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "내 차례" })).toBeVisible();
  expect(await dueCount(page)).toBe(before - 1);
  await page.context().close();
}

test.describe("경영관리 흐름 (06-24)", () => {
  test("이미지 증빙 — PM 제출 → 결재 → 홈 [오늘] 지급 → 증빙 확인 → 지급 완료 → 지급 완료 목록", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    await runManagementFlow(browser, baseURL, "tracer", (page) => uniqueReceipt(page));
  });

  test("PDF 증빙 — 같은 흐름을 PDF 원본으로(서버가 원본 그대로 받는다) → 지급 완료", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    await runManagementFlow(browser, baseURL, "hold", () => uniquePdf());
  });
});
