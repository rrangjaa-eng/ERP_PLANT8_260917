import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertVendor } from "@/repositories/vendors";
import { VIEWPORTS } from "../../scripts/codex-design-review/lib";
import { archiveE2EFieldDefinitions, createE2EFieldDefinition, createE2EVendorEditor } from "./fixtures";

// 07.5-01 디자인 검토 증거: Codex 경로 캡처가 놓치는 상태 셋 —
// (a) 폰 375 · 320의 접힌 줄(추가 칸 값이 P2 줄에 이어진 거래처 행) (b) 검색어 = 추가 칸 값 (c) 「지역」 선택 칸 거르개를 고른 목록.
// 폭마다(375 · 320 · 768 · 1280) 전체 화면 PNG `state-<이름>-<폭>.png`와 DOM 표 `measurements-state-<이름>.json`을 DESIGN_CAPTURE_DIR에 남긴다.
// 단언은 상태에 닿았는지 보는 expect뿐이다 — 판정은 독립 DOM 감사 몫(스크린샷 육안 금지).
// 칸은 전용 계급(createE2EVendorEditor)에만 보이게 만들고 끝에 보관한다 — 다른 워커의 거래처 표를 흔들지 않는다.

const OUT_DIR = process.env.DESIGN_CAPTURE_DIR;
test.skip(!OUT_DIR, "DESIGN_CAPTURE_DIR이 없으면 캡처하지 않는다 — 디자인 검토 증거용(07.5-01)");

const PREFIX = "E2E캡처칸";
const LONG_TEXT = "서울 본사 영업 2팀 김 대리와 먼저 통화하고 안 받으면 메신저로 연락 후 다음 날 오전에 다시 확인하는 순서로 진행";

test.afterAll(async () => {
  await archiveE2EFieldDefinitions(PREFIX);
});

function save(name: string, rows: unknown[]): void {
  if (!OUT_DIR) return;
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `measurements-state-${name}.json`), JSON.stringify(rows, null, 2));
}

async function shot(page: Page, name: string, suffix: string | number): Promise<void> {
  if (!OUT_DIR) return;
  mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({ path: join(OUT_DIR, `state-${name}-${suffix}.png`), fullPage: true });
}

async function measure(page: Page, width: number, headerLabels: string[]) {
  return page.evaluate(
    ({ w, labels }) => {
      const box = (el: Element | null) => {
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { x: Math.round(rect.x * 10) / 10, y: Math.round(rect.y * 10) / 10, width: Math.round(rect.width * 10) / 10, height: Math.round(rect.height * 10) / 10 };
      };
      const headers = [...document.querySelectorAll("thead th")];
      const rootStyle = getComputedStyle(document.documentElement);
      const fieldWidth = parseFloat(rootStyle.getPropertyValue("--field-w-select")) || 200;
      const lineCount = (el: Element) => {
        const style = getComputedStyle(el);
        const lineHeight = parseFloat(style.lineHeight);
        return Number.isFinite(lineHeight) && lineHeight > 0 ? Math.round(el.getBoundingClientRect().height / lineHeight) : null;
      };
      return {
        width: w,
        innerWidth: window.innerWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        fieldWidthToken: fieldWidth,
        headerLabels: headers.map((th) => (th.textContent ?? "").trim()),
        customHeaders: labels.map((label) => {
          const th = headers.find((h) => (h.textContent ?? "").trim() === label) ?? null;
          return { label, box: box(th), lines: th ? lineCount(th) : null, textOverflow: th ? getComputedStyle(th).textOverflow : null, textAlign: th ? getComputedStyle(th).textAlign : null, whiteSpace: th ? getComputedStyle(th).whiteSpace : null };
        }),
        textCells: [...document.querySelectorAll("tbody td span")]
          .filter((span) => getComputedStyle(span).display === "block" && getComputedStyle(span).maxWidth !== "none")
          .map((span) => ({ text: (span.textContent ?? "").slice(0, 20), width: box(span)?.width ?? null, maxWidth: getComputedStyle(span).maxWidth, textOverflow: getComputedStyle(span).textOverflow, lines: lineCount(span) })),
        collapsedRows: [...document.querySelectorAll("tbody tr")]
          .filter((tr) => tr.querySelector("td[colspan]"))
          .map((tr) => {
            const cell = tr.querySelector("td[colspan]") as HTMLElement;
            return { box: box(cell), lines: lineCount(cell), scrollWidth: cell.scrollWidth, clientWidth: cell.clientWidth, textOverflow: getComputedStyle(cell).textOverflow, text: (cell.textContent ?? "").slice(0, 60) };
          }),
        filters: [...document.querySelectorAll("form select")].map((select) => ({ id: select.id, box: box(select), label: document.querySelector(`label[for="${select.id}"]`)?.textContent ?? null })),
        numberCells: headers.flatMap((th, index) =>
          labels.includes((th.textContent ?? "").trim()) && (th.textContent ?? "").includes("점수")
            ? [...document.querySelectorAll("tbody tr:not(:has(td[colspan]))")].map((tr) => {
                const td = tr.children[index] as HTMLElement | undefined;
                return td ? { text: (td.textContent ?? "").trim(), textAlign: getComputedStyle(td).textAlign, tabularNums: getComputedStyle(td.querySelector("span") ?? td).fontVariantNumeric } : null;
              })
            : [],
        ),
        rowCount: document.querySelectorAll("tbody tr:not(:has(td[colspan]))").length,
      };
    },
    { w: width, labels: headerLabels },
  );
}

