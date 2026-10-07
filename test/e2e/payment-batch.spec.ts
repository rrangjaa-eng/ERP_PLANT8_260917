import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { expensePayments, files, projects } from "@/db/schema";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { voidEvidence } from "@/domain/evidence";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { upsertSimpleValue } from "@/repositories/settings";
import { EVIDENCE_REQUIRED } from "@/domain/settings/keys";
import { submitReadyDraft } from "../integration/fixtures/expenses";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { makeEvidenceManagerE2E, setupExpenseE2E, type ExpenseE2E, type LineKey } from "./expense-fixture";

// 06-15(EXP-09 · UI-SPEC S1 · S2): 지급 권한자의 `/expenses` 기본 보기 「지급 대상」 → 여러 건 고르기 → 확인 모달(지급일) → 건별 처리.
// E2E DB는 스펙끼리 공유한다 — 지급 권한자는 팀 업무 범위(`expenses.team` 보기)로 이 스펙의 프로젝트 팀 문서만 보게 만든다(목록 보임 범위 = 문서 보임).
// 문서는 도메인 함수로 만든다(증빙은 메모리 가짜 저장소로 붙여 제출 게이트만 통과시키고, 결재 통과 뒤 무효 처리해 증빙 0 · P4).

const INFO_ITEMS = ["expense.value", "expense.amount", "approval.value", "project.value", "quote.amount", "vendor.value", "team.value", "person.value"];

async function teamOf(fx: ExpenseE2E): Promise<string> {
  const [row] = await db.select({ teamId: projects.teamId }).from(projects).where(eq(projects.id, fx.projectId));
  if (!row?.teamId) throw new Error("프로젝트 팀 없음");
  return row.teamId;
}

// 테스트 계급 「경영관리」 — 팀 업무 범위 · 지출결의 보기(+ 팀 보기) + 지급 처리 쓰기. 이 스펙 프로젝트의 팀에 발령한다.
async function makeTeamPayer(fx: ExpenseE2E): Promise<Person> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E일괄지급-${randomUUID().slice(0, 8)}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.team", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.payments", action: "write", allowed: true });
  for (const infoItem of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return makePerson("경영관리", role.id, await teamOf(fx), `${seoulToday().slice(0, 4)}-01-01`);
}

// 줄 하나 → 증빙 붙여 제출 → 결재선 넷 승인 → 증빙 무효(증빙 0). 문서 id를 돌려준다.
async function approvedWithoutEvidence(fx: ExpenseE2E, key: LineKey): Promise<string> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id] });
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
  const voider = await makeEvidenceManagerE2E();
  const alive = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.ownerKind, EXPENSE_DOCUMENT_KIND), eq(files.ownerId, expenseId), isNull(files.removedAt), isNull(files.voidedAt)));
  for (const file of alive) await voidEvidence(voider.viewer, { fileId: file.id, reason: "다른 건 영수증" });
  return expenseId;
}

function rowOf(page: Page, itemName: string) {
  return page.locator("tbody tr").filter({ hasText: itemName });
}

async function livePaymentCount(expenseId: string): Promise<number> {
  const rows = await db
    .select({ id: expensePayments.id })
    .from(expensePayments)
    .where(and(eq(expensePayments.expenseId, expenseId), isNull(expensePayments.cancelledAt)));
  return rows.length;
}

test.beforeAll(async () => {
  await upsertSimpleValue(SYSTEM_VIEWER, EVIDENCE_REQUIRED.key, false, null);
});

test.afterAll(async () => {
  await upsertSimpleValue(SYSTEM_VIEWER, EVIDENCE_REQUIRED.key, EVIDENCE_REQUIRED.default ?? true, null);
});

test.describe("지급 대상 · 일괄 지급 (06-15 Task 1)", () => {
  test("지급 대상 기본 보기 → 두 건 지급 — select `지급 대상` · 두 건 고름 → `지급 완료 2` → 모달 지급일 오늘 → 두 행이 빠지고 결과 글자", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const a = await approvedWithoutEvidence(fx, "tracer");
    const b = await approvedWithoutEvidence(fx, "hold");
    const payer = await makeTeamPayer(fx);

    const page = await loginPage(browser, baseURL, payer);
    await page.goto("/expenses");
    await expect(page.getByLabel("상태")).toHaveValue("지급 대상");
    const rowA = rowOf(page, fx.lines.tracer.itemName);
    const rowB = rowOf(page, fx.lines.hold.itemName);
    await waitForHydration(rowA.getByRole("checkbox"));
    await rowA.getByRole("checkbox").check();
    await rowB.getByRole("checkbox").check();

    await page.getByRole("button", { name: /^지급 완료 2/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("지급일")).toHaveValue(seoulToday());
    await dialog.getByRole("button", { name: /^지급 완료 2건/ }).click();

    await expect(dialog).toBeHidden();
    await expect(rowA).toHaveCount(0);
    await expect(rowB).toHaveCount(0);
    const live = page.locator('[aria-live="polite"]').filter({ hasText: "지급 완료" });
    await expect(live).toHaveText(/^\d{2}:\d{2} 지급 완료 2건$/);
    expect(await livePaymentCount(a)).toBe(1);
    expect(await livePaymentCount(b)).toBe(1);
    await page.context().close();
  });

  test("지급 권한 없는 사람 — select에 `지급 대상` 값이 없고 기본은 `진행 중`(05 그대로)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    await approvedWithoutEvidence(fx, "retry");

    const page = await loginPage(browser, baseURL, fx.pm);
    await page.goto("/expenses");
    const select = page.getByLabel("상태");
    await expect(select).toHaveValue("진행 중");
    await expect(select.locator("option", { hasText: "지급 대상" })).toHaveCount(0);
    await page.context().close();
  });
});
