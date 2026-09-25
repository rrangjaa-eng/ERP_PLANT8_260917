import { test, expect, type Page } from "@playwright/test";
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
    // 04-24 — 머리 줄의 닫힌 승인 다이얼로그 부제에도 합계가 있어 표 안에서 찾는다.
    await expect(page.locator("table").getByText("1,200,000").first()).toBeVisible();
    await expect(page.locator("table").getByText("400,000").first()).toBeVisible();
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

// Phase 4 04-08 Task 1 — D-94(단축키 Windows Ctrl) · CEO 리뷰 C-06(연타·이중
// 등록) · C-07(적힌 단축키 배선) · 엔지 리뷰 C §1 P2(성공 뒤 이동 지연 중
// 재입력). project-form.tsx의 Ctrl+Enter 제출·Esc 취소가 실제로 동작하고
// 연타·지연 재입력이 두 번째 제출을 만들지 않는지를 검증한다.
test.describe("프로젝트 등록 폼 — Ctrl+Enter 제출 · Esc 취소 (Phase 4 04-08 Task 1)", () => {
  async function loginAndOpenForm(page: Page): Promise<void> {
    const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(pm.email);
    await page.getByLabel("비밀번호").fill(pm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/projects?new=1");
    // 키보드 단축키(Ctrl+Enter·Esc)는 클라이언트 컴포넌트 하이드레이션
    // 뒤에야 배선된다. 필드를 먼저 채우는 케이스(a·b·b2)는 그 자체로
    // 충분한 지연을 주지만, 아무 선행 조작 없이 곧바로 키를 누르는
    // 케이스(c)는 하이드레이션 전에 이벤트가 지나가 버릴 수 있어 실측
    // 확인 뒤 이 대기를 추가했다(systematic-debugging).
    await page.waitForLoadState("networkidle");
  }

  // 필수 네 칸(클라이언트·프로젝트명·담당 PM·팀)을 채우고 마지막 칸(팀
  // select)에 포커스를 남긴다 — 이후 마우스 클릭 없이 그 칸에서
  // Control+Enter를 누른다.
  async function fillRequiredFields(page: Page, vendorName: string, projectName: string) {
    await page.getByLabel("클라이언트").selectOption({ label: vendorName });
    await page.getByLabel("프로젝트명").fill(projectName);
    await page.getByLabel("담당 PM").selectOption({ index: 1 });
    const teamSelect = page.getByLabel("팀");
    await teamSelect.selectOption({ index: 1 });
    return teamSelect;
  }

  test("(a) 마우스 클릭 없이 마지막 칸에서 Control+Enter를 누르면 상세로 이동하고 번호가 부여된다", async ({
    page,
  }) => {
    const vendor = await insertVendor(SYSTEM_VIEWER, {
      name: `E2ECtrlEnter클라이언트-${Date.now()}`,
      normalizedName: `e2ectrlenter클라이언트-${Date.now()}`,
    });
    await loginAndOpenForm(page);
    const projectName = `E2ECtrlEnter-${Date.now()}`;
    const teamSelect = await fillRequiredFields(page, vendor.name, projectName);

    await teamSelect.press("Control+Enter");

    await expect(page).toHaveURL(/\/projects\/.+/);
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
    await expect(page.getByText(/\d{5} · 상세 견적 1차/)).toBeVisible();
  });

  test("(b) Control+Enter를 빠르게 두 번 누르면 상세로 한 번만 이동하고 같은 이름 프로젝트가 정확히 1건이다(C-06)", async ({
    page,
  }) => {
    const vendor = await insertVendor(SYSTEM_VIEWER, {
      name: `E2E연타클라이언트-${Date.now()}`,
      normalizedName: `e2e연타클라이언트-${Date.now()}`,
    });
    await loginAndOpenForm(page);
    const projectName = `E2E연타-${Date.now()}`;
    const teamSelect = await fillRequiredFields(page, vendor.name, projectName);

    await teamSelect.press("Control+Enter");
    await teamSelect.press("Control+Enter");

    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.goto(`/projects?q=${encodeURIComponent(projectName)}`);
    await expect(page.getByText(projectName, { exact: true })).toHaveCount(1);
  });

  test("(b2) 성공 뒤 상세 이동이 지연되는 사이 다시 눌러도 같은 이름 프로젝트가 정확히 1건이다(엔지 리뷰 C 공백 9)", async ({
    page,
  }) => {
    const vendor = await insertVendor(SYSTEM_VIEWER, {
      name: `E2E지연클라이언트-${Date.now()}`,
      normalizedName: `e2e지연클라이언트-${Date.now()}`,
    });
    await loginAndOpenForm(page);
    const projectName = `E2E지연-${Date.now()}`;
    const teamSelect = await fillRequiredFields(page, vendor.name, projectName);

    // 상세 이동 RSC 요청(Next.js가 붙이는 rsc 헤더가 있는 /projects/{id}
    // 요청)을 약속이 풀릴 때까지 붙잡는다 — 고정 지연(timeout)이 아니라
    // 요청 자체를 붙잡는 결정적 방식이다.
    let releaseNav: () => void = () => {};
    const navGate = new Promise<void>((resolve) => {
      releaseNav = resolve;
    });
    await page.route(/\/projects\/[^/?]+(\?.*)?$/, async (route) => {
      if (route.request().headers()["rsc"]) {
        await navGate;
      }
      await route.continue();
    });

    await teamSelect.press("Control+Enter");
    // 액션 응답은 왔지만(폼이 아직 보인다) 이동은 붙잡혀 있는 상태에서
    // 다시 누른다 — submittedRef 래치가 이 두 번째 제출을 막아야 한다.
    await expect(page.getByRole("button", { name: "프로젝트 등록" })).toBeVisible();
    await teamSelect.press("Control+Enter");
    releaseNav();

    await expect(page).toHaveURL(/\/projects\/.+/);
    await page.goto(`/projects?q=${encodeURIComponent(projectName)}`);
    await expect(page.getByText(projectName, { exact: true })).toHaveCount(1);
  });

  test("(c) 빈 폼의 칸에서 Escape를 누르면 등록 폼이 닫힌 목록 주소로 간다(C-07, DR-27 빈 폼 갈래)", async ({
    page,
  }) => {
    await loginAndOpenForm(page);
    await page.getByLabel("프로젝트명").focus();

    await page.keyboard.press("Escape");

    await expect(page).toHaveURL(/\/projects$/);
  });

  test("(c2) 프로젝트명 한 칸을 적은 뒤 Escape를 누르면 「입력 버리기」 확인이 열리고, 2차로 닫으면 값이 남으며, 다시 눌러 1차를 확정하면 목록으로 간다(UX-04 · DR-27, 04-46)", async ({
    page,
  }) => {
    await loginAndOpenForm(page);
    const projectName = `E2EEsc유지-${Date.now()}`;
    const nameField = page.getByLabel("프로젝트명");
    await nameField.fill(projectName);

    await page.keyboard.press("Escape");

    const dialog = page.getByRole("dialog", { name: "입력 버리기" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("프로젝트 등록 · 1칸")).toBeVisible();
    const primaryButton = dialog.getByRole("button", { name: "입력 버리기" });
    await expect(primaryButton).toBeFocused();

    // Escape(= 2차) — 폼이 그대로이고 값이 남으며 포커스가 프로젝트명 칸으로 돌아온다.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/projects\?new=1/);
    await expect(nameField).toHaveValue(projectName);
    await expect(nameField).toBeFocused();

    // 다시 Escape → 1차 확정 → 목록 주소.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await primaryButton.click();
    await expect(page).toHaveURL(/\/projects$/);
  });

  test("(c3) 빈 폼에서 2차 「취소 Esc」 버튼을 클릭하면 확인 없이 바로 목록으로 간다(DR-27 빈 폼 갈래)", async ({
    page,
  }) => {
    await loginAndOpenForm(page);

    await page.getByRole("button", { name: /취소/ }).click();

    await expect(page).toHaveURL(/\/projects$/);
  });

  test("(c4) 클라이언트 선택 목록을 연 채 Escape를 누르면 목록만 닫히고 폼이 유지된다(DR-27 — 내부 컨트롤 먼저)", async ({
    page,
  }) => {
    await loginAndOpenForm(page);
    const projectName = `E2E선택목록Esc-${Date.now()}`;
    await page.getByLabel("프로젝트명").fill(projectName);

    const clientSelect = page.getByLabel("클라이언트");
    await clientSelect.click(); // 네이티브 <select> 드롭다운을 연다.
    await page.keyboard.press("Escape");

    // 「내부 컨트롤 먼저」 — 열린 네이티브 목록이 Esc를 먼저 처리했으면
    // 폼은 그대로이고(「입력 버리기」 확인이 뜨지 않는다) 값도 남는다.
    await expect(page.getByRole("dialog", { name: "입력 버리기" })).toBeHidden();
    await expect(page).toHaveURL(/\/projects\?new=1/);
    await expect(page.getByLabel("프로젝트명")).toHaveValue(projectName);
  });
});
