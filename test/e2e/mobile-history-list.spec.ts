import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { loginAsAdmin } from "./people-list-helpers";

// SYSTEM §3 「터치 목표」 · DECISIONS.md 2026-09-29 ③(폰 44/40 정리) 계약을 §7-14 이력 목록에 고정한다.
// 폰: 3차(닫힌 목록 「새 이력 추가」 · 예정 행 「취소」)는 44, 편집 행의 폼 입력과 2차·1차 버튼은 40(시트 밖).
// PC 1280: 편집 행 32. 2026-10-01 kst-today-people DOM 감사가 편집 행 40을 결함으로 읽었다 — 계약대로임을 이 스펙이 근거로 남긴다.
const TOUCH_MIN = 44;
const PHONE_CONTROL = 40;
const PC_CONTROL = 32;
const WIDTHS_PHONE = [390, 320] as const;

let personId: string;

test.beforeAll(async () => {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E팀-${randomUUID().slice(0, 8)}` });
  const person = await createAccount(SYSTEM_VIEWER, {
    email: `e2e-${randomUUID()}@example.test`,
    name: "E2E 이력대상",
    roleId: DEFAULT_ROLE_ID,
  });
  // 적용 중 1행 + 예정 1행 — 예정 행에만 3차 「취소」가 그려진다.
  await assignTeam(SYSTEM_VIEWER, { userId: person.userId, teamId: team.id, effectiveFrom: "2020-01-01" });
  await assignTeam(SYSTEM_VIEWER, { userId: person.userId, teamId: team.id, effectiveFrom: "2999-01-01" });
  personId = person.userId;
});

async function box(locator: Locator, label: string) {
  await expect(locator, label).toBeVisible();
  const b = await locator.boundingBox();
  if (!b) throw new Error(`${label}: bounding box 없음`);
  return b;
}

// 편집 행(열린 form)의 입력 둘 · 버튼 둘. 값 입력은 사람 상세 = 팀 select, 부가세율 = number.
async function expectEditRow(scope: Locator, expected: number, where: string) {
  const form = scope.locator("form");
  await expect(form).toBeVisible();
  const controls = [
    ["적용 시작일", form.getByLabel("적용 시작일", { exact: true })],
    // 팀 select는 <label>값<select> 감싸기라 getByLabel이 옵션 글자까지 라벨로 읽는다 — 접근 이름(role)으로 찾는다.
    ["값", form.getByRole("combobox", { name: "값", exact: true }).or(form.getByRole("spinbutton", { name: "값", exact: true }))],
    ["취소 Esc", form.getByRole("button", { name: "취소 Esc", exact: true })],
    ["새 이력 추가(저장)", form.getByRole("button", { name: "새 이력 추가", exact: true })],
  ] as const;
  for (const [label, locator] of controls) {
    const b = await box(locator, `${where} ${label}`);
    expect.soft(b.height, `${where} ${label} 높이`).toBeCloseTo(expected, 0);
  }
}

async function expectTouchMin(locator: Locator, label: string) {
  const b = await box(locator, label);
  expect.soft(b.height, `${label} 높이`).toBeGreaterThanOrEqual(TOUCH_MIN);
  expect.soft(b.width, `${label} 폭`).toBeGreaterThanOrEqual(TOUCH_MIN);
}

function personSection(page: Page) {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: "소속 발령 이력" }) });
}

function vatSection(page: Page) {
  return page.getByText("부가세율", { exact: true }).locator("xpath=..");
}

test.describe("§7-14 이력 목록 터치 목표 — 폰 3차 44 · 편집 행 40, PC 편집 행 32", () => {
  test("사람 상세 발령 이력 — 폰 390·320", async ({ page }) => {
    await loginAsAdmin(page);
    for (const width of WIDTHS_PHONE) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/admin/people/${personId}`);
      const section = personSection(page);
      await expectTouchMin(section.locator("tbody").getByRole("button", { name: "취소", exact: true }), `@${width} 예정 행 취소`);
      const trigger = section.getByRole("button", { name: "새 이력 추가", exact: true });
      await expectTouchMin(trigger, `@${width} 새 이력 추가(3차)`);
      await trigger.click();
      await expectEditRow(section, PHONE_CONTROL, `사람 상세 @${width}`);
    }
  });

  test("설정 부가세율 이력 — 폰 390·320", async ({ page }) => {
    await loginAsAdmin(page);
    for (const width of WIDTHS_PHONE) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/admin/settings");
      const section = vatSection(page);
      const trigger = section.getByRole("button", { name: "새 이력 추가", exact: true });
      await expectTouchMin(trigger, `@${width} 새 이력 추가(3차)`);
      await trigger.click();
      await expectEditRow(section, PHONE_CONTROL, `설정 부가세율 @${width}`);
    }
  });

  test("PC 1280 — 두 화면 편집 행 32", async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto(`/admin/people/${personId}`);
    const person = personSection(page);
    await person.getByRole("button", { name: "새 이력 추가", exact: true }).click();
    await expectEditRow(person, PC_CONTROL, "사람 상세 @1280");

    await page.goto("/admin/settings");
    const vat = vatSection(page);
    await vat.getByRole("button", { name: "새 이력 추가", exact: true }).click();
    await expectEditRow(vat, PC_CONTROL, "설정 부가세율 @1280");
  });
});

