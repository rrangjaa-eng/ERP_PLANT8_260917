import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { fieldDefinitions, projects } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertVendor } from "@/repositories/vendors";
import { VIEWPORTS } from "../../scripts/codex-design-review/lib";
import { archiveE2EFieldDefinitions, createE2EFieldDefinition, createE2EProjectEditor } from "./fixtures";
import { expandProjectInfo, projectInfo } from "./project-info-helpers";

// 07.5-02 디자인 검토 증거: Codex 경로 캡처가 놓치는 상태 넷 —
// (a) 등록 패널 추가 칸 N개 (b) 필수 칸 등록 오류 (c) 정보 면 「기본」 구획 끝 추가 칸 읽기 (d) 「고치기」 열림 + 고친(dirty) 추가 칸.
// 폭마다(375 · 320 · 768 · 1280) 전체 화면 PNG `state-<이름>-<폭>.png`와 DOM 표 `measurements-state-<이름>.json`을 DESIGN_CAPTURE_DIR에 남긴다.
// 단언은 상태에 닿았는지 보는 expect뿐이다 — 판정은 독립 DOM 감사 몫(스크린샷 육안 금지).
// 칸은 전용 계급(createE2EProjectEditor)에만 보이게 만들고 끝에 보관한다.

const OUT_DIR = process.env.DESIGN_CAPTURE_DIR;
test.skip(!OUT_DIR, "DESIGN_CAPTURE_DIR이 없으면 캡처하지 않는다 — 디자인 검토 증거용(07.5-02)");

const PREFIX = "E2E캡처프칸";
const LONG_TEXT = "마케팅본부 브랜드팀 이수진 책임 010-0000-0000 평일 오전 통화 가능 · 메일 회신은 다음 날 오전";

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

// 등록 패널 — 구분선 묶음 상자 · 계산 여백, 칸 순서, 라벨 줄 수, 기본 칸 사이 · 추가 칸 사이 · 경계 간격(design F14).
async function measureForm(page: Page, width: number) {
  return page.evaluate((w) => {
    const rect = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, width: Math.round(r.width * 10) / 10, height: Math.round(r.height * 10) / 10 };
    };
    const lines = (el: Element) => {
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
      return Number.isFinite(lineHeight) && lineHeight > 0 ? Math.round(el.getBoundingClientRect().height / lineHeight) : null;
    };
    const form = document.getElementById("project-form");
    const group = form?.querySelector('[data-testid="project-custom-fields"]') ?? null;
    const groupStyle = group ? getComputedStyle(group) : null;
    // 칸 하나 = 폼 안 컨트롤 하나의 줄(TextField 줄 · Form.Field 줄 · 감싸개) + 그 라벨 — 라벨이 줄 밖에 있는 Form.Field(select)도 같은 기준. 숨은 값 · 버튼은 뺀다.
    type Row = { el: Element; top: number; bottom: number };
    const rowsOf = (root: Element | null): Row[] =>
      root
        ? [...root.querySelectorAll("input:not([type=hidden]), select")]
            .map((control) => {
              const el = control.closest('[data-ui="field-row"]') ?? control.parentElement?.closest("div") ?? control;
              const label = control.id ? document.querySelector(`label[for="${CSS.escape(control.id)}"]`) : null;
              const boxes = [el.getBoundingClientRect(), ...(label ? [label.getBoundingClientRect()] : [])];
              return { el, top: Math.min(...boxes.map((b) => b.top)), bottom: Math.max(...boxes.map((b) => b.bottom)) };
            })
            .filter((row, index, all) => all.findIndex((other) => other.el === row.el) === index)
        : [];
    const gaps = (rows: Row[]) => rows.slice(1).map((row, index) => Math.round((row.top - (rows[index]?.bottom ?? 0)) * 10) / 10);
    const customRows = rowsOf(group);
    const baseRows = rowsOf(form).filter((row) => !group?.contains(row.el));
    const lastBase = baseRows.at(-1) ?? null;
    return {
      width: w,
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      groupBox: rect(group),
      groupBorderTop: groupStyle ? `${groupStyle.borderTopWidth} ${groupStyle.borderTopStyle} ${groupStyle.borderTopColor}` : null,
      groupMarginTop: groupStyle?.marginTop ?? null,
      groupPaddingTop: groupStyle?.paddingTop ?? null,
      tokenS6: getComputedStyle(document.documentElement).getPropertyValue("--s-6").trim(),
      tokenS4: getComputedStyle(document.documentElement).getPropertyValue("--s-4").trim(),
      borderRowColor: getComputedStyle(document.documentElement).getPropertyValue("--border-row").trim(),
      customLabels: group ? [...group.querySelectorAll("label")].map((label) => ({ text: label.textContent ?? "", lines: lines(label), box: rect(label) })) : [],
      baseRowBoxes: baseRows.map((row) => ({ el: `${row.el.tagName.toLowerCase()}.${row.el.className}`, top: Math.round(row.top * 10) / 10, bottom: Math.round(row.bottom * 10) / 10 })),
      baseFieldGaps: gaps(baseRows),
      customFieldGaps: gaps(customRows),
      boundaryAbove: lastBase && group ? Math.round((group.getBoundingClientRect().top - lastBase.bottom) * 10) / 10 : null,
      boundaryBelow: group && customRows[0] ? Math.round((customRows[0].top - group.getBoundingClientRect().top) * 10) / 10 : null,
      invalid: [...(form?.querySelectorAll('[aria-invalid="true"]') ?? [])].map((el) => el.id),
      focused: document.activeElement?.id ?? null,
      primaryButtons: document.querySelectorAll("#project-form button[type=submit]").length,
    };
  }, width);
}

