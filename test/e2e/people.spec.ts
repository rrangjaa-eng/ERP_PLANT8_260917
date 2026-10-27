import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orgUnits, users } from "@/db/schema";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { createOrgUnit } from "@/domain/org";
import { archivePerson } from "@/domain/people";
import { updateUserHireDate, updateUserRole } from "@/repositories/users";
import { seoulToday } from "@/lib/dates";
import { addDays } from "@/lib/kst-date";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { isStrict } from "./design-principles";
import { checkPrinciples } from "./principles-check";
import { collapsedRowOf, gotoPeopleRow, loginAsAdmin, personRow, registerPerson, statusCell } from "./people-list-helpers";
import { archiveRolesByPrefix, createDelegatedAccount, makeDuplicateLeads } from "./admin-cap-fixtures";

// 사람 목록이 페이지 없이 전부 그려지고 CI DB에 계정이 쌓여 느리다 — 근본 해결은 페이지네이션(07 페이즈로 이월).
test.describe.configure({ timeout: 60_000 });

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

    await expect(page.getByText(`초기 비밀번호 — ${newEmail}`)).toBeVisible({ timeout: 20_000 });
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

    await gotoPeopleRow(page, admin.email);
    await expect(personRow(page, admin.email)).toBeVisible();
    await expect(statusCell(personRow(page, admin.email))).not.toContainText("첫 로그인 전");
    await gotoPeopleRow(page, email);

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
    expect(td.background).toBe(await tokenAsColor(page, "--surface-muted"));
    expect(th.background).toBe(td.background);
  });

  test("보관된 사람은 「보관됨」 하나만 보인다", async ({ page }) => {
    await loginAsAdmin(page);
    const email = `e2e-archived-${Date.now()}@example.test`;
    const { userId } = await createAccount(SYSTEM_VIEWER, { email, name: "보관배지대상", roleId: DEFAULT_ROLE_ID });
    await archivePerson(SYSTEM_VIEWER, userId);

    await gotoPeopleRow(page, email);
    await expect(statusCell(personRow(page, email))).toHaveText("보관됨");
  });

  // 04.6-14: 목록 표가 `StaticTable`(스킨 A 표)이다 — 머리글은 본문 행간(--lh-body)을 이어받는다.
  // 웨이브 6 J3(사용자 채팅 지시 2026-10-03 22:35 KST 「1.5로 줄여」, SYSTEM §2 「표 1.5 · 산문 1.6」): 표 셀 · 행 머리글은 `.cell`이 --lh-table(1.5)을 건다 — 기대가 --lh-body에서 바뀐 이유.
  test("목록 표의 머리글은 본문 행간(--lh-body) · 행 머리글 · 셀은 표 행간(--lh-table)이고 행 머리글은 셀과 같은 글자다", async ({ page }) => {
    await loginAsAdmin(page);
    const email = await registerPerson(page, "줄높이대상");
    const lhBody = await tokenNumber(page, "--lh-body");
    const lhTable = await tokenNumber(page, "--lh-table");

    const row = personRow(page, email);
    const head = await styleOf(page.locator("thead th").first());
    const rowHeader = await styleOf(row.locator("th[scope='row']"));
    const cell = await styleOf(row.locator("td").first());
    expect(ratio(head)).toBeCloseTo(lhBody, 2);
    expect(ratio(rowHeader)).toBeCloseTo(lhTable, 2);
    expect(ratio(cell)).toBeCloseTo(lhTable, 2);

    expect(rowHeader.fontWeight).toBe("400");
    expect(rowHeader.textAlign).toBe("left");
    expect(rowHeader.whiteSpace).not.toBe("nowrap");
    expect(rowHeader.fontSize).toBe(cell.fontSize);
  });

  // 04.6-14: 계급 표가 `StaticTable`이다 — 머리글 아래 선은 1px(--line-w) · 글자는 --fw-medium이고 머리글은 한 줄이다(옛 nowrap 대신 줄 수로 잰다).
  // 웨이브 6 J3: 머리글은 --lh-body, 셀은 --lh-table(1.5) — 위 목록 표 시험과 같은 이유.
  test("계급 화면 표는 머리글 --lh-body · 셀 --lh-table이고 열 머리글은 한 줄 · 굵게 · 1px 아래선이다", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/people/roles");
    const lhBody = await tokenNumber(page, "--lh-body");
    const lhTable = await tokenNumber(page, "--lh-table");
    const fwMedium = await tokenNumber(page, "--fw-medium");
    const line = await tokenNumber(page, "--line-w");

    const head = await styleOf(page.locator("table thead th").first());
    const cell = await styleOf(page.locator("table tbody td").first());
    expect(ratio(head)).toBeCloseTo(lhBody, 2);
    expect(ratio(cell)).toBeCloseTo(lhTable, 2);
    expect(Number(head.fontWeight)).toBe(fwMedium);
    expect(parseFloat(head.borderBottomWidth)).toBe(line);
    const headerLines = await page.locator("table thead th").evaluateAll((cells) =>
      cells.map((th) => {
        const range = document.createRange();
        range.selectNodeContents(th);
        return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
      }),
    );
    expect(headerLines.every((count) => count === 1), `머리글 줄 수 ${headerLines.join(",")}`).toBe(true);
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

// 04.6-14 — 사람 · 조직 · 계급 한 건 폼이 목록을 밀지 않는 옆 패널이다(SC 3). 1차 라벨 문구는 그대로다.
function sidePanel(page: Page): Locator {
  return page.locator('dialog[data-ui="side-panel"]');
}

async function firstRowTop(page: Page): Promise<number> {
  const box = await page.locator("main tbody tr, main ul > li").first().boundingBox();
  if (!box) throw new Error("첫 행 상자를 잴 수 없다");
  return box.y;
}

test.describe("사람 · 조직 · 계급 옆 패널 (04.6-14)", () => {
  const cases = [
    { name: "사람 등록", path: "/admin/people", link: "사람 등록", title: "사람 등록", form: "#person-form" },
    { name: "본부 추가", path: "/admin/people/org", link: "본부 추가", title: "본부 추가", form: "#org-unit-form" },
    { name: "계급 추가", path: "/admin/people/roles", link: "계급 추가", title: "계급 추가", form: "#role-form" },
  ];

  for (const { name, path, link, title, form } of cases) {
    test(`「${name}」: 목록을 밀지 않고 첫 칸 포커스 · Esc로 닫으면 연 링크로 포커스가 돌아온다`, async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(path);
      const topBefore = await firstRowTop(page);
      const scrollBefore = await page.evaluate(() => window.scrollY);

      const opener = page.getByRole("link", { name: link, exact: true });
      await opener.click();
      const panel = sidePanel(page);
      // `?new=1`은 서버 화면을 다시 그린다 — CI 샤드 뒤쪽엔 앞 스펙이 만든 사람이 1,300명을 넘어(페이지 나눔 없음) 5초를 넘긴다(#187 CI 두 번).
      await expect(panel).toBeVisible({ timeout: 15_000 });
      await expect(panel.getByRole("heading", { name: title, level: 2 })).toBeVisible();
      await expect(panel.locator(`${form} input:not([type=hidden])`).first()).toBeFocused();
      expect(await firstRowTop(page)).toBe(topBefore);
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);

      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
      await expect(opener).toBeFocused();
    });
  }

  test("DR1 A: 칸 하나를 바꾼 채 Esc → 「입력 버리기」 확인 창 · 누르면 닫히고 포커스가 돌아온다", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/people/roles");
    const opener = page.getByRole("link", { name: "계급 추가", exact: true });
    await opener.click();
    await sidePanel(page).getByLabel("이름").fill("입력버릴계급");
    await page.keyboard.press("Escape");
    const confirm = page.getByRole("dialog", { name: "입력 버리기" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "입력 버리기" }).click();
    await expect(sidePanel(page)).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("실패는 패널을 유지한다 — 이름 없이 제출하면 칸 오류가 나고 패널이 열려 있다", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/people/org?new=org");
    const panel = sidePanel(page);
    await panel.locator("#org-unit-form button[type=submit]").click();
    await expect(panel.locator("#org-unit-name")).toHaveAttribute("aria-invalid", "true");
    await expect(panel).toBeVisible();
  });

  test("UQ-8 B · R9 D: 본부 · 팀 · 계급 등록 성공 → 패널이 열린 채 칸이 비고 첫 칸 포커스 · 상태 한 줄 · 목록에 새 줄", async ({ page }) => {
    await loginAsAdmin(page);
    const stamp = Date.now();

    await page.goto("/admin/people/org?new=org");
    const orgPanel = sidePanel(page);
    const orgName = `E2E패널본부-${stamp}`;
    await orgPanel.getByLabel("이름").fill(orgName);
    await orgPanel.locator("#org-unit-form button[type=submit]").click();
    await expect(orgPanel.getByRole("status")).toHaveCount(1);
    await expect(orgPanel.getByLabel("이름")).toHaveValue("");
    await expect(orgPanel.getByLabel("이름")).toBeFocused();
    await expect(page.getByLabel(`${orgName} 이름`)).toBeVisible();

    await page.goto("/admin/people/org?new=team");
    const teamPanel = sidePanel(page);
    const teamName = `E2E패널팀-${stamp}`;
    await teamPanel.locator("select[name=orgUnitId]").selectOption({ label: orgName });
    await teamPanel.getByLabel("이름").fill(teamName);
    await teamPanel.locator("#team-form button[type=submit]").click();
    await expect(teamPanel.getByRole("status")).toHaveCount(1);
    await expect(teamPanel.getByLabel("이름")).toHaveValue("");
    await expect(page.getByLabel(`${teamName} 이름`)).toBeVisible();

    await page.goto("/admin/people/roles?new=1");
    const rolePanel = sidePanel(page);
    const roleName = `E2E패널계급-${stamp}`;
    await rolePanel.getByLabel("이름").fill(roleName);
    await rolePanel.locator("#role-form button[type=submit]").click();
    await expect(rolePanel.getByRole("status")).toHaveCount(1);
    await expect(rolePanel.getByLabel("이름")).toHaveValue("");
    await expect(rolePanel.getByLabel("이름")).toBeFocused();
    await expect(page.getByLabel(`${roleName} 이름`)).toBeVisible();
  });

  test("Q3 A: 사람 등록 성공 → 패널에 남아 초기 비밀번호가 보이고 상세로 가지 않는다 · 결과의 「사람 등록」으로 빈 칸에서 이어서 입력", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/people?new=1");
    const panel = sidePanel(page);
    const email = `e2e-panel-${Date.now()}@example.test`;
    await panel.getByLabel("이름").fill("패널등록대상");
    await panel.getByLabel("이메일").fill(email);
    await panel.getByLabel("계급").selectOption(DEFAULT_ROLE_ID);
    await panel.getByLabel("입사일").fill("2026-01-01");
    await panel.getByRole("button", { name: "사람 등록" }).click();

    await expect(panel.getByText(`초기 비밀번호 — ${email}`)).toBeVisible({ timeout: 20_000 });
    await expect(panel.getByText("이 비밀번호는 다시 볼 수 없습니다 · 지금 전달하세요")).toBeVisible();
    await expect(panel).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/admin/people");

    // 결과 화면에서는 입력이 없어 Esc가 확인 창 없이 닫힌다 — 이어서 입력부터.
    await panel.getByRole("button", { name: "사람 등록" }).click();
    await expect(panel.getByLabel("이름")).toHaveValue("");
    await expect(panel.getByLabel("이름")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  });

  test("DR3 B: 1차는 「본부 추가」 하나 · 보관되지 않은 본부 행마다 「팀 추가」 · 누르면 그 본부가 미리 골라진 팀 패널", async ({ page }) => {
    const archived = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E보관본부-${Date.now()}` });
    await db.update(orgUnits).set({ archivedAt: new Date() }).where(eq(orgUnits.id, archived.id));
    const live = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E팀추가본부-${Date.now()}` });

    await loginAsAdmin(page);
    await page.goto("/admin/people/org");
    await expect(page.locator('main [data-ui="primary-button"]')).toHaveCount(1);
    await expect(page.locator('main [data-ui="primary-button"]')).toHaveText(/본부 추가/);

    const liveRow = page.locator("li", { has: page.getByLabel(`${live.name} 이름`) }).first();
    await expect(liveRow.getByRole("link", { name: "팀 추가" }).first()).toBeVisible();
    const archivedRow = page.locator("li", { has: page.getByLabel(`${archived.name} 이름`) }).first();
    await expect(archivedRow.getByText("보관됨").first()).toBeVisible();
    await expect(archivedRow.getByRole("link", { name: "팀 추가" })).toHaveCount(0);

    await liveRow.getByRole("link", { name: "팀 추가" }).first().click();
    await expect(page).toHaveURL(/new=team/);
    const url = new URL(page.url());
    expect(url.searchParams.get("new")).toBe("team");
    expect(url.searchParams.get("orgUnitId")).toBe(live.id);
    await expect(sidePanel(page).locator("#team-form select[name=orgUnitId]")).toHaveValue(live.id);

    // 파라미터 없는 ?new=team · 모르는 값 · 보관된 본부는 지금처럼 빈 본부 값이다.
    for (const query of ["new=team", "new=team&orgUnitId=00000000-0000-4000-8000-000000000000", `new=team&orgUnitId=${archived.id}`]) {
      await page.goto(`/admin/people/org?${query}`);
      await expect(sidePanel(page).locator("#team-form select[name=orgUnitId]")).toHaveValue("");
    }
  });

  test("M2: 패널 select가 PC 1280에서도 라벨 아래이고 폭이 패널 본문 폭과 같다(#person-form · #team-form)", async ({ page }) => {
    await loginAsAdmin(page);
    for (const { path, form, select } of [
      { path: "/admin/people?new=1", form: "#person-form", select: "#roleId" },
      { path: "/admin/people?new=1", form: "#person-form", select: "#teamId" },
      { path: "/admin/people/org?new=team", form: "#team-form", select: "#team-org-unit-id" },
    ]) {
      await page.goto(path);
      // 패널은 수화 뒤에 열린다 — boundingBox()는 기다리지 않아 부하가 큰 묶음에서 null이었다.
      // CI 공유 DB에 시험용 사람이 1,000명 넘게 쌓이면 /admin/people 목록이 다 그려진 뒤에야 패널이 열린다(4.5~5.7초) — 기본 5초 대신 15초를 기다린다.
      await expect(page.locator(`${form} ${select}`)).toBeVisible({ timeout: 15_000 });
      const label = await page.locator(`${form} label[for="${select.slice(1)}"]`).boundingBox();
      const box = await page.locator(`${form} ${select}`).boundingBox();
      const body = await page.locator(`${form} [data-ui="field-row"] input`).first().boundingBox();
      if (!label || !box || !body) throw new Error(`${form} ${select} 상자를 잴 수 없다`);
      expect(label.y + label.height, `${select} 라벨 아래`).toBeLessThanOrEqual(box.y + 0.5);
      expect(Math.abs(box.width - body.width), `${select} 폭 ${box.width} · 칸 폭 ${body.width}`).toBeLessThanOrEqual(1);
    }
  });
});

