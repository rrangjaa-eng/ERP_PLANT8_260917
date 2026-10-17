import { randomUUID } from "node:crypto";
import { AxeBuilder } from "@axe-core/playwright";
import { test, expect, type Page, type Route } from "@playwright/test";
import { createTeamExpenseDraft } from "@/domain/expenses";
import { seoulToday } from "@/lib/dates";
import { bcFixture, hometaxTaxInvoiceFixture, lotteFixture } from "@/test/fixtures/evidence-import/build";
import {
  addBcCard,
  addLotteCard,
  attachRecordFixture,
  bcLines,
  bumpRecordVersion,
  clearEvidence,
  EVIDENCE_COL,
  evidenceCell,
  evidenceGrid,
  evidenceRows,
  evidenceTable,
  focusGridCell,
  isServerAction,
  liveTeamNames,
  loginAs,
  loginIntake,
  lotteLines,
  precedes,
  recordIdsOf,
  registerFile,
  teamIdByName,
  uploadFixture,
  uploadFixtures,
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

// ─── 06.1-05 Task 3 — 서버가 거부하는 편집과 치우기 ────────────────────────────────────────────────────────────

function refusedRow(page: Page) {
  return page.locator('[data-variant="bulk-import"] li[data-state="refused"]');
}

function intakeRows(page: Page) {
  return page.locator('[data-variant="bulk-import"] li');
}

function visibilityCells(page: Page) {
  return evidenceRows(page).locator(`:scope > td:nth-child(${EVIDENCE_COL.visibility + 1})`);
}

// 서버 액션 POST(`next-action` 머리)만 가로챈다 — 목록 다시 읽기(RSC GET)는 그대로 지난다.
async function routeActions(page: Page, handler: (route: Route) => Promise<void>): Promise<void> {
  await page.route(
    (url) => url.pathname === "/expenses/evidence",
    async (route, request) => {
      if (!isServerAction(request)) return route.continue();
      await handler(route);
    },
  );
}

// 1MB(10진) 한도를 넘는 파일 — 내용은 보지 않는다(브라우저가 크기만 재고 거절한다).
const OVERSIZE = new Uint8Array(1_400_000);

test("(DA-1) 공개 select — 제안 팀(선택됨) · 설정 본부 · 미공개 · 묶음 「다른 팀」(보관 아닌 팀 · 제안 팀 제외) → 다른 팀 고르고 Ctrl+S → 팀 공개 · 2행 그 팀", async ({ page }) => {
  const viewer = await loginIntake(page);
  const proposalTeam = await teamIdByName("기획1팀");
  const card = await addLotteCard({ kind: "team", teamId: proposalTeam });
  await registerFile(viewer, lotteFixture(lotteLines(card, 1)), "롯데_팀.xls");
  await page.goto("/expenses/evidence");
  await expect(evidenceRows(page)).toHaveCount(1);

  await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.visibility));
  await page.keyboard.press("Enter");
  const select = page.getByRole("combobox", { name: "공개", exact: true });
  await expect(select).toBeFocused();
  await expect(select).toHaveValue(`team:${proposalTeam}`);
  // 첫 `—`는 Select 공용 빈 값(고르지 않음 — 공개 값이 아니라 커밋하지 않는다).
  await expect(select.locator(":scope > option")).toHaveText(["—", "기획1팀 공개", "기획본부 공개", "미공개"]);
  const group = select.locator(":scope > optgroup");
  await expect(group).toHaveCount(1);
  await expect(group).toHaveAttribute("label", "다른 팀");
  const others = (await liveTeamNames()).filter((name) => name !== "기획1팀").map((name) => `${name} 공개`);
  expect(others).toContain("경영관리팀 공개");
  await expect(group.locator("option")).toHaveText(others);

  await select.selectOption({ label: "경영관리팀 공개" });
  await expect(select).toHaveCount(0);
  await expect(evidenceCell(page, 0, EVIDENCE_COL.visibility)).toHaveText("경영관리팀 공개");
  const saved = waitForServerAction(page);
  await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.date));
  await page.keyboard.press("Control+s");
  await saved;

  await expect(evidenceCell(page, 0, EVIDENCE_COL.status)).toContainText("팀 공개");
  await expect(evidenceCell(page, 0, EVIDENCE_COL.status)).toContainText("경영관리팀");
});