// 정보 면 — 구획 수 · 열 수(구획 x 좌표 종류) · 「기본」 구획 칸 줄 순서 · 항목 겹침 · 고친 칸 box-shadow(형제 칸과 비교).
async function measureInfo(page: Page, width: number) {
  return page.evaluate((w) => {
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, width: Math.round(r.width * 10) / 10, height: Math.round(r.height * 10) / 10 };
    };
    const panel = document.getElementById("project-info");
    const sections = panel ? [...panel.querySelectorAll('[role="group"]')] : [];
    const basic = sections.find((section) => section.querySelector("p")?.textContent?.trim() === "기본") ?? null;
    const items = basic ? [...basic.children].filter((child) => child !== basic.firstElementChild) : [];
    const boxes = items.map((item) => item.getBoundingClientRect());
    let overlaps = 0;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (a && b && a.left < b.right && b.left < a.right && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlaps += 1;
      }
    }
    const shadowOf = (selector: string) => {
      const el = panel?.querySelector(selector);
      return el ? getComputedStyle(el).boxShadow : null;
    };
    return {
      width: w,
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      sectionCount: sections.length,
      sectionTitles: sections.map((section) => section.querySelector("p")?.textContent?.trim() ?? ""),
      columnCount: new Set(sections.map((section) => Math.round(section.getBoundingClientRect().left))).size,
      sectionBoxes: sections.map(rect),
      basicItems: items.map((item) => ({ text: (item.textContent ?? "").slice(0, 40), box: rect(item) })),
      basicOverlaps: overlaps,
      customInputShadows: [...(panel?.querySelectorAll("input[id^='cf_'], select[id^='cf_']") ?? [])].map((el) => ({ id: el.id, boxShadow: getComputedStyle(el).boxShadow })),
      siblingNameShadow: shadowOf("#info-name"),
      saveButtons: [...document.querySelectorAll("button")].filter((button) => (button.textContent ?? "").startsWith("일괄 저장")).map((button) => button.textContent),
    };
  }, width);
}

