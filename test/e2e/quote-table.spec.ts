import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { db } from "@/db/client";
import { teams } from "@/db/schema";

// 04-04 Task 3 — 견적 줄 표의 키보드 계약·범위 선택·붙여넣기·전부 거부를
// E2E로 증명한다. 실제 엑셀 붙여넣기(인용 규칙)는 자동화가 닿지 못해
// 사람 확인으로 넘긴다(04-VALIDATION.md Manual-Only Verifications) — 이
// 스펙은 그 앞단계인 "브라우저 클립보드 이벤트가 표에 정확히 반영되는지"
// 까지만 증명한다.

async function loginAndOpenProject(page: Page): Promise<{ projectId: string }> {
  const client = await insertVendor(SYSTEM_VIEWER, {
    name: `E2Equote클라이언트-${Date.now()}`,
    normalizedName: `e2equote클라이언트-${Date.now()}`,
  });
  const email = `e2e-quote-${randomUUID()}@example.test`;
  const { userId: pmUserId, tempPassword } = await createAccount(SYSTEM_VIEWER, {
    email,
    name: "E2E Employee",
    roleId: DEFAULT_ROLE_ID,
  });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");

  const projectName = `E2Equote프로젝트-${Date.now()}`;
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

async function pasteIntoFocusedCell(page: Page, text: string) {
  await page.evaluate((clipboardText) => {
    const el = document.activeElement;
    const dt = new DataTransfer();
    dt.setData("text/plain", clipboardText);
    const event = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
    el?.dispatchEvent(event);
  }, text);
}

test.describe("견적 줄 표 — 키보드 계약·붙여넣기·전부 거부(04-04)", () => {
  test("(a) 마우스 클릭 없이 키보드만으로 줄 하나를 끝까지 입력하고 저장한다", async ({ page }) => {
    await loginAndOpenProject(page);

    const emptyButton = page.getByRole("button", { name: /첫 줄 만들기/ });
    await emptyButton.focus();
    await page.keyboard.press("Enter"); // 클릭 호출 없이 첫 줄을 만든다.

    const dataRow = page.locator("tbody tr").nth(1);
    const gridcell = (index: number) => dataRow.getByRole("gridcell").nth(index);

    // 항목(2) — Enter로 편집 진입 → 타이핑 → Enter로 커밋.
    await gridcell(2).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.type("키보드로만 적은 항목");
    await page.keyboard.press("Enter");

    // 단가(5) — 금액만 입력(통화는 기본 KRW를 그대로 둔다).
    await gridcell(5).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.type("1200000");
    await page.keyboard.press("Enter");

    // 실행가(7).
    await gridcell(7).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.type("800000");
    await page.keyboard.press("Enter");

    // 저장 — Ctrl+S(그리드에 포커스가 있는 채로).
    await gridcell(7).focus();
    await page.keyboard.press("Control+s");

    await expect(page.getByText(/저장됨/)).toBeVisible();
    await expect(page.getByText("1,200,000").first()).toBeVisible();
    await expect(page.getByText("400,000").first()).toBeVisible(); // 차익 = 1,200,000 - 800,000
  });

  test("(b) 클립보드 여러 칸 붙여넣기가 활성 셀부터 오른쪽·아래로 채운다", async ({ page }) => {
    await loginAndOpenProject(page);

    await page.getByRole("button", { name: /첫 줄 만들기/ }).click();
    const dataRow = page.locator("tbody tr").nth(1);
    const gridcell = (index: number) => dataRow.getByRole("gridcell").nth(index);

    // 항목(2)에 한 칸, 수량(4)부터 오른쪽으로 "수량\t단가" 두 칸 — 활성
    // 셀에서 오른쪽·아래로 채워지는 것을 두 자리에서 각각 확인한다.
    await gridcell(2).focus();
    await pasteIntoFocusedCell(page, "붙여넣은 항목");
    await expect(page.getByText("붙여넣은 항목")).toBeVisible();

    await gridcell(4).focus();
    await pasteIntoFocusedCell(page, "7\t50000");

    await expect(gridcell(4)).toHaveText("7"); // 수량
    await expect(gridcell(5)).toHaveText("50,000"); // 단가(KRW 서식)
  });

  test("(c)(d)(e) 숫자 아닌 값을 숫자 열에 붙여넣으면 오류로 고정되고 저장이 전부 거부되며, 다른 셀 편집값은 남는다", async ({ page }) => {
    await loginAndOpenProject(page);

    await page.getByRole("button", { name: /첫 줄 만들기/ }).click();
    const dataRow = page.locator("tbody tr").nth(1);
    const gridcell = (index: number) => dataRow.getByRole("gridcell").nth(index);

    // 항목을 먼저 채운다(UX-04 — 오류 뒤에도 이 값이 남아야 한다).
    await gridcell(2).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.type("오류 검증용 항목");
    await page.keyboard.press("Enter");

    // 단가에 숫자가 아닌 값을 붙여넣는다 — 오류 셀로 고정되어야 한다.
    await gridcell(5).focus();
    await pasteIntoFocusedCell(page, "숫자아님");

    await expect(gridcell(5)).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText(/숫자가 아닙니다/)).toBeVisible();

    // (c) 저장 버튼 자체가 오류 이유와 함께 비활성 — 서버 왕복 없이 거부.
    const saveButton = page.getByRole("button", { name: /일괄 저장/ });
    await expect(saveButton).toBeDisabled();
    await expect(page.getByText(/오류.*고쳐야 저장됩니다/)).toBeVisible();

    // (e) 항목 편집값은 오류가 있어도 그대로 남아 있다.
    await expect(page.getByText("오류 검증용 항목")).toBeVisible();

    // (d) 오류를 고치면 저장이 다시 가능해지고 전부 반영된다.
    await gridcell(5).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Control+a");
    await page.keyboard.type("1500000");
    await page.keyboard.press("Enter");

    await expect(gridcell(5)).not.toHaveAttribute("aria-invalid", "true");
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    await expect(page.getByText(/저장됨/)).toBeVisible();
    await expect(page.getByText("1,500,000").first()).toBeVisible();
  });

  test("F2 — 항목을 비운 채 저장하면 next-safe-action 검증 오류가 화면에 alert로 보인다", async ({ page }) => {
    await loginAndOpenProject(page);

    await page.getByRole("button", { name: /첫 줄 만들기/ }).click();
    const dataRow = page.locator("tbody tr").nth(1);
    const gridcell = (index: number) => dataRow.getByRole("gridcell").nth(index);

    // 단가만 채우고 항목(2)은 비워 둔다 — 서버 스키마의 itemName.min(1)이
    // 거부해야 한다(클라이언트 게이트는 빈 값 자체를 막지 않는다).
    await gridcell(5).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.type("1200000");
    await page.keyboard.press("Enter");

    const saveButton = page.getByRole("button", { name: /일괄 저장/ });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    // role=alert는 Next.js 라우트 안내에도 있어 문구로 좁힌다.
    await expect(page.getByRole("alert").filter({ hasText: "저장하지 못했습니다 · 입력값을 확인하세요" })).toBeVisible();
  });

  test("(f) 폰 뷰포트에서 줄을 탭하면 행 시트가 열리고 행동 줄이 없다", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await loginAndOpenProject(page);

    await page.getByRole("button", { name: /첫 줄 만들기/ }).click();

    const dataRow = page.locator("tbody tr").nth(1);
    await dataRow.locator("td[role='gridcell']").nth(2).click();
    await page.keyboard.press("Enter");
    await page.keyboard.type("폰 시트 확인용 항목");
    await page.keyboard.press("Enter");

    // 접힌 요약 행(P2/P3 값)이 폰에서만 렌더되고 탭하면 시트가 열린다.
    const collapsedRow = page.locator('[role="button"][aria-label*="상세 보기"]');
    await collapsedRow.click();

    const sheet = page.getByRole("dialog", { name: /폰 시트 확인용 항목|항목명 없음/ });
    await expect(sheet).toBeVisible();
    // 행동 줄이 없다 — 시트 안에 button 요소가 "닫기" 하나뿐이다.
    const sheetButtons = sheet.getByRole("button");
    await expect(sheetButtons).toHaveCount(1);
    await expect(sheetButtons.first()).toHaveAccessibleName("닫기");
  });

  test("(g) 실제 엑셀(Windows, 2026-09-23 캡처) 인코딩을 붙여넣고 저장·새로고침해도 원본이 보존된다", async ({ page }) => {
    await loginAndOpenProject(page);

    await page.getByRole("button", { name: /첫 줄 만들기/ }).click();
    // 각 데이터 행 뒤에 폰 전용 접힌 요약 행이 데스크톱에서도 DOM에 숨어
    // 있다(display:none) — tbody tr는 그 둘을 번갈아 담으므로 데이터 행
    // 인덱스는 짝수 오프셋이다.
    const gridcell = (rowIndex: number, colIndex: number) =>
      page
        .locator("tbody tr")
        .nth(1 + rowIndex * 2)
        .getByRole("gridcell")
        .nth(colIndex);

    // 04-04 Task 3 인간 확인 — 실제 Windows Excel(2026-09-23 캡처) clipboard
    // text/plain 원문에서 헤더 행 + 번호 열을 뺀 3×3(항목·수량·단가). 그리드의
    // 실제 열 순서는 소분류(1)·항목(2)·거래처(3)·수량(4)·단가(5)라 텍스트
    // 열(항목)과 숫자 열 둘(수량·단가)이 인접하지 않는다(거래처 select 셀이
    // 사이에 있다 — 목록 밖 문자열이 떨어지면 오류 셀이 된다) — 그래서 실제
    // 열에 대응하는 칸만 두 번에 나눠 주입한다(04-04-SUMMARY.md에 매핑 기록).
    const itemNamePaste = '무대 설치\n"대형" 현수막\n"비고 첫 줄\r\n둘째 줄"';
    const numberPaste = "2\t 1,200,000 \n5\t 35,000 \n1\t₩450,000 ";

    await gridcell(0, 2).focus(); // 항목 — 아래로 넘쳐 2줄이 자동으로 생긴다.
    await pasteIntoFocusedCell(page, itemNamePaste);

    await gridcell(0, 4).focus(); // 수량 → 단가로 오른쪽까지 채운다.
    await pasteIntoFocusedCell(page, numberPaste);

    async function assertValues() {
      // 따옴표만 있고 줄바꿈이 없는 칸은 따옴표가 그대로 남는다(지워지지도,
      // 두 개가 되지도 않는다).
      await expect(gridcell(0, 2)).toHaveText("무대 설치");
      expect(await gridcell(1, 2).textContent()).toBe('"대형" 현수막');

      // 줄바꿈이 있던 칸은 한 칸으로 들어가고 CRLF가 아니라 LF 하나만 남는다.
      const row3ItemText = await gridcell(2, 2).textContent();
      expect(row3ItemText).not.toContain("\r");
      expect(row3ItemText).toBe("비고 첫 줄\n둘째 줄");

      // 쉼표·공백·통화 기호가 섞인 금액이 숫자로 읽힌다.
      await expect(gridcell(0, 4)).toHaveText("2");
      await expect(gridcell(0, 5)).toHaveText("1,200,000");
      await expect(gridcell(1, 4)).toHaveText("5");
      await expect(gridcell(1, 5)).toHaveText("35,000");
      await expect(gridcell(2, 4)).toHaveText("1");
      await expect(gridcell(2, 5)).toHaveText("450,000");
    }

    await assertValues();

    const saveButton = page.getByRole("button", { name: /일괄 저장/ });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await expect(page.getByText(/저장됨/)).toBeVisible();

    // 저장 후 다시 열어도(새로고침 — 서버 왕복) 같은 값이다.
    await page.reload();
    await expect(page.locator("tbody tr").nth(1)).toBeVisible();
    await assertValues();
  });
  test("(h) 저장된 줄에서 Delete → ui/confirm-dialog 확인 → 포커스·Tab 가두기·Esc 복귀 → 재삭제로 삭제 확정(04-46)", async ({ page }) => {
    const client = await insertVendor(SYSTEM_VIEWER, {
      name: `E2E삭제확인-${Date.now()}`,
      normalizedName: `e2e삭제확인-${Date.now()}`,
    });
    const email = `e2e-delete-${randomUUID()}@example.test`;
    const { userId: pmUserId, tempPassword } = await createAccount(SYSTEM_VIEWER, {
      email,
      name: "E2E Delete",
      roleId: DEFAULT_ROLE_ID,
    });
    const [team] = await db.select().from(teams).limit(1);
    if (!team) throw new Error("시드된 팀이 없습니다");

    const projectName = `E2E삭제확인프로젝트-${Date.now()}`;
    const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId, name: projectName });
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("1차 차수가 없습니다");
    // 저장된 줄(id가 있는 줄)을 도메인 함수로 미리 만든다 — UI로 만들면
    // 아직 dirty·id 없는 새 줄이라 "저장된 줄에서 Delete" 전제와 다르다.
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, [
      {
        subcategory: "sub-a",
        itemName: "삭제 대상 줄",
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
    const gridcell = (index: number) => dataRow.getByRole("gridcell").nth(index);
    const itemCell = gridcell(2);

    await itemCell.focus();
    await page.keyboard.press("Delete");

    const dialog = page.getByRole("dialog", { name: "견적 줄 삭제" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("보관함으로 옮겨짐 · 복원은 관리자")).toBeVisible();
    const primaryButton = dialog.getByRole("button", { name: "견적 줄 삭제" });
    await expect(primaryButton).toBeFocused();

    // Tab이 다이얼로그 밖의 다른 인터랙션 요소로 나가지 않는다 — 네이티브
    // showModal()의 포커스 가두기를 확인한다. Chromium은 마지막 포커스
    // 가능 요소 다음 Tab에서 잠깐 activeElement를 <body>(포커스 없음 상태)로
    // 돌렸다가 그다음 Tab에서 다이얼로그 첫 요소로 되돌아온다(실측 확인,
    // 최소 재현 `<dialog><button>a</button><button>b</button></dialog>`도
    // 같다) — 이 한 단계는 트랩이 깨진 것이 아니라 body는 인터랙션 요소가
    // 아니므로 허용한다. 실제로 지켜야 할 계약은 "다이얼로그 밖의 다른
    // 버튼·링크·입력으로 넘어가지 않는다"이다.
    // body에 머무는 것은 한 단계뿐이다 — body 다음 Tab은 반드시 다이얼로그 안으로
    // 돌아와야 하고, 다이얼로그 밖의 요소는 한 번도 포커스되지 않는다.
    let previous: "inside" | "body" | "outside" = "inside";
    let insideSteps = 0;
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      const where = await dialog.evaluate((node) =>
        node.contains(document.activeElement) ? "inside" : document.activeElement === document.body ? "body" : "outside",
      );
      expect(where).not.toBe("outside");
      if (where === "body") expect(previous).toBe("inside");
      if (where === "inside") insideSteps++;
      previous = where;
    }
    expect(insideSteps).toBeGreaterThanOrEqual(4);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(itemCell).toBeFocused();

    // 다시 Delete → 1차 확인.
    await page.keyboard.press("Delete");
    await expect(dialog).toBeVisible();
    await expect(primaryButton).toBeFocused();

    // Esc 직후 곧바로 Delete(CI 실패 재현) — 브라우저는 close()에서 포커스를
    // 셀로 바로 돌려주지만 close 이벤트는 따로 줄 선 작업이라, 입력 작업이
    // 먼저 처리되면 Delete가 닫힘 이벤트보다 앞선다. 그래도 확인은 다시 열려야 한다.
    await dialog.evaluate(async (node) => {
      node.dispatchEvent(new Event("cancel", { cancelable: true }));
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      const cell = document.activeElement;
      if (!(cell instanceof HTMLElement) || node.contains(cell)) throw new Error("포커스가 셀로 돌아오지 않았다");
      cell.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }));
    });
    await expect(dialog).toBeVisible();
    await expect(primaryButton).toBeFocused();

    // 04-46 편차(SUMMARY 「계약 1 편차」 옆에 별도로 기록) — behavior 원문은
    // "일괄 저장 건수 +1"을 요구하지만, 이 플랜은 ④에서 confirmDeleteLine을
    // "기존 확인 처리기" 그대로 재사용한다(plan action ④). 그 함수는 줄을
    // 로컬 상태에서 지울 뿐 dirty로 표시하지 않고, 삭제를 서버에 보내는
    // 경로(quote_lines.archivedAt/archivedBy 컬럼은 있으나 saveQuoteLines에
    // 쓰는 곳이 없다)도 이 플랜의 파일 목록(ui/app만)에 없다 — 실측 확인:
    // 확정 클릭 뒤 "일괄 저장"은 여전히 비활성(dirtyCount 0)이다. 견적 줄
    // 삭제의 실제 서버 반영(archivedAt 기록)은 이 플랜 밖의 새 도메인 작업
    // 이라 여기서는 계약(모달 UI·포커스·Esc)만 굳히고 dirty 집계는 손대지
    // 않는다.
    await primaryButton.click();
    await expect(dialog).toBeHidden();
    await expect(itemCell).toBeHidden();
  });

  test("금액을 볼 수 없는 직급은 상세 화면이 오류 없이 열리고 금액은 —, 표는 편집할 수 없다(/ship 리뷰)", async ({ page }) => {
    // role-ceo에 프로젝트 보기·쓰기와 project.value만 주고 quote.amount는 주지 않는다 — PM 역할을 건드리지 않아 다른 테스트와 격리된다.
    await upsertPermission(SYSTEM_VIEWER, { roleId: "role-ceo", menu: "projects", action: "view", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId: "role-ceo", menu: "projects", action: "write", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "project.value", visible: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "quote.amount", visible: false });

    const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E금액숨김-${Date.now()}`, normalizedName: `e2e금액숨김-${Date.now()}` });
    const { userId: pmUserId } = await createAccount(SYSTEM_VIEWER, { email: `e2e-pm-${randomUUID()}@example.test`, name: "E2E PM", roleId: DEFAULT_ROLE_ID });
    const [team] = await db.select().from(teams).limit(1);
    if (!team) throw new Error("시드된 팀이 없습니다");
    const projectName = `E2E금액숨김프로젝트-${Date.now()}`;
    const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId, name: projectName });
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("1차 차수가 없습니다");
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, [
      { subcategory: "sub-a", itemName: "숨김 줄", unitPrice: { currency: "KRW", amount: 1000, fxRate: 1 }, execution: { currency: "KRW", amount: 0, fxRate: 1 } },
    ]);

    const email = `e2e-ceo-${randomUUID()}@example.test`;
    const { tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "E2E 금액숨김", roleId: "role-ceo" });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호").fill(tempPassword);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
    await expect(page.getByText("숨김 줄")).toBeVisible();
    await expect(page.getByText("1,000")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "줄 추가", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /첫 줄 만들기/ })).toHaveCount(0);
  });
});

// 04-28 — 저장된 줄을 도메인 함수로 미리 만든 프로젝트를 기획 PM으로 연다.
async function openProjectWithSavedLines(
  page: Page,
  rows: { subcategory: string; itemName: string; amount: number; execution?: number }[],
): Promise<{ projectId: string; revisionId: string; email: string; password: string }> {
  const stamp = `${Date.now()}-${randomUUID().slice(0, 6)}`;
  const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E단축키-${stamp}`, normalizedName: `e2e단축키-${stamp}` });
  const email = `e2e-shortcut-${randomUUID()}@example.test`;
  const { userId: pmUserId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "E2E Shortcut", roleId: DEFAULT_ROLE_ID });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const projectName = `E2E단축키프로젝트-${stamp}`;
  const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId, name: projectName });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("1차 차수가 없습니다");
  if (rows.length > 0) {
    await saveQuoteLines(
      SYSTEM_VIEWER,
      revision.id,
      rows.map((row) => ({
        subcategory: row.subcategory,
        itemName: row.itemName,
        unitPrice: { currency: "KRW" as const, amount: row.amount, fxRate: 1 },
        execution: { currency: "KRW" as const, amount: row.execution ?? 0, fxRate: 1 },
      })),
    );
  }

  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(tempPassword);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
  return { projectId: project.id, revisionId: revision.id, email, password: tempPassword };
}

