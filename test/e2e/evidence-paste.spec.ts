import { test, expect, type Page } from "@playwright/test";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import type { Viewer } from "@/domain/viewer";
import { evidenceRecords } from "@/db/schema";
import { lotteFixture } from "@/test/fixtures/evidence-import/build";
import { setRecordVisibilityFixture } from "@/test/integration/fixtures/evidence";
import {
  addLotteCard,
  attachRecordFixture,
  clearEvidence,
  EVIDENCE_COL,
  evidenceCell,
  evidenceRows,
  evidenceTable,
  focusGridCell,
  isServerAction,
  loginIntake,
  lotteLines,
  registerFile,
  waitForServerAction,
} from "./helpers/evidence";

// 06.1-13(SP-6104 · G-2) — 증빙 목록 공개 칸에 엑셀 라벨 열을 붙여 한 번에 공개 범위를 채운다. 픽스처 줄은 공개 범위를 한 번 저장한
// `미공개`(제안 없음 — 서버 제안이 1차 N을 흐리지 않게)이고, 본부 라벨은 첫 줄 공개 select의 본부 선택지 글자를 DOM에서 읽는다(C3 —
// 스펙에 본부 글자를 박지 않는다). 판정은 CI=true 프로덕션 빌드에서 한다(CLAUDE.md §5).

test.beforeEach(async () => {
  await clearEvidence();
});

/** 묶음의 기록 id — 목록이 그리는 차례(서식 → 날짜 내림차순 → id, repositories LIST_ORDER). */
async function displayOrderIds(batchId: string): Promise<string[]> {
  const rows = await db
    .select({ id: evidenceRecords.id })
    .from(evidenceRecords)
    .where(eq(evidenceRecords.batchId, batchId))
    .orderBy(asc(evidenceRecords.format), desc(evidenceRecords.issuedOn), asc(evidenceRecords.id));
  return rows.map((row) => row.id);
}

/** 공개 범위를 한 번 저장한 미공개 줄 n개(제안 없음)의 id를 목록 차례로 돌려준다. */
async function privateRows(viewer: Viewer, count: number): Promise<string[]> {
  const card = await addLotteCard({ kind: "shared" });
  const batchId = await registerFile(viewer, lotteFixture(lotteLines(card, count)), "롯데_붙여넣기.xls");
  const ids = await displayOrderIds(batchId);
  for (const id of ids) await setRecordVisibilityFixture(id, { visibility: "private" });
  return ids;
}

// 확인 필요 줄(공개 칸 잠김 — 06.1-05 규칙). 사유 글은 화면 상태 2행이 그대로 보인다.
async function setNeedsCheck(id: string): Promise<void> {
  await db.update(evidenceRecords).set({ needsCheck: "해외 이용 · 원화 확인" }).where(eq(evidenceRecords.id, id));
}

/** 첫 줄 공개 select의 본부 선택지 글자(평 선택지 중 `미공개` · 묶음 밖의 `… 공개`) — 설정 값이 정한 본부 이름. */
async function divisionLabel(page: Page): Promise<string> {
  await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.visibility));
  await page.keyboard.press("Enter");
  const select = page.getByRole("combobox", { name: "공개", exact: true });
  const labels = await select.locator(":scope > option").allTextContents();
  await page.keyboard.press("Escape");
  await expect(select).toHaveCount(0);
  const label = labels.find((text) => text !== "미공개" && text.endsWith(" 공개"));
  if (!label) throw new Error(`본부 선택지 없음: ${labels.join(", ")}`);
  return label;
}

async function pasteAtFocus(page: Page, text: string): Promise<void> {
  await page.evaluate((value) => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", value);
    document.activeElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, text);
}

function dirtyCells(page: Page) {
  return evidenceTable(page).locator("td[class*='dirtyCell']");
}

function footer(page: Page) {
  return evidenceTable(page).locator("tfoot");
}

test("(SP-6104) 공개 칸에 라벨 열 세 줄 `Ctrl+V` → 바뀐 칸만 dirty · 1차 N · `Ctrl+S` 한 번에 저장 · 상태 글자 바뀜", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const viewer = await loginIntake(page);
  await privateRows(viewer, 3);
  await page.goto("/expenses/evidence?state=all");
  await expect(evidenceRows(page)).toHaveCount(3);
  await expect(dirtyCells(page)).toHaveCount(0);

  const division = await divisionLabel(page);
  await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.visibility));
  await pasteAtFocus(page, `${division}\n미공개\n기획1팀 공개`);

  // 둘째 줄은 이미 미공개 — 값이 바뀐 칸만 dirty다.
  await expect(evidenceCell(page, 0, EVIDENCE_COL.visibility)).toHaveText(division);
  await expect(evidenceCell(page, 1, EVIDENCE_COL.visibility)).toHaveText("미공개");
  await expect(evidenceCell(page, 2, EVIDENCE_COL.visibility)).toHaveText("기획1팀 공개");
  await expect(dirtyCells(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: /^공개 범위 저장 2/ })).toBeVisible();
  await expect(evidenceTable(page).locator('[aria-invalid="true"]')).toHaveCount(0);

  const saved = waitForServerAction(page);
  await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.date));
  await page.keyboard.press("Control+s");
  await saved;

  await expect(footer(page)).toContainText(/공개 범위 저장 · 2줄 · \d{2}:\d{2}/);
  await expect(evidenceCell(page, 0, EVIDENCE_COL.status)).toContainText("본부 공개");
  await expect(evidenceCell(page, 1, EVIDENCE_COL.status)).toContainText("미공개");
  await expect(evidenceCell(page, 2, EVIDENCE_COL.status)).toContainText("팀 공개");
  await expect(evidenceCell(page, 2, EVIDENCE_COL.status)).toContainText("기획1팀");
});

