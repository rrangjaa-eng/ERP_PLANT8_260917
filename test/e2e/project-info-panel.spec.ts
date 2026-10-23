import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, projectDocuments, projects, quoteLines, quoteRevisions } from "@/db/schema";
import { and, asc, isNull } from "drizzle-orm";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { setCustomerApproval } from "@/domain/quotes/revisions";
import { approvalBasis as readApprovalBasis } from "@/repositories/quote-revisions";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createProject } from "@/domain/projects";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { insertVendor } from "@/repositories/vendors";
import { addDays, kstToday } from "@/lib/kst-date";
import { cancelProjectInfoEdit, expandProjectInfo, openProjectInfoEdit, projectInfo } from "./project-info-helpers";

// 07-18 (SC-19 · K22 · N1 · D-737 · D-P2-3 · D-P3-2) — 프로젝트 상세 정보 면.
const TODAY = kstToday(new Date());

type Account = { userId: string; email: string; password: string };

async function makeTeam(): Promise<string> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
  return team.id;
}

async function makeAccount(roleId: string, teamId: string, name = "E2E 정보 면"): Promise<Account> {
  const email = `e2e-info-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name, roleId });
  await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom: TODAY });
  return { userId, email, password: tempPassword };
}

async function login(page: Page, account: Account) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function setup(): Promise<{ lead: Account; project: { id: string; name: string } }> {
  const team = await makeTeam();
  const pm = await makeAccount(DEFAULT_ROLE_ID, team);
  const lead = await makeAccount("role-team-lead", team, `팀장${randomUUID().slice(0, 6)}`);
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E정보클라이언트-${randomUUID()}`, normalizedName: `e2e정보클라이언트-${randomUUID()}` });
  const name = `E2E정보-${randomUUID().slice(0, 8)}`;
  const created = await createProject(SYSTEM_VIEWER, {
    clientId: vendor.id,
    teamId: team,
    pmUserId: pm.userId,
    name,
    startDate: addDays(TODAY, 2),
    endDate: addDays(TODAY, 20),
  });
  await db.update(projects).set({ status: "bidding" }).where(eq(projects.id, created.id));
  return { lead, project: { id: created.id, name } };
}

function waitForSaveAction(page: Page) {
  return page.waitForResponse((response) => {
    const request = response.request();
    return request.method() === "POST" && request.headers()["next-action"] !== undefined && (request.postData() ?? "").includes('"seenStatus":');
  });
}

test.describe("정보 면 접힘 · 펼치기 (K22)", () => {
  test("첫 렌더는 접힌 한 줄 `PO 금액 · 없음`이고 펼치기는 Enter와 Space 둘 다 되며 포커스가 버튼에 남는다", async ({ page }) => {
    const { lead, project } = await setup();
    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: project.name })).toBeVisible();

    const panel = projectInfo(page);
    const toggle = panel.getByRole("button", { name: "펼치기", exact: true });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAttribute("aria-controls", "project-info-body");
    await expect(panel.getByText("PO 금액 · 없음", { exact: true })).toBeVisible();
    await expect(page.locator("#project-info-body")).toBeHidden();

    await toggle.focus();
    await toggle.press("Enter");
    const collapse = panel.getByRole("button", { name: "접기", exact: true });
    await expect(collapse).toHaveAttribute("aria-expanded", "true");
    await expect(collapse).toBeFocused();
    await expect(page.locator("#project-info-body")).toBeVisible();

    await collapse.press("Space");
    await expect(panel.getByRole("button", { name: "펼치기", exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect(panel.getByRole("button", { name: "펼치기", exact: true })).toBeFocused();
    await expect(panel.getByText("PO 금액 · 없음", { exact: true })).toBeVisible();

    await panel.getByRole("button", { name: "펼치기", exact: true }).press("Space");
    await expect(panel.getByRole("button", { name: "접기", exact: true })).toHaveAttribute("aria-expanded", "true");
  });
});

