import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { loginAsSysadmin } from "./row-actions-helpers";
import { recordAction } from "@/domain/action-log/record";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertRole, setRoleArchived } from "@/repositories/roles";
import { createDelegatedAccount } from "./admin-cap-fixtures";
import { db } from "@/db/client";
import { actionLog } from "@/db/schema";
import { insertKstMidnightRow, KST_MIDNIGHT_LABEL, UTC_DATE_OF_ROW } from "./action-log-kst-fixture";

// ADMN-10·OPS-05: 필터 → 내보내기 → 정리 → 정리가 다시 로그에 남는 end-to-end.
test.describe("행동 로그 화면 (ADMN-10, OPS-05)", () => {
  test("필터 → 0건 문구 → Excel 내보내기 → 정리(두 단계) → 정리 기록 확인 → 권한 없는 계급 404", async ({
    page,
  }) => {
    const admin = await createFixtureUser({ roleId: "role-sysadmin" });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    // 코드표 항목 하나를 추가해 행동 로그 행을 만든다.
    const codeValue = `e2e-log-${Date.now()}`;
    // 2026-09-21 스테이징 QA 수정: 등록 폼이 기본 진입에는 없다(§6-1) —
    // 목록 머리글의 「코드 추가」가 그 폼을 연다.
    await page.goto("/admin/code-tables");
    await page.getByRole("link", { name: "코드 추가" }).click();
    await page.getByLabel("값").fill(codeValue);
    await page.locator("#code-item-form").getByLabel("이름").fill("행동 로그 E2E");
    await page.getByRole("button", { name: "코드 추가" }).click();
    await expect(page.getByText(codeValue)).toBeVisible();

    // 행동 로그 화면 — 종류 필터(문서 생성)로 방금 만든 행을 찾는다.
    const logResponse = await page.goto("/admin/action-log?actionType=document_create");
    expect(logResponse?.status()).toBe(200);
    await expect(page.getByRole("cell", { name: "문서 생성" }).first()).toBeVisible();

    // 기간 필터(시작일)를 내일 이후로 바꾸면 "조건에 맞는 건이 없습니다"가 보인다.
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await page.getByLabel("시작일").fill(tomorrow);
    await expect(page.getByText("조건에 맞는 건이 없습니다")).toBeVisible();
    await expect(page.getByRole("link", { name: "필터 지우기" }).first()).toBeVisible();

    // 필터를 지우고 종류 필터만 다시 건다.
    await page.getByRole("link", { name: "필터 지우기" }).first().click();
    await page.goto("/admin/action-log?actionType=document_create");
    await expect(page.getByRole("cell", { name: "문서 생성" }).first()).toBeVisible();

    // 내보낼 본문이 1024자를 넘게 한다. React Flight는 1024자 이상 문자열을
    // 별도 텍스트 청크로 보내고, 브라우저의 TextDecoder가 그 청크 맨 앞 BOM을
    // 떼어 낸다 — 1023자는 BOM이 남고 1024자부터 사라진다(실측). 이 행이
    // 없으면 파일 크기가 다른 스펙이 쌓은 「문서 생성」 행 수에 달려, 이
    // 결함이 스위트 순서에 따라 드러났다 숨었다 한다. 이 행도 아래 정리에서
    // 함께 정리된다.
    await recordAction(SYSTEM_VIEWER, {
      actionType: "document_create",
      entity: "code_items",
      detail: { padding: "가".repeat(1100) },
    });

    // Excel 내보내기 — 파일 다운로드를 일으킨다.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Excel 내보내기" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^action-log-.*\.csv$/);

    // defect 1(DOM 감사): 문자열 수준이 아니라 실제 다운로드된 파일의 첫
    // 3바이트로 검증한다 — Server Action 응답이 React Flight의 TextDecoder를
    // 거치며 문자열 속 BOM이 조용히 사라지는 문제라, JS 문자열 검사로는
    // 이 결함이 재현되지 않는다(파일 바이트만 증명한다).
    const downloadPath = await download.path();
    if (!downloadPath) throw new Error("다운로드 경로를 가져오지 못했습니다.");
    const bytes = await readFile(downloadPath);
    expect(bytes.subarray(0, 3).toString("hex")).toBe("efbbbf");

    // 이 테스트가 만든 행(대상 칸에 고유 값)만 본다. 「문서 생성」 목록 전체는
    // 다른 워커가 정리 직후에도 계속 채우는 공유 erp_test의 표라, 「0건」을
    // 기대하면 그 사이에 들어온 남의 행 하나로 깨진다.
    const ownRow = page.getByRole("cell", { name: codeValue });
    await expect(ownRow).toBeVisible();

    // 정리 — 두 단계 제출. 첫 클릭이 확인 줄을 열고, 확인 문구가 정리 기록이
    // 남는다는 사실을 명시한다.
    await page.getByRole("button", { name: "정리" }).click();
    await expect(page.getByText(/건을 정리합니다 · 정리 기록은 남습니다/)).toBeVisible();
    await page.getByRole("button", { name: "정리" }).click();

    // 정리 후 같은 필터에서 빠진다.
    await expect(ownRow).toHaveCount(0);

    // 필터를 지우면 정리 기록 자체가 새 행(행동 로그 정리)으로 보인다.
    await page.getByRole("link", { name: "필터 지우기" }).first().click();
    await expect(page.getByRole("cell", { name: "행동 로그 정리" }).first()).toBeVisible();

    // 권한 없는 계급(기본 계급)에는 이 화면이 404다.
    const pm = await createFixtureUser({ roleId: "role-pm" });
    const pmContext = await page.context().browser()?.newContext();
    const pmPage = pmContext ? await pmContext.newPage() : page;
    if (pmContext) {
      await pmPage.goto("/login");
      await pmPage.getByLabel("이메일").fill(pm.email);
      await pmPage.getByLabel("비밀번호").fill(pm.password);
      await pmPage.getByRole("button", { name: "로그인" }).click();
      await expect(pmPage).toHaveURL(/\/account$/);
    }
    const pmResponse = await pmPage.goto("/admin/action-log");
    expect(pmResponse?.status()).toBe(404);
    if (pmContext) await pmContext.close();
  });
  // /review 지적: page.tsx가 검색 파라미터를 정규화하지 않고 filterValues로
  // 그대로 넘긴다. 필터 줄은 네이티브 GET 폼이라 한 번이라도 제출되면 빈
  // 칸까지 `actorId=&from=&...`로 URL에 실리는데, 내보내기·정리 액션의
  // 스키마는 `z.string().min(1).optional()`이라 빈 문자열을 거부한다 —
  // 즉 필터를 화면에서 한 번 건드리면 두 기능이 다 막힌다. 위 테스트는
  // 매번 page.goto로 깨끗한 URL을 만들어 들어가서 이 경로를 비켜갔다.
  test("필터를 폼으로 제출한 뒤에도 Excel 내보내기와 정리가 동작한다", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: "role-sysadmin" });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const codeValue = `e2e-empty-${Date.now()}`;
    // 2026-09-21 스테이징 QA 수정: 등록 폼이 기본 진입에는 없다(§6-1) —
    // 목록 머리글의 「코드 추가」가 그 폼을 연다.
    await page.goto("/admin/code-tables");
    await page.getByRole("link", { name: "코드 추가" }).click();
    await page.getByLabel("값").fill(codeValue);
    await page.locator("#code-item-form").getByLabel("이름").fill("빈 파라미터 E2E");
    await page.getByRole("button", { name: "코드 추가" }).click();
    await expect(page.getByText(codeValue)).toBeVisible();

    // 화면에서 필터를 고른다 — page.goto가 아니라 폼 제출이어야 빈 칸이 함께 실린다.
    await page.goto("/admin/action-log");
    await page.getByLabel("행동 종류").selectOption("document_create");
    await expect(page).toHaveURL(/actorId=&/);
    await expect(page.getByRole("cell", { name: "문서 생성" }).first()).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Excel 내보내기" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^action-log-.*\.csv$/);
    await expect(page.getByText("Excel 내보내기 · 실패 · 다시 시도")).toHaveCount(0);

    // 위 테스트와 같은 이유로 이 테스트가 만든 행만 본다(공유 erp_test).
    const ownRow = page.getByRole("cell", { name: codeValue });
    await expect(ownRow).toBeVisible();

    await page.getByRole("button", { name: "정리" }).click();
    await expect(page.getByText(/건을 정리합니다 · 정리 기록은 남습니다/)).toBeVisible();
    await page.getByRole("button", { name: "정리" }).click();
    await expect(page.getByText("정리 실패 · 다시 시도")).toHaveCount(0);
    await expect(ownRow).toHaveCount(0);
  });

  // 04-46 Task 1(⑦, DR-11) — 기존 사용처 회귀. 「정리」가 0건이면 disabled +
  // disabledReason(§7-1)이던 것이 이제 aria-disabled다 — 네이티브 disabled와
  // 달리 탭 순서에 남아 포커스되고 이유가 aria-describedby로 읽히며, 클릭해도
  // 확인 줄(정리 두 단계 제출)이 열리지 않는다.
  test("0건 필터에서 「정리」가 aria-disabled고 포커스되며 클릭이 무시된다(DR-11)", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: "role-sysadmin" });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    // 시작일을 내일 이후로 걸면 필터에 걸리는 행이 0건이라 pruneCount도 0이다.
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await page.goto(`/admin/action-log?from=${tomorrow}`);
    await expect(page.getByText("조건에 맞는 건이 없습니다")).toBeVisible();

    const pruneButton = page.getByRole("button", { name: "정리" });
    await expect(pruneButton).toHaveAttribute("aria-disabled", "true");
    await expect(pruneButton).not.toHaveAttribute("disabled", "");

    // 탭 순서에 남아 포커스된다(네이티브 disabled였다면 포커스를 받지 못한다).
    await pruneButton.focus();
    await expect(pruneButton).toBeFocused();

    // aria-describedby가 이유 글자를 가리킨다.
    const describedById = await pruneButton.getAttribute("aria-describedby");
    expect(describedById).toBeTruthy();
    await expect(page.locator(`#${describedById}`)).toHaveText("정리할 행이 없습니다");

    // 클릭해도 확인 줄(두 단계 제출)이 열리지 않는다 — Playwright의 기본
    // actionability 검사는 aria-disabled="true"를 네이티브 disabled처럼 취급해
    // 클릭 자체를 막는다. 이 테스트는 "클릭 이벤트가 눌러져도 컴포넌트의
    // 클릭 가드(preventDefault)가 동작을 막는다"를 보는 것이라 force로
    // Playwright의 방어를 건너뛰고 실제 클릭 이벤트를 쏜다.
    await pruneButton.click({ force: true });
    await expect(page.getByText(/건을 정리합니다 · 정리 기록은 남습니다/)).toHaveCount(0);
  });

  // OPS-05는 행동 로그에 남길 핵심 행동으로 「로그인」을 명시한다. record.ts의
  // CORE_ACTION_TYPES에 "login"이 선언돼 있고 화면 필터에도 나오지만, 정작
  // recordAction({actionType:"login"})을 부르는 코드가 없어서 그 필터는 영원히
  // 0건이었다(페이즈 검증에서 발견). 인증 훅은 잠금용 login_attempts만 썼다.
  test("로그인이 행동 로그에 남는다", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: "role-sysadmin" });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/admin/action-log?actionType=login");
    await expect(page.getByRole("cell", { name: "로그인" }).first()).toBeVisible();
  });
});

