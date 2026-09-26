import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor } from "@/repositories/vendors";
import { listPermissions, listVisibility, upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { createRevisionFromCurrent } from "@/domain/quotes/revisions";
import { db } from "@/db/client";
import { projects, quoteLines, revenueEntries, teams } from "@/db/schema";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { insertRole } from "@/repositories/roles";
import { saveRevenue } from "@/domain/revenue";
import { addDays, kstToday } from "@/lib/kst-date";
import { and, eq, isNull, sum } from "drizzle-orm";

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
    // 04-24 — 승인 다이얼로그 부제·차수 표에도 합계가 있어 견적 줄 표 안에서 찾는다(검토 S1).
    await expect(quoteTable(page).getByText("1,200,000").first()).toBeVisible();
    await expect(quoteTable(page).getByText("400,000").first()).toBeVisible(); // 차익 = 1,200,000 - 800,000
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
    await expect(page.getByText(/숫자 형식 오류/)).toBeVisible();

    // (c) 04-47(DR-5) — 오류가 남아도 1차는 살아 있고(옛 오류 게이트 문자열 없음), 오류 칸 수는 합계 행이 말한다.
    const saveButton = page.getByRole("button", { name: /일괄 저장/ });
    await expect(saveButton).toBeEnabled();
    await expect(saveButton).not.toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText(/고쳐야 저장됩니다|고친 뒤 저장/)).toHaveCount(0);
    await expect(quoteTable(page).locator("tfoot")).toContainText("오류 1칸");

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
    // 04-24 — 승인 다이얼로그 부제·차수 표에도 합계가 있어 견적 줄 표 안에서 찾는다(검토 S1).
    await expect(quoteTable(page).getByText("1,500,000").first()).toBeVisible();
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
    await expect(page.getByRole("alert").filter({ hasText: "저장 실패 · 입력값 확인" })).toBeVisible();
  });

  test("(f) 폰 뷰포트에서 줄을 탭하면 행 시트가 열리고 행동 줄이 없다", async ({ page }) => {
    // 04-49(DR-24 · DR-36) — 1024 미만에서는 줄을 만들거나 셀을 고칠 수 없다 — 줄은 PC 폭에서 만들고 폰 폭으로 바꿔 읽는다.
    await loginAndOpenProject(page);

    await page.getByRole("button", { name: /첫 줄 만들기/ }).click();

    const dataRow = page.locator("tbody tr").nth(1);
    // 클릭이 편집기를 연다(04-04). 여기서 Enter를 더 누르면 빈 값을 확정하고 아래로 간다(리뷰 B-1).
    await dataRow.locator("td[role='gridcell']").nth(2).click();
    await expect(dataRow.locator("td[role='gridcell']").nth(2).locator("input")).toBeFocused();
    await page.keyboard.type("폰 시트 확인용 항목");
    await page.keyboard.press("Enter");
    await page.setViewportSize({ width: 375, height: 800 });

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
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
      {
        id: randomUUID(), isNew: true, subcategory: "sub-a",
        itemName: "삭제 대상 줄",
        unitPrice: { currency: "KRW", amount: 1000000, fxRate: 1 },
        execution: { currency: "KRW", amount: 0, fxRate: 1 },
      },
    ] });

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
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
      { id: randomUUID(), isNew: true, subcategory: "sub-a", itemName: "숨김 줄", unitPrice: { currency: "KRW", amount: 1000, fxRate: 1 }, execution: { currency: "KRW", amount: 0, fxRate: 1 } },
    ] });

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
      { rows: rows.map((row) => ({
        id: randomUUID(),
        isNew: true as const,
        subcategory: row.subcategory,
        itemName: row.itemName,
        unitPrice: { currency: "KRW" as const, amount: row.amount, fxRate: 1 },
        execution: { currency: "KRW" as const, amount: row.execution ?? 0, fxRate: 1 },
      })) },
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
  const cell = quoteCell(page, rowIndex, colIndex);
  // 편집 입력이 실제로 열렸는지 확인한다 — 하이드레이션 전에 누른 Enter는 사라진다.
  await expect(async () => {
    await cell.focus();
    await page.keyboard.press("Enter");
    await expect(cell.locator("input")).toBeFocused({ timeout: 1000 });
  }).toPass();
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

  test("(c) 힌트 줄은 지금 되는 키 일곱 항목(04-19 — Tab·Ctrl+C 되돌림)의 라벨 kbd 묶음이고 저장 항목이 없다", async ({ page }) => {
    await openProjectWithSavedLines(page, [{ subcategory: "sub-a", itemName: "힌트 줄 확인", amount: 1000 }]);

    const hintRow = page.locator("p", { hasText: "줄 복제" });
    await expect(hintRow).toHaveCount(1);
    await expect(hintRow).toHaveText(
      "이동 Tab ↑↓←→ · 복사 Ctrl+C · 붙여넣기 Ctrl+V · 취소 Esc · 새 줄 Ctrl+Enter · 줄 이동 Alt+↑↓ · 줄 복제 Ctrl+D",
    );
    await expect(hintRow.locator("kbd")).toHaveText(["Tab ↑↓←→", "Ctrl+C", "Ctrl+V", "Esc", "Ctrl+Enter", "Alt+↑↓", "Ctrl+D"]);
    // 04-19(DR-31) — 페이지 줄이 없으면 합계 행(표) 바로 아래.
    expect(await quoteTable(page).evaluate((table) => table.nextElementSibling?.textContent)).toContain("줄 복제 Ctrl+D");
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
  test("힌트 줄 일곱 조합과 1차 kbd Ctrl+S를 차례로 눌러 적힌 결과를 단언한다", async ({ page }) => {
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

    // 04-19 — 이동 Tab: 편집 중 Tab은 확정하고 오른쪽 편집 셀을 연다(편집 중이 아니면 표를 떠난다).
    await page.keyboard.press("Enter");
    await expect(quoteCell(page, 0, 2).locator("input")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(quoteCell(page, 0, 3).locator("select, input").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(quoteCell(page, 0, 3)).toBeFocused();

    // 04-19 — 복사 Ctrl+C: 활성 셀의 복사 글자가 클립보드에 실린다(네이티브 copy 이벤트).
    await quoteCell(page, 0, 2).focus();
    await page.keyboard.press("Control+c");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("무대 줄1");

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

async function saveWithKeyboard(page: Page, rowIndex: number, colIndex: number) {
  await quoteCell(page, rowIndex, colIndex).focus();
  const responded = page.waitForResponse((response) => isServerAction(response.request()));
  await page.keyboard.press("Control+s");
  await responded;
}

test.describe("견적 줄 표 — 저장 거부 봉투 → 충돌 셀·서버 형식 오류 셀(04-28 Task 3 · DR-25)", () => {
  test("두 창 충돌 → 충돌 셀 → 키보드만으로 「그 값으로」·「덮어쓰기」 해소", async ({ page, browser, baseURL }) => {
    const opened = await openProjectWithSavedLines(page, [
      { subcategory: "stage_construction", itemName: "충돌 줄", amount: 5000000, execution: 1000000 },
      { subcategory: "stage_construction", itemName: "다른 줄", amount: 2000000, execution: 500000 },
    ]);

    // 같은 담당 PM의 두 번째 창(B).
    const contextB = await browser.newContext({ baseURL });
    const pageB = await contextB.newPage();
    await pageB.goto("/login");
    await pageB.getByLabel("이메일").fill(opened.email);
    await pageB.getByLabel("비밀번호").fill(opened.password);
    await pageB.getByRole("button", { name: "로그인" }).click();
    await expect(pageB).toHaveURL(/\/account$/);
    await pageB.goto(`/projects/${opened.projectId}`);
    await expect(quoteDataRows(pageB)).toHaveCount(2);

    // B가 첫 줄 실행가를 9,800,000으로 저장한다.
    await editTextCell(pageB, 0, 7, "9800000");
    await saveWithKeyboard(pageB, 0, 7);
    await expect(pageB.getByText(/저장됨/)).toBeVisible();

    // A가 같은 줄 실행가와 다른 줄 항목을 고쳐 저장 → 전부 거부.
    await editTextCell(page, 0, 7, "7000000");
    await editTextCell(page, 1, 2, "다른 줄 수정");
    await saveWithKeyboard(page, 0, 7);

    const conflictCell = quoteCell(page, 0, 7);
    await expect(conflictCell).toHaveAttribute("aria-invalid", "true");
    await expect(conflictCell).toContainText(/다른 사람이 \d{2}:\d{2}에 9,800,000으로 바꿈 · 덮어쓰기 \/ 그 값으로/);
    await expect(quoteTable(page).locator("tfoot")).toContainText("충돌 1줄 · 전부 거부");
    await expect(quoteCell(page, 1, 2)).toHaveText("다른 줄 수정"); // 다른 셀 편집값은 그대로.
    const overwrite = conflictCell.getByRole("button", { name: "덮어쓰기" });
    const takeTheirs = conflictCell.getByRole("button", { name: "그 값으로" });
    await expect(overwrite).toHaveAttribute("tabindex", "-1");
    await expect(takeTheirs).toHaveAttribute("tabindex", "-1");
    await expect(quoteTable(page).locator('[tabindex="0"][role="gridcell"]')).toHaveCount(1);

    // Enter → 「덮어쓰기」 → → 「그 값으로」 → Esc → 셀(누르지 않음).
    await conflictCell.focus();
    await page.keyboard.press("Enter");
    await expect(overwrite).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(takeTheirs).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(conflictCell).toBeFocused();
    await expect(conflictCell).toHaveAttribute("aria-invalid", "true");

    // Enter → → → Enter = 「그 값으로」.
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(conflictCell).toHaveText("9,800,000");
    await expect(conflictCell).not.toHaveAttribute("aria-invalid", "true");
    await expect(conflictCell).toBeFocused();

    await saveWithKeyboard(page, 0, 7);
    await expect(page.getByText(/저장됨/)).toBeVisible();
    await page.reload();
    await expect(quoteCell(page, 0, 7)).toHaveText("9,800,000");
    await expect(quoteCell(page, 1, 2)).toHaveText("다른 줄 수정");

    // 다른 줄로 한 번 더 — 이번엔 「덮어쓰기」(A의 값이 남는다).
    await pageB.reload();
    await expect(quoteDataRows(pageB)).toHaveCount(2);
    await editTextCell(pageB, 1, 7, "600000");
    await saveWithKeyboard(pageB, 1, 7);
    await expect(pageB.getByText(/저장됨/)).toBeVisible();

    await editTextCell(page, 1, 7, "650000");
    await saveWithKeyboard(page, 1, 7);
    const secondConflict = quoteCell(page, 1, 7);
    await expect(secondConflict).toHaveAttribute("aria-invalid", "true");
    await expect(secondConflict).toContainText("600,000으로 바꿈");
    await secondConflict.focus();
    await page.keyboard.press("Enter");
    await expect(secondConflict.getByRole("button", { name: "덮어쓰기" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(secondConflict).not.toHaveAttribute("aria-invalid", "true");
    await expect(secondConflict).toHaveText("650,000");
    await expect(secondConflict).toBeFocused();

    await saveWithKeyboard(page, 1, 7);
    await expect(page.getByText(/저장됨/)).toBeVisible();
    await page.reload();
    await expect(quoteCell(page, 1, 7)).toHaveText("650,000");

    await contextB.close();
  });

  test("옮긴 줄의 충돌을 「그 값으로」 풀어도 그 줄은 옮김 때문에 저장 대상으로 남는다", async ({ page, browser, baseURL }) => {
    const opened = await openProjectWithSavedLines(page, [
      { subcategory: "stage_construction", itemName: "옮길 줄", amount: 5000000, execution: 1000000 },
      { subcategory: "stage_construction", itemName: "제자리 줄", amount: 2000000, execution: 500000 },
    ]);

    const contextB = await browser.newContext({ baseURL });
    const pageB = await contextB.newPage();
    await pageB.goto("/login");
    await pageB.getByLabel("이메일").fill(opened.email);
    await pageB.getByLabel("비밀번호").fill(opened.password);
    await pageB.getByRole("button", { name: "로그인" }).click();
    await expect(pageB).toHaveURL(/\/account$/);
    await pageB.goto(`/projects/${opened.projectId}`);
    await expect(quoteDataRows(pageB)).toHaveCount(2);
    await editTextCell(pageB, 0, 7, "9800000");
    await saveWithKeyboard(pageB, 0, 7);
    await expect(pageB.getByText(/저장됨/)).toBeVisible();
    await contextB.close();

    // A가 첫 줄을 Alt+↓로 옮기고 같은 줄 실행가도 고쳐 저장 → 충돌.
    await quoteCell(page, 0, 2).focus();
    await page.keyboard.press("Alt+ArrowDown");
    await expect(quoteCell(page, 1, 2)).toHaveText("옮길 줄");
    await editTextCell(page, 1, 7, "7000000");
    await saveWithKeyboard(page, 1, 7);
    const conflictCell = quoteCell(page, 1, 7);
    await expect(conflictCell).toHaveAttribute("aria-invalid", "true");

    await conflictCell.getByRole("button", { name: "그 값으로" }).click();
    await expect(conflictCell).toHaveText("9,800,000");
    await expect(conflictCell).not.toHaveAttribute("aria-invalid", "true");
    // 04-30(A-03) — 자리를 바꾼 두 줄이 모두 dirty다: 옮긴 줄이 저장 대상에 남아야 2(빠지면 제자리 줄만 1).
    await expect(page.getByRole("button", { name: /일괄 저장 2/ })).toBeEnabled();
  });

  test("수량 0을 저장하면 서버 형식 오류가 그 셀에 고정되고, 고치면 풀린다", async ({ page }) => {
    await openProjectWithSavedLines(page, [{ subcategory: "stage_construction", itemName: "수량 확인 줄", amount: 1000 }]);

    await editTextCell(page, 0, 4, "0");
    await saveWithKeyboard(page, 0, 4);

    const quantityCell = quoteCell(page, 0, 4);
    await expect(quantityCell).toHaveAttribute("aria-invalid", "true");
    await expect(quantityCell).toContainText("숫자 형식 오류 · 0보다 큰 수");
    await expect(quoteTable(page).locator("tfoot")).toContainText("오류 1칸 · 전부 거부");

    await editTextCell(page, 0, 4, "2");
    await expect(quantityCell).not.toHaveAttribute("aria-invalid", "true");
    await expect(quantityCell).toHaveText("2");
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeEnabled();
  });
});

// 04-19 Task 1 — 견적 줄 표의 30줄 쪽 나눔(D-91 · SYSTEM.md §7-3 (자) · DR-23 · DR-13). 45줄 = 두 소분류(A 20 · B 25).
function fortyFiveLines() {
  return [
    ...Array.from({ length: 20 }, (_, index) => ({ subcategory: "stage_construction", itemName: `A줄${index + 1}`, amount: 1000 })),
    ...Array.from({ length: 25 }, (_, index) => ({ subcategory: "print_production", itemName: `B줄${index + 1}`, amount: 2000 })),
  ];
}

function pageNav(page: Page, label = "견적 줄") {
  return page.getByRole("navigation", { name: `${label} 페이지`, exact: true });
}

async function editNumberCell(page: Page, rowIndex: number, colIndex: number, text: string) {
  const cell = quoteCell(page, rowIndex, colIndex);
  await expect(async () => {
    await cell.focus();
    await page.keyboard.press("Enter");
    await expect(cell.locator("input")).toBeFocused({ timeout: 1000 });
  }).toPass();
  await page.keyboard.press("Control+a");
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

test.describe("견적 줄 표 — 30줄 쪽 나눔(04-19 Task 1 · D-91)", () => {
  test("45줄은 30 · 15 두 쪽 · 2쪽 맨 위 그룹 머리글 반복 · 번호 31부터 · 합계는 어느 쪽이든 45줄 · URL 그대로 · 쪽 전환 뒤 포커스와 범위 읽기", async ({ page }) => {
    await openProjectWithSavedLines(page, fortyFiveLines());
    const table = quoteTable(page);
    await expect(quoteDataRows(page)).toHaveCount(30);
    await expect(table.locator("tfoot")).toContainText("합계 (공급가액 · 45줄)");
    const nav = pageNav(page);
    await expect(nav).toContainText("1–30 / 45줄");
    const url = page.url();
    const lastHeaderOnFirstPage = (await table.locator("tbody").last().locator("tr").first().textContent())?.trim();

    // DR-23 — 1쪽 실행가 셀(7열)을 활성 열로 만든 뒤 번호 2를 누르면 2쪽 첫 줄의 같은 열로 포커스가 간다.
    await quoteCell(page, 3, 7).focus();
    const two = nav.getByRole("button", { name: "2", exact: true });
    expect(await two.evaluate((element) => element.getAttribute("type"))).toBe("button");
    await two.click();

    await expect(quoteDataRows(page)).toHaveCount(15);
    await expect(quoteCell(page, 0, 0)).toHaveText("31");
    await expect(quoteCell(page, 0, 2)).toHaveText("B줄11");
    await expect(quoteCell(page, 14, 0)).toHaveText("45");
    expect((await table.locator("tbody").first().locator("tr").first().textContent())?.trim()).toBe(lastHeaderOnFirstPage);
    await expect(table.locator("tfoot")).toContainText("합계 (공급가액 · 45줄)");
    await expect(nav).toContainText("31–45 / 45줄");
    await expect(nav.locator('[aria-current="page"]').first()).toHaveText("2");
    expect(page.url()).toBe(url);
    await expect(quoteCell(page, 0, 7)).toBeFocused();
    // 캡션 옆(표 바로 앞) 시각적으로 숨긴 aria-live가 새 범위를 담는다.
    const live = await table.evaluate((element) => {
      const previous = element.previousElementSibling;
      return { live: previous?.getAttribute("aria-live"), text: previous?.textContent };
    });
    expect(live).toEqual({ live: "polite", text: "31–45 / 45줄" });
  });

  test("(C-04) 그룹 A 끝 줄에서 새 줄 → 새 줄 번호 21 · B 첫 줄 22 · 번호가 끊기지 않는다", async ({ page }) => {
    await openProjectWithSavedLines(page, fortyFiveLines());
    await expect(quoteDataRows(page)).toHaveCount(30);
    await quoteCell(page, 19, 2).focus();
    await page.keyboard.press("Control+Enter");

    await expect(quoteCell(page, 20, 0)).toHaveText("21");
    await expect(quoteCell(page, 20, 2)).toHaveText("");
    await expect(quoteCell(page, 21, 0)).toHaveText("22");
    await expect(quoteCell(page, 21, 2)).toHaveText("B줄1");
    await expect(quoteTable(page).locator("tfoot")).toContainText("합계 (공급가액 · 46줄)");
  });

  test("(금지 항목) 1쪽 한 줄과 2쪽 한 줄의 실행가를 고쳐 Control+s → 새로 고친 뒤 두 값이 다 저장돼 있다", async ({ page }) => {
    await openProjectWithSavedLines(page, fortyFiveLines());
    await expect(quoteDataRows(page)).toHaveCount(30);
    await editNumberCell(page, 0, 7, "123456");
    await expect(quoteCell(page, 0, 7)).toHaveText("123,456");

    await pageNav(page).getByRole("button", { name: "2", exact: true }).click();
    await expect(quoteCell(page, 0, 0)).toHaveText("31");
    await editNumberCell(page, 0, 7, "654321");
    await expect(quoteCell(page, 0, 7)).toHaveText("654,321");
    await expect(page.getByRole("button", { name: /일괄 저장 2/ })).toBeVisible();

    await quoteCell(page, 0, 7).focus();
    const saved = page.waitForResponse((response) => isServerAction(response.request()));
    await page.keyboard.press("Control+s");
    await saved;
    await expect(page.getByText(/저장됨/)).toBeVisible();

    await page.reload();
    await expect(quoteCell(page, 0, 7)).toHaveText("123,456");
    await pageNav(page).getByRole("button", { name: "2", exact: true }).click();
    await expect(quoteCell(page, 0, 0)).toHaveText("31");
    await expect(quoteCell(page, 0, 7)).toHaveText("654,321");
  });

  test("(공백 5) 31줄 2쪽에서 31번째 줄을 지우면 1쪽 30줄이 보이고 페이지 줄이 사라진다", async ({ page }) => {
    await openProjectWithSavedLines(
      page,
      Array.from({ length: 31 }, (_, index) => ({ subcategory: "stage_construction", itemName: `줄${index + 1}`, amount: 1000 })),
    );
    await expect(pageNav(page)).toContainText("1–30 / 31줄");
    await pageNav(page).getByRole("button", { name: "2", exact: true }).click();
    await expect(quoteDataRows(page)).toHaveCount(1);
    await quoteCell(page, 0, 2).focus();
    await page.keyboard.press("Delete");
    await page.getByRole("dialog").getByRole("button", { name: "견적 줄 삭제" }).click();

    await expect(quoteDataRows(page)).toHaveCount(30);
    await expect(quoteCell(page, 0, 2)).toHaveText("줄1");
    await expect(pageNav(page)).toHaveCount(0);
  });

  test("(리뷰 S-1) 2쪽 31번째 줄을 지워 1쪽이 된 뒤 1쪽 그룹 A에서 Ctrl+Enter로 31줄이 돼도 1쪽에 남고 포커스가 그 줄에 있다", async ({ page }) => {
    await openProjectWithSavedLines(page, [
      ...Array.from({ length: 5 }, (_, index) => ({ subcategory: "stage_construction", itemName: `A줄${index + 1}`, amount: 1000 })),
      ...Array.from({ length: 26 }, (_, index) => ({ subcategory: "print_production", itemName: `B줄${index + 1}`, amount: 2000 })),
    ]);
    await pageNav(page).getByRole("button", { name: "2", exact: true }).click();
    await expect(quoteCell(page, 0, 2)).toHaveText("B줄26");
    await quoteCell(page, 0, 2).focus();
    await page.keyboard.press("Delete");
    await page.getByRole("dialog").getByRole("button", { name: "견적 줄 삭제" }).click();
    await expect(pageNav(page)).toHaveCount(0);

    await quoteCell(page, 4, 2).focus();
    await page.keyboard.press("Control+Enter");
    // 04-47(§7-3 (자)) — 새 줄은 만든 쪽에 붙어 있다: 1쪽이 잠시 31줄이고 쪽 줄이 없다(저장 뒤 30줄 단위로 다시 나뉜다).
    await expect(quoteDataRows(page)).toHaveCount(31);
    await expect(pageNav(page)).toHaveCount(0);
    await expect(quoteCell(page, 5, 0)).toHaveText("6");
    await expect(quoteCell(page, 5, 2)).toHaveText("");
    await expect(quoteCell(page, 4, 2)).toBeFocused();
  });

  test("(DR-13 · W2) 31줄 이전 차수 읽기 섹션도 30줄 쪽 — 번호 2 → 제목 포커스 · 2쪽 첫 번호 31 · 합계 31줄", async ({ page }) => {
    const { projectId, revisionId } = await openProjectWithSavedLines(
      page,
      Array.from({ length: 31 }, (_, index) => ({ subcategory: "stage_construction", itemName: `이전줄${index + 1}`, amount: 1000 })),
    );
    await createRevisionFromCurrent(SYSTEM_VIEWER, { projectId, fromRevisionId: revisionId });
    await page.reload();
    const revisions = page.locator("table", { has: page.locator("caption", { hasText: /^차수$/ }) });
    await revisions.getByRole("button", { name: "차수 열기" }).click();
    const heading = page.getByRole("heading", { name: "상세 견적 1차", exact: true });
    await expect(heading).toBeFocused();

    const readTable = page.locator("table", { has: page.locator("caption", { hasText: /^상세 견적 1차 견적 줄$/ }) });
    const nav = pageNav(page, "상세 견적 1차 견적 줄");
    await expect(nav).toContainText("1–30 / 31줄");
    await expect(readTable.locator("tfoot")).toContainText("합계 (공급가액 · 31줄)");
    await nav.getByRole("button", { name: "2", exact: true }).click();

    await expect(heading).toBeFocused();
    await expect(nav).toContainText("31–31 / 31줄");
    const firstCells = await readTable.locator("tbody tr").evaluateAll((rows) =>
      rows
        .filter((row) => (row as HTMLTableRowElement).cells.length > 1)
        .map((row) => ((row as HTMLTableRowElement).cells[0]?.textContent ?? "").trim()),
    );
    expect(firstCells).toEqual(["31"]);
    await expect(readTable.locator("tfoot")).toContainText("합계 (공급가액 · 31줄)");
  });
});

// 04-19 Task 2 — 쪽 경계 키보드(줄 id) · Alt+↑↓ 따라가기 · 2쪽 Delete · Tab · 쪽 안 범위 선택 · Ctrl+A/Ctrl+C 네이티브 복사 · 힌트 줄.
const HINT_TEXT = "이동 Tab ↑↓←→ · 복사 Ctrl+C · 붙여넣기 Ctrl+V · 취소 Esc · 새 줄 Ctrl+Enter · 줄 이동 Alt+↑↓ · 줄 복제 Ctrl+D";

function currentPage(page: Page) {
  return pageNav(page).locator('[aria-current="page"]:visible');
}

test.describe("견적 줄 표 — 쪽 경계 키보드·전체 복사·힌트 줄(04-19 Task 2 · §7-3 (자))", () => {
  test("(공백 4) 1쪽 30번째 줄에서 Alt+↓ → 2쪽으로 따라가 그 줄에 포커스 · Alt+↑ → 1쪽으로", async ({ page }) => {
    await openProjectWithSavedLines(page, fortyFiveLines());
    await expect(quoteDataRows(page)).toHaveCount(30);
    await expect(quoteCell(page, 29, 2)).toHaveText("B줄10");
    await quoteCell(page, 29, 2).focus();
    await page.keyboard.press("Alt+ArrowDown");

    await expect(currentPage(page)).toHaveText("2");
    await expect(quoteCell(page, 0, 2)).toHaveText("B줄10");
    await expect(quoteCell(page, 0, 2)).toBeFocused();
    await expect(quoteCell(page, 0, 2)).toBeInViewport();

    await page.keyboard.press("Alt+ArrowUp");
    await expect(currentPage(page)).toHaveText("1");
    await expect(quoteCell(page, 29, 2)).toHaveText("B줄10");
    await expect(quoteCell(page, 29, 2)).toBeFocused();
  });

  test("(§3) 2쪽 5번째 줄에서 Delete → 그 줄이 지워지고 1쪽 5번째 줄은 그대로다", async ({ page }) => {
    await openProjectWithSavedLines(page, fortyFiveLines());
    await pageNav(page).getByRole("button", { name: "2", exact: true }).click();
    await expect(quoteCell(page, 4, 2)).toHaveText("B줄15");
    await quoteCell(page, 4, 2).focus();
    await page.keyboard.press("Delete");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("B줄15");
    await dialog.getByRole("button", { name: "견적 줄 삭제" }).click();

    await expect(quoteTable(page).getByText("B줄15", { exact: true })).toHaveCount(0);
    await expect(quoteDataRows(page)).toHaveCount(14);
    await pageNav(page).getByRole("button", { name: "1", exact: true }).click();
    await expect(quoteCell(page, 4, 2)).toHaveText("A줄5");
  });

  test("↓가 1쪽 끝을 넘으면 2쪽 31번째 줄 같은 열, ↑로 1쪽 30번째 줄 · Shift+↓ 범위는 쪽 안에서 멈춘다", async ({ page }) => {
    await openProjectWithSavedLines(page, fortyFiveLines());
    await quoteCell(page, 29, 5).focus();
    await page.keyboard.press("ArrowDown");
    await expect(currentPage(page)).toHaveText("2");
    await expect(quoteCell(page, 0, 0)).toHaveText("31");
    await expect(quoteCell(page, 0, 5)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(currentPage(page)).toHaveText("1");
    await expect(quoteCell(page, 29, 5)).toBeFocused();

    await quoteCell(page, 28, 2).focus();
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Shift+ArrowDown");
    await page.keyboard.press("Shift+ArrowDown");
    await expect(currentPage(page)).toHaveText("1");
    await expect(quoteCell(page, 29, 2)).toBeFocused();
  });

  test("(리뷰 B-1) 편집 중 Enter는 값을 확정하고 아래 줄 같은 열로, 1쪽 30번째 줄에서는 2쪽 31번째 줄 같은 열로", async ({ page }) => {
    await openProjectWithSavedLines(page, fortyFiveLines());
    await editTextCell(page, 28, 2, "29번째 확정");
    await expect(quoteCell(page, 28, 2)).toHaveText("29번째 확정");
    await expect(quoteCell(page, 29, 2)).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(quoteCell(page, 29, 2).locator("input")).toBeFocused();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("30번째 확정");
    await page.keyboard.press("Enter");
    await expect(currentPage(page)).toHaveText("2");
    await expect(quoteCell(page, 0, 0)).toHaveText("31");
    await expect(quoteCell(page, 0, 2)).toBeFocused();
    await pageNav(page).getByRole("button", { name: "1", exact: true }).click();
    await expect(quoteCell(page, 29, 2)).toHaveText("30번째 확정");
  });

  test("편집 중 Tab은 값을 확정하고 옆 편집 셀로, 쪽 마지막 편집 셀에서는 2쪽 첫 줄 첫 편집 셀을 연다", async ({ page }) => {
    await openProjectWithSavedLines(page, fortyFiveLines());
    const itemCell = quoteCell(page, 29, 2);
    await expect(async () => {
      await itemCell.focus();
      await page.keyboard.press("Enter");
      await expect(itemCell.locator("input")).toBeFocused({ timeout: 1000 });
    }).toPass();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("Tab으로 확정");
    await page.keyboard.press("Tab");
    await expect(itemCell).toHaveText("Tab으로 확정");
    await expect(quoteCell(page, 29, 3).locator("select, input").first()).toBeFocused();

    const noteCell = quoteCell(page, 29, 10);
    await expect(async () => {
      await noteCell.focus();
      await page.keyboard.press("Enter");
      await expect(noteCell.locator("input")).toBeFocused({ timeout: 1000 });
    }).toPass();
    await page.keyboard.type("비고 확정");
    await page.keyboard.press("Tab");
    await expect(currentPage(page)).toHaveText("2");
    await expect(quoteCell(page, 0, 1).locator("select")).toBeFocused();
    await page.keyboard.press("Escape");
    await pageNav(page).getByRole("button", { name: "1", exact: true }).click();
    await expect(quoteCell(page, 29, 10)).toHaveText("비고 확정");
  });

  test("편집 중 Tab을 마지막 쪽 마지막 편집 셀에서 누르면 값을 확정하고 그 셀에 포커스가 남는다(다음 편집 셀 없음)", async ({ page }) => {
    await openProjectWithSavedLines(page, fortyFiveLines());
    await pageNav(page).getByRole("button", { name: "2", exact: true }).click();
    await expect(currentPage(page)).toHaveText("2");
    const noteCell = quoteCell(page, 14, 10);
    await expect(async () => {
      await noteCell.focus();
      await page.keyboard.press("Enter");
      await expect(noteCell.locator("input")).toBeFocused({ timeout: 1000 });
    }).toPass();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("끝 칸 확정");
    await page.keyboard.press("Tab");
    await expect(noteCell.locator("input")).toHaveCount(0);
    await expect(noteCell).toHaveText("끝 칸 확정");
    await expect(noteCell).toBeFocused();
  });

  test("편집 중이 아닐 때 Control+a → Control+c는 45줄 전부를 견적 줄 표 열 수만큼의 TSV와 앱 형식 JSON으로 싣는다", async ({ page }) => {
    await openProjectWithSavedLines(page, fortyFiveLines());
    await page.evaluate(() => {
      window.addEventListener("copy", (event) => {
        const data = event.clipboardData;
        (window as unknown as { __copied?: { text: string; json: string } }).__copied = {
          text: data?.getData("text/plain") ?? "",
          json: data?.getData("application/x-plant8-quote-lines+json") ?? "",
        };
      });
    });
    await quoteCell(page, 3, 2).focus();
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Control+c");
    const copied = await page.waitForFunction(() => (window as unknown as { __copied?: { text: string; json: string } }).__copied);
    const { text, json } = (await copied.jsonValue()) as { text: string; json: string };
    const columnCount = await quoteTable(page).locator("thead th").count();
    const lines = text.split("\n");
    expect(lines).toHaveLength(45);
    expect(lines.every((line) => line.split("\t").length === columnCount)).toBe(true);
    expect(lines[0]?.split("\t")[2]).toBe("A줄1");
    expect(lines[44]?.split("\t")[0]).toBe("45");
    expect(lines[44]?.split("\t")[2]).toBe("B줄25");
    expect(JSON.parse(json)).toEqual(Array.from({ length: 45 }, () => ({ currency: "KRW", kind: "quote" })));
  });

  test("힌트 줄은 일곱 항목이고 페이지 줄 바로 다음 형제 · 매출 표 아래에는 없고 · 1000 폭에서는 없다", async ({ page }) => {
    await openProjectWithSavedLines(page, fortyFiveLines());
    const hint = page.locator("p", { has: page.locator("kbd", { hasText: "Ctrl+D" }) });
    await expect(hint).toHaveCount(1);
    await expect(hint).toHaveText(HINT_TEXT);
    await expect(hint.locator("kbd")).toHaveText(["Tab ↑↓←→", "Ctrl+C", "Ctrl+V", "Esc", "Ctrl+Enter", "Alt+↑↓", "Ctrl+D"]);
    expect(await pageNav(page).evaluate((nav) => nav.nextElementSibling?.textContent)).toBe(HINT_TEXT);
    for (const caption of ["발행 줄", "입금 줄"]) {
      const revenue = page.locator("table", { has: page.locator("caption", { hasText: new RegExp(`^${caption}$`) }) });
      if ((await revenue.count()) === 0) continue;
      expect(await revenue.evaluate((table) => table.nextElementSibling?.querySelector("kbd") ?? null)).toBeNull();
    }

    await page.setViewportSize({ width: 1000, height: 900 });
    await expect(hint).toBeHidden();
  });
});

// 04-47 Task 1 — 붙여넣기(계산 열 무시 · 통화 경고 · 끝 줄바꿈 · 쪽을 넘는 채우기) · 새 줄 고정 · 그룹 버튼 쪽 이동 · 합계 행 한 줄(DR-16).
type SeedLine = {
  subcategory: string;
  itemName: string;
  amount: number;
  currency?: "KRW" | "USD";
  fxRate?: number;
  vendorId?: string;
};

async function seedLines(revisionId: string, rows: SeedLine[]) {
  if (rows.length === 0) return;
  await saveQuoteLines(SYSTEM_VIEWER, revisionId, {
    rows: rows.map((row) => ({
      id: randomUUID(),
      isNew: true as const,
      subcategory: row.subcategory,
      itemName: row.itemName,
      vendorId: row.vendorId ?? null,
      unitPrice: { currency: row.currency ?? ("KRW" as const), amount: row.amount, fxRate: row.fxRate ?? 1 },
      execution: { currency: "KRW" as const, amount: 0, fxRate: 1 },
    })),
  });
}

async function quoteTotalKrw(revisionId: string): Promise<number> {
  const [row] = await db
    .select({ total: sum(quoteLines.quoteAmountKrw) })
    .from(quoteLines)
    .where(and(eq(quoteLines.revisionId, revisionId), isNull(quoteLines.archivedAt)));
  return Number(row?.total ?? 0);
}

// 합계 행 오른쪽 한 줄의 조각(글자 · 톤).
async function footerPieces(page: Page): Promise<{ tone: string; text: string }[]> {
  return quoteTable(page)
    .locator("tfoot [data-tone]")
    .evaluateAll((elements) => elements.map((element) => ({ tone: element.getAttribute("data-tone") ?? "", text: (element.textContent ?? "").trim() })));
}

async function pasteWithFormats(page: Page, formats: Record<string, string>) {
  await page.evaluate((data) => {
    const transfer = new DataTransfer();
    for (const [format, value] of Object.entries(data)) transfer.setData(format, value);
    const event = new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true });
    document.activeElement?.dispatchEvent(event);
  }, formats);
}

async function saveAndWait(page: Page) {
  const saved = page.waitForResponse((response) => isServerAction(response.request()));
  await page.getByRole("button", { name: /일괄 저장/ }).click();
  await saved;
}

const invalidCells = (page: Page) => quoteTable(page).locator('td[aria-invalid="true"]');

test.describe("견적 줄 표 — 붙여넣기 · 새 줄 고정 · 합계 행 한 줄(04-47 Task 1)", () => {
  test("(ENG-D5) 앱 형식 없는 엑셀 6열을 소분류 칸에 → 실행가 값이 떨어진 견적가 칸 둘이 오류 · 합계 행 `오류 2칸` · `계산 열` 조각 없음", async ({ page }) => {
    const stamp = randomUUID().slice(0, 8);
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E엑셀거래처-${stamp}`, normalizedName: `e2e엑셀거래처-${stamp}` });
    await openProjectWithSavedLines(page, [
      { subcategory: "stage_construction", itemName: "엑셀 앞줄1", amount: 1000 },
      { subcategory: "stage_construction", itemName: "엑셀 앞줄2", amount: 1000 },
    ]);
    await quoteCell(page, 0, 1).focus();
    await pasteWithFormats(page, {
      "text/plain": `무대·시공\t엑셀 항목1\t${vendor.name}\t2\t1000\t800\r\n무대·시공\t엑셀 항목2\t${vendor.name}\t3\t2000\t900\r\n`,
    });

    await expect(quoteCell(page, 0, 2)).toHaveText("엑셀 항목1");
    await expect(invalidCells(page)).toHaveCount(2);
    await expect(quoteCell(page, 0, 6)).toHaveAttribute("aria-invalid", "true");
    await expect(quoteCell(page, 1, 6)).toHaveAttribute("aria-invalid", "true");
    await expect(quoteCell(page, 0, 6)).toContainText("읽기 전용·잠김 셀에 값 떨어짐");
    await expect.poll(() => footerPieces(page)).toEqual([{ tone: "danger", text: "오류 2칸" }]);
  });

  test("(C-03) 두 그룹 · USD 1줄 · 45줄을 Ctrl+A → Ctrl+C로 복사해 0줄 프로젝트의 번호 칸에 붙이면 오류 0 · 한 줄 요약 · 저장 뒤 원화 합계가 같다", async ({ page }) => {
    const stamp = `${Date.now()}-${randomUUID().slice(0, 6)}`;
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E왕복-${stamp}`, normalizedName: `e2e왕복-${stamp}` });
    const email = `e2e-roundtrip-${randomUUID()}@example.test`;
    const { userId: pmUserId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "E2E Roundtrip", roleId: DEFAULT_ROLE_ID });
    const [team] = await db.select().from(teams).limit(1);
    if (!team) throw new Error("시드된 팀이 없습니다");
    const source = await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId: team.id, pmUserId, name: `E2E왕복원본-${stamp}` });
    const target = await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId: team.id, pmUserId, name: `E2E왕복대상-${stamp}` });
    const sourceRevision = await getCurrentQuoteRevision(SYSTEM_VIEWER, source.id);
    const targetRevision = await getCurrentQuoteRevision(SYSTEM_VIEWER, target.id);
    if (!sourceRevision || !targetRevision) throw new Error("1차 차수가 없습니다");
    await seedLines(sourceRevision.id, [
      ...Array.from({ length: 20 }, (_, index) => ({ subcategory: "stage_construction", itemName: `왕복A${index + 1}`, amount: 1000 * (index + 1), vendorId: vendor.id })),
      { subcategory: "print_production", itemName: "왕복USD", amount: 100, currency: "USD" as const, fxRate: 1300, vendorId: vendor.id },
      ...Array.from({ length: 24 }, (_, index) => ({ subcategory: "print_production", itemName: `왕복B${index + 1}`, amount: 2500, vendorId: vendor.id })),
    ]);

    await page.goto("/login");
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호").fill(tempPassword);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto(`/projects/${source.id}`);
    await expect(quoteDataRows(page)).toHaveCount(30);
    await page.evaluate(() => {
      window.addEventListener("copy", (event) => {
        const data = event.clipboardData;
        (window as unknown as { __copied?: Record<string, string> }).__copied = {
          "text/plain": data?.getData("text/plain") ?? "",
          "application/x-plant8-quote-lines+json": data?.getData("application/x-plant8-quote-lines+json") ?? "",
        };
      });
    });
    // 하이드레이션 전 Control+a는 사라진다 — 전체 선택 표시(마지막 줄 셀의 선택 모양)가 보일 때까지 누른 뒤 복사한다.
    await expect(async () => {
      await quoteCell(page, 3, 2).focus();
      await page.keyboard.press("Control+a");
      await expect(quoteCell(page, 29, 2)).toHaveClass(/selectedCell/, { timeout: 1000 });
    }).toPass();
    await page.keyboard.press("Control+c");
    const copied = (await (await page.waitForFunction(() => (window as unknown as { __copied?: Record<string, string> }).__copied)).jsonValue()) as Record<string, string>;
    expect(JSON.parse(copied["application/x-plant8-quote-lines+json"] ?? "[]")).toHaveLength(45);

    await page.goto(`/projects/${target.id}`);
    await page.getByRole("button", { name: /첫 줄 만들기/ }).click();
    await quoteCell(page, 0, 0).focus();
    await pasteWithFormats(page, copied);

    await expect(quoteDataRows(page)).toHaveCount(45);
    await expect(invalidCells(page)).toHaveCount(0);
    await expect.poll(() => footerPieces(page)).toEqual([
      { tone: "muted", text: "붙여넣기 45줄" },
      { tone: "warning", text: "외화 1줄 원화로" },
      { tone: "muted", text: "계산 열 180칸 무시" },
    ]);

    await saveAndWait(page);
    // 저장 뒤 붙여넣기 조각은 사라지고 `저장됨 …` 하나만 선다(DR-16).
    await expect.poll(() => footerPieces(page)).toEqual([{ tone: "success", text: expect.stringMatching(/^저장됨 \d{2}:\d{2}$/) }]);
    expect(await quoteTotalKrw(targetRevision.id)).toBe(await quoteTotalKrw(sourceRevision.id));
  });

  // Regression: ISSUE-001 — 거래처가 빈 줄을 Ctrl+A → Ctrl+C로 복사해 붙이면 복사 글자 `—`가 거래처 목록에 없어 오류 셀이 됐다
  // Found by /qa on 2026-09-26
  // Report: .gstack/qa-reports/qa-report-plant8-2026-09-26.md
  test("(ISSUE-001) 거래처가 빈 줄을 복사해 다른 프로젝트에 붙이면 거래처 칸이 오류 없이 비고, 저장 뒤에도 거래처가 없다", async ({ page }) => {
    const stamp = `${Date.now()}-${randomUUID().slice(0, 6)}`;
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E빈거래처-${stamp}`, normalizedName: `e2e빈거래처-${stamp}` });
    const email = `e2e-novendor-${randomUUID()}@example.test`;
    const { userId: pmUserId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "E2E NoVendor", roleId: DEFAULT_ROLE_ID });
    const [team] = await db.select().from(teams).limit(1);
    if (!team) throw new Error("시드된 팀이 없습니다");
    const source = await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId: team.id, pmUserId, name: `E2E빈거래처원본-${stamp}` });
    const target = await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId: team.id, pmUserId, name: `E2E빈거래처대상-${stamp}` });
    const sourceRevision = await getCurrentQuoteRevision(SYSTEM_VIEWER, source.id);
    const targetRevision = await getCurrentQuoteRevision(SYSTEM_VIEWER, target.id);
    if (!sourceRevision || !targetRevision) throw new Error("1차 차수가 없습니다");
    await seedLines(sourceRevision.id, [
      { subcategory: "stage_construction", itemName: "거래처없음", amount: 1000 },
      { subcategory: "stage_construction", itemName: "거래처있음", amount: 2000, vendorId: vendor.id },
    ]);

    await page.goto("/login");
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호").fill(tempPassword);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto(`/projects/${source.id}`);
    await expect(quoteDataRows(page)).toHaveCount(2);
    await page.evaluate(() => {
      window.addEventListener("copy", (event) => {
        const data = event.clipboardData;
        (window as unknown as { __copied?: Record<string, string> }).__copied = {
          "text/plain": data?.getData("text/plain") ?? "",
          "application/x-plant8-quote-lines+json": data?.getData("application/x-plant8-quote-lines+json") ?? "",
        };
      });
    });
    await expect(async () => {
      await quoteCell(page, 0, 2).focus();
      await page.keyboard.press("Control+a");
      await expect(quoteCell(page, 1, 2)).toHaveClass(/selectedCell/, { timeout: 1000 });
    }).toPass();
    await page.keyboard.press("Control+c");
    const copied = (await (await page.waitForFunction(() => (window as unknown as { __copied?: Record<string, string> }).__copied)).jsonValue()) as Record<string, string>;

    await page.goto(`/projects/${target.id}`);
    await page.getByRole("button", { name: /첫 줄 만들기/ }).click();
    await quoteCell(page, 0, 0).focus();
    await pasteWithFormats(page, copied);

    await expect(quoteDataRows(page)).toHaveCount(2);
    await expect(invalidCells(page)).toHaveCount(0);
    await saveAndWait(page);
    await expect.poll(() => footerPieces(page)).toEqual([{ tone: "success", text: expect.stringMatching(/^저장됨 \d{2}:\d{2}$/) }]);
    const saved = await db
      .select({ itemName: quoteLines.itemName, vendorId: quoteLines.vendorId })
      .from(quoteLines)
      .where(and(eq(quoteLines.revisionId, targetRevision.id), isNull(quoteLines.archivedAt)));
    expect(saved.find((line) => line.itemName === "거래처없음")?.vendorId).toBeNull();
    expect(saved.find((line) => line.itemName === "거래처있음")?.vendorId).toBe(vendor.id);
  });

  // Regression: ISSUE-003 — 견적 외 비용 줄을 복사해 붙이면 줄 종류가 실리지 않아 소분류·수량·단가 3칸이 오류였다
  // 코디네이터 대리 결정 2026-09-26 /qa ISSUE-003 (a) — 앱 형식이 줄 종류를 싣고, 붙여넣기로 생기는 줄은 같은 종류다.
  test("(ISSUE-003) 견적 외 비용 줄을 복사해 다른 프로젝트에 붙이면 같은 종류의 줄로 오류 없이 들어가 저장된다", async ({ page }) => {
    const stamp = `${Date.now()}-${randomUUID().slice(0, 6)}`;
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E견적외-${stamp}`, normalizedName: `e2e견적외-${stamp}` });
    const email = `e2e-outofquote-${randomUUID()}@example.test`;
    const { userId: pmUserId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "E2E OutOfQuote", roleId: DEFAULT_ROLE_ID });
    const [team] = await db.select().from(teams).limit(1);
    if (!team) throw new Error("시드된 팀이 없습니다");
    const source = await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId: team.id, pmUserId, name: `E2E견적외원본-${stamp}` });
    const target = await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId: team.id, pmUserId, name: `E2E견적외대상-${stamp}` });
    const sourceRevision = await getCurrentQuoteRevision(SYSTEM_VIEWER, source.id);
    const targetRevision = await getCurrentQuoteRevision(SYSTEM_VIEWER, target.id);
    if (!sourceRevision || !targetRevision) throw new Error("1차 차수가 없습니다");
    await seedLines(sourceRevision.id, [{ subcategory: "stage_construction", itemName: "견적줄", amount: 1000 }]);
    await saveQuoteLines(SYSTEM_VIEWER, sourceRevision.id, {
      rows: [
        {
          id: randomUUID(),
          isNew: true as const,
          lineKind: "out_of_quote" as const,
          subcategory: "",
          itemName: "견적외줄",
          unitPrice: { currency: "KRW" as const, amount: 0, fxRate: 1 },
          execution: { currency: "KRW" as const, amount: 7000, fxRate: 1 },
        },
      ],
    });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호").fill(tempPassword);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto(`/projects/${source.id}`);
    await expect(quoteDataRows(page)).toHaveCount(2);
    await page.evaluate(() => {
      window.addEventListener("copy", (event) => {
        const data = event.clipboardData;
        (window as unknown as { __copied?: Record<string, string> }).__copied = {
          "text/plain": data?.getData("text/plain") ?? "",
          "application/x-plant8-quote-lines+json": data?.getData("application/x-plant8-quote-lines+json") ?? "",
        };
      });
    });
    await expect(async () => {
      await quoteCell(page, 0, 2).focus();
      await page.keyboard.press("Control+a");
      await expect(quoteCell(page, 1, 2)).toHaveClass(/selectedCell/, { timeout: 1000 });
    }).toPass();
    await page.keyboard.press("Control+c");
    const copied = (await (await page.waitForFunction(() => (window as unknown as { __copied?: Record<string, string> }).__copied)).jsonValue()) as Record<string, string>;

    await page.goto(`/projects/${target.id}`);
    await page.getByRole("button", { name: /첫 줄 만들기/ }).click();
    await quoteCell(page, 0, 0).focus();
    await expect(quoteCell(page, 0, 0)).toHaveAttribute("data-grid-focus", "");
    await pasteWithFormats(page, copied);

    await expect(quoteDataRows(page)).toHaveCount(2);
    await expect(invalidCells(page)).toHaveCount(0);
    await saveAndWait(page);
    await expect.poll(() => footerPieces(page)).toEqual([{ tone: "success", text: expect.stringMatching(/^저장됨 \d{2}:\d{2}$/) }]);
    const saved = await db
      .select({ itemName: quoteLines.itemName, lineKind: quoteLines.lineKind, executionAmountKrw: quoteLines.executionAmountKrw })
      .from(quoteLines)
      .where(and(eq(quoteLines.revisionId, targetRevision.id), isNull(quoteLines.archivedAt)));
    expect(saved.find((line) => line.itemName === "견적줄")?.lineKind).toBe("quote");
    expect(saved.find((line) => line.itemName === "견적외줄")).toMatchObject({ lineKind: "out_of_quote", executionAmountKrw: 7000 });
  });

  // Regression: ISSUE-002 — 원화 단가·실행가 칸에 소수가 붙으면 오류 없이 받아 저장 때 조용히 반올림됐다(12.345 → 12)
  // Found by /qa on 2026-09-26
  // Report: .gstack/qa-reports/qa-report-plant8-2026-09-26.md
  test("(ISSUE-002) 엑셀 소수 원화 값을 단가 · 실행가 칸에 붙이면 두 칸이 `원화는 소수점 없이` 오류이고 1차는 서버를 부르지 않는다", async ({ page }) => {
    await openProjectWithSavedLines(page, [{ subcategory: "stage_construction", itemName: "소수원화", amount: 100_000, execution: 50_000 }]);
    await quoteCell(page, 0, 5).focus();
    await pasteWithFormats(page, { "text/plain": "12.345" });
    await quoteCell(page, 0, 7).focus();
    await pasteWithFormats(page, { "text/plain": "1,234.5" });

    await expect(invalidCells(page)).toHaveCount(2);
    await expect(quoteCell(page, 0, 5)).toContainText("원화는 소수점 없이");
    await expect(quoteCell(page, 0, 7)).toContainText("원화는 소수점 없이");

    let serverCalls = 0;
    page.on("request", (request) => {
      if (isServerAction(request)) serverCalls += 1;
    });
    await page.getByRole("button", { name: /일괄 저장/ }).click();
    await expect(quoteCell(page, 0, 5)).toBeFocused();
    expect(serverCalls).toBe(0);
  });

  // Regression: ISSUE-011 — 비고 칸에 앱의 빈 값 표시 `—`를 붙이면 글자 `—`가 비고로 저장됐다
  // 코디네이터 대리 결정 2026-09-26 /qa ISSUE-011 (a) — `—`는 빈 비고로 읽는다.
  test("(ISSUE-011) 비고 칸에 `—`를 붙이면 빈 비고로 읽어, 저장 뒤 비고가 없다", async ({ page }) => {
    const { revisionId } = await openProjectWithSavedLines(page, [{ subcategory: "stage_construction", itemName: "빈비고", amount: 1000 }]);
    await quoteCell(page, 0, 10).focus();
    await expect(quoteCell(page, 0, 10)).toHaveAttribute("data-grid-focus", "");
    await pasteWithFormats(page, { "text/plain": "—" });

    await expect(invalidCells(page)).toHaveCount(0);
    await saveAndWait(page);
    await expect.poll(() => footerPieces(page)).toEqual([{ tone: "success", text: expect.stringMatching(/^저장됨 \d{2}:\d{2}$/) }]);
    const saved = await db
      .select({ note: quoteLines.note })
      .from(quoteLines)
      .where(and(eq(quoteLines.revisionId, revisionId), isNull(quoteLines.archivedAt)));
    expect(saved).toEqual([{ note: null }]);
  });

  test("(금지 항목) 142줄 1쪽 20번째 줄에 45줄 → 화면은 1쪽 · `붙여넣기 45줄 · 3쪽까지` · 저장 뒤 20~64번째 줄이 전부 붙여 넣은 값", async ({ page }) => {
    await openProjectWithSavedLines(
      page,
      Array.from({ length: 142 }, (_, index) => ({ subcategory: "stage_construction", itemName: `줄${index + 1}`, amount: 1000 })),
    );
    await expect(quoteCell(page, 19, 2)).toHaveText("줄20");
    await quoteCell(page, 19, 2).focus();
    await pasteWithFormats(page, { "text/plain": Array.from({ length: 45 }, (_, index) => `붙임${index + 1}`).join("\r\n") + "\r\n" });

    await expect(quoteCell(page, 19, 2)).toHaveText("붙임1");
    await expect(currentPage(page)).toHaveText("1");
    await expect.poll(() => footerPieces(page)).toEqual([
      { tone: "muted", text: "붙여넣기 45줄" },
      { tone: "muted", text: "3쪽까지" },
    ]);

    await saveAndWait(page);
    await page.reload();
    await expect(quoteCell(page, 19, 2)).toHaveText("붙임1");
    await expect(quoteCell(page, 29, 2)).toHaveText("붙임11");
    await pageNav(page).getByRole("button", { name: "2", exact: true }).first().click();
    await expect(quoteCell(page, 0, 2)).toHaveText("붙임12");
    await expect(quoteCell(page, 29, 2)).toHaveText("붙임41");
    await pageNav(page).getByRole("button", { name: "3", exact: true }).first().click();
    await expect(quoteCell(page, 0, 2)).toHaveText("붙임42");
    await expect(quoteCell(page, 3, 2)).toHaveText("붙임45");
    await expect(quoteCell(page, 4, 2)).toHaveText("줄65");
  });

  test("10줄 표 1번째 줄에 45줄 → 저장 전 1쪽에 45줄(쪽 줄 없음) → 저장 뒤 `1–30 / 45줄` 두 쪽", async ({ page }) => {
    await openProjectWithSavedLines(
      page,
      Array.from({ length: 10 }, (_, index) => ({ subcategory: "stage_construction", itemName: `열줄${index + 1}`, amount: 1000 })),
    );
    await quoteCell(page, 0, 2).focus();
    await pasteWithFormats(page, { "text/plain": Array.from({ length: 45 }, (_, index) => `새항목${index + 1}`).join("\n") });

    await expect(quoteDataRows(page)).toHaveCount(45);
    await expect(pageNav(page)).toHaveCount(0);
    await expect(quoteCell(page, 44, 2)).toHaveText("새항목45");

    await saveAndWait(page);
    await expect(pageNav(page)).toContainText("1–30 / 45줄");
    await expect(quoteDataRows(page)).toHaveCount(30);
  });

  test("2쪽에서 Control+Enter로 만든 새 줄은 표시 순서상 3쪽 자리여도 2쪽에 머문다", async ({ page }) => {
    await openProjectWithSavedLines(page, [
      ...Array.from({ length: 35 }, (_, index) => ({ subcategory: "stage_construction", itemName: `A줄${index + 1}`, amount: 1000 })),
      ...Array.from({ length: 40 }, (_, index) => ({ subcategory: "print_production", itemName: `B줄${index + 1}`, amount: 2000 })),
    ]);
    await pageNav(page).getByRole("button", { name: "2", exact: true }).first().click();
    await expect(quoteCell(page, 5, 2)).toHaveText("B줄1");
    await quoteCell(page, 5, 2).focus();
    await page.keyboard.press("Control+Enter");

    await expect(quoteDataRows(page)).toHaveCount(31);
    await expect(currentPage(page)).toHaveText("2");
    await expect(quoteCell(page, 30, 0)).toHaveText("76");
    await expect(quoteCell(page, 30, 2)).toHaveText("");
  });

  test("(C-18) 1쪽 끝에서 만든 새 줄은 1쪽 31번째에 붙고, 그 줄에서 ↓ → 2쪽 표시 순서상 다음 줄", async ({ page }) => {
    await openProjectWithSavedLines(page, [
      ...Array.from({ length: 30 }, (_, index) => ({ subcategory: "stage_construction", itemName: `A줄${index + 1}`, amount: 1000 })),
      ...Array.from({ length: 15 }, (_, index) => ({ subcategory: "print_production", itemName: `B줄${index + 1}`, amount: 2000 })),
    ]);
    await quoteCell(page, 29, 2).focus();
    await page.keyboard.press("Control+Enter");
    await expect(quoteDataRows(page)).toHaveCount(31);
    await expect(quoteCell(page, 30, 0)).toHaveText("31");

    await page.keyboard.press("ArrowDown");
    await expect(quoteCell(page, 30, 2)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(currentPage(page)).toHaveText("2");
    await expect(quoteCell(page, 0, 2)).toHaveText("B줄1");
    await expect(quoteCell(page, 0, 2)).toBeFocused();
  });

  test("(B-24) 45줄 1쪽에서 그룹 버튼(견적 외 비용 줄 추가) → 그 그룹 끝이 있는 2쪽으로 옮겨 새 줄의 항목 칸에 포커스", async ({ page }) => {
    await openProjectWithSavedLines(page, fortyFiveLines());
    await expect(currentPage(page)).toHaveText("1");
    await page.getByRole("button", { name: "견적 외 비용 줄 추가" }).click();

    await expect(currentPage(page)).toHaveText("2");
    await expect(quoteDataRows(page)).toHaveCount(16);
    await expect(quoteCell(page, 15, 1)).toHaveText("견적 외 비용");
    await expect(quoteCell(page, 15, 2).locator("input")).toBeFocused();
  });
});

