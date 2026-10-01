import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole, setRoleArchived } from "@/repositories/roles";
import { createFixtureUser } from "./fixtures";
import { createCertEvent, seedIpSubmissionsForTest, seedSubmittedCert, withCertFeatureOff } from "./helpers/cert";
import { collectCertResponses, leakPatternsFor, scanForLeaks } from "./helpers/cert-leak";

// 04.3-04 Task 4 ⑤ · 04.3-15 — I′1 확인증 행사 목록 · I′3 상세 머리. 행사 만들기(I2)는 명단과 함께 없어졌다
// (새 「QR 생성 신청」은 04.3-10). 전역 설정(기능 · 문의 전화)은 cert.setup.ts가 켠다 — 이 스펙은 기능 끄기를
// withCertFeatureOff 범위 안에서만 한다. 목록이 비었다는 전역 단언은 하지 않는다(다른 스펙의 행사) — EMPTY는
// 범위상 0건인 임시 사용자로 본다.

test.describe.configure({ mode: "serial" });

async function login(page: Page, account: { email: string; password: string }): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function groupHeaders(page: Page): Promise<string[]> {
  // 폰 접힌 줄(P2 `당첨일 · 담당`)도 td[colspan]이라 그룹 이름만 거른다(leave-list 전례).
  return (await page.locator("tbody tr td[colspan]").allTextContents())
    .map((text) => text.trim())
    .filter((text) => ["신청됨", "접수 전", "접수 중", "닫힘"].includes(text));
}

function eventRow(page: Page, eventName: string) {
  return page.getByRole("row").filter({ has: page.getByRole("link", { name: eventName }) });
}

async function loggedInPage(browser: Browser, account: { email: string; password: string }): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, account);
  return page;
}

test.describe("확인증 행사 — 시스템 관리자", () => {
  let admin: { email: string; password: string };

  test.beforeAll(async () => {
    admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  });

  test("(g) 기능 꺼짐 → /certs/events · 상세가 404 화면 · 범위를 나오면 다시 보인다", async ({ page }) => {
    await login(page, admin);
    await page.goto("/certs/events");
    const ownEvent = page.locator('a[data-row-link][href^="/certs/events/"]').first();
    const detailHref = (await ownEvent.count()) > 0 ? await ownEvent.getAttribute("href") : null;
    await withCertFeatureOff(async () => {
      for (const path of ["/certs/events", ...(detailHref ? [detailHref] : [])]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { name: "페이지 찾을 수 없음" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "확인증 행사" })).toHaveCount(0);
      }
    });
    const on = await page.goto("/certs/events");
    expect(on?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "확인증 행사" })).toBeVisible();
  });

  test("제출 셀 = 대조 제외 뺀 건수 하나 — 보이는 숫자 + 접근 이름 「제출 N건」", async ({ page }) => {
    const seeded = await seedSubmittedCert();
    await login(page, admin);
    await page.goto("/certs/events");
    const row = eventRow(page, seeded.eventName);
    await expect(row.locator(".sr-only")).toHaveText("제출 1건");
    await expect(row.locator('[aria-hidden="true"]', { hasText: /^1$/ })).toHaveCount(1);
  });
});

