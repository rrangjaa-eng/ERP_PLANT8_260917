import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { loginAsSysadmin, tokenNumber } from "./row-actions-helpers";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertCodeItem, setCodeItemActive } from "@/repositories/code-tables";

// 2026-10-01 PR #126 /design-review(DOM 실측)에서 확인된 기존 결함 2건의 회귀.
// 1) SYSTEM.md §3 「섹션 사이: 2px 강한 선 위 --s-6, 아래 --s-3」 — 설정·사람 상세의
//    섹션이 선 아래 24px였다.
// 2) SYSTEM.md §6-3 · §7-2 · §7-15 「PC 폼 라벨은 왼쪽 96px(--label-w), 폰에서는 위」
//    · 칸 폭 「select 200」 — 폼의 `.selectLabel`(select 한 칸 묶음)이 PC에서도 라벨을
//    위에 두고 select를 전폭으로 그렸다. TextField·Form.Field와 같은 라벨 열(96 + --s-2).
// 목록 필터 줄(§6-1)의 `.selectLabel`은 폼이 아니라 대상 밖이다(사용자 결정 2026-10-01).

const PC_WIDTHS = [1280, 768];
const PHONE_WIDTHS = [390, 320];
const SELECT_W = 200;

type SelectRow = {
  id: string;
  rowLeft: number;
  rowWidth: number;
  labelLeft: number;
  labelTop: number;
  labelBottom: number;
  selectLeft: number;
  selectTop: number;
  selectBottom: number;
  selectWidth: number;
  hintLefts: number[];
};

