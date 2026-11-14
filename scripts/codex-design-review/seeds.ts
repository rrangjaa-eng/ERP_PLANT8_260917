import { createHash, randomInt, randomUUID } from "node:crypto";
import { expect, type Browser } from "@playwright/test";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { corpCards, evidenceImportBatches, evidenceRecordLinks, evidenceRecords, files, projectBudgetEntries, projects, purchaseRequests, revenueEntries } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam, listTeams } from "@/domain/org";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createProject } from "@/domain/projects";
import { changeProjectStatus } from "@/domain/projects/status";
import { applyAutoSettlement } from "@/domain/projects/auto-transition";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { setCustomerApproval } from "@/domain/quotes/revisions";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND, saveExpenseDraft, submitExpense } from "@/domain/expenses";
import { approveDocument, getApprovalView, rejectDocument } from "@/domain/approvals";
import { SETTLEMENT_DOCUMENT_KIND, submitSettlement } from "@/domain/settlements";
import { findApprovalGraphByDocument } from "@/repositories/approvals";
import { createCorpCard } from "@/domain/corp-cards";
import { createCardUsage, precheckCardUsage, type CardUsageInput } from "@/domain/corp-card-usages";
import { voidEvidence } from "@/domain/evidence";
import { completePurchaseRequest, createPurchaseRequest, precheckPurchaseCompletion, precheckPurchaseRequest } from "@/domain/purchase-requests";
import { saveRevenue } from "@/domain/revenue";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { planAccountNumberUpdate } from "@/domain/vendors";
import { approvalBasis } from "@/repositories/quote-revisions";
import { findExpenseById } from "@/repositories/expenses";
import { listOrgSnapshot } from "@/repositories/org-snapshot";
import { findProjectById } from "@/repositories/projects";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { INFO_ITEMS } from "@/domain/permissions/info-items";
import { insertVendor } from "@/repositories/vendors";
import { seoulToday } from "@/lib/dates";
import { setHireDate, setResignationDate } from "@/domain/people";
import { LEAVE_DOCUMENT_KIND, LeaveValidationError, submitLeave } from "@/domain/leave";
import { lockoutConfig } from "@/domain/auth/lockout";
import { recordAttempt } from "@/repositories/login-attempts";
import { getSettingValue, setSettingValue } from "@/domain/settings/registry";
import {
  APPROVAL_ROUTE_SETTLEMENT_STEP1_ENABLED,
  APPROVAL_ROUTE_SETTLEMENT_STEP2_ENABLED,
  APPROVAL_ROUTE_SETTLEMENT_STEP3_ENABLED,
  FUND_DIVISION_ORG_UNIT,
  PRINT_COMPANY_ADDRESS,
  PRINT_COMPANY_BUSINESS_NO,
  PRINT_COMPANY_NAME,
  PRINT_COMPANY_PHONE,
  PRINT_COMPANY_REPRESENTATIVE,
  PURCHASE_ONLINE_VENDOR_NAME,
} from "@/domain/settings/keys";
import { QUOTE_SUBCATEGORY_TABLE_KEY } from "@/domain/projects/references";
import { listCodeItems, setCodeItemActive } from "@/repositories/code-tables";
import { fieldDefinitions } from "@/db/schema/field-definitions";
import { insertFieldDefinition } from "@/repositories/field-definitions";
import { insertVisibilityIfAbsent } from "@/repositories/permissions";
import { listRoles } from "@/repositories/roles";
import { customFieldInfoItem } from "@/domain/custom-fields/targets";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import type { SeedName } from "./lib";

// 지출결의 제출·결재·증빙 무효 준비는 test/e2e의 도우미와 같은 흐름이지만, scripts는 test를 import할 수 없어(eslint boundaries) 필요한 만큼만 다시 쓴다.
type Person = { email: string; password: string; viewer: Viewer };

// 06.1-14(G15 · 카드 R6): 06.1-01이 꺼 둔 채 시드한 보기 제한 증빙 종류.
const PRIVATE_EVIDENCE_TYPE = "personal_card_receipt";

async function makePerson(prefix: string, roleId: string, teamId: string, effectiveFrom: string): Promise<Person> {
  const email = `capture-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: `${prefix}${randomUUID().slice(0, 4)}`, roleId });
  await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom });
  return { email, password: tempPassword, viewer: { id: userId, roleId } };
}

// 07.3-02(D-7306): 결재선 3단 = 경영관리본부의 본부 책임자. 이미 있으면 그 사람(본부 책임자는 본부마다 한 명 — 자리 판정, 발령 길 ·
// 팀 없이 본부 칸 길 둘 다 본다), 없으면 경영관리팀에 발령해 만든다. 결재는 도메인 함수로만 하므로 비밀번호는 쓰지 않는다.
async function mgmtHead(mgmtTeam: { id: string; orgUnitId: string }, effectiveFrom: string): Promise<{ viewer: Viewer }> {
  const existing = (await listOrgSnapshot(SYSTEM_VIEWER, seoulToday())).find(
    (person) => person.roleId === "role-division-head" && person.orgUnitId === mgmtTeam.orgUnitId,
  );
  if (existing) return { viewer: { id: existing.id, roleId: "role-division-head" } };
  return makePerson("경영", "role-division-head", mgmtTeam.id, effectiveFrom);
}

// 데이터가 있어야 보이는 화면용 시드 시나리오(capture.spec.ts가 로그인 전에 부른다). erp_test는 캡처마다 초기화되므로 매번 새로 만든다.
// vars는 경로의 {이름} 자리에 채우고, viewer는 그 화면을 볼 사용자다(기본 sysadmin 대신 로그인한다).
export type SeedResult = { vars: Record<string, string>; viewer: Person };

// pre-settle-evidence-pending: 정산 프로젝트의 유일한 미결이 증빙 무효가 된 승인 지출결의 1건(test/e2e/pre-settle-check.spec.ts 준비와 같은 흐름).
async function preSettleEvidencePending(browser: Browser, baseURL: string | undefined): Promise<SeedResult> {
  const today = seoulToday();
  const lastYear = Number(today.slice(0, 4)) - 1;
  const suffix = randomUUID().slice(0, 6);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `캡처결재본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `캡처결재팀-${suffix}` });
  const mgmtTeam = (await listTeams(SYSTEM_VIEWER)).find((candidate) => candidate.name === "경영관리팀");
  if (!mgmtTeam) throw new Error("시드된 경영관리팀 없음");
  const org = {
    teamId: team.id,
    drafter: await makePerson("기안", "role-pm", team.id, yearStart),
    teamLead: await makePerson("팀장", "role-team-lead", team.id, yearStart),
    divisionHead: await makePerson("본부장", "role-division-head", team.id, yearStart),
    mgmt: await mgmtHead(mgmtTeam, yearStart),
    ceo: await makePerson("대표", "role-ceo", team.id, yearStart),
  };
  const client = await insertVendor(SYSTEM_VIEWER, { name: `캡처클라이언트-${suffix}`, normalizedName: `캡처클라이언트-${suffix}` });
  // 새 초안의 지급 방식 기본값이 계좌이체라 거래처에 쓸 수 있는 계좌가 있고 확인된 거래처여야 제출 버튼이 열린다.
  const account = planAccountNumberUpdate("110-123-456789");
  if (account.kind !== "set") throw new Error("계좌번호 암호화 계획 없음");
  const vendor = await insertVendor(SYSTEM_VIEWER, {
    name: `캡처거래처-${suffix}`,
    normalizedName: `캡처거래처-${suffix}`,
    defaultEvidenceType: "tax_invoice",
    accountBank: "신한은행",
    accountHolder: "테스트 예금주",
    accountNumberEncrypted: account.accountNumberEncrypted,
    accountNumberLast4: account.accountNumberLast4,
    confirmedAt: new Date(),
  });
  const project = await createProject(org.drafter.viewer, {
    clientId: client.id,
    teamId: org.teamId,
    pmUserId: org.drafter.viewer.id,
    name: `캡처점검-${suffix}`,
    startDate: `${lastYear}-11-01`,
    endDate: `${lastYear}-12-31`,
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision || !project.id) throw new Error("프로젝트 · 1차 차수가 없습니다");
  // 서버는 활성·미보관 소분류만 받는다.
  const [subcategory] = await listCodeItems(SYSTEM_VIEWER, {
    tableKey: QUOTE_SUBCATEGORY_TABLE_KEY,
    scope: { rows: "all", includeArchived: false },
    includeInactive: false,
  });
  if (!subcategory) throw new Error("시드된 quote_subcategory 코드 항목이 없습니다");
  const saved = await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: [
      {
        id: randomUUID(),
        isNew: true as const,
        subcategory: subcategory.value,
        itemName: `무대 제작-${suffix}`,
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
  await setCustomerApproval(org.drafter.viewer, revision.id, { approvalBasis: "verbal", approvedOn: today, seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken });
  await saveRevenue(SYSTEM_VIEWER, project.id, {
    issuedEntries: [{ id: randomUUID(), isNew: true, entryDate: `${lastYear}-12-31`, amount: { currency: "KRW", amount: 1_000_000, fxRate: 1 } }],
  });

  // 증빙 업로드가 브라우저 경로라 제출만 화면으로 한다.
  const created = await createExpenseFromLines(org.drafter.viewer, { lineIds: [lineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  await saveExpenseDraft(org.drafter.viewer, { expenseId, expectedVersion: 1, fields: { note: "시안 캡처용 상세" } });
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    await page.goto("/login");
    // 하이드레이션 전에 채우면 입력이 덮인다 — React가 붙인 __reactProps$ 키를 본 뒤 채운다.
    const hydrated = (selector: () => ReturnType<typeof page.getByLabel>) =>
      expect.poll(() => selector().evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps$")))).toBe(true);
    await hydrated(() => page.getByLabel("이메일"));
    await page.getByLabel("이메일").fill(org.drafter.email);
    await page.getByLabel("비밀번호").fill(org.drafter.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto(`/expenses/${expenseId}`);
    await expect
      .poll(() => page.getByRole("button", { name: /^임시 저장/ }).evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps$"))))
      .toBe(true);
    // 같은 파일 내용은 이미 첨부된 파일로 걸러지므로(캡처 안에서 시드가 여러 번 돈다) 매번 다른 내용의 영수증 사진을 화면에서 만든다.
    const tag = randomUUID();
    const base64 = await page.evaluate(async (label) => {
      const canvas = document.createElement("canvas");
      canvas.width = 3000;
      canvas.height = 2000;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("캔버스를 만들 수 없다");
      ctx.fillStyle = "#eef2f1";
      ctx.fillRect(0, 0, 3000, 2000);
      ctx.fillStyle = "#1f2d29";
      ctx.font = "bold 90px sans-serif";
      ctx.fillText(label, 100, 300);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
      if (!blob) throw new Error("JPEG를 만들 수 없다");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    }, tag);
    await page.getByTestId("attachments-input").setInputFiles({ name: `receipt-${tag.slice(0, 8)}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(base64, "base64") });
    await expect(page.locator('[data-ui="attachments"] li').getByText(/^\d+KB · \d{2}-\d{2}$/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /^지출결의 제출/ }).click();
    await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}\\?submitted=1$`));
  } finally {
    await context.close();
  }

  const view = await getApprovalView(org.teamLead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 인스턴스가 없습니다");
  let version = view.version;
  for (const approver of [org.teamLead, org.divisionHead, org.mgmt, org.ceo]) {
    const result = await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: version });
    version = result.version;
    if (approver === org.ceo && result.status !== "approved") throw new Error(`결재 통과 안 됨: ${result.status}`);
  }
  // 증빙 무효 처리 권한만 가진 전사 범위 계급(결재선 밖 전용 팀).
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `캡처경영관리-${suffix}`, workScope: "company", viewScope: "company" });
  for (const menu of ["expenses", "expenses.evidence_attach", "expenses.evidence_void"]) {
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu, action: menu === "expenses" ? "view" : "write", allowed: true });
  }
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  const voiderUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `캡처지원본부-${suffix}` });
  const voiderTeam = await createTeam(SYSTEM_VIEWER, { orgUnitId: voiderUnit.id, name: `캡처지원팀-${suffix}` });
  const voider = await makePerson("경영지원", role.id, voiderTeam.id, yearStart);
  const alive = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.ownerKind, EXPENSE_DOCUMENT_KIND), eq(files.ownerId, expenseId), isNull(files.removedAt), isNull(files.voidedAt)));
  for (const file of alive) await voidEvidence(voider.viewer, { fileId: file.id, reason: "다른 건 영수증" });
  // 종료일이 지난 진행 프로젝트는 이미 정산일 수 있다 — 자동 정산 뒤 상태로 확인한다.
  await applyAutoSettlement({ projectIds: [project.id] });
  if ((await findProjectById(SYSTEM_VIEWER, project.id))?.status !== "settling") throw new Error("정산 상태가 아닙니다");
  return { vars: { projectId: project.id }, viewer: org.drafter };
}

