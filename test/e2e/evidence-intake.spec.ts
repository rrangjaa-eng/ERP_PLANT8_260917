import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { createTeamExpenseDraft } from "@/domain/expenses";
import { seoulToday } from "@/lib/dates";
import { bcFixture, hometaxTaxInvoiceFixture, lotteFixture } from "@/test/fixtures/evidence-import/build";
import {
  addBcCard,
  addLotteCard,
  bcLines,
  clearEvidence,
  EVIDENCE_COL,
  evidenceCell,
  evidenceGrid,
  evidenceRows,
  evidenceTable,
  focusGridCell,
  loginAs,
  loginIntake,
  lotteLines,
  precedes,
  registerFile,
  teamIdByName,
  uploadFixture,
  waitForServerAction,
} from "./helpers/evidence";

// 06.1-05 — 증빙 목록(S1 끌어 놓기 + S2 일괄 저장 편집 표). 등록 권한자는 회사 전체 증빙을 보므로 케이스마다 증빙 표를 비우고 시작한다.
// 판정은 CI=true 프로덕션 빌드에서 한다(CLAUDE.md §5).

test.beforeEach(async () => {
  await clearEvidence();
});

const LONG_MERCHANT = "가맹점".repeat(20);

function dirtyCells(page: Page) {
  return evidenceTable(page).locator("td[class*='dirtyCell']");
}

function resultRow(page: Page) {
  return page.locator('[data-variant="bulk-import"] li[data-state="result"]');
}

function emptyMessage(page: Page) {
  return page.locator('[data-ui="empty-state"] p > span');
}

function filterSelect(page: Page, name: "상태" | "종류" | "기간") {
  return page.getByRole("combobox", { name, exact: true });
}

// 팀 카드 2줄(→ 기획1팀 공개 제안) + 공용 카드 1줄(→ 설정 본부 기획본부 공개 제안).
async function uploadThreeLotteLines(page: Page): Promise<void> {
  const teamCard = await addLotteCard({ kind: "team", teamId: await teamIdByName("기획1팀") });
  const sharedCard = await addLotteCard({ kind: "shared" });
  await page.goto("/expenses/evidence");
  await uploadFixture(page, "롯데_10월.xls", lotteFixture([...lotteLines(teamCard, 2), ...lotteLines(sharedCard, 1)]));
  await expect(resultRow(page)).toContainText("롯데_10월.xls · 롯데카드 매입내역");
  await expect(resultRow(page)).toContainText("등록 3");
  await expect(evidenceRows(page)).toHaveCount(3);
}

// 폰 필터 줄(PA-PHONE-FILTER · G9a) — 상태 select가 첫 줄에 홀로, 종류 · 기간은 그 아래 줄.
async function expectStateSelectAlone(page: Page): Promise<void> {
  const [state, type, period] = await Promise.all([filterSelect(page, "상태").boundingBox(), filterSelect(page, "종류").boundingBox(), filterSelect(page, "기간").boundingBox()]);
  const stateBottom = (state?.y ?? 0) + (state?.height ?? 0);
  expect(type?.y ?? 0).toBeGreaterThanOrEqual(stateBottom);
  expect(period?.y ?? 0).toBeGreaterThanOrEqual(stateBottom);
}

test("롯데 파일 하나 → 결과 행 · 미공개 3줄(서버 제안 dirty) → Ctrl+S 한 번에 공개 범위 저장 → 다시 열면 제안 없음", async ({ page }) => {
  await loginIntake(page);
  await uploadThreeLotteLines(page);

  for (let index = 0; index < 3; index++) await expect(evidenceCell(page, index, EVIDENCE_COL.status)).toHaveText("미공개");
  await expect(dirtyCells(page)).toHaveCount(3);
  await expect(evidenceGrid(page)).toContainText("기획1팀 공개");
  await expect(evidenceGrid(page)).toContainText("기획본부 공개");

  // 1차는 필터 줄 오른쪽 끝 하나(DA-15) — 표의 오른쪽 끝과 같은 자리.
  const primary = page.getByRole("button", { name: /^공개 범위 저장 3/ });
  await expect(primary).toBeVisible();
  const [buttonBox, gridBox] = await Promise.all([primary.boundingBox(), evidenceGrid(page).boundingBox()]);
  expect(Math.abs((buttonBox?.x ?? 0) + (buttonBox?.width ?? 0) - ((gridBox?.x ?? 0) + (gridBox?.width ?? 0)))).toBeLessThanOrEqual(1);

  const saved = waitForServerAction(page);
  await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.date));
  await page.keyboard.press("Control+s");
  await saved;

  await expect(evidenceTable(page).locator("tfoot")).toContainText(/공개 범위 저장 · 3줄 · \d{2}:\d{2}/);
  // 저장한 줄은 다음 불러오기 전까지 자리에 남고 상태 글자만 바뀐다(O-6106 — 기본 보기 `할 일`에서 빠지는 줄이라도).
  await expect(evidenceRows(page)).toHaveCount(3);
  await expect(evidenceTable(page).getByText("팀 공개", { exact: true })).toHaveCount(2);
  await expect(evidenceTable(page).getByText("본부 공개", { exact: true })).toHaveCount(1);
  await expect(dirtyCells(page)).toHaveCount(0);

  await page.goto("/expenses/evidence?state=all");
  await expect(evidenceRows(page)).toHaveCount(3);
  await expect(dirtyCells(page)).toHaveCount(0);
  const idle = page.getByRole("button", { name: /^공개 범위 저장/ });
  await expect(idle).toHaveAttribute("aria-disabled", "true");
  await expect(idle).toHaveAccessibleDescription("바뀐 칸 없음");
});

