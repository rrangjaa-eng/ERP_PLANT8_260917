import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { documentCounters, settingsSimple } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DOCUMENT_NUMBER_PROJECT_SEQ_START, DOCUMENT_NUMBER_PROJECT_SEPARATOR, SETTING_DEFS } from "@/domain/settings/keys";
import { findSimpleValue, upsertSimpleValue } from "@/repositories/settings";
import { findDocumentCounter, upsertDocumentCounter } from "@/repositories/document-counters";
import { kstYear } from "@/lib/kst-date";

// ADMN-05·06, 성공 기준 4: 설정 화면이 레지스트리에서 자동 생성되고, 값
// 변경이 저장 버튼 없이 즉시 반영되는 것과 이력형 키의 「예정」 상태를
// end-to-end로 증명한다.
test.describe("설정 화면 (ADMN-05, 성공 기준 4)", () => {
  test("시스템 관리자는 섹션·필드를 보고, 잠금 횟수를 바꾸면 저장 버튼 없이 즉시 반영되며 새로고침 뒤에도 남는다", async ({
    page,
  }) => {
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const response = await page.goto("/admin/settings");
    expect(response?.status()).toBe(200);

    // 섹션(namespace)과 필드(label)가 보인다 — 화면 코드가 아니라 레지스트리가
    // 만든 것이다.
    await expect(page.getByRole("heading", { name: "로그인 잠금" })).toBeVisible();
    const thresholdInput = page.getByLabel("로그인 잠금 임계값");
    await expect(thresholdInput).toBeVisible();

    // 「일괄 저장」·별도 「저장」 버튼이 없다 — blur 자체가 저장이다.
    await expect(page.getByRole("button", { name: /^저장$/ })).toHaveCount(0);

    await thresholdInput.fill("9");
    await thresholdInput.blur();

    // 서버 저장이 끝날 시간을 준다 — 별도 로딩 표시가 없으므로 값 자체가
    // 안정될 때까지 폴링한다.
    await expect(async () => {
      await page.reload();
      await expect(page.getByLabel("로그인 잠금 임계값")).toHaveValue("9");
    }).toPass();
  });

  test("이력형 키에 미래 날짜로 새 이력을 추가하면 「예정」 태그가 붙는다", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/admin/settings");

    // 부가세율(이력형) 섹션 근처의 「새 이력 추가」 3차 버튼을 연다.
    const vatLabel = page.getByText("부가세율", { exact: true });
    await expect(vatLabel).toBeVisible();
    const vatContainer = vatLabel.locator("xpath=..");
    await vatContainer.getByRole("button", { name: "새 이력 추가" }).click();

    await page.getByLabel("적용 시작일", { exact: true }).fill("2999-01-01");
    await page.getByLabel("값", { exact: true }).fill("0.15");
    await page.getByRole("button", { name: "새 이력 추가" }).last().click();

    await expect(page.getByText("예정")).toBeVisible();
  });

  test("서로 다른 이력형 설정의 「새 이력 추가」 폼 두 개를 동시에 열어도 id가 겹치지 않는다 (M-3)", async ({
    page,
  }) => {
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/admin/settings");

    // 부가세율과 기타소득 원천징수율은 둘 다 이력형 키다 — 각각의
    // HistorizedFieldEditor가 HistoryList를 하나씩 렌더한다.
    const vatLabel = page.getByText("부가세율", { exact: true });
    await expect(vatLabel).toBeVisible();
    const vatContainer = vatLabel.locator("xpath=..");
    await vatContainer.getByRole("button", { name: "새 이력 추가" }).click();

    const witaxLabel = page.getByText("기타소득 원천징수율", { exact: true });
    await expect(witaxLabel).toBeVisible();
    const witaxContainer = witaxLabel.locator("xpath=..");
    await witaxContainer.getByRole("button", { name: "새 이력 추가" }).click();

    const vatDateInput = vatContainer.locator('input[type="date"]');
    const witaxDateInput = witaxContainer.locator('input[type="date"]');

    const vatId = await vatDateInput.getAttribute("id");
    const witaxId = await witaxDateInput.getAttribute("id");
    expect(vatId).toBeTruthy();
    expect(witaxId).toBeTruthy();
    // M-3: id가 하드코딩되어 있었을 때는 두 입력이 같은 id
    // ("history-list-effective-from")를 가져 여기서 실패했다.
    expect(vatId).not.toBe(witaxId);

    // 두 번째로 연 폼(기타소득 원천징수율)의 「적용 시작일」 라벨을 클릭하면
    // 그 폼 자신의 입력창이 포커스를 받아야 한다. id가 겹치면
    // <label htmlFor>가 문서상 먼저 나오는 첫 번째 폼(부가세율)의
    // 입력창에 포커스를 보낸다.
    // 「적용 시작일」이라는 글자는 추가 폼의 라벨 말고 이력 표의 열 머리글에도
    // 있어 이름으로 찾으면 둘이 잡힌다 — 이 폼 자신의 입력을 가리키는 label을
    // 직접 집는다. 그리고 포커스 판정은 id 문자열이 아니라 요소 동일성으로 한다:
    // id가 겹치던 시절엔 두 id가 같아서 문자열 비교로는 결함이 통과해 버린다.
    await witaxContainer.locator(`label[for="${witaxId}"]`).click();
    const witaxInputFocused = await witaxDateInput.evaluate((el) => el === document.activeElement);
    expect(witaxInputFocused).toBe(true);
  });

  // 묶음 ④ /review T2 — 올해 프로젝트 번호가 1건 이상 매겨진 뒤 순번 시작값을 낮추면 화면 경로(blur 저장)에서 칸 오류로 거부하고
  // 값은 그대로다. 같은 값의 재저장(blur)은 낮추기가 아니므로 통과한다. 공용 설정·카운터는 끝나면 원래대로 돌린다.
  test("올해 번호가 매겨진 뒤 순번 시작값을 100에서 50으로 낮추면 칸 오류이고 값은 100 그대로, 100 재저장은 오류 없음", async ({ page }) => {
    const key = DOCUMENT_NUMBER_PROJECT_SEQ_START.key;
    const period = String(kstYear(new Date()));
    const originalSetting = await findSimpleValue(SYSTEM_VIEWER, key);
    const originalCounter = await findDocumentCounter(SYSTEM_VIEWER, "project", period);
    await upsertSimpleValue(SYSTEM_VIEWER, key, 100, null);
    if ((originalCounter?.value ?? 0) < 1) await upsertDocumentCounter(SYSTEM_VIEWER, { counterKey: "project", period, value: 1 });
    try {
      const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
      await page.goto("/login");
      await page.getByLabel("이메일").fill(admin.email);
      await page.getByLabel("비밀번호").fill(admin.password);
      await page.getByRole("button", { name: "로그인" }).click();
      await expect(page).toHaveURL(/\/account$/);
      await page.goto("/admin/settings");

      const field = page.getByLabel(DOCUMENT_NUMBER_PROJECT_SEQ_START.label, { exact: true });
      await expect(field).toHaveValue("100");
      const isServerAction = (response: { request: () => { method: () => string; headers: () => Record<string, string> } }) =>
        response.request().method() === "POST" && response.request().headers()["next-action"] !== undefined;

      await field.fill("50");
      let saved = page.waitForResponse(isServerAction);
      await field.blur();
      await saved;
      const rejection = page.getByText("순번 시작값은 현재 값(100)보다 낮출 수 없음");
      await expect(rejection).toBeVisible();
      expect((await findSimpleValue(SYSTEM_VIEWER, key))?.value).toBe(100);

      await field.fill("100");
      saved = page.waitForResponse(isServerAction);
      await field.blur();
      await saved;
      await expect(rejection).toHaveCount(0);
      await page.reload();
      await expect(page.getByLabel(DOCUMENT_NUMBER_PROJECT_SEQ_START.label, { exact: true })).toHaveValue("100");
    } finally {
      if (originalSetting) await upsertSimpleValue(SYSTEM_VIEWER, key, originalSetting.value, originalSetting.updatedBy);
      else await db.delete(settingsSimple).where(eq(settingsSimple.key, key));
      if (!originalCounter) await db.delete(documentCounters).where(and(eq(documentCounters.counterKey, "project"), eq(documentCounters.period, period)));
      else if (originalCounter.value < 1) await upsertDocumentCounter(SYSTEM_VIEWER, { counterKey: "project", period, value: originalCounter.value });
    }
  });

  test("설정 메뉴 권한이 없는 기본 계급은 이 화면에서 404를 받는다", async ({ page }) => {
    const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(pm.email);
    await page.getByLabel("비밀번호").fill(pm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const response = await page.goto("/admin/settings");
    expect(response?.status()).toBe(404);
  });
});