// purchase-approval-pending: 진행 프로젝트의 현재(1차) 차수가 고객 승인 전 — 온라인구매 협력사 줄의 `구매 요청` 문이 닫힌 화면(06-35).
// 설정 `purchase.online_vendor_name`은 전역 한 칸이라 시드가 값을 쓴다. test/e2e/online-vendor.ts와 같은 흐름이지만 scripts는 test를 import할 수 없어 다시 쓴다.
const CAPTURE_ONLINE_VENDOR_NAME = "캡처온라인구매협력사";

async function purchaseApprovalPending(): Promise<SeedResult> {
  const today = seoulToday();
  const year = today.slice(0, 4);
  const suffix = randomUUID().slice(0, 6);
  const yearStart = `${year}-01-01`;
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `캡처구매본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `캡처구매팀-${suffix}` });
  const pm = await makePerson("담당", "role-pm", team.id, yearStart);
  const teamLead = await makePerson("팀장", "role-team-lead", team.id, yearStart);
  await setSettingValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME, CAPTURE_ONLINE_VENDOR_NAME);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `캡처클라이언트-${suffix}`, normalizedName: `캡처클라이언트-${suffix}` });
  const onlineVendor = await insertVendor(SYSTEM_VIEWER, { name: CAPTURE_ONLINE_VENDOR_NAME, normalizedName: CAPTURE_ONLINE_VENDOR_NAME.toLowerCase() });
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `캡처거래처-${suffix}`, normalizedName: `캡처거래처-${suffix}` });
  const project = await createProject(pm.viewer, {
    clientId: client.id,
    teamId: team.id,
    pmUserId: pm.viewer.id,
    name: `캡처구매-${suffix}`,
    startDate: yearStart,
    endDate: `${year}-12-31`,
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision || !project.id) throw new Error("프로젝트 · 1차 차수가 없습니다");
  const [subcategory] = await listCodeItems(SYSTEM_VIEWER, {
    tableKey: QUOTE_SUBCATEGORY_TABLE_KEY,
    scope: { rows: "all", includeArchived: false },
    includeInactive: false,
  });
  if (!subcategory) throw new Error("시드된 quote_subcategory 코드 항목이 없습니다");
  const row = (itemName: string, vendorId: string) => ({
    id: randomUUID(),
    isNew: true as const,
    subcategory: subcategory.value,
    itemName,
    vendorId,
    unitPrice: { currency: "KRW" as const, amount: 1_200_000, fxRate: 1 },
    execution: { currency: "KRW" as const, amount: 1_000_000, fxRate: 1 },
  });
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: [row(`온라인 소모품-${suffix}`, onlineVendor.id), row(`무대 제작-${suffix}`, vendor.id)],
  });
  // 고객 승인 표시는 하지 않는다 — 그 상태가 이 시나리오다.
  await changeProjectStatus(teamLead.viewer, project.id, { from: "bidding", to: "in_progress" });
  return { vars: { projectId: project.id }, viewer: pm };
}

// payment-and-settlement-actions: 같은 프로젝트에 (a) 결재 통과 · 지급 전 지출결의 1건(증빙 살아 있음 — 지급 행동 줄) (b) 반려된 정산 문서(06-39). 기안자(담당 PM)로 본다.
// 정산 제출 준비는 test/e2e/settlement-fixture.ts와 같은 흐름이지만 scripts는 test를 import할 수 없어 다시 쓴다.
async function paymentAndSettlementActions(browser: Browser, baseURL: string | undefined): Promise<SeedResult> {
  const today = seoulToday();
  const lastYear = Number(today.slice(0, 4)) - 1;
  const suffix = randomUUID().slice(0, 6);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `캡처지급본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `캡처지급팀-${suffix}` });
  const mgmtTeam = (await listTeams(SYSTEM_VIEWER)).find((candidate) => candidate.name === "경영관리팀");
  if (!mgmtTeam) throw new Error("시드된 경영관리팀 없음");
  const drafter = await makePerson("기안", "role-pm", team.id, yearStart);
  const teamLead = await makePerson("팀장", "role-team-lead", team.id, yearStart);
  const divisionHead = await makePerson("본부장", "role-division-head", team.id, yearStart);
  const mgmt = await mgmtHead(mgmtTeam, yearStart);
  const ceo = await makePerson("대표", "role-ceo", team.id, yearStart);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `캡처클라이언트-${suffix}`, normalizedName: `캡처클라이언트-${suffix}` });
  // 새 초안의 지급 방식 기본값이 계좌이체라 거래처에 쓸 수 있는 계좌가 있어야 제출 버튼이 열린다.
  const account = planAccountNumberUpdate("110-123-456789");
  if (account.kind !== "set") throw new Error("계좌번호 암호화 계획 없음");
  const vendor = await insertVendor(SYSTEM_VIEWER, {
    name: `캡처거래처-${suffix}`,
    normalizedName: `캡처거래처-${suffix}`,
    defaultEvidenceType: "tax_invoice",
    accountBank: "신한은행",
    accountHolder: "테스트 예금주",
    accountNumberEncrypted: account.accountNumberEncrypted,
    accountNumberLast4: account.accountNumberLast4,
  });
  const project = await createProject(drafter.viewer, {
    clientId: client.id,
    teamId: team.id,
    pmUserId: drafter.viewer.id,
    name: `캡처지급정산-${suffix}`,
    startDate: `${lastYear}-11-01`,
    endDate: `${lastYear}-12-31`,
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision || !project.id) throw new Error("프로젝트 · 1차 차수가 없습니다");
  const [subcategory] = await listCodeItems(SYSTEM_VIEWER, {
    tableKey: QUOTE_SUBCATEGORY_TABLE_KEY,
    scope: { rows: "all", includeArchived: false },
    includeInactive: false,
  });
  if (!subcategory) throw new Error("시드된 quote_subcategory 코드 항목이 없습니다");
  const row = (itemName: string) => ({
    id: randomUUID(),
    isNew: true as const,
    subcategory: subcategory.value,
    itemName,
    vendorId: vendor.id,
    unitPrice: { currency: "KRW" as const, amount: 13_400_000, fxRate: 1 },
    execution: { currency: "KRW" as const, amount: 12_400_000, fxRate: 1 },
  });
  const saved = await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [row(`무대 제작-${suffix}`), row(`영상 제작-${suffix}`)] });
  const [expenseLineId, cardLineId] = [saved.lines[0]?.id, saved.lines[1]?.id];
  if (!expenseLineId || !cardLineId) throw new Error("견적 줄이 없습니다");
  await changeProjectStatus(teamLead.viewer, project.id, { from: "bidding", to: "in_progress" });
  const basis = await approvalBasis(SYSTEM_VIEWER, revision.id);
  await setCustomerApproval(drafter.viewer, revision.id, { approvalBasis: "verbal", approvedOn: today, seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken });
  await saveRevenue(SYSTEM_VIEWER, project.id, {
    issuedEntries: [{ id: randomUUID(), isNew: true, entryDate: `${lastYear}-12-31`, amount: { currency: "KRW", amount: 1_000_000, fxRate: 1 } }],
  });
  // 정산 제출 점검을 통과하도록 카드 줄에 법인카드 사용 1건.
  const tag = randomUUID().slice(0, 8);
  const card = await createCorpCard(SYSTEM_VIEWER, {
    issuer: `캡처카드사-${tag}`,
    numberLast4: String(1000 + Math.floor(Math.random() * 9000)),
    label: `캡처카드-${tag}`,
    kind: "personal",
    holderUserId: drafter.viewer.id,
  });
  if (!card.id) throw new Error("카드 id 없음");
  const usage: CardUsageInput = {
    corpCardId: card.id,
    usedOn: today,
    merchantVendorId: null,
    total: { currency: "KRW", amount: 100_000, fxRate: 1 },
    evidenceTypeCode: "invoice",
    linkKind: "quote_line",
    lineId: cardLineId,
    memo: null,
  };
  const cardUsage = await createCardUsage(drafter.viewer, usage, await precheckCardUsage(drafter.viewer, usage));

  const created = await createExpenseFromLines(drafter.viewer, { lineIds: [expenseLineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  await saveExpenseDraft(drafter.viewer, { expenseId, expectedVersion: 1, fields: { note: "시안 캡처용 상세" } });
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    await page.goto("/login");
    const hydrated = (selector: () => ReturnType<typeof page.getByLabel>) =>
      expect.poll(() => selector().evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps$")))).toBe(true);
    await hydrated(() => page.getByLabel("이메일"));
    await page.getByLabel("이메일").fill(drafter.email);
    await page.getByLabel("비밀번호").fill(drafter.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto(`/expenses/${expenseId}`);
    await expect
      .poll(() => page.getByRole("button", { name: /^임시 저장/ }).evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps$"))))
      .toBe(true);
    // 같은 사진은 중복으로 거절된다(내용 해시) — 시드가 캡처마다 돌므로 매번 다른 그림을 캔버스로 그려 올린다(test/e2e/expense-fixture.ts uniqueReceipt와 같은 방식).
    const tag = randomUUID();
    const base64 = await page.evaluate(async (label) => {
      const canvas = document.createElement("canvas");
      canvas.width = 3000;
      canvas.height = 2000;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("캔버스를 만들 수 없다");
      ctx.fillStyle = "#eef2f1";
      ctx.fillRect(0, 0, 3000, 2000);
      ctx.fillStyle = "#1f2d29";
      ctx.font = "bold 90px sans-serif";
      ctx.fillText(label, 100, 300);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
      if (!blob) throw new Error("JPEG를 만들 수 없다");
      let binary = "";
      for (const byte of new Uint8Array(await blob.arrayBuffer())) binary += String.fromCharCode(byte);
      return btoa(binary);
    }, tag);
    await page.getByTestId("attachments-input").setInputFiles({ name: `receipt-${tag.slice(0, 8)}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(base64, "base64") });
    await expect(page.locator('[data-ui="attachments"] li').getByText(/^\d+KB · \d{2}-\d{2}$/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /^지출결의 제출/ }).click();
    await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}\\?submitted=1$`));
  } finally {
    await context.close();
  }
  const view = await getApprovalView(teamLead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 인스턴스가 없습니다");
  let version = view.version;
  for (const approver of [teamLead, divisionHead, mgmt, ceo]) {
    const result = await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: version });
    version = result.version;
    if (approver === ceo && result.status !== "approved") throw new Error(`결재 통과 안 됨: ${result.status}`);
  }

  // 종료일이 지난 진행 프로젝트 → 자동 정산 → 정산 결재 제출 → 대표 반려.
  await applyAutoSettlement({ projectIds: [project.id] });
  if ((await findProjectById(SYSTEM_VIEWER, project.id))?.status !== "settling") throw new Error("정산 상태가 아닙니다");
  const submitted = await submitSettlement(drafter.viewer, { projectId: project.id });
  if (submitted.kind !== "submitted") throw new Error("정산 결재가 올라가지 않았습니다");
  const graph = await findApprovalGraphByDocument(SYSTEM_VIEWER, { documentKind: SETTLEMENT_DOCUMENT_KIND, documentId: project.id });
  if (!graph) throw new Error("정산 결재 인스턴스가 없습니다");
  await rejectDocument(ceo.viewer, { instanceId: graph.instance.id, expectedVersion: graph.instance.version, reason: "실행가 확인" });

  // 기안자(담당 PM)가 정산 다시 올리기와 지급 행동 줄을 한 화면 세션에서 모두 보도록 role-pm에 지급·증빙 무효 쓰기를 준다(erp_test는 캡처마다 초기화된다).
  for (const menu of ["expenses.payments", "expenses.evidence_void"]) await upsertPermission(SYSTEM_VIEWER, { roleId: "role-pm", menu, action: "write", allowed: true });
  // 07.3-01(D-7301): 자금 키는 자금 본부 소속에만 통한다 — 이 캡처 DB에서만 자금 본부를 기안자 본부로 둔다.
  await setSettingValue(SYSTEM_VIEWER, FUND_DIVISION_ORG_UNIT, orgUnit.id);
  return { vars: { projectId: project.id, expenseId, cardUsageId: cardUsage.id }, viewer: drafter };
}

// ── 06.1-05(Round 2 G5) 증빙 시드 둘 — 06.1-05 · 06 · 07 · 08 · 09 · 13의 Codex 캡처가 쓴다 ──────────────────────────────────────
// 증빙 기록은 06.1-01 스키마로 db에 직접 넣는다(업로드 경로는 생성기 바이트가 필요한데 scripts는 test를 import할 수 없다 · 붙이기 경로는 06.1-06).
// 한 묶음 = 한 서식(실제 업로드 한 번)이라 홈택스 · 카드 묶음을 따로 둔다. 금액은 모두 1,000원 이상 — 보고서 「핵심 칸 글자」가 쉼표 있는 금액으로 잰다.

// 오늘(서울)에서 n일 전 — 달력 날짜끼리의 셈이라 UTC 자정으로 센다.
function daysBefore(today: string, n: number): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - n);
  return date.toISOString().slice(0, 10);
}

function digits(n: number): string {
  return Array.from({ length: n }, () => randomInt(10)).join("");
}

// 홈택스 승인번호 꼴(작성일자 8자리 - 8자리 - 8자리).
function hometaxApprovalNo(issuedOn: string): string {
  return `${issuedOn.replaceAll("-", "")}-4100${digits(4)}-${digits(8)}`;
}

// 이미 쓰인 카드 끝 4자리 — corp_cards (issuer, last4)가 유일하고 캡처는 경로마다 시드를 다시 돌린다. 카드 미등록 줄의 번호도 어느 카드와도 겹치지 않게 고른다.
async function takenCardLast4(): Promise<Set<string>> {
  return new Set((await db.select({ last4: corpCards.numberLast4 }).from(corpCards)).map((row) => row.last4));
}

function pickCardLast4(taken: Set<string>): string {
  for (;;) {
    const last4 = String(randomInt(1000, 10_000));
    if (!taken.has(last4)) {
      taken.add(last4);
      return last4;
    }
  }
}

type EvidenceSeedRow = Omit<typeof evidenceRecords.$inferInsert, "id" | "batchId" | "format" | "evidenceType" | "dedupeKey" | "totalKrw" | "createdBy">;

// 등록 묶음 한 줄과 그 기록들. id는 여기서 만든다 — 돌려주는 recordIds가 rows 순서 그대로다(RETURNING 순서에 기대지 않는다).
async function insertEvidenceBatch(
  input: { format: string; evidenceType: string; originalName: string; uploadedBy: string },
  rows: EvidenceSeedRow[],
): Promise<{ batchId: string; recordIds: string[] }> {
  const batchId = randomUUID();
  await db.insert(evidenceImportBatches).values({
    id: batchId,
    format: input.format,
    originalName: input.originalName,
    fileSha256: createHash("sha256").update(batchId).digest("hex"),
    rowCount: rows.length,
    registeredCount: rows.length,
    skippedDuplicateCount: 0,
    uploadedBy: input.uploadedBy,
  });
  const values = rows.map((row) => ({
    ...row,
    id: randomUUID(),
    batchId,
    format: input.format,
    evidenceType: input.evidenceType,
    dedupeKey: `capture:${randomUUID()}`,
    totalKrw: row.supplyKrw + row.vatKrw,
    createdBy: input.uploadedBy,
  }));
  await db.insert(evidenceRecords).values(values);
  return { batchId, recordIds: values.map((value) => value.id) };
}

// 지출결의 문서 화면의 기본 지급 방식이 계좌이체라 거래처에 쓸 수 있는 계좌가 있어야 제출 버튼이 열린다(payment-and-settlement-actions와 같은 까닭).
async function vendorWithAccount(name: string) {
  const account = planAccountNumberUpdate("110-123-456789");
  if (account.kind !== "set") throw new Error("계좌번호 암호화 계획 없음");
  return insertVendor(SYSTEM_VIEWER, {
    name,
    normalizedName: name,
    defaultEvidenceType: "tax_invoice",
    accountBank: "신한은행",
    accountHolder: "테스트 예금주",
    accountNumberEncrypted: account.accountNumberEncrypted,
    accountNumberLast4: account.accountNumberLast4,
  });
}

// 올해 진행 프로젝트(자동 정산되지 않는다) · 고객 승인 · 실행가를 준 견적 줄 — 돌려주는 줄 id는 executions 순서다.
async function inProgressProjectLines(
  input: { suffix: string; teamId: string; pm: Person; teamLead: Person; vendorId: string },
  executions: number[],
): Promise<{ projectId: string; lineIds: string[] }> {
  const today = seoulToday();
  const year = today.slice(0, 4);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `캡처클라이언트-${input.suffix}`, normalizedName: `캡처클라이언트-${input.suffix}` });
  const project = await createProject(input.pm.viewer, {
    clientId: client.id,
    teamId: input.teamId,
    pmUserId: input.pm.viewer.id,
    name: `캡처증빙-${input.suffix}`,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision || !project.id) throw new Error("프로젝트 · 1차 차수가 없습니다");
  const [subcategory] = await listCodeItems(SYSTEM_VIEWER, {
    tableKey: QUOTE_SUBCATEGORY_TABLE_KEY,
    scope: { rows: "all", includeArchived: false },
    includeInactive: false,
  });
  if (!subcategory) throw new Error("시드된 quote_subcategory 코드 항목이 없습니다");
  const itemNames = ["무대 제작", "영상 제작", "현장 운영"];
  const saved = await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: executions.map((amount, index) => ({
      id: randomUUID(),
      isNew: true as const,
      subcategory: subcategory.value,
      itemName: `${itemNames[index % itemNames.length] ?? "제작"}-${input.suffix}`,
      vendorId: input.vendorId,
      unitPrice: { currency: "KRW" as const, amount: amount + 1_000_000, fxRate: 1 },
      execution: { currency: "KRW" as const, amount, fxRate: 1 },
    })),
  });
  const lineIds = saved.lines.flatMap((line) => (line.id ? [line.id] : []));
  if (lineIds.length !== executions.length) throw new Error("견적 줄이 없습니다");
  await changeProjectStatus(input.teamLead.viewer, project.id, { from: "bidding", to: "in_progress" });
  const basis = await approvalBasis(SYSTEM_VIEWER, revision.id);
  await setCustomerApproval(input.pm.viewer, revision.id, { approvalBasis: "verbal", approvedOn: today, seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken });
  return { projectId: project.id, lineIds };
}

