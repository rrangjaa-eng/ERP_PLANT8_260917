import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { files } from "@/db/schema";
import { approveDocument, getApprovalView, rejectDocument } from "@/domain/approvals";
import { voidEvidence } from "@/domain/evidence";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { submitLeave } from "@/domain/leave";
import { insertApprovalInstance } from "@/repositories/approvals";
import { seoulToday } from "@/lib/dates";
import { leaveWeekdayRange } from "./leave-dates";
import { expectSheetDocumentLink, loginPage, setupLeaveOrg, waitForHydration } from "./leave-org";
import { makeEvidenceManagerE2E, setupExpenseE2E, submitLineExpense, uniqueReceipt, type ExpenseE2E } from "./expense-fixture";

// 05-10 Task 1 트레이서(UX-03 · 기준 3): 폰 첫 화면 「내 차례」 `[결재]` 지출결의 행 탭 → 결재 시트(지출결의 본문 · 증빙 썸네일) → `승인` → 행이 사라진다.
// 파일명 접두어 mobile-*로 mobile-375 프로젝트(375 폭)에서 돈다.

const PHONE = { width: 375, height: 800 };
const DESKTOP = { width: 1280, height: 900 };
const META = /^\d+KB · \d{2}-\d{2}$/;

test.describe("폰 첫 화면 [결재] → 결재 시트 → 승인 (05-10 트레이서)", () => {
  test("팀장 폰 첫 화면의 [결재] 지출결의 행을 탭하면 시트가 열리고 승인하면 그 행과 블록이 사라진다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const line = fx.lines.tracer;
    const expenseId = await submitLineExpense(browser, baseURL, fx, "tracer");
    const targetText = `${fx.projectName} · ${line.itemName}`;

    const lead = await loginPage(browser, baseURL, fx.lead, PHONE);
    await lead.goto("/");

    // 블록 · 행 — 한 줄 `대상 — 상황`, 숫자는 공급가액.
    await expect(lead.getByRole("heading", { level: 2, name: "내 차례 1" })).toBeVisible();
    const row = lead.getByRole("listitem").filter({ hasText: targetText });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(`${targetText} — 지출결의, ${fx.pm.name}`);
    await expect(row).toContainText("12,400,000");

    // 행 탭 — `button` + aria-haspopup="dialog"(링크가 아니다).
    const tap = row.getByRole("button", { name: "열기" });
    await expect(tap).toHaveAttribute("aria-haspopup", "dialog");
    await waitForHydration(tap);
    await tap.click();

    const sheet = lead.getByRole("dialog");
    await expect(sheet.getByRole("heading", { level: 2 })).toHaveText(`지출결의 — ${targetText}`);
    await expect(sheet.getByText(`${fx.projectNumber}-0001 · ${fx.pm.name}`)).toBeVisible();
    // 계산 한 줄 · 증빙 썸네일 한 장(주소는 시트가 열린 뒤 서버가 만든다).
    await expect(sheet.getByText("부가세 10% 1,240,000 · 지급 총액 13,640,000 · 세금계산서 규칙")).toBeVisible();
    const thumbs = sheet.getByTestId("sheet-evidence-thumb");
    await expect(thumbs).toHaveCount(1);
    await expect.poll(() => thumbs.first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(sheet.getByRole("button", { name: "크게 보기" })).toHaveCount(1);
    await expectSheetDocumentLink(sheet, expenseId, `/expenses/${expenseId}`);

    // 승인 — 시트가 닫히고 그 행 · 블록째 없다(항목 0).
    await sheet.getByRole("button", { name: "승인" }).click();
    await expect(sheet).toBeHidden();
    await expect(lead.getByRole("heading", { level: 2, name: /^내 차례/ })).toHaveCount(0);
    await expect(lead.getByText(targetText)).toHaveCount(0);
  });
});

async function approvalViewOf(fx: ExpenseE2E, expenseId: string) {
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 문서를 읽지 못했다");
  return view;
}