// PR #104 후속 F(2) — ISSUE-001(/qa): 설정 칸의 힌트 <p>가 id를 갖고 칸(또는 묶음)의 aria-describedby가 그 id를 가리킨다.
// DR-104-03(/design-review): 이력 목록 숫자가 쉼표 포맷터로 그려진다. 키에 점이 있어 id는 속성 선택자로 집는다.
test.describe("PR #104 후속 — 설정 힌트 aria-describedby (ISSUE-001) · 이력 숫자 쉼표 (DR-104-03)", () => {
  async function openSettings(page: import("@playwright/test").Page) {
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { name: "로그인 잠금" })).toBeVisible();
  }

  test("ISSUE-001 — hint 있는 모든 설정 키의 힌트가 id를 갖고 칸 · fieldset · 이력 묶음의 aria-describedby에 들어간다, 매달린 id 없음", async ({ page }) => {
    await openSettings(page);
    const hinted = SETTING_DEFS.filter((def) => def.hint).map((def) => ({ key: def.key, hint: def.hint as string }));
    expect(hinted.length).toBeGreaterThan(0);

    const problems = await page.evaluate((defs) => {
      const found: string[] = [];
      for (const { key, hint } of defs) {
        const hintId = `setting-${key}-hint`;
        const hintEls = document.querySelectorAll(`[id="${hintId}"]`);
        if (hintEls.length !== 1) {
          found.push(`${key}: 힌트 id 요소 ${hintEls.length}개`);
          continue;
        }
        if (hintEls[0]!.textContent?.trim() !== hint) found.push(`${key}: 힌트 글자 불일치`);
        const owners = document.querySelectorAll(`[aria-describedby~="${hintId}"]`);
        if (owners.length !== 1) {
          found.push(`${key}: aria-describedby 연결 ${owners.length}개`);
          continue;
        }
        const owner = owners[0]!;
        const ok = ["INPUT", "SELECT", "FIELDSET"].includes(owner.tagName) || owner.getAttribute("role") === "group";
        if (!ok) found.push(`${key}: 연결 요소가 ${owner.tagName}`);
      }
      for (const el of document.querySelectorAll("main [aria-describedby]")) {
        for (const token of (el.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean)) {
          if (!document.getElementById(token)) found.push(`매달린 id: ${token}`);
        }
      }
      return found;
    }, hinted);
    expect(problems).toEqual([]);
  });

  test("ISSUE-001 — 오류 없는 텍스트 칸(잠금 임계값)의 aria-describedby는 힌트 id 하나다", async ({ page }) => {
    await openSettings(page);
    await expect(page.getByLabel("로그인 잠금 임계값")).toHaveAttribute("aria-describedby", "setting-auth.lockout.threshold-hint");
  });

  test("ISSUE-001 — 구분자 칸에 허용 밖 글자를 넣고 blur하면 aria-describedby가 오류 id 다음 힌트 id이고 저장은 거부된다", async ({ page }) => {
    await openSettings(page);
    const key = DOCUMENT_NUMBER_PROJECT_SEPARATOR.key;
    const field = page.locator(`[id="setting-${key}"]`);
    await expect(field).toBeVisible();
    const isServerAction = (response: { request: () => { method: () => string; headers: () => Record<string, string> } }) =>
      response.request().method() === "POST" && response.request().headers()["next-action"] !== undefined;

    await field.fill("#");
    const saved = page.waitForResponse(isServerAction);
    await field.blur();
    await saved;
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(field).toHaveAttribute("aria-describedby", `setting-${key}-error setting-${key}-hint`);
    expect((await findSimpleValue(SYSTEM_VIEWER, key))?.value).not.toBe("#");
  });

  test("DR-104-03 — 이력 목록 숫자: 면제 기준 125,000, 비율은 저장값 그대로(0.088 · 0.1)", async ({ page }) => {
    await openSettings(page);
    // 시드 이력 행의 적용 시작일 — domain/seed/index.ts SEED_HISTORIZED_EFFECTIVE_FROM(export 안 된 상수).
    const seedDate = "2000-01-01";
    const valueOf = async (caption: string) => {
      const row = page.getByRole("table", { name: caption }).getByRole("row").filter({ hasText: seedDate });
      return (await row.getByRole("cell").nth(1).innerText()).trim();
    };
    expect(await valueOf("기타소득 원천징수 면제 기준(지급액) 이력")).toBe("125,000");
    expect(await valueOf("기타소득 원천징수율 이력")).toBe("0.088");
    expect(await valueOf("부가세율 이력")).toBe("0.1");
  });
});

