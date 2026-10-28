import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { lotteFixture } from "@/test/fixtures/evidence-import/build";
import { addLotteCard, clearEvidence, evidenceRows, evidenceTable, isServerAction, loginIntake, lotteLines, registerFile } from "./helpers/evidence";

// 06.1-13 G6(RP-16) — 증빙 목록 필터 줄 2차 `파일 받기`. 서버가 지금 거르개 · 범위 안 전체를 CSV 하나로 돌려준다(확인 창 없음).
// 1024 미만에는 버튼이 없다(카드 G9b 「넓은 화면만」) — 필터 줄 거르개 select는 남는다(G9a). 판정은 CI=true 프로덕션 빌드에서 한다.

test.beforeEach(async () => {
  await clearEvidence();
});

test("(G6) 1280 — `파일 받기` → 내려받기 하나 · `evidence-records-*.csv` · 머리줄 = 목록 열 순서 · 줄 수 = 건수 + 1", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const viewer = await loginIntake(page);
  const card = await addLotteCard({ kind: "shared" });
  await registerFile(viewer, lotteFixture(lotteLines(card, 3)), "롯데_받기.xls");
  await page.goto("/expenses/evidence?state=all");
  await expect(evidenceRows(page)).toHaveCount(3);

  const button = page.getByRole("button", { name: "파일 받기", exact: true });
  await expect(button).toHaveCount(1);
  const downloading = page.waitForEvent("download");
  await button.click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^evidence-records-.+\.csv$/);

  const body = await readFile((await download.path()) ?? "", "utf8");
  expect(body.startsWith("﻿")).toBe(true);
  const lines = body.slice(1).split("\r\n").filter((line) => line !== "");
  // 며칠째(07.1-01)도 파일에 싣는다 — 머리줄이 목록 열 순서와 같다.
  const headers = (await evidenceTable(page).locator("thead th").allTextContents()).map((text) => text.trim()).filter((text) => text !== "" && text !== "행동");
  expect(lines[0]?.split(",")).toEqual(headers);
  const count = Number((await evidenceTable(page).locator("tfoot").innerText()).match(/(\d+)줄/)?.[1]);
  expect(count).toBe(3);
  expect(lines).toHaveLength(count + 1);
});

test("(G9b · G9a) 768 — `파일 받기` 버튼이 없고 필터 줄 거르개 select 셋은 남는다", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  const viewer = await loginIntake(page);
  const card = await addLotteCard({ kind: "shared" });
  await registerFile(viewer, lotteFixture(lotteLines(card, 1)), "롯데_폭.xls");
  await page.goto("/expenses/evidence?state=all");
  await expect(evidenceRows(page)).toHaveCount(1);
  await expect(page.getByRole("button", { name: "파일 받기" })).toHaveCount(0);
  for (const name of ["상태", "종류", "기간"]) await expect(page.getByRole("combobox", { name, exact: true })).toHaveCount(1);
});

test("(검토 P3-5) 1280 — 거르개 결과 0건이면 `파일 받기`가 비활성(aria-disabled) · 눌러도 내려받기 없음 · 서버 0", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const viewer = await loginIntake(page);
  const card = await addLotteCard({ kind: "shared" });
  await registerFile(viewer, lotteFixture(lotteLines(card, 1)), "롯데_빈결과.xls");
  // 카드 줄뿐인 묶음에 세금계산서 거르개 — 결과 0건(빈 화면 「조건에 맞는 증빙이 없습니다」).
  await page.goto("/expenses/evidence?state=all&type=tax_invoice");
  await expect(page.getByText("조건에 맞는 증빙이 없습니다")).toBeVisible();

  const button = page.getByRole("button", { name: "파일 받기", exact: true });
  await expect(button).toHaveCount(1);
  await expect(button).toHaveAttribute("aria-disabled", "true");
  expect(await button.evaluate((element) => (element as HTMLButtonElement).disabled)).toBe(false);
  const actions: string[] = [];
  page.on("request", (request) => {
    if (isServerAction(request)) actions.push(request.url());
  });
  let downloads = 0;
  page.on("download", () => {
    downloads += 1;
  });
  // aria-disabled 버튼은 Playwright 실행 가능성 검사가 클릭을 기다린다 — 사람의 클릭과 같게 강제로 누른다.
  await button.click({ force: true });
  await button.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  expect(downloads).toBe(0);
  expect(actions).toEqual([]);
});
