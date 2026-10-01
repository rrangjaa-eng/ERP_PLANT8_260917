import { test, expect, type Locator, type Page } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { archivePerson } from "@/domain/people";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { collapsedRowOf, loginAsAdmin, personRow, registerPerson, statusCell } from "./people-list-helpers";

// MAST-02: 사람 등록 화면에서 이름·이메일·계급·팀·발령일을 채워 등록하면 같은
// 화면에서 계정과 초기 비밀번호가 함께 발급되고, 그 계정으로 실제 로그인이
// 되는 것이 「같은 화면에서 발급한다」의 진짜 증명이다.
test.describe("사람 등록 → 계정·초기 비밀번호 발급 → 로그인 (MAST-02)", () => {
  test("시스템 관리자가 사람을 등록하면 초기 비밀번호가 보이고 그 계정으로 실제 로그인이 된다", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const response = await page.goto("/admin/people");
    expect(response?.status()).toBe(200);

    // 2026-09-21 스테이징 QA 수정: 등록 폼이 기본 진입에는 없다(§6-1) —
    // 목록 머리글의 「사람 등록」이 그 폼을 연다.
    await expect(page.getByLabel("이름")).toHaveCount(0);
    await page.getByRole("link", { name: "사람 등록" }).click();

    const newEmail = `e2e-person-${Date.now()}@example.test`;
    await page.getByLabel("이름").fill("이영희");
    await page.getByLabel("이메일").fill(newEmail);
    await page.getByLabel("계급").selectOption(DEFAULT_ROLE_ID);
    await page.getByLabel("팀").selectOption({ label: "기획본부 · 기획1팀" });
    await page.getByLabel("발령일").fill("2026-01-01");
    await page.getByLabel("입사일").fill("2026-01-01");
    await page.getByRole("button", { name: "사람 등록" }).click();

    await expect(page.getByText(`초기 비밀번호 — ${newEmail}`)).toBeVisible();
    await expect(page.getByText("이 비밀번호는 다시 볼 수 없습니다 · 지금 전달하세요")).toBeVisible();

    const tempPasswordText = await page.getByText(/^[A-Za-z0-9_-]{10,}$/).first().textContent();
    expect(tempPasswordText).toBeTruthy();
    const tempPassword = tempPasswordText!.trim();

    await page.goto("/account");
    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel("이메일").fill(newEmail);
    await page.getByLabel("비밀번호").fill(tempPassword);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText(newEmail)).toBeVisible();
  });

  test("기본 계급(기획 PM)으로는 사람 화면이 404다", async ({ page }) => {
    const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(pm.email);
    await page.getByLabel("비밀번호").fill(pm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const response = await page.goto("/admin/people");
    expect(response?.status()).toBe(404);
  });
});

// 04.4-05 Task 2(D8-07 · UI-SPEC 배지 조합 · Responsive · Typography 범위 한정): PC 폭.
function ratio(style: { lineHeight: string; fontSize: string }): number {
  return parseFloat(style.lineHeight) / parseFloat(style.fontSize);
}

function tokenNumber(page: Page, name: string): Promise<number> {
  return page.evaluate(
    (token) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(token)),
    name,
  );
}

// 토큰 값을 브라우저 계산 색 문자열(rgb(...))로 바꿔 비교한다.
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

function styleOf(locator: Locator) {
  return locator.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      lineHeight: cs.lineHeight,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      textAlign: cs.textAlign,
      whiteSpace: cs.whiteSpace,
      background: cs.backgroundColor,
      borderBottomWidth: cs.borderBottomWidth,
    };
  });
}