// select 한 칸 묶음(`class*=selectLabel`)을 전부 잰다. 라벨은 `<label>` 자식이거나
// (div 묶음), 묶음 자체가 `<label>`이고 첫 글자 노드가 라벨이다(설정 화면).
// 힌트는 묶음 안의 `p`와 묶음 바로 뒤 형제 `p`(설정 화면 · 사람 상세 계급 오류) 둘 다 본다.
async function measureSelectRows(page: Page, scope: string): Promise<SelectRow[]> {
  return page.evaluate((scopeSelector) => {
    const rows = Array.from(document.querySelectorAll<HTMLElement>(`${scopeSelector} [class*="selectLabel"]`));
    return rows
      .filter((row) => row.querySelector("select") !== null && row.getClientRects().length > 0)
      .map((row) => {
        const select = row.querySelector("select")!;
        // 라벨은 글자 상자로 잰다 — TextField 라벨 글자와 세로 위치를 비교하기 위해서다.
        const range = document.createRange();
        if (row.tagName === "LABEL") {
          const text = Array.from(row.childNodes).find(
            (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "",
          )!;
          range.selectNodeContents(text);
        } else {
          range.selectNodeContents(row.querySelector(":scope > label")!);
        }
        const labelRect = range.getBoundingClientRect();
        const hints: Element[] = Array.from(row.querySelectorAll(":scope > p"));
        // 형제는 칸 힌트 · 경고 · 오류 클래스만 — 묶음 뒤의 섹션 전체 한 줄(코드표 `taxRuleHint`)은 칸 힌트가 아니다.
        for (let next = row.nextElementSibling; next && next.tagName === "P"; next = next.nextElementSibling) {
          if (/(^|[_-])(hint|warning|error|registeredHint)([_-]|$)/.test(next.className)) hints.push(next);
        }
        const rowRect = row.getBoundingClientRect();
        const selectRect = select.getBoundingClientRect();
        return {
          id: select.id || (row.textContent ?? "").trim().slice(0, 12),
          rowLeft: rowRect.left,
          rowWidth: rowRect.width,
          labelLeft: labelRect.left,
          labelTop: labelRect.top,
          labelBottom: labelRect.bottom,
          selectLeft: selectRect.left,
          selectTop: selectRect.top,
          selectBottom: selectRect.bottom,
          selectWidth: selectRect.width,
          hintLefts: hints.map((hint) => hint.getBoundingClientRect().left),
        };
      });
  }, scope);
}

type TextFieldRow = { id: string; labelOffset: number; inputLeft: number; hintLefts: number[] };

// 같은 범위의 TextField · Form.Field 행(라벨 열 + 입력)에서 「라벨 글자 위 − 입력 위」를 잰다.
// select 묶음 라벨도 같은 높이에 와야 한 폼 안에서 라벨 줄이 맞는다(PC 전용).
// 행 바로 뒤 형제 힌트(설정 화면)도 잰다 — select 칸 힌트와 같은 x(입력 x)에 와야 한다.
async function measureTextFieldRows(page: Page, scope: string): Promise<TextFieldRow[]> {
  return page.evaluate((scopeSelector) => {
    return Array.from(document.querySelectorAll<HTMLLabelElement>(`${scopeSelector} label[for]`))
      .filter((label) => !label.closest('[class*="selectLabel"]') && label.getClientRects().length > 0)
      .flatMap((label) => {
        const input = document.getElementById(label.htmlFor);
        if (!(input instanceof HTMLInputElement) || input.type === "checkbox" || input.type === "hidden") return [];
        const range = document.createRange();
        range.selectNodeContents(label);
        const hintLefts: number[] = [];
        for (let next = label.parentElement?.nextElementSibling; next && next.tagName === "P"; next = next.nextElementSibling) {
          if (/(^|[_-])(hint|warning|error)([_-]|$)/.test(next.className)) hintLefts.push(next.getBoundingClientRect().left);
        }
        const inputRect = input.getBoundingClientRect();
        return [{ id: input.id, labelOffset: range.getBoundingClientRect().top - inputRect.top, inputLeft: inputRect.left, hintLefts }];
      });
  }, scope);
}

function expectTextFieldHintsUnderInput(page: Page, textFields: TextFieldRow[]): void {
  for (const field of textFields) {
    for (const hintLeft of field.hintLefts) {
      expect(
        Math.abs(hintLeft - field.inputLeft),
        `${field.id} @${page.viewportSize()?.width} TextField 뒤 힌트가 입력과 같은 x`,
      ).toBeLessThanOrEqual(1);
    }
  }
}

async function expectPcLabelColumn(page: Page, scope: string, requireTextFields: boolean): Promise<void> {
  const labelW = await tokenNumber(page, "--label-w");
  const gap = await tokenNumber(page, "--s-2");
  const rows = await measureSelectRows(page, scope);
  expect(rows.length).toBeGreaterThan(0);
  const textFields = await measureTextFieldRows(page, scope);
  if (requireTextFields) expect(textFields.length, `${scope} TextField 칸 있음`).toBeGreaterThan(0);
  expectTextFieldHintsUnderInput(page, textFields);
  for (const { labelOffset } of textFields) {
    for (const row of rows) {
      expect(
        Math.abs(row.labelTop - row.selectTop - labelOffset),
        `${row.id} @${page.viewportSize()?.width} 라벨 글자 높이가 TextField 라벨과 같음`,
      ).toBeLessThanOrEqual(1);
    }
  }
  for (const row of rows) {
    const where = `${row.id} @${page.viewportSize()?.width}`;
    expect(Math.abs(row.labelLeft - row.rowLeft), `${where} 라벨이 묶음 왼쪽`).toBeLessThanOrEqual(1);
    expect(Math.abs(row.selectLeft - row.rowLeft - (labelW + gap)), `${where} select가 라벨 열 뒤`).toBeLessThanOrEqual(1);
    expect(row.labelTop, `${where} 라벨과 select가 한 줄`).toBeGreaterThanOrEqual(row.selectTop - 1);
    expect(row.labelTop, `${where} 라벨과 select가 한 줄`).toBeLessThan(row.selectBottom);
    expect(Math.abs(row.selectWidth - SELECT_W), `${where} select 폭 200`).toBeLessThanOrEqual(1);
    for (const hintLeft of row.hintLefts) {
      expect(Math.abs(hintLeft - row.selectLeft), `${where} 힌트가 select와 같은 x`).toBeLessThanOrEqual(1);
    }
  }
}

async function expectPhoneLabelAbove(page: Page, scope: string): Promise<void> {
  const rows = await measureSelectRows(page, scope);
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    const where = `${row.id} @${page.viewportSize()?.width}`;
    expect(row.selectTop, `${where} 라벨이 select 위`).toBeGreaterThanOrEqual(row.labelBottom - 1);
    expect(Math.abs(row.selectLeft - row.rowLeft), `${where} select가 묶음 왼쪽`).toBeLessThanOrEqual(1);
    expect(Math.abs(row.selectWidth - row.rowWidth), `${where} select 전폭`).toBeLessThanOrEqual(1);
    for (const hintLeft of row.hintLefts) {
      expect(Math.abs(hintLeft - row.rowLeft), `${where} 힌트가 묶음 왼쪽`).toBeLessThanOrEqual(1);
    }
  }
  expectTextFieldHintsUnderInput(page, await measureTextFieldRows(page, scope));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `가로 넘침 @${page.viewportSize()?.width}`).toBeLessThanOrEqual(0);
}

