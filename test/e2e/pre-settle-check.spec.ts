import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createProject } from "@/domain/projects";
import { changeProjectStatus } from "@/domain/projects/status";
import { applyAutoSettlement } from "@/domain/projects/auto-transition";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { setCustomerApproval } from "@/domain/quotes/revisions";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { getApprovalView, rejectDocument } from "@/domain/approvals";
import { saveRevenue } from "@/domain/revenue";
import { SETTLEMENT_DOCUMENT_KIND, submitSettlement } from "@/domain/settlements";
import { setSettingValue } from "@/domain/settings/registry";
import { PROJECT_FORCE_COMPLETE_ALLOW_MISSING_REVENUE, PROJECT_FORCE_COMPLETE_ALLOW_OPEN_EXPENSES, PURCHASE_ONLINE_VENDOR_NAME } from "@/domain/settings/keys";
import { approvalBasis } from "@/repositories/quote-revisions";
import { findApprovalGraphByDocument } from "@/repositories/approvals";
import { findExpenseById } from "@/repositories/expenses";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { findProjectById } from "@/repositories/projects";
import { upsertSimpleValue } from "@/repositories/settings";
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
    // 검토 O-1 · D-5 — 제목 `#pre-settle-check`(해시 진입 자리)에 포커스하고, 제목이 창 위쪽에 와서 점검 행이 보인다.
    await expect(page.locator("#pre-settle-check")).toBeFocused();
    await expect(row).toBeInViewport();
    const top = (await heading.boundingBox())?.y ?? Number.POSITIVE_INFINITY;
    expect(top).toBeLessThan((page.viewportSize()?.height ?? 0) / 2);

    // 검토 D-3 — 행 3차 접근 이름 앞에 보이는 번호(Copywriting `26001-0004 지출결의 열기`).
    const number = (await findExpenseById(SYSTEM_VIEWER, fx.expenseId))?.number;
    if (!number) throw new Error("반려 문서 번호가 없습니다");
    await expect(row.getByRole("link", { name: `${number} 지출결의 열기`, exact: true })).toBeVisible();
  });

  // 검토 D-1 · D-2 — 폰은 P1 = 항목 · 금액 · 상태, 행동 3차는 항목(P1) 셀 2행(UI-SPEC S18). 320에서 섹션 표가 본문 폭을 넘지 않는다.
  test("폰 320 — 미결 지출결의 행의 `지출결의 열기`가 항목 셀 2행 · 섹션 가로 넘침 없음", async ({ browser, baseURL }) => {
    const fx = await setupRejectedSettling(browser, baseURL);
    const number = (await findExpenseById(SYSTEM_VIEWER, fx.expenseId))?.number;
    if (!number) throw new Error("반려 문서 번호가 없습니다");
    const page = await loginPage(browser, baseURL, fx.org.drafter, { width: 320, height: 800 });
    await page.goto(`/projects/${fx.projectId}`);

    const heading = page.getByRole("heading", { name: "완료 전 점검", level: 2 });
    const section = page.locator("section").filter({ has: heading });
    const itemCell = section.getByRole("row").filter({ hasText: fx.itemName }).getByRole("cell").filter({ hasText: fx.itemName });
    const open = itemCell.getByRole("link", { name: `${number} 지출결의 열기`, exact: true });
    await expect(open).toBeVisible();
    expect((await open.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(await sectionOverflow(section)).toBeLessThanOrEqual(0);
  });
});

// 섹션 가로 넘침 — section 스크롤 폭과, 섹션 안 표의 오른쪽 끝이 섹션 오른쪽 끝을 넘는 양 중 큰 값(px).
async function sectionOverflow(section: Locator): Promise<number> {
  return section.evaluate((element) => {
    const right = element.getBoundingClientRect().right;
    const tables = [...element.querySelectorAll("table")].map((table) => table.getBoundingClientRect().right - right);
    return Math.max(element.scrollWidth - element.clientWidth, ...tables);
  });
}