// tokens.css --danger #9B1C1C · --focus(→ --g-700) #005446을 rgb로.
const DANGER_RGB = "rgb(155, 28, 28)";
const FOCUS_RGB = "rgb(0, 84, 70)";

test.describe("내부 칸 오류 상태(04.3-03 F2 · F3 · 04.3-15 R3)", () => {
  test("F2 · F3 — 설정 쉼표 칸 오류는 포커스 중에도 --danger 테두리 · 포커스 링 유지 · 글자 --text-aux · 높이 32 그대로", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/admin/settings");

    const field = page.getByLabel("USD 최근 환율");
    await field.fill("1.12345");
    const error = page.getByText("환율은 소수 4자리까지", { exact: true });
    await expect(error).toBeVisible();
    await expect(field).toBeFocused();
    await expect(field).toHaveCSS("border-top-color", DANGER_RGB);
    await expect(field).toHaveCSS("outline-color", FOCUS_RGB);
    await expect(field).toHaveCSS("outline-style", "solid");
    await expect(error).toHaveCSS(
      "font-size",
      await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--text-aux").trim()),
    );
    await expect(field).toHaveCSS("height", "32px");

    await page.keyboard.press("End");
    await page.keyboard.press("Backspace");
    await expect(error).toHaveCount(0);
    await expect(field).not.toHaveCSS("border-top-color", DANGER_RGB);
    await page.keyboard.type("0");
  });
});
