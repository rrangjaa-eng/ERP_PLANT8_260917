import { randomBytes, randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { archiveE2EFieldDefinitions, createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { nextSortOrder } from "@/domain/custom-fields/targets";
import { upsertPermission } from "@/repositories/permissions";
import { insertFieldDefinition, listFieldDefinitions } from "@/repositories/field-definitions";
import { insertRole, setRoleArchived } from "@/repositories/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// 04.5-01 트레이서 + 04.5-08: 관리 화면에서 추가한 거래처 칸이 거래처 폼에 한글 이름으로 보이고,
// 목록 표 · 등록 폼의 모든 상태(빈 상태 기본값 · 칸 오류 · 이름 예약 · 이유 자리 · 잠금 · 결과 줄)가 UI-SPEC 문구 그대로 보인다.
// 시스템 관리자의 admin.field-definitions view·write는 시드(globalSetup)가 준다(04.5-09) — 권한 행을 따로 넣지 않는다.
const MENU = "admin.field-definitions";
// 이 스펙이 만든 칸은 afterAll이 보관한다 — 다른 스펙은 자기 접두를 쓴다. 「이름」이라는 글자를 넣지 않는다
// (vendors.spec.ts의 getByLabel("이름")이 부분 일치로 센다). 이름 상한 20자 안이다.
const PREFIX = "E2E칸";

type Account = { email: string; password: string };
let admin: Account;
let pm: Account;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
});

test.afterAll(async () => {
  await archiveE2EFieldDefinitions(PREFIX);
});

async function login(page: Page, account: Account): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

const uniqueLabel = () => `${PREFIX}${randomBytes(3).toString("hex")}`;

async function seedField(label: string, sortOrder = 1): Promise<string> {
  const key = `cf_${randomBytes(4).toString("hex")}`;
  await insertFieldDefinition(SYSTEM_VIEWER, {
    id: `fd-${randomUUID()}`,
    entity: "vendor",
    key,
    label,
    type: "text",
    sortOrder,
  });
  return key;
}

async function seedSelectField(label: string, options: string[]): Promise<string> {
  const id = `fd-${randomUUID()}`;
  await insertFieldDefinition(SYSTEM_VIEWER, {
    id,
    entity: "vendor",
    key: `cf_${randomBytes(4).toString("hex")}`,
    label,
    type: "select",
    options,
    sortOrder: 1,
  });
  return id;
}

async function expectedDefaultSortOrder(): Promise<number> {
  const defs = await listFieldDefinitions(SYSTEM_VIEWER, "vendor");
  return nextSortOrder(defs.filter((def) => def.archivedAt === null).map((def) => def.sortOrder));
}