test("(DA-18) 화면을 연 뒤 한 줄이 바뀌면 Ctrl+S → 합계 행 `오류 1칸 · 전부 거부` · 그 칸만 오류 · 다른 줄은 그대로(저장 0줄)", async ({ page }) => {
  const viewer = await loginIntake(page);
  const card = await addLotteCard({ kind: "shared" });
  const batchId = await registerFile(viewer, lotteFixture(lotteLines(card, 3)), "롯데_3.xls");
  await page.goto("/expenses/evidence");
  await expect(evidenceRows(page)).toHaveCount(3);
  const [stale] = await recordIdsOf(batchId);
  if (!stale) throw new Error("증빙 줄 없음");
  await bumpRecordVersion(stale);

  const saved = waitForServerAction(page);
  await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.date));
  await page.keyboard.press("Control+s");
  await saved;

  await expect(evidenceTable(page).locator("tfoot")).toContainText("오류 1칸 · 전부 거부");
  await expect(evidenceTable(page).locator('td[aria-invalid="true"]')).toHaveCount(1);
  await expect(visibilityCells(page).and(page.locator('[aria-invalid="true"]'))).toHaveCount(1);
  for (let index = 0; index < 3; index++) await expect(evidenceCell(page, index, EVIDENCE_COL.status)).toHaveText("미공개");
  // 오류 칸은 dirty 면 대신 오류 모양이다(표 규칙 — 오류가 이긴다). 보낼 줄은 셋 그대로 남는다.
  await expect(dirtyCells(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: /^공개 범위 저장 3/ })).toBeVisible();
});

test("(DA-2 · E2) 1.4MB 파일 → 서버를 부르지 않고 크기 거절 행(`다시 올리기` 없음) · 본문 한도 413도 같은 거절 행", async ({ page }) => {
  await loginIntake(page);
  await page.goto("/expenses/evidence");
  let actionCalls = 0;
  page.on("request", (request) => {
    if (isServerAction(request)) actionCalls++;
  });

  await uploadFixture(page, "큰_파일.xls", OVERSIZE);
  await expect(refusedRow(page)).toHaveCount(1);
  await expect(refusedRow(page)).toContainText("큰_파일.xls");
  await expect(refusedRow(page)).toContainText("1.4MB · 1MB 초과 · 기간을 나눠 다시 내려받기");
  await expect(page.getByRole("button", { name: "다시 올리기" })).toHaveCount(0);
  expect(actionCalls).toBe(0);

  // 한도 바로 아래 파일이 multipart 머리로 한도를 넘어 Next가 413 `Body exceeded …`로 끝낸 경우 — 같은 크기 거절 행.
  await routeActions(page, (route) => route.fulfill({ status: 413, contentType: "text/plain", body: "Body exceeded 1 MB limit.\nTo configure the body size limit for Server Actions, see: https://nextjs.org/docs" }));
  await uploadFixture(page, "한도_바로_아래.xls", new Uint8Array(999_000));
  await expect(refusedRow(page)).toContainText("한도_바로_아래.xls");
  await expect(refusedRow(page)).toContainText("1.0MB · 1MB 초과 · 기간을 나눠 다시 내려받기");
  await expect(page.getByRole("button", { name: "다시 올리기" })).toHaveCount(0);
});

test("(DA-2) 서버 5xx · 연결 끊김이면 `올리지 못함` + `다시 올리기` — 다시 올리면 결과 행", async ({ page }) => {
  await loginIntake(page);
  const card = await addLotteCard({ kind: "shared" });
  await page.goto("/expenses/evidence");
  const failed = page.locator('[data-variant="bulk-import"] li[data-state="failed"]');

  await routeActions(page, (route) => route.fulfill({ status: 500, contentType: "text/plain", body: "Internal Server Error" }));
  await uploadFixture(page, "롯데_500.xls", lotteFixture(lotteLines(card, 1)));
  await expect(failed).toContainText("올리지 못함");
  await expect(failed.getByRole("button", { name: "다시 올리기" })).toBeVisible();

  await page.unrouteAll({ behavior: "wait" });
  await routeActions(page, (route) => route.abort("connectionreset"));
  await uploadFixture(page, "롯데_끊김.xls", lotteFixture(lotteLines(card, 1, {}, 11)));
  await expect(failed).toContainText("롯데_끊김.xls");
  await expect(failed).toContainText("올리지 못함");

  await page.unrouteAll({ behavior: "wait" });
  await failed.getByRole("button", { name: "다시 올리기" }).click();
  await expect(resultRow(page)).toContainText("등록 1");
  await expect(evidenceRows(page)).toHaveCount(1);
});

