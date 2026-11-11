import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page, type Request } from "@playwright/test";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems } from "@/db/schema";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { setCustomerApproval } from "@/domain/quotes/revisions";
import { approvalBasis as readApprovalBasis } from "@/repositories/quote-revisions";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { insertVendor } from "@/repositories/vendors";
import { addDays, kstToday } from "@/lib/kst-date";
import { buildQuoteXlsx, HEADER, type TestSheet } from "@/test/support/quote-xlsx";

// 07.2-14(X2 · UI-SPEC S10) — 견적 엑셀 올리기 화면: 입구 · 시트 고르기 · 결과 줄 · 건너뜀 펼침 · 거절 줄 · 승인 차수 · 폭별 노출 · 표 위 줄 순서(DC-12).
// 담당 PM(DEFAULT_ROLE_ID — projects 쓰기)이 1280에서 연다. 서버 규칙(파서 · 권리 · 크기)은 단위 · 통합 시험이 잰다.

const TODAY = kstToday(new Date());
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function makeTeam(): Promise<string> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
  return team.id;
}

async function makePm(teamId: string) {
  const email = `e2e-xlsx-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "E2E 엑셀 PM", roleId: DEFAULT_ROLE_ID });
  await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom: TODAY });
  return { userId, email, password: tempPassword };
}

async function login(page: Page, account: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

// 담당 PM · 프로젝트(수주중) · 기존 줄 `existing`개를 만든다.
async function seed(existing: number) {
  const teamId = await makeTeam();
  const pm = await makePm(teamId);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E엑셀거래처-${randomUUID()}`, normalizedName: `e2e엑셀거래처-${randomUUID()}` });
  const name = `E2E엑셀-${randomUUID().slice(0, 8)}`;
  const created = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId, pmUserId: pm.userId, name, startDate: addDays(TODAY, -5), endDate: addDays(TODAY, 30) });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, created.id);
  if (!revision) throw new Error("1차 차수가 없습니다");
  const [subcategory] = await db.select().from(codeItems).where(and(eq(codeItems.tableKey, "quote_subcategory"), eq(codeItems.active, true), isNull(codeItems.archivedAt))).orderBy(asc(codeItems.sortOrder), asc(codeItems.value)).limit(1);
  if (!subcategory) throw new Error("소분류 코드가 없습니다");
  if (existing > 0) {
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
      rows: Array.from({ length: existing }, (_, index) => ({
        id: randomUUID(),
        isNew: true as const,
        lineKind: "quote" as const,
        subcategory: subcategory.value,
        itemName: `기존 줄 ${index + 1}`,
        quantity: 1,
        unitPrice: { currency: "KRW" as const, amount: 100_000, fxRate: 1 },
        execution: { currency: "KRW" as const, amount: 50_000, fxRate: 1 },
      })),
    });
  }
  return { pm, projectId: created.id, name, revisionId: revision.id };
}

async function open(page: Page, input: { existing: number }) {
  const project = await seed(input.existing);
  await login(page, project.pm);
  await page.goto(`/projects/${project.projectId}`);
  await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
  return project;
}

function dataRows(page: Page): Locator {
  return page.getByRole("table", { name: "견적 줄" }).or(page.getByRole("grid", { name: "견적 줄" })).locator("tbody tr:not([class*='groupRow']):not([class*='collapsedRow'])");
}

function isSaveAction(request: Request): boolean {
  return request.method() === "POST" && request.headers()["next-action"] !== undefined && (request.postData() ?? "").includes("\"seenStatus\"");
}

const fileInput = (page: Page) => page.locator("input[type='file'][accept='.xlsx']");
const resultLine = (page: Page, text: string | RegExp) => page.getByRole("status").filter({ hasText: text });
const saveButton = (page: Page, count: number) => page.getByRole("button", { name: new RegExp(`일괄 저장 ${count}`) });

async function upload(page: Page, bytes: Uint8Array | Buffer, name = "견적.xlsx") {
  await fileInput(page).setInputFiles({ name, mimeType: XLSX_TYPE, buffer: Buffer.from(bytes) });
}

const threeLines: TestSheet = {
  name: "견적서",
  rows: [
    [...HEADER],
    ["엑셀 가", 1, 100_000, 1, 100_000, "비고 가"],
    ["엑셀 나", 2, 50_000, 3, 300_000, null],
    ["엑셀 다", null, null, null, 70_000, null],
  ],
};

