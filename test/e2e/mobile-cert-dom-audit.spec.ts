import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page, type Request } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole, setRoleArchived } from "@/repositories/roles";
import { createFixtureUser } from "./fixtures";
import { createCertEvent, seedIpSubmissionsForTest, setCertPrizeValueForTest } from "./helpers/cert";
import { drawSignature, fillIntakeForm, submitButton } from "./helpers/cert-form";

// 04.3-13 Task 2 — 독립 DOM 감사(폰). 스크린샷 육안 판정 없이 DOM 수치(scrollWidth/clientWidth · getBoundingClientRect ·
// aria 속성 · 서버 액션 요청 수)로만 판정한다. 머리 375, 테스트 안에서 320 · 360 · 180(= 360의 200% 확대).
//
// 감사 목록 원본(backstop 중 폰으로 잴 수 있는 줄):
//  - 04.3-06 E4 360 · 200% 확대(주민등록번호 두 칸 · sticky 제출 줄 · 서명 칸) → 「E′2 → E′4 → E5」
//  - 04.3-15 · 16 E′ 320 · 375 · 200% 가로 넘침 · 터치 44(경품 행 · 긴 경품명 · 다른 경품 고르기 · E6-d) · 04.3-16 DR-16 · DR-21
//    (scroll-padding-bottom · 서명 칸 좌우 여백) · T5 문의 줄 `tel:` 44 · E′2 행 누름 서버 액션 0건
//  - 04.3-04 폰 표 칸 접기(I′1 · I′3) · T7 I′1 폰 폭 · T8 제출 표 320 · 375 · I′1 1차 「QR 생성 신청」이 폰에도
//  - 04.3-10 · 17 I′3 경품명 80자 · 그룹 머리글 80자 · 알림함 행 320
// 가액 누수는 mobile-cert-prize-leak.spec.ts · mobile-cert-branches.spec.ts가 같은 명령에서 다시 돈다.

test.use({ viewport: { width: 375, height: 800 } });
test.describe.configure({ mode: "serial" });

type Account = { email: string; password: string };

// 가액은 픽스처 값만(73,519 · 581,247 · 49,731). 49,731은 50,000 이하라 수령자 목록에 없다.
const LONG80 = "아이오닉쇼케이스현장에스엔에스이벤트경품".repeat(4);
const PARCEL_NAME = "택배경품감사";
const SMALL_NAME = "소액경품감사";
const PHONE = "010-4821-7730";
const ADDRESS = "서울시 마포구 월드컵로 1";

async function login(page: Page, account: Account): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function loggedInPage(browser: Browser, account: Account, width: number): Promise<Page> {
  const context = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await context.newPage();
  await login(page, account);
  return page;
}

// 판정 근거로 남기는 실측값 — JSON 리포터의 annotations(`실측`)에 실린다.
function record(label: string, value: unknown): void {
  test.info().annotations.push({ type: "실측", description: `${label} = ${JSON.stringify(value)}` });
}

type Overflow = { vw: number; docSW: number; formSW: number | null; formCW: number | null; tables: Array<{ sw: number; cw: number }> };

async function overflowOf(page: Page): Promise<Overflow> {
  return page.evaluate(() => {
    const de = document.documentElement;
    const form = document.querySelector("main form");
    return {
      vw: de.clientWidth,
      docSW: de.scrollWidth,
      formSW: form ? form.scrollWidth : null,
      formCW: form ? form.clientWidth : null,
      tables: [...document.querySelectorAll("table")]
        .filter((table) => table.getBoundingClientRect().width > 0)
        .map((table) => ({ sw: table.scrollWidth, cw: table.clientWidth })),
    };
  });
}

