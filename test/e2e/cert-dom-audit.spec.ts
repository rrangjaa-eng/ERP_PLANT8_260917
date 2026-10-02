import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Locator, type Page, type Request } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { certEvents, certPrizes, users } from "@/db/schema";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole, setRoleArchived } from "@/repositories/roles";
import { createFixtureUser } from "./fixtures";
import { createCertEvent, seedIpSubmissionsForTest, seedSubmittedCert, setCertPrizeValueForTest } from "./helpers/cert";

// 04.3-13 Task 2 — 독립 DOM 감사(데스크톱). 스크린샷 육안 판정 없이 DOM 수치(scrollWidth/clientWidth · getBoundingClientRect ·
// aria 속성 · PDF 쪽수)로만 판정한다. 요청을 늦추는 항목은 서버 액션 POST를 route에서 붙잡아 진행 중 상태를 잰다.
//
// 감사 목록 원본(backstop 중 데스크톱 몫):
//  - 04.3-04 I′1 제출 셀 접근 이름 · 「QR 생성 신청」 진행 중(옛 「행사 만들기」 loading를 대체)
//  - 04.3-10 I′3 「QR 생성」 · 「일괄 저장」 진행 중 `…` + 편집 칸 aria-busy · 경품명 80자 줄바꿈(1024 · 1280)
//  - 04.3-17 그룹 머리글 80자(1024 · 1280) · T4 제출 셀 · T3 확인 창 부제 · I4 머리 2차 겹침(1024 · 375)
//  - 04.3-07 I4 「전체 보기」 · 「고친 내용 저장」 진행 중
//  - 04.3-11 P1 인쇄물 A4 한 장(PDF 쪽수 1)
//  - D-10 좁은 PC 1000: I′3 경품 읽기 표 · I′1 「QR 생성 신청」 있음 · 문서 가로 넘침 0
// I′2 옆 패널(오른쪽 480)이 목록을 밀지 않는다.

test.describe.configure({ mode: "serial" });

type Account = { email: string; password: string };

// 가액은 픽스처 값만(73,519 · 581,247 · 49,731).
// 좁은 PC(D-10 · SYSTEM §6 ⑷ DR-36) — 1024 미만.
const NARROW_PC = { width: 1000, height: 900 } as const;
const LONG80 = "아이오닉쇼케이스현장에스엔에스이벤트경품".repeat(4);

async function login(page: Page, account: Account): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

// 테스트마다 새 컨텍스트 · 새 로그인(긴 CI 실행에서 앞서 만든 세션이 로그인 한도 30분에 막히지 않게 — storageState를 쓰지 않는다).
async function loggedInPage(browser: Browser, account: Account, width = 1280, height = 900): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  await login(page, account);
  return page;
}

function isServerAction(request: Request): boolean {
  return request.method() === "POST" && request.headers()["next-action"] !== undefined;
}

// 서버 액션 요청을 ms만큼 늦춘다(진행 중 상태를 재기 위해).
async function delayServerActions(page: Page, ms: number): Promise<void> {
  await page.route("**/certs/**", async (route) => {
    if (isServerAction(route.request())) await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue();
  });
}

// 판정 근거로 남기는 실측값 — JSON 리포터의 annotations(`실측`)에 실린다.
function record(label: string, value: unknown): void {
  test.info().annotations.push({ type: "실측", description: `${label} = ${JSON.stringify(value)}` });
}

async function docOverflow(page: Page): Promise<{ vw: number; sw: number }> {
  return page.evaluate(() => ({ vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth }));
}

async function expectDocFits(page: Page, width: number, label: string): Promise<void> {
  const m = await docOverflow(page);
  record(label, m);
  expect(m.vw, `${label} — 뷰포트 폭`).toBe(width);
  expect(m.sw, `${label} — 문서 scrollWidth`).toBeLessThanOrEqual(m.vw);
}

async function scrollFits(locator: Locator, label: string): Promise<void> {
  const m = await locator.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
  record(label, m);
  expect(m.sw, `${label} — scrollWidth`).toBeLessThanOrEqual(m.cw);
}

// 진행 중 버튼 — 라벨 뒤 `…`(aria-hidden) + aria-disabled.
async function expectPendingButton(button: Locator, label: string): Promise<void> {
  await expect(button, `${label} — 라벨 뒤 …`).toContainText("…");
  record(label, { text: ((await button.textContent()) ?? "").trim(), ariaDisabled: await button.getAttribute("aria-disabled") });
  await expect(button, `${label} — aria-disabled`).toHaveAttribute("aria-disabled", "true");
}