test.describe("확인증 행사 — 임시 계급(자기 행사만)", () => {
  let roleId: string;
  let account: { email: string; password: string };

  // (f-0) 공유 role-pm을 바꾸지 않는다 — 임시 계급에 certs.events 보기 · 쓰기와 cert_event.value 노출만 준다.
  test.beforeAll(async () => {
    roleId = `role-e2e-cert-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: roleId, name: `E2E 임시 계급 ${roleId.slice(-12)}`, sortOrder: 99 });
    for (const action of ["view", "write"] as const) {
      await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "certs.events", action, allowed: true });
    }
    await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "cert_event.value", visible: true });
    account = await createFixtureUser({ roleId });
  });

  test.afterAll(async () => {
    await setRoleArchived(SYSTEM_VIEWER, roleId, true);
  });

  test("(f-0-b) EMPTY — 자기 행사 0건이면 「확인증 행사가 없습니다」(만들기 진입 없음 — 04.3-10이 더한다)", async ({ browser }) => {
    const page = await loggedInPage(browser, account);
    await page.goto("/certs/events");
    await expect(page.getByText("확인증 행사가 없습니다")).toBeVisible();
    await expect(page.getByRole("link", { name: "행사 만들기" })).toHaveCount(0);
    await page.context().close();
  });

  test("목록 그룹 신청됨 → 접수 중 → 닫힘 · 신청됨 제출 셀 「—」 · 상세 머리 태그 · QR 섹션은 접수 중만", async ({ browser }) => {
    const [me] = await db.select({ id: users.id }).from(users).where(eq(users.email, account.email));
    if (!me) throw new Error("임시 사용자 없음");
    const requested = await createCertEvent({ name: "신청 행사", status: "requested", createdBy: me.id });
    const open = await createCertEvent({ name: "접수 행사", status: "open", createdBy: me.id });
    const closed = await createCertEvent({ name: "닫힌 행사", status: "closed", createdBy: me.id });

    const page = await loggedInPage(browser, account);
    await page.goto("/certs/events");
    expect(await groupHeaders(page)).toEqual(["신청됨", "접수 중", "닫힘"]);
    const requestedRow = eventRow(page, requested.eventName);
    await expect(requestedRow.getByRole("cell").nth(3)).toHaveText("—");
    await expect(requestedRow.locator(".sr-only")).toHaveCount(0);
    await expect(eventRow(page, open.eventName).locator(".sr-only")).toHaveText("제출 0건");

    const cases = [
      { event: requested, tag: "신청됨", qr: 0, svg: 0 },
      { event: open, tag: "접수 중", qr: 1, svg: 1 },
      { event: closed, tag: "닫힘", qr: 1, svg: 0 },
    ];
    for (const c of cases) {
      await page.goto(`/certs/events/${c.event.eventId}`);
      await expect(page.getByRole("heading", { name: c.event.eventName, level: 1 })).toBeVisible();
      await expect(page.getByText(c.tag, { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "QR", level: 2 })).toHaveCount(c.qr);
      await expect(page.getByRole("img", { name: `${c.event.eventName} 확인증 QR` })).toHaveCount(c.svg);
    }
    await page.context().close();
  });
});

// ── 04.3-10 tracer — 기획본부 「QR 생성 신청」 → 경영관리 알림함 → I′3 경품 한 줄 → 「QR 생성」 → 신청자 알림 → 수령자 링크 ──

function kstToday(offsetDays = 0): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date(Date.now() + offsetDays * 86_400_000));
}

const prizeGrid = (page: Page) => page.getByRole("grid", { name: "경품" });
// 폰 접힌 줄(P2 — aria-hidden, 데스크톱에서 숨김)은 행이 아니다(읽기 전용 P2 칸이 있는 줄만 생긴다).
const prizeRows = (page: Page) => prizeGrid(page).locator('tbody > tr:not([aria-hidden="true"])');
const prizeCell = (page: Page, row: number, col: number) => prizeRows(page).nth(row).locator("td").nth(col);
const PRIZE_COL = { name: 1, value: 2, delivery: 3, winners: 4, submitted: 5 } as const;

async function editPrizeCell(page: Page, row: number, col: number, value: string) {
  const cell: Locator = prizeCell(page, row, col);
  if ((await cell.locator("input").count()) === 0) await cell.click();
  const input = cell.locator("input");
  await input.fill(value);
  await input.press("Enter");
  await expect(cell.locator("input")).toHaveCount(0);
}

test.describe("04.3-10 tracer — QR 생성 신청 → QR 생성(1280)", () => {
  let pm: { email: string; password: string };
  let manager: { email: string; password: string };
  let managerRoleId: string;

  test.beforeAll(async () => {
    pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    // 경영관리 고정물(E11) — 시스템 관리자가 아니다. 모든 메뉴를 가진 박서연으로는 권한 조합 결함이 드러나지 않는다.
    managerRoleId = `role-e2e-qr-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: managerRoleId, name: `E2E 경영 ${managerRoleId.slice(-12)}`, sortOrder: 99 });
    await upsertPermission(SYSTEM_VIEWER, { roleId: managerRoleId, menu: "certs.events", action: "view", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId: managerRoleId, menu: "certs.qr", action: "write", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: managerRoleId, infoItem: "cert_event.value", visible: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: managerRoleId, infoItem: "cert_prize.value", visible: true });
    manager = await createFixtureUser({ roleId: managerRoleId });
  });

  test.afterAll(async () => {
    await setRoleArchived(SYSTEM_VIEWER, managerRoleId, true);
  });

  test("PM 신청(옆 패널) → 경영관리 알림함 · 경품 한 줄 · QR 생성 → PM 알림함 · 수령자 링크에 그 경품", async ({ browser }) => {
    const eventName = `E2E 신청-${randomUUID().slice(0, 8)}`;
    const prizeName = `E2E 경품-${randomUUID().slice(0, 6)}`;
    const today = kstToday();

    // ① PM — 목록 1차 → 옆 패널(첫 칸 포커스 · 열린 동안 화면의 1차는 패널 1차 하나 — DR-9). 목록 표가 서도록 기존 신청 하나.
    const [pmRow] = await db.select({ id: users.id }).from(users).where(eq(users.email, pm.email));
    await createCertEvent({ name: "E2E 기존 신청", status: "requested", createdBy: pmRow?.id ?? null });
    const pmPage = await loggedInPage(browser, pm);
    await pmPage.goto("/certs/events");
    // 패널이 열려도 목록 표는 움직이지 않는다 — 1차 자리(행동 줄)가 높이를 지킨다(DOM 감사 A-M2).
    const listTable = pmPage.locator("table").first();
    const tableTopBefore = (await listTable.boundingBox())?.y;
    await pmPage.getByRole("button", { name: "QR 생성 신청" }).click();
    const panel = pmPage.getByRole("dialog", { name: "QR 생성 신청" });
    await expect(panel).toBeVisible();
    expect((await listTable.boundingBox())?.y).toBe(tableTopBefore);
    await expect(panel.getByLabel("행사 이름")).toBeFocused();
    await expect(pmPage.getByRole("button", { name: "QR 생성 신청" })).toHaveCount(1);
    await expect(panel.getByRole("button", { name: "QR 생성 신청" })).toHaveCount(1);

    // ② 막힘 한 번에 하나 — 당첨일 빔 → 어제(지난 날짜) → 오늘(계산 줄)
    await panel.getByLabel("행사 이름").fill(eventName);
    // 막힌 1차는 aria-disabled(누름 무시) + 이유 글자(§7-1) — 이유가 1차의 접근 설명이다.
    const panelPrimary = panel.getByRole("button", { name: "QR 생성 신청" });
    await expect(panelPrimary).toHaveAttribute("aria-disabled", "true");
    await expect(panel.getByText("당첨일 비어 있음 · 당첨일 적기")).toBeVisible();
    await expect(panelPrimary).toHaveAccessibleDescription("당첨일 비어 있음 · 당첨일 적기");
    // 막힘 이유는 행동 줄 맨 앞 전폭 한 줄 — 버튼 둘은 그 아래 2차 왼쪽 · 1차 오른쪽 끝(DOM 감사 A-M1).
    const panelCancel = panel.getByRole("button", { name: /취소/ });
    const blockedPrimary = await panelPrimary.boundingBox();
    const blockedCancel = await panelCancel.boundingBox();
    const blockLine = await panel.getByText("당첨일 비어 있음 · 당첨일 적기").boundingBox();
    expect((blockedCancel?.x ?? 0) + (blockedCancel?.width ?? 0)).toBeLessThanOrEqual(blockedPrimary?.x ?? 0);
    expect(blockedCancel?.y).toBe(blockedPrimary?.y);
    expect((blockLine?.y ?? 0) + (blockLine?.height ?? 0)).toBeLessThanOrEqual(blockedPrimary?.y ?? 0);
    await panel.getByLabel("당첨일").fill(kstToday(-1));
    await expect(panel.getByText("지난 날짜 · 당첨일 확인")).toBeVisible();
    await panel.getByLabel("당첨일").fill(today);
    await expect(panel.getByText(new RegExp(`^열림 ${today.slice(5)} 00:00 · 마감 \\d{2}-\\d{2} \\d{2}:\\d{2}$`))).toBeVisible();
    await expect(panel.getByText("지난 날짜 · 당첨일 확인")).toHaveCount(0);
    // 막힘이 풀려도 1차는 같은 오른쪽 끝에 선다(가로로 뛰지 않는다 — A-M1).
    const openPrimary = await panelPrimary.boundingBox();
    expect((openPrimary?.x ?? 0) + (openPrimary?.width ?? 0)).toBeCloseTo((blockedPrimary?.x ?? 0) + (blockedPrimary?.width ?? 0), 0);

    // ③ 신청 → 패널 닫힘 · 새 행 신청됨 그룹 · 포커스 = 그 행 · 토스트
    await panel.getByRole("button", { name: "QR 생성 신청" }).click();
    await expect(panel).toBeHidden();
    const newRow = eventRow(pmPage, eventName);
    await expect(newRow).toBeVisible();
    await expect(newRow.getByRole("link", { name: eventName })).toBeFocused();
    await expect(pmPage.getByRole("status").filter({ hasText: `QR 생성 신청 · ${eventName}` })).toBeVisible();
    await expect(newRow.getByText("신청됨", { exact: true })).toBeVisible();

    // ④ 경영관리 — 알림함 → 목록 그 행 → I′3 경품 첫 줄 → QR 생성
    const mPage = await loggedInPage(browser, manager);
    await mPage.goto("/notifications");
    await expect(mPage.getByText(`QR 생성 신청 · ${eventName} · ${today} · E2E Employee`)).toBeVisible();
    await mPage.goto("/certs/events");
    await eventRow(mPage, eventName).getByRole("link", { name: eventName }).click();
    await expect(mPage.getByRole("heading", { name: eventName, level: 1 })).toBeVisible();
    await mPage.getByRole("button", { name: /첫 줄 만들기/ }).click();
    await expect(prizeRows(mPage)).toHaveCount(1);
    await editPrizeCell(mPage, 0, PRIZE_COL.name, prizeName);
    await editPrizeCell(mPage, 0, PRIZE_COL.value, "1,290,000");
    await expect(prizeCell(mPage, 0, PRIZE_COL.delivery)).toHaveText("현장");
    await mPage.getByRole("button", { name: "QR 생성", exact: true }).click();

    // ⑤ 같은 화면이 접수 중으로 · QR 섹션 · 포커스 = QR 섹션 라벨 · 토스트
    const qrHeading = mPage.getByRole("heading", { name: "QR", level: 2 });
    await expect(qrHeading).toBeVisible();
    await expect(qrHeading).toBeFocused();
    await expect(mPage.getByText("접수 중", { exact: true })).toBeVisible();
    await expect(mPage.getByRole("status").filter({ hasText: `QR 생성 · ${eventName}` })).toBeVisible();
    const link = (await mPage.locator('[class*="linkRow"] span').first().textContent())?.trim() ?? "";
    expect(link).toMatch(/\/c\/[A-Za-z0-9_-]+$/);

    // ⑥ PM 알림함 · 수령자 링크에 그 경품
    await pmPage.goto("/notifications");
    await expect(pmPage.getByRole("cell", { name: new RegExp(`QR 생성 · ${eventName}$`) })).toBeVisible();
    const recipient = await browser.newContext();
    const rPage = await recipient.newPage();
    await rPage.goto(link);
    await expect(rPage.getByRole("button", { name: new RegExp(prizeName) })).toBeVisible();

    await recipient.close();
    await pmPage.context().close();
    await mPage.context().close();
  });
});