test.describe("사람 목록 로그인 상태 배지 · 행 머리글 (04.4-05, D8-07)", () => {
  test("새로 등록한 사람은 두 배지가 한 줄, 로그인한 관리자는 「첫 로그인 전」이 없다", async ({ page }) => {
    const admin = await loginAsAdmin(page);
    const email = await registerPerson(page, "배지한줄대상");

    const row = personRow(page, email);
    await expect(row.getByRole("rowheader", { name: "배지한줄대상" })).toBeVisible();
    const status = statusCell(row);
    await expect(status).toHaveText("첫 로그인 전 · 임시 비밀번호 사용 중");
    const first = await status.getByText("첫 로그인 전", { exact: true }).boundingBox();
    const second = await status.getByText("임시 비밀번호 사용 중", { exact: true }).boundingBox();
    expect(first!.y).toBe(second!.y);

    // 두 배지 사이 구분자는 배지와 같은 크기·색이다(본문 크기·색이면 배지보다 크고 진하다, /review 디자인 지적).
    const glyph = (el: Element) => ({ fontSize: getComputedStyle(el).fontSize, color: getComputedStyle(el).color });
    const badgeGlyph = await status.getByText("첫 로그인 전", { exact: true }).evaluate(glyph);
    const sepGlyph = await status.getByText("·", { exact: true }).evaluate(glyph);
    expect(sepGlyph).toEqual(badgeGlyph);

    await expect(personRow(page, admin.email)).toBeVisible();
    await expect(statusCell(personRow(page, admin.email))).not.toContainText("첫 로그인 전");

    // 접힌 줄은 PC에서 숨고, 이메일 셀은 접근성 트리에 한 번만 나온다(행 이름은 셀 글자를 이어 붙이므로 셀 줄로 센다).
    await expect(collapsedRowOf(row)).toBeHidden();
    const snapshot = await page.locator("table").ariaSnapshot();
    const cellLines = snapshot.split("\n").filter((line) => line.includes("cell ") && line.includes(email));
    expect(cellLines).toHaveLength(1);
    expect(snapshot).not.toContain(`이메일 ${email}`);

    // 행에 마우스를 올리면 행 머리글도 같은 행 셀과 같은 배경이다.
    await row.locator("td").first().hover();
    const th = await styleOf(row.locator("th[scope='row']"));
    const td = await styleOf(row.locator("td").first());
    expect(td.background).toBe(await tokenAsColor(page, "--surface"));
    expect(th.background).toBe(td.background);
  });

  test("보관된 사람은 「보관됨」 하나만 보인다", async ({ page }) => {
    await loginAsAdmin(page);
    const email = `e2e-archived-${Date.now()}@example.test`;
    const { userId } = await createAccount(SYSTEM_VIEWER, { email, name: "보관배지대상", roleId: DEFAULT_ROLE_ID });
    await archivePerson(SYSTEM_VIEWER, userId);

    await page.goto("/admin/people");
    await expect(statusCell(personRow(page, email))).toHaveText("보관됨");
  });

  test("목록 표의 머리글 · 행 머리글 · 셀이 --lh-table이고 행 머리글은 셀과 같은 글자다", async ({ page }) => {
    await loginAsAdmin(page);
    const email = await registerPerson(page, "줄높이대상");
    const lhTable = await tokenNumber(page, "--lh-table");

    const row = personRow(page, email);
    const head = await styleOf(page.locator("thead th").first());
    const rowHeader = await styleOf(row.locator("th[scope='row']"));
    const cell = await styleOf(row.locator("td").first());
    expect(ratio(head)).toBeCloseTo(lhTable, 2);
    expect(ratio(rowHeader)).toBeCloseTo(lhTable, 2);
    expect(ratio(cell)).toBeCloseTo(lhTable, 2);

    expect(rowHeader.fontWeight).toBe("400");
    expect(rowHeader.textAlign).toBe("left");
    expect(rowHeader.whiteSpace).not.toBe("nowrap");
    expect(rowHeader.fontSize).toBe(cell.fontSize);
  });

  test("계급 화면 표는 그대로 --lh-body이고 열 머리글은 nowrap · 굵게 · 굵은 아래선이다", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/people/roles");
    const lhBody = await tokenNumber(page, "--lh-body");
    const fwMedium = await tokenNumber(page, "--fw-medium");
    const lineStrong = await tokenNumber(page, "--line-w-strong");

    const head = await styleOf(page.locator("table thead th").first());
    const cell = await styleOf(page.locator("table tbody td").first());
    expect(ratio(head)).toBeCloseTo(lhBody, 2);
    expect(ratio(cell)).toBeCloseTo(lhBody, 2);
    expect(head.whiteSpace).toBe("nowrap");
    expect(Number(head.fontWeight)).toBe(fwMedium);
    expect(parseFloat(head.borderBottomWidth)).toBe(lineStrong);
  });
});