// 문서 · 폼 · (보이는) 표 가로 넘침 0 — 뷰포트 폭이 요청한 폭과 같은지도 같이 잰다(작은 폭을 브라우저가 올려 잡으면 감사가 거짓이다).
async function expectNoOverflow(page: Page, width: number, label: string): Promise<void> {
  const m = await overflowOf(page);
  record(label, { vw: m.vw, docSW: m.docSW, formSW: m.formSW, formCW: m.formCW, tables: m.tables.map((t) => `${t.sw}/${t.cw}`) });
  expect(m.vw, `${label} — 뷰포트 폭`).toBe(width);
  expect(m.docSW, `${label} — 문서 scrollWidth`).toBeLessThanOrEqual(m.vw);
  if (m.formSW !== null && m.formCW !== null) expect(m.formSW, `${label} — 폼 scrollWidth`).toBeLessThanOrEqual(m.formCW);
  for (const table of m.tables) expect(table.sw, `${label} — 표 scrollWidth`).toBeLessThanOrEqual(table.cw);
}

function trackPosts(page: Page): Request[] {
  const posts: Request[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request);
  });
  return posts;
}

async function heights(page: Page, selector: string): Promise<number[]> {
  return page.locator(selector).evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
}

// 글자가 차지한 줄 수(Range 줄 상자의 서로 다른 top 개수).
async function textLines(page: Page, selector: string): Promise<number> {
  return page.locator(selector).first().evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
  });
}

const dataPrize = (page: Page, id: string) => page.locator(`button[data-prize-id="${id}"]`);

// ── 수령자 흐름 — E′2 · E′4 · E5 · E6-d (375 머리 · 320 · 360 · 180) ─────────────────────────────

// 머리 375 · 320 · 360 · 180(= 360의 200% 확대).
const PHONE_VIEWPORTS = [
  { width: 375, height: 800 },
  { width: 320, height: 800 },
  { width: 360, height: 800 },
  { width: 180, height: 800 },
] as const;