// requested 구매 요청 하나 — 팀 비용 갈래(견적 줄 갈래는 온라인구매 협력사 설정 · 줄이 따로 필요하다). 요청자는 오늘 소속이 있어야 한다.
async function requestedPurchase(requester: Person, suffix: string): Promise<string> {
  const request = { linkKind: "team_cost" as const, itemName: `캡처구매물품-${suffix}`, linkUrl: null, estimate: { currency: "KRW" as const, amount: 55_000, fxRate: 1 }, memo: null };
  const created = await createPurchaseRequest(requester.viewer, request, await precheckPurchaseRequest(requester.viewer, request));
  return created.id;
}

// evidence-intake-filled: viewer = 경영관리 등록 계급(임시 계급 · 업무 · 보는 범위 company — UI-SPEC 「권한·노출」 경영관리 행 그대로).
// 06 · 09가 찍는 결재 중 문서 · /cards · S8도 이 viewer로 열려야 한다(404는 Codex 실패 — 재검토 2회차 Codex A).
const EVIDENCE_INTAKE_PERMISSIONS = [
  { menu: "evidence.intake", action: "write" },
  { menu: "evidence", action: "view" },
  { menu: "expenses", action: "view" },
  { menu: "expenses.evidence_attach", action: "write" },
  { menu: "cards", action: "view" },
  { menu: "cards.proxy", action: "write" },
] as const;

// 새 임시 계급에는 기본 노출 행이 없어(domain/permissions/visible.ts — 행 없음 = 거짓) 05 증빙 표 · 06 문서 화면 · 09 카드 사용 칸이 빈 채로
// Codex에 간다 — 그 화면들이 읽는 정보 항목 열넷을 이름으로 켠다(재검토 3회차 M1 · domain/permissions/info-items.ts INFO_ITEMS에 다 있다).
const EVIDENCE_INTAKE_INFO_ITEMS = [
  "evidence.value",
  "evidence.amount",
  "expense.value",
  "expense.amount",
  "approval.value",
  "person.value",
  "team.value",
  "vendor.value",
  "card_usage.value",
  "card_usage.amount",
  "project.value",
  "quote.amount",
  "purchase_request.value",
  "purchase_request.amount",
] as const;