// 건너뜀 3 · 불일치 2 · 합계 차이 1,200 · 정상 줄 5(견적가 합 9,000 ≠ Grand Total 10,200).
const noisySheet = (name: string): TestSheet => ({
  name,
  rows: [
    [...HEADER],
    ["L1", 1, 1000, 1, 1000, null],
    ["L2", 2, 500, 1, 1000, null],
    ["L3", 1, 2000, 1, 2000, null],
    ["M1", 1, 3000, 1, 3500, null],
    ["M2", 2, 1000, 1, 5000, null],
    [null, 1, 1000, 1, 1000, null],
    ["P", 1, null, null, null, null],
    ["Q", "abc", 1000, 1, 1000, null],
    ["Grand Total", null, null, null, 10_200, null],
  ],
});

test.describe("견적 엑셀 올리기 (07.2-14 · S10)", () => {
  test("트레이서 — 한 시트 3줄이 표 맨 아래 미저장 줄 · 결과 줄 `엑셀 올림 3줄` + `되돌리기` · 일괄 저장 3 → 저장 뒤 줄 유지", async ({ page }) => {
    await open(page, { existing: 1 });
    await expect(dataRows(page)).toHaveCount(1);
    await expect(page.getByRole("button", { name: "엑셀 올리기" })).toBeVisible();

    await upload(page, buildQuoteXlsx([threeLines]));
    const line = resultLine(page, "엑셀 올림 3줄");
    await expect(line).toBeVisible();
    await expect(line.getByRole("button", { name: "되돌리기" })).toBeVisible();
    await expect(dataRows(page)).toHaveCount(4);
    await expect(dataRows(page).nth(1)).toContainText("엑셀 가");
    await expect(dataRows(page).nth(3)).toContainText("엑셀 다");
    await expect(dataRows(page).nth(3)).toContainText("70,000");
    await expect(saveButton(page, 3)).toBeVisible();
    // 건너뜀 0이면 조각 없음 · 건너뜀 보기 DOM 0 · 합계 행 바닥 줄에 같은 글자 0.
    await expect(line).not.toContainText("건너뜀");
    await expect(page.getByText("건너뜀 보기")).toHaveCount(0);
    await expect(page.locator("tfoot").getByText("엑셀 올림")).toHaveCount(0);
    await page.screenshot({ path: "test-results/07.2-14-quote-xlsx-1280.png", fullPage: true });

    const saved = page.waitForResponse((response) => isSaveAction(response.request()));
    await saveButton(page, 3).click();
    await saved;
    await page.reload();
    await expect(dataRows(page)).toHaveCount(4);
    await expect(resultLine(page, "엑셀 올림")).toHaveCount(0);
  });

  test("되돌리기 — 이번에 붙인 줄만 빠지고 결과 줄이 사라지며 포커스가 입구로 돌아간다", async ({ page }) => {
    await open(page, { existing: 1 });
    await upload(page, buildQuoteXlsx([threeLines]));
    await expect(dataRows(page)).toHaveCount(4);
    await resultLine(page, "엑셀 올림 3줄").getByRole("button", { name: "되돌리기" }).click();
    await expect(dataRows(page)).toHaveCount(1);
    await expect(resultLine(page, "엑셀 올림")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "엑셀 올리기" })).toBeFocused();
  });

  test("미저장 편집과 엑셀 줄 혼합 — 일괄 저장 N 합산", async ({ page }) => {
    await open(page, { existing: 1 });
    await upload(page, buildQuoteXlsx([threeLines]));
    await expect(saveButton(page, 3)).toBeVisible();
    await page.getByRole("button", { name: "줄 추가" }).first().click();
    await expect(saveButton(page, 4)).toBeVisible();
    await resultLine(page, "엑셀 올림 3줄").getByRole("button", { name: "되돌리기" }).click();
    await expect(saveButton(page, 1)).toBeVisible();
  });

  test("시트가 둘이면 시트 고르기 → 결과 줄 조각 순서 · 건너뜀 보기 펼침(모달 0)", async ({ page }) => {
    await open(page, { existing: 0 });
    await upload(page, buildQuoteXlsx([noisySheet("견적서A"), { name: "견적서B", rows: [[...HEADER], ["B1", 1, 2000, 1, 2000, null], ["Grand Total", null, null, null, 2000, null]] }]), "양식.xlsx");

    const dialog = page.getByRole("dialog", { name: "시트 고르기" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("양식.xlsx");
    await expect(dialog.getByRole("option")).toHaveCount(2);
    await expect(dialog.getByRole("option").first()).toContainText("견적서A");
    await expect(dialog.getByRole("option").first()).toContainText("5줄 · Grand Total 10,200");
    await expect(dialog.getByRole("option").nth(1)).toContainText("1줄 · Grand Total 2,000");
    await dialog.getByRole("button", { name: /이 시트로/ }).click();
    await expect(dialog).toBeHidden();

    const line = resultLine(page, "엑셀 올림 5줄");
    await expect(line).toContainText("건너뜀 3줄 · 합계 1,200 차이 · 엑셀 금액과 다름 2줄 · 엑셀 올림 5줄");
    await expect(dataRows(page)).toHaveCount(5);
    // warning 조각과 muted 끝 조각은 색이 다르다.
    const colors = await line.locator("span > span").evaluateAll((spans) => spans.map((span) => getComputedStyle(span).color));
    expect(colors.length).toBeGreaterThanOrEqual(4);
    expect(colors[0]).toBe(colors[1]);
    expect(colors[0]).not.toBe(colors[colors.length - 1]);

    const skipped = page.locator("details", { hasText: "건너뜀 보기" });
    await expect(skipped.locator("li").first()).toBeHidden();
    await skipped.locator("summary").click();
    await expect(skipped.locator("li").first()).toBeVisible();
    await expect(skipped.locator("li")).toHaveText(["행 7 · 항목 없음", "행 8 · 단가·금액 없음", "행 9 · 숫자 아님 · 수량"]);
    await expect(page.locator("dialog[open]")).toHaveCount(0);
  });

  test("거절 4종 — 글자 정확 + 3차 `다시 올리기`", async ({ page }) => {
    await open(page, { existing: 0 });
    const refused = async (bytes: Uint8Array | Buffer, message: string) => {
      await upload(page, bytes);
      const line = resultLine(page, message);
      await expect(line).toBeVisible();
      await expect(line.locator("span").first()).toHaveText(message);
      await expect(line.getByRole("button", { name: "다시 올리기" })).toBeVisible();
    };
    await refused(buildQuoteXlsx([{ name: "A", rows: [["가", "나"], [1, 2]] }]), "열 이름 없음 · 항목 · 수량 · 단가 또는 금액");
    await refused(Buffer.from("ITEM,QTY\nA,1\n"), "엑셀이 아님 · .xlsx로 다시");
    await refused(Buffer.alloc(1_400_000), "1.4MB · 1MB 초과 · 줄여 다시");
    const many: TestSheet = { name: "많음", rows: [[...HEADER], ...Array.from({ length: 301 }, (_, index) => [`줄 ${index + 1}`, 1, 1000, 1, 1000, null])] };
    await refused(buildQuoteXlsx([many]), "300줄 초과 · 300줄까지");
  });

  test("DC-12 — 저장 안 한 편집 복원 줄이 있는 채로 올리면 표 위 줄 순서는 복원 줄 → 결과 줄", async ({ page }) => {
    await open(page, { existing: 1 });
    await upload(page, buildQuoteXlsx([threeLines]));
    await expect(saveButton(page, 3)).toBeVisible();
    await page.reload();
    const banner = page.getByText(/저장 안 한 편집 \d+칸/).first();
    await expect(banner).toBeVisible();
    await upload(page, buildQuoteXlsx([{ name: "견적서", rows: [[...HEADER], ["순서 줄", 1, 1000, 1, 1000, null]] }]));
    const line = resultLine(page, "엑셀 올림 1줄");
    await expect(line).toBeVisible();
    const bannerHandle = await banner.elementHandle();
    const lineHandle = await line.elementHandle();
    if (!bannerHandle || !lineHandle) throw new Error("줄을 찾지 못했다");
    // 복원 줄이 결과 줄보다 앞(DOM 순서 = 보이는 순서).
    const bannerBeforeLine = await page.evaluate(([a, b]) => Boolean(a && b && a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING), [bannerHandle, lineHandle] as const);
    expect(bannerBeforeLine).toBe(true);
  });

  test("승인 차수 — 입구 DOM 0 · 표 위 기존 잠김 한 줄 그대로", async ({ page }) => {
    const project = await seed(1);
    const seen = await readApprovalBasis(SYSTEM_VIEWER, project.revisionId);
    await setCustomerApproval({ id: project.pm.userId, roleId: DEFAULT_ROLE_ID }, project.revisionId, { approvalBasis: "verbal", approvedOn: TODAY, seenTotalKrw: seen.totalKrw, contentToken: seen.contentToken });
    await login(page, project.pm);
    await page.goto(`/projects/${project.projectId}`);
    await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
    await expect(page.getByText("1차 고객 승인됨 · 고치려면 새 차수")).toBeVisible();
    await expect(page.getByRole("button", { name: "엑셀 올리기" })).toHaveCount(0);
    await expect(fileInput(page)).toHaveCount(0);
  });

  test("폭별 — 1024 입구 있음 · 768 · 375 입구 · 결과 줄 없음", async ({ page }) => {
    await open(page, { existing: 1 });
    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(page.getByRole("button", { name: "엑셀 올리기" })).toBeVisible();
    await upload(page, buildQuoteXlsx([threeLines]));
    await expect(resultLine(page, "엑셀 올림 3줄")).toBeVisible();
    for (const width of [768, 375]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(page.getByRole("button", { name: "엑셀 올리기" })).toHaveCount(0);
      await expect(resultLine(page, "엑셀 올림")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });
});
