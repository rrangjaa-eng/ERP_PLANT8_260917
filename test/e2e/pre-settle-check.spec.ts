import { randomUUID } from "node:crypto";
import { test, expect, type Browser } from "@playwright/test";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createProject } from "@/domain/projects";
import { changeProjectStatus } from "@/domain/projects/status";
import { applyAutoSettlement } from "@/domain/projects/auto-transition";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { setCustomerApproval } from "@/domain/quotes/revisions";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { getApprovalView, rejectDocument } from "@/domain/approvals";
import { saveRevenue } from "@/domain/revenue";
import { approvalBasis } from "@/repositories/quote-revisions";
import { findExpenseById } from "@/repositories/expenses";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { findProjectById } from "@/repositories/projects";
import { insertVendor } from "@/repositories/vendors";
import { seoulToday } from "@/lib/dates";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { archiveTempRoles, insertTempRole, uniqueReceipt } from "./expense-fixture";
import { loginPage, makePerson, setupLeaveOrg, waitForHydration, type LeaveOrg } from "./leave-org";

// 06-19(PROJ-06 · UI-SPEC S18): 정산 프로젝트 상세의 「완료 전 점검」 섹션과 머리 줄 `정산 결재 올리기` 막힘이 한 판정이다.
// 준비는 도메인 함수(지출결의 제출만 화면 — 증빙 업로드가 브라우저 경로다). 줄 하나 · 발행 줄 1건이라 막힘은 반려 지출결의 1건뿐이다.

type PreSettleE2E = { org: LeaveOrg; projectId: string; itemName: string; expenseId: string };