// 04-47 Task 2 — 오류가 남은 채 1차는 서버 없이 첫 오류로(DR-5) · 저장 거부 뒤 첫 오류 쪽과 번호 옆 `오류 N` · 쪽 왕복 뒤 표시 유지 · R2.
function threePageLines() {
  return Array.from({ length: 75 }, (_, index) => ({ subcategory: "stage_construction", itemName: `세쪽줄${index + 1}`, amount: 1000 }));
}

function countServerActions(page: Page): { count: number } {
  const counter = { count: 0 };
  page.on("request", (request) => {
    if (isServerAction(request)) counter.count++;
  });
  return counter;
}

const primarySave = (page: Page) => page.getByRole("button", { name: /일괄 저장/ });

test.describe("견적 줄 표 — 오류가 남은 채 1차 · 저장 거부 쪽 · 표시 유지(04-47 Task 2)", () => {
  test("(DR-5) 3쪽 한 칸이 오류인 채 1쪽에서 1차·Control+s → 서버 요청 0 · 3쪽으로 옮겨 그 칸에 포커스 · 고치면 저장된다", async ({ page }) => {
    await openProjectWithSavedLines(page, threePageLines());
    await pageNav(page).getByRole("button", { name: "3", exact: true }).first().click();
    await expect(quoteCell(page, 1, 2)).toHaveText("세쪽줄62");
    await quoteCell(page, 1, 4).focus();
    await pasteIntoFocusedCell(page, "abc");
    await expect(quoteCell(page, 1, 4)).toHaveAttribute("aria-invalid", "true");
    await pageNav(page).getByRole("button", { name: "1", exact: true }).first().click();
    await expect(currentPage(page)).toHaveText("1");

    const actions = countServerActions(page);
    await expect(primarySave(page)).not.toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText(/고쳐야 저장됩니다|고친 뒤 저장/)).toHaveCount(0);
    await primarySave(page).click();
    await expect(currentPage(page)).toHaveText("3");
    await expect(quoteCell(page, 1, 4)).toBeFocused();

    await pageNav(page).getByRole("button", { name: "1", exact: true }).first().click();
    await quoteCell(page, 0, 2).focus();
    await page.keyboard.press("Control+s");
    await expect(currentPage(page)).toHaveText("3");
    await expect(quoteCell(page, 1, 4)).toBeFocused();

    await editNumberCell(page, 1, 4, "2");
    await expect(quoteCell(page, 1, 4)).not.toHaveAttribute("aria-invalid", "true");
    await saveAndWait(page);
    await expect.poll(() => footerPieces(page)).toEqual([{ tone: "success", text: expect.stringMatching(/^저장됨/) }]);
    // 대조 요청 — 오류가 있던 두 번의 1차는 서버를 부르지 않았고, 고친 뒤의 저장 한 번만 나갔다.
    expect(actions.count).toBe(1);
  });

  test("(DR-5) 표 밖 칸(종료일)에 서버 오류가 고정된 채 견적 표에도 오류 → 1차 → 서버 요청 0 · 포커스가 종료일 칸", async ({ page }) => {
    const today = kstToday(new Date());
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
    const email = `e2e-dr5-${randomUUID()}@example.test`;
    const pm = await createAccount(SYSTEM_VIEWER, { email, name: "E2E DR5 PM", roleId: DEFAULT_ROLE_ID });
    await assignTeam(SYSTEM_VIEWER, { userId: pm.userId, teamId: team.id, effectiveFrom: today });
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2E표밖-${randomUUID()}`, normalizedName: `e2e표밖-${randomUUID()}` });
    const project = await createProject(SYSTEM_VIEWER, {
      clientId: vendor.id,
      teamId: team.id,
      pmUserId: pm.userId,
      name: `E2E표밖-${randomUUID().slice(0, 8)}`,
      startDate: addDays(today, -3),
      endDate: addDays(today, 5),
    });
    await db.update(projects).set({ status: "in_progress" }).where(eq(projects.id, project.id));
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("1차 차수가 없습니다");
    await seedLines(revision.id, [{ subcategory: "stage_construction", itemName: "표밖 줄", amount: 1000 }]);

    await page.goto("/login");
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호").fill(pm.tempPassword);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto(`/projects/${project.id}`);
    await page.getByRole("button", { name: "기간 바꾸기" }).click();
    await page.getByLabel("종료일").fill(addDays(today, -1));
    await saveAndWait(page);
    const endInput = page.getByLabel("종료일");
    await expect(endInput).toHaveAttribute("aria-invalid", "true");

    await quoteCell(page, 0, 4).focus();
    await pasteIntoFocusedCell(page, "abc");
    await expect(quoteCell(page, 0, 4)).toHaveAttribute("aria-invalid", "true");
    const actions = countServerActions(page);
    await primarySave(page).click();
    await expect(endInput).toBeFocused();
    await quoteCell(page, 0, 2).focus();
    await page.keyboard.press("Control+s");
    await expect(endInput).toBeFocused();
    expect(actions.count).toBe(0);
  });

  test("1쪽 5행과 3쪽 2행이 서버 오류로 거부되면 1쪽 5행 오류 칸에 포커스 · 3쪽 번호 옆 `오류 1`(`3쪽, 오류 1칸`) · 다른 번호엔 없다", async ({ page }) => {
    await openProjectWithSavedLines(page, threePageLines());
    await editNumberCell(page, 4, 4, "0");
    await pageNav(page).getByRole("button", { name: "3", exact: true }).first().click();
    await editNumberCell(page, 1, 4, "0");
    await saveAndWait(page);

    await expect(currentPage(page)).toHaveText("1");
    await expect(quoteCell(page, 4, 4)).toHaveAttribute("aria-invalid", "true");
    await expect(quoteCell(page, 4, 4)).toBeFocused();
    const nav = pageNav(page);
    const three = nav.getByRole("button", { name: "3쪽, 오류 1칸", exact: true }).filter({ visible: true });
    await expect(three).toHaveCount(1);
    await expect(three).toHaveText("3 오류 1");
    await expect(nav.getByRole("button", { name: "2", exact: true }).filter({ visible: true })).toHaveCount(1);
    await expect(currentPage(page)).not.toContainText("오류");
  });

  test("2쪽에서 고친 칸의 dirty 표시가 1쪽 → 2쪽 왕복 뒤에도 남는다", async ({ page }) => {
    await openProjectWithSavedLines(page, fortyFiveLines());
    await pageNav(page).getByRole("button", { name: "2", exact: true }).first().click();
    await editNumberCell(page, 2, 7, "5555");
    await expect(quoteCell(page, 2, 7)).toHaveCSS("box-shadow", /inset/);
    await pageNav(page).getByRole("button", { name: "1", exact: true }).first().click();
    await expect(currentPage(page)).toHaveText("1");
    await pageNav(page).getByRole("button", { name: "2", exact: true }).first().click();
    await expect(quoteCell(page, 2, 7)).toHaveText("5,555");
    await expect(quoteCell(page, 2, 7)).toHaveCSS("box-shadow", /inset/);
  });

  test("(R2) 발행 줄 금액만 범위 밖으로 1차 저장 → 견적 표 합계 행 한 줄 `전부 거부 · 다른 칸 오류 1칸` · 발행 표 `오류 1칸 · 전부 거부` · 포커스는 그 발행 금액 · 고쳐 저장하면 `저장됨`만", async ({ page }) => {
    const roleId = `role-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: roleId, name: `E2E 매출 PM-${randomUUID().slice(0, 8)}` });
    for (const row of await listPermissions(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID })) {
      await upsertPermission(SYSTEM_VIEWER, { roleId, menu: row.menu, action: row.action, allowed: row.allowed });
    }
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "projects.revenue", action: "write", allowed: true });
    for (const row of await listVisibility(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID })) {
      await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: row.infoItem, visible: true });
    }
    const today = kstToday(new Date());
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
    const email = `e2e-r2-${randomUUID()}@example.test`;
    const pm = await createAccount(SYSTEM_VIEWER, { email, name: "E2E R2 PM", roleId });
    await assignTeam(SYSTEM_VIEWER, { userId: pm.userId, teamId: team.id, effectiveFrom: today });
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: `E2ER2-${randomUUID()}`, normalizedName: `e2er2-${randomUUID()}` });
    const project = await createProject(SYSTEM_VIEWER, {
      clientId: vendor.id,
      teamId: team.id,
      pmUserId: pm.userId,
      name: `E2ER2-${randomUUID().slice(0, 8)}`,
      startDate: today,
      endDate: addDays(today, 10),
    });
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("1차 차수가 없습니다");
    await seedLines(revision.id, [{ subcategory: "stage_construction", itemName: "R2 견적 줄", amount: 1_000_000 }]);
    await saveRevenue(SYSTEM_VIEWER, project.id, {
      issuedEntries: [{ entryDate: "2026-09-01", amount: { currency: "KRW", amount: 1_000_000, fxRate: 1 } }],
      paidEntries: [{ entryDate: "2026-09-05", amount: { currency: "KRW", amount: 1_100_000, fxRate: 1 } }],
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호").fill(pm.tempPassword);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto(`/projects/${project.id}`);

    const issuedTable = page.locator("table", { has: page.locator("caption", { hasText: /^발행 줄$/ }) });
    await page.getByRole("button", { name: "발행 줄 추가" }).click();
    const newAmount = issuedTable.getByLabel("발행액").last();
    await newAmount.fill("1000000000000");
    await saveAndWait(page);

    await expect(issuedTable.locator("tfoot").getByText("오류 1칸 · 전부 거부", { exact: true })).toBeVisible();
    await expect.poll(() => footerPieces(page)).toEqual([{ tone: "danger", text: "전부 거부 · 다른 칸 오류 1칸" }]);
    await expect(newAmount).toBeFocused();
    expect(await db.select().from(revenueEntries).where(eq(revenueEntries.projectId, project.id))).toHaveLength(2);

    await newAmount.fill("3000000");
    await saveAndWait(page);
    await expect.poll(() => footerPieces(page)).toEqual([{ tone: "success", text: expect.stringMatching(/^저장됨/) }]);
    await expect(page.locator("tfoot").getByText(/전부 거부/)).toHaveCount(0);
  });
});