test.describe("PO 번호 · 고치기 하나 (N1 · D-737)", () => {
  test("펼친 면에 `고치기`가 하나이고, PO 번호를 입력하면 일괄 저장 1 → 저장 → 새로고침 뒤에도 값이 있다", async ({ page }) => {
    const { lead, project } = await setup();
    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await expandProjectInfo(page);

    const panel = projectInfo(page);
    await expect(panel.getByText("없음", { exact: true }).first()).toBeVisible();
    await expect(panel.getByRole("button", { name: /고치기/ })).toHaveCount(1);
    await panel.getByRole("button", { name: "고치기", exact: true }).click();
    const poNumber = panel.getByLabel("PO 번호", { exact: true });
    await poNumber.fill("PO-2026-001");
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();
    const saving = waitForSaveAction(page);
    await page.getByRole("button", { name: /일괄 저장 1/ }).click();
    await saving;

    await expect(panel.getByLabel("PO 번호", { exact: true })).toHaveCount(0);
    await expect(panel.getByText("PO-2026-001", { exact: true })).toBeVisible();
    await page.reload();
    await expandProjectInfo(page);
    await expect(projectInfo(page).getByText("PO-2026-001", { exact: true })).toBeVisible();
    const [row] = await db.select().from(projects).where(eq(projects.id, project.id));
    expect(row?.poNumber).toBe("PO-2026-001");
  });

  test("`고치기 취소`는 원래 값으로 돌리고 칸을 닫고 포커스가 `고치기`로 온다", async ({ page }) => {
    const { lead, project } = await setup();
    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await openProjectInfoEdit(page);

    const panel = projectInfo(page);
    await panel.getByLabel("PO 번호", { exact: true }).fill("PO-CANCEL");
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();
    await cancelProjectInfoEdit(page);

    await expect(panel.getByLabel("PO 번호", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /일괄 저장 \d/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /일괄 저장/ })).toHaveAttribute("aria-disabled", "true");
    await expect(panel.getByText("PO-CANCEL")).toHaveCount(0);
  });

  test("첫 Esc는 원래 값으로 돌리고 칸은 열려 있으며, 두 번째 Esc가 닫고 포커스가 `고치기`로 온다", async ({ page }) => {
    const { lead, project } = await setup();
    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await openProjectInfoEdit(page);

    const panel = projectInfo(page);
    const poNumber = panel.getByLabel("PO 번호", { exact: true });
    await poNumber.fill("PO-ESC");
    await poNumber.press("Escape");
    await expect(poNumber).toHaveValue("");
    await poNumber.press("Escape");
    await expect(panel.getByLabel("PO 번호", { exact: true })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "고치기", exact: true })).toBeFocused();
  });

  test("저장 없이 새로고침하면 복원 줄이 뜨고 복원하면 면이 펼쳐지며 그 값이 다시 일괄 저장 1로 돌아온다", async ({ page }) => {
    const { lead, project } = await setup();
    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await openProjectInfoEdit(page);

    await projectInfo(page).getByLabel("PO 번호", { exact: true }).fill("PO-RESTORE");
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();
    await page.reload();

    await expect(page.getByText("저장 안 한 편집 1칸", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "복원", exact: true }).click();
    await expect(projectInfo(page).getByRole("button", { name: "접기", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(projectInfo(page).getByLabel("PO 번호", { exact: true })).toHaveValue("PO-RESTORE");
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();
  });
});

test.describe("고치기 하나 — 기간 · PO 금액 · PO 번호 한 묶음 (N1 · D-P2-3 · K3 · K21)", () => {
  test("`고치기` 하나가 기간 두 칸 · PO 금액 · PO 번호를 한꺼번에 열고 머리의 따로 된 버튼 둘은 없다 · 기간과 PO 번호를 바꾸면 일괄 저장 2", async ({ page }) => {
    const { lead, project } = await setup();
    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: project.name })).toBeVisible();

    await expect(page.getByRole("button", { name: "총 매출 예상가 바꾸기" })).toHaveCount(0);
    await expect(page.locator("#period-open")).toHaveCount(0);
    await expect(page.locator("#pre-estimate-open")).toHaveCount(0);

    await openProjectInfoEdit(page);
    const panel = projectInfo(page);
    await expect(panel.getByRole("button", { name: /고치기/ })).toHaveCount(1);
    await expect(panel.getByLabel("시작일")).toBeFocused();
    await expect(panel.getByLabel("종료일")).toBeVisible();
    await expect(panel.getByLabel("PO 금액", { exact: true })).toBeVisible();
    await expect(panel.getByLabel("통화")).toBeVisible();
    await expect(panel.getByLabel("PO 번호", { exact: true })).toBeVisible();

    const newEnd = addDays(TODAY, 25);
    await panel.getByLabel("종료일").fill(newEnd);
    await panel.getByLabel("PO 번호", { exact: true }).fill("PO-BUNDLE");
    await expect(page.getByRole("button", { name: /일괄 저장 2/ })).toBeVisible();
    const saving = waitForSaveAction(page);
    await page.getByRole("button", { name: /일괄 저장 2/ }).click();
    await saving;

    await expect(panel.getByLabel("종료일")).toHaveCount(0);
    await expect(panel.getByText(`${addDays(TODAY, 2)} ~ ${newEnd}`, { exact: true })).toBeVisible();
    const [row] = await db.select().from(projects).where(eq(projects.id, project.id));
    expect(row?.endDate).toBe(newEnd);
    expect(row?.poNumber).toBe("PO-BUNDLE");
  });

  test("묶음의 첫 Esc는 세 칸을 모두 원래 값으로 돌리고 칸은 열려 있으며, 두 번째 Esc가 닫고 포커스가 `고치기`로 온다", async ({ page }) => {
    const { lead, project } = await setup();
    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await openProjectInfoEdit(page);

    const panel = projectInfo(page);
    const end = panel.getByLabel("종료일");
    const endBase = await end.inputValue();
    const amount = panel.getByLabel("PO 금액", { exact: true });
    const poNumber = panel.getByLabel("PO 번호", { exact: true });
    await end.fill(addDays(TODAY, 30));
    await amount.fill("1234000");
    await poNumber.fill("PO-ESC-ALL");
    await expect(page.getByRole("button", { name: /일괄 저장 3/ })).toBeVisible();

    await amount.press("Escape");
    await expect(end).toHaveValue(endBase);
    await expect(amount).toHaveValue("");
    await expect(poNumber).toHaveValue("");
    await expect(page.getByRole("button", { name: /일괄 저장 \d/ })).toHaveCount(0);

    await poNumber.press("Escape");
    await expect(panel.getByLabel("PO 번호", { exact: true })).toHaveCount(0);
    await expect(panel.getByLabel("종료일")).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "고치기", exact: true })).toBeFocused();
  });

  test("PO 금액은 이름이 곳곳에서 같다 — 빈 값은 `없음`, 저장하면 접힌 줄과 기본 섹션이 새 값이고 음수는 `PO 금액은 0 이상 · 금액 수정`", async ({ page }) => {
    const { lead, project } = await setup();
    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await expandProjectInfo(page);

    const panel = projectInfo(page);
    await expect(panel.getByText("PO 금액", { exact: true })).toBeVisible();
    await expect(panel.getByText("총 매출 예상가")).toHaveCount(0);

    await panel.getByRole("button", { name: "고치기", exact: true }).click();
    const amount = panel.getByLabel("PO 금액", { exact: true });
    await amount.fill("-1");
    const rejected = waitForSaveAction(page);
    await amount.press("Control+s");
    await rejected;
    await expect(amount).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("PO 금액은 0 이상 · 금액 수정", { exact: true })).toBeVisible();

    await amount.fill("50000000");
    const saving = waitForSaveAction(page);
    await amount.press("Control+s");
    await saving;
    await expect(panel.getByText("50,000,000", { exact: true })).toBeVisible();

    await page.reload();
    await expect(projectInfo(page).getByText("PO 금액 · 50,000,000", { exact: true })).toBeVisible();
    const [row] = await db.select().from(projects).where(eq(projects.id, project.id));
    expect(row?.preEstimateAmountKrw).toBe(50_000_000);
  });

  test("정산 0줄 표의 `기간 바꾸기`(라벨 그대로)는 면을 펼치고 묶음을 열어 종료일 칸에 포커스를 둔다", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team);
    const lead = await makeAccount("role-team-lead", team, `팀장${randomUUID().slice(0, 6)}`);
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E정보클라이언트-${randomUUID()}`, normalizedName: `e2e정보클라이언트-${randomUUID()}` });
    const created = await createProject(SYSTEM_VIEWER, {
      clientId: vendor.id,
      teamId: team,
      pmUserId: pm.userId,
      name: `E2E정보정산-${randomUUID().slice(0, 8)}`,
      startDate: addDays(TODAY, -5),
      endDate: addDays(TODAY, -1),
    });
    await db.update(projects).set({ status: "settling" }).where(eq(projects.id, created.id));

    await login(page, lead);
    await page.goto(`/projects/${created.id}`);
    const empty = page.locator("table", { has: page.locator("caption", { hasText: /^견적 줄$/ }) });
    await expect(projectInfo(page).getByRole("button", { name: "펼치기", exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect(async () => {
      await empty.getByRole("button", { name: "기간 바꾸기" }).click();
      await expect(projectInfo(page).getByRole("button", { name: "접기", exact: true })).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await expect(projectInfo(page).getByLabel("종료일")).toBeFocused();
    await expect(projectInfo(page).getByRole("button", { name: "고치기 취소", exact: true })).toBeVisible();
  });
});


// ── Task 3 — 고객 승인 섹션 · 승인 표시 패널 · 손익 · 문 칸 이유 글자 ───────────────────────────────

type SeedLine = { itemName: string; unitPrice: number; execution: number; lineKind?: "quote" | "out_of_quote" | "adjustment"; vendorId?: string };

// 담당 PM 계급 — 프로젝트 보기 · 쓰기(+ 선택: 지출결의 쓰기 · 손익 보기 · 금액 노출). 회사 범위라 팀 걱정이 없다.
async function makePm(teamId: string, options: { expenses?: boolean; pnl?: boolean; amount?: boolean; issued?: boolean }): Promise<Account & { roleId: string }> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `E2E정보PM-${randomUUID().slice(0, 8)}`, workScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "write", allowed: true });
  if (options.expenses) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "write", allowed: true });
  if (options.pnl) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "pnl", action: "view", allowed: true });
  for (const infoItem of ["project.value", "vendor.value", "team.value", "person.value", "quote.amount", "revenue.issued_amount"]) {
    const visible = infoItem === "quote.amount" ? options.amount !== false : infoItem === "revenue.issued_amount" ? (options.issued ?? options.pnl === true) : true;
    await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible });
  }
  return { ...(await makeAccount(role.id, teamId, "E2E 정보 PM")), roleId: role.id };
}

async function seedProject(input: { teamId: string; pmUserId: string; status: string; lines: SeedLine[] }): Promise<{ id: string; name: string; revisionId: string }> {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E정보승인-${randomUUID()}`, normalizedName: `e2e정보승인-${randomUUID()}` });
  const name = `E2E승인-${randomUUID().slice(0, 8)}`;
  const created = await createProject(SYSTEM_VIEWER, {
    clientId: client.id,
    teamId: input.teamId,
    pmUserId: input.pmUserId,
    name,
    startDate: addDays(TODAY, -5),
    endDate: addDays(TODAY, 20),
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, created.id);
  if (!revision) throw new Error("1차 차수가 없습니다");
  const [subcategory] = await db.select().from(codeItems).where(and(eq(codeItems.tableKey, "quote_subcategory"), eq(codeItems.active, true), isNull(codeItems.archivedAt))).orderBy(asc(codeItems.sortOrder), asc(codeItems.value)).limit(1);
  if (!subcategory) throw new Error("소분류 코드가 없습니다");
  if (input.lines.length > 0) {
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
      rows: input.lines.map((line) => ({
        id: randomUUID(),
        isNew: true as const,
        lineKind: line.lineKind ?? "quote",
        subcategory: line.lineKind === undefined || line.lineKind === "quote" ? subcategory.value : "",
        itemName: line.itemName,
        vendorId: line.vendorId ?? client.id,
        quantity: 1,
        unitPrice: { currency: "KRW" as const, amount: line.lineKind === "adjustment" ? 0 : line.unitPrice, fxRate: 1 },
        execution: { currency: "KRW" as const, amount: line.execution, fxRate: 1 },
      })),
    });
  }
  await db.update(projects).set({ status: input.status }).where(eq(projects.id, created.id));
  return { id: created.id, name, revisionId: revision.id };
}