// R11 · 공통 §10 — 옮긴 화면은 원칙 막는 모드에서 경고 0이다(사람 · 조직 · 계급 + 패널 라우트 + 사람 상세).
test("화면 사용성 원칙(막는 모드) — 사람·조직·계급", async ({ page }) => {
  const org = await createOrgUnit(SYSTEM_VIEWER, { name: `원칙본부-${Date.now()}` });
  const { userId } = await createAccount(SYSTEM_VIEWER, {
    email: `e2e-principles-${Date.now()}@example.test`,
    name: "원칙대상",
    roleId: DEFAULT_ROLE_ID,
  });
  await loginAsAdmin(page);
  await checkPrinciples(
    page,
    [
      "/admin/people",
      "/admin/people?new=1",
      "/admin/people/org",
      "/admin/people/org?new=org",
      "/admin/people/org?new=team",
      `/admin/people/org?new=team&orgUnitId=${org.id}`,
      "/admin/people/roles",
      "/admin/people/roles?new=1",
      `/admin/people/${userId}`,
    ],
    { strict: isStrict(process.env.DESIGN_PRINCIPLES_STRICT) },
  );
});

async function tokenColor(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);
}

// 조직 화면의 팀 줄 — 이름 입력의 부모 `li`(본부 줄 `li`는 팀 줄을 품으므로 이름 입력으로 고른다).
function orgRow(page: Page, name: string): Locator {
  return page.getByLabel(`${name} 이름`, { exact: true }).locator("xpath=..");
}