test("(E32 · P3-8) 정상 롯데 하나 + 1.4MB 하나를 함께 놓기 → 결과 행 둘(성공 · 거절) · 표에는 롯데 3줄만", async ({ page }) => {
  await loginIntake(page);
  const card = await addLotteCard({ kind: "shared" });
  await page.goto("/expenses/evidence");

  await uploadFixtures(page, [
    { name: "롯데_정상.xls", bytes: lotteFixture(lotteLines(card, 3)) },
    { name: "큰_파일.xls", bytes: OVERSIZE },
  ]);
  await expect(resultRow(page)).toContainText("등록 3");
  await expect(refusedRow(page)).toContainText("1.4MB · 1MB 초과");
  await expect(intakeRows(page)).toHaveCount(2);
  await expect(evidenceRows(page)).toHaveCount(3);
});

test("(DA-21) 올리는 동안 1차는 aria-disabled `올리는 중` · 사람이 바꾼 공개 칸은 다시 읽어도 남고 · 올리는 중 놓은 둘째 파일은 첫 행 뒤에 붙는다", async ({ page }) => {
  const viewer = await loginIntake(page);
  const card = await addLotteCard({ kind: "shared" });
  await registerFile(viewer, lotteFixture(lotteLines(card, 1)), "롯데_처음.xls");
  await page.goto("/expenses/evidence");
  await expect(evidenceRows(page)).toHaveCount(1);

  // 사람이 바꾼 칸 — 제안(기획본부 공개)을 미공개로.
  await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.visibility));
  await page.keyboard.press("Enter");
  await page.getByRole("combobox", { name: "공개", exact: true }).selectOption({ label: "미공개" });
  await expect(evidenceCell(page, 0, EVIDENCE_COL.visibility)).toHaveText("미공개");

  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await routeActions(page, async (route) => {
    await held;
    await route.continue();
  });
  await uploadFixture(page, "롯데_A.xls", lotteFixture(lotteLines(card, 2, {}, 21)));
  const primary = page.getByRole("button", { name: /^공개 범위 저장/ });
  await expect(primary).toHaveAttribute("aria-disabled", "true");
  await expect(primary).toHaveAccessibleDescription("올리는 중");

  await uploadFixture(page, "롯데_B.xls", lotteFixture(lotteLines(card, 1, {}, 31)));
  await expect(intakeRows(page)).toHaveCount(2);
  await expect(intakeRows(page).nth(0)).toContainText("롯데_A.xls");
  await expect(intakeRows(page).nth(1)).toContainText("롯데_B.xls");

  release();
  await expect(resultRow(page)).toHaveCount(2);
  await expect(resultRow(page).nth(0)).toContainText("롯데_A.xls");
  await expect(resultRow(page).nth(1)).toContainText("롯데_B.xls");
  await expect(evidenceRows(page)).toHaveCount(4);
  await expect(visibilityCells(page).filter({ hasText: /^미공개$/ })).toHaveCount(1);
  await expect(primary).not.toHaveAttribute("aria-disabled", "true");
  await expect(primary).toHaveText(/^공개 범위 저장 4/);
});

