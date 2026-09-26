import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { recordAction } from "@/domain/action-log/record";
import { SYSTEM_VIEWER } from "@/domain/viewer";

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