// 04.6 최종 DOM 감사 D1: 폰 320에서 값 칸에 긴 팀 이름이 있으면 날짜 칸(「2026-01-01」)이 하이픈에서 꺾이고
// 「동작」 머리글이 두 줄로 쪼개졌다. 날짜·짧은 낱말 머리글은 어떤 폭에서도 한 줄이어야 한다(SYSTEM §2-4). 값 칸이 줄바꿈을 맡는 건 괜찮다.
async function lineCount(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
  });
}

test.describe("§7-14 이력 목록 — 폰 320 긴 팀 이름에서도 날짜 칸·짧은 머리글은 한 줄 (D1)", () => {
  let longPersonId: string;

  test.beforeAll(async () => {
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E결재팀-${randomUUID().slice(0, 11)}` });
    const person = await createAccount(SYSTEM_VIEWER, {
      email: `e2e-${randomUUID()}@example.test`,
      name: "E2E 긴팀이름",
      roleId: DEFAULT_ROLE_ID,
    });
    // 지난 행만 — 동작 칸이 비어(「취소」 없음) 「동작」 머리글 칸이 가장 좁아지는 감사 조건.
    await assignTeam(SYSTEM_VIEWER, { userId: person.userId, teamId: team.id, effectiveFrom: "2025-01-01" });
    await assignTeam(SYSTEM_VIEWER, { userId: person.userId, teamId: team.id, effectiveFrom: "2026-01-01" });
    longPersonId = person.userId;
  });

  for (const width of [320, 375]) {
    test(`사람 상세 발령 이력 @${width} — 날짜 칸 1줄 · 짧은 머리글 1줄 · 문서 넘침 없음`, async ({ page }) => {
      await loginAsAdmin(page);
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/admin/people/${longPersonId}`);
      const table = personSection(page).locator("table");
      await expect(table).toBeVisible();

      const dates = table.locator("tbody td:nth-child(1)");
      expect(await dates.count()).toBe(2);
      for (let i = 0; i < 2; i += 1) {
        expect.soft(await lineCount(dates.nth(i)), `날짜 칸 ${i} 줄 수`).toBe(1);
      }
      for (const name of ["값", "상태", "동작"]) {
        expect.soft(await lineCount(table.locator("thead th", { hasText: new RegExp(`^${name}$`) })), `머리글 ${name} 줄 수`).toBe(1);
      }

      const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(overflow.scroll, "문서 가로 넘침").toBeLessThanOrEqual(overflow.client);
    });
  }
});