test("프로젝트 추가 칸 상태 — 등록 패널 N칸 · 필수 오류 · 정보 면 읽기 · 고치기 dirty (4폭)", async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const editor = await createE2EProjectEditor();
  const tag = randomUUID().slice(0, 4);
  const place = await createE2EFieldDefinition({ entity: "project", label: `${PREFIX}장소${tag}`, type: "text", required: false, sortOrder: 1, onlyRoleId: editor.roleId });
  const contact = await createE2EFieldDefinition({ entity: "project", label: `${PREFIX}담당자 연락처 메모${tag}`, type: "text", required: false, sortOrder: 2, onlyRoleId: editor.roleId });
  const count = await createE2EFieldDefinition({ entity: "project", label: `${PREFIX}참석 인원 합계 수${tag}`, type: "number", required: false, sortOrder: 3, onlyRoleId: editor.roleId });
  await createE2EFieldDefinition({ entity: "project", label: `${PREFIX}행사일${tag}`, type: "date", required: false, sortOrder: 4, onlyRoleId: editor.roleId });
  const kind = await createE2EFieldDefinition({ entity: "project", label: `${PREFIX}행사 구분${tag}`, type: "select", required: false, options: ["팝업", "전시"], sortOrder: 5, onlyRoleId: editor.roleId });
  const client = await insertVendor(SYSTEM_VIEWER, { name: `캡처프칸고객-${tag}`, normalizedName: `캡처프칸고객-${tag}-${randomUUID()}` });

  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("이메일").fill(editor.email);
  await page.getByLabel("비밀번호").fill(editor.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  try {
    // 정보 면 상태용 프로젝트 — 등록 패널로 만들고 저장값(긴 텍스트 · 보관 선택지 · 빈 칸)을 둔다.
    await page.goto("/projects?new=1");
    await page.locator("#project-form").getByLabel("클라이언트").selectOption({ label: client.name });
    await page.locator("#project-form").getByLabel("프로젝트명").fill(`캡처추가칸-${tag}`);
    await page.locator("#project-form").getByRole("button", { name: "프로젝트 등록" }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    const projectId = page.url().split("/").at(-1) ?? "";
    await db
      .update(projects)
      .set({ customFields: { [place.key]: "서울 코엑스 C홀", [contact.key]: LONG_TEXT, [count.key]: 1250.5, [kind.key]: "로드쇼" } })
      .where(eq(projects.id, projectId));
    await db.update(fieldDefinitions).set({ archivedOptions: ["로드쇼"] }).where(eq(fieldDefinitions.id, kind.id));

    // (a) 등록 패널 칸 N개
    const formRows: unknown[] = [];
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto("/projects?new=1");
      await expect(page.getByTestId("project-custom-fields")).toBeVisible();
      await shot(page, "form", viewport.width);
      formRows.push(await measureForm(page, viewport.width));
    }
    save("form", formRows);

    // (b) 필수 칸 등록 오류 — 이 상태만 필수 칸을 켠다.
    await db.update(fieldDefinitions).set({ required: true }).where(eq(fieldDefinitions.id, place.id));
    const errorRows: unknown[] = [];
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto("/projects?new=1");
      const form = page.locator("#project-form");
      await form.getByLabel("클라이언트").selectOption({ label: client.name });
      await form.getByLabel("프로젝트명").fill(`캡처오류-${tag}`);
      await form.getByLabel(`${PREFIX}행사일${tag}`, { exact: true }).fill("2026-11-04");
      await form.getByRole("button", { name: "프로젝트 등록" }).click();
      await expect(form.getByText(/^등록 실패 · .+ 1칸$/)).toBeVisible();
      await shot(page, "form-error", viewport.width);
      errorRows.push(await measureForm(page, viewport.width));
    }
    save("form-error", errorRows);
    await db.update(fieldDefinitions).set({ required: false }).where(eq(fieldDefinitions.id, place.id));

    // (c) 정보 면 읽기 · (d) 고치기 열림 + 고친 칸(추가 칸 하나 · 형제 행사명 하나)
    const readRows: unknown[] = [];
    const editRows: unknown[] = [];
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.goto(`/projects/${projectId}`);
      await expandProjectInfo(page);
      await expect(projectInfo(page).getByText("서울 코엑스 C홀")).toBeVisible();
      await shot(page, "info-read", viewport.width);
      readRows.push(await measureInfo(page, viewport.width));

      const edit = projectInfo(page).getByRole("button", { name: "고치기", exact: true });
      await edit.click();
      await projectInfo(page).getByLabel(`${PREFIX}장소${tag}`, { exact: true }).fill("부산 벡스코");
      await projectInfo(page).getByLabel("행사명", { exact: true }).fill(`캡처추가칸-${tag}-고침`);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await shot(page, "info-edit", viewport.width);
      editRows.push(await measureInfo(page, viewport.width));
      await projectInfo(page).getByRole("button", { name: "고치기 취소", exact: true }).click();
    }
    save("info-read", readRows);
    save("info-edit", editRows);
  } finally {
    await context.close();
  }
});