// 증빙 상태마다 한 줄 이상(미공개 · 팀 공개 · 붙음 · 확인 필요 · 카드 미등록 · 짝 없음 · 음수) + 결재 중 지출결의(프로젝트 · 견적 줄 문서 — 붙은 증빙 블록) ·
// requested 구매 요청 · 카드 사용 한 줄. vars = { expenseId, recordId(미공개 줄), purchaseId, batchId(카드 묶음), unmatchedRecordId(짝 없음 줄) }.
async function evidenceIntakeFilled(browser: Browser, baseURL: string | undefined): Promise<SeedResult> {
  const today = seoulToday();
  const suffix = randomUUID().slice(0, 6);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `캡처증빙본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `캡처증빙팀-${suffix}` });
  const mgmtTeam = (await listTeams(SYSTEM_VIEWER)).find((candidate) => candidate.name === "경영관리팀");
  if (!mgmtTeam) throw new Error("시드된 경영관리팀 없음");
  // 결재선(팀장 · 본부장 · 경영관리 · 대표)이 서야 제출된다 — payment-and-settlement-actions와 같은 사람들.
  const drafter = await makePerson("기안", "role-pm", team.id, yearStart);
  const teamLead = await makePerson("팀장", "role-team-lead", team.id, yearStart);
  await makePerson("본부장", "role-division-head", team.id, yearStart);
  await mgmtHead(mgmtTeam, yearStart);
  await makePerson("대표", "role-ceo", team.id, yearStart);

  // 등록 계급의 사람은 결재선 밖 전용 팀에 둔다(pre-settle-evidence-pending의 증빙 무효 계급과 같은 꼴).
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `캡처증빙등록-${suffix}`, workScope: "company", viewScope: "company" });
  for (const { menu, action } of EVIDENCE_INTAKE_PERMISSIONS) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu, action, allowed: true });
  for (const infoItem of EVIDENCE_INTAKE_INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  const registrarUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `캡처증빙지원본부-${suffix}` });
  const registrarTeam = await createTeam(SYSTEM_VIEWER, { orgUnitId: registrarUnit.id, name: `캡처증빙지원팀-${suffix}` });
  const registrar = await makePerson("경영등록", role.id, registrarTeam.id, yearStart);

  const vendorName = `캡처거래처-${suffix}`;
  const supplierName = `캡처공급사-${suffix}`;
  const vendor = await vendorWithAccount(vendorName);
  const supplier = await insertVendor(SYSTEM_VIEWER, { name: supplierName, normalizedName: supplierName, defaultEvidenceType: "tax_invoice" });
  const {
    lineIds: [expenseLineId, cardLineId],
  } = await inProgressProjectLines({ suffix, teamId: team.id, pm: drafter, teamLead, vendorId: vendor.id }, [1_240_000, 1_500_000]);
  if (!expenseLineId || !cardLineId) throw new Error("견적 줄이 없습니다");

  // 카드 사용 한 줄(M1 — 09 /cards가 빈 목록이 아니게). 짝 없음 증빙 줄과 다른 카드 · 다른 사용일 · 다른 합계라 PA-RELAX 완화 후보가 되지 않는다.
  const taken = await takenCardLast4();
  const usageCard = await createCorpCard(SYSTEM_VIEWER, {
    issuer: `캡처카드사-${suffix}`,
    numberLast4: pickCardLast4(taken),
    label: `캡처카드-${suffix}`,
    kind: "personal",
    holderUserId: drafter.viewer.id,
  });
  if (!usageCard.id) throw new Error("카드 id 없음");
  const usage: CardUsageInput = {
    corpCardId: usageCard.id,
    usedOn: today,
    merchantVendorId: null,
    total: { currency: "KRW", amount: 100_000, fxRate: 1 },
    evidenceTypeCode: "invoice",
    linkKind: "quote_line",
    lineId: cardLineId,
    memo: null,
  };
  await createCardUsage(drafter.viewer, usage, await precheckCardUsage(drafter.viewer, usage));
  // 증빙 카드 줄의 등록 카드(기안자 소지 롯데) — 소지자의 오늘 팀이 제안 팀이다.
  const evidenceCardLast4 = pickCardLast4(taken);
  const unknownCardLast4 = pickCardLast4(taken);
  const evidenceCard = await createCorpCard(SYSTEM_VIEWER, {
    issuer: "롯데카드",
    numberLast4: evidenceCardLast4,
    label: `롯데 ${evidenceCardLast4}`,
    kind: "personal",
    holderUserId: drafter.viewer.id,
  });
  if (!evidenceCard.id) throw new Error("카드 id 없음");

  // 결재 중(제출된) 지출결의 — 증빙 업로드가 브라우저 경로라 제출은 화면으로 한다(같은 사진은 내용 해시로 거절돼 캔버스로 매번 다른 그림).
  const created = await createExpenseFromLines(drafter.viewer, { lineIds: [expenseLineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  await saveExpenseDraft(drafter.viewer, { expenseId, expectedVersion: 1, fields: { note: "시안 캡처용 상세" } });
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    await page.goto("/login");
    const hydrated = (selector: () => ReturnType<typeof page.getByLabel>) =>
      expect.poll(() => selector().evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps$")))).toBe(true);
    await hydrated(() => page.getByLabel("이메일"));
    await page.getByLabel("이메일").fill(drafter.email);
    await page.getByLabel("비밀번호").fill(drafter.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto(`/expenses/${expenseId}`);
    await expect
      .poll(() => page.getByRole("button", { name: /^임시 저장/ }).evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps$"))))
      .toBe(true);
    const tag = randomUUID();
    const base64 = await page.evaluate(async (label) => {
      const canvas = document.createElement("canvas");
      canvas.width = 3000;
      canvas.height = 2000;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("캔버스를 만들 수 없다");
      ctx.fillStyle = "#eef2f1";
      ctx.fillRect(0, 0, 3000, 2000);
      ctx.fillStyle = "#1f2d29";
      ctx.font = "bold 90px sans-serif";
      ctx.fillText(label, 100, 300);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
      if (!blob) throw new Error("JPEG를 만들 수 없다");
      let binary = "";
      for (const byte of new Uint8Array(await blob.arrayBuffer())) binary += String.fromCharCode(byte);
      return btoa(binary);
    }, tag);
    await page.getByTestId("attachments-input").setInputFiles({ name: `receipt-${tag.slice(0, 8)}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(base64, "base64") });
    await expect(page.locator('[data-ui="attachments"] li').getByText(/^\d+KB · \d{2}-\d{2}$/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /^지출결의 제출/ }).click();
    await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}\\?submitted=1$`));
  } finally {
    await context.close();
  }
  const purchaseId = await requestedPurchase(drafter, suffix);

  const savedNow = new Date();
  const hometax = await insertEvidenceBatch(
    { format: "hometax-tax-invoice", evidenceType: "tax_invoice", originalName: `홈택스_매입_세금계산서_${suffix}.xls`, uploadedBy: registrar.viewer.id },
    [
      // 미공개(recordId) — 공개 범위를 아직 저장하지 않은 줄이라 서버가 설정 본부 공개를 제안한다.
      { issuedOn: daysBefore(today, 1), approvalNo: hometaxApprovalNo(daysBefore(today, 1)), supplyKrw: 880_000, vatKrw: 88_000, vendorId: supplier.id, nameOnDocument: supplierName },
      // 팀 공개(저장됨)
      {
        issuedOn: daysBefore(today, 4),
        approvalNo: hometaxApprovalNo(daysBefore(today, 4)),
        supplyKrw: 2_150_000,
        vatKrw: 215_000,
        vendorId: supplier.id,
        nameOnDocument: supplierName,
        visibility: "team",
        visibleTeamId: team.id,
        visibilitySavedAt: savedNow,
      },
      // 붙음 — 결재 중 지출결의의 세금계산서(같은 거래처 · 견적 줄 실행가와 같은 공급가). 붙임 행은 아래에서 넣는다.
      {
        issuedOn: daysBefore(today, 6),
        approvalNo: hometaxApprovalNo(daysBefore(today, 6)),
        supplyKrw: 1_240_000,
        vatKrw: 124_000,
        vendorId: vendor.id,
        nameOnDocument: vendorName,
        visibilitySavedAt: savedNow,
      },
      // 음수 — 수정세금계산서(당초 승인번호 있음 · 감액). 공개할 수 없는 줄이라 2행이 다음 행동을 말한다.
      {
        issuedOn: daysBefore(today, 2),
        approvalNo: hometaxApprovalNo(daysBefore(today, 2)),
        supplyKrw: -300_000,
        vatKrw: -30_000,
        vendorId: supplier.id,
        nameOnDocument: supplierName,
        originalApprovalNo: hometaxApprovalNo(daysBefore(today, 40)),
      },
    ],
  );
  const card = await insertEvidenceBatch(
    { format: "card-lotte", evidenceType: "card_receipt", originalName: `롯데카드_매입내역_${suffix}.xls`, uploadedBy: registrar.viewer.id },
    [
      // 확인 필요 — 취소 표시가 있는 줄(06.1-04가 저장하는 사유 글 그대로).
      {
        issuedOn: daysBefore(today, 3),
        approvalNo: digits(8),
        supplyKrw: 45_000,
        vatKrw: 4_500,
        merchant: `캡처식당-${suffix}`,
        corpCardId: evidenceCard.id,
        cardLast4: evidenceCardLast4,
        needsCheck: "취소 표시 줄 · 원거래 확인",
      },
      // 카드 미등록 — 끝 4자리가 어느 등록 카드와도 맞지 않는다.
      { issuedOn: daysBefore(today, 2), approvalNo: digits(8), supplyKrw: 32_000, vatKrw: 3_200, merchant: `캡처주유소-${suffix}`, cardLast4: unknownCardLast4 },
      // 짝 없음(unmatchedRecordId) — 등록 카드 · 안 붙음 · 공개 범위 저장 전(소지자 팀 공개 제안).
      { issuedOn: daysBefore(today, 5), approvalNo: digits(8), supplyKrw: 120_000, vatKrw: 12_000, merchant: `캡처문구점-${suffix}`, corpCardId: evidenceCard.id, cardLast4: evidenceCardLast4 },
    ],
  );
  const [recordId, , attachedRecordId] = hometax.recordIds;
  const unmatchedRecordId = card.recordIds[2];
  if (!recordId || !attachedRecordId || !unmatchedRecordId) throw new Error("증빙 기록 id가 없습니다");
  // 살아 있는 붙임 한 줄(경영관리 붙임 — 06.1-06 붙이기 전이라 행으로 넣는다).
  await db.insert(evidenceRecordLinks).values({ evidenceRecordId: attachedRecordId, ownerKind: "expense", ownerId: expenseId, attachMode: "registrar", attachedBy: registrar.viewer.id });
  return { vars: { expenseId, recordId, purchaseId, batchId: card.batchId, unmatchedRecordId }, viewer: registrar };
}

// evidence-author-pick(06.1-08): viewer = 기안자(role-pm · 팀 발령 — 기본 노출 행이 깔린 시드 계급이라 정보 항목을 따로 켜지 않는다 · 새 임시 계급 없음).
// 그 팀 공개 기록 셋(종류 · 금액이 다름 — 세금계산서 · 수정세금계산서 · 카드 전표)과 그 사람의 작성 중 지출결의 · requested 구매 요청.
// vars = { expenseId, purchaseId }.
async function evidenceAuthorPick(): Promise<SeedResult> {
  const today = seoulToday();
  const suffix = randomUUID().slice(0, 6);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `캡처고르기본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `캡처고르기팀-${suffix}` });
  const mgmtTeam = (await listTeams(SYSTEM_VIEWER)).find((candidate) => candidate.name === "경영관리팀");
  if (!mgmtTeam) throw new Error("시드된 경영관리팀 없음");
  const drafter = await makePerson("기안", "role-pm", team.id, yearStart);
  const teamLead = await makePerson("팀장", "role-team-lead", team.id, yearStart);
  // 증빙을 올린 사람(경영관리팀) — 기록은 db에 직접 넣으므로 등록 권한을 주지 않는다.
  const registrar = await makePerson("경영", "role-pm", mgmtTeam.id, yearStart);

  const vendorName = `캡처거래처-${suffix}`;
  const vendor = await vendorWithAccount(vendorName);
  const {
    lineIds: [lineId],
  } = await inProgressProjectLines({ suffix, teamId: team.id, pm: drafter, teamLead, vendorId: vendor.id }, [1_240_000]);
  if (!lineId) throw new Error("견적 줄이 없습니다");
  const created = await createExpenseFromLines(drafter.viewer, { lineIds: [lineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  const purchaseId = await requestedPurchase(drafter, suffix);

  const cardLast4 = pickCardLast4(await takenCardLast4());
  const teamCard = await createCorpCard(SYSTEM_VIEWER, { issuer: "롯데카드", numberLast4: cardLast4, label: `롯데 ${cardLast4}`, kind: "team", teamId: team.id });
  if (!teamCard.id) throw new Error("카드 id 없음");
  const teamPublic = { visibility: "team", visibleTeamId: team.id, visibilitySavedAt: new Date() };
  await insertEvidenceBatch(
    { format: "hometax-tax-invoice", evidenceType: "tax_invoice", originalName: `홈택스_매입_세금계산서_${suffix}.xls`, uploadedBy: registrar.viewer.id },
    [
      // 세금계산서 — 작성 중 지출결의와 같은 거래처 · 공급가(그 문서에 고를 증빙).
      { issuedOn: daysBefore(today, 3), approvalNo: hometaxApprovalNo(daysBefore(today, 3)), supplyKrw: 1_240_000, vatKrw: 124_000, vendorId: vendor.id, nameOnDocument: vendorName, ...teamPublic },
      // 수정세금계산서(증액 — 당초 승인번호 있음 · 양수라 공개할 수 있다).
      {
        issuedOn: daysBefore(today, 1),
        approvalNo: hometaxApprovalNo(daysBefore(today, 1)),
        supplyKrw: 200_000,
        vatKrw: 20_000,
        vendorId: vendor.id,
        nameOnDocument: vendorName,
        originalApprovalNo: hometaxApprovalNo(daysBefore(today, 30)),
        ...teamPublic,
      },
    ],
  );
  await insertEvidenceBatch({ format: "card-lotte", evidenceType: "card_receipt", originalName: `롯데카드_매입내역_${suffix}.xls`, uploadedBy: registrar.viewer.id }, [
    // 카드 전표 — 팀 카드 · 등록됨.
    { issuedOn: daysBefore(today, 2), approvalNo: digits(8), supplyKrw: 44_000, vatKrw: 4_400, merchant: `캡처문구점-${suffix}`, corpCardId: teamCard.id, cardLast4, ...teamPublic },
  ]);
  return { vars: { expenseId, purchaseId }, viewer: drafter };
}

// evidence-private-type(06.1-14 · G15): 관리자 길(`setCodeItemActive` — 카드 R6 켜기 길 그대로)로 「개인카드 전표」를 켜고, 기안자가 그 증빙 종류인
// 지출결의(프로젝트 · 견적 줄 문서)에 05 파일 하나를 올려 제출한다. viewer = 첫 결재자 = 그 팀 `role-team-lead` 사람(기본 노출 행이 깔린 시드 계급 —
// 새 임시 계급 0). 결재자 화면에서는 남의 05 파일이 빠지고 잠김 줄 한 줄만 선다(RP-15 ⑵). vars = { expenseId }.
async function evidencePrivateType(browser: Browser, baseURL: string | undefined): Promise<SeedResult> {
  const today = seoulToday();
  const suffix = randomUUID().slice(0, 6);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `캡처비공개본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `캡처비공개팀-${suffix}` });
  const drafter = await makePerson("기안", "role-pm", team.id, yearStart);
  const teamLead = await makePerson("팀장", "role-team-lead", team.id, yearStart);
  const vendor = await vendorWithAccount(`캡처거래처-${suffix}`);
  const {
    lineIds: [lineId],
  } = await inProgressProjectLines({ suffix, teamId: team.id, pm: drafter, teamLead, vendorId: vendor.id }, [2_400_000]);
  if (!lineId) throw new Error("견적 줄이 없습니다");

  // 06.1-01이 꺼 둔 채 시드한 종류를 관리자 길로 켠다 — 꺼져 있으면 기안자가 고를 수 없다(assertActiveCodes).
  const privateItem = (
    await listCodeItems(SYSTEM_VIEWER, { tableKey: "evidence_type", scope: { rows: "all", includeArchived: false }, includeInactive: true })
  ).find((item) => item.value === PRIVATE_EVIDENCE_TYPE);
  if (!privateItem) throw new Error("개인카드 전표 코드 항목 없음");
  await setCodeItemActive(SYSTEM_VIEWER, privateItem.id, true);

  const created = await createExpenseFromLines(drafter.viewer, { lineIds: [lineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  const draft = await findExpenseById(drafter.viewer, expenseId);
  if (!draft) throw new Error("작성 중 문서를 찾지 못했다");
  await saveExpenseDraft(drafter.viewer, { expenseId, expectedVersion: draft.version, fields: { evidenceType: PRIVATE_EVIDENCE_TYPE, note: "시안 캡처용 상세" } });

  // 증빙 올리기가 브라우저 경로라 올리기 · 제출만 화면으로 한다(preSettleEvidencePending 꼴).
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    await page.goto("/login");
    const hydrated = (selector: () => ReturnType<typeof page.getByLabel>) =>
      expect.poll(() => selector().evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps$")))).toBe(true);
    await hydrated(() => page.getByLabel("이메일"));
    await page.getByLabel("이메일").fill(drafter.email);
    await page.getByLabel("비밀번호").fill(drafter.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto(`/expenses/${expenseId}`);
    await expect
      .poll(() => page.getByRole("button", { name: /^임시 저장/ }).evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps$"))))
      .toBe(true);
    // 같은 파일 내용은 이미 첨부된 파일로 걸러지므로(캡처 안에서 시드가 여러 번 돈다) 매번 다른 내용의 영수증 사진을 화면에서 만든다.
    const tag = randomUUID();
    const base64 = await page.evaluate(async (label) => {
      const canvas = document.createElement("canvas");
      canvas.width = 3000;
      canvas.height = 2000;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("캔버스를 만들 수 없다");
      ctx.fillStyle = "#eef2f1";
      ctx.fillRect(0, 0, 3000, 2000);
      ctx.fillStyle = "#1f2d29";
      ctx.font = "bold 90px sans-serif";
      ctx.fillText(label, 100, 300);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
      if (!blob) throw new Error("JPEG를 만들 수 없다");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    }, tag);
    await page.getByTestId("attachments-input").setInputFiles({ name: `receipt-${tag.slice(0, 8)}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(base64, "base64") });
    await expect(page.locator('[data-ui="attachments"] li').getByText(/^\d+KB · \d{2}-\d{2}$/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /^지출결의 제출/ }).click();
    await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}\\?submitted=1$`));
  } finally {
    await context.close();
  }

  const view = await getApprovalView(teamLead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 인스턴스가 없습니다");
  return { vars: { expenseId }, viewer: teamLead };
}

// print-expense: 07.4-01 지출결의서 인쇄물 캡처용 — 결재 중 문서 1건(기안 · 팀장 승인 · 경영관리 승인 · 대표 대기, 증빙 1개)과 회사 정보 다섯 키.
// {expenseId}는 /print/expenses/{expenseId} · /expenses/{expenseId} 경로 자리다. 보는 사람은 팀장(결재선 전체를 보는 계급).
async function printExpense(browser: Browser, baseURL: string | undefined): Promise<SeedResult> {
  const today = seoulToday();
  const suffix = randomUUID().slice(0, 6);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `캡처인쇄본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `캡처인쇄팀-${suffix}` });
  const mgmtTeam = (await listTeams(SYSTEM_VIEWER)).find((candidate) => candidate.name === "경영관리팀");
  if (!mgmtTeam) throw new Error("시드된 경영관리팀 없음");
  const drafter = await makePerson("기안", "role-pm", team.id, yearStart);
  const teamLead = await makePerson("팀장", "role-team-lead", team.id, yearStart);
  const mgmt = await mgmtHead(mgmtTeam, yearStart);
  await makePerson("대표", "role-ceo", team.id, yearStart);
  const vendor = await vendorWithAccount(`캡처거래처-${suffix}`);
  const {
    lineIds: [lineId],
  } = await inProgressProjectLines({ suffix, teamId: team.id, pm: drafter, teamLead, vendorId: vendor.id }, [12_400_000]);
  if (!lineId) throw new Error("견적 줄이 없습니다");

  await setSettingValue(SYSTEM_VIEWER, PRINT_COMPANY_NAME, "플랜트에이트 주식회사");
  await setSettingValue(SYSTEM_VIEWER, PRINT_COMPANY_ADDRESS, "서울특별시 성동구 왕십리로 10");
  await setSettingValue(SYSTEM_VIEWER, PRINT_COMPANY_BUSINESS_NO, "123-45-67890");
  await setSettingValue(SYSTEM_VIEWER, PRINT_COMPANY_REPRESENTATIVE, "김대표");
  await setSettingValue(SYSTEM_VIEWER, PRINT_COMPANY_PHONE, "02-123-4567");

  const created = await createExpenseFromLines(drafter.viewer, { lineIds: [lineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  const draft = await findExpenseById(drafter.viewer, expenseId);
  if (!draft) throw new Error("작성 중 문서를 찾지 못했다");
  await saveExpenseDraft(drafter.viewer, { expenseId, expectedVersion: draft.version, fields: { note: "시안 캡처용 상세 — 메인 스테이지 구조물 설치 및 철거" } });

  // 증빙 올리기가 브라우저 경로라 올리기 · 제출만 화면으로 한다(evidencePrivateType 꼴).
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    await page.goto("/login");
    const hydrated = (selector: () => ReturnType<typeof page.getByLabel>) =>
      expect.poll(() => selector().evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps$")))).toBe(true);
    await hydrated(() => page.getByLabel("이메일"));
    await page.getByLabel("이메일").fill(drafter.email);
    await page.getByLabel("비밀번호").fill(drafter.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto(`/expenses/${expenseId}`);
    await expect
      .poll(() => page.getByRole("button", { name: /^임시 저장/ }).evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps$"))))
      .toBe(true);
    const tag = randomUUID();
    const base64 = await page.evaluate(async (label) => {
      const canvas = document.createElement("canvas");
      canvas.width = 3000;
      canvas.height = 2000;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("캔버스를 만들 수 없다");
      ctx.fillStyle = "#eef2f1";
      ctx.fillRect(0, 0, 3000, 2000);
      ctx.fillStyle = "#1f2d29";
      ctx.font = "bold 90px sans-serif";
      ctx.fillText(label, 100, 300);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
      if (!blob) throw new Error("JPEG를 만들 수 없다");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    }, tag);
    await page.getByTestId("attachments-input").setInputFiles({ name: `receipt-${tag.slice(0, 8)}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(base64, "base64") });
    await expect(page.locator('[data-ui="attachments"] li').getByText(/^\d+KB · \d{2}-\d{2}$/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /^지출결의 제출/ }).click();
    await expect(page).toHaveURL(new RegExp(`/expenses/${expenseId}\\?submitted=1$`));
  } finally {
    await context.close();
  }

  // 팀장 → 경영관리 승인, 대표가 남는다(빈 본부장 자리는 건너뛴다).
  const view = await getApprovalView(teamLead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 인스턴스가 없습니다");
  let version = view.version;
  for (const approver of [teamLead, mgmt]) {
    const result = await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: version });
    version = result.version;
  }
  return { vars: { expenseId }, viewer: teamLead };
}

// 07.4-02 date helpers — 서버가 휴일 · 겹침을 거절하면(LeaveValidationError) 다음 영업일을 시도한다. 실행일에 따라 깨지지 않게 날짜는 상대값이다.
const DAY_MS = 86_400_000;
const isoOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const addDays = (iso: string, days: number): string => isoOf(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS);
const isWeekend = (iso: string): boolean => [0, 6].includes(new Date(`${iso}T00:00:00Z`).getUTCDay());

async function submitLeaveFrom(
  drafter: Person,
  from: string,
  input: { kind: "full_day" | "half_day"; half?: "am" | "pm"; note?: string; twoDays?: boolean },
): Promise<{ leaveId: string; startDate: string; endDate: string }> {
  for (let offset = 0; offset < 60; offset += 1) {
    const startDate = addDays(from, offset);
    if (isWeekend(startDate)) continue;
    let endDate = startDate;
    if (input.twoDays) {
      endDate = addDays(startDate, 1);
      while (isWeekend(endDate)) endDate = addDays(endDate, 1);
    }
    try {
      const result = await submitLeave(drafter.viewer, {
        kind: input.kind,
        startDate,
        endDate: input.kind === "half_day" ? "" : endDate,
        half: input.half ?? "",
        note: input.note ?? null,
      });
      return { leaveId: result.leaveId, startDate, endDate };
    } catch (error) {
      if (!(error instanceof LeaveValidationError)) throw error;
    }
  }
  throw new Error(`연차를 제출할 수 있는 날짜가 없습니다: ${from}`);
}

// print-leave: 07.4-02 연차 신청서 인쇄물 캡처용. 기안자는 둘이다 — 같은 기안자 · 같은 회계연도로는 「잔고 한 줄」과 「그해 부여 없음 → 잔여 초과 줄까지」를 함께 만들 수 없다.
//  A(입사 3년 전 · 그해 연차 부여 있음): {leaveId} F-L1 결재 중(1단계 대기 · 잔고 한 줄), {leaveId3} F-L3 승인 완료(잔고 「—」 · 상태 글자 없음)
//  B(입사 10일 전 · 그해 부여 없음): {leaveId2} F-L2 결재 중 반차 · 비고 10줄 · 잔고 여러 줄(잔여 초과)
// 보는 사람은 같은 팀의 팀장 — F-L1 · F-L2의 지금 단계(1단계) 후보이고 F-L3의 1단계를 처리한 사람이다(위 단계 담당은 1단계에 머문 문서를 못 본다).
async function printLeave(): Promise<SeedResult> {
  const today = seoulToday();
  const year = Number(today.slice(0, 4));
  const suffix = randomUUID().slice(0, 6);
  const yearStart = `${year}-01-01`;
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `캡처연차본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `캡처연차팀-${suffix}` });
  const mgmtTeam = (await listTeams(SYSTEM_VIEWER)).find((candidate) => candidate.name === "경영관리팀");
  if (!mgmtTeam) throw new Error("시드된 경영관리팀 없음");
  const drafterA = await makePerson("기안A", "role-pm", team.id, yearStart);
  const drafterB = await makePerson("기안B", "role-pm", team.id, yearStart);
  const teamLead = await makePerson("팀장", "role-team-lead", team.id, yearStart);
  const mgmt = await mgmtHead(mgmtTeam, yearStart);
  const ceo = await makePerson("대표", "role-ceo", team.id, yearStart);

  await setSettingValue(SYSTEM_VIEWER, PRINT_COMPANY_NAME, "플랜트에이트 주식회사");
  await setSettingValue(SYSTEM_VIEWER, PRINT_COMPANY_ADDRESS, "서울특별시 성동구 왕십리로 10");
  await setSettingValue(SYSTEM_VIEWER, PRINT_COMPANY_BUSINESS_NO, "123-45-67890");
  await setSettingValue(SYSTEM_VIEWER, PRINT_COMPANY_REPRESENTATIVE, "김대표");
  await setSettingValue(SYSTEM_VIEWER, PRINT_COMPANY_PHONE, "02-123-4567");

  await setHireDate(SYSTEM_VIEWER, drafterA.viewer.id, `${year - 3}-01-01`);
  // 입사 10일 전 — 오늘이 1월이면 그해 1월 1일로 당겨 같은 회계연도 안에 둔다(입사 연도 안 · 첫 월차 적립 전).
  const hireB = addDays(today, -10) < yearStart ? yearStart : addDays(today, -10);
  await setHireDate(SYSTEM_VIEWER, drafterB.viewer.id, hireB);

  const noteLines = Array.from({ length: 10 }, (_, index) => `${index + 1}. 행사 준비로 현장 일정이 겹쳐 반차를 신청합니다`).join("\n");
  const first = await submitLeaveFrom(drafterA, `${year}-03-02`, { kind: "full_day", twoDays: true, note: "가족 행사" });
  const third = await submitLeaveFrom(drafterA, addDays(first.endDate, 7), { kind: "full_day", twoDays: true });
  const second = await submitLeaveFrom(drafterB, addDays(hireB, 1), { kind: "half_day", half: "am", note: noteLines });

  // F-L3 승인 완료 — 팀장 → (본부장 빈 자리 건너뜀) → 경영관리 → 대표.
  for (const approver of [teamLead, mgmt, ceo]) {
    const view = await getApprovalView(approver.viewer, { kind: LEAVE_DOCUMENT_KIND, documentId: third.leaveId });
    if (!view) throw new Error("결재 인스턴스가 없습니다");
    await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: view.version });
  }
  return { vars: { leaveId: first.leaveId, leaveId2: second.leaveId, leaveId3: third.leaveId }, viewer: teamLead };
}

// leave-approved: 07.2-15(S18) 연차 취소 요청 캡처용 — 승인된 연차 하나({leaveId})의 기안자가 보는 사람(문서 화면 행동 줄 2차 `취소 요청`).
// 결재: 팀장 → (본부장 빈 자리 건너뜀) → 경영관리 → 대표(print-leave와 같은 조직 모양). 취소 결재자 = 원 결재선 팀장.
async function leaveApproved(): Promise<SeedResult> {
  const today = seoulToday();
  const year = Number(today.slice(0, 4));
  const suffix = randomUUID().slice(0, 6);
  const yearStart = `${year}-01-01`;
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `캡처취소본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `캡처취소팀-${suffix}` });
  const mgmtTeam = (await listTeams(SYSTEM_VIEWER)).find((candidate) => candidate.name === "경영관리팀");
  if (!mgmtTeam) throw new Error("시드된 경영관리팀 없음");
  const drafter = await makePerson("기안", "role-pm", team.id, yearStart);
  const teamLead = await makePerson("팀장", "role-team-lead", team.id, yearStart);
  const mgmt = await mgmtHead(mgmtTeam, yearStart);
  const ceo = await makePerson("대표", "role-ceo", team.id, yearStart);
  await setHireDate(SYSTEM_VIEWER, drafter.viewer.id, `${year - 3}-01-01`);

  const leave = await submitLeaveFrom(drafter, `${year}-03-02`, { kind: "full_day", twoDays: true, note: "가족 행사" });
  for (const approver of [teamLead, mgmt, ceo]) {
    const view = await getApprovalView(approver.viewer, { kind: LEAVE_DOCUMENT_KIND, documentId: leave.leaveId });
    if (!view) throw new Error("결재 인스턴스가 없습니다");
    await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: view.version });
  }
  return { vars: { leaveId: leave.leaveId }, viewer: drafter };
}

// print-settlement: 07.4-03 프로젝트 정산서 인쇄물 캡처용 — 같은 조직의 정산 결재 중 프로젝트 둘.
// F-S1 {projectId} = 지출결의 3(4단 결재 통과) · 구매 요청 2(1건 구매 완료 · 카드 사용) · 결재선 기본(대표 1단) — 1쪽.
// F-S3 {projectId2} = 지출결의 45 · 구매 요청 12 · 결재선 4단계(팀장 → 본부장 → 경영관리 → 대표, 단계마다 결재권자가 있다) — 여러 쪽.
// 결재선 1~3단 켜기는 F-S3 올리기 동안만이고 끝나면 원래 값으로 되돌린다. 증빙은 브라우저 올리기 대신 선결제 표시로 ⑧을 푼다(48건 — 승인 문서는 점검을 막지 않는다).
// viewer = pnl 보기 + 전사 범위 임시 계급(손익 절이 보이는 프로젝트 행 범위 안 — 범위 밖 결재 관련자는 손익 절이 없다).
async function printSettlement(): Promise<SeedResult> {
  const today = seoulToday();
  const lastYear = Number(today.slice(0, 4)) - 1;
  const suffix = randomUUID().slice(0, 6);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `캡처정산서본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `캡처정산서팀-${suffix}` });
  const mgmtTeam = (await listTeams(SYSTEM_VIEWER)).find((candidate) => candidate.name === "경영관리팀");
  if (!mgmtTeam) throw new Error("시드된 경영관리팀 없음");
  const drafter = await makePerson("기안담당남궁", "role-pm", team.id, yearStart);
  const teamLead = await makePerson("팀장", "role-team-lead", team.id, yearStart);
  const divisionHead = await makePerson("본부장", "role-division-head", team.id, yearStart);
  const mgmt = await mgmtHead(mgmtTeam, yearStart);
  const ceo = await makePerson("대표", "role-ceo", team.id, yearStart);

  await setSettingValue(SYSTEM_VIEWER, PRINT_COMPANY_NAME, "플랜트에이트 주식회사");
  await setSettingValue(SYSTEM_VIEWER, PRINT_COMPANY_ADDRESS, "서울특별시 성동구 왕십리로 10");
  await setSettingValue(SYSTEM_VIEWER, PRINT_COMPANY_BUSINESS_NO, "123-45-67890");
  await setSettingValue(SYSTEM_VIEWER, PRINT_COMPANY_REPRESENTATIVE, "김대표");
  await setSettingValue(SYSTEM_VIEWER, PRINT_COMPANY_PHONE, "02-123-4567");
  await setSettingValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME, CAPTURE_ONLINE_VENDOR_NAME);

  const vendor = await vendorWithAccount(`캡처정산서거래처-${suffix}`);
  const longVendor = await vendorWithAccount(`캡처 무대 · 조명 · 음향 통합 제작 협력사 주식회사-${suffix}`);
  const online = await insertVendor(SYSTEM_VIEWER, { name: CAPTURE_ONLINE_VENDOR_NAME, normalizedName: CAPTURE_ONLINE_VENDOR_NAME.toLowerCase() });
  const [subcategory] = await listCodeItems(SYSTEM_VIEWER, { tableKey: QUOTE_SUBCATEGORY_TABLE_KEY, scope: { rows: "all", includeArchived: false }, includeInactive: false });
  if (!subcategory) throw new Error("시드된 quote_subcategory 코드 항목이 없습니다");

  const buyerRole = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `캡처정산서구매-${suffix}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: buyerRole.id, menu: "cards.purchases", action: "write", allowed: true });
  for (const infoItem of ["purchase_request.value", "purchase_request.amount", "project.value", "quote.amount", "card_usage.value", "card_usage.amount"]) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: buyerRole.id, infoItem, visible: true });
  }
  // 07.3-01: 자금 키 보유자는 경영관리본부 소속이어야 한다 — 경영관리팀 발령.
  const buyer = await makePerson("구매", buyerRole.id, mgmtTeam.id, yearStart);

  async function settlementProject(name: string, expenseCount: number, purchaseCount: number, longText: boolean): Promise<string> {
    const client = await insertVendor(SYSTEM_VIEWER, { name: `캡처정산서클라이언트-${name}-${suffix}`, normalizedName: `캡처정산서클라이언트-${name}-${suffix}` });
    const period = { startDate: `${lastYear}-11-01`, endDate: `${lastYear}-12-31` };
    const project = await createProject(drafter.viewer, { clientId: client.id, teamId: team.id, pmUserId: drafter.viewer.id, name: `캡처정산서${name}-${suffix}`, ...period });
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision || !project.id) throw new Error("프로젝트 · 1차 차수가 없습니다");
    const row = (itemName: string, vendorId: string, executionKrw: number) => ({
      id: randomUUID(),
      isNew: true as const,
      subcategory: subcategory?.value ?? "",
      itemName,
      vendorId,
      unitPrice: { currency: "KRW" as const, amount: executionKrw + 500_000, fxRate: 1 },
      execution: { currency: "KRW" as const, amount: executionKrw, fxRate: 1 },
    });
    // longText면 첫 줄은 긴 항목 · 긴 지급처(줄바꿈 · 열 폭 실측용 — F-S3만. F-S1은 1쪽).
    const expenseRows = Array.from({ length: expenseCount }, (_, index) =>
      longText && index === 0
        ? row(`메인 스테이지 구조물 설치 · 철거 및 현장 안전 관리 인력 추가 투입-${suffix}`, longVendor.id, 4_300_000)
        : row(`무대 제작 ${index + 1}-${suffix}`, vendor.id, 1_000_000 + index * 10_000),
    );
    const onlineRow = row(`현장 소모품-${suffix}`, online.id, 5_000_000);
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [...expenseRows, onlineRow] });
    await changeProjectStatus(teamLead.viewer, project.id, { from: "bidding", to: "in_progress" });
    const basis = await approvalBasis(SYSTEM_VIEWER, revision.id);
    await setCustomerApproval(drafter.viewer, revision.id, { approvalBasis: "verbal", approvedOn: period.endDate, seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken });

    for (const line of expenseRows) {
      const created = await createExpenseFromLines(drafter.viewer, { lineIds: [line.id], fields: { note: "행사 운영비" } });
      const expenseId = created.created[0]?.expenseId;
      if (!expenseId) throw new Error(`작성 중 문서를 만들지 못했다: ${JSON.stringify(created.blocked)}`);
      const draft = await findExpenseById(drafter.viewer, expenseId);
      if (!draft) throw new Error("작성 중 문서를 찾지 못했다");
      const saved = await saveExpenseDraft(drafter.viewer, { expenseId, expectedVersion: draft.version, fields: { prepaid: true, prepaidReason: "캡처 시드 선결제" } });
      const submitted = await submitExpense(drafter.viewer, { expenseId, expectedVersion: saved.version });
      if (submitted.kind !== "submitted") throw new Error(`지출결의가 제출되지 않았다: ${JSON.stringify(submitted)}`);
      for (const approver of [teamLead, divisionHead, mgmt, ceo]) {
        const view = await getApprovalView(approver.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
        if (!view) throw new Error("결재 인스턴스가 없습니다");
        await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: view.version });
      }
    }

    const requestIds: string[] = [];
    for (let index = 0; index < purchaseCount; index += 1) {
      const itemName = longText && index === 0 ? `행사장 안내 배너 · 현수막 · 바닥 유도 스티커 묶음-${suffix}` : `현수막 ${index + 1}장-${suffix}`;
      const input = { linkKind: "quote_line" as const, lineId: onlineRow.id, itemName, linkUrl: null, estimate: { currency: "KRW" as const, amount: 110_000 + index * 1_000, fxRate: 1 }, memo: null };
      requestIds.push((await createPurchaseRequest(drafter.viewer, input, await precheckPurchaseRequest(drafter.viewer, input))).id);
    }
    const firstRequest = requestIds[0];
    if (firstRequest) {
      const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `캡처정산서카드사-${name}-${suffix}`, numberLast4: pickCardLast4(await takenCardLast4()), label: `캡처정산서카드-${name}`, kind: "shared" });
      const [requested] = await db.select({ version: purchaseRequests.version }).from(purchaseRequests).where(eq(purchaseRequests.id, firstRequest));
      if (!requested || !card.id) throw new Error("요청 · 카드 없음");
      const input = { requestId: firstRequest, version: requested.version, corpCardId: card.id, usedOn: today, merchantVendorId: null, total: { currency: "KRW" as const, amount: 99_000, fxRate: 1 }, evidenceTypeCode: "invoice", memo: null };
      await completePurchaseRequest(buyer.viewer, input, await precheckPurchaseCompletion(buyer.viewer, input));
    }

    // 발행 합계(매출 기준)는 견적 합보다 조금 작게 — 손익 칸이 견적 합과 다른 기준액 · 양의 수익금을 보인다.
    await saveRevenue(SYSTEM_VIEWER, project.id, { issuedEntries: [{ id: randomUUID(), isNew: true, entryDate: period.endDate, amount: { currency: "KRW", amount: basis.totalKrw - 330_000, fxRate: 1 } }] });
    // 종료일이 지난 진행 프로젝트는 앞선 쓰기(잠금 안 재판정)에서 이미 정산이 됐을 수 있다 — 상태로 확인한다.
    await applyAutoSettlement({ projectIds: [project.id] });
    const status = (await findProjectById(SYSTEM_VIEWER, project.id))?.status;
    if (status !== "settling") throw new Error(`자동 정산이 되지 않았습니다: ${status}`);
    return project.id;
  }

  const projectId = await settlementProject("한쪽", 3, 2, false);
  const first = await submitSettlement(drafter.viewer, { projectId });
  if (first.kind !== "submitted") throw new Error(`정산 결재가 올라가지 않았습니다: ${JSON.stringify(first)}`);

  const projectId2 = await settlementProject("여러쪽", 45, 12, true);
  const routeSteps = [APPROVAL_ROUTE_SETTLEMENT_STEP1_ENABLED, APPROVAL_ROUTE_SETTLEMENT_STEP2_ENABLED, APPROVAL_ROUTE_SETTLEMENT_STEP3_ENABLED];
  const previous = await Promise.all(routeSteps.map((def) => getSettingValue(def)));
  try {
    for (const def of routeSteps) await setSettingValue(SYSTEM_VIEWER, def, true);
    const second = await submitSettlement(drafter.viewer, { projectId: projectId2 });
    if (second.kind !== "submitted") throw new Error(`정산 결재가 올라가지 않았습니다: ${JSON.stringify(second)}`);
  } finally {
    for (const [index, def] of routeSteps.entries()) await setSettingValue(SYSTEM_VIEWER, def, previous[index] ?? false);
  }

  const viewerRole = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `캡처정산서손익-${suffix}`, workScope: "company", viewScope: "company" });
  for (const menu of ["projects", "expenses", "pnl"]) await upsertPermission(SYSTEM_VIEWER, { roleId: viewerRole.id, menu, action: "view", allowed: true });
  for (const item of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: viewerRole.id, infoItem: item.key, visible: true });
  const viewer = await makePerson("손익", viewerRole.id, team.id, yearStart);
  return { vars: { projectId, projectId2 }, viewer };
}

// people-list-filled: 07-17 사람 목록 · 상세 캡처용 — 시스템 관리자가 보는 사람 12명(잠김 2 · 퇴직 1 · 팀장 1 · 나머지는 임시 비밀번호 사용 중).
// {lockedId}는 잠긴 재직자 한 명(상세 로그인 섹션의 `잠금 풀기` · `비밀번호 초기화`가 함께 보이는 상태).
async function peopleListFilled(): Promise<SeedResult> {
  const today = seoulToday();
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const suffix = randomUUID().slice(0, 6);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `캡처사람본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `캡처사람팀-${suffix}` });
  const people: Person[] = [];
  for (let i = 0; i < 12; i += 1) people.push(await makePerson("사람", i === 3 ? "role-team-lead" : "role-pm", team.id, yearStart));
  const { threshold } = await lockoutConfig();
  for (const person of people.slice(0, 2)) {
    for (let i = 0; i < threshold; i += 1) await recordAttempt(SYSTEM_VIEWER, { email: person.email, success: false, ip: null });
  }
  const retired = people[2];
  if (retired) await setResignationDate(SYSTEM_VIEWER, retired.viewer.id, `${Number(today.slice(0, 4)) - 1}-12-31`);
  const viewer = await makePerson("관리", "role-sysadmin", team.id, yearStart);
  return { vars: { lockedId: people[0]?.viewer.id ?? "" }, viewer };
}

