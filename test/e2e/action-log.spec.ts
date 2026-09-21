import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";

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
    await page.goto("/admin/code-tables");
    await page.getByLabel("값").fill(codeValue);
    await page.getByLabel("이름").fill("행동 로그 E2E");
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

    // 정리 — 두 단계 제출. 첫 클릭이 확인 줄을 열고, 확인 문구가 정리 기록이
    // 남는다는 사실을 명시한다.
    await page.getByRole("button", { name: "정리" }).click();
    await expect(page.getByText(/건을 정리합니다 · 정리 기록은 남습니다/)).toBeVisible();
    await page.getByRole("button", { name: "정리" }).click();

    // 정리 후 같은 필터에서 빠진다.
    await expect(page.getByText("조건에 맞는 건이 없습니다")).toBeVisible();

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
    await page.goto("/admin/code-tables");
    await page.getByLabel("값").fill(codeValue);
    await page.getByLabel("이름").fill("빈 파라미터 E2E");
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

    await page.getByRole("button", { name: "정리" }).click();
    await expect(page.getByText(/건을 정리합니다 · 정리 기록은 남습니다/)).toBeVisible();
    await page.getByRole("button", { name: "정리" }).click();
    await expect(page.getByText("정리하지 못했습니다 · 다시 시도")).toHaveCount(0);
    await expect(page.getByRole("cell", { name: "문서 생성" })).toHaveCount(0);
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
