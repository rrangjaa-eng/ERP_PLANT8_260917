import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

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