const ONE_LINE: SeedLine[] = [{ itemName: "승인 첫 줄", unitPrice: 1_000_000, execution: 800_000 }];

test.describe("고객 승인 섹션 · 승인 표시 패널 (W6 · SC-19)", () => {
  test("`승인 표시`는 옆 패널 — 근거를 비우면 `근거 선택`, 발주서 + 메모로 저장하면 `승인됨 · 발주서` · 메모 · `발주서 파일 없음`, 서류가 생기면 경고가 사라지고 취소는 모달 그대로", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makePm(team, { amount: true });
    const project = await seedProject({ teamId: team, pmUserId: pm.userId, status: "bidding", lines: ONE_LINE });
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await expandProjectInfo(page);

    const panel = projectInfo(page);
    await expect(panel.getByRole("group", { name: "고객 승인" }).getByText("승인 전", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "고객 승인 표시", exact: true })).toHaveCount(0);
    await panel.getByRole("button", { name: "승인 표시", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "고객 승인 표시", exact: true });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("button", { name: /^취소/ })).toContainText("Esc");
    // 근거는 `발주서`로 미리 골라져 있다(카드 2026-10-23) — 비우고 1차를 누르면 서버를 부르지 않고 `근거 선택`.
    await expect(sheet.getByLabel("근거")).toHaveValue("purchase_order");
    await sheet.getByLabel("근거").selectOption("");
    await sheet.getByRole("button", { name: /^승인 표시/ }).click();
    // 오류는 칸 아래 한 곳에만 — 이유 줄에 같은 글자를 또 그리지 않는다(옵션 글자는 <p>가 아니다).
    await expect(sheet.locator("p").getByText("근거 선택", { exact: true })).toHaveCount(1);
    await expect(sheet.getByLabel("근거")).toHaveAttribute("aria-required", "true");
    await expect(sheet.getByLabel("근거")).toHaveAttribute("aria-invalid", "true");
    await expect(sheet).toBeVisible();

    // PanelForm은 제출 뒤 500ms 동안 같은 틱 연타를 막는다(SUBMIT_LOCK_GRACE_MS) — 사람 속도로 고른다.
    await page.waitForTimeout(600);
    await sheet.getByLabel("근거").selectOption("purchase_order");
    await sheet.getByLabel("메모").fill("메일로 받은 발주서");
    const approved = page.waitForResponse((response) => response.request().method() === "POST" && (response.request().postData() ?? "").includes('"approval"'));
    await sheet.getByRole("button", { name: /^승인 표시/ }).click();
    await approved;
    await expect(sheet).toHaveCount(0);

    const section = projectInfo(page).getByRole("group", { name: "고객 승인" });
    await expect(section.getByText("승인됨 · 발주서", { exact: true })).toBeVisible();
    await expect(section.getByText("메일로 받은 발주서", { exact: true })).toBeVisible();
    await expect(section.getByText("발주서 파일 없음", { exact: true })).toBeVisible();
    const [stored] = await db.select().from(quoteRevisions).where(eq(quoteRevisions.id, project.revisionId));
    expect(stored?.customerApprovalBasis).toBe("purchase_order");
    expect(stored?.customerApprovalMemo).toBe("메일로 받은 발주서");

    // 발주서 서류가 생기면 경고가 사라진다(저장은 처음부터 막지 않았다).
    await db.insert(projectDocuments).values({ projectId: project.id, kind: "purchase_order", createdBy: pm.userId });
    await page.reload();
    await expandProjectInfo(page);
    await expect(projectInfo(page).getByText("승인됨 · 발주서", { exact: true })).toBeVisible();
    await expect(projectInfo(page).getByText("발주서 파일 없음", { exact: true })).toHaveCount(0);

    // 승인 표시 취소는 확인 모달 그대로 — 취소하면 근거 · 메모도 비운다.
    await projectInfo(page).getByRole("button", { name: "승인 표시 취소", exact: true }).click();
    const cancelDialog = page.getByRole("dialog", { name: "고객 승인 표시 취소", exact: true });
    await expect(cancelDialog).toBeVisible();
    const cancelled = page.waitForResponse((response) => response.request().method() === "POST" && (response.request().postData() ?? "").includes('"approval":null'));
    await cancelDialog.getByRole("button", { name: /^승인 표시 취소/ }).click();
    await cancelled;
    await expect(cancelDialog).toHaveCount(0);
    const [cleared] = await db.select().from(quoteRevisions).where(eq(quoteRevisions.id, project.revisionId));
    expect(cleared?.customerApprovedAt).toBeNull();
    expect(cleared?.customerApprovalBasis).toBeNull();
    expect(cleared?.customerApprovalMemo).toBeNull();
  });

  test("저장 안 한 편집이 있으면 승인 표시 패널의 1차가 기존 막힘 문구로 막힌다", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makePm(team, { amount: true });
    const project = await seedProject({ teamId: team, pmUserId: pm.userId, status: "bidding", lines: ONE_LINE });
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await openProjectInfoEdit(page);
    await projectInfo(page).getByLabel("PO 번호", { exact: true }).fill("PO-막힘");
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();

    await projectInfo(page).getByRole("button", { name: "승인 표시", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "고객 승인 표시", exact: true });
    await expect(sheet.getByText("저장 안 한 편집 1칸 · 먼저 일괄 저장", { exact: true })).toBeVisible();
    await expect(sheet.getByRole("button", { name: /^승인 표시/ })).toHaveAttribute("aria-disabled", "true");
  });

  test("U14 — quote.amount를 볼 수 없는 계급은 접힌 줄이 `기간 · MM-DD~MM-DD`이고 펼친 면 어디에도 PO 금액 · 손익이 없다", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makePm(team, { amount: false, pnl: true });
    const project = await seedProject({ teamId: team, pmUserId: pm.userId, status: "bidding", lines: [] });
    await db.update(projects).set({ preEstimateAmountKrw: 77_777_000 }).where(eq(projects.id, project.id));
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);

    const panel = projectInfo(page);
    await expect(panel.getByText(/^기간 · \d{2}-\d{2}~\d{2}-\d{2}$/)).toBeVisible();
    expect(await page.content()).not.toContain("77,777,000");
    await expandProjectInfo(page);
    await expect(panel.getByText("PO 금액")).toHaveCount(0);
    await expect(panel.getByRole("group", { name: "손익" })).toHaveCount(0);
    await expect(panel.getByRole("group", { name: "기본" })).toBeVisible();
    await expect(panel.getByRole("group", { name: "고객 승인" })).toBeVisible();
  });

  test("손익 — 권한 있는 계급은 수익 · 비율을 보고, 견적이 없으면 `—` + 배지 `계산 불가`(탭하면 이유), 권한 없는 계급에겐 섹션이 없다", async ({ page, browser }) => {
    const team = await makeTeam();
    const pm = await makePm(team, { amount: true, pnl: true });
    const withLines = await seedProject({ teamId: team, pmUserId: pm.userId, status: "bidding", lines: ONE_LINE });
    const empty = await seedProject({ teamId: team, pmUserId: pm.userId, status: "bidding", lines: [] });
    await login(page, pm);

    await page.goto(`/projects/${withLines.id}`);
    await expandProjectInfo(page);
    const profit = projectInfo(page).getByRole("group", { name: "손익" });
    await expect(profit.getByText("200,000 · 20.0%", { exact: true })).toBeVisible();

    await page.goto(`/projects/${empty.id}`);
    await expandProjectInfo(page);
    const emptyProfit = projectInfo(page).getByRole("group", { name: "손익" });
    await expect(emptyProfit.getByText("—", { exact: true })).toBeVisible();
    const badge = emptyProfit.getByRole("button", { name: "계산 불가", exact: true });
    await expect(badge).toBeVisible();
    await badge.click();
    await expect(emptyProfit.getByText("계산 불가 · 견적 없음", { exact: true })).toBeVisible();

    const noPnl = await makePm(team, { amount: true, pnl: false });
    const other = await browser.newPage();
    await login(other, noPnl);
    // 담당 PM이 아니어도 보기 권한과 범위(회사)로 읽을 수 있다.
    await other.goto(`/projects/${withLines.id}`);
    await expandProjectInfo(other);
    await expect(projectInfo(other).getByRole("group", { name: "손익" })).toHaveCount(0);
    await other.close();
  });

  // /review P1 — 목록이 손익 열을 가리는 계급(견적 금액은 보되 발행 금액은 못 봄)에는 상세도 섹션이 없고 값이 HTML에 없다.
  test("손익 — 발행 금액을 못 보는 계급에겐 섹션도 값도 없고, 둘 다 보는 계급은 목록과 같은 값을 본다", async ({ page, browser }) => {
    const team = await makeTeam();
    const allowed = await makePm(team, { amount: true, pnl: true });
    const project = await seedProject({ teamId: team, pmUserId: allowed.userId, status: "bidding", lines: ONE_LINE });
    const hidden = await makePm(team, { amount: true, pnl: true, issued: false });

    await login(page, hidden);
    await page.goto(`/projects/${project.id}`);
    await expandProjectInfo(page);
    await expect(projectInfo(page).getByRole("group", { name: "손익" })).toHaveCount(0);
    const html = await page.content();
    expect(html).not.toContain("200,000 · 20.0%");
    expect(html).not.toContain("권한 없음");

    const other = await browser.newPage();
    await login(other, allowed);
    await other.goto(`/projects/${project.id}`);
    await expandProjectInfo(other);
    await expect(projectInfo(other).getByRole("group", { name: "손익" }).getByText("200,000 · 20.0%", { exact: true })).toBeVisible();
    await other.close();
  });
});

