import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, projects } from "@/db/schema";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { insertVendor } from "@/repositories/vendors";
import { addDays, kstToday } from "@/lib/kst-date";

// 04-30(D-78 · 사용자 D10·D12 · UI-SPEC rev 5 S4) — 견적 표의 편집 범위가 서버 셀 단계(DTO cellEditability)와
// 구조 판정(structuralEditability)대로 그려지는지. 날짜는 전부 오늘(KST)에서 더해 만든다(A-18). 계급 권한·정보
// 노출은 손으로 켜지 않는다(ENG-D2 — 시드만).
const TODAY = kstToday(new Date());

// 열 순서(quote-table.tsx) — 번호 · 소분류 · 항목 · 거래처 · 수량 · 단가 · 견적가 · 실행가 · 차익 · 상태 · 비고.
const COL = { subcategory: 1, itemName: 2, vendor: 3, quantity: 4, unitPrice: 5, quoteAmount: 6, execution: 7, note: 10 } as const;

type Account = { userId: string; email: string; password: string };

async function makeTeam(): Promise<string> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
  return team.id;
}

async function makeAccount(roleId: string, teamId: string, name = "E2E 편집범위"): Promise<Account> {
  const email = `e2e-scope-${randomUUID()}@example.test`;
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

type SeedLine = { itemName: string; unitPrice: number; execution: number };

// 줄은 수주중(생성 직후)일 때 도메인 함수로 넣고, 그 뒤 상태를 DB에 둔다(project-period.spec.ts와 같은 준비).
async function makeProject(input: {
  teamId: string;
  pmUserId: string;
  status: string;
  endDate: string;
  lines?: SeedLine[];
}): Promise<{ id: string; name: string }> {
  const vendor = await insertVendor(SYSTEM_VIEWER, {
    name: `E2E범위클라이언트-${randomUUID()}`,
    normalizedName: `e2e범위클라이언트-${randomUUID()}`,
  });
  const name = `E2E범위-${randomUUID().slice(0, 8)}`;
  const created = await createProject(SYSTEM_VIEWER, {
    clientId: vendor.id,
    teamId: input.teamId,
    pmUserId: input.pmUserId,
    name,
    startDate: addDays(input.endDate, -10),
    endDate: input.endDate,
  });
  if (input.lines && input.lines.length > 0) {
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, created.id);
    if (!revision) throw new Error("1차 차수가 없습니다");
    const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
    if (!subcategory) throw new Error("소분류 코드가 없습니다");
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
      rows: input.lines.map((line) => ({
        id: randomUUID(),
        isNew: true as const,
        subcategory: subcategory.value,
        itemName: line.itemName,
        quantity: 1,
        unitPrice: { currency: "KRW" as const, amount: line.unitPrice, fxRate: 1 },
        execution: { currency: "KRW" as const, amount: line.execution, fxRate: 1 },
      })),
    });
  }
  await db.update(projects).set({ status: input.status }).where(eq(projects.id, created.id));
  return { id: created.id, name };
}

// 서버 액션(일괄 저장) 요청·응답.
function isSaveAction(method: string, headers: Record<string, string>): boolean {
  return method === "POST" && headers["next-action"] !== undefined;
}

function waitForSaveResponse(page: Page) {
  return page.waitForResponse((response) => isSaveAction(response.request().method(), response.request().headers()));
}

// 격자의 데이터 행(그룹 머리글 행·폰 접힌 줄 제외).
function dataRows(page: Page): Locator {
  return page.locator('tbody tr:has(> td[role="gridcell"])');
}

function cell(page: Page, rowIndex: number, colIndex: number): Locator {
  return dataRows(page).nth(rowIndex).getByRole("gridcell").nth(colIndex);
}

async function openAsPm(page: Page, status: string, endDate: string, lines: SeedLine[]) {
  const team = await makeTeam();
  const pm = await makeAccount(DEFAULT_ROLE_ID, team);
  const project = await makeProject({ teamId: team, pmUserId: pm.userId, status, endDate, lines });
  await login(page, pm);
  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
  return { team, pm, project };
}

