import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { db } from "@/db/client";
import { teams } from "@/db/schema";
import { createFixtureUser } from "./fixtures";

// 04-09 — D-95(숫자는 모두 천 단위 쉼표) E2E. Task 1은 트레이서(외화 견적
// 줄 단가 2행) 한 경로만 증명한다 — 나머지 표시·입력 경로는 Task 2·3이 더한다.
// Task 3 ⑤의 (a)~(f)는 아래에 이어 붙인다.

// revenue-section.spec.ts의 grantFinanceRole과 같은 역할 — "경영관리"는
// SEED_ROLES 5종에 없어 role-ceo에 직접 권한을 준다(D-57).
async function grantFinanceRole() {
  await upsertPermission(SYSTEM_VIEWER, { roleId: "role-ceo", menu: "projects", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: "role-ceo", menu: "projects.revenue", action: "write", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "project.value", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "revenue.issued_amount", visible: true });
  // 발행·입금 두 표는 tablesVisible = issuedEntries !== undefined &&
  // paidEntries !== undefined로 함께 묶여 있다 — 입금액 가시성이 빠지면
  // 발행 표도 같이 사라진다(RevenueSection).
  await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "revenue.paid_amount", visible: true });
}

async function loginAndOpenProject(page: Page): Promise<{ projectId: string }> {
  const client = await insertVendor(SYSTEM_VIEWER, {
    name: `E2Enumber클라이언트-${Date.now()}`,
    normalizedName: `e2enumber클라이언트-${Date.now()}`,
  });
  const email = `e2e-number-${randomUUID()}@example.test`;
  const { userId: pmUserId, tempPassword } = await createAccount(SYSTEM_VIEWER, {
    email,
    name: "E2E Employee",
    roleId: DEFAULT_ROLE_ID,
  });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");

  const projectName = `E2Enumber프로젝트-${Date.now()}`;
  const project = await createProject(SYSTEM_VIEWER, {
    clientId: client.id,
    teamId: team.id,
    pmUserId,
    name: projectName,
  });

  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(tempPassword);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);

  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

  return { projectId: project.id };
}