// Task 2 — 미매칭 견적 줄(그 줄의 문) · 매출 미입력 · 매출 줄. 줄 하나(거래처 있음 · 연결 없음) · 발행 줄 없음 → 막힘 2.
// 06-22 Task 3 — `vendor: "none"`(거래처 빈 줄) · `noLines`(줄 없음) · `approve: false`(고객 승인 전) · `issued`(발행 줄 1건)를 고른다.
type UnmatchedOptions = { itemName?: string; executionKrw?: number; vendor?: "none"; noLines?: boolean; approve?: boolean; issued?: boolean };
async function setupUnmatchedSettling(
  line: UnmatchedOptions = {},
): Promise<{ org: LeaveOrg; projectId: string; itemName: string; lineId: string; vendorName: string }> {
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
  const itemName = `${line.itemName ?? "조명 설치"}-${suffix}`;
  const lineId = randomUUID();
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: line.noLines ? [] : [
      {
        id: lineId,
        isNew: true as const,
        subcategory,
        itemName,
        vendorId: line.vendor === "none" ? null : vendor.id,
        unitPrice: { currency: "KRW" as const, amount: line.executionKrw ?? 13_400_000, fxRate: 1 },
        execution: { currency: "KRW" as const, amount: line.executionKrw ?? 12_400_000, fxRate: 1 },
      },
    ],
  });
  await changeProjectStatus(org.teamLead.viewer, project.id, { from: "bidding", to: "in_progress" });
  if (line.approve !== false) {
    const basis = await approvalBasis(SYSTEM_VIEWER, revision.id);
    await setCustomerApproval(org.drafter.viewer, revision.id, { approvedOn: today, seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken });
  }
  if (line.issued) {
    await saveRevenue(SYSTEM_VIEWER, project.id, { issuedEntries: [{ id: randomUUID(), isNew: true, entryDate: today, amount: { currency: "KRW", amount: 1_000_000, fxRate: 1 } }] });
  }
  // 고객 승인의 잠금 읽기가 먼저 정산으로 바꿀 수 있다 — 자동 정산 뒤 상태로 확인한다.
  await applyAutoSettlement({ projectIds: [project.id] });
  if ((await findProjectById(SYSTEM_VIEWER, project.id))?.status !== "settling") throw new Error("정산 상태가 아닙니다");
  return { org, projectId: project.id, itemName, lineId, vendorName: vendor.name };
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
    // 검토 D-3 — 줄 3차 접근 이름 = `{번호} {항목} 지출결의 올리기`(Copywriting).
    await expect(row.getByRole("button", { name: `1 ${fx.itemName} 지출결의 올리기`, exact: true })).toBeVisible();
    await expect(section.getByRole("heading", { name: "매출 미입력", level: 3 })).toBeVisible();
    await expect(section.getByText("발행 줄 없음", { exact: true })).toBeVisible();
    await expect(section.getByText("계약 금액 13,400,000 · 발행 합계 — · 차이 —", { exact: true })).toBeVisible();

    const submit = page.getByRole("button", { name: "정산 결재 올리기" });
    await waitForHydration(submit);
    await expect(submit).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText("완료 전 점검 2건", { exact: true })).toBeVisible();
  });

  test("폰 320 · 긴 항목 · 실행가 상한 — `지출결의 올리기`가 항목 셀 2행 · 섹션 가로 넘침 없음", async ({ browser, baseURL }) => {
    const fx = await setupUnmatchedSettling({ itemName: "해외 연사 항공·숙박 및 현지 이동 차량 지원 일체", executionKrw: 999_999_999_999 });
    const page = await loginPage(browser, baseURL, fx.org.drafter, { width: 320, height: 800 });
    await page.goto(`/projects/${fx.projectId}`);

    const heading = page.getByRole("heading", { name: "완료 전 점검", level: 2 });
    const section = page.locator("section").filter({ has: heading });
    await expect(section.getByText("999,999,999,999", { exact: true })).toBeVisible();
    const itemCell = section.getByRole("row").filter({ hasText: fx.itemName }).getByRole("cell").filter({ hasText: fx.itemName });
    const door = itemCell.getByRole("button", { name: `1 ${fx.itemName} 지출결의 올리기`, exact: true });
    await expect(door).toBeVisible();
    expect((await door.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(await sectionOverflow(section)).toBeLessThanOrEqual(0);
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

// 06-22 Task 1 — [O-16] 대표 최종 승인 앞 재점검. 반려 지출결의 1건이 남은 정산 프로젝트를 강행 허용을 잠시 켜 기안하고(06-19 게이트 통과)
// 끈다 — 대표가 연 정산 결재 문서의 `승인`은 막히고 이유에 담당 PM, 같은 줄 3차 `점검 보기`, 2차 `반려`는 산다.
async function draftWithOpenAllowed(fx: PreSettleE2E): Promise<void> {
  await setSettingValue(SYSTEM_VIEWER, PROJECT_FORCE_COMPLETE_ALLOW_OPEN_EXPENSES, true);
  try {
    const result = await submitSettlement(fx.org.drafter.viewer, { projectId: fx.projectId });
    if (result.kind !== "submitted") throw new Error("정산 결재가 올라가지 않았습니다");
  } finally {
    await setSettingValue(SYSTEM_VIEWER, PROJECT_FORCE_COMPLETE_ALLOW_OPEN_EXPENSES, false);
  }
}

test.describe("완료 전 점검 — 정산 결재 문서(O-16 · PS-4)", () => {
  test("대표 승인 막힘 — 점검 보기: `승인` aria-disabled + `완료 전 점검 1건 · 담당 PM {이름}` + 3차 `점검 보기` · `반려` 활성", async ({ browser, baseURL }) => {
    const fx = await setupRejectedSettling(browser, baseURL);
    await draftWithOpenAllowed(fx);
    const page = await loginPage(browser, baseURL, fx.org.ceo);
    await page.goto(`/projects/${fx.projectId}/settlement`);

    const approve = page.getByRole("button", { name: /^승인/ });
    await waitForHydration(approve);
    await expect(approve).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText(`완료 전 점검 1건 · 담당 PM ${fx.org.drafter.name}`, { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "점검 보기", exact: true })).toHaveAttribute("href", `/projects/${fx.projectId}#pre-settle-check`);
    const reject = page.getByRole("button", { name: "반려", exact: true });
    await expect(reject).toBeVisible();
    await expect(reject).not.toHaveAttribute("aria-disabled", "true");
  });

  // Task 2(PS-4) — 강행 허용 그룹만 남은 정산 결재 문서: 행동 줄 위 결과 줄(지금 판정), `승인`은 산다.
  test("강행 결과 줄 — 강행 허용 그룹만 남은 문서에 `강행 · 미결 지출결의 1건`", async ({ browser, baseURL }) => {
    const fx = await setupRejectedSettling(browser, baseURL);
    await setSettingValue(SYSTEM_VIEWER, PROJECT_FORCE_COMPLETE_ALLOW_OPEN_EXPENSES, true);
    try {
      const result = await submitSettlement(fx.org.drafter.viewer, { projectId: fx.projectId });
      if (result.kind !== "submitted") throw new Error("정산 결재가 올라가지 않았습니다");
      const page = await loginPage(browser, baseURL, fx.org.ceo);
      await page.goto(`/projects/${fx.projectId}/settlement`);
      await expect(page.getByText("강행 · 미결 지출결의 1건", { exact: true })).toBeVisible();
      const approve = page.getByRole("button", { name: /^승인/ });
      await waitForHydration(approve);
      await expect(approve).not.toHaveAttribute("aria-disabled", "true");
    } finally {
      await setSettingValue(SYSTEM_VIEWER, PROJECT_FORCE_COMPLETE_ALLOW_OPEN_EXPENSES, false);
    }
  });

  // Task 2 — 반려된 내 정산 결재 · 막힘 1: `정산 결재 다시 올리기`가 먼저 막히고 이유 옆 3차 `점검 보기`(06-19 기안 게이트가 다시 올리기에도 걸린다).
  test("다시 올리기 막힘 — 점검 보기: `정산 결재 다시 올리기` aria-disabled + `완료 전 점검 1건` + 3차 `점검 보기`", async ({ browser, baseURL }) => {
    const fx = await setupRejectedSettling(browser, baseURL);
    await draftWithOpenAllowed(fx);
    const graph = await findApprovalGraphByDocument(SYSTEM_VIEWER, { documentKind: SETTLEMENT_DOCUMENT_KIND, documentId: fx.projectId });
    if (!graph) throw new Error("정산 결재 인스턴스가 없습니다");
    await rejectDocument(fx.org.ceo.viewer, { instanceId: graph.instance.id, expectedVersion: graph.instance.version, reason: "미결 정리" });

    const page = await loginPage(browser, baseURL, fx.org.drafter);
    await page.goto(`/projects/${fx.projectId}/settlement`);
    const resubmit = page.getByRole("button", { name: /^정산 결재 다시 올리기/ });
    await waitForHydration(resubmit);
    await expect(resubmit).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText("완료 전 점검 1건", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "점검 보기", exact: true })).toHaveAttribute("href", `/projects/${fx.projectId}#pre-settle-check`);
  });
});

// 06-22 Task 3 — S18 섹션 마감. 섹션 = 「완료 전 점검」 제목을 가진 section.
function preSettleSection(page: Page): Locator {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: "완료 전 점검", level: 2 }) });
}