test("(DA-7 · E41) 안 붙은 줄 `보관` → 확인 창 없이 표 위 `증빙 보관됨` + `되돌리기`(초점) · 할 일에서 빠짐 → 되돌리기 → 돌아옴 · Ctrl+E도 같다", async ({ page }) => {
  const viewer = await loginIntake(page);
  const card = await addLotteCard({ kind: "shared" });
  await registerFile(viewer, lotteFixture(lotteLines(card, 2)), "롯데_2.xls");
  await page.goto("/expenses/evidence");
  await expect(evidenceRows(page)).toHaveCount(2);
  let dialogs = 0;
  page.on("dialog", () => dialogs++);

  const archiveButtons = evidenceTable(page).getByRole("button", { name: "보관", exact: true });
  await expect(archiveButtons).toHaveCount(2);
  await expect(archiveButtons.first()).toHaveAttribute("tabindex", "-1");
  await expect(page.getByRole("main").locator("kbd", { hasText: "Ctrl+E" })).toHaveCount(1);

  const archived = waitForServerAction(page);
  await evidenceCell(page, 0, EVIDENCE_COL.actions).getByRole("button", { name: "보관", exact: true }).click();
  await archived;
  const line = page.getByRole("status").filter({ hasText: "증빙 보관됨" });
  await expect(line).toBeVisible();
  const undo = line.getByRole("button", { name: "되돌리기", exact: true });
  await expect(undo).toBeFocused();
  await expect(evidenceRows(page)).toHaveCount(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(dialogs).toBe(0);
  // 행 행동 열 · 결과 줄이 선 화면 — 기본 규칙 전체(a11y 스펙과 같은 기준, 그 스펙의 증빙 화면은 빈 목록일 수 있다).
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.map((violation) => violation.id)).toEqual([]);

  await undo.click();
  await expect(evidenceRows(page)).toHaveCount(2);
  await expect(line).toHaveCount(0);

  // 키보드 경로 — 활성 셀 줄의 행 행동(§7-3 (차)).
  await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.date));
  await page.keyboard.press("Control+e");
  await expect(page.getByRole("status").filter({ hasText: "증빙 보관됨" })).toBeVisible();
  await expect(evidenceRows(page)).toHaveCount(1);
});

test("(DA-7) `?state=archived` 보기의 행 행동은 `되살리기`만 — 누르면 그 보기에서 빠진다 · 붙은 줄에는 `보관`이 없다", async ({ page }) => {
  const viewer = await loginIntake(page);
  const card = await addLotteCard({ kind: "shared" });
  const batchId = await registerFile(viewer, lotteFixture(lotteLines(card, 3)), "롯데_3.xls");
  const [attached] = await recordIdsOf(batchId);
  if (!attached) throw new Error("증빙 줄 없음");
  await attachRecordFixture(attached, viewer.id);

  await page.goto("/expenses/evidence?state=all");
  await expect(evidenceRows(page)).toHaveCount(3);
  await expect(evidenceTable(page).getByRole("button", { name: "보관", exact: true })).toHaveCount(2);
  const attachedRow = evidenceRows(page).filter({ hasText: "붙음" });
  await expect(attachedRow).toHaveCount(1);
  await expect(attachedRow.locator(`:scope > td:nth-child(${EVIDENCE_COL.actions + 1})`)).toBeEmpty();

  const archived = waitForServerAction(page);
  await evidenceTable(page).getByRole("button", { name: "보관", exact: true }).first().click();
  await archived;
  await expect(page.getByRole("status").filter({ hasText: "증빙 보관됨" })).toBeVisible();

  await page.goto("/expenses/evidence?state=archived");
  await expect(evidenceRows(page)).toHaveCount(1);
  await expect(evidenceTable(page).getByRole("button", { name: "보관", exact: true })).toHaveCount(0);
  const restore = evidenceTable(page).getByRole("button", { name: "되살리기", exact: true });
  await expect(restore).toHaveCount(1);
  await expect(page.getByRole("main").locator("kbd", { hasText: "Ctrl+E" })).toHaveCount(1);
  await restore.click();
  await expect(evidenceRows(page)).toHaveCount(0);
  await expect(emptyMessage(page)).toHaveText("조건에 맞는 증빙이 없습니다");
});