test("(DA-4) 제안 칸만 있을 때는 떠나기 경고 · 복원 줄이 없고, 사람이 바꾼 칸만 경고 · 복원 줄에 든다", async ({ page }) => {
  await loginIntake(page);
  await uploadThreeLotteLines(page);
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.type());
    void dialog.accept();
  });

  // 표를 눌러 사용자 활성화를 준 뒤 떠난다(활성화가 없으면 브라우저가 떠나기 경고를 띄우지 않아 0이 증명되지 않는다).
  await evidenceCell(page, 0, EVIDENCE_COL.date).click();
  await page.goto("/expenses");
  await page.goto("/expenses/evidence");
  expect(dialogs).toEqual([]);
  await expect(page.getByRole("button", { name: "복원" })).toHaveCount(0);
  await expect(dirtyCells(page)).toHaveCount(3);

  // 대조 — 사람이 공개 칸 하나를 바꾸면 떠나기 경고가 서고, 돌아오면 그 한 칸이 복원 줄에 든다.
  await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.visibility));
  await page.keyboard.press("Enter");
  await page.getByRole("combobox", { name: "공개", exact: true }).selectOption({ label: "미공개" });
  await expect(page.getByRole("button", { name: /^공개 범위 저장 3/ })).toBeVisible();
  await page.goto("/expenses");
  expect(dialogs).toEqual(["beforeunload"]);
  await page.goto("/expenses/evidence");
  await expect(page.getByText("저장 안 한 편집 1칸")).toBeVisible();
  await expect(page.getByRole("button", { name: "복원" })).toBeVisible();
});

test("기획 PM은 주소를 쳐도 /expenses/evidence가 404다(등록 권한 없음)", async ({ page }) => {
  await loginAs(page, "role-pm");
  const response = await page.goto("/expenses/evidence");
  expect(response?.status()).toBe(404);
});

test("(P-3 · DA-10) 지출결의 목록 필터 줄 끝 `증빙 {N}` — N은 할 일(확인 필요 포함), 누르면 증빙 목록", async ({ page }) => {
  const viewer = await loginIntake(page, { viewScope: "own", expenses: "write" }, await teamIdByName("기획1팀"));
  await createTeamExpenseDraft(viewer, { idempotencyKey: randomUUID(), fields: { teamExpenseKind: "team_overhead", usageDate: seoulToday(), content: "증빙 진입 링크 E2E" } });
  const card = await addLotteCard({ kind: "shared" });
  // 미공개 2줄 + 해외 이용(확인 필요) 1줄 = 할 일 3.
  await registerFile(viewer, lotteFixture([...lotteLines(card, 2), ...lotteLines(card, 1, { 현지거래금액: "12.50" }, 3)]), "롯데_진입.xls");

  await page.goto("/expenses");
  const link = page.getByRole("main").getByRole("link", { name: "증빙 3", exact: true });
  await expect(link).toHaveAttribute("href", "/expenses/evidence");
  expect(await precedes(page.getByRole("form", { name: "지출결의 보기" }), link)).toBe(true);
  await link.click();
  await expect(page).toHaveURL(/\/expenses\/evidence$/);
  await expect(evidenceRows(page)).toHaveCount(3);
  await expect(evidenceTable(page).getByText("확인 필요", { exact: true })).toHaveCount(1);
});

