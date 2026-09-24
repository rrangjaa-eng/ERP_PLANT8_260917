import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor } from "@/repositories/vendors";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// Phase 4 Task 2 ⑭ — 트레이서의 한 경로 스모크: 기획 PM 로그인 → 등록 →
// 번호 부여 → 상세 → 견적 줄 서버 계산 저장. 필수 칸 유실 시 입력값 보존
// (UX-04)과 375px 가로 스크롤 0(U-1 판단)도 같은 스펙에서 단언한다.
test.describe("프로젝트 등록 → 견적 줄 저장 (Phase 4 트레이서)", () => {
  test("등록 → 번호 부여 → 상세 → 견적 줄 서버 계산 저장", async ({ page }) => {
    const vendor = await insertVendor(SYSTEM_VIEWER, {
      name: `E2E클라이언트-${Date.now()}`,
      normalizedName: `e2e클라이언트-${Date.now()}`,
    });

    const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(pm.email);
    await page.getByLabel("비밀번호").fill(pm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const response = await page.goto("/projects?new=1");
    expect(response?.status()).toBe(200);

    // UX-04 — 필수 칸(프로젝트명)을 비운 제출은 입력값을 지우지 않고
    // 제출 버튼 옆에 이유를 보인다.
    await page.getByLabel("클라이언트").selectOption({ label: vendor.name });
    const teamSelect = page.getByLabel("팀");
    await teamSelect.selectOption({ index: 1 });
    const pmSelect = page.getByLabel("담당 PM");
    await pmSelect.selectOption({ index: 1 });
    await page.getByRole("button", { name: "프로젝트 등록" }).click();
    await expect(page.getByText(/입력하세요|고르세요/).first()).toBeVisible();
    // 이미 고른 클라이언트 값이 유지된다 — 오류 뒤에도 사람이 적은 값이 남는다.
    await expect(page.getByLabel("클라이언트")).toHaveValue(vendor.id);

    const projectName = `E2E프로젝트-${Date.now()}`;
    await page.getByLabel("프로젝트명").fill(projectName);
    await page.getByRole("button", { name: "프로젝트 등록" }).click();

    // 상세로 이동 + 번호는 폼에 없던 값이 서버가 매겨 머리 줄에 보인다.
    await expect(page).toHaveURL(/\/projects\/.+/);
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
    await expect(page.getByText(/\d{5} · 상세 견적 1차/)).toBeVisible();

    // 견적 줄 표 — 첫 줄 만들기 → 소분류·항목·단가·실행가 입력 → 일괄 저장.
    // 04-04부터 표는 클릭/Enter로 편집에 들어가는 grid다(§7-3 (가)) —
    // 셀을 먼저 클릭해야 입력 요소가 나타난다(always-on 인풋이 아니다).
    await expect(page.getByText("이 프로젝트에 견적 줄이 없습니다")).toBeVisible();
    await page.getByRole("button", { name: /첫 줄 만들기/ }).click();

    // 그룹 머리글 행(예: "무대·시공")도 <td>라 role="grid" 안에서는 암묵
    // gridcell로 접근성 트리에 잡힌다 — 전역 nth()가 아니라 데이터 행
    // (tbody의 두 번째 tr, 첫 번째는 그룹 머리글) 안에서만 셀을 센다.
    const dataRow = page.locator("tbody tr").nth(1);
    const gridcell = (index: number) => dataRow.getByRole("gridcell").nth(index);

    await gridcell(1).click(); // 소분류
    await gridcell(1).getByLabel("소분류").selectOption({ index: 1 });

    await gridcell(2).click(); // 항목
    await gridcell(2).getByLabel("항목").fill("메인 스테이지 구조물 설치");
    await gridcell(2).getByLabel("항목").press("Enter");

    await gridcell(5).click(); // 단가
    // 04-02가 「단가」 칸 옆에 통화 Select(aria-label "단가 통화")를 더해
    // getByLabel의 기본 부분일치가 둘을 함께 잡는다 — exact로 좁힌다.
    await gridcell(5).getByLabel("단가", { exact: true }).fill("1200000");
    await gridcell(5).getByLabel("단가", { exact: true }).press("Enter");

    await gridcell(7).click(); // 실행가
    await gridcell(7).getByLabel("실행가").fill("800000");
    await gridcell(7).getByLabel("실행가").press("Enter");

    await page.getByRole("button", { name: /일괄 저장/ }).click();

    // 견적가 = 수량(기본 1) × 단가 = 1,200,000, 차익 = 1,200,000 − 800,000 = 400,000.
    // 브라우저는 이 값을 계산해 보내지 않았다 — 서버가 domain/money로 계산해 돌려준 값이다.
    await expect(page.getByText("1,200,000").first()).toBeVisible();
    await expect(page.getByText("400,000").first()).toBeVisible();
    await expect(page.getByText(/저장됨/)).toBeVisible();
  });

  test("375px 뷰포트에서 상세 화면의 가로 스크롤이 0이다(U-1)", async ({ page }) => {
    const vendor = await insertVendor(SYSTEM_VIEWER, {
      name: `E2E375클라이언트-${Date.now()}`,
      normalizedName: `e2e375클라이언트-${Date.now()}`,
    });
    const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });

    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(pm.email);
    await page.getByLabel("비밀번호").fill(pm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/projects?new=1");
    await page.getByLabel("클라이언트").selectOption({ label: vendor.name });
    await page.getByLabel("팀").selectOption({ index: 1 });
    await page.getByLabel("담당 PM").selectOption({ index: 1 });
    await page.getByLabel("프로젝트명").fill(`E2E375-${Date.now()}`);
    await page.getByRole("button", { name: "프로젝트 등록" }).click();
    await expect(page).toHaveURL(/\/projects\/.+/);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