test.describe("정보 면 손익 · 금액 글자 (07-18 사후 고침)", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("`계산 불가` 배지는 폰에서 44×44 이상이고, aria-controls 대상이 닫혀 있어도 DOM에 있다", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makePm(team, { amount: true, pnl: true });
    const empty = await seedProject({ teamId: team, pmUserId: pm.userId, status: "bidding", lines: [] });
    await login(page, pm);
    await page.goto(`/projects/${empty.id}`);
    await expandProjectInfo(page);

    const badge = projectInfo(page).getByRole("group", { name: "손익" }).getByRole("button", { name: "계산 불가", exact: true });
    const box = await badge.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    const controls = await badge.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    const target = page.locator(`[id="${controls}"]`);
    await expect(target).toHaveCount(1);
    await expect(target).toBeHidden();
    await badge.click();
    await expect(target).toBeVisible();
    await expect(target).toHaveText("계산 불가 · 견적 없음");
  });

  test("PO 금액과 손익 값은 공용 Num(고정폭 숫자)이다", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makePm(team, { amount: true, pnl: true });
    const project = await seedProject({ teamId: team, pmUserId: pm.userId, status: "bidding", lines: ONE_LINE });
    await db.update(projects).set({ preEstimateAmountKrw: 5_000_000 }).where(eq(projects.id, project.id));
    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    await expandProjectInfo(page);

    for (const text of ["5,000,000", "200,000 · 20.0%"]) {
      const value = projectInfo(page).getByText(text, { exact: true });
      await expect(value).toBeVisible();
      expect(await value.evaluate((node) => getComputedStyle(node).fontVariantNumeric)).toContain("tabular-nums");
    }
  });
});