// 07.2-06(UI-SPEC S4 · S5) — 미승인 차수 견적 표: 대분류 둘(Venue · Agency) · 일수 3 줄 · 고객 비고 · 중분류 · 수수료 줄 둘. 담당 PM으로 본다.
async function quoteLinesFilled(): Promise<SeedResult> {
  const today = seoulToday();
  const year = today.slice(0, 4);
  const suffix = randomUUID().slice(0, 6);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `캡처견적본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `캡처견적팀-${suffix}` });
  const pm = await makePerson("담당", "role-pm", team.id, `${year}-01-01`);
  const teamLead = await makePerson("팀장", "role-team-lead", team.id, `${year}-01-01`);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `캡처클라이언트-${suffix}`, normalizedName: `캡처클라이언트-${suffix}` });
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `캡처거래처-${suffix}`, normalizedName: `캡처거래처-${suffix}` });
  const project = await createProject(pm.viewer, {
    clientId: client.id,
    teamId: team.id,
    pmUserId: pm.viewer.id,
    name: `캡처견적-${suffix}`,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision || !project.id) throw new Error("프로젝트 · 1차 차수가 없습니다");
  const [subcategory] = await listCodeItems(SYSTEM_VIEWER, {
    tableKey: QUOTE_SUBCATEGORY_TABLE_KEY,
    scope: { rows: "all", includeArchived: false },
    includeInactive: false,
  });
  if (!subcategory) throw new Error("시드된 quote_subcategory 코드 항목이 없습니다");
  const quote = (itemName: string, majorCategory: string, amount: number, extra: { quantity?: number; days?: number; clientRemark?: string; midCategory?: string } = {}) => ({
    id: randomUUID(),
    isNew: true as const,
    lineKind: "quote" as const,
    subcategory: subcategory.value,
    itemName,
    vendorId: vendor.id,
    majorCategory,
    unitPrice: { currency: "KRW" as const, amount, fxRate: 1 },
    execution: { currency: "KRW" as const, amount: Math.round(amount * 0.7), fxRate: 1 },
    ...extra,
  });
  const commission = (itemName: string, amount: number, clientRemark: string) => ({
    id: randomUUID(),
    isNew: true as const,
    lineKind: "commission" as const,
    subcategory: "",
    itemName,
    clientRemark,
    unitPrice: { currency: "KRW" as const, amount, fxRate: 1 },
    execution: { currency: "KRW" as const, amount: 0, fxRate: 1 },
  });
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: [
      quote("메인 홀 대관", "Venue", 4_000_000, { days: 3, clientRemark: "3일 사용", midCategory: "대관" }),
      quote("음향 장비", "Venue", 1_500_000, { quantity: 2, midCategory: "장비" }),
      quote("현장 운영 인력", "Agency", 250_000, { quantity: 6, days: 3, midCategory: "인력" }),
      quote("기획 · 연출", "Agency", 3_000_000),
      commission("Venue Commission", 750_000, "5%"),
      commission("Agency Fee", 900_000, "12%"),
    ],
  });
  // 고객 승인 표시는 하지 않는다 — 미승인 차수(편집 · 「수수료 줄 추가」 · 「계산」이 보이는 상태)가 이 시나리오다.
  await changeProjectStatus(teamLead.viewer, project.id, { from: "bidding", to: "in_progress" });
  // revisionId: 고객 견적서 인쇄 화면 /print/quotes/{revisionId}(07.2-10)도 이 시나리오 데이터로 찍는다.
  return { vars: { projectId: project.id, revisionId: revision.id }, viewer: pm };
}

// 07.2-12(UI-SPEC S11 · D7298-B) — 조정 줄 쌍: 경영관리(조정 쓰기 · 경영관리팀 — 조정 범위 회사 전체)로 본다. 진행 프로젝트 A · B, 완료 프로젝트 C
// (고르기에서 고를 수 없는 행), A에 상대 B 쌍 하나(A −1,000,000 · B +1,000,000). vars = A · B.
async function quoteAdjustmentPair(): Promise<SeedResult> {
  const today = seoulToday();
  const year = today.slice(0, 4);
  const suffix = randomUUID().slice(0, 6);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `캡처쌍본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `캡처쌍팀-${suffix}` });
  const pm = await makePerson("담당", "role-pm", team.id, `${year}-01-01`);
  const mgmtTeam = (await listTeams(SYSTEM_VIEWER)).find((candidate) => candidate.name === "경영관리팀");
  if (!mgmtTeam) throw new Error("시드된 경영관리팀 없음");
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `캡처쌍경영관리-${suffix}`, workScope: "company", viewScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects.adjustment", action: "write", allowed: true });
  for (const infoItem of ["project.value", "quote.amount", "vendor.value"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  const adjuster = await makePerson("경영관리", role.id, mgmtTeam.id, `${year}-01-01`);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `캡처쌍클라이언트-${suffix}`, normalizedName: `캡처쌍클라이언트-${suffix}` });
  const make = async (label: string) =>
    createProject(pm.viewer, { clientId: client.id, teamId: team.id, pmUserId: pm.viewer.id, name: `캡처쌍${label}-${suffix}`, startDate: `${year}-01-01`, endDate: `${year}-12-31` });
  const a = await make("A");
  const b = await make("B");
  const c = await make("완료C");
  for (const project of [a, b, c]) await db.update(projects).set({ status: project === c ? "completed" : "in_progress" }).where(eq(projects.id, project.id));
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, a.id);
  if (!revision) throw new Error("프로젝트 A · 1차 차수가 없습니다");
  await saveQuoteLines(adjuster.viewer, revision.id, {
    rows: [
      {
        id: randomUUID(),
        isNew: true,
        lineKind: "adjustment",
        subcategory: "",
        itemName: "프로젝트 간 비용 이전",
        counterpartProjectId: b.id,
        unitPrice: { currency: "KRW", amount: 0, fxRate: 1 },
        execution: { currency: "KRW", amount: -1_000_000, fxRate: 1 },
      },
    ],
  });
  return { vars: { projectId: a.id, counterpartProjectId: b.id }, viewer: adjuster };
}