test.describe("완료 전 점검 — 섹션 마감(S18 · 06-22)", () => {
  test.afterAll(archiveTempRoles);

  test("매출 3차 — 담당 PM · 폭 1280: `발행 요청 추가` 1개(누르면 발행 요청 표에 새 줄) · `발행 줄 추가` 0개", async ({ browser, baseURL }) => {
    const fx = await setupUnmatchedSettling();
    const page = await loginPage(browser, baseURL, fx.org.drafter, { width: 1280, height: 900 });
    await page.goto(`/projects/${fx.projectId}`);
    const section = preSettleSection(page);
    await expect(section.getByText("발행 줄 없음", { exact: true })).toBeVisible();
    const add = section.getByRole("button", { name: "발행 요청 추가", exact: true });
    await waitForHydration(add);
    await expect(add).toHaveCount(1);
    await expect(section.getByRole("button", { name: "발행 줄 추가", exact: true })).toHaveCount(0);
    // 같은 onClick — 발행 요청 표 「발행 요청 추가」와 같은 새 줄(희망 발행일 기본 오늘).
    await add.click();
    const requests = page.locator("table", { has: page.locator("caption", { hasText: /^발행 요청$/ }) });
    await expect(requests.getByLabel("희망 발행일")).toHaveValue(seoulToday());
  });

  test("매출 3차 — 폭 1023: `발행 요청 추가` · `발행 줄 추가` 0개 · `발행 줄 없음`만", async ({ browser, baseURL }) => {
    const fx = await setupUnmatchedSettling();
    const page = await loginPage(browser, baseURL, fx.org.drafter, { width: 1023, height: 900 });
    await page.goto(`/projects/${fx.projectId}`);
    const section = preSettleSection(page);
    await waitForHydration(page.getByRole("button", { name: "정산 결재 올리기" }));
    await expect(section.getByText("발행 줄 없음", { exact: true })).toBeVisible();
    await expect(section.getByRole("button", { name: "발행 요청 추가", exact: true })).toHaveCount(0);
    await expect(section.getByRole("button", { name: "발행 줄 추가", exact: true })).toHaveCount(0);
  });

  test("쓰기 권한 없는 계정 — 미매칭 줄 `담당 PM {이름}` · 그 행 버튼 · 링크 0개", async ({ browser, baseURL }) => {
    const fx = await setupUnmatchedSettling();
    const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E보기만-${randomUUID().slice(0, 8)}`, workScope: "team", viewScope: "team" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem: "project.value", visible: true });
    const reader = await makePerson("보기만", role.id, fx.org.teamId, `${seoulToday().slice(0, 4)}-01-01`);
    const page = await loginPage(browser, baseURL, reader, { width: 1280, height: 900 });
    await page.goto(`/projects/${fx.projectId}`);
    const row = preSettleSection(page).getByRole("row").filter({ hasText: fx.itemName });
    await expect(row.getByText(`담당 PM ${fx.org.drafter.name}`, { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(row.getByRole("button")).toHaveCount(0);
    await expect(row.getByRole("link")).toHaveCount(0);
  });

  test("온라인구매 미매칭 줄 — 3차 `구매 요청` href `/cards/purchases?new=1&line={id}`", async ({ browser, baseURL }) => {
    const fx = await setupUnmatchedSettling();
    await setSettingValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME, fx.vendorName);
    try {
      const page = await loginPage(browser, baseURL, fx.org.drafter, { width: 1280, height: 900 });
      await page.goto(`/projects/${fx.projectId}`);
      const row = preSettleSection(page).getByRole("row").filter({ hasText: fx.itemName });
      await expect(row.getByRole("link", { name: `1 ${fx.itemName} 구매 요청`, exact: true })).toHaveAttribute("href", `/cards/purchases?new=1&line=${fx.lineId}`);
    } finally {
      await setSettingValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME, "");
    }
  });

  // 06-19 검토 D-4 — 정산의 기존 줄은 거래처 칸이 잠겨 있어(domain/quotes/edit-scope.ts — 정산은 실행가만 "edit") 견적 줄 표 문에도
  // `거래처 고르기`가 없다. 점검 행도 같은 규칙 — 이유 글자 `거래처 없음`만(갈 칸이 없는 3차를 세우지 않는다). 정할 일은 SUMMARY 「갈림」.
  test("거래처 없는 미매칭 줄 — 폭 1280에서도 `거래처 없음`만 · 점검 행 · 견적 줄 표 모두 `거래처 고르기` 0개(정산은 거래처 칸 잠김)", async ({ browser, baseURL }) => {
    const fx = await setupUnmatchedSettling({ vendor: "none" });
    const page = await loginPage(browser, baseURL, fx.org.drafter, { width: 1280, height: 900 });
    await page.goto(`/projects/${fx.projectId}`);
    await waitForHydration(page.getByRole("button", { name: "정산 결재 올리기" }));
    const row = preSettleSection(page).getByRole("row").filter({ hasText: fx.itemName });
    await expect(row.getByText("거래처 없음", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /거래처 고르기$/ })).toHaveCount(0);
  });

  test("긴 항목(42자) — 폭 1280은 칸에 다 보이고 768도 말줄임은 칸 폭에서 · title은 전체 이름(DOM 감사 D-1)", async ({ browser, baseURL }) => {
    const fx = await setupUnmatchedSettling({ itemName: "해외 연사 항공·숙박 및 현지 이동 차량 지원 일체 패키지 (비즈니스석 왕복 포함)" });
    const page = await loginPage(browser, baseURL, fx.org.drafter, { width: 1280, height: 900 });
    await page.goto(`/projects/${fx.projectId}`);
    const cell = preSettleSection(page).getByRole("row").filter({ hasText: fx.itemName }).getByRole("cell").filter({ hasText: fx.itemName });
    const text = cell.getByText(fx.itemName, { exact: true });
    const measure = () =>
      text.evaluate((element) => {
        const td = element.closest("td");
        const pad = td ? Number.parseFloat(getComputedStyle(td).paddingLeft) + Number.parseFloat(getComputedStyle(td).paddingRight) : 0;
        return { cw: element.clientWidth, sw: element.scrollWidth, cell: (td?.clientWidth ?? 0) - pad, title: element.closest("[title]")?.getAttribute("title") ?? null };
      });
    const wide = await measure();
    expect(wide.title).toBe(fx.itemName);
    expect(wide.sw).toBeLessThanOrEqual(wide.cw);
    await page.setViewportSize({ width: 768, height: 900 });
    const tablet = await measure();
    // 잘리더라도 칸 폭까지는 보인다(고정 폭에서 먼저 자르지 않는다).
    expect(tablet.cw).toBeGreaterThanOrEqual(Math.min(tablet.sw, tablet.cell) - 1);
    expect(await sectionOverflow(preSettleSection(page))).toBeLessThanOrEqual(0);
  });

  test("세 그룹 빔 — `미결 없음` · 매출 줄 `계약 금액 — · 1차 고객 승인 전` 3차 → 고객 승인 줄로 포커스", async ({ browser, baseURL }) => {
    const fx = await setupUnmatchedSettling({ noLines: true, approve: false, issued: true });
    const page = await loginPage(browser, baseURL, fx.org.drafter, { width: 1280, height: 900 });
    await page.goto(`/projects/${fx.projectId}`);
    const section = preSettleSection(page);
    await expect(section.getByText("미결 없음", { exact: true })).toBeVisible();
    const pending = section.getByRole("button", { name: "1차 고객 승인 전", exact: true });
    await waitForHydration(pending);
    await pending.click();
    await expect(page.getByRole("button", { name: /^고객 승인 표시/ })).toBeFocused();
  });

  test("점검 실패 — 섹션 자리 `점검 불러오지 못함` + 2차 `다시 시도` · `정산 결재 올리기` aria-disabled + `점검 결과 없음` · 3차 `다시 시도`", async ({ browser, baseURL }) => {
    const fx = await setupUnmatchedSettling();
    // 오류 주입 — 완료 전 점검만 읽는 설정 키에 형식 밖 값을 직접 넣는다(Zod 파싱 실패 → 점검 사전 조회 예외).
    await upsertSimpleValue(SYSTEM_VIEWER, PROJECT_FORCE_COMPLETE_ALLOW_MISSING_REVENUE.key, "broken", null);
    try {
      const page = await loginPage(browser, baseURL, fx.org.drafter, { width: 1280, height: 900 });
      await page.goto(`/projects/${fx.projectId}`);
      await expect(page.getByText("점검 불러오지 못함", { exact: true })).toBeVisible();
      const submit = page.getByRole("button", { name: "정산 결재 올리기" });
      await waitForHydration(submit);
      await expect(submit).toHaveAttribute("aria-disabled", "true");
      await expect(page.getByText("점검 결과 없음", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "다시 시도", exact: true })).toHaveCount(2);
    } finally {
      await setSettingValue(SYSTEM_VIEWER, PROJECT_FORCE_COMPLETE_ALLOW_MISSING_REVENUE, false);
    }
  });
});