for (const viewport of PHONE_VIEWPORTS) {
  const width: number = viewport.width;
  test(`E′2 → E′4 → E5 — ${width}px 가로 넘침 0 · 행 48 · 3차 44 · 행 누름 서버 액션 0건`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const { link, prizeIds, eventName } = await createCertEvent({
      name: `폰감사${width}`,
      prizes: [
        { name: LONG80, unitValueKrw: 73_519, delivery: "onsite" },
        { name: PARCEL_NAME, unitValueKrw: 581_247, delivery: "parcel" },
        { name: SMALL_NAME, unitValueKrw: 49_731, delivery: "onsite" },
      ],
    });
    const [longId, parcelId] = prizeIds;
    if (!link || !longId || !parcelId) throw new Error("링크 · 경품 없음");

    // E′2 — 50,000 넘는 경품 둘만 목록에 선다(가액 49,731은 없다).
    await page.goto(link);
    await expect(page.getByText("받은 경품을 골라 주세요", { exact: true })).toBeVisible();
    await expect(page.locator("button[data-prize-id]")).toHaveCount(2);
    await expect(page.getByText(SMALL_NAME)).toHaveCount(0);
    await expectNoOverflow(page, width, `E′2 ${width}`);
    const rowHeights = await heights(page, "button[data-prize-id]");
    record(`E′2 ${width} 경품 행 높이`, rowHeights);
    for (const h of rowHeights) expect(h, `E′2 ${width} — 경품 행 높이`).toBeGreaterThanOrEqual(48);
    const tel = await heights(page, 'a[href^="tel:"]');
    record(`E′2 ${width} tel 링크 높이`, tel);
    expect(tel.length, `E′2 ${width} — 문의 전화 링크`).toBeGreaterThan(0);
    for (const h of tel) expect(h, `E′2 ${width} — tel: 터치 높이`).toBeGreaterThanOrEqual(44);
    await expect(page.getByText(eventName, { exact: false }).first()).toBeVisible();
    expect(await textLines(page, `button[data-prize-id="${longId}"] span`), `E′2 ${width} — 80자 경품명 줄 수`).toBeGreaterThanOrEqual(1);

    // 행 누름은 서버 액션을 부르지 않는다.
    const posts = trackPosts(page);
    await dataPrize(page, parcelId).click();
    await expect(page.getByText(`${PARCEL_NAME} 1개`, { exact: true })).toBeVisible();
    record(`E′2 → E′4 ${width} 서버 액션 POST 수`, posts.length);
    expect(posts.length, `E′2 → E′4 ${width} — 서버 액션 POST 수`).toBe(0);

    // E′4 — 경품 블록 · 「다른 경품 고르기」 · 주민등록번호 두 칸 · 택배 주소 · 서명 칸 · sticky 제출 줄.
    await expectNoOverflow(page, width, `E′4 ${width}`);
    const other = page.getByRole("button", { name: "다른 경품 고르기" });
    await expect(other).toBeVisible();
    record(`E′4 ${width} 3차·1차 높이`, { tertiary: (await other.boundingBox())?.height, primary: (await submitButton(page).boundingBox())?.height });
    expect((await other.boundingBox())?.height ?? 0, `E′4 ${width} — 3차 높이`).toBeGreaterThanOrEqual(44);
    const submitH = (await submitButton(page).boundingBox())?.height ?? 0;
    expect(submitH, `E′4 ${width} — 1차 높이`).toBeGreaterThanOrEqual(48);
    const vw = (await overflowOf(page)).vw;
    for (const locator of [page.getByLabel("주민등록번호 앞 6자리"), page.getByLabel("주민등록번호 뒤 7자리"), page.locator("#address")]) {
      await expect(locator).toBeVisible();
      const box = await locator.boundingBox();
      expect(box?.x ?? -1, `E′4 ${width} — 입력 칸 왼쪽`).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0), `E′4 ${width} — 입력 칸 오른쪽`).toBeLessThanOrEqual(vw);
    }
    const canvas = page.getByRole("application", { name: /^서명/ });
    await expect(canvas).toBeVisible();
    const canvasBox = await canvas.boundingBox();
    expect((canvasBox?.x ?? -1) + (canvasBox?.width ?? 0), `E′4 ${width} — 서명 칸 오른쪽`).toBeLessThanOrEqual(vw);
    expect(canvasBox?.x ?? -1, `E′4 ${width} — 서명 칸 왼쪽`).toBeGreaterThanOrEqual(0);
    // DR-21 서명 칸 좌우 여백 --s-4 · DR-16 scroll-padding-bottom ≥ sticky 제출 줄 높이.
    const gutters = await page.evaluate(() => {
      const wrap = document.querySelector('[role="application"]')?.parentElement;
      const form = document.querySelector("main form");
      const probe = document.createElement("div");
      probe.style.width = "var(--s-4)";
      document.body.append(probe);
      const s4 = probe.getBoundingClientRect().width;
      probe.remove();
      let sticky: Element | null = document.querySelector('button[type="submit"]');
      while (sticky && getComputedStyle(sticky).position !== "sticky") sticky = sticky.parentElement;
      const wrapRect = wrap?.getBoundingClientRect();
      const formRect = form?.getBoundingClientRect();
      return {
        s4,
        left: wrapRect && formRect ? wrapRect.left - formRect.left : null,
        right: wrapRect && formRect ? formRect.right - wrapRect.right : null,
        scrollPad: parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom) || 0,
        barH: sticky ? sticky.getBoundingClientRect().height : null,
      };
    });
    record(`E′4 ${width} 서명 여백 · scroll-padding-bottom · 제출 줄`, gutters);
    expect(gutters.left, `E′4 ${width} — 서명 칸 왼쪽 여백`).toBeGreaterThanOrEqual(gutters.s4);
    expect(gutters.right, `E′4 ${width} — 서명 칸 오른쪽 여백`).toBeGreaterThanOrEqual(gutters.s4);
    expect(gutters.barH, `E′4 ${width} — sticky 제출 줄 있음`).not.toBeNull();
    expect(gutters.scrollPad, `E′4 ${width} — scroll-padding-bottom ≥ 제출 줄`).toBeGreaterThanOrEqual((gutters.barH ?? 0) - 0.5);

    // E5 — 입력 · 서명 · 제출 뒤 결과 화면도 넘치지 않는다.
    await fillIntakeForm(page, { phone: PHONE, address: ADDRESS });
    await expectNoOverflow(page, width, `E′4 채움 ${width}`);
    await drawSignature(page);
    await submitButton(page).click();
    await expect(page.getByText("제출되었습니다", { exact: true })).toBeVisible();
    await expectNoOverflow(page, width, `E5 ${width}`);
  });

  test(`E6-d — ${width}px 경품이 모두 50,000 이하인 행사: 가로 넘침 0`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const { link } = await createCertEvent({
      name: `폰감사E6d${width}`,
      prizes: [{ name: SMALL_NAME, unitValueKrw: 49_731, delivery: "onsite" }],
    });
    if (!link) throw new Error("링크 없음");
    await page.goto(link);
    await expect(page.getByText("받을 수 있는 경품이 없습니다", { exact: true })).toBeVisible();
    await expect(page.locator("button[data-prize-id]")).toHaveCount(0);
    await expectNoOverflow(page, width, `E6-d ${width}`);
  });
}