// 07.2-17(S1 · S3) — 팀장이 보는 상세 두 개: 돈 문서 0건(머리 끝 `프로젝트 삭제` 활성 · 정보 면 4칸 전부 `바꾸기`)과
// 예산 수동 조정 1건(삭제 막힘 이유 · 고객사 · 담당 팀 잠김 줄). 목록 `/projects`의 `보관함` 링크도 같은 팀장으로 본다.
async function projectDeleteInfo(): Promise<SeedResult> {
  const today = seoulToday();
  const year = today.slice(0, 4);
  const suffix = randomUUID().slice(0, 6);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `캡처삭제본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `캡처삭제팀-${suffix}` });
  const pm = await makePerson("담당", "role-pm", team.id, `${year}-01-01`);
  const lead = await makePerson("팀장", "role-team-lead", team.id, `${year}-01-01`);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `캡처삭제클라이언트-${suffix}`, normalizedName: `캡처삭제클라이언트-${suffix}` });
  const make = async (label: string) =>
    createProject(pm.viewer, { clientId: client.id, teamId: team.id, pmUserId: pm.viewer.id, name: `캡처삭제${label}-${suffix}`, startDate: `${year}-01-01`, endDate: `${year}-12-31` });
  const free = await make("빈");
  const locked = await make("돈문서");
  for (const project of [free, locked]) await db.update(projects).set({ status: "in_progress" }).where(eq(projects.id, project.id));
  await db.insert(projectBudgetEntries).values({ projectId: locked.id, reason: "manual", deltaKrw: 1_000_000, memo: "캡처 수동 조정", createdBy: lead.viewer.id });
  return { vars: { projectId: free.id, lockedProjectId: locked.id }, viewer: lead };
}

// project-completed: 07.2-19(S2) 완료 되돌리기 캡처용 — 정산 결재를 대표까지 승인해 완료된 프로젝트 하나(test/e2e/settlement-fixture.ts와 같은 흐름).
// 프로젝트명은 머리 줄 줄바꿈 실측용 40자. 대표로 본다(projects.reopen 보유 — 트리거 `정산으로 되돌리기`가 그려진다).
async function projectCompleted(): Promise<SeedResult> {
  const today = seoulToday();
  const lastYear = Number(today.slice(0, 4)) - 1;
  const suffix = randomUUID().slice(0, 6);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `캡처완료본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `캡처완료팀-${suffix}` });
  const pm = await makePerson("담당", "role-pm", team.id, yearStart);
  const teamLead = await makePerson("팀장", "role-team-lead", team.id, yearStart);
  const ceo = await makePerson("대표", "role-ceo", team.id, yearStart);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `캡처완료클라이언트-${suffix}`, normalizedName: `캡처완료클라이언트-${suffix}` });
  const period = { startDate: `${lastYear}-11-01`, endDate: `${lastYear}-12-31` };
  const name = `캡처완료 서울모터쇼 브랜드관 부스 운영 및 현장프로모션 행사-${suffix}`; // 33자 + `-` + 6자 = 40자
  const project = await createProject(pm.viewer, { clientId: client.id, teamId: team.id, pmUserId: pm.viewer.id, name, ...period });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision || !project.id) throw new Error("프로젝트 · 1차 차수가 없습니다");
  const [subcategory] = await listCodeItems(SYSTEM_VIEWER, { tableKey: QUOTE_SUBCATEGORY_TABLE_KEY, scope: { rows: "all", includeArchived: false }, includeInactive: false });
  if (!subcategory) throw new Error("시드된 quote_subcategory 코드 항목이 없습니다");
  const saved = await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: [
      {
        id: randomUUID(),
        isNew: true as const,
        subcategory: subcategory.value,
        itemName: `무대 제작-${suffix}`,
        vendorId: null,
        unitPrice: { currency: "KRW" as const, amount: 13_400_000, fxRate: 1 },
        execution: { currency: "KRW" as const, amount: 12_400_000, fxRate: 1 },
      },
    ],
  });
  await changeProjectStatus(teamLead.viewer, project.id, { from: "bidding", to: "in_progress" });
  // 완료 전 점검이 기안을 막지 않게 줄마다 카드 사용 1건 + 매출 발행 줄 1건(E2E 픽스처와 같은 순서 · 강행 키 없음).
  const taken = await takenCardLast4();
  for (const line of saved.lines) {
    const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `캡처완료카드사-${suffix}`, numberLast4: pickCardLast4(taken), label: `캡처완료카드-${suffix}`, kind: "personal", holderUserId: pm.viewer.id });
    if (!card.id) throw new Error("카드 id 없음");
    const input: CardUsageInput = { corpCardId: card.id, usedOn: today, merchantVendorId: null, total: { currency: "KRW", amount: 100_000, fxRate: 1 }, evidenceTypeCode: "invoice", linkKind: "quote_line", lineId: line.id, memo: null };
    await createCardUsage(pm.viewer, input, await precheckCardUsage(pm.viewer, input));
  }
  await saveRevenue(SYSTEM_VIEWER, project.id, { issuedEntries: [{ id: randomUUID(), isNew: true, entryDate: period.endDate, amount: { currency: "KRW", amount: 1_000_000, fxRate: 1 } }] });
  await applyAutoSettlement({ projectIds: [project.id] });
  if ((await findProjectById(SYSTEM_VIEWER, project.id))?.status !== "settling") throw new Error("정산 상태가 아닙니다");
  const submitted = await submitSettlement(pm.viewer, { projectId: project.id });
  if (submitted.kind !== "submitted") throw new Error(`정산 결재가 올라가지 않았습니다: ${JSON.stringify(submitted)}`);
  const graph = await findApprovalGraphByDocument(SYSTEM_VIEWER, { documentKind: SETTLEMENT_DOCUMENT_KIND, documentId: project.id });
  if (!graph) throw new Error("정산 결재 인스턴스가 없습니다");
  await approveDocument(ceo.viewer, { instanceId: graph.instance.id, expectedVersion: graph.instance.version });
  if ((await findProjectById(SYSTEM_VIEWER, project.id))?.status !== "completed") throw new Error("완료 상태가 아닙니다");
  return { vars: { projectId: project.id }, viewer: ceo };
}