// 04-47 코드 검토 지적 — 거부 요약이 남은 동안의 오류 수 · 숨은 열 오류로 1차 · 기존 외화 줄을 원화 붙여넣기로 덮음.
test.describe("견적 줄 표 — 거부 뒤 오류 수 · 숨은 열 오류 · 기존 외화 줄 덮기(04-47 검토)", () => {
  test("서버 거부 `오류 1칸 · 전부 거부` 뒤 다른 두 칸에 `abc` → 1차(서버 요청 0) → 합계 행 `오류 3칸`", async ({ page }) => {
    await openProjectWithSavedLines(page, [
      { subcategory: "stage_construction", itemName: "거부수1", amount: 1000 },
      { subcategory: "stage_construction", itemName: "거부수2", amount: 1000 },
      { subcategory: "stage_construction", itemName: "거부수3", amount: 1000 },
    ]);
    await editNumberCell(page, 0, 4, "0");
    await saveAndWait(page);
    await expect(quoteCell(page, 0, 4)).toHaveAttribute("aria-invalid", "true");
    await expect.poll(() => footerPieces(page)).toEqual([{ tone: "danger", text: "오류 1칸 · 전부 거부" }]);

    await quoteCell(page, 1, 4).focus();
    await pasteIntoFocusedCell(page, "abc");
    await quoteCell(page, 2, 4).focus();
    await pasteIntoFocusedCell(page, "abc");
    await expect(invalidCells(page)).toHaveCount(3);

    const actions = countServerActions(page);
    await primarySave(page).click();
    await expect(quoteCell(page, 0, 4)).toBeFocused();
    await expect.poll(() => footerPieces(page)).toEqual([{ tone: "danger", text: "오류 3칸" }]);
    expect(actions.count).toBe(0);
  });

  test("1024~1279 폭에서 숨은 차익 칸만 오류인 채 1차 → 서버 요청 0 · 그 줄의 항목 칸에 포커스", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await openProjectWithSavedLines(page, [
      { subcategory: "stage_construction", itemName: "숨은열1", amount: 1000 },
      { subcategory: "stage_construction", itemName: "숨은열2", amount: 1000 },
    ]);
    // 숨은 칸(display: none)은 접근성 트리에 없다 — 논리 열 순서(번호 0 · 항목 2 · 실행가 7 · 차익 8)로 td를 센다.
    const cells = (rowIndex: number) => quoteDataRows(page).nth(rowIndex).locator("td");
    await cells(1).nth(7).focus();
    await pasteWithFormats(page, { "text/plain": "800\t900" });
    await expect(cells(1).nth(8)).toHaveAttribute("aria-invalid", "true");
    await expect(cells(1).nth(8)).toBeHidden();
    await expect(invalidCells(page)).toHaveCount(1);

    const actions = countServerActions(page);
    await primarySave(page).click();
    await expect(cells(1).nth(2)).toBeFocused();
    expect(actions.count).toBe(0);
  });

  test("기존 외화(USD) 줄의 단가 칸에 엑셀 원화 값을 붙이면 합계 행 `붙여넣기 1줄 · 외화 1줄 원화로`", async ({ page }) => {
    const { revisionId } = await openProjectWithSavedLines(page, []);
    await seedLines(revisionId, [{ subcategory: "stage_construction", itemName: "기존USD", amount: 100, currency: "USD", fxRate: 1300 }]);
    await page.reload();
    await expect(quoteCell(page, 0, 2)).toHaveText("기존USD");

    await quoteCell(page, 0, 5).focus();
    await pasteWithFormats(page, { "text/plain": "5000" });
    await expect(quoteCell(page, 0, 5)).toContainText("5,000");
    await expect.poll(() => footerPieces(page)).toEqual([
      { tone: "muted", text: "붙여넣기 1줄" },
      { tone: "warning", text: "외화 1줄 원화로" },
    ]);
  });
});