// 04.6-22 — 행동 로그 · 보관함이 목록 틀(`ListScreen`)과 서버 렌더 공용 표(`StaticTable`)로 그려진다(R1 · D21).
// 역할 토큰의 계산 값과 비교한다(리터럴 px · rgb 금지 — 04.6 W3 합본 교훈).
function tokenAsColor(page: Page, name: string): Promise<string> {
  return page.evaluate((token) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${token})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, name);
}

function tokenAsRadius(page: Page, name: string): Promise<string> {
  return page.evaluate((token) => {
    const probe = document.createElement("div");
    probe.style.borderTopLeftRadius = `var(${token})`;
    document.body.append(probe);
    const radius = getComputedStyle(probe).borderTopLeftRadius;
    probe.remove();
    return radius;
  }, name);
}

async function expectTableFace(page: Page): Promise<void> {
  const table = page.locator("main table").first();
  await expect(table).toBeVisible();
  // `ui/table` 표 면 — r8(--radius-surface) · 1px 테두리.
  expect(await table.evaluate((element) => getComputedStyle(element).borderTopLeftRadius)).toBe(await tokenAsRadius(page, "--radius-surface"));
  expect(await table.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe("1px");
}

test.describe("행동 로그 · 보관함 목록 틀 (04.6-22)", () => {
  test("행동 로그 — 목록 틀 제목 · 표 면 · 서버 렌더 표가 런타임 오류 없이 열린다", async ({ page }) => {
    await loginAsSysadmin(page);
    const response = await page.goto("/admin/action-log");
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1[data-ui="screen-title"]')).toHaveText("행동 로그");
    await expectTableFace(page);
    // R1 — 서버 페이지가 클라이언트 표에 함수 prop을 넘기면 오류 경계가 뜬다.
    await expect(page.getByText("Functions cannot be passed directly to Client Components")).toHaveCount(0);
    await expect(page.getByRole("table", { name: "행동 로그" })).toBeVisible();
  });

  test("행동 로그 — 「필터 지우기」 링크는 스크롤 위치를 지킨다", async ({ page }) => {
    await loginAsSysadmin(page);
    // 스크롤이 생기도록 같은 종류 행을 여럿 만들고 창을 낮춘다.
    for (let index = 0; index < 8; index += 1) {
      await recordAction(SYSTEM_VIEWER, { actionType: "document_create", entity: "code_items", detail: { scroll: index } });
    }
    await page.setViewportSize({ width: 1280, height: 400 });
    await page.goto("/admin/action-log?actionType=document_create");
    // 링크가 보이는 만큼만 내린다 — Playwright가 클릭 전에 링크를 보이게 스크롤하면 위치 지킴을 잴 수 없다.
    await page.evaluate(() => window.scrollTo(0, 40));
    expect(await page.evaluate(() => window.scrollY)).toBe(40);
    const clear = page.getByRole("link", { name: "필터 지우기" }).first();
    expect((await clear.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0);
    await clear.click();
    await expect(page).toHaveURL(/\/admin\/action-log$/);
    await expect(page.getByRole("link", { name: "필터 지우기" })).toHaveCount(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(40);
  });

  test("보관함 — 목록 틀 · 표 면 · 「복원」은 행 행동이고 위험 색이 아니며 폰에서 44 이상", async ({ page }) => {
    const roleId = `role-e2e-${randomUUID().slice(0, 8)}`;
    const roleName = `보관함 틀 ${roleId.slice(-8)}`;
    await insertRole(SYSTEM_VIEWER, { id: roleId, name: roleName, sortOrder: 99 });
    await setRoleArchived(SYSTEM_VIEWER, roleId, true);
    try {
      await loginAsSysadmin(page);
      const response = await page.goto("/admin/archive");
      expect(response?.status()).toBe(200);
      await expect(page.locator('h1[data-ui="screen-title"]')).toHaveText("보관함");
      await expectTableFace(page);

      const row = page.locator("tr", { hasText: roleName });
      const actions = row.locator('[data-ui="row-actions"]');
      const restore = actions.getByRole("button", { name: "복원" });
      await expect(restore).toBeVisible();
      // D21 — 위험 색은 삭제만이다.
      const color = await restore.evaluate((element) => getComputedStyle(element).color);
      expect(color).not.toBe(await tokenAsColor(page, "--status-danger"));

      await page.setViewportSize({ width: 375, height: 800 });
      const touchMin = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--touch-min")));
      const box = await restore.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(touchMin);
      await page.setViewportSize({ width: 1280, height: 800 });

      await restore.click();
      await expect(page.getByText(`복원 · ${roleName} 복원됨`)).toBeVisible({ timeout: 15000 });
      await expect(row).toHaveCount(0);
    } finally {
      await setRoleArchived(SYSTEM_VIEWER, roleId, true);
    }
  });
});

// 07-25 K16 · SC-08 — 상세 칸은 바뀐 칸을 사람이 읽는 줄로 보인다(표 칸 앞 3줄 + `외 N칸` 펼침). JSON 원문은 화면에 없다.
async function recordFourChangeRow(token: string): Promise<void> {
  await recordAction(SYSTEM_VIEWER, {
    actionType: "settings_change",
    entity: "e2e_settings",
    entityId: token,
    detail: {
      scope: "import",
      changes: {
        "tax.vat.rate": [0.1, 0.12],
        "auth.lockout.threshold": [5, 10],
        accountNumber: ["110123451234", "220987655678"],
        password: ["x-old-secret", "y-new-secret"],
      },
    },
  });
}

test.describe("행동 로그 상세 칸 (07-25 K16)", () => {
  test("칸 넷이 바뀐 행 — 세 줄 + 외 1칸 → 펼치면 넷째 줄 · 포커스 유지 · 민감 값 가림 · 원문 JSON 없음", async ({ page }) => {
    const token = `e2e-detail-${randomUUID().slice(0, 8)}`;
    await recordFourChangeRow(token);
    await loginAsSysadmin(page);
    await page.goto("/admin/action-log?actionType=settings_change");

    const row = page.locator("tbody tr", { hasText: token }).first();
    const detail = row.locator('[data-ui="action-log-detail"]');
    await expect(detail).toBeVisible();
    await expect(detail.getByRole("listitem")).toHaveCount(3);
    const more = detail.getByRole("button");
    await expect(more).toHaveText("외 1칸");
    await expect(more).toHaveAttribute("aria-expanded", "false");
    for (const line of await detail.getByRole("listitem").allInnerTexts()) expect(line).toMatch(/ · .+ → .+/);

    await more.click();
    await expect(more).toBeFocused();
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await expect(detail.getByRole("listitem")).toHaveCount(4);

    const text = await detail.innerText();
    expect(text).toContain("····1234 → ····5678");
    expect(text).toContain("부가세율 · 0.1 → 0.12");
    expect(text).toContain("바뀜 → 바뀜");
    expect(text).not.toMatch(/\{"|secret|110123451234/);

    const html = await page.content();
    expect(html).not.toContain("110123451234");
    expect(html).not.toContain("x-old-secret");
    expect(html).not.toContain('"changes"');
    expect(html).not.toContain('\\"changes\\"');
  });

  test("changes가 없는 행은 상세 칸이 —", async ({ page }) => {
    const token = `e2e-nodetail-${randomUUID().slice(0, 8)}`;
    await recordAction(SYSTEM_VIEWER, { actionType: "settings_change", entity: "e2e_settings", entityId: token, detail: { scope: "import" } });
    await loginAsSysadmin(page);
    await page.goto("/admin/action-log?actionType=settings_change");
    const row = page.locator("tbody tr", { hasText: token }).first();
    await expect(row.locator('[data-ui="action-log-detail"]')).toHaveText("—");
  });

  // DOM 감사 P2-2: 발생 시각은 KST로 보인다(기간 필터 경계와 같은 시간대). UTC 날짜(10-22)와 KST 날짜(10-23)가 갈리는 행으로 잰다.
  test("발생 시각은 KST로 보인다 — UTC 2026-10-22 15:30은 2026-10-23 00:30", async ({ page }) => {
    const token = `e2e-kst-${randomUUID().slice(0, 8)}`;
    await insertKstMidnightRow(token);
    await loginAsSysadmin(page);
    await page.goto(`/admin/action-log?documentId=${token}`);
    const row = page.locator("tbody tr", { hasText: token }).first();
    await expect(row).toContainText(KST_MIDNIGHT_LABEL);
    expect(await row.innerText()).not.toContain(UTC_DATE_OF_ROW);
  });

  // DOM 감사 P3: 아래 줄 순서 — 계좌번호(칸 이름 표 선언 순서가 앞) → 비밀번호 → 표에 없는 키는 사전 순. 앞 3줄이 이 순서다.
  test("상세 줄 순서가 정해져 있다 — 앞 3줄은 계좌번호 · 비밀번호 · 잠금 횟수, 부가세율은 외 1칸 안", async ({ page }) => {
    const token = `e2e-order-${randomUUID().slice(0, 8)}`;
    await insertKstMidnightRow(token);
    await loginAsSysadmin(page);
    await page.goto(`/admin/action-log?documentId=${token}`);
    const detail = page.locator("tbody tr", { hasText: token }).first().locator('[data-ui="action-log-detail"]');
    const lines = await detail.getByRole("listitem").allInnerTexts();
    expect(lines.map((line) => line.split(" · ")[0])).toEqual(["계좌번호", "비밀번호", "잠금 횟수"]);
  });

  // DOM 감사 P1: 문서 번호 칸의 blur 제출이 값이 그대로여도 일어나 Tab만으로는 표에 닿지 못했다(포커스가 BODY로 돌아감).
  test("Tab만으로 필터 줄을 지나 표까지 가고 페이지가 다시 불러지지 않는다", async ({ page }) => {
    const token = `e2e-tab-${randomUUID().slice(0, 8)}`;
    await insertKstMidnightRow(token);
    await loginAsSysadmin(page);
    await page.goto(`/admin/action-log?documentId=${token}`);
    await expect(page.locator("tbody tr", { hasText: token }).first()).toBeVisible();
    await page.evaluate(() => document.body.setAttribute("data-tab-marker", "1"));

    let reachedTable = false;
    for (let step = 0; step < 80 && !reachedTable; step += 1) {
      await page.keyboard.press("Tab");
      reachedTable = await page.evaluate(() => Boolean(document.activeElement?.closest("table")));
    }
    expect(reachedTable).toBe(true);
    expect(await page.evaluate(() => document.body.getAttribute("data-tab-marker"))).toBe("1");
    await expect(page.locator("tbody tr", { hasText: token }).first().getByRole("button", { name: /^외 \d+칸$/ })).toBeFocused();
  });

  test("문서 번호를 바꾸고 Tab으로 나가거나 Enter를 누르면 그때만 제출한다", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/action-log");
    const input = page.getByLabel("문서 번호");
    await input.fill("e2e-blur-change");
    await input.press("Tab");
    await expect(page).toHaveURL(/documentId=e2e-blur-change/);

    const again = page.getByLabel("문서 번호");
    await again.fill("e2e-enter-change");
    await again.press("Enter");
    await expect(page).toHaveURL(/documentId=e2e-enter-change/);
  });

  test("R10 — 메뉴 view는 있고 정보 항목 action_log.detail이 꺼진 계급은 404(500 아님)", async ({ page }) => {
    const account = await createDelegatedAccount({ menus: [{ menu: "admin.action-log", action: "view" }], infoItems: [] });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(account.email);
    await page.getByLabel("비밀번호").fill(account.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    const response = await page.goto("/admin/action-log");
    expect(response?.status()).toBe(404);
  });
});

// 07.1-05 W13 · E-P1-05 · E-P2-20 — Excel 내보내기 5,000건 상한. 행동 로그는 지울 수 없으므로(0046 트리거) 모든 행에 pruned_at을 채워
// 기본 보기(정리 행 뺌)와 다른 스펙 화면에 보이지 않게 하고, 고유 documentId + includePruned=1로만 연다.
// 5,000행은 정리 가능 종류(settings_change), 1행은 정리할 수 없는 종류(cert_view) — 정리 단추의 pruneCount는 0이라 그 수를 쓰면 활성이 되어 실패한다.
test.describe("행동 로그 내보내기 상한 (07.1-05 W13)", () => {
  test("5,001행이면 비활성 + 이유 줄(aria-describedby), actionType으로 5,000행이면 활성", async ({ page }) => {
    test.setTimeout(120_000);
    const token = `e2e-limit-${randomUUID()}`;
    const prunedAt = new Date("2026-10-01T00:00:00Z");
    const base = { entity: "limit_fixture", entityId: token, documentId: token, detail: {}, prunedAt, prunedBy: "e2e-limit" };
    const values = [
      ...Array.from({ length: 5_000 }, () => ({ ...base, actionType: "settings_change" })),
      { ...base, actionType: "cert_view" },
    ];
    for (let at = 0; at < values.length; at += 1000) await db.insert(actionLog).values(values.slice(at, at + 1000));

    await loginAsSysadmin(page);
    const reason = "5,000건 넘음 · 기간이나 필터로 줄이기";
    const timings: Record<string, number> = {};

    for (const width of [1280, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      const started = Date.now();
      await page.goto(`/admin/action-log?includePruned=1&documentId=${token}`);
      const button = page.getByRole("button", { name: "Excel 내보내기" });
      await expect(button).toBeVisible();
      timings[`5001@${width}`] = Date.now() - started;
      await expect(button).toHaveAttribute("aria-disabled", "true");
      const describedBy = await button.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      await expect(page.locator(`[id="${describedBy ?? ""}"]`)).toHaveText(reason);
    }

    for (const width of [1280, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      const started = Date.now();
      await page.goto(`/admin/action-log?includePruned=1&documentId=${token}&actionType=settings_change`);
      const button = page.getByRole("button", { name: "Excel 내보내기" });
      await expect(button).toBeVisible();
      timings[`5000@${width}`] = Date.now() - started;
      await expect(button).not.toHaveAttribute("aria-disabled", "true");
      await expect(page.getByText(reason)).toHaveCount(0);
    }

    // 기본 보기(정리 행 뺌)에는 이 행들이 없다.
    await page.goto(`/admin/action-log?documentId=${token}`);
    await expect(page.getByText("조건에 맞는 건이 없습니다")).toBeVisible();
    console.log(`W13 행동 로그 렌더 시간(ms) goto → 내보내기 보임: ${JSON.stringify(timings)}`);
  });

  // #319 B-1 — 이유 줄이 단추를 눌러 좁히면 글자가 단추 밖으로 넘친다. 폰(375 · 320)에서 단추 글자는 한 줄 · 단추 안이고 이유는 단추 아래 줄이다.
  async function labelOf(button: Locator): Promise<{ lines: number; overflowX: number; overflowY: number }> {
    return button.evaluate((node) => {
      const tops = new Set<number>();
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        if (!text.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        for (const rect of range.getClientRects()) if (rect.width > 0) tops.add(Math.round(rect.top));
      }
      return { lines: tops.size, overflowX: node.scrollWidth - node.clientWidth, overflowY: node.scrollHeight - node.clientHeight };
    });
  }

  test("폰 375 · 320 — 단추 글자는 한 줄 · 단추 안, 이유는 단추 아래 줄 (#319 B-1)", async ({ page }) => {
    test.setTimeout(120_000);
    const token = `e2e-limit-phone-${randomUUID()}`;
    const base = { entity: "limit_fixture", entityId: token, documentId: token, detail: {}, prunedAt: new Date("2026-10-01T00:00:00Z"), prunedBy: "e2e-limit" };
    const values = Array.from({ length: 5_001 }, () => ({ ...base, actionType: "settings_change" }));
    for (let at = 0; at < values.length; at += 1000) await db.insert(actionLog).values(values.slice(at, at + 1000));
    await loginAsSysadmin(page);
    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/admin/action-log?includePruned=1&documentId=${token}`);
      const button = page.getByRole("button", { name: "Excel 내보내기" });
      await expect(button).toHaveAttribute("aria-disabled", "true");
      const label = await labelOf(button);
      expect(label, `단추 글자 @${width}`).toEqual({ lines: 1, overflowX: 0, overflowY: 0 });
      const describedBy = await button.getAttribute("aria-describedby");
      const reason = page.locator(`[id="${describedBy ?? ""}"]`);
      const buttonBox = await button.boundingBox();
      const reasonBox = await reason.boundingBox();
      expect(reasonBox!.y, `이유 줄은 단추 아래 @${width}`).toBeGreaterThanOrEqual(buttonBox!.y + buttonBox!.height - 1);
      const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    }
  });

  // #319 P3 ① — 화면은 활성(5,000행)인데 서버가 사이에 늘어난 행으로 거부하면, 서버가 보낸 사유 문장을 그대로 보인다(일반 실패 문구 아님).
  test("서버가 5,000건 상한으로 거부하면 그 사유를 보인다 (#319 P3)", async ({ page }) => {
    test.setTimeout(120_000);
    const token = `e2e-limit-reject-${randomUUID()}`;
    const base = { entity: "limit_fixture", entityId: token, documentId: token, detail: {}, prunedAt: new Date("2026-10-01T00:00:00Z"), prunedBy: "e2e-limit", actionType: "settings_change" };
    const values = Array.from({ length: 5_000 }, () => ({ ...base }));
    for (let at = 0; at < values.length; at += 1000) await db.insert(actionLog).values(values.slice(at, at + 1000));
    await loginAsSysadmin(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/admin/action-log?includePruned=1&documentId=${token}`);
    const button = page.getByRole("button", { name: "Excel 내보내기" });
    await expect(button).not.toHaveAttribute("aria-disabled", "true");
    await db.insert(actionLog).values({ ...base });
    await button.click();
    await expect(page.getByText("5,000건 넘음 · 기간이나 필터로 줄이기")).toBeVisible();
    await expect(page.getByText("Excel 내보내기 · 실패 · 다시 시도")).toHaveCount(0);
  });
});