async function approveAll(fx: ExpenseE2E, expenseId: string): Promise<void> {
  for (const person of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) {
    const view = await getApprovalView(person.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
    await approveDocument(person.viewer, { instanceId: view?.instanceId ?? "", expectedVersion: view?.version ?? 0 });
  }
}

const navTab = (page: Page) => page.locator('nav[aria-label="하단 탭"]').getByRole("link", { name: /^내 차례/ });

test.describe("첫 화면 [막힘] · 6줄 · 탭 수 (05-10 Task 3)", () => {
  test("폰 — 반려된 내 지출결의 [막힘] 행(대상 · 지출결의 열기 · 숫자 · 이유) · 하단 탭 `내 차례 1`", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const line = fx.lines.tracer;
    const expenseId = await submitLineExpense(browser, baseURL, fx, "tracer");
    const view = await approvalViewOf(fx, expenseId);
    await rejectDocument(fx.lead.viewer, { instanceId: view.instanceId, expectedVersion: view.version, reason: "증빙 다시" });

    const pm = await loginPage(browser, baseURL, fx.pm, PHONE);
    await pm.goto("/");

    const targetText = `${fx.projectName} · ${line.itemName}`;
    const row = pm.getByRole("listitem").filter({ hasText: targetText });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(`${targetText} — 지출결의 반려, ${fx.lead.name}`);
    await expect(row.getByText("막힘", { exact: true })).toBeVisible();
    await expect(row).toContainText("12,400,000");
    const open = row.getByRole("link", { name: "지출결의 열기" });
    await expect(open).toHaveAttribute("href", `/expenses/${expenseId}`);
    // 폰 두 줄: 태그 · 대상이 윗줄, 숫자가 아랫줄(§7-4).
    const labelBox = await row.getByText(targetText).first().boundingBox();
    const amountBox = await row.getByText("12,400,000").boundingBox();
    expect(labelBox).not.toBeNull();
    expect(amountBox).not.toBeNull();
    expect(amountBox!.y).toBeGreaterThan(labelBox!.y);
    await expect(navTab(pm)).toHaveText("내 차례 1");
    // 승인 시트 행동은 [막힘]에 없다.
    await expect(row.getByRole("button")).toHaveCount(0);
  });

  test("폰 — 결재 8건이면 6줄 + `더 보기 2건` · 탭 `내 차례 8`", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const org = await setupLeaveOrg(today);
    for (let week = 4; week < 12; week += 1) {
      const range = leaveWeekdayRange(today, { week, weekdays: 1 });
      await submitLeave(org.drafter.viewer, { kind: "full_day", startDate: range.startDate, endDate: range.endDate, half: "" });
    }

    const lead = await loginPage(browser, baseURL, org.teamLead, PHONE);
    await lead.goto("/");

    await expect(lead.getByRole("heading", { level: 2, name: "내 차례 8" })).toBeVisible();
    await expect(lead.getByRole("listitem").filter({ hasText: org.drafter.name })).toHaveCount(6);
    await expect(lead.getByText("더 보기 2건")).toBeVisible();
    await expect(navTab(lead)).toHaveText("내 차례 8");
  });

  test("desktop 1280 — 행마다 승인 · 반려의 aria-describedby가 그 행 대상 글자를 가리키고 id가 서로 다르다", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const org = await setupLeaveOrg(today);
    for (const week of [4, 5]) {
      const range = leaveWeekdayRange(today, { week, weekdays: 1 });
      await submitLeave(org.drafter.viewer, { kind: "full_day", startDate: range.startDate, endDate: range.endDate, half: "" });
    }

    const lead = await loginPage(browser, baseURL, org.teamLead, DESKTOP);
    await lead.goto("/");
    const rows = lead.getByRole("listitem").filter({ hasText: org.drafter.name });
    await expect(rows).toHaveCount(2);

    const ids: string[] = [];
    for (let index = 0; index < 2; index += 1) {
      const row = rows.nth(index);
      const approve = row.getByRole("button", { name: "승인" });
      const reject = row.getByRole("button", { name: "반려" });
      const id = (await approve.getAttribute("aria-describedby")) ?? "";
      expect(id).not.toBe("");
      expect(await reject.getAttribute("aria-describedby")).toBe(id);
      await expect(row.locator(`[id="${id}"]`)).toContainText(org.drafter.name);
      ids.push(id);
    }
    expect(new Set(ids).size).toBe(2);
  });

  test("desktop 1280 — 증빙 무효 [막힘] → `증빙 올리기` → 하나 더 올리면 첫 화면에서 그 줄이 사라진다 (G1)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const manager = await makeEvidenceManagerE2E();
    const line = fx.lines.phone;
    const expenseId = await submitLineExpense(browser, baseURL, fx, "phone");
    await approveAll(fx, expenseId);
    const [file] = await db.select().from(files).where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, expenseId))).orderBy(asc(files.createdAt));
    await voidEvidence(manager.viewer, { fileId: file?.id ?? "", reason: "다른 건 영수증" });

    const pm = await loginPage(browser, baseURL, fx.pm, DESKTOP);
    await pm.goto("/");
    const targetText = `${fx.projectName} · ${line.itemName}`;
    const row = pm.getByRole("listitem").filter({ hasText: targetText });
    await expect(row).toContainText(`${targetText} — 증빙 무효`);
    const upload = row.getByRole("link", { name: "증빙 올리기" });
    expect(await upload.getAttribute("href")).toMatch(new RegExp(`/expenses/${expenseId}#evidence$`));

    await upload.click();
    await expect(pm).toHaveURL(new RegExp(`/expenses/${expenseId}#evidence$`));
    await expect(pm.locator("#evidence")).toBeVisible();
    const more = pm.getByRole("button", { name: /^하나 더/ });
    await waitForHydration(more);
    await pm.getByTestId("attachments-input").setInputFiles(await uniqueReceipt(pm));
    await expect(pm.locator('[data-ui="attachments"] li').getByText(META)).toHaveCount(1, { timeout: 20_000 });

    await pm.goto("/");
    await expect(pm.getByText(targetText)).toHaveCount(0);
    await expect(pm.getByRole("heading", { level: 2, name: /^내 차례/ })).toHaveCount(0);
  });

  test("desktop 1280 — 공급 함수가 실패하면 블록 자리에 `불러오기 실패` + `다시 시도`(셸은 그대로)", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const org = await setupLeaveOrg(today);
    // 등록되지 않은 종류의 반려 인스턴스 — 공급 함수가 종류를 찾지 못해 던진다(리포지토리 함수로만 만든다).
    await insertApprovalInstance(org.drafter.viewer, { documentKind: `ghost-${randomUUID().slice(0, 8)}`, documentId: randomUUID(), drafterId: org.drafter.viewer.id, status: "rejected", currentRound: 1 }, db);

    const pm = await loginPage(browser, baseURL, org.drafter, DESKTOP);
    await pm.goto("/");

    await expect(pm.getByText("불러오기 실패")).toBeVisible();
    const retry = pm.getByRole("button", { name: "다시 시도" });
    await waitForHydration(retry);
    await retry.click();
    await expect(pm.getByText("불러오기 실패")).toBeVisible();
    // 하단이 아닌 PC 상단 메뉴는 살아 있다 — 오류가 셸 전체를 깨지 않는다.
    await expect(pm.getByRole("navigation").first()).toBeVisible();
  });
});