// custom-fields-filled: 07.5-01(S6) 거래처 목록 추가 칸 캡처용 — 시스템 관리자가 보는 거래처 목록.
// 정의 · 보임 행은 (대상, 이름)으로 이미 있으면 다시 쓴다(capture.spec.ts가 경로마다 시드를 다시 부르고 erp_test 초기화는 실행당 한 번 — field_definitions_entity_label_key).
// 대상별 작은 함수로 나눠 02 · 03이 프로젝트 · 견적 줄 칸을 같은 꼴로 덧붙인다.
type SeedFieldSpec = { label: string; type: "text" | "number" | "date" | "select"; sortOrder: number; options?: string[]; archivedOptions?: string[]; archived?: boolean };

async function ensureCustomFieldDefinition(entity: "vendor", spec: SeedFieldSpec): Promise<string> {
  const [existing] = await db
    .select({ key: fieldDefinitions.key })
    .from(fieldDefinitions)
    .where(and(eq(fieldDefinitions.entity, entity), eq(fieldDefinitions.label, spec.label)))
    .limit(1);
  if (existing) return existing.key;
  const key = `cf_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  await insertFieldDefinition(SYSTEM_VIEWER, { id: randomUUID(), entity, key, label: spec.label, type: spec.type, options: spec.options, sortOrder: spec.sortOrder });
  const patch = { ...(spec.archivedOptions ? { archivedOptions: spec.archivedOptions } : {}), ...(spec.archived ? { archivedAt: new Date() } : {}) };
  if (Object.keys(patch).length > 0) await db.update(fieldDefinitions).set(patch).where(and(eq(fieldDefinitions.entity, entity), eq(fieldDefinitions.key, key)));
  for (const role of await listRoles(SYSTEM_VIEWER)) {
    await insertVisibilityIfAbsent(SYSTEM_VIEWER, { roleId: role.id, infoItem: customFieldInfoItem(entity, key), visible: true });
  }
  return key;
}

async function customFieldsFilledVendors(suffix: string): Promise<{ filterKey: string }> {
  const longText = await ensureCustomFieldDefinition("vendor", { label: "담당 영업 사원과 연락 경로 메모 칸", type: "text", sortOrder: 1 });
  const date = await ensureCustomFieldDefinition("vendor", { label: "계약 만료일과 다음 갱신 협의 예정일", type: "date", sortOrder: 2 });
  const score = await ensureCustomFieldDefinition("vendor", { label: "거래 점수", type: "number", sortOrder: 3 });
  const region = await ensureCustomFieldDefinition("vendor", { label: "지역", type: "select", sortOrder: 4, options: ["서울", "부산"], archivedOptions: ["대구"] });
  await ensureCustomFieldDefinition("vendor", { label: "규모", type: "select", sortOrder: 5, options: ["대형", "중형", "소형"] });
  await ensureCustomFieldDefinition("vendor", { label: "등급", type: "select", sortOrder: 6, options: ["A", "B", "C"] });
  const rep = await ensureCustomFieldDefinition("vendor", { label: "담당 영업", type: "text", sortOrder: 7 });
  const archivedKey = await ensureCustomFieldDefinition("vendor", { label: "보관한 칸", type: "text", sortOrder: 8, archived: true });
  const make = (label: string, customFields: Record<string, unknown>) =>
    insertVendor(SYSTEM_VIEWER, { name: `캡처칸${label}-${suffix}`, normalizedName: `캡처칸${label}-${suffix}`, customFields });
  await make("긴텍스트", {
    [longText]: "서울 본사 영업 2팀 김 대리와 먼저 통화하고 안 받으면 메신저로 연락 후 다음 날 오전에 다시 확인하는 순서로 진행",
    [date]: "2026-11-04",
    [score]: 1234.5,
    [region]: "서울",
    [rep]: "김영업",
    [archivedKey]: "보관한 칸 값",
  });
  await make("수식", { [longText]: "=SUM(A1)", [region]: "부산", [score]: 80 });
  await make("보관선택지", { [region]: "대구" });
  await make("값없음", {});
  return { filterKey: region };
}

async function customFieldsFilled(): Promise<SeedResult> {
  const today = seoulToday();
  const suffix = randomUUID().slice(0, 6);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `캡처칸본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `캡처칸팀-${suffix}` });
  const { filterKey } = await customFieldsFilledVendors(suffix);
  const viewer = await makePerson("관리", SYSADMIN_ROLE_ID, team.id, `${today.slice(0, 4)}-01-01`);
  return { vars: { vendorFilterQuery: `cf_${filterKey}=${encodeURIComponent("서울")}` }, viewer };
}