test.describe("견적 줄 문 칸 이유 글자 (S4 · SC-22)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("문이 닫힌 줄은 버튼 대신 표 낱말, 열린 줄은 `지출결의 올리기`, 문 열 권한이 없으면 열 자체가 없고 `권한 없음` 글자도 없다", async ({ page, browser }) => {
    const team = await makeTeam();
    const pm = await makePm(team, { expenses: true, amount: true });
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E문거래처-${randomUUID()}`, normalizedName: `e2e문거래처-${randomUUID()}` });
    const project = await seedProject({
      teamId: team,
      pmUserId: pm.userId,
      status: "in_progress",
      lines: [
        { itemName: "문 열린 줄", unitPrice: 1_000_000, execution: 500_000, vendorId: vendor.id },
        { itemName: "문 취소 줄", unitPrice: 1_000_000, execution: 500_000, vendorId: vendor.id },
        { itemName: "문 실행가 0 줄", unitPrice: 1_000_000, execution: 0, vendorId: vendor.id },
        { itemName: "문 견적 외 줄", unitPrice: 0, execution: 30_000, lineKind: "out_of_quote", vendorId: vendor.id },
        { itemName: "문 조정 줄", unitPrice: 0, execution: 40_000, lineKind: "adjustment", vendorId: vendor.id },
      ],
    });
    await db.update(quoteLines).set({ lineStatus: "cancelled" }).where(and(eq(quoteLines.revisionId, project.revisionId), eq(quoteLines.itemName, "문 취소 줄")));
    const seen = await readApprovalBasis(SYSTEM_VIEWER, project.revisionId);
    await setCustomerApproval({ id: pm.userId, roleId: pm.roleId }, project.revisionId, {
      approvalBasis: "verbal",
      approvedOn: TODAY,
      seenTotalKrw: seen.totalKrw,
      contentToken: seen.contentToken,
    });

    await login(page, pm);
    await page.goto(`/projects/${project.id}`);
    const grid = page.getByRole("grid", { name: "견적 줄" }).or(page.getByRole("table", { name: "견적 줄" }));
    const rowOf = (item: string) => grid.getByRole("row").filter({ hasText: item });
    // 구분 칸에도 같은 낱말이 있어 문 칸의 글자(span)로 좁힌다.
    const doorWord = (item: string, word: string) => rowOf(item).locator("span").filter({ hasText: new RegExp(`^${word}$`) });
    await expect(rowOf("문 열린 줄").getByRole("button", { name: "지출결의 올리기" }).or(rowOf("문 열린 줄").getByRole("link", { name: "지출결의 올리기" }))).toBeVisible();
    await expect(doorWord("문 취소 줄", "취소된 줄")).toBeVisible();
    await expect(doorWord("문 실행가 0 줄", "남은 실행가 없음")).toBeVisible();
    await expect(doorWord("문 견적 외 줄", "견적 외 비용")).toBeVisible();
    await expect(doorWord("문 조정 줄", "조정 줄")).toBeVisible();
    // 이유 낱말 하나가 문 칸 안 한 줄이다.
    const wordBox = await doorWord("문 실행가 0 줄", "남은 실행가 없음").boundingBox();
    expect(wordBox?.height ?? 99).toBeLessThan(24);
    // 표 위 공통 게이트 줄은 없다(승인됨) — 줄마다 반복되는 말도 없다.
    await expect(page.getByText("고객 승인 전")).toHaveCount(0);

    // 문 열 권한이 없는 계급 — 열이 없고 `권한 없음` 글자도 없다.
    const reader = await makePm(team, { expenses: false, amount: true });
    const other = await browser.newPage();
    await login(other, reader);
    await other.goto(`/projects/${project.id}`);
    await expect(other.getByRole("heading", { name: project.name })).toBeVisible();
    await expect(other.getByText("취소된 줄")).toHaveCount(0);
    await expect(other.getByText("지출결의 올리기")).toHaveCount(0);
    await expect(other.getByText("권한 없음")).toHaveCount(0);
    await other.close();
  });
});