test.describe("견적 표 편집 범위 — 서버 셀 단계 · 구조 (04-30, PROJ-02 · UX-04 · UX-05)", () => {
  test("트레이서 — 정산 PM의 기존 줄은 실행가만 편집에 들어가고 나머지 칸은 aria-readonly이며, 실행가를 고쳐 저장하면 새로 고쳐도 남는다", async ({ page }) => {
    await openAsPm(page, "settling", addDays(TODAY, -3), [
      { itemName: "정산 줄 하나", unitPrice: 1_000_000, execution: 600_000 },
      { itemName: "정산 줄 둘", unitPrice: 500_000, execution: 300_000 },
    ]);

    await expect(page.getByRole("grid")).toBeVisible();
    await expect(dataRows(page)).toHaveCount(2);
    // 04-12 DOM 감사 FAIL(모든 칸 편집 가능 — 한 boolean으로 뭉갬)을 닫는다: 실행가 밖 편집기 칸은 전부 잠김이다.
    for (const col of [COL.subcategory, COL.itemName, COL.vendor, COL.quantity, COL.unitPrice, COL.note]) {
      await expect(cell(page, 0, col)).toHaveAttribute("aria-readonly", "true");
    }
    await expect(cell(page, 0, COL.execution)).toHaveAttribute("aria-readonly", "false");

    // 단가 칸 Enter — 편집기가 열리지 않는다.
    await cell(page, 0, COL.unitPrice).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: "단가", exact: true })).toHaveCount(0);

    // 실행가 칸 Enter — 편집기가 열린다.
    await cell(page, 0, COL.execution).focus();
    await page.keyboard.press("Enter");
    const input = page.getByRole("textbox", { name: "실행가" });
    await expect(input).toBeVisible();
    await input.fill("750000");
    await page.keyboard.press("Enter");

    const saved = waitForSaveResponse(page);
    await cell(page, 0, COL.execution).focus();
    await page.keyboard.press("Control+s");
    await saved;
    await expect(page.locator("tfoot").getByText(/저장됨/)).toBeVisible();

    await page.reload();
    await expect(cell(page, 0, COL.execution)).toHaveText("750,000");
    await expect(cell(page, 0, COL.unitPrice)).toHaveText("1,000,000");
  });

  test("완료 프로젝트를 PM이 열면 견적 표가 캡션 있는 읽기 표(격자 아님)이고 1차 「일괄 저장」이 없다", async ({ page }) => {
    await openAsPm(page, "completed", addDays(TODAY, -20), [{ itemName: "완료 줄", unitPrice: 1_000_000, execution: 600_000 }]);

    const table = page.getByRole("table", { name: "견적 줄" });
    await expect(table).toBeVisible();
    await expect(table.getByText("완료 줄")).toBeVisible();
    await expect(page.getByRole("grid")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /일괄 저장/ })).toHaveCount(0);
  });

  test("(e2) 진행 프로젝트 세 줄 중 둘째 줄의 실행가만 고쳐 저장해도 새로 고치기 전에 줄이 셋이다", async ({ page }) => {
    await openAsPm(page, "in_progress", addDays(TODAY, 10), [
      { itemName: "첫째 줄", unitPrice: 100_000, execution: 50_000 },
      { itemName: "둘째 줄", unitPrice: 200_000, execution: 100_000 },
      { itemName: "셋째 줄", unitPrice: 300_000, execution: 150_000 },
    ]);
    await expect(dataRows(page)).toHaveCount(3);

    await cell(page, 1, COL.execution).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("textbox", { name: "실행가" }).fill("120000");
    await page.keyboard.press("Enter");
    // Enter 커밋 뒤 편집기가 내려가면 포커스가 <body>로 빠진다(04-04 격자 — 실측, 이 플랜 범위 밖) — 셀로 돌아가 저장한다.
    const saved = waitForSaveResponse(page);
    await cell(page, 1, COL.execution).focus();
    await page.keyboard.press("Control+s");
    await saved;
    await expect(page.locator("tfoot").getByText(/저장됨/)).toBeVisible();

    await expect(dataRows(page)).toHaveCount(3);
    await expect(cell(page, 1, COL.execution)).toHaveText("120,000");
  });

  test("(e3) 실행가 편집기를 연 채(Enter·Tab 없이) Control+s — 요청 본문과 새로 고친 뒤 값이 마지막으로 친 값이다", async ({ page }) => {
    await openAsPm(page, "in_progress", addDays(TODAY, 10), [
      { itemName: "활성 셀 줄", unitPrice: 2_000_000, execution: 1_000_000 },
    ]);

    await cell(page, 0, COL.execution).focus();
    await page.keyboard.press("Enter");
    const input = page.getByRole("textbox", { name: "실행가" });
    await expect(input).toBeVisible();
    await input.fill("987654");

    const request = page.waitForRequest((req) => isSaveAction(req.method(), req.headers()));
    const saved = waitForSaveResponse(page);
    await page.keyboard.press("Control+s");
    expect((await request).postData() ?? "").toContain("987654");
    await saved;
    await expect(page.locator("tfoot").getByText(/저장됨/)).toBeVisible();

    await page.reload();
    await expect(cell(page, 0, COL.execution)).toHaveText("987,654");
  });

  test("(e3) 실행가 편집기를 연 채 1차 「일괄 저장」을 눌러도 요청 본문과 새로 고친 뒤 값이 마지막으로 친 값이다", async ({ page }) => {
    await openAsPm(page, "in_progress", addDays(TODAY, 10), [
      { itemName: "1차 경로 줄", unitPrice: 2_000_000, execution: 1_000_000 },
    ]);

    await cell(page, 0, COL.execution).focus();
    await page.keyboard.press("Enter");
    const input = page.getByRole("textbox", { name: "실행가" });
    await expect(input).toBeVisible();
    await input.fill("123456");

    const request = page.waitForRequest((req) => isSaveAction(req.method(), req.headers()));
    const saved = waitForSaveResponse(page);
    // 편집기가 열린 동안은 dirty 0이라 1차가 aria-disabled(「바뀐 칸 없음」)다 — Playwright의 enabled 대기를 건너뛰고
    // 사람이 누르는 것과 같은 마우스 이벤트를 보낸다(누르는 순간 편집기가 blur로 커밋된다).
    await page.getByRole("button", { name: /일괄 저장/ }).click({ force: true });
    expect((await request).postData() ?? "").toContain("123456");
    await saved;
    await expect(page.locator("tfoot").getByText(/저장됨/)).toBeVisible();

    await page.reload();
    await expect(cell(page, 0, COL.execution)).toHaveText("123,456");
  });
});