// 화면의 다른 1차(보이는 primary 버튼)는 모두 비활성이어야 한다. 보이는 1차 후보 수(자신 포함)가 화면마다 기대한
// 최소 개수 이상인지도 단언한다 — 클래스 이름 규칙이 바뀌어 후보가 0개면 조용히 통과하지 않게.
async function expectOtherPrimariesInactive(page: Page, self: Locator, label: string, minVisible: number): Promise<void> {
  const total = await page.locator('button[class*="primary"]').count();
  let visible = 0;
  let others = 0;
  for (let i = 0; i < total; i += 1) {
    const candidate = page.locator('button[class*="primary"]').nth(i);
    if (!(await candidate.isVisible())) continue;
    visible += 1;
    if (await candidate.evaluate((el, target) => el === target, await self.elementHandle())) continue;
    others += 1;
    await expect(candidate, `${label} — 다른 1차 비활성`).toHaveAttribute("aria-disabled", "true");
  }
  record(`${label} 1차 후보`, { visible, others });
  expect(visible, `${label} — 보이는 1차 후보 수`).toBeGreaterThanOrEqual(minVisible);
}

const prizeGrid = (page: Page) => page.getByRole("grid", { name: "경품" });
const prizeRows = (page: Page) => prizeGrid(page).locator('tbody > tr:not([aria-hidden="true"])');
const prizeCell = (page: Page, row: number, col: number) => prizeRows(page).nth(row).locator("td").nth(col);
const PRIZE_COL = { name: 1, value: 2, delivery: 3, winners: 4, submitted: 5 } as const;

function eventRow(page: Page, eventName: string) {
  return page.getByRole("row").filter({ has: page.getByRole("link", { name: eventName }) });
}

function kstToday(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
}

let pm: Account;
let pmId: string;
let manager: Account;
let admin: Account;
let managerRoleId: string;