test.describe("조직 화면 팀장 · 책임자 중복 (06.4 D-6405 · D-6413)", () => {
  test("중복 팀 줄 행동 첫 자리에 「팀장 2명」(warning) + 보유자 링크 · 한 명 팀은 없음 → 보유자 강등 뒤 조직 화면에서 사라진다", async ({ page }) => {
    const world = await makeDuplicateLeads();
    await loginAsAdmin(page);
    await page.goto("/admin/people/org");

    const row = orgRow(page, world.teamName);
    const actions = row.locator('[data-ui="row-actions"]');
    const tag = actions.getByText("팀장 2명", { exact: true });
    await expect(tag).toBeVisible();
    await expect(actions.locator(":scope > *").first()).toHaveText("팀장 2명");
    expect(await tag.evaluate((element) => getComputedStyle(element).color)).toBe(await tokenColor(page, "--status-warning"));
    // 07-21(SC-13): 사람이 남은 팀의 `삭제` 이유 줄 `{N}명`(사람 목록 필터 링크 `?team=`)은 보유자 링크가 아니다.
    const links = actions.locator('a[href^="/admin/people/"]:visible');
    await expect(links).toHaveCount(2);
    for (const [index, id] of world.holderIds.entries()) await expect(links.nth(index)).toHaveAttribute("href", `/admin/people/${id}`);

    const single = orgRow(page, world.singleTeamName);
    await expect(single.getByText(/^팀장 \d+명$/)).toHaveCount(0);
    await expect(single.locator('a[href^="/admin/people/"]:visible')).toHaveCount(0);

    await links.first().click();
    await expect(page).toHaveURL(new RegExp(`/admin/people/${world.holderIds[0]}$`));
    await page.locator("#person-role-change").selectOption({ label: "기획 PM" });
    await expect(page.locator("dd").filter({ hasText: /^기획 PM$/ })).toBeVisible();

    await page.goto("/admin/people/org");
    const after = orgRow(page, world.teamName);
    await expect(after.getByText(/^팀장 \d+명$/)).toHaveCount(0);
    await expect(after.locator('a[href^="/admin/people/"]:visible')).toHaveCount(0);
  });
});