async function submitExpenseInBrowser(browser: Browser, baseURL: string | undefined, org: LeaveOrg, lineId: string): Promise<string> {
  const created = await createExpenseFromLines(org.drafter.viewer, { lineIds: [lineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  const page = await loginPage(browser, baseURL, org.drafter);
  await page.goto(`/expenses/${expenseId}`);
  await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
  await page.getByTestId("attachments-input").setInputFiles(await uniqueReceipt(page));
  await expect(page.locator('[data-ui="attachments"] li').getByText(/^\d+KB · \d{2}-\d{2}$/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /^지출결의 제출/ }).click();
  await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}\\?submitted=1$`));
  await page.context().close();
  return expenseId;
}

async function setupRejectedSettling(browser: Browser, baseURL: string | undefined): Promise<PreSettleE2E> {
  const today = seoulToday();
  const lastYear = Number(today.slice(0, 4)) - 1;
  const suffix = randomUUID().slice(0, 6);
  const org = await setupLeaveOrg(today);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E점검클라이언트-${suffix}`, normalizedName: `e2e점검클라이언트-${suffix}` });
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E점검거래처-${suffix}`, normalizedName: `e2e점검거래처-${suffix}`, defaultEvidenceType: "tax_invoice" });
  const project = await createProject(org.drafter.viewer, {
    clientId: client.id,
    teamId: org.teamId,
    pmUserId: org.drafter.viewer.id,
    name: `E2E점검-${suffix}`,
    startDate: `${lastYear}-11-01`,
    endDate: `${lastYear}-12-31`,
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision || !project.id) throw new Error("프로젝트 · 1차 차수가 없습니다");
  const subcategory = (await firstSelectableSubcategory()).value;
  const itemName = `무대 제작-${suffix}`;
  const saved = await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: [
      {
        id: randomUUID(),
        isNew: true as const,
        subcategory,
        itemName,
        vendorId: vendor.id,
        unitPrice: { currency: "KRW" as const, amount: 13_400_000, fxRate: 1 },
        execution: { currency: "KRW" as const, amount: 12_400_000, fxRate: 1 },
      },
    ],
  });
  const lineId = saved.lines[0]?.id;
  if (!lineId) throw new Error("견적 줄이 없습니다");
  await changeProjectStatus(org.teamLead.viewer, project.id, { from: "bidding", to: "in_progress" });
  const basis = await approvalBasis(SYSTEM_VIEWER, revision.id);
  await setCustomerApproval(org.drafter.viewer, revision.id, { approvedOn: today, seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken });
  await saveRevenue(SYSTEM_VIEWER, project.id, {
    issuedEntries: [{ id: randomUUID(), isNew: true, entryDate: `${lastYear}-12-31`, amount: { currency: "KRW", amount: 1_000_000, fxRate: 1 } }],
  });

  const expenseId = await submitExpenseInBrowser(browser, baseURL, org, lineId);
  const view = await getApprovalView(org.teamLead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("지출결의 결재 화면이 없습니다");
  await rejectDocument(org.teamLead.viewer, { instanceId: view.instanceId, expectedVersion: view.version, reason: "금액 다시" });
  // 종료일이 지난 진행 프로젝트는 지출결의 제출의 잠금 읽기에서 이미 정산이 됐을 수 있다 — 자동 정산 뒤 상태로 확인한다.
  await applyAutoSettlement({ projectIds: [project.id] });
  if ((await findProjectById(SYSTEM_VIEWER, project.id))?.status !== "settling") throw new Error("정산 상태가 아닙니다");
  return { org, projectId: project.id, itemName, expenseId };
}

test.describe("완료 전 점검 — 정산 프로젝트 상세(S18)", () => {
  test("반려 지출결의 1건 → 섹션 `미결 지출결의 1건` · 행 `반려` → 버튼 막힘 `완료 전 점검 1건` · 3차 `점검 보기` → 섹션 제목 포커스", async ({ browser, baseURL }) => {
    const fx = await setupRejectedSettling(browser, baseURL);
    const page = await loginPage(browser, baseURL, fx.org.drafter);
    await page.goto(`/projects/${fx.projectId}`);

    const heading = page.getByRole("heading", { name: "완료 전 점검", level: 2 });
    await expect(heading).toBeVisible();
    const section = page.locator("section").filter({ has: heading });
    await expect(section.getByText("미결 지출결의 1건", { exact: true })).toBeVisible();
    const row = section.getByRole("row").filter({ hasText: fx.itemName });
    await expect(row.getByText("반려", { exact: true })).toBeVisible();

    const submit = page.getByRole("button", { name: "정산 결재 올리기" });
    await waitForHydration(submit);
    await expect(submit).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText("완료 전 점검 1건", { exact: true })).toBeVisible();
    const next = page.getByRole("button", { name: "점검 보기" });
    await next.click();
    await expect(heading).toBeFocused();
  });
});

// Task 2 — 미매칭 견적 줄(그 줄의 문) · 매출 미입력 · 매출 줄. 줄 하나(거래처 있음 · 연결 없음) · 발행 줄 없음 → 막힘 2.
async function setupUnmatchedSettling(): Promise<{ org: LeaveOrg; projectId: string; itemName: string }> {
  const today = seoulToday();
  const lastYear = Number(today.slice(0, 4)) - 1;
  const suffix = randomUUID().slice(0, 6);
  const org = await setupLeaveOrg(today);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E점검클라이언트-${suffix}`, normalizedName: `e2e점검클라이언트-${suffix}` });
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E점검거래처-${suffix}`, normalizedName: `e2e점검거래처-${suffix}`, defaultEvidenceType: "tax_invoice" });
  const project = await createProject(org.drafter.viewer, {
    clientId: client.id,
    teamId: org.teamId,
    pmUserId: org.drafter.viewer.id,
    name: `E2E미매칭-${suffix}`,
    startDate: `${lastYear}-11-01`,
    endDate: `${lastYear}-12-31`,
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision || !project.id) throw new Error("프로젝트 · 1차 차수가 없습니다");
  const subcategory = (await firstSelectableSubcategory()).value;
  const itemName = `조명 설치-${suffix}`;
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: [
      {
        id: randomUUID(),
        isNew: true as const,
        subcategory,
        itemName,
        vendorId: vendor.id,
        unitPrice: { currency: "KRW" as const, amount: 13_400_000, fxRate: 1 },
        execution: { currency: "KRW" as const, amount: 12_400_000, fxRate: 1 },
      },
    ],
  });
  await changeProjectStatus(org.teamLead.viewer, project.id, { from: "bidding", to: "in_progress" });
  const basis = await approvalBasis(SYSTEM_VIEWER, revision.id);
  await setCustomerApproval(org.drafter.viewer, revision.id, { approvedOn: today, seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken });
  // 고객 승인의 잠금 읽기가 먼저 정산으로 바꿀 수 있다 — 자동 정산 뒤 상태로 확인한다.
  await applyAutoSettlement({ projectIds: [project.id] });
  if ((await findProjectById(SYSTEM_VIEWER, project.id))?.status !== "settling") throw new Error("정산 상태가 아닙니다");
  return { org, projectId: project.id, itemName };
}

test.describe("완료 전 점검 — 미매칭 견적 줄 · 매출 미입력(S18 · D-612 · D-613)", () => {
  test("줄 하나 미매칭 · 발행 줄 없음 → 그룹 둘 · 문 `지출결의 올리기` · 매출 줄 `발행 합계 — · 차이 —` · 버튼 `완료 전 점검 2건`", async ({ browser, baseURL }) => {
    const fx = await setupUnmatchedSettling();
    const page = await loginPage(browser, baseURL, fx.org.drafter);
    await page.goto(`/projects/${fx.projectId}`);

    const heading = page.getByRole("heading", { name: "완료 전 점검", level: 2 });
    const section = page.locator("section").filter({ has: heading });
    await expect(section.getByText("미매칭 견적 줄 1줄", { exact: true })).toBeVisible();
    const row = section.getByRole("row").filter({ hasText: fx.itemName });
    await expect(row.getByRole("button", { name: "지출결의 올리기" })).toBeVisible();
    await expect(section.getByRole("heading", { name: "매출 미입력", level: 3 })).toBeVisible();
    await expect(section.getByText("발행 줄 없음", { exact: true })).toBeVisible();
    await expect(section.getByText("계약 금액 13,400,000 · 발행 합계 — · 차이 —", { exact: true })).toBeVisible();

    const submit = page.getByRole("button", { name: "정산 결재 올리기" });
    await waitForHydration(submit);
    await expect(submit).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText("완료 전 점검 2건", { exact: true })).toBeVisible();
  });
});

// Task 3 — R-6 범위. 같은 팀의 범위가 좁은 계정 A(프로젝트 보기만 · 지출결의 보기 없음)는 기안자 B의 반려 문서를 행으로 보지 못하고
// 그룹 끝 `그 밖 1건`만 본다. 그룹 머리글 건수는 프로젝트 전체 값 그대로다.
test.describe("완료 전 점검 — 보는 범위(R-6)", () => {
  test.afterAll(archiveTempRoles);

  test("범위가 좁은 계정 A → `미결 지출결의 1건` · `그 밖 1건` · B 문서 번호 없음", async ({ browser, baseURL }) => {
    const fx = await setupRejectedSettling(browser, baseURL);
    const number = (await findExpenseById(SYSTEM_VIEWER, fx.expenseId))?.number;
    if (!number) throw new Error("반려 문서 번호가 없습니다");
    const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E좁은범위-${randomUUID().slice(0, 8)}`, workScope: "team", viewScope: "team" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
    // 관리자가 새 계급을 만들면 노출표도 켠다 — 프로젝트 상세가 지나는 프로젝트 값만(금액 칸은 숨김 그대로).
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "project.value", visible: true });
    const narrow = await makePerson("기안A", role.id, fx.org.teamId, `${seoulToday().slice(0, 4)}-01-01`);
    const page = await loginPage(browser, baseURL, narrow);
    await page.goto(`/projects/${fx.projectId}`);

    const heading = page.getByRole("heading", { name: "완료 전 점검", level: 2 });
    const section = page.locator("section").filter({ has: heading });
    await expect(section.getByText("미결 지출결의 1건", { exact: true })).toBeVisible();
    await expect(section.getByText("그 밖 1건", { exact: true })).toBeVisible();
    await expect(page.getByText(number)).toHaveCount(0);
  });
});