// 사람 상세는 첫 사람의 데이터에 따라 TextField가 없을 수 있어 requireTextFields를 끈다.
async function expectLabelLayoutAtAllWidths(page: Page, scope: string, requireTextFields = true): Promise<void> {
  for (const width of PC_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await expectPcLabelColumn(page, scope, requireTextFields);
  }
  for (const width of PHONE_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await expectPhoneLabelAbove(page, scope);
  }
}

// 2px 강한 선으로 여는 섹션마다 선 아래부터 첫 h2 상자 위까지가 --s-3인지 잰다.
// 잰 섹션 제목을 돌려준다 — 대상 섹션이 빠지지 않았는지 테스트가 고정한다.
async function expectSectionGapBelowLine(page: Page): Promise<string[]> {
  const below = await tokenNumber(page, "--s-3");
  const strong = await tokenNumber(page, "--line-w-strong");
  const gaps = await page.evaluate((strongWidth) => {
    return Array.from(document.querySelectorAll<HTMLElement>("main section"))
      .filter((section) => parseFloat(getComputedStyle(section).borderTopWidth) === strongWidth)
      .flatMap((section) => {
        const heading = section.querySelector("h2");
        if (!heading) return [];
        return [
          {
            title: (heading.textContent ?? "").trim(),
            gap: heading.getBoundingClientRect().top - (section.getBoundingClientRect().top + strongWidth),
          },
        ];
      });
  }, strong);
  expect(gaps.length).toBeGreaterThan(0);
  for (const { title, gap } of gaps) {
    expect(Math.abs(gap - below), `${title} 선 아래 간격 @${page.viewportSize()?.width}`).toBeLessThanOrEqual(0.5);
  }
  return gaps.map(({ title }) => title);
}

async function openFirstPersonDetail(page: Page): Promise<void> {
  await page.goto("/admin/people");
  await page.getByRole("link", { name: "상세" }).first().click();
  await expect(page).toHaveURL(/\/admin\/people\/.+/);
}