// 06.1-05 디자인 검토 H1 — 1024 미만(보기 전용 폭)에서 복원으로 사람이 바꾼 칸이 생기면 저장할 1차가 있어야 한다(막다른 상태 금지).
// 1280에서 칸 하나를 `미공개`로 바꾸고 떠난 뒤 좁은 폭으로 돌아와 `복원`을 누른다.
for (const width of [768, 375]) {
  test(`(H1 · DR-24) ${width} — 복원으로 사람이 바꾼 칸이 생기면 1차 \`공개 범위 저장\`이 선다(바꾼 칸이 없으면 없다)${width === 375 ? " · 높이 44" : ""}`, async ({ page }) => {
    const viewer = await loginIntake(page);
    const card = await addLotteCard({ kind: "shared" });
    await registerFile(viewer, lotteFixture(lotteLines(card, 3)), `롯데_H1_${width}.xls`);
    page.on("dialog", (dialog) => void dialog.accept());
    await page.goto("/expenses/evidence");
    await expect(evidenceRows(page)).toHaveCount(3);
    await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.visibility));
    await page.keyboard.press("Enter");
    await page.getByRole("combobox", { name: "공개", exact: true }).selectOption({ label: "미공개" });
    await expect(page.getByRole("button", { name: /^공개 범위 저장 3/ })).toBeVisible();
    await page.goto("/expenses");

    await page.setViewportSize({ width, height: 800 });
    await page.goto("/expenses/evidence");
    await expect(page.getByText("저장 안 한 편집 1칸")).toBeVisible();
    const primary = page.getByRole("button", { name: /^공개 범위 저장/ });
    await expect(primary).toHaveCount(0);

    await page.getByRole("button", { name: "복원" }).click();
    await expect(page.getByText("저장 안 한 편집 1칸")).toHaveCount(0);
    await expect(primary).toBeVisible();
    if (width === 375) expect((await primary.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
}

// 06.1-05 디자인 검토 H2 — SYSTEM §7-3 (아) DR-5: 고정 오류(`전부 거부`)가 남은 채 1차를 누르면 서버를 부르지 않고 첫 오류 칸으로 초점이 간다.
test("(H2 · DR-5) 전부 거부 오류가 남은 채 1차를 누르면 서버를 또 부르지 않고 첫 오류 칸에 초점", async ({ page }) => {
  const viewer = await loginIntake(page);
  const card = await addLotteCard({ kind: "shared" });
  const batchId = await registerFile(viewer, lotteFixture(lotteLines(card, 3)), "롯데_H2.xls");
  await page.goto("/expenses/evidence");
  await expect(evidenceRows(page)).toHaveCount(3);
  const [stale] = await recordIdsOf(batchId);
  if (!stale) throw new Error("증빙 줄 없음");
  await bumpRecordVersion(stale);

  const rejected = waitForServerAction(page);
  await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.date));
  await page.keyboard.press("Control+s");
  await rejected;
  await expect(evidenceTable(page).locator("tfoot")).toContainText("오류 1칸 · 전부 거부");

  // 초점을 오류 칸 밖으로 옮기고 1차를 누른다 — 서버 액션 POST는 0, 초점은 오류 칸.
  let posts = 0;
  page.on("request", (request) => {
    if (isServerAction(request)) posts++;
  });
  await focusGridCell(evidenceCell(page, 1, EVIDENCE_COL.date));
  await page.getByRole("button", { name: /^공개 범위 저장 3/ }).click();
  await expect(evidenceTable(page).locator('td[aria-invalid="true"]')).toBeFocused();
  expect(posts).toBe(0);
});

// 06.1-05 디자인 검토 H3 — SYSTEM §7-3 폰: 합계 행의 부제(줄 수 · 공급가 · 세액)는 폰에서 숨기고 합계(P1 금액)만 한 줄로 둔다. PC는 그대로.
test("(H3) 375 — 합계 행은 한 줄 `합계 612,300`(부제 숨김) · 1280은 부제가 그대로 선다", async ({ page }) => {
  const viewer = await loginIntake(page);
  const card = await addLotteCard({ kind: "shared" });
  await registerFile(viewer, lotteFixture(lotteLines(card, 3)), "롯데_H3.xls");
  await page.goto("/expenses/evidence");
  await expect(evidenceRows(page)).toHaveCount(3);
  const footer = evidenceTable(page).locator("tfoot td");
  await expect(footer).toContainText("합계 3줄 · 공급가");

  await page.setViewportSize({ width: 375, height: 800 });
  await expect(footer).toBeVisible();
  const phone = await footer.evaluate((cell) => {
    const range = document.createRange();
    range.selectNodeContents(cell);
    return { text: (cell as HTMLElement).innerText.replace(/\s+/g, " ").trim(), lines: new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size };
  });
  expect(phone).toEqual({ text: "합계 612,300", lines: 1 });
});