// 임시 계급 — 기획 PM의 칸을 켜면 같은 순간 다른 워커의 권한 스펙이 깨진다(vendors.spec.ts 선례).
async function createTempRoleUser(
  cells: Array<{ menu: string; action: "view" | "write"; allowed: boolean }>,
): Promise<{ account: Account; roleId: string }> {
  const roleId = `role-e2e-fd-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id: roleId, name: `E2E 임시 계급 ${roleId.slice(-12)}`, sortOrder: 99 });
  for (const cell of cells) {
    await upsertPermission(SYSTEM_VIEWER, { roleId, ...cell });
  }
  return { account: await createFixtureUser({ roleId }), roleId };
}

test("화면 항목을 추가하면 거래처 폼에 그 한글 이름으로 보이고 키는 보이지 않는다", async ({ page }) => {
  await login(page, admin);
  const label = uniqueLabel();

  // 04.5-09: 여정은 「관리」 인덱스에서 시작한다 — 마스터 그룹 「화면 항목」 → 「화면 항목 추가」.
  await page.goto("/admin");
  await page.getByRole("link", { name: "화면 항목", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/field-definitions$/);
  await page.getByRole("link", { name: "화면 항목 추가", exact: true }).first().click();
  await expect(page).toHaveURL(/\/admin\/field-definitions\?new=1$/);
  await page.getByLabel("이름", { exact: true }).fill(label);
  await page.getByLabel("타입", { exact: true }).selectOption({ label: "텍스트" });
  await page.getByLabel("정렬 순서", { exact: true }).fill("1");
  await page.getByRole("button", { name: "화면 항목 추가" }).click();
  await expect(page.getByRole("status").filter({ hasText: `화면 항목 추가 · ${label} 추가됨` })).toBeVisible();

  await page.goto("/admin/vendors?new=1");
  await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  await expect(page.locator("#main-content")).not.toContainText(/cf_[0-9a-f]{8}/);
});

test("목록 표: 이름 행 머리글 · 타입 · 필수 · 정렬 · 선택지 · 상태 열이 있고 키는 보이지 않으며 긴 이름은 anywhere로 줄바꿈된다", async ({ page }) => {
  await login(page, admin);
  const longLabel = `${PREFIX}${randomBytes(8).toString("hex")}`;
  expect(longLabel).toHaveLength(20);
  const key = await seedField(longLabel, 7);

  await page.goto("/admin/field-definitions");

  const table = page.getByRole("table", { name: "화면 항목" });
  await expect(table).toBeVisible();
  await expect(table.locator("caption")).toHaveClass(/sr-only/);
  const headers = await table.locator("thead th").allTextContents();
  expect(headers).toEqual(["이름", "타입", "필수", "정렬", "선택지", "상태", "동작"]);

  const rowHeader = table.locator('tbody th[scope="row"]', { hasText: longLabel });
  await expect(rowHeader).toBeVisible();
  const row = table.locator("tbody tr", { has: page.locator('th[scope="row"]', { hasText: longLabel }) });
  await expect(row.locator("td").nth(0)).toHaveText("텍스트");
  await expect(row.locator("td").nth(1)).toHaveText("—");
  await expect(row.locator("td").nth(2)).toHaveText("7");
  await expect(row.locator("td").nth(3)).toHaveText("—");
  await expect(row.locator("td").nth(4)).toHaveText("—");

  expect(await rowHeader.evaluate((el) => getComputedStyle(el).overflowWrap)).toBe("anywhere");
  await expect(page.locator("#main-content")).not.toContainText(key);
  await expect(page.locator("#main-content")).not.toContainText(/cf_[0-9a-f]{8}/);
});

test("등록 폼은 빈 상태 없이 열린다 — 타입 텍스트 · 정렬 순서 활성 최대값 + 1", async ({ page }) => {
  await login(page, admin);
  await seedField(uniqueLabel(), 5);
  const expected = await expectedDefaultSortOrder();

  await page.goto("/admin/field-definitions?new=1");

  await expect(page.getByLabel("타입", { exact: true })).toHaveValue("text");
  await expect(page.getByLabel("정렬 순서", { exact: true })).toHaveValue(String(expected));
  await expect(page.getByLabel("이름", { exact: true })).toBeFocused();
  await expect(page.getByLabel("이름", { exact: true })).toHaveAttribute("maxlength", "20");
});

test("칸 오류는 해당 칸 아래에 보이고 입력값은 그대로 남는다", async ({ page }) => {
  await login(page, admin);
  const existing = uniqueLabel();
  await seedField(existing, 2);

  await page.goto("/admin/field-definitions?new=1");
  const name = page.getByLabel("이름", { exact: true });
  const sort = page.getByLabel("정렬 순서", { exact: true });
  const submit = page.getByRole("button", { name: "화면 항목 추가" });

  await name.fill("   ");
  await sort.fill("1000");
  await submit.click();
  await expect(page.getByText("이름 비어 있음 · 화면 항목 이름 적기")).toBeVisible();
  await expect(page.getByText("0~999 사이 정수 아님 · 숫자 고치기")).toBeVisible();
  await expect(sort).toHaveValue("1000");
  await expect(name).toHaveAttribute("aria-invalid", "true");

  await sort.fill("");
  await submit.click();
  await expect(page.getByText("0~999 사이 정수 아님 · 숫자 고치기")).toBeVisible();

  await name.fill(existing);
  await sort.fill("3");
  await submit.click();
  await expect(page.getByText("같은 이름의 화면 항목 있음 · 이름 바꾸기")).toBeVisible();
  await expect(name).toHaveValue(existing);
  await expect(sort).toHaveValue("3");
});

test("보관된 칸과 같은 이름이면 시스템 관리자에게 「보관함에서 복원」 링크가 보인다", async ({ page }) => {
  await login(page, admin);
  const archivedLabel = uniqueLabel();
  await seedField(archivedLabel, 4);
  await archiveE2EFieldDefinitions(archivedLabel);

  await page.goto("/admin/field-definitions?new=1");
  await page.getByLabel("이름", { exact: true }).fill(archivedLabel);
  await page.getByRole("button", { name: "화면 항목 추가" }).click();

  const error = page.locator("#fd-name-error");
  await expect(error).toContainText("보관함에 같은 이름의 화면 항목 있음 ·");
  await expect(error.getByRole("link", { name: "보관함에서 복원" })).toHaveAttribute("href", "/admin/archive");
  await expect(page.getByLabel("이름", { exact: true })).toHaveAttribute("aria-describedby", "fd-name-error");
});

test("보관함 보기 권한이 없는 쓰기 계급에게는 같은 이름 오류가 「이름 바꾸기」 평문이고 복원 링크가 없다", async ({ page }) => {
  const archivedLabel = uniqueLabel();
  await seedField(archivedLabel, 4);
  await archiveE2EFieldDefinitions(archivedLabel);
  // admin.archive는 write만 주고 view는 주지 않는다 — /admin/archive가 notFound()라 링크가 막다른 길이 된다.
  const { account, roleId } = await createTempRoleUser([
    { menu: MENU, action: "view", allowed: true },
    { menu: MENU, action: "write", allowed: true },
    { menu: "admin.archive", action: "write", allowed: true },
  ]);
  try {
    await login(page, account);
    await page.goto("/admin/field-definitions?new=1");
    await page.getByLabel("이름", { exact: true }).fill(archivedLabel);
    await page.getByRole("button", { name: "화면 항목 추가" }).click();

    await expect(page.getByText("보관함에 같은 이름의 화면 항목 있음 · 이름 바꾸기")).toBeVisible();
    await expect(page.getByRole("link", { name: "보관함에서 복원" })).toHaveCount(0);
  } finally {
    await setRoleArchived(SYSTEM_VIEWER, roleId, true);
  }
});

test("제출 중 쓰기 권한이 회수되면 권한 없음 이유와 「새로 불러오기」가 보이고 1차가 비활성이며 다시 시도 글자가 없다", async ({ page }) => {
  const { account, roleId } = await createTempRoleUser([
    { menu: MENU, action: "view", allowed: true },
    { menu: MENU, action: "write", allowed: true },
  ]);
  try {
    await login(page, account);
    await page.goto("/admin/field-definitions?new=1");
    await page.getByLabel("이름", { exact: true }).fill(uniqueLabel());

    await upsertPermission(SYSTEM_VIEWER, { roleId, menu: MENU, action: "write", allowed: false });
    const submit = page.getByRole("button", { name: "화면 항목 추가" });
    await submit.click();

    const form = page.locator("#field-definition-form");
    await expect(form.getByText("추가할 수 없음 — 권한 없음 ·", { exact: false })).toHaveCount(1);
    await expect(form.getByText("추가할 수 없음")).toHaveCount(1);
    await expect(form.getByRole("button", { name: "새로 불러오기" })).toHaveCount(1);
    await expect(submit).toBeDisabled();
    await expect(form.getByText("다시 시도")).toHaveCount(0);

    await form.getByRole("button", { name: "새로 불러오기" }).click();
    // 쓰기 권한이 없어 폼이 없는 목록이다 — 404가 아니다.
    await expect(page.getByLabel("이름", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "화면 항목" })).toBeVisible();
  } finally {
    await setRoleArchived(SYSTEM_VIEWER, roleId, true);
  }
});

test("제출 중에는 1차가 진행 중이고 입력 전체와 취소가 잠긴다", async ({ page }) => {
  await login(page, admin);
  await page.goto("/admin/field-definitions?new=1");
  await page.getByLabel("이름", { exact: true }).fill(uniqueLabel());
  // 서버 액션 POST를 늦춰 제출 중 상태를 관찰한다.
  await page.route("**/admin/field-definitions*", async (route) => {
    if (route.request().method() === "POST") await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });

  const submit = page.getByRole("button", { name: "화면 항목 추가" });
  await submit.click();

  await expect(submit).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator("#field-definition-form fieldset")).toHaveAttribute("disabled", "");
  await expect(page.getByLabel("이름", { exact: true })).toBeDisabled();
  await expect(page.getByRole("link", { name: "취소" })).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "추가됨" })).toBeVisible();
});

test("성공하면 결과 줄에 포커스가 가고 입력은 읽기 전용이며 하나 더 추가는 폼을 초기 상태로 되돌린다", async ({ page }) => {
  await login(page, admin);
  const label = uniqueLabel();

  await page.goto("/admin/field-definitions?new=1");
  await page.getByLabel("이름", { exact: true }).fill(label);
  await page.getByLabel("타입", { exact: true }).selectOption({ label: "숫자" });
  await page.getByRole("button", { name: "화면 항목 추가" }).click();

  const result = page.getByRole("status").filter({ hasText: `화면 항목 추가 · ${label} 추가됨` });
  await expect(result).toBeVisible();
  await expect(result).toBeFocused();
  await expect(page.getByLabel("이름", { exact: true })).toHaveAttribute("readonly", "");
  await expect(page.getByLabel("정렬 순서", { exact: true })).toHaveAttribute("readonly", "");
  await expect(page.getByRole("link", { name: "정보 노출표 보기" })).toHaveAttribute("href", "/admin/visibility");
  await expect(page.getByRole("button", { name: "하나 더 추가" })).toBeVisible();
  await expect(page.getByRole("button", { name: "닫기" })).toBeVisible();
  // 아래 목록은 서버 재검증으로 새 행을 보인다.
  await expect(page.getByRole("table", { name: "화면 항목" }).locator('tbody th[scope="row"]', { hasText: label })).toBeVisible();

  const expected = await expectedDefaultSortOrder();
  await page.getByRole("button", { name: "하나 더 추가" }).click();
  await expect(page.getByLabel("이름", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("이름", { exact: true })).toBeFocused();
  await expect(page.getByLabel("타입", { exact: true })).toHaveValue("text");
  await expect(page.getByLabel("정렬 순서", { exact: true })).toHaveValue(String(expected));
  await expect(page.getByRole("status").filter({ hasText: "추가됨" })).toHaveCount(0);

  await page.getByLabel("이름", { exact: true }).fill(uniqueLabel());
  await page.getByRole("button", { name: "화면 항목 추가" }).click();
  await expect(page.getByRole("button", { name: "닫기" })).toBeVisible();
  await page.getByRole("button", { name: "닫기" }).click();
  await expect(page).toHaveURL(/\/admin\/field-definitions$/);
});

test("기획 PM은 화면 항목 관리와 등록 폼에서 404를 받는다", async ({ page }) => {
  await login(page, pm);

  const list = await page.goto("/admin/field-definitions");
  expect(list?.status()).toBe(404);
  const form = await page.goto("/admin/field-definitions?new=1");
  expect(form?.status()).toBe(404);
});

// 04.5-02 Task 1: 선택형 칸 — 선택지 편집기 · 서버 재판정 · 거래처 폼 반영.
test("선택형 칸: 선택지를 더해 저장하면 거래처 폼 select와 목록 선택지 열에 보인다", async ({ page }) => {
  await login(page, admin);
  const label = uniqueLabel();

  await page.goto("/admin/field-definitions?new=1");
  await page.getByLabel("이름", { exact: true }).fill(label);
  const submit = page.getByRole("button", { name: "화면 항목 추가" });
  // 타입이 텍스트일 때는 선택지 편집기가 없다.
  await expect(page.getByLabel("새 선택지", { exact: true })).toHaveCount(0);
  await page.getByLabel("타입", { exact: true }).selectOption({ label: "선택" });
  await expect(page.getByLabel("새 선택지", { exact: true })).toBeVisible();

  // 활성 0개 — 1차 비활성 + 이유 한 번.
  await expect(submit).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByText("추가할 수 없음 — 선택지 0개 · 선택지 추가")).toHaveCount(1);

  const newOption = page.getByLabel("새 선택지", { exact: true });
  await page.getByRole("button", { name: "선택지 추가", exact: true }).click();
  await expect(page.getByText("선택지 비어 있음 · 선택지 적기")).toBeVisible();

  await newOption.fill("  기본 ");
  await page.getByRole("button", { name: "선택지 추가", exact: true }).click();
  await expect(newOption).toHaveValue("");
  await expect(newOption).toBeFocused();
  await newOption.fill("특약");
  await newOption.press("Enter");
  await expect(page.getByRole("button", { name: "기본 삭제" })).toBeVisible();
  await expect(page.getByRole("button", { name: "특약 삭제" })).toBeVisible();
  // Enter는 폼을 제출하지 않는다.
  await expect(page.getByRole("status").filter({ hasText: "추가됨" })).toHaveCount(0);

  await newOption.fill("기본");
  await page.getByRole("button", { name: "선택지 추가", exact: true }).click();
  await expect(page.getByText("이미 있는 선택지 · 다른 이름 적기")).toBeVisible();

  // 저장 안 한 선택지의 삭제는 목록에서 뺀다.
  await newOption.fill("MOU");
  await newOption.press("Enter");
  await page.getByRole("button", { name: "MOU 삭제" }).click();
  await expect(page.getByRole("button", { name: "MOU 삭제" })).toHaveCount(0);
  await expect(newOption).toBeFocused();

  await expect(submit).not.toHaveAttribute("aria-disabled", "true");
  await submit.click();
  await expect(page.getByRole("status").filter({ hasText: `화면 항목 추가 · ${label} 추가됨` })).toBeVisible();

  const row = page.locator("tbody tr", { has: page.locator('th[scope="row"]', { hasText: label }) });
  await expect(row.locator("td").nth(0)).toHaveText("선택");
  await expect(row.locator("td").nth(3)).toHaveText("기본, 특약");

  await page.goto("/admin/vendors?new=1");
  const select = page.getByLabel(label, { exact: true });
  await expect(select).toBeVisible();
  const optionTexts = await select.locator("option").allTextContents();
  expect(optionTexts).toEqual(expect.arrayContaining(["기본", "특약"]));
  expect(optionTexts).not.toContain("MOU");
});

test("선택지는 30개까지이고 30개면 「선택지 추가」가 이유와 함께 비활성이다", async ({ page }) => {
  await login(page, admin);
  await page.goto("/admin/field-definitions?new=1");
  await page.getByLabel("타입", { exact: true }).selectOption({ label: "선택" });
  const newOption = page.getByLabel("새 선택지", { exact: true });
  for (let i = 0; i < 30; i += 1) {
    await newOption.fill(`선택${i}`);
    await newOption.press("Enter");
  }

  const addOption = page.getByRole("button", { name: "선택지 추가", exact: true });
  await expect(addOption).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByText("선택지는 30개까지 · 쓰지 않는 선택지 삭제")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^선택\d+ 삭제$/ })).toHaveCount(30);
  await page.getByRole("button", { name: "선택0 삭제" }).click();
  await expect(addOption).not.toHaveAttribute("aria-disabled", "true");
});

// 04.5-02 Task 2: 수정 모드 — 타입 읽기 전용 · 버전 조건부 수정 · 충돌 · 보관 · 없는 id.
test("수정: 목록 「수정」으로 열면 값이 채워지고 타입은 텍스트이며, 저장하면 결과 줄이 남고 이어서 다시 저장해도 충돌이 아니다", async ({ page }) => {
  await login(page, admin);
  const first = uniqueLabel();
  const second = uniqueLabel();
  const third = uniqueLabel();
  await seedField(first, 4);

  await page.goto("/admin/field-definitions");
  await page.getByRole("link", { name: `${first} 수정`, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/field-definitions\?editId=/);

  const form = page.locator("#field-definition-form");
  await expect(page.getByLabel("이름", { exact: true })).toHaveValue(first);
  await expect(page.getByLabel("정렬 순서", { exact: true })).toHaveValue("4");
  // 타입은 select가 아니라 텍스트이고, 타입을 바꾸는 길은 새 화면 항목 추가 링크뿐이다.
  await expect(form.locator("select")).toHaveCount(0);
  await expect(form.getByText("텍스트", { exact: true })).toBeVisible();
  await expect(form.getByRole("link", { name: "새 화면 항목 추가" })).toHaveAttribute("href", "/admin/field-definitions?new=1");
  // 폼이 열려 있으면 필터 줄 「화면 항목 추가」는 숨는다.
  await expect(page.getByRole("link", { name: "화면 항목 추가", exact: true })).toHaveCount(0);
  const version = form.locator('input[name="version"]');
  await expect(version).toHaveValue("1");

  await page.getByLabel("이름", { exact: true }).fill(second);
  await page.getByRole("button", { name: "화면 항목 수정" }).click();
  const result = page.getByRole("status").filter({ hasText: `화면 항목 수정 · ${second} 수정됨` });
  await expect(result).toBeVisible();
  // 재검증으로 새 version이 와 입력이 다시 마운트돼도 결과 줄은 남고 포커스가 있다.
  await expect(version).toHaveValue("2");
  await expect(result).toBeVisible();
  await expect(result).toBeFocused();
  await expect(page.getByLabel("이름", { exact: true })).toHaveAttribute("readonly", "");

  await page.getByRole("button", { name: "닫기" }).click();
  await expect(page).toHaveURL(/\/admin\/field-definitions$/);

  // 닫고 다시 수정으로 이어서 저장 — 새 version이라 충돌이 아니다.
  await page.getByRole("link", { name: `${second} 수정`, exact: true }).click();
  await expect(form.locator('input[name="version"]')).toHaveValue("2");
  await page.getByLabel("이름", { exact: true }).fill(third);
  await page.getByRole("button", { name: "화면 항목 수정" }).click();
  await expect(page.getByRole("status").filter({ hasText: `화면 항목 수정 · ${third} 수정됨` })).toBeVisible();
  await page.getByRole("button", { name: "닫기" }).click();

  await page.goto("/admin/vendors?new=1");
  await expect(page.getByLabel(third, { exact: true })).toBeVisible();
});

test("수정 충돌: 먼저 저장된 값을 새로 불러오기로 받는다 — 이름 · 선택지 목록이 최신이고 포커스는 이름 입력이다", async ({ page }) => {
  await login(page, admin);
  const original = uniqueLabel();
  const renamed = uniqueLabel();
  const loser = uniqueLabel();
  const id = await seedSelectField(original, ["기본", "특약"]);
  const url = `/admin/field-definitions?editId=${id}`;
  const other = await page.context().newPage();
  await page.goto(url);
  await other.goto(url);
  await expect(other.getByRole("button", { name: "특약 삭제" })).toBeVisible();

  await page.getByLabel("이름", { exact: true }).fill(renamed);
  await page.getByLabel("새 선택지", { exact: true }).fill("MOU");
  await page.getByLabel("새 선택지", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "화면 항목 수정" }).click();
  await expect(page.getByRole("status").filter({ hasText: `화면 항목 수정 · ${renamed} 수정됨` })).toBeVisible();

  await other.getByLabel("이름", { exact: true }).fill(loser);
  const submit = other.getByRole("button", { name: "화면 항목 수정" });
  await submit.click();
  const form = other.locator("#field-definition-form");
  await expect(form.getByText("수정할 수 없음 — 다른 사람이 먼저 수정함 ·", { exact: false })).toHaveCount(1);
  await expect(submit).not.toHaveAttribute("aria-disabled", "true");
  // 누르기 전까지 입력이 남는다.
  await expect(other.getByLabel("이름", { exact: true })).toHaveValue(loser);

  await form.getByRole("button", { name: "새로 불러오기" }).click();
  await expect(form.getByText("수정할 수 없음")).toHaveCount(0);
  await expect(other.getByLabel("이름", { exact: true })).toHaveValue(renamed);
  await expect(other.getByRole("button", { name: "MOU 삭제" })).toBeVisible();
  await expect(other.getByRole("button", { name: "특약 삭제" })).toBeVisible();
  await expect(other.getByLabel("이름", { exact: true })).toBeFocused();
  await other.close();
});

test("보관된 칸의 수정 폼에서 저장하면 보관 이유와 「목록으로」가 보이고 1차가 비활성이다", async ({ page }) => {
  await login(page, admin);
  const label = uniqueLabel();
  await seedField(label, 3);
  await page.goto("/admin/field-definitions");
  await page.getByRole("link", { name: `${label} 수정`, exact: true }).click();
  await expect(page.getByLabel("이름", { exact: true })).toHaveValue(label);

  await archiveE2EFieldDefinitions(label);
  const submit = page.getByRole("button", { name: "화면 항목 수정" });
  await submit.click();

  const form = page.locator("#field-definition-form");
  await expect(form.getByText("수정할 수 없음 — 보관된 화면 항목 ·", { exact: false })).toHaveCount(1);
  await expect(form.getByText("수정할 수 없음")).toHaveCount(1);
  await expect(form.getByRole("button", { name: "목록으로" })).toHaveCount(1);
  await expect(submit).toBeDisabled();
  await expect(form.getByText("다시 시도")).toHaveCount(0);

  await form.getByRole("button", { name: "목록으로" }).click();
  await expect(page).toHaveURL(/\/admin\/field-definitions$/);
  await expect(page.locator("#field-definition-form")).toHaveCount(0);
});

test("없는 editId로 오면 폼 없이 목록만 보인다", async ({ page }) => {
  await login(page, admin);
  await seedField(uniqueLabel(), 2);

  await page.goto("/admin/field-definitions?editId=없는-id");

  await expect(page.getByRole("heading", { name: "화면 항목" })).toBeVisible();
  await expect(page.locator("#field-definition-form")).toHaveCount(0);
  await expect(page.getByRole("table", { name: "화면 항목" })).toBeVisible();
});

// 04.5-02 Task 3: 선택지 삭제 = 보관 · 「보관된 선택지 N개」 펼침 · 같은 글자 재추가 = 복원.
test("저장된 선택지 「삭제」는 보관으로 가고 보관 펼침에 텍스트 + 보관됨만 보이며 다시 적으면 활성으로 돌아온다", async ({ page }) => {
  await login(page, admin);
  const label = uniqueLabel();
  const id = await seedSelectField(label, ["기본", "특약"]);

  await page.goto(`/admin/field-definitions?editId=${id}`);
  // 보관 선택지가 없으면 펼침을 렌더하지 않는다.
  await expect(page.locator("details")).toHaveCount(0);
  await page.getByRole("button", { name: "특약 삭제" }).click();
  await expect(page.getByRole("button", { name: "특약 삭제" })).toHaveCount(0);
  await expect(page.getByLabel("새 선택지", { exact: true })).toBeFocused();

  const details = page.locator("#field-definition-form details");
  await expect(details.locator("summary")).toHaveText("보관된 선택지 1개");
  await expect(details).not.toHaveAttribute("open", "");
  await details.locator("summary").click();
  await expect(details).toContainText("특약");
  await expect(details).toContainText("보관됨");
  await expect(details.getByRole("button")).toHaveCount(0);

  await page.getByRole("button", { name: "화면 항목 수정" }).click();
  await expect(page.getByRole("status").filter({ hasText: `화면 항목 수정 · ${label} 수정됨` })).toBeVisible();

  await page.goto("/admin/vendors?new=1");
  const optionTexts = await page.getByLabel(label, { exact: true }).locator("option").allTextContents();
  expect(optionTexts).toContain("기본");
  expect(optionTexts).not.toContain("특약");

  // 다시 수정 폼에서 보관 선택지와 같은 글자를 적으면 활성으로 돌아오고 펼침이 사라진다.
  await page.goto(`/admin/field-definitions?editId=${id}`);
  await expect(page.locator("details summary")).toHaveText("보관된 선택지 1개");
  const newOption = page.getByLabel("새 선택지", { exact: true });
  await newOption.fill("특약");
  await newOption.press("Enter");
  await expect(page.getByRole("button", { name: "특약 삭제" })).toBeVisible();
  await expect(page.locator("details")).toHaveCount(0);
});

test("충돌 뒤 새로 불러오기는 먼저 저장된 보관 선택지를 보관 목록으로 가져온다", async ({ page }) => {
  await login(page, admin);
  const label = uniqueLabel();
  const id = await seedSelectField(label, ["기본", "특약"]);
  const url = `/admin/field-definitions?editId=${id}`;
  const other = await page.context().newPage();
  await page.goto(url);
  await other.goto(url);
  await expect(other.getByRole("button", { name: "특약 삭제" })).toBeVisible();

  await page.getByRole("button", { name: "특약 삭제" }).click();
  await page.getByRole("button", { name: "화면 항목 수정" }).click();
  await expect(page.getByRole("status").filter({ hasText: "수정됨" })).toBeVisible();

  await other.getByLabel("이름", { exact: true }).fill(uniqueLabel());
  await other.getByRole("button", { name: "화면 항목 수정" }).click();
  const form = other.locator("#field-definition-form");
  await expect(form.getByText("수정할 수 없음 — 다른 사람이 먼저 수정함 ·", { exact: false })).toHaveCount(1);

  await form.getByRole("button", { name: "새로 불러오기" }).click();
  await expect(form.getByText("수정할 수 없음")).toHaveCount(0);
  await expect(other.getByRole("button", { name: "특약 삭제" })).toHaveCount(0);
  await expect(other.getByRole("button", { name: "기본 삭제" })).toBeVisible();
  const details = form.locator("details");
  await expect(details.locator("summary")).toHaveText("보관된 선택지 1개");
  await details.locator("summary").click();
  await expect(details).toContainText("특약");
  await expect(details).toContainText("보관됨");
  await other.close();
});
