import { test, expect, type Page } from "@playwright/test";
import { lotteFixture } from "@/test/fixtures/evidence-import/build";
import {
  addLotteCard,
  clearEvidence,
  createIntakeRole,
  EVIDENCE_COL,
  evidenceCell,
  evidenceGrid,
  evidenceRows,
  focusGridCell,
  loginAs,
  lotteLines,
  teamIdByName,
  uploadFixture,
  waitForServerAction,
} from "./helpers/evidence";

// 06.1-05 — 증빙 목록(S1 끌어 놓기 + S2 일괄 저장 편집 표). 등록 권한자는 회사 전체 증빙을 보므로 케이스마다 증빙 표를 비우고 시작한다.
// 판정은 CI=true 프로덕션 빌드에서 한다(CLAUDE.md §5).

test.beforeEach(async () => {
  await clearEvidence();
});

function dirtyCells(page: Page) {
  return evidenceGrid(page).locator("td[class*='dirtyCell']");
}

// 팀 카드 2줄(→ 기획1팀 공개 제안) + 공용 카드 1줄(→ 설정 본부 기획본부 공개 제안).
async function uploadThreeLotteLines(page: Page): Promise<void> {
  const teamCard = await addLotteCard({ kind: "team", teamId: await teamIdByName("기획1팀") });
  const sharedCard = await addLotteCard({ kind: "shared" });
  await page.goto("/expenses/evidence");
  await uploadFixture(page, "롯데_10월.xls", lotteFixture([...lotteLines(teamCard, 2), ...lotteLines(sharedCard, 1)]));
  const result = page.locator('[data-variant="bulk-import"] li[data-state="result"]');
  await expect(result).toContainText("롯데_10월.xls · 롯데카드 매입내역");
  await expect(result).toContainText("등록 3");
  await expect(evidenceRows(page)).toHaveCount(3);
}

test("롯데 파일 하나 → 결과 행 · 미공개 3줄(서버 제안 dirty) → Ctrl+S 한 번에 공개 범위 저장 → 다시 열면 제안 없음", async ({ page }) => {
  await createIntakeRole(page);
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

  await expect(evidenceGrid(page).locator("tfoot")).toContainText(/공개 범위 저장 · 3줄 · \d{2}:\d{2}/);
  // 상태 낱말(StatusTag 글자) — 팀 카드 2줄은 팀 공개, 공용 카드 1줄은 본부 공개. 2행은 팀 이름 · `{본부} 공개`.
  await expect(evidenceGrid(page).getByText("팀 공개", { exact: true })).toHaveCount(2);
  await expect(evidenceGrid(page).getByText("본부 공개", { exact: true })).toHaveCount(1);
  await expect(dirtyCells(page)).toHaveCount(0);

  await page.goto("/expenses/evidence?state=all");
  await expect(evidenceRows(page)).toHaveCount(3);
  await expect(dirtyCells(page)).toHaveCount(0);
  const idle = page.getByRole("button", { name: /^공개 범위 저장/ });
  await expect(idle).toHaveAttribute("aria-disabled", "true");
  await expect(idle).toHaveAccessibleDescription("바뀐 칸 없음");
});

test("(DA-4) 제안 칸만 있을 때는 떠나기 경고 · 복원 줄이 없고, 사람이 바꾼 칸만 경고 · 복원 줄에 든다", async ({ page }) => {
  await createIntakeRole(page);
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