test.describe("숫자 서식(D-95, 04-09)", () => {
  test("Task 1 — 외화 견적 줄 단가 2행이 USD 4,400.00 @1,318.1818로 저장·표시된다", async ({ page }) => {
    await loginAndOpenProject(page);

    await page.getByRole("button", { name: /첫 줄 만들기/ }).click();
    const dataRow = page.locator("tbody tr").nth(1);
    const gridcell = (index: number) => dataRow.getByRole("gridcell").nth(index);

    await gridcell(2).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.type("외화 단가 확인용 항목");
    await page.keyboard.press("Enter");

    await gridcell(5).focus();
    await page.keyboard.press("Enter");
    await page.getByLabel("단가 통화").selectOption("USD");
    await page.getByLabel("단가", { exact: true }).fill("4400");
    const fxRateInput = page.getByLabel("단가 환율");
    await fxRateInput.fill("1318.1818");
    await fxRateInput.press("Enter");

    await expect(page.getByText("USD 4,400.00 @1,318.1818")).toBeVisible();

    await gridcell(5).focus();
    await page.keyboard.press("Control+s");
    await expect(page.getByText(/저장됨/)).toBeVisible();

    await expect(page.getByText("USD 4,400.00 @1,318.1818")).toBeVisible();
  });

  // Task 3 ⑤(a) — 실행가 셀 표시 + 저장·새로고침 뒤 값 보존. 이 표엔 실행가
  // 전용 합계 행이 따로 없다(견적 줄 표 footer는 "합계 (공급가액 · N줄)"
  // 라벨만 찍고 금액은 안 더한다) — 실행가가 반영되는 유일한 합계성 값은
  // 서버가 계산하는 차익(=견적가-실행가)이라 그 값으로 "합계 행 반영"을
  // 확인한다.
  test("(a) 실행가 셀에 1200000을 치면 1,200,000이고, 저장·새로고침 뒤에도 남으며 차익에 반영된다", async ({ page }) => {
    await loginAndOpenProject(page);

    await page.getByRole("button", { name: /첫 줄 만들기/ }).click();
    const dataRow = page.locator("tbody tr").nth(1);
    const gridcell = (index: number) => dataRow.getByRole("gridcell").nth(index);

    await gridcell(2).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.type("실행가 확인용 항목");
    await page.keyboard.press("Enter");

    // 견적가(quoteAmount = 수량 1 × 단가)가 있어야 차익이 0이 아닌 값으로
    // 나뉜다 — 단가를 2,000,000으로 둔다.
    await gridcell(5).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Control+a");
    await page.keyboard.type("2000000");
    await page.keyboard.press("Enter");

    await gridcell(7).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Control+a");
    await page.keyboard.type("1200000");
    await page.keyboard.press("Enter");
    await expect(gridcell(7)).toHaveText("1,200,000");

    await gridcell(7).focus();
    await page.keyboard.press("Control+s");
    await expect(page.getByText(/저장됨/)).toBeVisible();

    await page.reload();
    await expect(page.locator("tbody tr").nth(1)).toBeVisible();
    await expect(gridcell(7)).toHaveText("1,200,000");
    // 차익 = 견적가 2,000,000 - 실행가 1,200,000 = 800,000(서버 재계산). 폰
    // 전용 접힌 요약 행에도 같은 값이 "· 800,000"로 나와 두 곳이 걸린다
    // (strict mode) — 그리드 셀 쪽으로 좁힌다.
    await expect(page.getByRole("gridcell", { name: "800,000" })).toBeVisible();
  });

  // Task 3 ⑤(b) — 설정 화면 숫자 칸도 이 훅을 쓴다. 소수 자리 상한(4)을
  // 넘는 한 글자는 조용히 무시된다(C-02, lib/format-number.ts scanTyped).
  test("(b) 설정 화면 USD 최근 환율 칸에 1318.18181을 치면 1,318.1818까지만 들어간다", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/admin/settings");
    const fxInput = page.getByLabel("USD 최근 환율");
    await fxInput.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("1318.18181");
    await expect(fxInput).toHaveValue("1,318.1818");
  });

  // Task 3 ⑤(c) — 수량 칸(C-02).
  test("(c) 수량 셀에 1200을 치면 1,200이고 저장·새로고침 뒤에도 1,200이다", async ({ page }) => {
    await loginAndOpenProject(page);

    await page.getByRole("button", { name: /첫 줄 만들기/ }).click();
    const dataRow = page.locator("tbody tr").nth(1);
    const gridcell = (index: number) => dataRow.getByRole("gridcell").nth(index);

    await gridcell(2).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.type("수량 확인용 항목");
    await page.keyboard.press("Enter");

    await gridcell(4).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Control+a");
    await page.keyboard.type("1200");
    await page.keyboard.press("Enter");
    await expect(gridcell(4)).toHaveText("1,200");

    await gridcell(4).focus();
    await page.keyboard.press("Control+s");
    await expect(page.getByText(/저장됨/)).toBeVisible();

    await page.reload();
    await expect(page.locator("tbody tr").nth(1)).toBeVisible();
    await expect(gridcell(4)).toHaveText("1,200");
  });

  // Task 3 ⑤(d) — USD 단가 칸(C-02). Task 1과 달리 .fill() 대신 키보드
  // 타이핑으로 각 글자를 친다 — 통째 값 주입이 아니라 산 채로 커밋 경로를 증명한다.
  test("(d) USD 단가 칸에 4400을 치면 4,400.00 2행이고 저장·새로고침 뒤에도 같다", async ({ page }) => {
    await loginAndOpenProject(page);

    await page.getByRole("button", { name: /첫 줄 만들기/ }).click();
    const dataRow = page.locator("tbody tr").nth(1);
    const gridcell = (index: number) => dataRow.getByRole("gridcell").nth(index);

    await gridcell(2).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.type("USD 단가 확인용 항목");
    await page.keyboard.press("Enter");

    await gridcell(5).focus();
    await page.keyboard.press("Enter");
    await page.getByLabel("단가 통화").selectOption("USD");

    const amountInput = page.getByLabel("단가", { exact: true });
    await amountInput.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("4400");

    const fxRateInput = page.getByLabel("단가 환율");
    await fxRateInput.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("1250.5");
    await fxRateInput.press("Enter");

    await expect(page.getByText("USD 4,400.00 @1,250.5")).toBeVisible();

    await gridcell(5).focus();
    await page.keyboard.press("Control+s");
    await expect(page.getByText(/저장됨/)).toBeVisible();

    await page.reload();
    await expect(page.locator("tbody tr").nth(1)).toBeVisible();
    await expect(page.getByText("USD 4,400.00 @1,250.5")).toBeVisible();
  });

  // Task 3 ⑤(e) — 매출 발행 금액 칸(C-02). revenue-section.spec.ts의
  // grantFinanceRole/발행 줄 흐름과 같은 모양.
  test("(e) 매출 발행액 칸에 12400000을 치면 12,400,000이고 저장·새로고침 뒤에도 같다", async ({ page }) => {
    const vendor = await insertVendor(SYSTEM_VIEWER, {
      name: `E2Enumber발행액클라이언트-${Date.now()}`,
      normalizedName: `e2enumber발행액클라이언트-${Date.now()}`,
    });
    const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    await grantFinanceRole();
    const finance = await createFixtureUser({ roleId: "role-ceo" });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(pm.email);
    await page.getByLabel("비밀번호").fill(pm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/projects?new=1");
    await page.getByLabel("클라이언트").selectOption({ label: vendor.name });
    await page.getByLabel("팀").selectOption({ index: 1 });
    await page.getByLabel("담당 PM").selectOption({ index: 1 });
    const projectName = `E2Enumber발행액프로젝트-${Date.now()}`;
    await page.getByLabel("프로젝트명").fill(projectName);
    await page.getByRole("button", { name: "프로젝트 등록" }).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    const projectUrl = page.url();

    await page.goto("/account");
    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("이메일").fill(finance.email);
    await page.getByLabel("비밀번호").fill(finance.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto(projectUrl);
    await page.getByRole("button", { name: "발행 줄 추가" }).click();
    await page.getByLabel("발행일").fill("2026-09-01");
    const issuedAmount = page.getByLabel("발행액");
    await issuedAmount.click();
    await page.keyboard.type("12400000");
    await expect(issuedAmount).toHaveValue("12,400,000");

    // 이 화면엔 견적 줄이 없어(이 테스트는 매출 섹션만 다룬다) "저장됨" 표시가
    // 견적 줄 표 footer 안에 있어 뜨지 않는다(revenue-section.spec.ts도 같은
    // 이유로 "저장됨" 대신 서버 계산 값으로 저장 완료를 확인한다) — 저장
    // 버튼이 다시 비활성(dirtyCount 0)으로 돌아오는 것으로 저장 완료를 본다.
    const saveButton = page.getByRole("button", { name: /일괄 저장/ });
    await saveButton.click();
    await expect(saveButton).toBeDisabled();

    await page.reload();
    await expect(page.getByLabel("발행액")).toHaveValue("12,400,000");
  });

  // Task 3 ⑤(f) — 원화 단가 셀 편집기 안에서 클립보드 붙여넣기가 거부되고
  // 이전 값이 남는다(C-02). 표 위(편집 중이 아닌) 붙여넣기는
  // use-clipboard-paste.ts 경로라 04-47이 다룬다 — 이 케이스는 편집기
  // <input> 안의 진짜 네이티브 붙여넣기만 증명한다.
  test('(f) 원화 단가 편집 칸에 "1,234.56"을 붙여넣으면 거부되고 이전 값이 저장·새로고침 뒤에도 남는다', async ({
    page,
  }) => {
    const client = await insertVendor(SYSTEM_VIEWER, {
      name: `E2Enumber원화거부-${Date.now()}`,
      normalizedName: `e2enumber원화거부-${Date.now()}`,
    });
    const email = `e2e-number-f-${randomUUID()}@example.test`;
    const { userId: pmUserId, tempPassword } = await createAccount(SYSTEM_VIEWER, {
      email,
      name: "E2E Employee",
      roleId: DEFAULT_ROLE_ID,
    });
    const [team] = await db.select().from(teams).limit(1);
    if (!team) throw new Error("시드된 팀이 없습니다");
    const projectName = `E2Enumber원화거부프로젝트-${Date.now()}`;
    const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId, name: projectName });
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("1차 차수가 없습니다");
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, [
      {
        subcategory: "sub-a",
        itemName: "원화 단가 거부 확인 줄",
        unitPrice: { currency: "KRW", amount: 1000000, fxRate: 1 },
        execution: { currency: "KRW", amount: 0, fxRate: 1 },
      },
    ]);

    await page.goto("/login");
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호").fill(tempPassword);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

    const dataRow = page.locator("tbody tr").nth(1);
    const unitPriceCell = dataRow.getByRole("gridcell").nth(5);
    await unitPriceCell.focus();
    await page.keyboard.press("Enter");

    const amountInput = page.getByLabel("단가", { exact: true });
    await expect(amountInput).toHaveValue("1,000,000");

    // 편집기 <input> 안에서 진짜 클립보드 붙여넣기(Ctrl+V)를 겪는다 — 표
    // 수준 onPaste(TSV 붙여넣기)가 편집 중인 입력 칸의 paste까지 삼키면
    // 이 붙여넣기가 아무 효과도 내지 못한다.
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await amountInput.click();
    await page.evaluate(() => navigator.clipboard.writeText("1,234.56"));
    await page.keyboard.press("ControlOrMeta+v");

    await expect(amountInput).toHaveValue("1,000,000");
    await expect(page.getByText("원화는 소수점 없이 적어 주세요")).toBeVisible();

    await page.keyboard.press("Enter");
    await unitPriceCell.focus();
    await page.keyboard.press("Control+s");
    await expect(page.getByText(/저장됨/)).toBeVisible();

    await page.reload();
    await expect(page.locator("tbody tr").nth(1)).toBeVisible();
    await expect(dataRow.getByRole("gridcell").nth(5)).toHaveText("1,000,000");
  });

  // 리뷰 후속 — 환율 칸을 지우고 '-' 하나만 남기면 parseNumberInput이
  // NaN을 돌려준다. `?? initialFxRate`는 null만 대체하고 NaN은 그대로
  // 통과시켜 커밋 값이 NaN이 됐다(F3와 같은 결의 결함, C-02 정신을
  // 어긴다) — JSON.stringify가 NaN을 null로 바꿔 화면엔 환율 자리가
  // "—"로 보인다. 환율은 이전 값으로 남아야 한다.
  test("(g) 단가 환율 칸을 지우고 '-'만 남기면 이전 환율로 남는다(빈 값이 아니다)", async ({ page }) => {
    await loginAndOpenProject(page);

    await page.getByRole("button", { name: /첫 줄 만들기/ }).click();
    const dataRow = page.locator("tbody tr").nth(1);
    const gridcell = (index: number) => dataRow.getByRole("gridcell").nth(index);

    await gridcell(2).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.type("환율 하이픈 확인용 항목");
    await page.keyboard.press("Enter");

    await gridcell(5).focus();
    await page.keyboard.press("Enter");
    await page.getByLabel("단가 통화").selectOption("USD");

    const amountInput = page.getByLabel("단가", { exact: true });
    await amountInput.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("4400");

    const fxRateInput = page.getByLabel("단가 환율");
    const initialFxRateText = await fxRateInput.inputValue();
    await fxRateInput.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Delete");
    await page.keyboard.type("-");
    await fxRateInput.press("Enter");

    await expect(page.getByText(`USD 4,400.00 @${initialFxRateText}`)).toBeVisible();
  });
});