// revenue-archive-rows: 07.6-01 매출 줄 지우기 캡처용 — 시스템 관리자(전사 계급 · admin.archive 보유)로 본다. 고객 승인 프로젝트에 발행 줄 넷
// (셋은 발행 요청 이어짐 — 막힘 이유 밀도) · 입금 줄 하나(과거 · 오늘 — 미래 입금일 거부) · 보관된 발행 줄 하나, 완료 프로젝트 하나(발행 줄 하나).
async function revenueArchiveRows(): Promise<SeedResult> {
  const today = seoulToday();
  const year = today.slice(0, 4);
  const suffix = randomUUID().slice(0, 6);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `캡처매출본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `캡처매출팀-${suffix}` });
  const pm = await makePerson("담당", "role-pm", team.id, `${year}-01-01`);
  const teamLead = await makePerson("팀장", "role-team-lead", team.id, `${year}-01-01`);
  const admin = await makePerson("관리자", "role-sysadmin", team.id, `${year}-01-01`);
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `캡처매출거래처-${suffix}`, normalizedName: `캡처매출거래처-${suffix}` });
  const krw = (amount: number) => ({ currency: "KRW" as const, amount, fxRate: 1 });
  const { projectId } = await inProgressProjectLines({ suffix, teamId: team.id, pm, teamLead, vendorId: vendor.id }, [8_000_000]);
  const requests = [0, 1, 2].map((index) => ({ id: randomUUID(), isNew: true as const, desiredIssueDate: daysBefore(today, 30 - index), amount: krw(1_000_000), memo: `차수 ${index + 1}` }));
  await saveProjectLedger(pm.viewer, projectId, { seenStatus: "in_progress", issueRequests: requests });
  const archivedId = randomUUID();
  await saveProjectLedger(admin.viewer, projectId, {
    seenStatus: "in_progress",
    revenue: {
      issuedEntries: [
        ...requests.map((request) => ({ id: randomUUID(), isNew: true as const, entryDate: request.desiredIssueDate, amount: request.amount, note: request.memo, fromIssueRequestId: request.id })),
        { id: randomUUID(), isNew: true as const, entryDate: daysBefore(today, 20), amount: krw(2_000_000), note: "잔금" },
        { id: archivedId, isNew: true as const, entryDate: daysBefore(today, 10), amount: krw(500_000), note: "잘못 넣은 줄" },
      ],
      paidEntries: [{ id: randomUUID(), isNew: true as const, entryDate: today, amount: krw(1_100_000), note: "입금" }],
    },
  });
  // 보관된 줄은 DB 갱신으로 만든다 — main 작업 나무에서도 같은 시드가 돌아 main 기준 캡처가 되게(지우기 함수는 이 페이즈 것).
  await db.update(revenueEntries).set({ archivedAt: new Date(), archivedBy: admin.viewer.id }).where(eq(revenueEntries.id, archivedId));
  const completed = await inProgressProjectLines({ suffix: `${suffix}-완료`, teamId: team.id, pm, teamLead, vendorId: vendor.id }, [3_000_000]);
  await saveRevenue(SYSTEM_VIEWER, completed.projectId, { issuedEntries: [{ id: randomUUID(), isNew: true, entryDate: daysBefore(today, 5), amount: krw(4_000_000) }] });
  await db.update(projects).set({ status: "completed" }).where(eq(projects.id, completed.projectId));
  return { vars: { projectId, completedProjectId: completed.projectId }, viewer: admin };
}

export function runSeed(name: SeedName, browser: Browser, baseURL: string | undefined): Promise<SeedResult> {
  switch (name) {
    case "pre-settle-evidence-pending":
      return preSettleEvidencePending(browser, baseURL);
    case "purchase-approval-pending":
      return purchaseApprovalPending();
    case "payment-and-settlement-actions":
      return paymentAndSettlementActions(browser, baseURL);
    case "evidence-intake-filled":
      return evidenceIntakeFilled(browser, baseURL);
    case "evidence-author-pick":
      return evidenceAuthorPick();
    case "evidence-private-type":
      return evidencePrivateType(browser, baseURL);
    case "people-list-filled":
      return peopleListFilled();
    case "print-expense":
      return printExpense(browser, baseURL);
    case "print-leave":
      return printLeave();
    case "quote-lines-filled":
      return quoteLinesFilled();
    case "print-settlement":
      return printSettlement();
    case "quote-adjustment-pair":
      return quoteAdjustmentPair();
    case "leave-approved":
      return leaveApproved();
    case "project-delete-info":
      return projectDeleteInfo();
    case "project-completed":
      return projectCompleted();
    case "custom-fields-filled":
      return customFieldsFilled();
    case "revenue-archive-rows":
      return revenueArchiveRows();
  }
}
