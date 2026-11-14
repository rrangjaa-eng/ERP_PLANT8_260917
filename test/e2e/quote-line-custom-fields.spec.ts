import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects, quoteLines, users } from "@/db/schema";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertVendor } from "@/repositories/vendors";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { archiveE2EFieldDefinitions, createE2EFieldDefinition, createE2EProjectEditor, createFixtureUser, waitForCardUsageSection } from "./fixtures";

// 07.5-03(S4 · D-7504 · D-7517 · D-7518 · D-7521 · D-7525) — 견적 줄 표의 추가 칸 열. 칸은 전용 계급(createE2EProjectEditor)에만
// 보이게 만든다 — 다른 워커의 견적 줄 저장이 필수 칸에 막히지 않게.
const LABEL_PREFIX = "E2E견칸";

test.afterAll(async () => {
  await archiveE2EFieldDefinitions(LABEL_PREFIX);
});

type FieldInput = { label: string; type: "text" | "number" | "date" | "select"; required?: boolean; options?: string[]; sortOrder: number };

async function login(page: Page, account: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

// 전용 계급 담당 PM의 프로젝트 · 줄(값은 DB에 직접) · 칸. 칸 값 객체의 키는 칸 이름 → 실제 키로 바꿔 넣는다.
async function setup(fields: FieldInput[], lines: { itemName: string; values?: Record<string, unknown> }[]) {
  const editor = await createE2EProjectEditor();
  const keys: Record<string, string> = {};
  for (const field of fields) {
    const created = await createE2EFieldDefinition({ entity: "quote_line", onlyRoleId: editor.roleId, required: field.required ?? false, ...field });
    keys[field.label] = created.key;
  }
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, editor.email));
  if (!user || !editor.teamId) throw new Error("편집자 준비 실패");
  const tag = randomUUID().slice(0, 8);
  const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E견칸고객-${tag}`, normalizedName: `e2e견칸고객-${tag}` });
  const projectName = `E2E견칸-${tag}`;
  const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: editor.teamId, pmUserId: user.id, name: projectName });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("1차 차수 없음");
  const ids = lines.map(() => randomUUID());
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: lines.map((line, index) => ({
      id: ids[index]!,
      isNew: true as const,
      subcategory: "stage_construction",
      itemName: line.itemName,
      unitPrice: { currency: "KRW" as const, amount: 1000, fxRate: 1 },
      execution: { currency: "KRW" as const, amount: 0, fxRate: 1 },
    })),
  });
  for (const [index, line] of lines.entries()) {
    if (!line.values) continue;
    const customFields = Object.fromEntries(Object.entries(line.values).map(([label, value]) => [keys[label]!, value]));
    await db.update(quoteLines).set({ customFields }).where(eq(quoteLines.id, ids[index]!));
  }
  return { editor, project, projectName, keys, ids };
}

async function openProject(page: Page, projectId: string, projectName: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
  await waitForCardUsageSection(page);
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

async function headers(page: Page): Promise<string[]> {
  return (await quoteTable(page).locator("thead th").allInnerTexts()).map((text) => text.trim());
}

async function headerIndex(page: Page, name: string): Promise<number> {
  const all = await headers(page);
  const index = all.indexOf(name);
  if (index === -1) throw new Error(`머리글 ${name} 없음: ${all.join(" | ")}`);
  return index;
}

function isServerAction(request: { method: () => string; headers: () => Record<string, string> }) {
  return request.method() === "POST" && request.headers()["next-action"] !== undefined;
}

async function openEditor(page: Page, cell: Locator, control = "input") {
  await expect(async () => {
    await cell.focus();
    await page.keyboard.press("Enter");
    await expect(cell.locator(control)).toBeFocused({ timeout: 1000 });
  }).toPass();
}

async function editTextCell(page: Page, cell: Locator, text: string) {
  await openEditor(page, cell);
  await page.keyboard.press("Control+a");
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

async function pasteInto(page: Page, cell: Locator, text: string) {
  await cell.focus();
  await expect(cell).toBeFocused();
  await expect(cell).toHaveAttribute("data-grid-focus", "");
  await page.evaluate((clipboardText) => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", clipboardText);
    document.activeElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, text);
}

async function saveAndWait(page: Page) {
  const saved = page.waitForResponse((response) => isServerAction(response.request()));
  await page.getByRole("button", { name: /일괄 저장/ }).click();
  await saved;
}

const DIRTY = /linear-gradient/;

test.describe("견적 줄 추가 칸 열 (S4)", () => {
  test("텍스트 칸 하나: 중분류 뒤 · 행동 앞 머리글 → 셀 입력 · dirty · 일괄 저장 1 → 새로 고침 뒤 그대로 · 칸 안 보이는 계급 머리글 DOM 0 · 완료면 aria-readonly", async ({ page }) => {
    const label = `${LABEL_PREFIX}규격${randomUUID().slice(0, 4)}`;
    const fx = await setup([{ label, type: "text", sortOrder: 1 }], [{ itemName: "무대 줄" }, { itemName: "조명 줄" }]);

    await login(page, fx.editor);
    await openProject(page, fx.project.id, fx.projectName);
    const all = await headers(page);
    expect(all.indexOf(label)).toBe(all.indexOf("중분류") + 1);
    // 행동 열(있으면)은 추가 칸 뒤 맨 끝이다.
    expect(all.slice(all.indexOf(label) + 1).every((text) => text === "행동")).toBe(true);

    const column = await headerIndex(page, label);
    const cell = quoteCell(page, 0, column);
    await editTextCell(page, cell, "LED 3x2m");
    await expect(cell).toHaveText("LED 3x2m");
    await expect(cell).toHaveCSS("background-image", DIRTY);
    // 추가 칸만 고친 줄 — 소분류 칸의 줄 단위 표시는 서지 않는다(고친 셀이 따로 보인다).
    await expect(quoteCell(page, 0, 1)).toHaveCSS("background-image", "none");
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();
    await saveAndWait(page);
    await expect(page.getByText(/저장됨/)).toBeVisible();

    await page.reload();
    await expect(quoteCell(page, 0, await headerIndex(page, label))).toHaveText("LED 3x2m");
    await expect(quoteCell(page, 1, await headerIndex(page, label))).toHaveText("—");

    // 완료 프로젝트 — 내부 비고와 같이 잠김: 편집 칸이 하나도 없어 표 전체가 읽기 표(gridcell 0) · 값은 그대로.
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, fx.project.id));
    await page.reload();
    await expect(quoteTable(page).locator("thead th", { hasText: label })).toHaveCount(1);
    await expect(quoteTable(page).locator('td[role="gridcell"]')).toHaveCount(0);
    await expect(quoteTable(page).locator("tbody tr", { hasText: "LED 3x2m" })).toHaveCount(1);

    // 시드 계급(칸 노출 행 없음) 같은 팀 사용자 — 열 자체가 없다.
    const seeded = await createFixtureUser({ roleId: DEFAULT_ROLE_ID, teamId: fx.editor.teamId! });
    await page.context().clearCookies();
    await login(page, seeded);
    await openProject(page, fx.project.id, fx.projectName);
    await expect(quoteTable(page).locator("thead th", { hasText: label })).toHaveCount(0);
  });

  test("칸 넷(텍스트 · 선택 · 날짜 · 넷째 숫자 필수): 머리글 앞 셋 · Ctrl+Enter 새 줄 저장 · 날짜 · 선택 붙여넣기 오류 셀(서버 호출 없음) · TSV 복사 · Ctrl+D 복제", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const tag = randomUUID().slice(0, 4);
    const spec = `${LABEL_PREFIX}규격${tag}`;
    const kind = `${LABEL_PREFIX}구분${tag}`;
    const day = `${LABEL_PREFIX}반입일${tag}`;
    const height = `${LABEL_PREFIX}높이${tag}`;
    const fx = await setup(
      [
        { label: spec, type: "text", sortOrder: 1 },
        { label: kind, type: "select", options: ["실내", "실외"], sortOrder: 2 },
        { label: day, type: "date", sortOrder: 3 },
        { label: height, type: "number", required: true, sortOrder: 4 },
      ],
      [{ itemName: "무대 줄", values: { [spec]: "규격 원본", [kind]: "옛 구분", [day]: "2026-11-04T00:00:00.000Z", [height]: 3 } }, { itemName: "조명 줄" }],
    );

    await login(page, fx.editor);
    await openProject(page, fx.project.id, fx.projectName);
    const all = await headers(page);
    const first = all.indexOf("중분류") + 1;
    expect(all.slice(first, first + 3)).toEqual([spec, kind, day]);
    expect(all).not.toContain(height);
    await expect(quoteCell(page, 0, first + 1)).toHaveText("옛 구분 (보관됨)");
    await expect(quoteCell(page, 0, first + 2)).toHaveText("2026-11-04");

    // TSV — 논리 열 순서 · 보관 선택지는 값 글자만. 앱 형식 메타에는 추가 칸 값이 없다(UI-SPEC A13).
    await page.evaluate(() => {
      window.addEventListener("copy", (event) => {
        (window as unknown as { __appMeta: string }).__appMeta = event.clipboardData?.getData("application/x-plant8-quote-lines+json") ?? "";
      });
    });
    await quoteCell(page, 0, first).focus();
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Control+c");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("규격 원본\t옛 구분\t2026-11-04");
    expect(await page.evaluate(() => (window as unknown as { __appMeta: string }).__appMeta)).not.toContain("규격 원본");
    await page.keyboard.press("Escape");

    // 날짜 붙여넣기 2026-02-31 · 선택 붙여넣기 없는값 → 오류 셀 · 저장은 서버 호출 없이 전부 거부.
    let actions = 0;
    page.on("request", (request) => {
      if (isServerAction(request)) actions++;
    });
    await pasteInto(page, quoteCell(page, 1, first + 2), "2026-02-31");
    await expect(quoteCell(page, 1, first + 2)).toHaveAttribute("aria-invalid", "true");
    await expect(quoteCell(page, 1, first + 2)).toContainText("날짜 아님 · 2026-11-04처럼");
    await pasteInto(page, quoteCell(page, 1, first + 1), "없는값");
    await expect(quoteCell(page, 1, first + 1)).toContainText("목록에 없는 값 · 없는값");
    await page.getByRole("button", { name: /일괄 저장/ }).click();
    await page.waitForTimeout(500); // 부정 단언 — 요청이 나가지 않음을 잠시 지켜본다.
    expect(actions).toBe(0);
    // 오류 셀을 고쳐 둔다(맞는 값 붙여넣기).
    await pasteInto(page, quoteCell(page, 1, first + 2), " 2026-12-01 ");
    await pasteInto(page, quoteCell(page, 1, first + 1), "실외");
    await expect(quoteTable(page).locator('td[aria-invalid="true"]')).toHaveCount(0);

    // Ctrl+D — 원본 칸 값(보관 선택지는 빈 셀)이 복제 줄로. Ctrl+Enter 새 줄 — 넷째 필수 칸이 막지 않는다(D-7525).
    await quoteCell(page, 0, 2).focus();
    await page.keyboard.press("Control+d");
    await expect(quoteDataRows(page)).toHaveCount(3);
    await expect(quoteCell(page, 1, first)).toHaveText("규격 원본");
    await expect(quoteCell(page, 1, first + 1)).toHaveText("—");
    await expect(quoteCell(page, 1, first + 2)).toHaveText("2026-11-04");
    await quoteCell(page, 2, 2).focus();
    await page.keyboard.press("Control+Enter");
    await expect(quoteDataRows(page)).toHaveCount(4);
    await editTextCell(page, quoteCell(page, 3, 2), "새 줄 항목");
    await saveAndWait(page);
    await expect(page.getByText(/저장됨/)).toBeVisible();

    await page.reload();
    await expect(quoteDataRows(page)).toHaveCount(4);
    await expect(quoteCell(page, 1, first + 2)).toHaveText("2026-11-04");
    await expect(quoteCell(page, 2, first + 2)).toHaveText("2026-12-01");
    await expect(quoteCell(page, 2, first + 1)).toHaveText("실외");
    // 원본 줄의 넷째 칸 저장값은 그대로(화면이 그 키를 보내지 않는다).
    const [original] = await db.select({ customFields: quoteLines.customFields }).from(quoteLines).where(eq(quoteLines.id, fx.ids[0]!));
    expect((original?.customFields as Record<string, unknown>)[fx.keys[height]!]).toBe(3);
  });

  test("숫자 칸만 보이는 계급(첫 열 · 필수): 우측 · 쉼표 · Ctrl+D 복제 저장 뒤 같은 글자 · 새 줄 빈 필수 칸 오류 셀", async ({ page }) => {
    const label = `${LABEL_PREFIX}수치${randomUUID().slice(0, 4)}`;
    const fx = await setup([{ label, type: "number", required: true, sortOrder: 1 }], [{ itemName: "숫자 줄", values: { [label]: 1234.5 } }]);

    await login(page, fx.editor);
    await openProject(page, fx.project.id, fx.projectName);
    const column = await headerIndex(page, label);
    await expect(quoteCell(page, 0, column)).toHaveText("1,234.5");
    await expect(quoteCell(page, 0, column)).toHaveCSS("text-align", "right");

    await quoteCell(page, 0, 2).focus();
    await page.keyboard.press("Control+d");
    await expect(quoteCell(page, 1, column)).toHaveText("1,234.5");
    await saveAndWait(page);
    await expect(page.getByText(/저장됨/)).toBeVisible();
    await page.reload();
    await expect(quoteCell(page, 1, await headerIndex(page, label))).toHaveText("1,234.5");

    // 새 줄 — 첫 열 필수 칸이 비면 오류 셀 + 합계 행 `오류 1칸 · 전부 거부`.
    await quoteCell(page, 1, 2).focus();
    await page.keyboard.press("Control+Enter");
    await editTextCell(page, quoteCell(page, 2, 2), "필수 빈 새 줄");
    await saveAndWait(page);
    const invalid = quoteCell(page, 2, await headerIndex(page, label));
    await expect(invalid).toHaveAttribute("aria-invalid", "true");
    await expect(invalid).toContainText("필수 칸 비어 있음 · 값 입력");
    await expect(quoteTable(page).locator("tfoot")).toContainText("오류 1칸 · 전부 거부");

    // 숫자 아닌 글자 붙여넣기 → 일수 칸과 같은 이유 글자(07.2-06).
    await pasteInto(page, invalid, "abc");
    await expect(invalid).toContainText("숫자 아님 · 1.5처럼");
  });

  test("추가 칸만 고친 뒤 새로 고침 → 복원하면 그 셀이 dirty · 저장 요청 중 형제 셀과 같이 편집이 열리지 않는다 · 폰 375 머리글 0 · 행 시트 값", async ({ page }) => {
    const label = `${LABEL_PREFIX}메모${randomUUID().slice(0, 4)}`;
    const fx = await setup([{ label, type: "text", sortOrder: 1 }], [{ itemName: "복원 줄", values: { [label]: "처음 값" } }]);

    await login(page, fx.editor);
    await openProject(page, fx.project.id, fx.projectName);
    const column = await headerIndex(page, label);
    await editTextCell(page, quoteCell(page, 0, column), "복원할 값");
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();
    await page.reload();
    await expect(page.getByText(/^저장 안 한 편집 \d+칸$/)).toBeVisible();
    await page.getByRole("button", { name: "복원", exact: true }).click();
    const cell = quoteCell(page, 0, column);
    await expect(cell).toHaveText("복원할 값");
    await expect(cell).toHaveCSS("background-image", DIRTY);
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();

    // 저장 요청을 붙잡는 동안 — 추가 칸 셀도 내부 비고 셀처럼 편집기가 열리지 않는다.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (isServerAction(request) && (request.postData() ?? "").includes("seenStatus")) await held;
      await route.continue();
    });
    await page.getByRole("button", { name: /일괄 저장/ }).click();
    await expect(page.getByRole("button", { name: /일괄 저장/ })).toContainText("…");
    for (const index of [column, await headerIndex(page, "내부 비고")]) {
      await quoteCell(page, 0, index).focus();
      await page.keyboard.press("Enter");
      await expect(quoteCell(page, 0, index).locator("input")).toHaveCount(0);
    }
    release();
    await expect(page.getByText(/저장됨/)).toBeVisible();
    await expect(cell).toHaveText("복원할 값");
    await page.unroute("**/*");

    await page.setViewportSize({ width: 375, height: 800 });
    await page.reload();
    await expect(quoteTable(page).getByRole("columnheader", { name: label })).toHaveCount(0);
    await page.getByRole("button", { name: "복원 줄 상세 보기" }).click();
    const sheet = page.getByRole("dialog", { name: "복원 줄" });
    await expect(sheet).toContainText(label);
    await expect(sheet).toContainText("복원할 값");
  });
});