test.describe("PC 1280 — 「상세」와 「삭제」 사이가 --s-4 이상이다 (DR-7)", () => {
  test("한 행의 「상세」 링크 오른쪽 끝과 「삭제」 버튼 왼쪽 끝 간격이 --s-4 이상이다", async ({ page }) => {
    // 다른 열이 긴 행이 있어도 「삭제」가 「상세」 아래로 내려가지 않는다(wrap이면 표가 이 칸을 최소 폭으로 눌렀다).
    await createAccount(SYSTEM_VIEWER, {
      email: `e2e-${"x".repeat(70)}-${Date.now()}@${"long".repeat(15)}.test`,
      name: "가".repeat(60),
      roleId: DEFAULT_ROLE_ID,
    });
    await loginAsAdmin(page);
    const email = await registerPerson(page, "간격대상");
    const gapToken = await tokenNumber(page, "--s-4");

    const row = personRow(page, email);
    const detail = await row.getByRole("link", { name: "상세" }).boundingBox();
    const remove = await row.getByRole("button", { name: "삭제" }).boundingBox();
    if (!detail || !remove) throw new Error("「상세」 또는 「삭제」 상자를 잴 수 없다");
    const gap = remove.x - (detail.x + detail.width);
    expect(gap, `「상세」↔「삭제」 간격 ${gap}px`).toBeGreaterThanOrEqual(gapToken - 0.5);
    // 칸이 눌려도 「상세」 글자가 두 줄(「상」/「세」)로 쪼개지지 않는다.
    const detailLines = await row.getByRole("link", { name: "상세" }).evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
    });
    expect(detailLines, "「상세」 글자 줄 수").toBe(1);
  });
});

test.describe("PC — 「삭제」 확인 줄이 표를 가로로 넘치게 하지 않는다 (/review Red Team)", () => {
  for (const width of [768, 1024, 1280]) {
    test(`${width}: 「삭제」를 누른 뒤에도 페이지 가로 넘침이 없다`, async ({ page }) => {
      // 다른 열이 긴 행이 있어야 동작 칸이 눌린다 — 앞 테스트가 남긴 데이터에 기대지 않는다.
      await createAccount(SYSTEM_VIEWER, {
        email: `e2e-${"x".repeat(70)}-${Date.now()}@${"long".repeat(15)}.test`,
        name: "가".repeat(60),
        roleId: DEFAULT_ROLE_ID,
      });
      await page.setViewportSize({ width, height: 800 });
      await loginAsAdmin(page);
      const email = await registerPerson(page, `확인줄대상${width}`);
      const row = personRow(page, email);
      await row.getByRole("button", { name: "삭제" }).click();
      await expect(row.getByRole("button", { name: "취소" })).toBeVisible();
      const overflow = await page.evaluate(() => {
        const scroller = document.scrollingElement ?? document.documentElement;
        return scroller.scrollWidth - scroller.clientWidth;
      });
      expect(overflow, `${width}px 가로 넘침 ${overflow}px`).toBeLessThanOrEqual(0);
      // 조상이 넘침을 가려도 잡히게 표 오른쪽 끝이 부모 안에 있는지 본다.
      const tableOverflow = await row.evaluate((element) => {
        const table = element.closest("table");
        const parent = table?.parentElement;
        if (!table || !parent) return Number.POSITIVE_INFINITY;
        const parentRect = parent.getBoundingClientRect();
        const style = getComputedStyle(parent);
        return table.getBoundingClientRect().right - (parentRect.right - parseFloat(style.paddingRight));
      });
      expect(tableOverflow, `${width}px 표가 부모 밖으로 ${tableOverflow}px`).toBeLessThanOrEqual(0.5);
    });
  }
});