function quoteTable(page: Page) {
  return page.locator("table", { has: page.locator("caption", { hasText: /^견적 줄$/ }) });
}

function quoteDataRows(page: Page) {
  return quoteTable(page).locator('tbody tr:has(td[role="gridcell"])');
}

function quoteCell(page: Page, rowIndex: number, colIndex: number) {
  return quoteDataRows(page).nth(rowIndex).getByRole("gridcell").nth(colIndex);
}

function isServerAction(request: { method: () => string; headers: () => Record<string, string> }) {
  return request.method() === "POST" && request.headers()["next-action"] !== undefined;
}

async function editTextCell(page: Page, rowIndex: number, colIndex: number, text: string) {
  await quoteCell(page, rowIndex, colIndex).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+a");
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

test.describe("견적 줄 표 — Ctrl 전용 단축키·힌트 줄·이중 저장 없음(04-28 Task 1)", () => {
  test("(a)(b) Meta+s는 저장하지 않고 Control+s는 저장한다", async ({ page }) => {
    await openProjectWithSavedLines(page, [{ subcategory: "sub-a", itemName: "메타 키 확인 줄", amount: 1000000 }]);
    let actionRequests = 0;
    page.on("request", (request) => {
      if (isServerAction(request)) actionRequests++;
    });

    await editTextCell(page, 0, 2, "메타 키로는 저장 안 됨");
    await quoteCell(page, 0, 2).focus();

    // (a) Mac 메타 키 조합 — 아무 일도 일어나지 않는다(D-94 「동작도 Ctrl」).
    await page.keyboard.press("Meta+s");
    await page.waitForTimeout(500); // 부정 단언 — 요청이 나가지 않음을 잠시 지켜본다.
    expect(actionRequests).toBe(0);
    await expect(page.getByText(/저장됨/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();

    // (b) Ctrl+S — 저장된다.
    const saved = page.waitForResponse((response) => isServerAction(response.request()));
    await page.keyboard.press("Control+s");
    await saved;
    await expect(page.getByText(/저장됨/)).toBeVisible();
    expect(actionRequests).toBe(1);
  });

  test("(c) 힌트 줄은 지금 되는 키 여섯 항목의 라벨 kbd 묶음이고 저장 항목이 없다", async ({ page }) => {
    await openProjectWithSavedLines(page, [{ subcategory: "sub-a", itemName: "힌트 줄 확인", amount: 1000 }]);

    const hintRow = page.locator("p", { hasText: "줄 복제" });
    await expect(hintRow).toHaveCount(1);
    await expect(hintRow).toHaveText(
      "이동 ↑↓←→ · 붙여넣기 Ctrl+V · 취소 Esc · 새 줄 Ctrl+Enter · 줄 이동 Alt+↑↓ · 줄 복제 Ctrl+D",
    );
    await expect(hintRow.locator("kbd")).toHaveText(["↑↓←→", "Ctrl+V", "Esc", "Ctrl+Enter", "Alt+↑↓", "Ctrl+D"]);
    await expect(hintRow).not.toContainText("저장");

    // 1차 버튼 kbd가 저장 단축키를 말한다(힌트 줄과 두 자리에 쓰지 않는다).
    await expect(page.getByRole("button", { name: /일괄 저장/ }).locator("kbd")).toHaveText("Ctrl+S");
  });

  test("(d) 새 줄 + Control+s 두 번 빠르게 → 새로 고친 뒤 줄 수가 정확히 +1", async ({ page }) => {
    await openProjectWithSavedLines(page, [{ subcategory: "sub-a", itemName: "기존 줄", amount: 1000 }]);
    await expect(quoteDataRows(page)).toHaveCount(1);
    let actionRequests = 0;
    page.on("request", (request) => {
      if (isServerAction(request)) actionRequests++;
    });

    await quoteCell(page, 0, 2).focus();
    await page.keyboard.press("Control+Enter");
    await expect(quoteDataRows(page)).toHaveCount(2);
    await editTextCell(page, 1, 2, "두 번 눌러도 한 줄");

    await quoteCell(page, 1, 2).focus();
    const saved = page.waitForResponse((response) => isServerAction(response.request()));
    await page.keyboard.press("Control+s");
    await page.keyboard.press("Control+s");
    await saved;
    await expect(page.getByText(/저장됨/)).toBeVisible();
    expect(actionRequests).toBe(1);

    await page.reload();
    await expect(quoteDataRows(page).first()).toBeVisible();
    await expect(quoteDataRows(page)).toHaveCount(2);
  });
});

test.describe("견적 줄 표 — 힌트 줄·1차·EMPTY에 적힌 조합이 전부 동작한다(04-28 Task 2 · C-07 · T17)", () => {
  test("힌트 줄 여섯 조합과 1차 kbd Ctrl+S를 차례로 눌러 적힌 결과를 단언한다", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await openProjectWithSavedLines(page, [
      { subcategory: "stage_construction", itemName: "무대 줄1", amount: 1000 },
      { subcategory: "stage_construction", itemName: "무대 줄2", amount: 2000 },
      { subcategory: "print_production", itemName: "인쇄 줄", amount: 3000 },
    ]);
    await expect(quoteDataRows(page)).toHaveCount(3);

    // 이동 ↑↓←→ — 활성 셀 좌표가 방향키대로 움직인다.
    await quoteCell(page, 0, 2).focus();
    await page.keyboard.press("ArrowDown");
    await expect(quoteCell(page, 1, 2)).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(quoteCell(page, 1, 3)).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(quoteCell(page, 1, 2)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(quoteCell(page, 0, 2)).toBeFocused();

    // 붙여넣기 Ctrl+V — 클립보드 값이 활성 셀에 들어간다.
    await page.evaluate(() => navigator.clipboard.writeText("7"));
    await quoteCell(page, 2, 4).focus();
    await page.keyboard.press("Control+v");
    await expect(quoteCell(page, 2, 4)).toHaveText("7");

    // 취소 Esc — 편집 중 값이 되돌아가고 포커스는 그 셀에 남는다.
    await quoteCell(page, 0, 2).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Control+a");
    await page.keyboard.type("취소될 값");
    await page.keyboard.press("Escape");
    await expect(quoteCell(page, 0, 2)).toHaveText("무대 줄1");
    await expect(quoteCell(page, 0, 2)).toBeFocused();

    // 줄 이동 Alt+↑↓ — 같은 그룹 안 순서가 바뀐다.
    await quoteCell(page, 1, 2).focus();
    await page.keyboard.press("Alt+ArrowUp");
    await expect(quoteCell(page, 0, 2)).toHaveText("무대 줄2");
    await expect(quoteCell(page, 1, 2)).toHaveText("무대 줄1");

    // 줄 복제 Ctrl+D — 줄 수 +1, 값이 복제된다.
    await quoteCell(page, 2, 2).focus();
    await page.keyboard.press("Control+d");
    await expect(quoteDataRows(page)).toHaveCount(4);
    await expect(quoteCell(page, 3, 2)).toHaveText("인쇄 줄");

    // 새 줄 Ctrl+Enter — 줄 수 +1.
    await quoteCell(page, 0, 2).focus();
    await page.keyboard.press("Control+Enter");
    await expect(quoteDataRows(page)).toHaveCount(5);
    await editTextCell(page, 2, 2, "새 줄 항목");

    // 1차 kbd Ctrl+S — 저장된다(힌트 줄에는 없다).
    await quoteCell(page, 0, 2).focus();
    const saved = page.waitForResponse((response) => isServerAction(response.request()));
    await page.keyboard.press("Control+s");
    await saved;
    await expect(page.getByText(/저장됨/)).toBeVisible();
  });

  test("0줄 EMPTY의 3차 「첫 줄 만들기」 kbd Ctrl+Enter로 첫 줄이 정확히 하나 생긴다", async ({ page }) => {
    await openProjectWithSavedLines(page, []);
    const emptyAction = page.getByRole("button", { name: /첫 줄 만들기/ });
    await expect(emptyAction.locator("kbd")).toHaveText("Ctrl+Enter");
    await emptyAction.focus();
    await page.keyboard.press("Control+Enter");
    await expect(quoteDataRows(page)).toHaveCount(1);
  });
});