test("거래처 목록 추가 칸 상태 · 접힌 줄 · 검색 결과 · 거르개 고른 목록 (4폭)", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const editor = await createE2EVendorEditor();
  const textLabel = `${PREFIX}연락 경로 메모 칸${randomUUID().slice(0, 4)}`;
  const dateLabel = `${PREFIX}계약 만료일${randomUUID().slice(0, 4)}`;
  const scoreLabel = `${PREFIX}누적 거래 점수 합계${randomUUID().slice(0, 3)}`;
  const regionLabel = `${PREFIX}지역${randomUUID().slice(0, 4)}`;
  const text = await createE2EFieldDefinition({ label: textLabel, type: "text", required: false, onlyRoleId: editor.roleId, sortOrder: 1 });
  const date = await createE2EFieldDefinition({ label: dateLabel, type: "date", required: false, onlyRoleId: editor.roleId, sortOrder: 2 });
  const score = await createE2EFieldDefinition({ label: scoreLabel, type: "number", required: false, onlyRoleId: editor.roleId, sortOrder: 3 });
  const region = await createE2EFieldDefinition({ label: regionLabel, type: "select", required: false, options: ["서울", "부산"], onlyRoleId: editor.roleId, sortOrder: 4 });
  const tag = randomUUID().slice(0, 6);
  const needle = `찾을값${tag}`;
  const rows: Array<[string, Record<string, unknown>]> = [
    [`캡처칸긴${tag}`, { [text.key]: `${needle} ${LONG_TEXT}`, [date.key]: "2026-11-04", [score.key]: 1234.5, [region.key]: "서울" }],
    [`캡처칸수식${tag}`, { [text.key]: "=SUM(A1)", [region.key]: "부산", [score.key]: 80 }],
    [`캡처칸없음${tag}`, {}],
  ];
  for (const [name, customFields] of rows) {
    await insertVendor(SYSTEM_VIEWER, { name, normalizedName: name, customFields });
  }
  const labels = [textLabel, dateLabel, scoreLabel];

  const states: Array<{ name: string; path: string }> = [
    { name: "collapsed", path: "/admin/vendors" },
    { name: "search", path: `/admin/vendors?q=${encodeURIComponent(needle)}` },
    { name: "filter", path: `/admin/vendors?cf_${region.key}=${encodeURIComponent("서울")}` },
  ];
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("이메일").fill(editor.email);
  await page.getByLabel("비밀번호").fill(editor.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  try {
    for (const state of states) {
      const measured: unknown[] = [];
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport);
        await page.goto(state.path);
        await expect(page.locator("thead th", { hasText: textLabel })).toHaveCount(1);
        await expect(page.locator("tbody tr", { hasText: `캡처칸긴${tag}` }).first()).toBeVisible();
        if (state.name !== "collapsed") await expect(page.locator("tbody tr", { hasText: `캡처칸없음${tag}` })).toHaveCount(0);
        await shot(page, state.name, viewport.width);
        measured.push(await measure(page, viewport.width, labels));
      }
      save(state.name, measured);
    }
  } finally {
    await page.context().close();
  }
});
