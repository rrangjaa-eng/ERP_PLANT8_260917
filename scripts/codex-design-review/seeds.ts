import { randomUUID } from "node:crypto";
import { expect, type Browser } from "@playwright/test";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { files } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam, listTeams } from "@/domain/org";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createProject } from "@/domain/projects";
import { changeProjectStatus } from "@/domain/projects/status";
import { applyAutoSettlement } from "@/domain/projects/auto-transition";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { setCustomerApproval } from "@/domain/quotes/revisions";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { voidEvidence } from "@/domain/evidence";
import { saveRevenue } from "@/domain/revenue";
import { approvalBasis } from "@/repositories/quote-revisions";
import { findProjectById } from "@/repositories/projects";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { insertVendor } from "@/repositories/vendors";
import { seoulToday } from "@/lib/dates";
import { QUOTE_SUBCATEGORY_TABLE_KEY } from "@/domain/projects/references";
import { listCodeItems } from "@/repositories/code-tables";
import type { SeedName } from "./lib";

// 지출결의 제출·결재·증빙 무효 준비는 test/e2e의 도우미와 같은 흐름이지만, scripts는 test를 import할 수 없어(eslint boundaries) 필요한 만큼만 다시 쓴다.
type Person = { email: string; password: string; viewer: Viewer };

async function makePerson(prefix: string, roleId: string, teamId: string, effectiveFrom: string): Promise<Person> {
  const email = `capture-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: `${prefix}${randomUUID().slice(0, 4)}`, roleId });
  await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom });
  return { email, password: tempPassword, viewer: { id: userId, roleId } };
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
    mgmt: await makePerson("경영", "role-pm", mgmtTeam.id, yearStart),
    ceo: await makePerson("대표", "role-ceo", team.id, yearStart),
  };
  const client = await insertVendor(SYSTEM_VIEWER, { name: `캡처클라이언트-${suffix}`, normalizedName: `캡처클라이언트-${suffix}` });
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `캡처거래처-${suffix}`, normalizedName: `캡처거래처-${suffix}`, defaultEvidenceType: "tax_invoice" });
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
  await setCustomerApproval(org.drafter.viewer, revision.id, { approvedOn: today, seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken });
  await saveRevenue(SYSTEM_VIEWER, project.id, {
    issuedEntries: [{ id: randomUUID(), isNew: true, entryDate: `${lastYear}-12-31`, amount: { currency: "KRW", amount: 1_000_000, fxRate: 1 } }],
  });

  // 증빙 업로드가 브라우저 경로라 제출만 화면으로 한다.
  const created = await createExpenseFromLines(org.drafter.viewer, { lineIds: [lineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
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
    await page.getByTestId("attachments-input").setInputFiles("test/e2e/assets/receipt-3000x2000.jpg");
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

export function runSeed(name: SeedName, browser: Browser, baseURL: string | undefined): Promise<SeedResult> {
  switch (name) {
    case "pre-settle-evidence-pending":
      return preSettleEvidencePending(browser, baseURL);
  }
}