const GRANT_FORBIDDEN = "계급 지정 권한 없음 · 시스템 관리자";
// E · F(통과 계급 0 · 1 세계)의 칸 — 같은 집합이라 서로를 줄 수 있으므로 각 사례가 상대 접두 계급을 보관한다.
const NARROW_INFO_ITEMS = ["person.value", "role.value", "team.value"] as const;

async function loginWith(page: Page, account: { email: string; password: string }): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function makeAccount(name: string, roleId: string): Promise<string> {
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `e2e-admin-cap-${randomUUID()}@example.test`, name, roleId });
  return userId;
}

test.describe("위임 계급의 계급 자리 (06.4 D-6402 · D-6414 · D7~D9)", () => {
  test.describe.configure({ mode: "serial" });

  test("등록: 위임 계정의 계급 select에 기획 PM은 있고 시스템 관리자는 없다", async ({ page }) => {
    const delegate = await createDelegatedAccount();
    await loginWith(page, delegate);
    await page.goto("/admin/people");
    await page.getByRole("link", { name: "사람 등록" }).first().click();
    await expect(page.locator("#roleId")).toBeVisible({ timeout: 20_000 });
    const options = await page.locator("#roleId option").allTextContents();
    expect(options).toContain("기획 PM");
    expect(options).not.toContain("시스템 관리자");
  });

  test("등록 0(D8): 통과 계급이 없으면 「사람 등록」 링크 0 · 낡은 주소 패널은 `—` · 막힘 이유 · 상세는 이유 한 줄", async ({ page }) => {
    const none = await createDelegatedAccount({
      copyFrom: [],
      viewScope: "own",
      workScope: "team",
      rolePrefix: "E2E위임-none-",
      infoItems: NARROW_INFO_ITEMS,
    });
    const peer = await makeAccount("E2E같은계급", none.roleId);
    await archiveRolesByPrefix("E2E위임-single-", { keep: "" });
    // 자기 계급은 상한상 늘 통과 — 보관해야 목록에서 빠진다(보관된 계급도 권한은 남는다, O2). 앞 실행이 남긴 같은 꼴도 함께.
    await archiveRolesByPrefix("E2E위임-none-", { keep: "" });

    await loginWith(page, none);
    await page.goto("/admin/people");
    await expect(page.getByRole("heading", { name: "사람" })).toBeVisible();
    await expect(page.getByRole("link", { name: "사람 등록" })).toHaveCount(0);

    await page.goto("/admin/people?new=1");
    const options = page.locator("#roleId option");
    await expect(options).toHaveCount(1);
    await expect(options.first()).toHaveText("—");
    await expect(page.locator("#person-form").getByText(GRANT_FORBIDDEN, { exact: true })).toBeVisible();
    await expect(page.locator("#person-form").getByRole("button", { name: "사람 등록" })).toHaveAttribute("aria-disabled", "true");

    await page.goto(`/admin/people/${peer}`);
    await expect(page.getByText(GRANT_FORBIDDEN, { exact: true })).toBeVisible();
    await expect(page.locator("#person-role-change")).toHaveCount(0);
  });

  test("등록 1(D9): 통과 계급이 하나면 미리 골라져 있다", async ({ page }) => {
    const single = await createDelegatedAccount({
      copyFrom: [],
      viewScope: "own",
      workScope: "team",
      rolePrefix: "E2E위임-single-",
      infoItems: NARROW_INFO_ITEMS,
    });
    await archiveRolesByPrefix("E2E위임-single-", { keep: single.roleId });
    await archiveRolesByPrefix("E2E위임-none-", { keep: "" });

    await loginWith(page, single);
    await page.goto("/admin/people?new=1");
    await expect(page.locator("#roleId")).toHaveValue(single.roleId);
    await expect(page.locator('#roleId option:not([value=""])')).toHaveCount(1);
  });

  test("상세 잠김(D4 · D5): 상한 밖 대상은 select 없이 이유 한 줄(보조 글자색) · KvList가 계급을 보인다", async ({ page }) => {
    const delegate = await createDelegatedAccount();
    const admin = await makeAccount("E2E상한밖관리자", SYSADMIN_ROLE_ID);
    await loginWith(page, delegate);
    await page.goto(`/admin/people/${admin}`);
    await expect(page.locator("#person-role-change")).toHaveCount(0);
    const locked = page.getByText(GRANT_FORBIDDEN, { exact: true });
    await expect(locked).toBeVisible();
    expect(await locked.evaluate((element) => getComputedStyle(element).color)).toBe(await tokenColor(page, "--text-muted"));
    await expect(page.locator("dd").filter({ hasText: /^시스템 관리자$/ })).toBeVisible();
  });

  test("상세 줄 없음(D6): 자기 상세 · 쓰기 없는 계정에는 계급 변경 줄이 없다", async ({ page, browser, baseURL }) => {
    const delegate = await createDelegatedAccount();
    await loginWith(page, delegate);
    await page.goto(`/admin/people/${delegate.userId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("#person-role-change")).toHaveCount(0);
    await expect(page.getByText(GRANT_FORBIDDEN, { exact: true })).toHaveCount(0);

    const viewer = await createDelegatedAccount({ menus: [{ menu: "admin.people", action: "view" }] });
    const pm = await makeAccount("E2E보기대상", DEFAULT_ROLE_ID);
    const context = await browser.newContext({ baseURL });
    const viewerPage = await context.newPage();
    await loginWith(viewerPage, viewer);
    await viewerPage.goto(`/admin/people/${pm}`);
    await expect(viewerPage.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(viewerPage.locator("#person-role-change")).toHaveCount(0);
    await expect(viewerPage.getByText(GRANT_FORBIDDEN, { exact: true })).toHaveCount(0);
    await context.close();
  });

  test("상세 통과(D7): 통과 계급만 · 지금 계급 선택 · 거부되면 저장값으로 돌아온다", async ({ page }) => {
    const delegate = await createDelegatedAccount();
    const pm = await makeAccount("E2E통과대상", DEFAULT_ROLE_ID);
    await loginWith(page, delegate);
    await page.goto(`/admin/people/${pm}`);
    const select = page.locator("#person-role-change");
    await expect(select).toHaveValue(DEFAULT_ROLE_ID);
    expect(await select.locator("option").allTextContents()).not.toContain("시스템 관리자");
    await select.evaluate((element: HTMLSelectElement) => {
      const option = document.createElement("option");
      option.value = "e2e-missing-role";
      option.textContent = "없는 계급";
      element.append(option);
    });
    await select.selectOption("e2e-missing-role");
    await expect(page.locator("#person-role-change-error")).toBeVisible();
    await expect(select).toHaveValue(DEFAULT_ROLE_ID);
  });
});

async function makeListedAccount(name: string, roleId: string): Promise<{ userId: string; email: string }> {
  const email = `e2e-admin-cap-${randomUUID()}@example.test`;
  const { userId } = await createAccount(SYSTEM_VIEWER, { email, name, roleId });
  return { userId, email };
}

const ARCHIVE_DELEGATE_MENUS = [
  { menu: "admin.people", action: "view" },
  { menu: "admin.people", action: "write" },
  { menu: "admin.archive", action: "view" },
  { menu: "admin.archive", action: "write" },
] as const;

test.describe("삭제 · 퇴직일 칸 상태와 삭제 사유 (06.4 D-6417 · D-6418)", () => {
  test.describe.configure({ mode: "serial" });

  test("삭제 숨김(D-6417): 위임 계정은 자기 줄 · 상한 밖 줄에 「삭제」가 없고 PM 줄에는 있다 · 관리자는 자기 줄만 없다", async ({ page, browser, baseURL }) => {
    const delegate = await createDelegatedAccount({ menus: ARCHIVE_DELEGATE_MENUS });
    const admin = await makeListedAccount("E2E삭제상한밖", SYSADMIN_ROLE_ID);
    const pm = await makeListedAccount("E2E삭제대상", DEFAULT_ROLE_ID);

    await loginWith(page, delegate);
    await gotoPeopleRow(page, pm.email);
    await expect(personRow(page, pm.email).getByRole("button", { name: "삭제" })).toHaveCount(1);
    await gotoPeopleRow(page, delegate.email);
    await expect(personRow(page, delegate.email).getByRole("button", { name: "삭제" })).toHaveCount(0);
    await gotoPeopleRow(page, admin.email);
    await expect(personRow(page, admin.email).getByRole("button", { name: "삭제" })).toHaveCount(0);

    const context = await browser.newContext({ baseURL });
    const adminPage = await context.newPage();
    const self = await loginAsAdmin(adminPage);
    await gotoPeopleRow(adminPage, admin.email);
    await expect(personRow(adminPage, admin.email).getByRole("button", { name: "삭제" })).toHaveCount(1);
    await gotoPeopleRow(adminPage, self.email);
    await expect(personRow(adminPage, self.email).getByRole("button", { name: "삭제" })).toHaveCount(0);
    await context.close();
  });

  // 07-17 독립 검토 M1: 서버 setHireDate도 상한을 보게 되어 입사일 칸도 같이 숨긴다(D-6417 「입사일 칸 그대로」를 바꿈).
  test("날짜 칸(D-6417 · 07-17 M1): 상한 밖 대상 상세에는 퇴직일 · 입사일 칸이 없다 · PM 대상은 둘 다", async ({ page }) => {
    const delegate = await createDelegatedAccount({ menus: ARCHIVE_DELEGATE_MENUS });
    const admin = await makeListedAccount("E2E퇴직일상한밖", SYSADMIN_ROLE_ID);
    const pm = await makeListedAccount("E2E퇴직일대상", DEFAULT_ROLE_ID);

    await loginWith(page, delegate);
    await page.goto(`/admin/people/${admin.userId}`);
    await expect(page.locator("#hireDate")).toHaveCount(0);
    await expect(page.locator("#resignationDate")).toHaveCount(0);

    await page.goto(`/admin/people/${pm.userId}`);
    await expect(page.locator("#hireDate")).toHaveCount(1);
    await expect(page.locator("#resignationDate")).toHaveCount(1);
  });

  test("삭제 사유(D-6418): 낡은 화면에서 상한 밖이 된 대상 「삭제」는 서버 사유를 그대로 보이고 줄이 남는다", async ({ page }) => {
    const delegate = await createDelegatedAccount({ menus: ARCHIVE_DELEGATE_MENUS });
    const target = await makeListedAccount("E2E낡은삭제", DEFAULT_ROLE_ID);

    await loginWith(page, delegate);
    await gotoPeopleRow(page, target.email);
    const row = personRow(page, target.email);
    await expect(row.getByRole("button", { name: "삭제" })).toHaveCount(1);
    await updateUserRole(SYSTEM_VIEWER, target.userId, SYSADMIN_ROLE_ID);

    await row.getByRole("button", { name: "삭제" }).click();
    await row.getByRole("button", { name: "삭제" }).click();
    await expect(row.getByText("삭제 실패 · 계급 지정 권한 없음 · 시스템 관리자", { exact: true })).toBeVisible();
    await expect(row.getByText("보관됨", { exact: true })).toHaveCount(0);
  });

  test("퇴직일 거부(R2 · D7 규칙): 거부되면 오류 줄과 함께 칸이 저장값으로 돌아온다", async ({ page }) => {
    const delegate = await createDelegatedAccount({ menus: ARCHIVE_DELEGATE_MENUS });
    const target = await makeListedAccount("E2E낡은퇴직일", DEFAULT_ROLE_ID);

    await loginWith(page, delegate);
    await page.goto(`/admin/people/${target.userId}`);
    const field = page.locator("#resignationDate");
    await expect(field).toHaveValue("");
    await updateUserRole(SYSTEM_VIEWER, target.userId, SYSADMIN_ROLE_ID);

    await field.fill(addDays(seoulToday(), 30));
    await field.blur();
    await expect(page.locator("#resignationDate-error")).toHaveText("계급 지정 권한 없음 · 시스템 관리자");
    await expect(field).toHaveValue("");
  });
});

// 07.1 D-2(2026-10-27 사용자 결정): 시스템 관리자가 다른 사람에게 자리를 넘기는 화면 — 대상 상세의 3차 하나 → 확인 모달.
// CI의 erp_test에는 다른 시스템 관리자 계정이 쌓여 있어 실제 넘기기는 회사 자리 검사가 거부한다 — 거부가 모달 안에 붙는 길을 잰다
// (성공 · 한 tx 원자성 · 동시 실행은 통합 sysadmin-handover.test.ts).
test.describe("시스템 관리자 넘기기 (07.1 D-2)", () => {
  const HANDOVER = "시스템 관리자 넘기기";

  test("시스템 관리자에게만 · 넘길 수 있는 대상에만 3차 하나가 선다", async ({ page, browser, baseURL }) => {
    const admin = await loginAsAdmin(page);
    const pm = await makeAccount("E2E넘기기대상", DEFAULT_ROLE_ID);
    const future = await makeAccount("E2E넘기기내일", DEFAULT_ROLE_ID);
    await updateUserHireDate(SYSTEM_VIEWER, future, addDays(seoulToday(), 1));
    const other = await makeAccount("E2E넘기기관리자", SYSADMIN_ROLE_ID);

    await page.goto(`/admin/people/${pm}`);
    await expect(page.getByRole("button", { name: HANDOVER })).toHaveCount(1);
    for (const id of [future, other]) {
      await page.goto(`/admin/people/${id}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("button", { name: HANDOVER })).toHaveCount(0);
    }
    const [self] = await db.select({ id: users.id }).from(users).where(eq(users.email, admin.email));
    await page.goto(`/admin/people/${self?.id ?? ""}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: HANDOVER })).toHaveCount(0);

    const delegate = await createDelegatedAccount();
    const context = await browser.newContext({ baseURL });
    const delegatePage = await context.newPage();
    await loginWith(delegatePage, delegate);
    await delegatePage.goto(`/admin/people/${pm}`);
    await expect(delegatePage.locator("#person-role-change")).toBeVisible();
    await expect(delegatePage.getByRole("button", { name: HANDOVER })).toHaveCount(0);
    await context.close();
  });

  test("누르면 확인 모달 · 서버 거부는 모달 안에 붙고 계급 그대로 · 320 가로 넘침 없음", async ({ page }) => {
    await loginAsAdmin(page);
    const pm = await makeAccount("E2E넘기기거부", DEFAULT_ROLE_ID);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`/admin/people/${pm}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.getByRole("button", { name: HANDOVER }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: HANDOVER })).toBeVisible();
    await expect(dialog.getByText("E2E넘기기거부", { exact: true })).toBeVisible();
    await expect(dialog.getByText("내 계급 → 기획 PM · 되돌리기는 새 시스템 관리자", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: new RegExp(`^${HANDOVER}`) }).click();
    // 같은 글자가 1차 Button 안 이유 자리에도 있으나 display:none(ConfirmDialog.module.css `.primaryWrap > span > span`) — 보이는 한 자리만 잰다.
    await expect(dialog.getByText(/^시스템 관리자 있음 · /).filter({ visible: true })).toHaveCount(1);
    await expect(dialog).toBeVisible();
    await expect(page.locator("dd").filter({ hasText: /^기획 PM$/ })).toBeVisible();
  });
});