test("(SP-6104 · E20) 모르는 값 · 없는 팀은 오류 셀, 다른 팀은 그 팀, 잠긴 줄은 건너뜀 → 오류가 남은 `Ctrl+S`는 서버 0 · `전부 거부` → 고친 뒤 저장", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const viewer = await loginIntake(page);
  const [, , , needsCheck, attached] = await privateRows(viewer, 6);
  if (!needsCheck || !attached) throw new Error("증빙 줄 없음");
  await setNeedsCheck(needsCheck);
  await attachRecordFixture(attached, viewer.id);
  await page.goto("/expenses/evidence?state=all");
  await expect(evidenceRows(page)).toHaveCount(6);
  await expect(evidenceCell(page, 3, EVIDENCE_COL.status)).toContainText("확인 필요");
  await expect(evidenceCell(page, 4, EVIDENCE_COL.status)).toContainText("붙음");
  const lockedBefore = [await evidenceCell(page, 3, EVIDENCE_COL.visibility).textContent(), await evidenceCell(page, 4, EVIDENCE_COL.visibility).textContent()];

  const division = await divisionLabel(page);
  await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.visibility));
  // 기획9팀은 시드에 없는 팀 이름(보관 · 없는 팀은 선택지에 없다), 경영관리팀은 보관 아닌 다른 팀(묶음 「다른 팀」).
  await pasteAtFocus(page, `${division}\n없는값\n기획9팀 공개\n${division}\n미공개\n경영관리팀 공개`);

  await expect(evidenceCell(page, 0, EVIDENCE_COL.visibility)).toHaveText(division);
  await expect(evidenceCell(page, 5, EVIDENCE_COL.visibility)).toHaveText("경영관리팀 공개");
  await expect(dirtyCells(page)).toHaveCount(2);
  const invalid = evidenceTable(page).locator('td[aria-invalid="true"]');
  await expect(invalid).toHaveCount(2);
  await expect(evidenceCell(page, 1, EVIDENCE_COL.visibility)).toHaveAttribute("aria-invalid", "true");
  await expect(evidenceCell(page, 2, EVIDENCE_COL.visibility)).toHaveAttribute("aria-invalid", "true");
  await expect(evidenceTable(page)).toContainText("목록에 없는 값 · 없는값");
  await expect(evidenceTable(page)).toContainText("목록에 없는 값 · 기획9팀 공개");
  // 잠긴 줄(확인 필요 · 붙음)은 값 그대로 · 오류 아님.
  expect([await evidenceCell(page, 3, EVIDENCE_COL.visibility).textContent(), await evidenceCell(page, 4, EVIDENCE_COL.visibility).textContent()]).toEqual(lockedBefore);
  await expect(evidenceCell(page, 3, EVIDENCE_COL.status)).toContainText("확인 필요");
  await expect(evidenceCell(page, 4, EVIDENCE_COL.status)).toContainText("붙음");
  await expect(footer(page)).toContainText("붙여넣기 6줄 · 공개 칸 2개 모르는 값 · 잠긴 줄 2칸 건너뜀");

  // 오류 칸이 남은 저장 — 서버를 부르지 않는다(PA-G2-BLOCK).
  const actions: string[] = [];
  page.on("request", (request) => {
    if (isServerAction(request)) actions.push(request.url());
  });
  await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.date));
  await page.keyboard.press("Control+s");
  await expect(footer(page)).toContainText("오류 2칸 · 전부 거부");
  expect(actions).toEqual([]);
  await expect(evidenceCell(page, 0, EVIDENCE_COL.status)).toContainText("미공개");
  await expect(evidenceCell(page, 5, EVIDENCE_COL.status)).toContainText("미공개");

  // 오류 칸 둘을 셀 고르기로 고친 뒤 저장.
  for (const index of [1, 2]) {
    await focusGridCell(evidenceCell(page, index, EVIDENCE_COL.visibility));
    await page.keyboard.press("Enter");
    await page.getByRole("combobox", { name: "공개", exact: true }).selectOption({ label: "미공개" });
    await expect(evidenceCell(page, index, EVIDENCE_COL.visibility)).not.toHaveAttribute("aria-invalid", "true");
  }
  await expect(invalid).toHaveCount(0);
  await expect(footer(page)).not.toContainText("전부 거부");

  const saved = waitForServerAction(page);
  await focusGridCell(evidenceCell(page, 0, EVIDENCE_COL.date));
  await page.keyboard.press("Control+s");
  await saved;
  await expect(footer(page)).toContainText(/공개 범위 저장 · 2줄 · \d{2}:\d{2}/);
  await expect(evidenceCell(page, 0, EVIDENCE_COL.status)).toContainText("본부 공개");
  await expect(evidenceCell(page, 5, EVIDENCE_COL.status)).toContainText("팀 공개");
  await expect(evidenceCell(page, 5, EVIDENCE_COL.status)).toContainText("경영관리팀");
});

test("(DR-36) 768 — 공개 칸 편집이 없고 붙여넣기를 해도 표가 그대로다", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  const viewer = await loginIntake(page);
  await privateRows(viewer, 2);
  await page.goto("/expenses/evidence?state=all");
  await expect(evidenceRows(page)).toHaveCount(2);
  await expect(page.getByRole("grid", { name: "증빙 목록" })).toHaveCount(0);
  const before = await evidenceTable(page).innerText();

  await evidenceCell(page, 0, EVIDENCE_COL.visibility).evaluate((cell) => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", "기획1팀 공개\n기획1팀 공개");
    cell.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  });

  await expect(dirtyCells(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^공개 범위 저장/ })).toHaveCount(0);
  expect(await evidenceTable(page).innerText()).toBe(before);
});
