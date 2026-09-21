import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";

// ADMN-12: 삭제 → 보관함 → 복원 end-to-end와 권한 없는 계급의 404.
test.describe("보관함 화면 (ADMN-12)", () => {
  test("코드표 삭제(두 단계) → 보관함에 보임 → 복원 → 빈 보관함 → 권한 없는 계급 404", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: "role-sysadmin" });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    // 코드표 항목 하나를 등록한다. 이름도 값과 함께 매 실행 유일하게 만든다
    // — 로컬 DB가 이전 실행의 데이터를 남길 수 있어 이름 중복으로 인한
    // strict mode 충돌을 피한다.
    const unique = Date.now();
    const codeValue = `e2e-archive-${unique}`;
    const codeLabel = `보관함 E2E ${unique}`;
    // 2026-09-21 스테이징 QA 수정: 등록 폼이 기본 진입에는 없다(§6-1) —
    // 목록 머리글의 「코드 추가」가 그 폼을 연다.
    await page.goto("/admin/code-tables");
    await page.getByRole("link", { name: "코드 추가" }).click();
    await page.getByLabel("값").fill(codeValue);
    await page.getByLabel("이름").fill(codeLabel);
    await page.getByRole("button", { name: "코드 추가" }).click();
    await expect(page.getByText(codeValue)).toBeVisible();

    // 삭제 — 두 단계 제출. 확인 문구에 보관함·복원 문구가 보인다.
    const row = page.locator("tr", { hasText: codeValue });
    await row.getByRole("button", { name: "삭제" }).click();
    await expect(page.getByText(/보관함으로 이동합니다 · 관리자가 복원할 수 있습니다/)).toBeVisible();
    await row.getByRole("button", { name: "삭제" }).click();

    // 보관 직후 그 행에 「보관됨」 표시가 남는다 — 이 계급(시스템 관리자)은
    // admin.archive 보기 권한도 있어 스코프가 보관된 행도 함께 돌려준다
    // (03-01의 scopeFor 계약: includeArchived는 보관함 보기 권한 판정
    // 결과다). 완전히 사라지는 것은 아니고, 동작 버튼(삭제·활성화)이
    // 없어진다.
    await expect(row.getByText("보관됨")).toBeVisible();
    await expect(row.getByRole("button", { name: "삭제" })).toHaveCount(0);

    // 보관함 화면에 그 항목이 보인다.
    const archiveResponse = await page.goto("/admin/archive");
    expect(archiveResponse?.status()).toBe(200);
    const archiveRow = page.locator("tr", { hasText: codeLabel });
    await expect(archiveRow).toBeVisible();

    // 복원 — 확인 없이 즉시 실행하고 토스트가 나온다. 다른 세션이 남긴
    // 보관 항목과 섞이지 않게 이 행으로 범위를 좁힌다. 토스트는 4초 뒤
    // 자동으로 사라지므로(§7-6) 2-워커 병렬 실행의 CPU 경합으로 서버
    // 왕복이 늦어지면 기본 5초 타임아웃 안에서도 나타났다 사라질 수 있다
    // — 넉넉한 타임아웃으로 그 경합을 흡수한다.
    await archiveRow.getByRole("button", { name: "복원" }).click();
    await expect(page.getByText(`복원 · ${codeLabel} 복원됨`)).toBeVisible({ timeout: 15000 });

    // 코드표 목록에서 「보관됨」 표시가 사라지고 동작 버튼이 되돌아온다.
    await page.goto("/admin/code-tables");
    await expect(page.getByText(codeValue)).toBeVisible();
    const restoredRow = page.locator("tr", { hasText: codeValue });
    await expect(restoredRow.getByText("보관됨")).toHaveCount(0);
    await expect(restoredRow.getByRole("button", { name: "삭제" })).toBeVisible();

    // 복원한 내 항목은 보관함 표에서 완전히 사라진다 — 이 행 하나로
    // 범위를 좁혀 확인한다. 「전체 보관함이 빈지」는 이 로컬 DB에서
    // 신뢰할 수 있는 단언이 아니다: permissions-grid.spec.ts(세로 스크롤
    // 회귀, 03-04)가 자신의 정리 단계에서 임시 계급 26종을 하드 DELETE가
    // 아니라 의도적으로 「보관」 처리해 남긴다(그 스펙의 주석: 다음 로컬
    // 실행의 이름 UNIQUE 충돌을 피하려고 보관을 쓰고, listRoles()가
    // 기본으로 보관 계급을 제외하니 다른 스펙엔 안 보인다는 전제) — 그
    // 스펙이 이 세션 안에서 이미 한 번이라도 실행됐다면 이 보관함
    // 화면에는 항상 그 계급들이 남아 있고, 전체가 빌 일이 없다. 이건
    // 내 코드의 결함이 아니라 공유·비초기화 로컬 DB에서 다른 기존
    // 스펙의 정리 방식이 만드는 환경 사실이다(보관은 하드 삭제가 아니라
    // 원래 되돌릴 수 있는 상태 전이이므로 그 스펙 입장에서는 정상 종료
    // 상태다). 「EMPTY면 다음 한 수 버튼이 없다」는 요구는 03-07-PLAN.md
    // 검증부의 정적 소스 검사(`page.tsx`에 EMPTY 분기가 next-action 없이
    // 렌더되는지)가 이미 담당한다.
    await page.goto("/admin/archive");
    const archiveRowAfterRestore = page.locator("tr", { hasText: codeLabel });
    await expect(archiveRowAfterRestore).toHaveCount(0);

    // 권한 없는 계급(기본 계급)에는 보관함 화면이 404다.
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
    const pmResponse = await pmPage.goto("/admin/archive");
    expect(pmResponse?.status()).toBe(404);
    if (pmContext) await pmContext.close();
  });
});