test("기획 PM의 지출결의 목록에는 증빙 진입 링크가 없다(등록 권한 없음 — DOM 0)", async ({ page }) => {
  await loginAs(page, "role-pm");
  await page.goto("/expenses");
  await expect(page.getByRole("heading", { level: 1, name: "지출결의" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: /^증빙( \d+)?$/ })).toHaveCount(0);
});

test("(G8) 보이는 지출결의가 0건인 등록 계급(보는 범위 본인)도 빈 목록에 `증빙` 링크가 있다", async ({ page }) => {
  await loginIntake(page, { viewScope: "own", expenses: "view" });
  await page.goto("/expenses");
  await expect(page.getByText("등록된 지출결의가 없습니다", { exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "증빙", exact: true })).toHaveAttribute("href", "/expenses/evidence");
});

test("(G17 · DA-19) 결과 행 `등록 3` → state=all&batch= 목록 3줄 · 필터 줄 끝 파일 이름 + `묶음 지우기` → batch만 빠진다", async ({ page }) => {
  await loginIntake(page);
  await uploadThreeLotteLines(page);
  await resultRow(page).getByRole("link", { name: "등록 3" }).click();
  await expect(page).toHaveURL(/\/expenses\/evidence\?state=all&batch=[0-9a-f-]{36}$/);
  await expect(evidenceRows(page)).toHaveCount(3);

  const fileName = page.getByText("롯데_10월.xls", { exact: true });
  const clear = page.getByRole("link", { name: "묶음 지우기" });
  await expect(fileName).toBeVisible();
  expect(await precedes(filterSelect(page, "기간"), fileName)).toBe(true);
  expect(await precedes(fileName, clear)).toBe(true);
  expect(await precedes(clear, page.getByRole("button", { name: /^공개 범위 저장/ }))).toBe(true);

  await clear.click();
  await expect(page).toHaveURL(/\/expenses\/evidence\?state=all$/);
  await expect(clear).toHaveCount(0);
  await expect(evidenceRows(page)).toHaveCount(3);
});

test("(G12 · DA-5) 비씨 SIGN `-` 줄 → 결과 행 `확인 필요 1` → state=needs-check&batch= 1줄 · 공개 셀 잠김(이유 = 상태 2행)", async ({ page }) => {
  await loginIntake(page);
  const card = await addBcCard({ kind: "shared" });
  await page.goto("/expenses/evidence");
  await uploadFixture(page, "비씨_10월.xls", bcFixture(bcLines(card, 1, { 금액SIGN코드: "-" })));
  await resultRow(page).getByRole("link", { name: "확인 필요 1" }).click();
  await expect(page).toHaveURL(/\/expenses\/evidence\?state=needs-check&batch=[0-9a-f-]{36}$/);
  await expect(evidenceRows(page)).toHaveCount(1);
  await expect(evidenceCell(page, 0, EVIDENCE_COL.status)).toContainText("확인 필요");

  const locked = evidenceCell(page, 0, EVIDENCE_COL.visibility).locator('[aria-disabled="true"]');
  await expect(locked).toHaveCount(1);
  const reasonId = await locked.getAttribute("aria-describedby");
  expect(reasonId).toBeTruthy();
  await expect(page.locator(`[id="${reasonId ?? ""}"]`)).toHaveText("취소 표시 줄 · 원거래 확인");
});

test("(DA-17) 공개 셀 — Delete는 무동작(값 · N 그대로), Enter는 select에 초점, Esc는 편집 전 값으로 닫는다", async ({ page }) => {
  await loginIntake(page);
  await uploadThreeLotteLines(page);
  const cell = evidenceCell(page, 0, EVIDENCE_COL.visibility);
  const before = (await cell.textContent()) ?? "";
  const primary = page.getByRole("button", { name: /^공개 범위 저장 3/ });

  await focusGridCell(cell);
  await page.keyboard.press("Delete");
  await expect(cell).toHaveText(before);
  await expect(primary).toBeVisible();
  await expect(evidenceRows(page)).toHaveCount(3);

  await page.keyboard.press("Enter");
  const select = page.getByRole("combobox", { name: "공개", exact: true });
  await expect(select).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(select).toHaveCount(0);
  await expect(cell).toHaveText(before);
  await expect(primary).toBeVisible();
});

