import { randomBytes, randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { evidenceImportBatches, evidenceRecordLinks, evidenceRecords, projects } from "@/db/schema";
import { approveDocument, getApprovalView } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { seoulToday } from "@/lib/dates";
import { submitReadyDraft } from "../integration/fixtures/expenses";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { archiveTempRoles, insertTempRole, setupExpenseE2E, type ExpenseE2E, type LineKey } from "./expense-fixture";

// 06.1-10(EVID-12 · UI-SPEC S9): 지급 대상 목록 `[증빙 전체 ▾]`의 마지막 선택지 `파일만 있음` → URL `evidence=file-only` → 파일만 있고 증빙 기록 붙임이 없는 문서만.
// 문서는 도메인 함수로 만든다(파일은 메모리 가짜 저장소로 붙여 제출 · 증빙 기록 붙임은 표에 직접 — 붙이기 화면은 06.1-06 몫). 지급 권한자는 이 스펙 프로젝트의 팀 문서만 본다.

const INFO_ITEMS = ["expense.value", "expense.amount", "approval.value", "project.value", "quote.amount", "vendor.value", "team.value", "person.value"];

async function makeTeamPayer(fx: ExpenseE2E): Promise<Person> {
  const role = await insertTempRole({ id: `role-${randomUUID()}`, name: `E2E파일만-${randomUUID().slice(0, 8)}`, workScope: "team" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.team", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.payments", action: "write", allowed: true });
  for (const infoItem of INFO_ITEMS) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  const [project] = await db.select({ teamId: projects.teamId }).from(projects).where(eq(projects.id, fx.projectId));
  if (!project?.teamId) throw new Error("프로젝트 팀 없음");
  return makePerson("경영관리", role.id, project.teamId, `${seoulToday().slice(0, 4)}-01-01`);
}

async function insertLink(ownerId: string, by: string): Promise<void> {
  const [batch] = await db
    .insert(evidenceImportBatches)
    .values({ format: "hometax-tax-invoice", originalName: "매입 세금계산서.xls", fileSha256: randomBytes(32).toString("hex"), rowCount: 1, registeredCount: 1, skippedDuplicateCount: 0, uploadedBy: by })
    .returning({ id: evidenceImportBatches.id });
  if (!batch) throw new Error("등록 묶음 없음");
  const [record] = await db
    .insert(evidenceRecords)
    .values({ batchId: batch.id, format: "hometax-tax-invoice", evidenceType: "tax_invoice", dedupeKey: `e2e:${randomUUID()}`, issuedOn: "2026-09-20", supplyKrw: 12_400_000, vatKrw: 0, totalKrw: 12_400_000, createdBy: by })
    .returning({ id: evidenceRecords.id });
  if (!record) throw new Error("증빙 기록 없음");
  await db.insert(evidenceRecordLinks).values({ evidenceRecordId: record.id, ownerKind: "expense", ownerId, attachMode: "registrar", attachedBy: by });
}

// 줄 하나 → 파일 붙여 제출 → 결재선 넷 승인(지급 대상, 확인 전). withLink면 증빙 기록 붙임도 하나 더한다.
async function approvedTarget(fx: ExpenseE2E, key: LineKey, withLink: boolean): Promise<void> {
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines[key].id] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  const submitted = await submitReadyDraft(fx.pm.viewer, expenseId);
  if (submitted.kind !== "submitted") throw new Error("제출 실패");
  const view = await getApprovalView(fx.lead.viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
  if (!view) throw new Error("결재 인스턴스 없음");
  let version = view.version;
  for (const approver of [fx.lead, fx.divisionHead, fx.mgmt, fx.ceo]) {
    version = (await approveDocument(approver.viewer, { instanceId: view.instanceId, expectedVersion: version })).version;
  }
  if (withLink) await insertLink(expenseId, fx.mgmt.viewer.id);
}

function rowOf(page: Page, itemName: string) {
  return page.locator("tbody tr").filter({ hasText: itemName });
}

const PAY_URL = `/expenses?${new URLSearchParams({ status: "지급 대상" }).toString()}`;

test.describe("지급 대상 `파일만 있음` (06.1-10)", () => {
  test("`증빙` 선택 칸의 마지막 선택지 `파일만 있음` → URL evidence=file-only · 파일만 있는 행만 · 새로 고침 뒤에도 같은 값", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    await approvedTarget(fx, "tracer", false);
    await approvedTarget(fx, "hold", true);
    const page = await loginPage(browser, baseURL, await makeTeamPayer(fx));

    await page.goto(PAY_URL);
    await expect(rowOf(page, fx.lines.tracer.itemName)).toHaveCount(1);
    await expect(rowOf(page, fx.lines.hold.itemName)).toHaveCount(1);
    const select = page.getByLabel("증빙", { exact: true });
    await waitForHydration(select);
    const labels = await select.locator("option").allTextContents();
    expect(labels.at(-1)).toBe("파일만 있음");
    await select.selectOption({ label: "파일만 있음" });
    await expect(page).toHaveURL(/evidence=file-only/);
    await expect(rowOf(page, fx.lines.hold.itemName)).toHaveCount(0);
    await expect(rowOf(page, fx.lines.tracer.itemName)).toHaveCount(1);

    await page.reload();
    await expect(page).toHaveURL(/evidence=file-only/);
    await expect(page.getByLabel("증빙", { exact: true })).toHaveValue("file-only");
    await expect(rowOf(page, fx.lines.tracer.itemName)).toHaveCount(1);
    await expect(rowOf(page, fx.lines.hold.itemName)).toHaveCount(0);
    await page.context().close();
  });

  test("파일만 있는 문서가 없으면 `조건에 맞는 건이 없습니다` · `필터 지우기`", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    await approvedTarget(fx, "tracer", true);
    const page = await loginPage(browser, baseURL, await makeTeamPayer(fx));

    await page.goto(`${PAY_URL}&evidence=file-only`);
    await expect(page.getByText("조건에 맞는 건이 없습니다")).toBeVisible();
    await expect(page.getByRole("link", { name: "필터 지우기" })).toHaveAttribute("href", PAY_URL);
    await page.context().close();
  });
});

test.afterAll(archiveTempRoles);