test.describe("섹션 2px 선 아래 --s-3 (SYSTEM.md §3)", () => {
  for (const width of [...PC_WIDTHS, ...PHONE_WIDTHS]) {
    test(`설정 화면 섹션 @${width}`, async ({ page }) => {
      await loginAsSysadmin(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/admin/settings");
      const measured = await expectSectionGapBelowLine(page);
      // 설정 섹션은 전부 같은 2px 선 섹션이다 — 하나도 빠지지 않는다.
      expect(measured).toEqual(await page.locator("main section h2").allTextContents());
    });

    test(`사람 상세 섹션(연차 · 소속 발령 이력) @${width}`, async ({ page }) => {
      await loginAsSysadmin(page);
      await page.setViewportSize({ width, height: 900 });
      await openFirstPersonDetail(page);
      const measured = await expectSectionGapBelowLine(page);
      expect(measured).toEqual(expect.arrayContaining(["연차", "소속 발령 이력"]));
    });
  }
});

test.describe("PC 폼 라벨 왼쪽 96 · select 200, 폰은 라벨 위 (SYSTEM.md §6-3 · §7-2 · §7-15)", () => {
  test("사람 상세 계급 변경 · 변경 오류", async ({ page }) => {
    await loginAsSysadmin(page);
    await openFirstPersonDetail(page);
    // 오류 줄(묶음 뒤 형제 `registeredHint`)까지 재려고 없는 계급 id로 바꿔 서버 오류를 낸다 — 계급은 바뀌지 않는다.
    const select = page.locator("#person-role-change");
    await select.evaluate((element: HTMLSelectElement) => {
      const option = document.createElement("option");
      option.value = "e2e-missing-role";
      option.textContent = "없는 계급";
      element.append(option);
    });
    await select.selectOption("e2e-missing-role");
    await expect(page.locator("div:has(> #person-role-change) + p")).toBeVisible();
    await expectLabelLayoutAtAllWidths(page, "main", false);
  });

  test("설정 화면 select 칸", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/settings");
    await expectLabelLayoutAtAllWidths(page, "main");
  });

  const panelForms: Array<{ listPath: string; linkName: string; scope: string }> = [
    { listPath: "/admin/people", linkName: "사람 등록", scope: "#person-form" },
    // 거래처 폼은 04.6-04에서 옆 패널(라벨 위 한 열)로 옮겨 이 격자(라벨 왼쪽 96)가 아니다 — test/e2e/side-panel.spec.ts의 M2가 잰다.
    { listPath: "/admin/corp-cards", linkName: "법인카드 등록", scope: "#corp-card-form" },
    { listPath: "/admin/people/org", linkName: "팀 추가", scope: "#team-form" },
  ];
  for (const { listPath, linkName, scope } of panelForms) {
    test(`${scope} select 칸`, async ({ page }) => {
      await loginAsSysadmin(page);
      await page.goto(listPath);
      await page.getByRole("link", { name: linkName }).first().click();
      await expect(page.locator(scope)).toBeVisible();
      await expectLabelLayoutAtAllWidths(page, scope);
    });
  }

  // 04.6-04(M2 ①): 거래처 폼은 옆 패널 — 모든 폭에서 라벨이 칸 위 · select가 묶음 전폭 · 힌트가 묶음 왼쪽 · 가로 넘침 0
  // (PC 라벨 열 96 격자는 페이지 폼만의 배치다 — SYSTEM §6-3). 폰 측정 도우미를 PC 폭에도 쓴다.
  test("#vendor-form(옆 패널) select 칸 — 모든 폭에서 라벨 위 · 전폭", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/vendors");
    await page.getByRole("link", { name: "거래처 등록" }).first().click();
    await expect(page.locator("#vendor-form")).toBeVisible();
    for (const width of [...PC_WIDTHS, ...PHONE_WIDTHS]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator("#vendor-form")).toBeVisible();
      await expectPhoneLabelAbove(page, "#vendor-form");
    }
  });

  test("코드표 증빙 종류 세금 규칙 select 칸", async ({ page }) => {
    const stamp = randomUUID().slice(0, 8);
    const item = await insertCodeItem(SYSTEM_VIEWER, {
      tableKey: "evidence_type",
      value: `e2e-label-${stamp}`,
      label: `라벨열-${stamp}`,
      sortOrder: 900,
    });
    try {
      await loginAsSysadmin(page);
      await page.goto("/admin/code-tables?tableKey=evidence_type");
      const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: item.value }) });
      const taxRuleRow = row.locator("xpath=following-sibling::tr[1]");
      await taxRuleRow.getByLabel("규칙 종류").selectOption("withholding");
      await expect(taxRuleRow.getByLabel("절사 단위")).toBeVisible();
      await expectLabelLayoutAtAllWidths(page, 'main [class*="taxRuleSection"]');
    } finally {
      await setCodeItemActive(SYSTEM_VIEWER, item.id, false);
    }
  });
});