// ── 04.3-10 Task 2 — I′3 경품 표 전체 계약(1280) ──────────────────────────────────────────────

// 표 격자 셀에 포커스 — 로빙 tabindex가 그 셀로 옮겨질 때까지(excel-paste-final.spec.ts 선례).
async function focusGridCell(target: Locator) {
  await expect(async () => {
    await target.evaluate((element) => (element as HTMLElement).blur());
    await target.focus();
    await expect(target).toHaveAttribute("tabindex", "0", { timeout: 1_000 });
  }).toPass();
}

// 셸 링크의 RSC 미리 가져오기는 I′3 응답이 아니고, 브라우저가 그 본문을 내주지 않을 때가 있어 수집기가 실패한다 — 막는다.
async function blockPrefetch(page: Page) {
  await page.route("**/*", (route) =>
    route.request().headers()["next-router-prefetch"] ? route.abort() : route.fallback(),
  );
}

async function pasteIntoFocusedCell(page: Page, text: string) {
  await page.evaluate((clipboardText) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", clipboardText);
    document.activeElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, text);
}

test.describe("04.3-10 Task 2 — I′3 경품 표(1280)", () => {
  let pm: { email: string; password: string };
  let pmId: string;
  let manager: { email: string; password: string };
  let managerRoleId: string;

  test.beforeAll(async () => {
    pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    const [me] = await db.select({ id: users.id }).from(users).where(eq(users.email, pm.email));
    pmId = me?.id ?? "";
    managerRoleId = `role-e2e-qr2-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: managerRoleId, name: `E2E 경영2 ${managerRoleId.slice(-12)}`, sortOrder: 99 });
    await upsertPermission(SYSTEM_VIEWER, { roleId: managerRoleId, menu: "certs.events", action: "view", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId: managerRoleId, menu: "certs.qr", action: "write", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: managerRoleId, infoItem: "cert_event.value", visible: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: managerRoleId, infoItem: "cert_prize.value", visible: true });
    manager = await createFixtureUser({ roleId: managerRoleId });
  });

  test.afterAll(async () => {
    await setRoleArchived(SYSTEM_VIEWER, managerRoleId, true);
  });

  test("미리 보기 · Ctrl+S · 읽기 전용 이유 · 셀 오류 · 1차 → 첫 오류 · 엑셀 붙여넣기 · 당첨 수 · 합계 행", async ({ browser }) => {
    const ev = await createCertEvent({
      name: "E2E 경품표",
      prizes: [
        { name: "갤럭시 탭 S10", unitValueKrw: 1_290_000, winnerCount: 3 },
        { name: "다이슨 에어랩", unitValueKrw: 599_000, delivery: "parcel", winnerCount: 2 },
        { name: "스타벅스 카드", unitValueKrw: 73_519 },
      ],
    });
    await seedIpSubmissionsForTest(ev.eventId, { ip: "203.0.113.88", count: 1, prizeId: ev.prizeIds[1] });
    const page = await loggedInPage(browser, manager);
    await page.goto(`/certs/events/${ev.eventId}`);

    await expect(prizeGrid(page).getByRole("columnheader", { name: "당첨 수" })).toBeVisible();
    await expect(page.locator("tfoot")).toContainText("합계 · 경품 3개 · 제출 1건");
    await expect(page.getByRole("button", { name: /^일괄 저장/ })).toBeVisible();

    // 편집 중 가액이 제출 셀을 곧바로 바꾼다(저장 전 미리 보기) → Ctrl+S → 합계 행 결과
    await editPrizeCell(page, 2, PRIZE_COL.value, "49,000");
    await expect(prizeCell(page, 2, PRIZE_COL.submitted)).toHaveText("확인증 없음");
    await page.keyboard.press("Control+s");
    await expect(page.locator("tfoot")).toContainText(/저장됨 1줄 \d{2}:\d{2}/);

    // 제출 있는 줄의 경품명 = 읽기 전용 + 이유(DR-2)
    await focusGridCell(prizeCell(page, 1, PRIZE_COL.name));
    await page.keyboard.press("Enter");
    await expect(prizeCell(page, 1, PRIZE_COL.name).locator("input")).toHaveCount(0);
    await expect(page.getByText("제출 있음 · 가액 · 당첨 수만 고침")).toBeVisible();

    // 새 줄(빈 경품명) + 가액 abc → Ctrl+S → 셀 오류 문장 + 합계 행 · 1차 → 첫 오류 셀
    await focusGridCell(prizeCell(page, 2, PRIZE_COL.name));
    await page.keyboard.press("Control+Enter");
    await expect(prizeRows(page)).toHaveCount(4);
    await prizeCell(page, 3, PRIZE_COL.name).locator("input").press("Escape");
    await editPrizeCell(page, 3, PRIZE_COL.value, "abc");
    await page.keyboard.press("Control+s");
    await expect(page.locator("tfoot")).toContainText("오류 2칸 · 전부 거부");
    await expect(page.getByText("비어 있음 · 경품명 적기")).toBeAttached();
    await page.getByRole("button", { name: /^일괄 저장/ }).click();
    await expect(prizeCell(page, 3, PRIZE_COL.name)).toBeFocused();

    // 엑셀 붙여넣기(경품명 · 가액 · 전달) 두 줄 — 오류 줄을 덮고 한 줄 더
    await pasteIntoFocusedCell(page, "에어팟 프로\t250,000\t택배\n버즈 3\t180,000\t현장");
    await expect(prizeRows(page)).toHaveCount(5);
    await expect(prizeCell(page, 3, PRIZE_COL.name)).toHaveText("에어팟 프로");
    await expect(prizeCell(page, 4, PRIZE_COL.delivery)).toHaveText("현장");
    await page.keyboard.press("Control+s");
    await expect(page.locator("tfoot")).toContainText(/저장됨 2줄 \d{2}:\d{2}/);
    await page.context().close();
  });

  test("닫힌 행사는 가액 · 당첨 수만 편집 · 신청됨은 힌트 줄 「저장 Ctrl+S」 · 1차 QR 생성(kbd 없음)", async ({ browser }) => {
    const closed = await createCertEvent({ name: "E2E 닫힌표", status: "closed", prizes: [{ name: "닫힌 경품", unitValueKrw: 120_000 }] });
    const requested = await createCertEvent({ name: "E2E 신청표", status: "requested", createdBy: pmId });
    const page = await loggedInPage(browser, manager);
    await page.goto(`/certs/events/${closed.eventId}`);
    await focusGridCell(prizeCell(page, 0, PRIZE_COL.name));
    await page.keyboard.press("Enter");
    await expect(prizeCell(page, 0, PRIZE_COL.name).locator("input")).toHaveCount(0);
    await prizeCell(page, 0, PRIZE_COL.value).click();
    await expect(prizeCell(page, 0, PRIZE_COL.value).locator("input")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /첫 줄 만들기/ })).toHaveCount(0);

    await page.goto(`/certs/events/${requested.eventId}`);
    await expect(page.getByText("경품이 없습니다")).toBeVisible();
    await expect(page.getByText("경품 없음 · 첫 줄 만들기")).toBeVisible();
    // 줄이 생기면 표 아래 힌트 줄에 「저장 Ctrl+S」(1차 QR 생성에 없는 동작 — DR-14). 접수 중 · 닫힘은 1차 kbd가 말한다.
    await page.getByRole("button", { name: /첫 줄 만들기/ }).click();
    await expect(page.getByText(/새 줄 Ctrl\+Enter · 저장 Ctrl\+S$/)).toBeVisible();
    const qr = page.getByRole("button", { name: "QR 생성", exact: true });
    await expect(qr.locator("kbd")).toHaveCount(0);
    await page.context().close();
  });

  test("가액 누수 — 경영관리 차등 대조군 먼저(E17) → PM I′3 문서 · RSC에 가액 0건 · 가액 열 없음 · 기획본부 EMPTY · 접수 전", async ({ browser }) => {
    const values = [612_345, 88_888, 49_731];
    const patterns = leakPatternsFor(values);
    const ev = await createCertEvent({
      name: "E2E 누수표",
      createdBy: pmId,
      prizes: [
        { name: "누수대조-A", unitValueKrw: values[0] },
        { name: "누수대조-B", unitValueKrw: values[1], delivery: "parcel", winnerCount: 4 },
        { name: "누수대조-C", unitValueKrw: values[2] },
      ],
    });

    // 수집은 빈 문서에서 시작한다 — 로그인 뒤 /account 화면의 미리 가져오기(RSC)가 이동으로 끊긴 응답을 담지 않게.
    const mPage = await loggedInPage(browser, manager);
    await mPage.goto("about:blank");
    await blockPrefetch(mPage);
    const mCollector = await collectCertResponses(mPage);
    await mPage.goto(`/certs/events/${ev.eventId}`);
    await expect(prizeGrid(mPage)).toBeVisible();
    const mCorpus = await mCollector.finish();
    expect(scanForLeaks(mCorpus.corpus, patterns).length).toBeGreaterThan(0);

    const pPage = await loggedInPage(browser, pm);
    await pPage.goto("about:blank");
    await blockPrefetch(pPage);
    const pCollector = await collectCertResponses(pPage);
    await pPage.goto(`/certs/events/${ev.eventId}`);
    await expect(pPage.getByRole("table", { name: "경품" })).toBeVisible();
    const pCorpus = await pCollector.finish();
    expect(pCorpus.corpus).toContain("누수대조-B");
    expect(scanForLeaks(pCorpus.corpus, patterns)).toEqual([]);
    await expect(pPage.getByRole("columnheader", { name: "1개 가액" })).toHaveCount(0);
    await expect(pPage.getByRole("columnheader", { name: "당첨 수" })).toBeVisible();
    await expect(pPage.getByText("확인증 없음")).toHaveCount(0);
    await expect(pPage.getByRole("button", { name: /일괄 저장|QR 생성/ })).toHaveCount(0);

    // 기획본부 신청됨 I′3 경품 EMPTY(DR-13)
    const requested = await createCertEvent({ name: "E2E 기획 신청", status: "requested", createdBy: pmId });
    await pPage.goto(`/certs/events/${requested.eventId}`);
    await expect(pPage.getByText("경품이 없습니다 · 등록은 경영관리")).toBeVisible();

    // 당첨일 내일 + QR 있음 → I′3 태그 · I′1 그룹 `접수 전`(UD-1 b)
    const before = await createCertEvent({ name: "E2E 접수전", createdBy: pmId, wonOn: kstToday(1) });
    await pPage.goto(`/certs/events/${before.eventId}`);
    await expect(pPage.getByText("접수 전", { exact: true })).toBeVisible();
    await pPage.goto("/certs/events");
    expect(await groupHeaders(pPage)).toContain("접수 전");
    await expect(eventRow(pPage, before.eventName).getByText("접수 전", { exact: true })).toBeVisible();

    await mPage.context().close();
    await pPage.context().close();
  });
});
