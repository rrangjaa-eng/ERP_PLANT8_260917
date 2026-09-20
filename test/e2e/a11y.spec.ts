import { test, expect, type Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// "axe-core" 자체는 @axe-core/playwright의 중첩(nested) 의존성이라 pnpm이 이 파일의
// 모듈 해석 경로에 끌어올리지 않는다 — 직접 import하지 않고 AxeBuilder.analyze()의
// 반환 타입에서 유도한다(그 타입 선언은 axe-core를 자기 위치 기준으로 정상 해석한다).
type AxeResults = Awaited<ReturnType<InstanceType<typeof AxeBuilder>["analyze"]>>;

// SYSTEM.md §10 접근성 계약을 axe-core 규칙 엔진으로 검사한다(02-07 Task 1 체크포인트
// 승인 — @axe-core/playwright@4.13.0, devDependency, 정확히 버전 고정).
//
// §10의 터치 목표 44×44 항목은 이 파일에 **없다** — 그 단언은 폰 뷰포트에서만
// 의미가 있는데 이 파일은 파일명이 "mobile-"로 시작하지 않아 desktop 프로젝트에서만
// 돈다(playwright.config.ts). 그 항목은 mobile-375 프로젝트에서 도는
// test/e2e/mobile-shell.spec.ts에 있다.
//
// 검사 대상에서 화면을 빼거나 규칙을 꺼서 "통과"를 만들지 않는다 — 위반이 나오면
// 화면(ui/*, app/*)을 고친다. 도저히 고칠 수 없으면 SUMMARY에 올린다(02-01 재계획 신호).

async function loginAs(page: Page, roleId: string): Promise<{ email: string; password: string }> {
  const user = await createFixtureUser({ roleId });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return user;
}

function formatViolations(violations: AxeResults["violations"]): string {
  return violations
    .map((v) => `[${v.impact ?? "unknown"}] ${v.id}: ${v.help} (${v.nodes.length}곳) — ${v.helpUrl}`)
    .join("\n");
}

// 검사 대상 여섯 화면 — 배열 하나, 원소 6개(아래 테스트가 개수를 단언한다). 화면을
// 빼서 위반을 피하는 일을 막기 위해 이 배열이 유일한 진입점이다.
const SCREENS: ReadonlyArray<{ name: string; goto: (page: Page) => Promise<void> }> = [
  { name: "로그인", goto: async (page) => { await page.goto("/login"); } },
  {
    name: "홈(내 차례)",
    goto: async (page) => {
      await loginAs(page, DEFAULT_ROLE_ID);
      await page.goto("/");
    },
  },
  {
    name: "내 계정",
    goto: async (page) => {
      await loginAs(page, DEFAULT_ROLE_ID);
      await page.goto("/account");
    },
  },
  {
    name: "빈 목록(프로젝트)",
    goto: async (page) => {
      await loginAs(page, DEFAULT_ROLE_ID);
      await page.goto("/projects");
    },
  },
  {
    name: "시스템 상태(관리자)",
    goto: async (page) => {
      await loginAs(page, SYSADMIN_ROLE_ID);
      await page.goto("/admin/system-status");
    },
  },
  {
    name: "404",
    goto: async (page) => {
      await loginAs(page, DEFAULT_ROLE_ID);
      await page.goto("/e2e-a11y-nonexistent-route");
    },
  },
];

test.describe("§10 접근성 계약 (axe-core)", () => {
  test("검사 대상 화면 배열이 정확히 6개다", () => {
    expect(SCREENS).toHaveLength(6);
  });

  for (const screen of SCREENS) {
    test(`${screen.name} 화면에 자동 판정 가능한 접근성 위반이 없다`, async ({ page }) => {
      await screen.goto(page);
      // 규칙 비활성(disableRules)·범위 축소(include/exclude) 없이 기본 규칙 전체로 돈다.
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, formatViolations(results.violations)).toEqual([]);
    });
  }

  // §10: 오류 셀/필드는 aria-invalid + aria-describedby로 이유를 연결한다. 02-03
  // ui/input/TextField.tsx의 aria 배선이 실행으로 검사되는 유일한 자리(그 태스크의
  // "검사 위치" 절 참고). 여섯 화면 배열의 원소가 아니라 별개의 테스트 하나다 —
  // 오류 문자열 자체는 test/e2e/change-password.spec.ts가 이미 단언하므로 여기서는
  // 반복하지 않고 ARIA 연결(id 존재·요소 실재·내용 있음)만 확인한다.
  test("필드 서버 검증 오류가 aria-invalid·aria-describedby로 실제 오류 요소에 연결된다", async ({ page }) => {
    const user = await loginAs(page, DEFAULT_ROLE_ID);
    await page.goto("/account");

    await page.getByLabel("현재 비밀번호").fill(user.password);
    await page.getByLabel("새 비밀번호").fill("short12"); // 7자 — 서버 min(8) 위반
    await page.getByRole("button", { name: "비밀번호 변경" }).click();

    const newPasswordInput = page.getByLabel("새 비밀번호");
    await expect(newPasswordInput).toHaveAttribute("aria-invalid", "true");

    const describedBy = await newPasswordInput.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();

    const errorEl = page.locator(`#${describedBy}`);
    await expect(errorEl).toBeVisible();
    const errorText = await errorEl.textContent();
    expect(errorText?.trim().length).toBeGreaterThan(0);
  });
});