// ── 내부 화면 — I′1 · I′2 시트 · I′3 · 알림함(폰) ─────────────────────────────────────────────

test.describe("내부 화면 폰 폭", () => {
  let pm: Account;
  let pmId: string;
  let manager: Account;
  let managerRoleId: string;

  test.beforeAll(async () => {
    pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    const [me] = await db.select({ id: users.id }).from(users).where(eq(users.email, pm.email));
    pmId = me?.id ?? "";
    managerRoleId = `role-e2e-audit-${randomUUID()}`;
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

  for (const width of [375, 320]) {
    test(`I′1 폰 ${width}px — 표 가로 넘침 0 · 칸 접기 · 1차 「QR 생성 신청」 → 아래 시트(I′2)가 뷰포트 안 · 가로 넘침 0`, async ({ browser }) => {
      await createCertEvent({ name: "폰감사 신청", status: "requested", createdBy: pmId });
      const long = await createCertEvent({ name: LONG80, status: "open", createdBy: pmId });
      await createCertEvent({ name: "폰감사 닫힘", status: "closed", createdBy: pmId });
      const page = await loggedInPage(browser, pm, width);
      await page.goto("/certs/events");
      const primary = page.getByRole("button", { name: "QR 생성 신청" });
      await expect(primary).toBeVisible();
      await expect(page.getByRole("link", { name: long.eventName })).toBeVisible();
      await expectNoOverflow(page, width, `I′1 ${width}`);
      // 칸 접기 — P1 머리글(행사 · 제출 · 상태)만 보이고 당첨일 · 담당(P2)은 숨는다.
      const visibleHeaders = await page.locator("thead th").evaluateAll((ths) =>
        ths.filter((th) => th.getBoundingClientRect().width > 0 && getComputedStyle(th).display !== "none").map((th) => (th.textContent ?? "").trim()),
      );
      record(`I′1 ${width} 보이는 머리글`, visibleHeaders);
      expect(visibleHeaders, `I′1 ${width} — 보이는 머리글`).toEqual(["행사", "제출", "상태"]);

      await primary.click();
      const sheet = page.getByRole("dialog", { name: "QR 생성 신청" });
      await expect(sheet).toBeVisible();
      const m = await sheet.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, sw: el.scrollWidth, cw: el.clientWidth, vw: innerWidth, vh: innerHeight };
      });
      record(`I′2 ${width} 시트`, m);
      expect(m.left, `I′2 ${width} — 시트 왼쪽`).toBeGreaterThanOrEqual(0);
      expect(m.right, `I′2 ${width} — 시트 오른쪽`).toBeLessThanOrEqual(m.vw);
      expect(m.top, `I′2 ${width} — 시트 위`).toBeGreaterThanOrEqual(0);
      expect(m.bottom, `I′2 ${width} — 시트 아래`).toBeLessThanOrEqual(m.vh);
      expect(m.sw, `I′2 ${width} — 시트 scrollWidth`).toBeLessThanOrEqual(m.cw);
      await expectNoOverflow(page, width, `I′2 ${width}`);
      await page.context().close();
    });
  }

  test("알림함 320px — 80자 행사 이름의 「QR 생성 신청」 행이 줄바꿈으로 서고 가로 넘침 0(I′2 폰 시트로 실제 신청)", async ({ browser }) => {
    const eventName = `${LONG80.slice(0, 80 - 9)}-${randomUUID().slice(0, 8)}`;
    expect(eventName).toHaveLength(80);
    const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
    const pmPage = await loggedInPage(browser, pm, 320);
    await createCertEvent({ name: "폰감사 알림 기존", status: "requested", createdBy: pmId });
    await pmPage.goto("/certs/events");
    await pmPage.getByRole("button", { name: "QR 생성 신청" }).click();
    const sheet = pmPage.getByRole("dialog", { name: "QR 생성 신청" });
    await sheet.getByLabel("행사 이름").fill(eventName);
    await sheet.getByLabel("당첨일").fill(today);
    await sheet.getByRole("button", { name: "QR 생성 신청" }).click();
    await expect(sheet).toBeHidden();
    await expect(pmPage.getByRole("link", { name: eventName })).toBeVisible();
    await expectNoOverflow(pmPage, 320, "I′1 신청 직후 320");
    await pmPage.context().close();

    const page = await loggedInPage(browser, manager, 320);
    await page.goto("/notifications");
    const row = page.getByText(eventName, { exact: false }).first();
    await expect(row).toBeVisible();
    await expectNoOverflow(page, 320, "알림함 320");
    const cell = await row.evaluate((el) => {
      const cellEl = el.closest("td") ?? el;
      return { sw: cellEl.scrollWidth, cw: cellEl.clientWidth };
    });
    record("알림함 320 내용 칸", cell);
    expect(cell.sw, "알림함 — 내용 칸 scrollWidth").toBeLessThanOrEqual(cell.cw);
    await page.context().close();
  });

  for (const width of [320, 375]) {
    test(`I′3 폰 ${width}px — 경품 읽기 표(편집 입력 · 「QR 생성」 · 「일괄 저장」 없음) · 80자 경품명 · 그룹 머리글 줄바꿈 · 제출 칸 접기 + RowSheet 「제출 내용」`, async ({ browser }) => {
      const ev = await createCertEvent({
        name: "폰감사 상세",
        createdBy: pmId,
        prizes: [
          { name: LONG80, unitValueKrw: 73_519, delivery: "onsite", winnerCount: 1 },
          { name: PARCEL_NAME, unitValueKrw: 581_247, delivery: "parcel", winnerCount: 2 },
          { name: SMALL_NAME, unitValueKrw: 49_731, delivery: "onsite" },
        ],
      });
      // 80자 경품에 제출 셋(당첨 1명 → 초과 2건) · 택배 경품은 제출 둘 뒤 가액을 49,731로 내려 `파기 대상`(T4) · 소액 경품은 0건(머리글이 서지 않는다).
      await seedIpSubmissionsForTest(ev.eventId, { ip: `203.0.113.${width % 200}`, count: 3, prizeId: ev.prizeIds[0] });
      await seedIpSubmissionsForTest(ev.eventId, { ip: `203.0.114.${width % 200}`, count: 2, prizeId: ev.prizeIds[1] });
      await setCertPrizeValueForTest(ev.prizeIds[1] ?? "", 49_731);
      const page = await loggedInPage(browser, manager, width);
      await page.goto(`/certs/events/${ev.eventId}`);
      await expect(page.getByRole("heading", { name: ev.eventName, level: 1 })).toBeVisible();

      // 경품 읽기 표.
      await expect(page.getByRole("table", { name: "경품" })).toBeVisible();
      await expect(page.getByRole("grid")).toHaveCount(0);
      await expect(page.getByRole("table", { name: "경품" }).locator("input")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^QR 생성$|^일괄 저장/ })).toHaveCount(0);
      await expect(page.getByText(/새 줄 Ctrl\+Enter|저장 Ctrl\+S/)).toHaveCount(0);
      await expect(page.getByText(LONG80, { exact: false }).first()).toBeVisible();
      await expectNoOverflow(page, width, `I′3 ${width}`);

      // 제출 섹션 — 그룹 머리글 80자(줄바꿈) · 제출 0인 경품은 머리글 없음 · 칸 접기.
      await expect(page.locator('th[scope="rowgroup"]')).toHaveCount(2);
      const header = page.locator('th[scope="rowgroup"]').first();
      await expect(header).toContainText(`${LONG80} · 제출 3건 / 당첨 1명`);
      await expect(header).toContainText("초과 2건");
      // T4 제출 셀 — `{N} · 파기 대상 {p}`가 좁은 제출 열에서도 줄바꿈으로 서고 넘치지 않는다(표 scrollWidth는 expectNoOverflow가 잰다).
      const discardCell = page.getByRole("table", { name: "경품" }).locator("td", { hasText: "파기 대상" }).first();
      await expect(discardCell).toContainText("2 · 파기 대상 2");
      const discardMetrics = await discardCell.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
      record(`I′3 ${width} 제출 셀`, discardMetrics);
      expect(discardMetrics.sw, `I′3 ${width} — 제출 셀 scrollWidth`).toBeLessThanOrEqual(discardMetrics.cw);
      const headerMetrics = await header.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return { lines: new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size, sw: el.scrollWidth, cw: el.clientWidth };
      });
      record(`I′3 ${width} 그룹 머리글`, headerMetrics);
      expect(headerMetrics.sw, `I′3 ${width} — 그룹 머리글 scrollWidth`).toBeLessThanOrEqual(headerMetrics.cw);
      if (width === 320) expect(headerMetrics.lines, "I′3 320 — 그룹 머리글 줄 수(줄바꿈)").toBeGreaterThanOrEqual(2);
      const submissionHeaders = await page
        .getByRole("table", { name: "제출" })
        .locator("thead th")
        .evaluateAll((ths) => ths.filter((th) => th.getBoundingClientRect().width > 0 && getComputedStyle(th).display !== "none").map((th) => (th.textContent ?? "").trim()));
      record(`I′3 ${width} 제출 표 보이는 머리글`, submissionHeaders);
      expect(submissionHeaders, `I′3 ${width} — 제출 표 보이는 머리글`).toEqual(["이름", "제출"]);

      const collapsed = page.locator('td[role="button"]').first();
      await expect(collapsed).toBeVisible();
      record(`I′3 ${width} 접힌 줄 높이`, (await collapsed.boundingBox())?.height);
      expect((await collapsed.boundingBox())?.height ?? 0, `I′3 ${width} — 접힌 줄 높이`).toBeGreaterThanOrEqual(44);
      await collapsed.click();
      const sheet = page.getByRole("dialog");
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole("link", { name: /^제출 내용/ })).toBeVisible();
      const sheetMetrics = await sheet.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return { left: rect.left, right: rect.right, sw: el.scrollWidth, cw: el.clientWidth, vw: innerWidth };
      });
      record(`I′3 ${width} RowSheet`, sheetMetrics);
      expect(sheetMetrics.left).toBeGreaterThanOrEqual(0);
      expect(sheetMetrics.right).toBeLessThanOrEqual(sheetMetrics.vw);
      expect(sheetMetrics.sw, `I′3 ${width} — RowSheet scrollWidth`).toBeLessThanOrEqual(sheetMetrics.cw);
      await expectNoOverflow(page, width, `I′3 RowSheet ${width}`);
      await page.context().close();
    });
  }
});
