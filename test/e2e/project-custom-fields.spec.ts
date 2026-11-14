import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { fieldDefinitions, projects } from "@/db/schema";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { customFieldInfoItem } from "@/domain/custom-fields/targets";
import { archiveE2EFieldDefinitions, createE2EFieldDefinition, createE2EProjectEditor, createFixtureUser } from "./fixtures";
import { expandProjectInfo, projectInfo } from "./project-info-helpers";

// 07.5-02(S2 · S3 · D-7504 · D-7508) — 프로젝트 등록 패널 추가 칸 묶음 · 정보 면 「기본」 구획 끝 추가 칸 줄.
// 칸은 전용 계급(createE2EProjectEditor)에만 보이게 만든다 — 다른 워커의 등록이 필수 칸에 막히지 않게.
const LABEL_PREFIX = "E2E프칸";

test.afterAll(async () => {
  await archiveE2EFieldDefinitions(LABEL_PREFIX);
});

async function login(page: Page, account: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function newClient() {
  return insertVendor(SYSTEM_VIEWER, { name: `E2E추가칸고객-${randomUUID().slice(0, 8)}`, normalizedName: `e2e추가칸고객-${randomUUID()}` });
}

async function openCreatePanel(page: Page, clientName: string, projectName: string) {
  expect((await page.goto("/projects?new=1"))?.status()).toBe(200);
  const form = page.locator("#project-form");
  await form.getByLabel("클라이언트").selectOption({ label: clientName });
  await form.getByLabel("프로젝트명").fill(projectName);
  return form;
}

function infoGroup(page: Page, name: string) {
  return projectInfo(page).getByRole("group", { name, exact: true });
}

test.describe("프로젝트 추가 칸 (S2 · S3)", () => {
  test("텍스트 칸 하나: 등록 패널 구분선 아래 입력 → 저장 → 정보 면 「기본」 구획 PO 번호 뒤 줄 · 칸 안 보이는 계급은 묶음 · 줄 DOM 0", async ({ page }) => {
    const tag = randomUUID().slice(0, 6);
    const editor = await createE2EProjectEditor();
    const place = `${LABEL_PREFIX}장소${tag}`;
    const placeField = await createE2EFieldDefinition({ entity: "project", label: place, type: "text", required: false, onlyRoleId: editor.roleId });
    const client = await newClient();
    const projectName = `E2E추가칸-${tag}`;

    await login(page, editor);
    const form = await openCreatePanel(page, client.name, projectName);
    const group = form.getByTestId("project-custom-fields");
    await expect(group).toHaveCount(1);
    await group.getByLabel(place, { exact: true }).fill("서울 코엑스");
    await form.getByRole("button", { name: "프로젝트 등록" }).click();

    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    await expandProjectInfo(page);
    const basic = infoGroup(page, "기본");
    const rows = basic.locator(":scope > p");
    const texts = await rows.allInnerTexts();
    const poIndex = texts.findIndex((text) => text.startsWith("PO 번호"));
    const placeIndex = texts.findIndex((text) => text.startsWith(place));
    expect(poIndex).toBeGreaterThanOrEqual(0);
    expect(placeIndex).toBe(poIndex + 1);
    await expect(rows.nth(placeIndex)).toContainText("서울 코엑스");
    // 새 구획 · 제목 없음(design B5) — 정보 면 구획은 기본 · 고객 승인(· 손익)뿐.
    await expect(projectInfo(page).getByText("추가 항목")).toHaveCount(0);
    expect(await projectInfo(page).locator("[role=group]").count()).toBeLessThanOrEqual(3);

    // 이어서(첫 등록 뒤) 같은 계급에만 보이는 필수 칸 — 그 칸만 비운 등록은 이유 자리 `등록 실패 · {칸 이름} 1칸`(eng r2 N2).
    const required = `${LABEL_PREFIX}필수${tag}`;
    await createE2EFieldDefinition({ entity: "project", label: required, type: "text", required: true, sortOrder: 2, onlyRoleId: editor.roleId });
    const second = await openCreatePanel(page, client.name, `${projectName}-2`);
    await second.getByRole("button", { name: "프로젝트 등록" }).click();
    await expect(second.getByText(`등록 실패 · ${required} 1칸`, { exact: true })).toBeVisible();
    await expect(second.getByText("undefined")).toHaveCount(0);
    await expect(second.getByLabel(required, { exact: true })).toBeFocused();
    await second.getByLabel(required, { exact: true }).fill("값");
    await second.getByRole("button", { name: "프로젝트 등록" }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);

    // 칸 노출 행이 없는 시드 계급 — 등록 패널 묶음 0 · 정보 면 줄 0(저장값이 있어도 DTO에서 빠진다).
    const seeded = await createFixtureUser({ roleId: DEFAULT_ROLE_ID, withTeam: true });
    const context = await page.context().browser()?.newContext();
    if (!context) throw new Error("브라우저 없음");
    const other = await context.newPage();
    await login(other, seeded);
    const otherForm = await openCreatePanel(other, client.name, `${projectName}-seeded`);
    await expect(otherForm.getByTestId("project-custom-fields")).toHaveCount(0);
    await otherForm.getByRole("button", { name: "프로젝트 등록" }).click();
    await expect(other).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    const otherId = other.url().split("/").at(-1) ?? "";
    await db.update(projects).set({ customFields: { [placeField.key]: "숨은 장소 값" } }).where(eq(projects.id, otherId));
    await other.reload();
    await expandProjectInfo(other);
    await expect(projectInfo(other).getByText(place)).toHaveCount(0);
    await expect(other.getByText("숨은 장소 값")).toHaveCount(0);
    expect(await other.content()).not.toContain("숨은 장소 값");
    await context.close();
  });

  test("정보 면 고치기: 추가 칸 dirty = 형제 칸 규칙 · 일괄 저장 N · Esc 두 단계 · Ctrl+S 저장 · 고칠 권리 없는 계정은 입력 DOM 0", async ({ page }) => {
    const tag = randomUUID().slice(0, 6);
    const editor = await createE2EProjectEditor();
    const memo = `${LABEL_PREFIX}메모${tag}`;
    const memoField = await createE2EFieldDefinition({ entity: "project", label: memo, type: "text", required: false, onlyRoleId: editor.roleId });
    const client = await newClient();

    await login(page, editor);
    const form = await openCreatePanel(page, client.name, `E2E추가칸고치기-${tag}`);
    await form.getByTestId("project-custom-fields").getByLabel(memo, { exact: true }).fill("처음 메모");
    await form.getByRole("button", { name: "프로젝트 등록" }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    const projectId = page.url().split("/").at(-1) ?? "";

    await expandProjectInfo(page);
    await projectInfo(page).getByRole("button", { name: "고치기", exact: true }).click();
    const input = infoGroup(page, "기본").getByLabel(memo, { exact: true });
    await expect(input).toHaveValue("처음 메모");
    const name = projectInfo(page).getByLabel("행사명", { exact: true });
    await expect(name).toBeVisible();

    await input.fill("바뀐 메모");
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();
    await name.fill(`E2E추가칸고치기-${tag}-새`);
    await expect(page.getByRole("button", { name: /일괄 저장 2/ })).toBeVisible();
    const shadow = async (locator: typeof input) => locator.evaluate((element) => getComputedStyle(element).boxShadow);
    // 포커스 표시가 섞이지 않게 포커스만 뺀다(화면을 누르지 않는다 — 좌상단은 워드마크 링크다).
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    expect(await shadow(input)).not.toBe("none");
    expect(await shadow(input)).toBe(await shadow(name));

    // Esc 두 단계(SYSTEM.md 개정 6 · design r2 R2-B2) — 첫 Esc는 값 원복 · 묶음 열림 그대로, 둘째 Esc는 닫기.
    await input.press("Escape");
    await expect(input).toHaveValue("처음 메모");
    await expect(page.getByRole("button", { name: /일괄 저장 \d/ })).toHaveCount(0);
    await expect(projectInfo(page).getByRole("button", { name: "고치기 취소", exact: true })).toBeVisible();
    await input.press("Escape");
    await expect(projectInfo(page).getByRole("button", { name: "고치기", exact: true })).toBeVisible();
    await expect(infoGroup(page, "기본").getByText("처음 메모")).toBeVisible();

    await projectInfo(page).getByRole("button", { name: "고치기", exact: true }).click();
    // 아래 복원 시험과 같이 — `고치기`의 포커스 프레임(requestAnimationFrame)이 지난 뒤 친다.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    await infoGroup(page, "기본").getByLabel(memo, { exact: true }).fill("저장한 메모");
    await infoGroup(page, "기본").getByLabel(memo, { exact: true }).press("Control+s");
    await expect(projectInfo(page).getByRole("button", { name: "고치기", exact: true })).toBeVisible();
    await expect(infoGroup(page, "기본").getByText("저장한 메모")).toBeVisible();
    const [saved] = await db.select({ customFields: projects.customFields }).from(projects).where(eq(projects.id, projectId));
    expect(Object.values(saved?.customFields as Record<string, unknown>)).toContain("저장한 메모");

    // 고칠 권리 없는 계정 — 같은 팀 · 같은 칸이 보이지만 projects.info 쓰기가 없다(D-7516): 입력 DOM 0, 읽기 값만.
    if (!editor.teamId) throw new Error("팀 없음");
    const reader = await createE2EProjectEditor({ teamId: editor.teamId });
    await upsertPermission(SYSTEM_VIEWER, { roleId: reader.roleId, menu: "projects.info", action: "write", allowed: false });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: reader.roleId, infoItem: customFieldInfoItem("project", memoField.key), visible: true });
    const context = await page.context().browser()?.newContext();
    if (!context) throw new Error("브라우저 없음");
    const other = await context.newPage();
    await login(other, reader);
    expect((await other.goto(`/projects/${projectId}`))?.status()).toBe(200);
    await expandProjectInfo(other);
    await expect(infoGroup(other, "기본").getByText("저장한 메모")).toBeVisible();
    // 기간 · PO 권리로 `고치기`가 서도(projects.period) 기본 정보 · 추가 칸 입력은 열리지 않는다.
    const edit = projectInfo(other).getByRole("button", { name: "고치기", exact: true });
    if ((await edit.count()) > 0) await edit.click();
    await expect(projectInfo(other).getByLabel("행사명", { exact: true })).toHaveCount(0);
    await expect(other.locator("input[id^='cf_'], select[id^='cf_']")).toHaveCount(0);
    await context.close();
  });

  // D-7516 — 형제 정보 칸(PO 번호 · 행사명)과 같이: 저장 안 한 추가 칸 편집은 새로 고침 뒤 복원 줄로 남고, 저장 요청 중에는 값을 보인 채 readOnly.
  test("정보 면 고치기: 추가 칸 편집도 새로 고침 뒤 복원 · 저장 요청 중 readOnly", async ({ page }) => {
    const tag = randomUUID().slice(0, 6);
    const editor = await createE2EProjectEditor();
    const memo = `${LABEL_PREFIX}복원${tag}`;
    await createE2EFieldDefinition({ entity: "project", label: memo, type: "text", required: false, onlyRoleId: editor.roleId });
    const client = await newClient();

    await login(page, editor);
    const form = await openCreatePanel(page, client.name, `E2E추가칸복원-${tag}`);
    await form.getByTestId("project-custom-fields").getByLabel(memo, { exact: true }).fill("처음 메모");
    await form.getByRole("button", { name: "프로젝트 등록" }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    const projectId = page.url().split("/").at(-1) ?? "";

    await expandProjectInfo(page);
    await projectInfo(page).getByRole("button", { name: "고치기", exact: true }).click();
    // `고치기`는 다음 프레임(requestAnimationFrame)에 포커스를 기간 시작 칸으로 옮긴다 — 그 프레임이 fill의 포커스와 글자 입력 사이에 오면
    // 글자가 기간 칸으로 가 추가 칸이 그대로다(CI e2e(2) 실패 원인). 한 프레임 기다린 뒤 친다.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    await infoGroup(page, "기본").getByLabel(memo, { exact: true }).fill("복원할 메모");
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();
    await page.reload();

    await expect(page.getByText(/^저장 안 한 편집 \d+칸$/)).toBeVisible();
    await page.getByRole("button", { name: "복원", exact: true }).click();
    const input = infoGroup(page, "기본").getByLabel(memo, { exact: true });
    await expect(input).toHaveValue("복원할 메모");
    await expect(page.getByRole("button", { name: /일괄 저장 1/ })).toBeVisible();

    // 저장 요청을 붙잡는 동안 칸은 값을 보인 채 읽기 전용(기간 · PO 번호 칸과 같다).
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"] !== undefined && (request.postData() ?? "").includes("seenStatus")) await held;
      await route.continue();
    });
    await input.press("Control+s");
    await expect(page.getByRole("button", { name: /일괄 저장/ })).toContainText("…");
    await expect(input).toHaveAttribute("readonly", "");
    await expect(input).toHaveValue("복원할 메모");
    release();
    await expect(infoGroup(page, "기본").getByText("복원할 메모")).toBeVisible();
    const [saved] = await db.select({ customFields: projects.customFields }).from(projects).where(eq(projects.id, projectId));
    expect(Object.values(saved?.customFields as Record<string, unknown>)).toContain("복원할 메모");
  });

  test("등록 오류 · 입력 버리기 · 날짜 칸 · 보관 선택지(1280 · 375): 필수 칸 오류 1칸 포커스 · 기간 + 필수 한 번에 2칸 · 추가 칸만 고쳐도 확인", async ({ page }) => {
    const tag = randomUUID().slice(0, 6);
    const editor = await createE2EProjectEditor();
    const required = `${LABEL_PREFIX}필수${tag}`;
    const day = `${LABEL_PREFIX}날짜${tag}`;
    const kind = `${LABEL_PREFIX}구분${tag}`;
    await createE2EFieldDefinition({ entity: "project", label: required, type: "text", required: true, sortOrder: 1, onlyRoleId: editor.roleId });
    await createE2EFieldDefinition({ entity: "project", label: day, type: "date", required: false, sortOrder: 2, onlyRoleId: editor.roleId });
    const kindField = await createE2EFieldDefinition({ entity: "project", label: kind, type: "select", required: false, options: ["현장", "온라인"], sortOrder: 3, onlyRoleId: editor.roleId });
    const client = await newClient();
    await login(page, editor);

    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 900 });
      const form = await openCreatePanel(page, client.name, `E2E추가칸오류-${tag}-${width}`);
      await expect(form.getByLabel(day, { exact: true })).toHaveAttribute("type", "date");
      await form.getByLabel(day, { exact: true }).fill("2026-11-04");
      await form.getByRole("button", { name: "프로젝트 등록" }).click();
      await expect(form.getByText(`등록 실패 · ${required} 1칸`, { exact: true })).toBeVisible();
      await expect(form.getByLabel(required, { exact: true })).toBeFocused();
      await expect(form.getByText("필수 칸 비어 있음 · 값 입력")).toBeVisible();
      await expect(form.getByLabel(day, { exact: true })).toHaveValue("2026-11-04");
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    // 기간(끝 < 시작) + 필수 추가 칸 빈칸 — 한 번의 제출로 두 칸 오류 · 이유 자리 `등록 실패 · {첫 오류 칸} 2칸`(eng A-6).
    const both = await openCreatePanel(page, client.name, `E2E추가칸동시-${tag}`);
    await both.getByLabel("시작일").fill("2026-12-10");
    await both.getByLabel("종료일").fill("2026-12-01");
    await both.getByRole("button", { name: "프로젝트 등록" }).click();
    await expect(both.getByText(/^등록 실패 · (시작일|종료일) 2칸$/)).toBeVisible();
    await expect(both.getByText("필수 칸 비어 있음 · 값 입력")).toBeVisible();
    await expect(both.locator("[aria-invalid='true']")).toHaveCount(2);

    // 추가 칸만 고친 뒤 닫기 → 「입력 버리기」 확인.
    expect((await page.goto("/projects?new=1"))?.status()).toBe(200);
    await page.locator("#project-form").getByLabel(required, { exact: true }).fill("버릴 값");
    await page.keyboard.press("Escape");
    const dialog = page.getByRole("dialog", { name: "입력 버리기" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("프로젝트 등록 · 1칸")).toBeVisible();
    await page.keyboard.press("Escape");

    // 저장값이 보관 선택지인 프로젝트 — 정보 면 고치기 select 끝 옵션 `{값} (보관됨)`.
    const saved = await openCreatePanel(page, client.name, `E2E추가칸보관선택지-${tag}`);
    await saved.getByLabel(required, { exact: true }).fill("값");
    await saved.getByLabel(kind, { exact: true }).selectOption("현장");
    await saved.getByRole("button", { name: "프로젝트 등록" }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    // 선택지 보관 — 관리 화면 수정은 대상 상수가 거래처뿐이라(05 전) 정의 행을 직접 바꾼다.
    await db.update(fieldDefinitions).set({ options: ["온라인"], archivedOptions: ["현장"] }).where(eq(fieldDefinitions.id, kindField.id));
    await page.reload();
    await expandProjectInfo(page);
    await expect(infoGroup(page, "기본").getByText("현장 (보관됨)")).toBeVisible();
    await projectInfo(page).getByRole("button", { name: "고치기", exact: true }).click();
    const options = await infoGroup(page, "기본").getByLabel(kind, { exact: true }).locator("option").allTextContents();
    expect(options.at(-1)).toBe("현장 (보관됨)");
    await expect(infoGroup(page, "기본").getByLabel(kind, { exact: true })).toHaveValue("현장");
  });
});