test.beforeAll(async () => {
  pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
  const [me] = await db.select({ id: users.id }).from(users).where(eq(users.email, pm.email));
  pmId = me?.id ?? "";
  admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  managerRoleId = `role-e2e-daudit-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id: managerRoleId, name: `E2E 감사 ${managerRoleId.slice(-12)}`, sortOrder: 99 });
  await upsertPermission(SYSTEM_VIEWER, { roleId: managerRoleId, menu: "certs.events", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: managerRoleId, menu: "certs.qr", action: "write", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: managerRoleId, menu: "certs.submissions", action: "view", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: managerRoleId, infoItem: "cert_event.value", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: managerRoleId, infoItem: "cert_prize.value", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: managerRoleId, infoItem: "cert_submission.value", visible: true });
  manager = await createFixtureUser({ roleId: managerRoleId });
});

test.afterAll(async () => {
  await setRoleArchived(SYSTEM_VIEWER, managerRoleId, true);
});

// ── I′1 · I′2 ──────────────────────────────────────────────────────────────────────────────

test("I′1 제출 셀 — 접근 이름 `제출 3건`은 셀 안 .sr-only, 보이는 `3`은 aria-hidden(분모 없음) · 신청됨 행은 `—`", async ({ browser }) => {
  const open = await createCertEvent({ name: "감사 제출셀", createdBy: pmId, prizes: [{ name: "경품", unitValueKrw: 73_519 }] });
  await seedIpSubmissionsForTest(open.eventId, { ip: "203.0.113.31", count: 3 });
  const requested = await createCertEvent({ name: "감사 신청셀", status: "requested", createdBy: pmId });
  const page = await loggedInPage(browser, pm);
  await page.goto("/certs/events");

  const row = eventRow(page, open.eventName);
  await expect(row).toBeVisible();
  const cell = row.getByRole("cell").nth(3);
  await expect(cell.locator(".sr-only")).toHaveText("제출 3건");
  await expect(cell.locator('[aria-hidden="true"]')).toHaveText("3");
  expect(await cell.evaluate((el) => (el.textContent ?? "").includes("/")), "제출 셀 — 분모(/) 없음").toBe(false);

  const requestedCell = eventRow(page, requested.eventName).getByRole("cell").nth(3);
  await expect(requestedCell).toHaveText("—");
  await expect(requestedCell.locator(".sr-only")).toHaveCount(0);
  await expectDocFits(page, 1280, "I′1 1280");
  await page.context().close();
});

test("I′2 옆 패널(오른쪽 480) — 목록 표가 밀리지 않는다 · 「QR 생성 신청」 요청을 늦추면 1차 라벨 뒤 `…` + 다른 버튼 비활성", async ({ browser }) => {
  await createCertEvent({ name: "감사 패널 기존", status: "requested", createdBy: pmId });
  const page = await loggedInPage(browser, pm);
  await page.goto("/certs/events");
  const primary = page.getByRole("button", { name: "QR 생성 신청" });
  await expect(primary).toBeVisible();
  const table = page.locator("table").first();
  const before = await table.boundingBox();

  await primary.click();
  const panel = page.getByRole("dialog", { name: "QR 생성 신청" });
  await expect(panel).toBeVisible();
  const after = await table.boundingBox();
  record("I′2 목록 표 열기 전·후", { before, after });
  expect(after?.x, "I′2 — 목록 표 x").toBe(before?.x);
  expect(after?.y, "I′2 — 목록 표 y").toBe(before?.y);
  expect(after?.width, "I′2 — 목록 표 너비").toBe(before?.width);
  const panelBox = await panel.boundingBox();
  record("I′2 패널", panelBox);
  expect(panelBox?.width, "I′2 — 패널 너비").toBe(480);
  expect((panelBox?.x ?? 0) + (panelBox?.width ?? 0), "I′2 — 패널 오른쪽 끝 = 뷰포트").toBe(1280);

  await panel.getByLabel("행사 이름").fill(`감사 신청-${randomUUID().slice(0, 8)}`);
  await panel.getByLabel("당첨일").fill(kstToday());
  await delayServerActions(page, 2500);
  const submit = panel.getByRole("button", { name: /^QR 생성 신청/ });
  await submit.click();
  await expectPendingButton(submit, "I′2 신청 진행 중");
  await expect(panel.getByRole("button", { name: /^취소/ }), "I′2 진행 중 — 취소 aria-disabled").toHaveAttribute("aria-disabled", "true");
  await expectOtherPrimariesInactive(page, submit, "I′2 진행 중", 1); // 패널 제출 자신(머리 1차는 패널이 열린 동안 렌더하지 않는다 — DR-9)
  await expect(panel).toBeHidden({ timeout: 15_000 });
  await page.context().close();
});

// ── I′3 경품 편집 표 · 제출 섹션 1280 · 1024 ──────────────────────────────────────────────

for (const width of [1280, 1024]) {
  test(`I′3 ${width}px — 80자 경품명 줄 · 그룹 머리글 80자 · 제출 셀 「파기 대상」: 표 컨테이너 · 문서 가로 넘침 0`, async ({ browser }) => {
    const ev = await createCertEvent({
      name: "감사 상세",
      createdBy: pmId,
      prizes: [
        { name: LONG80, unitValueKrw: 73_519, delivery: "onsite", winnerCount: 1 },
        { name: "택배경품감사", unitValueKrw: 581_247, delivery: "parcel", winnerCount: 2 },
        { name: "소액경품감사", unitValueKrw: 49_731 },
      ],
    });
    await seedIpSubmissionsForTest(ev.eventId, { ip: `203.0.113.${width % 200}`, count: 3, prizeId: ev.prizeIds[0] });
    await seedIpSubmissionsForTest(ev.eventId, { ip: `203.0.114.${width % 200}`, count: 2, prizeId: ev.prizeIds[1] });
    await setCertPrizeValueForTest(ev.prizeIds[1] ?? "", 49_731);

    const page = await loggedInPage(browser, manager, width);
    await page.goto(`/certs/events/${ev.eventId}`);
    await expect(prizeGrid(page)).toBeVisible();
    await expect(prizeRows(page)).toHaveCount(3);

    // 경품 편집 표 — 표 · 격자 컨테이너 · 문서 · 80자 이름 칸.
    await scrollFits(prizeGrid(page), `I′3 ${width} 경품 표`);
    const wrappers = await prizeGrid(page).evaluate((table) => {
      const out: Array<{ sw: number; cw: number }> = [];
      for (let el = table.parentElement; el && el !== document.body; el = el.parentElement) out.push({ sw: el.scrollWidth, cw: el.clientWidth });
      return out;
    });
    record(`I′3 ${width} 표 컨테이너`, wrappers);
    for (const wrapper of wrappers) expect(wrapper.sw, `I′3 ${width} — 표 컨테이너 scrollWidth`).toBeLessThanOrEqual(wrapper.cw);
    await scrollFits(prizeCell(page, 0, PRIZE_COL.name), `I′3 ${width} 80자 경품명 셀`);
    await expect(prizeCell(page, 0, PRIZE_COL.name)).toContainText(LONG80);
    await expectDocFits(page, width, `I′3 ${width}`);

    // T4 제출 셀 `{N} · 파기 대상 {p}`.
    const discard = prizeCell(page, 1, PRIZE_COL.submitted);
    await expect(discard).toContainText("2 · 파기 대상 2");
    await scrollFits(discard, `I′3 ${width} 제출 셀`);

    // 제출 섹션 — 그룹 머리글(80자) · 제출 0인 경품은 머리글 없음(둘만).
    const headers = page.locator('th[scope="rowgroup"]');
    await expect(headers).toHaveCount(2);
    await expect(headers.first()).toContainText(`${LONG80} · 제출 3건 / 당첨 1명`);
    await expect(headers.first()).toContainText("초과 2건");
    await scrollFits(headers.first(), `I′3 ${width} 그룹 머리글`);
    await scrollFits(page.getByRole("table", { name: "제출" }), `I′3 ${width} 제출 표`);
    await page.context().close();
  });
}

// ── I′3 진행 중 — 「QR 생성」 · 「일괄 저장」 ─────────────────────────────────────────────────

test("I′3 「QR 생성」 요청을 늦추면 버튼 라벨 뒤 `…` + 경품 표 aria-busy + 편집 칸 무반응 + 다른 1차 비활성", async ({ browser }) => {
  const ev = await createCertEvent({
    name: "감사 QR진행",
    status: "requested",
    createdBy: pmId,
    prizes: [{ name: LONG80, unitValueKrw: 581_247, winnerCount: 1 }],
  });
  const page = await loggedInPage(browser, manager);
  await page.goto(`/certs/events/${ev.eventId}`);
  await expect(prizeGrid(page)).toBeVisible();
  await expect(prizeGrid(page)).not.toHaveAttribute("aria-busy", "true");
  // 진행 중에는 접근 이름이 「QR 생성처리 중」으로 바뀌므로 앞부분으로 찾는다.
  const qr = page.getByRole("button", { name: /^QR 생성/ });
  await expect(qr).not.toHaveAttribute("aria-disabled", "true");

  await delayServerActions(page, 2500);
  await qr.click();
  await expectPendingButton(qr, "I′3 QR 생성 진행 중");
  await expect(prizeGrid(page), "I′3 QR 생성 진행 중 — 경품 표 aria-busy").toHaveAttribute("aria-busy", "true");
  await prizeCell(page, 0, PRIZE_COL.value).click();
  await expect(prizeCell(page, 0, PRIZE_COL.value).locator("input"), "진행 중 — 편집 칸 입력 열림 없음").toHaveCount(0);
  await expectOtherPrimariesInactive(page, qr, "I′3 QR 생성 진행 중", 1); // 「QR 생성」 자신
  await expect(page.getByRole("heading", { name: "QR", level: 2 })).toBeVisible({ timeout: 15_000 });
  await page.context().close();
});

test("I′3 「일괄 저장」 요청을 늦추면 버튼 라벨 뒤 `…` + 경품 표 aria-busy + 편집 칸 무반응", async ({ browser }) => {
  const ev = await createCertEvent({
    name: "감사 저장진행",
    createdBy: pmId,
    prizes: [{ name: "저장진행경품", unitValueKrw: 581_247, winnerCount: 1 }],
  });
  const page = await loggedInPage(browser, manager);
  await page.goto(`/certs/events/${ev.eventId}`);
  await expect(prizeGrid(page)).toBeVisible();
  // 가액 칸을 고쳐 「일괄 저장 1」을 켠다.
  const valueCell = prizeCell(page, 0, PRIZE_COL.value);
  await valueCell.click();
  await valueCell.locator("input").fill("73,519");
  await valueCell.locator("input").press("Enter");
  const save = page.getByRole("button", { name: /^일괄 저장/ });
  await expect(save).not.toHaveAttribute("aria-disabled", "true");

  await delayServerActions(page, 2500);
  await save.click();
  await expectPendingButton(save, "I′3 일괄 저장 진행 중");
  await expect(prizeGrid(page), "I′3 일괄 저장 진행 중 — 경품 표 aria-busy").toHaveAttribute("aria-busy", "true");
  await prizeCell(page, 0, PRIZE_COL.winners).click();
  await expect(prizeCell(page, 0, PRIZE_COL.winners).locator("input"), "진행 중 — 편집 칸 입력 열림 없음").toHaveCount(0);
  await expect(prizeGrid(page)).not.toHaveAttribute("aria-busy", "true", { timeout: 15_000 });
  await page.context().close();
});

// ── 좁은 PC 1000(D-10) ───────────────────────────────────────────────────────────────────

test("1000px — I′3 경품은 읽기 표(편집 입력 · 「QR 생성」 · 「일괄 저장」 · 힌트 줄 없음) · 접수 중이면 「링크 닫기」 · 문서 가로 넘침 0", async ({ browser }) => {
  const ev = await createCertEvent({
    name: "감사 천폭",
    createdBy: pmId,
    prizes: [{ name: LONG80, unitValueKrw: 73_519 }],
  });
  const page = await loggedInPage(browser, manager, NARROW_PC.width, NARROW_PC.height);
  await page.goto(`/certs/events/${ev.eventId}`);
  await expect(page.getByRole("table", { name: "경품" })).toBeVisible();
  await expect(page.getByRole("grid")).toHaveCount(0);
  await expect(page.getByRole("table", { name: "경품" }).locator("input")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^QR 생성$|^일괄 저장/ })).toHaveCount(0);
  await expect(page.getByText(/새 줄 Ctrl\+Enter|저장 Ctrl\+S/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "링크 닫기" })).toBeVisible();
  await expectDocFits(page, NARROW_PC.width, "I′3 1000");

  // I′1 「QR 생성 신청」은 1024 미만에도 있다(1차는 PM 계정).
  await page.context().close();
  const pmPage = await loggedInPage(browser, pm, NARROW_PC.width, NARROW_PC.height);
  await pmPage.goto("/certs/events");
  await expect(pmPage.getByRole("button", { name: "QR 생성 신청" })).toBeVisible();
  await expectDocFits(pmPage, NARROW_PC.width, "I′1 1000");
  await pmPage.context().close();
});

// ── I4 — 진행 중 · 머리 · 확인 창 부제 ─────────────────────────────────────────────────────

const reviewPath = (id: string) => `/certs/submissions/${id}`;
const rrnInput = (page: Page) => page.getByRole("textbox", { name: "주민등록번호" });

test("I4 「전체 보기」 · 「고친 내용 저장」 요청을 늦추면 버튼 라벨 뒤 `…` + 다른 1차 비활성", async ({ browser }) => {
  const seeded = await seedSubmittedCert({ delivery: "parcel" });
  const page = await loggedInPage(browser, admin);
  await page.goto(reviewPath(seeded.submissionId));
  await expect(page.getByRole("button", { name: "전체 보기" })).toBeVisible();

  // 전체 보기 — 칸을 하나 고쳐 둔 채(저장 1차가 켜진 상태)에서 늦춘다.
  await page.getByLabel("연락처").fill("010-5555-6666");
  const save = page.getByRole("button", { name: "고친 내용 저장" });
  await expect(save).not.toHaveAttribute("aria-disabled", "true");
  await delayServerActions(page, 2500);
  const reveal = page.locator("button", { hasText: "전체 보기" });
  await reveal.click();
  await expectPendingButton(reveal, "I4 전체 보기 진행 중");
  await expect(save, "I4 전체 보기 진행 중 — 저장 aria-disabled").toHaveAttribute("aria-disabled", "true");
  await expectOtherPrimariesInactive(page, reveal, "I4 전체 보기 진행 중", 1); // 「고친 내용 저장」(「전체 보기」는 3차)
  await expect(rrnInput(page)).toBeVisible({ timeout: 15_000 });
  await expect(reveal).toHaveCount(0);

  // 고친 내용 저장.
  await expect(save).not.toHaveAttribute("aria-disabled", "true");
  await save.click();
  await expectPendingButton(save, "I4 고친 내용 저장 진행 중");
  await expect(page.getByRole("button", { name: "가리기" }), "I4 저장 진행 중 — 가리기 aria-disabled").toHaveAttribute("aria-disabled", "true");
  await expectOtherPrimariesInactive(page, save, "I4 저장 진행 중", 1); // 「고친 내용 저장」 자신
  await expect(page.getByText(/^저장됨 · 연락처 · \d{2}:\d{2}$/)).toBeVisible({ timeout: 15_000 });
  await page.context().close();
});

for (const width of [1024, 375]) {
  test(`I4 ${width}px — 80자 경품명: 머리 2차 「대조 제외」 · 「인쇄」가 겹치지 않고 확인 창 부제가 줄바꿈으로 서며 가로 넘침 0`, async ({ browser }) => {
    const seeded = await seedSubmittedCert({ prizeName: LONG80, delivery: "parcel" });
    const page = await loggedInPage(browser, admin, width, 800);
    await page.goto(reviewPath(seeded.submissionId));
    const exclude = page.getByRole("button", { name: "대조 제외" });
    const print = page.getByRole("button", { name: "인쇄" });
    await expect(exclude).toBeVisible();
    await expect(print).toBeVisible();
    await expectDocFits(page, width, `I4 ${width}`);

    const [a, b] = [await exclude.boundingBox(), await print.boundingBox()];
    const overlap =
      !!a && !!b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    record(`I4 ${width} 머리 버튼`, { exclude: a, print: b });
    expect(overlap, `I4 ${width} — 「대조 제외」 · 「인쇄」 겹침`).toBe(false);
    const title = await page.getByRole("heading", { level: 1 }).boundingBox();
    for (const box of [a, b]) {
      const titleOverlap = !!box && !!title && box.x < title.x + title.width && title.x < box.x + box.width && box.y < title.y + title.height && title.y < box.y + box.height;
      expect(titleOverlap, `I4 ${width} — 머리 버튼과 제목 겹침`).toBe(false);
    }

    await exclude.click();
    const dialog = page.getByRole("dialog", { name: "대조 제외" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(`${seeded.name} · ${LONG80}`);
    const m = await dialog.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, sw: el.scrollWidth, cw: el.clientWidth, vw: innerWidth, vh: innerHeight };
    });
    record(`I4 ${width} 확인 창`, m);
    expect(m.left, `I4 ${width} — 확인 창 왼쪽`).toBeGreaterThanOrEqual(0);
    expect(m.right, `I4 ${width} — 확인 창 오른쪽`).toBeLessThanOrEqual(m.vw);
    expect(m.bottom, `I4 ${width} — 확인 창 아래`).toBeLessThanOrEqual(m.vh);
    expect(m.sw, `I4 ${width} — 확인 창 scrollWidth`).toBeLessThanOrEqual(m.cw);
    await expectDocFits(page, width, `I4 확인 창 ${width}`);
    await page.context().close();
  });
}

// ── P1 인쇄물 A4 한 장 ─────────────────────────────────────────────────────────────────────

function textOfLength(len: number, unit: string): string {
  const out = Array.from({ length: len }, (_, index) => unit[index % unit.length] ?? "가").join("");
  return out.trimEnd().length === len ? out : `${out.slice(0, -1)}가`;
}

test("P1 인쇄물 — 40자 행사 이름 + 80자 경품명 + 긴 도로명 주소(71자)가 PDF 한 장", async ({ browser }) => {
  const seeded = await seedSubmittedCert({ delivery: "parcel", address: textOfLength(71, "서울특별시 마포구 월드컵북로 "), prizeName: LONG80 });
  await db
    .update(certEvents)
    .set({ name: textOfLength(40, "2026 현대자동차 아이오닉 미디어 론칭 ") })
    .where(eq(certEvents.id, seeded.eventId));
  expect((await db.select({ name: certPrizes.name }).from(certPrizes).where(eq(certPrizes.id, seeded.prizeId)))[0]?.name).toBe(LONG80);

  const page = await loggedInPage(browser, admin, 794, 1123);
  await page.goto(`/print/certs/${seeded.submissionId}`);
  await expect(page.locator("[data-ready]")).toHaveCount(1);
  await page.emulateMedia({ media: "print" });
  const pdf = await page.pdf({ preferCSSPageSize: true });
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
  record("P1 PDF 페이지 수", pages);
  expect(pages, "P1 PDF 페이지 수").toBe(1);
  await page.context().close();
});