test("1280 → 1024 — 공급가 · 세액 열은 DOM에 남은 채 숨고, 합계 행 라벨 뒤에 필터 결과 전체 합이 남는다", async ({ page }) => {
  const viewer = await loginIntake(page);
  const card = await addLotteCard({ kind: "shared" });
  await registerFile(viewer, lotteFixture(lotteLines(card, 2)), "롯데_합계.xls");
  await page.goto("/expenses/evidence");
  await expect(evidenceRows(page)).toHaveCount(2);

  const supplyHead = evidenceTable(page).locator("thead th", { hasText: /^공급가$/ });
  const vatHead = evidenceTable(page).locator("thead th", { hasText: /^세액$/ });
  await expect(supplyHead).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 800 });
  await expect(supplyHead).toHaveCount(1);
  await expect(supplyHead).toBeHidden();
  await expect(vatHead).toHaveCount(1);
  await expect(vatHead).toBeHidden();
  await expect(evidenceTable(page).locator("tfoot")).toContainText("합계 2줄 · 공급가 371,092 · 세액 37,108 · 합계 408,200");
});

test("(G9a) 768 — 보기 전용: 끌어 놓기 영역 · 1차 · 힌트 줄 · 표 안 공개 편집 DOM 0, 필터 select 셋은 있다", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  const viewer = await loginIntake(page);
  const card = await addLotteCard({ kind: "shared" });
  await registerFile(viewer, lotteFixture(lotteLines(card, 2)), "롯데_768.xls");
  await page.goto("/expenses/evidence");
  await expect(evidenceRows(page)).toHaveCount(2);

  await expect(page.locator('[data-variant="bulk-import"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^공개 범위 저장/ })).toHaveCount(0);
  await expect(page.getByRole("main").locator("kbd", { hasText: "Tab ↑↓←→" })).toHaveCount(0);
  // 편집 칸이 없으면 격자가 아니다(공개 select가 열릴 칸이 없다).
  await expect(evidenceGrid(page)).toHaveCount(0);
  await expect(dirtyCells(page)).toHaveCount(0);
  for (const name of ["상태", "종류", "기간"] as const) await expect(filterSelect(page, name)).toBeVisible();
});

test("(G9a · PA-PHONE-FILTER) 375 — 상태 select가 필터 줄 첫 줄에 홀로, 행 탭 → 읽기 시트", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const viewer = await loginIntake(page);
  const card = await addLotteCard({ kind: "shared" });
  await registerFile(viewer, lotteFixture(lotteLines(card, 1)), "롯데_폰.xls");
  await page.goto("/expenses/evidence");
  await expect(evidenceRows(page)).toHaveCount(1);
  await expectStateSelectAlone(page);

  await page.getByRole("button", { name: /가맹점가 상세 보기$/ }).click();
  const sheet = page.getByRole("dialog", { name: "가맹점가" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("185,546");
  await expect(sheet).toContainText("18,554");
  await expect(sheet).toContainText("미공개");
});

test("320 — 필터 줄 쌓기 · 긴 가맹점 이름이 있어도 가로 넘침 없음", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const viewer = await loginIntake(page);
  const card = await addLotteCard({ kind: "shared" });
  await registerFile(viewer, lotteFixture([...lotteLines(card, 1, { 가맹점명: LONG_MERCHANT }), ...lotteLines(card, 1, {}, 2)]), "롯데_320.xls");
  await page.goto("/expenses/evidence");
  await expect(evidenceRows(page)).toHaveCount(2);
  await expectStateSelectAlone(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("(DX-1) 60자 거래처는 한 줄 말줄임 — 행 높이 = 짧은 줄과 같음 · title = 전문", async ({ page }) => {
  const viewer = await loginIntake(page);
  const card = await addLotteCard({ kind: "shared" });
  await registerFile(viewer, lotteFixture([...lotteLines(card, 1, { 가맹점명: LONG_MERCHANT }), ...lotteLines(card, 1, {}, 2)]), "롯데_긴이름.xls");
  await page.goto("/expenses/evidence");
  await expect(evidenceRows(page)).toHaveCount(2);

  const long = evidenceTable(page).locator(`[title="${LONG_MERCHANT}"]`);
  const short = evidenceTable(page).locator('[title="가맹점가"]');
  await expect(long).toHaveCount(1);
  expect(await long.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  // 줄 높이는 글자 칸끼리 잰다 — 행 높이는 마지막 행의 아래 선 유무(표 규칙)로 1px 갈린다.
  const [longBox, shortBox] = await Promise.all([long.boundingBox(), short.boundingBox()]);
  expect(longBox?.height).toBe(shortBox?.height);
});

test("(DA-14 · DA-15 · DA-22) 101줄 2쪽 — 필터 → 1차 순서 · 페이지 줄 `이전` · `다음`(‹ › 없음) · 힌트 줄은 페이지 줄 뒤 · 합계 101줄 · 그룹 건수 101", async ({ page }) => {
  const viewer = await loginIntake(page);
  const card = await addLotteCard({ kind: "shared" });
  await registerFile(viewer, lotteFixture(lotteLines(card, 101)), "롯데_101.xls");
  await page.goto("/expenses/evidence?page=2");
  await expect(evidenceRows(page)).toHaveCount(50);

  const nav = page.getByRole("navigation", { name: "증빙 페이지" });
  await expect(nav.getByRole("link", { name: "이전", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "다음", exact: true })).toBeVisible();
  await expect(nav).not.toContainText("‹");
  await expect(nav).not.toContainText("›");

  // 제안은 필터 결과 전체(쪽과 무관) — N = 101.
  const primary = page.getByRole("button", { name: /^공개 범위 저장 101/ });
  expect(await precedes(filterSelect(page, "기간"), primary)).toBe(true);
  const hint = page.getByRole("main").locator("div", { has: page.locator("kbd", { hasText: "Tab ↑↓←→" }) }).last();
  await expect(hint).toBeVisible();
  expect(await precedes(nav, hint)).toBe(true);
  await expect(evidenceTable(page).locator("tfoot")).toContainText("합계 101줄");
  await expect(evidenceTable(page)).toContainText("롯데카드 매입내역 · 101");
});

test("빈 상태 — 하나도 등록 안 함: `등록한 증빙이 없습니다`(버튼 없음) · 필터 줄 없음 · 끌어 놓기 영역은 있다", async ({ page }) => {
  await loginIntake(page);
  await page.goto("/expenses/evidence");
  await expect(emptyMessage(page)).toHaveText("등록한 증빙이 없습니다");
  await expect(page.locator('[data-ui="empty-state"]').getByRole("link")).toHaveCount(0);
  await expect(page.locator('[data-ui="empty-state"]').getByRole("button")).toHaveCount(0);
  await expect(filterSelect(page, "상태")).toHaveCount(0);
  await expect(page.locator('[data-variant="bulk-import"]')).toBeVisible();
});

test("빈 상태 — 짝 없는 카드 줄 0 → `전체 보기` · 보관됨 0 → `조건에 맞는 증빙이 없습니다` + `필터 지우기`", async ({ page }) => {
  const viewer = await loginIntake(page);
  await registerFile(viewer, hometaxTaxInvoiceFixture([{}]), "홈택스_매입.xls");

  await page.goto("/expenses/evidence?state=unmatched");
  await expect(emptyMessage(page)).toHaveText("짝 없는 카드 줄이 없습니다");
  await page.locator('[data-ui="empty-state"]').getByRole("link", { name: "전체 보기" }).click();
  await expect(page).toHaveURL(/\/expenses\/evidence\?state=all$/);
  await expect(evidenceRows(page)).toHaveCount(1);

  await page.goto("/expenses/evidence?state=archived");
  await expect(emptyMessage(page)).toHaveText("조건에 맞는 증빙이 없습니다");
  await page.locator('[data-ui="empty-state"]').getByRole("link", { name: "필터 지우기" }).click();
  await expect(page).toHaveURL(/\/expenses\/evidence$/);
  await expect(evidenceRows(page)).toHaveCount(1);
});

test("빈 상태 — 할 일 0: 저장한 줄은 자리에 남고, 다시 열면 `할 일 증빙이 없습니다` + `전체 보기` · 1차 DOM 0", async ({ page }) => {
  const viewer = await loginIntake(page);
  await registerFile(viewer, hometaxTaxInvoiceFixture([{}]), "홈택스_매입.xls");
  await page.goto("/expenses/evidence");
  await expect(evidenceRows(page)).toHaveCount(1);

  const saved = waitForServerAction(page);
  await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.date));
  await page.keyboard.press("Control+s");
  await saved;
  await expect(evidenceTable(page).locator("tfoot")).toContainText(/공개 범위 저장 · 1줄 · \d{2}:\d{2}/);
  await expect(evidenceRows(page)).toHaveCount(1);
  await expect(evidenceCell(page, 0, EVIDENCE_COL.status)).toContainText("본부 공개");

  await page.reload();
  await expect(emptyMessage(page)).toHaveText("할 일 증빙이 없습니다");
  await expect(page.locator('[data-ui="empty-state"]').getByRole("link", { name: "전체 보기" })).toHaveAttribute("href", "/expenses/evidence?state=all");
  await expect(page.getByRole("button", { name: /^공개 범위 저장/ })).toHaveCount(0);
});
