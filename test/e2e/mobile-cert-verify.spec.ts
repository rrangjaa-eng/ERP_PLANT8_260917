import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { certEvents, certWinners } from "@/db/schema";
import type { VerifyIdemEntry } from "@/db/schema/cert-winners";
import { createCertEvent, withCertFeatureOff, CERT_E2E_CONTACT_PHONE } from "./helpers/cert";

test.use({ viewport: { width: 375, height: 800 } });
test.describe.configure({ mode: "serial" });

// 04.3-03 Task 2a ⑦ — E2 · E3 기본 상태(겹침 · 문의 · 틀림 · 잠김 · 풀림 ·
// 응답 없음 · 멈춤 · 닫힘 · 뒤로 · 고아 항목 · 직접 POST). 스펙이 DB를
// 직접 고치는 것은 자기 행사 행(contact_phone · closed_at)과 자리 칸뿐이다.

const MUTED = "rgb(78, 93, 89)";
const DANGER = "rgb(155, 28, 28)";
const BLOCKED_FIRST = "뒤 4자리 숫자를 적으면 확인할 수 있습니다";

async function winnerIdOf(eventId: string, name: string): Promise<string> {
  const rows = await db.select().from(certWinners).where(eq(certWinners.eventId, eventId));
  const row = rows.find((r) => r.name === name);
  if (!row) throw new Error(`자리 없음: ${name}`);
  return row.id;
}

async function seatOf(id: string) {
  const [row] = await db.select().from(certWinners).where(eq(certWinners.id, id));
  if (!row) throw new Error("자리 없음");
  return row;
}

function last4Field(page: Page) {
  return page.getByLabel("전화번호 뒤 4자리");
}

function confirmButton(page: Page) {
  return page.getByRole("button", { name: /^전화번호 확인/ });
}

async function wrongByClick(page: Page, digits = "0000") {
  await last4Field(page).fill(digits);
  await confirmButton(page).click();
}

async function oneWinnerEvent(name = "E2E확인") {
  const ev = await createCertEvent({ name, winners: [{ name: "김하늘", phone: "010-4821-7730" }] });
  return ev;
}

test("겹치는 가린 이름은 2행(경품 · 구별 표시)이 보이고 나머지는 한 줄 · 문의 줄은 행사 사본 번호", async ({ page }) => {
  const ev = await createCertEvent({
    name: "E2E겹침",
    winners: [
      { name: "김민수", phone: "010-1111-0001", prizeName: "갤럭시 탭 S10", distinguishLabel: "A" },
      { name: "김문수", phone: "010-1111-0002", prizeName: "갤럭시 탭 S10", distinguishLabel: "B" },
      { name: "김하늘", phone: "010-1111-0003" },
      { name: "이도윤", phone: "010-1111-0004" },
    ],
  });
  await db.update(certEvents).set({ contactPhone: "0315550000" }).where(eq(certEvents.id, ev.eventId));
  await page.goto(ev.link);

  const rows = page.locator("ul li button");
  await expect(rows.filter({ hasText: "김*수" })).toHaveCount(2);
  await expect(rows.filter({ hasText: "갤럭시 탭 S10 1개 · A" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "갤럭시 탭 S10 1개 · B" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "김*늘" })).toHaveText("김*늘");
  await expect(rows.filter({ hasText: "이*윤" })).toHaveText("이*윤");

  const inquiry = page.getByText(/^목록에 이름이 없으면 PLANT8 경영관리/);
  await expect(inquiry).toHaveText("목록에 이름이 없으면 PLANT8 경영관리 031-555-0000에 전화해 주세요");
  await expect(inquiry.getByRole("link")).toHaveAttribute("href", "tel:0315550000");
  expect(CERT_E2E_CONTACT_PHONE).not.toBe("031-555-0000");
});

test("틀림 → 남은 횟수 · 칸 비움 · 포커스 칸 · 다섯 번째(1차 클릭) 잠김 → 풀림 때 포커스 칸 · 다른 곳에 둔 포커스는 그대로", async ({
  page,
}) => {
  const ev = await oneWinnerEvent("E2E잠김");
  await page.goto(ev.link);
  // 시계는 목록이 선 뒤에 건다 — 탐색 전에 걸면 스트리밍 렌더가 멈춘다.
  await expect(page.getByRole("button", { name: "김*늘" })).toBeVisible();
  await page.clock.install();
  await page.getByRole("button", { name: "김*늘" }).click();
  await expect(last4Field(page)).toBeFocused();
  await expect(page).toHaveTitle("전화번호 확인 · 기타소득 지급 확인");

  const firstReason = page.getByText(BLOCKED_FIRST, { exact: true });
  await expect(firstReason).toHaveCSS("color", MUTED);

  await wrongByClick(page);
  const wrongLine = page.getByText("전화번호 뒤 4자리가 맞지 않습니다 · 다시 적어 주세요 · 남은 횟수 4번");
  await expect(wrongLine).toBeVisible();
  await expect(page.locator('[aria-live="polite"]').filter({ has: wrongLine })).toHaveCount(1);
  await expect(last4Field(page)).toHaveValue("");
  await expect(last4Field(page)).toHaveAttribute("aria-invalid", "true");
  await expect(last4Field(page)).toBeFocused();

  for (const left of [3, 2, 1]) {
    await wrongByClick(page);
    await expect(page.getByText(`남은 횟수 ${left}번`, { exact: false })).toBeVisible();
  }
  await wrongByClick(page);
  const lockLine = page.getByText(/^틀린 번호가 5번 들어와 확인이 잠겼습니다 · \d{2}:\d{2}부터 다시 해 주세요$/);
  await expect(lockLine).toBeVisible();
  await expect(lockLine).toHaveCSS("color", DANGER);
  await expect(page.getByText(/^등록한 번호가 다르면 PLANT8 경영관리 /)).toBeVisible();
  await expect(last4Field(page)).toBeDisabled();
  await expect(confirmButton(page)).toBeDisabled();
  await expect(confirmButton(page)).toBeFocused();

  await page.clock.fastForward("03:01");
  await expect(last4Field(page)).toBeEnabled();
  await expect(lockLine).toHaveCount(0);
  await expect(page.getByText(BLOCKED_FIRST, { exact: true })).toHaveCSS("color", MUTED);
  await expect(last4Field(page)).toBeFocused();

  // 서버는 아직 잠겨 있다 — 다시 누르면 서버가 잠김을 다시 준다(클라이언트 타이머는 화면만 되살린다).
  await wrongByClick(page);
  await expect(lockLine).toBeVisible();
  const elsewhere = page.getByRole("button", { name: "다른 이름 고르기" });
  await elsewhere.focus();
  await page.clock.fastForward("03:01");
  await expect(last4Field(page)).toBeEnabled();
  await expect(elsewhere).toBeFocused();
});

test("마지막 틀림을 칸 Enter로 보내 잠그면 포커스가 body — 풀리면 칸", async ({ page }) => {
  const ev = await oneWinnerEvent("E2E잠김body");
  await page.goto(ev.link);
  await expect(page.getByRole("button", { name: "김*늘" })).toBeVisible();
  await page.clock.install();
  await page.getByRole("button", { name: "김*늘" }).click();
  for (let i = 0; i < 5; i++) {
    await last4Field(page).fill("0000");
    await last4Field(page).press("Enter");
    if (i < 4) await expect(page.getByText(`남은 횟수 ${4 - i}번`, { exact: false })).toBeVisible();
  }
  await expect(last4Field(page)).toBeDisabled();
  // 막힌 칸의 포커스를 body로 옮기는 것은 브라우저의 focus fixup이다 — HTML 명세상
  // 렌더링 갱신 때 일어나 disabled 속성보다 늦을 수 있다(9ff519f CI 실패). 한 번 읽지
  // 않고 그 상태가 될 때까지 본다. 다른 요소로 가면 여전히 실패한다.
  await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true);
  await page.clock.fastForward("03:01");
  await expect(last4Field(page)).toBeEnabled();
  await expect(last4Field(page)).toBeFocused();
});

test("확인 요청이 끊기면 결과 불명 줄 · 4자리 유지 · 다시 누르면 정상 결과", async ({ page }) => {
  const ev = await oneWinnerEvent("E2E끊김");
  await page.goto(ev.link);
  await page.getByRole("button", { name: "김*늘" }).click();
  let aborted = false;
  await page.route(ev.link, async (route) => {
    if (!aborted && route.request().method() === "POST" && (route.request().postData() ?? "").includes('"last4"')) {
      aborted = true;
      await route.abort();
      return;
    }
    await route.continue();
  });
  await wrongByClick(page);
  await expect(page.getByText("확인 결과를 받지 못했습니다 · 다시 눌러 주세요", { exact: true })).toBeVisible();
  await expect(last4Field(page)).toHaveValue("0000");
  await expect(confirmButton(page)).toBeEnabled();
  await confirmButton(page).click();
  await expect(page.getByText("전화번호 뒤 4자리가 맞지 않습니다 · 다시 적어 주세요 · 남은 횟수 4번")).toBeVisible();
});

test("행사 한도를 넘긴 상태에서 확인 → 잠시 멈춤 줄 · 4자리 남음 · 1차 켜짐", async ({ page }) => {
  const ev = await oneWinnerEvent("E2E멈춤");
  const id = await winnerIdOf(ev.eventId, "김하늘");
  const map: Record<string, VerifyIdemEntry> = {};
  const at = new Date().toISOString();
  // 결정 A — 행사 한도는 이 창에 틀린 적 있는 IP만 막는다. 39건을 채우고 이 브라우저가
  // 한 번 틀려 40번째가 된 뒤 다시 확인하면 막힌다.
  for (let i = 0; i < 39; i++) map[`fill-${i}`] = { o: "wrong", r: { kind: "wrong", remaining: 4 }, ip: "x", at };
  await db.update(certWinners).set({ verifyIdemOutcome: map }).where(eq(certWinners.id, id));
  await page.goto(ev.link);
  await page.getByRole("button", { name: "김*늘" }).click();
  await wrongByClick(page, "0000");
  await expect(page.getByText("남은 횟수 4번", { exact: false })).toBeVisible();
  await wrongByClick(page, "7730");
  await expect(page.getByText("확인이 잠시 멈췄습니다 · 잠시 뒤 다시 눌러 주세요", { exact: true })).toBeVisible();
  await expect(last4Field(page)).toHaveValue("7730");
  await expect(confirmButton(page)).toBeEnabled();
});

test("목록이 열린 뒤 담당자가 닫으면 행 누름 → E6-b", async ({ page }) => {
  const ev = await oneWinnerEvent("E2E닫힘");
  await page.goto(ev.link);
  await db
    .update(certEvents)
    .set({ closedAt: new Date(), closedReason: "manual" })
    .where(eq(certEvents.id, ev.eventId));
  await page.getByRole("button", { name: "김*늘" }).click();
  await expect(page.getByText("이 링크는 닫혔습니다")).toBeVisible();
  await expect(page.getByText(/^담당자가 접수를 마쳤습니다 · 확인이 필요하면 담당자/)).toBeVisible();
});

test("E3에서 브라우저 뒤로 → E2, 포커스는 방금 고른 행", async ({ page }) => {
  const ev = await createCertEvent({
    name: "E2E뒤로",
    winners: [
      { name: "김하늘", phone: "010-4821-7730" },
      { name: "이도윤", phone: "010-2231-0045" },
    ],
  });
  await page.goto(ev.link);
  await page.getByRole("button", { name: "이*윤" }).click();
  await expect(last4Field(page)).toBeVisible();
  await page.goBack();
  await expect(page.getByText(/^이름을 골라 주세요/)).toBeVisible();
  await expect(page.getByRole("button", { name: "이*윤" })).toBeFocused();
  await expect(page).toHaveTitle("이름 고르기 · 기타소득 지급 확인");
});

test("E3에서 새로 고침 → E2(고아 항목), 앞으로 가기를 해도 E2", async ({ page }) => {
  const ev = await oneWinnerEvent("E2E고아");
  await page.goto(ev.link);
  await page.getByRole("button", { name: "김*늘" }).click();
  await expect(last4Field(page)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/^이름을 골라 주세요/)).toBeVisible();
  // 새로 고친 문서의 고아 E3 항목에서 history.back()이 앞 문서(E2 항목)로 돌아간다 —
  // 그 이동 중에는 실행 문맥이 바뀌므로 읽기를 다시 시도한다.
  await expect
    .poll(() =>
      page.evaluate(() => (history.state as { step?: string } | null)?.step ?? null).catch(() => "verify"),
    )
    .not.toBe("verify");
  await page.waitForLoadState();
  await page.goForward().catch(() => undefined);
  await expect(page.getByText(/^이름을 골라 주세요/)).toBeVisible();
  await expect(last4Field(page)).toHaveCount(0);
});

test("C1 — 기능이 꺼지면 확인 액션을 직접 POST해도 세지 않는다, 켜진 뒤 같은 요청은 판정된다", async ({ page }) => {
  const ev = await oneWinnerEvent("E2E직접POST");
  const id = await winnerIdOf(ev.eventId, "김하늘");
  await page.goto(ev.link);
  await page.getByRole("button", { name: "김*늘" }).click();
  await last4Field(page).fill("0000");
  const requestPromise = page.waitForRequest(
    (req) => req.url() === ev.link && req.method() === "POST" && (req.postData() ?? "").includes('"last4"'),
  );
  await confirmButton(page).click();
  const request = await requestPromise;
  await expect(page.getByText(/남은 횟수 4번/)).toBeVisible();
  const headers = request.headers();
  const body = request.postData() ?? "";
  const before = await seatOf(id);
  expect(before.failedAttempts).toBe(1);
  const entriesBefore = Object.keys(before.verifyIdemOutcome ?? {}).length;

  const freshKey = () => `k${Math.random().toString(36).slice(2)}${Date.now().toString(36)}xxxxxxxxxxxx`.slice(0, 30);
  const mutated = body.replace(/"idemKey":"[^"]+"/, `"idemKey":"${freshKey()}"`);
  expect(mutated).not.toBe(body);

  await withCertFeatureOff(async () => {
    const resp = await page.request.post(ev.link, { headers, data: mutated });
    expect(await resp.text()).not.toContain("remaining");
    const during = await seatOf(id);
    expect(during.failedAttempts).toBe(1);
    expect(Object.keys(during.verifyIdemOutcome ?? {})).toHaveLength(entriesBefore);
  });

  const on = await page.request.post(ev.link, { headers, data: mutated });
  expect(await on.text()).toContain("remaining");
  expect((await seatOf(id)).failedAttempts).toBe(2);
});

// ── Task 2b — 누적 잠김 묶음 · 잠금 다시 확인 ──────────────────────────────

const HARD_LINE_1 = "틀린 번호가 너무 여러 번 들어와 확인이 잠겼습니다";
const HARD_LINE_2 = /^담당자 .*PLANT8 경영관리 02-123-4567에 전화해 주세요$/;
const RECHECK_FAIL = "확인 결과를 받지 못했습니다 · 다시 눌러 주세요";

function lockGroup(page: Page) {
  return page.locator('div[tabindex="-1"]').filter({ hasText: HARD_LINE_1 });
}

function recheckButton(page: Page) {
  return page.getByRole("button", { name: /^잠금 확인/ });
}

async function activeIsLockGroup(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.activeElement;
    return el instanceof HTMLElement && el.tagName === "DIV" && el.getAttribute("tabindex") === "-1";
  });
}

async function setVisibility(page: Page, state: "hidden" | "visible") {
  await page.evaluate((next) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => next });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

async function hardLockSeat(id: string) {
  await db
    .update(certWinners)
    .set({ cumulativeFailedAttempts: 20, hardLockedAt: new Date() })
    .where(eq(certWinners.id, id));
}

async function primaryDescribedBy(page: Page): Promise<string[]> {
  const value = (await confirmButton(page).getAttribute("aria-describedby")) ?? "";
  return value.split(/\s+/).filter(Boolean);
}

test("누적 잠김 — 20번째 틀림 → 묶음(aria-live 없음) · 포커스 묶음 · 1차 설명 = 두 줄 · 10분 뒤에도 잠김 · 다시 골라도 누적 잠김", async ({
  page,
}) => {
  const ev = await oneWinnerEvent("E2E누적");
  const id = await winnerIdOf(ev.eventId, "김하늘");
  await db.update(certWinners).set({ cumulativeFailedAttempts: 19 }).where(eq(certWinners.id, id));
  await page.goto(ev.link);
  await expect(page.getByRole("button", { name: "김*늘" })).toBeVisible();
  await page.clock.install();
  await page.getByRole("button", { name: "김*늘" }).click();
  await wrongByClick(page);

  const group = lockGroup(page);
  await expect(group).toHaveCount(1);
  await expect(group).not.toHaveAttribute("aria-live");
  await expect(group.getByText(HARD_LINE_1, { exact: true })).toBeVisible();
  await expect(group.getByText(HARD_LINE_2)).toBeVisible();
  await expect(group.getByRole("link")).toHaveAttribute("href", /^tel:/);
  await expect(group.getByRole("button", { name: /^잠금 확인/ })).toBeVisible();
  await expect.poll(() => activeIsLockGroup(page)).toBe(true);
  await expect(last4Field(page)).toHaveValue("");
  await expect(last4Field(page)).toBeDisabled();
  await expect(confirmButton(page)).toBeDisabled();
  await expect(group.getByText(RECHECK_FAIL)).toHaveCount(0);

  const ids = await primaryDescribedBy(page);
  expect(ids).toHaveLength(2);
  const groupId = await group.getAttribute("id");
  for (const pid of ids) {
    expect(pid).not.toBe(groupId);
    await expect(page.locator(`[id="${pid}"]`)).toHaveJSProperty("tagName", "P");
  }
  expect(await page.locator(`[id="${ids[0]}"]`).textContent()).toBe(HARD_LINE_1);

  const submitText = (await page.locator("form").innerText()) ?? "";
  expect(submitText).not.toMatch(/\d{2}:\d{2}/);
  expect(submitText).not.toContain("남은 횟수");
  expect(submitText).not.toContain("20");
  await expect(page.getByRole("button", { name: "다른 이름 고르기" })).toBeEnabled();

  await page.clock.fastForward("10:00");
  await expect(last4Field(page)).toBeDisabled();
  await expect.poll(() => activeIsLockGroup(page)).toBe(true);

  await page.getByRole("button", { name: "다른 이름 고르기" }).click();
  await expect(page.getByText(/^이름을 골라 주세요/)).toBeVisible();
  await page.getByRole("button", { name: "김*늘" }).click();
  await expect(lockGroup(page)).toHaveCount(1);
  await expect.poll(() => activeIsLockGroup(page)).toBe(true);
});

test("잠금 다시 확인 — 아직 잠김: 보임 이벤트는 조용하고, 「잠금 확인」 누름은 실패 줄 없이 포커스 묶음", async ({ page }) => {
  const ev = await oneWinnerEvent("E2E재확인잠김");
  const id = await winnerIdOf(ev.eventId, "김하늘");
  await hardLockSeat(id);
  await page.goto(ev.link);
  await page.getByRole("button", { name: "김*늘" }).click();
  await expect.poll(() => activeIsLockGroup(page)).toBe(true);
  const before = await seatOf(id);

  await setVisibility(page, "hidden");
  // 보임 이벤트의 다시 확인이 끝난 뒤 누른다 — 진행 중인 다시 확인이 있으면 다음 방아쇠는 무시된다(한 번에 하나).
  const silentRecheck = page.waitForResponse((r) => r.url() === ev.link && r.request().method() === "POST");
  await setVisibility(page, "visible");
  await silentRecheck;
  await expect(lockGroup(page).getByText(HARD_LINE_1, { exact: true })).toBeVisible();
  await expect.poll(() => activeIsLockGroup(page)).toBe(true);
  expect(await seatOf(id)).toEqual(before);

  await lockGroup(page).getByRole("link").focus();
  await recheckButton(page).click();
  await expect(lockGroup(page).getByText(HARD_LINE_1, { exact: true })).toBeVisible();
  await expect.poll(() => activeIsLockGroup(page)).toBe(true);
  await expect(page.getByText(RECHECK_FAIL)).toHaveCount(0);
  expect(await seatOf(id)).toEqual(before);
});

test("잠금 다시 확인 — 담당자가 풀고 남이 제출했어도 입력만 살아나고 E6-a는 없다 · 확인 요청 0 · 셈 불변", async ({ page }) => {
  const ev = await oneWinnerEvent("E2E재확인풀림");
  const id = await winnerIdOf(ev.eventId, "김하늘");
  await hardLockSeat(id);
  await page.goto(ev.link);
  await page.getByRole("button", { name: "김*늘" }).click();
  await expect(lockGroup(page)).toHaveCount(1);

  const verifyRequests: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && (req.postData() ?? "").includes('"last4"')) verifyRequests.push(req.url());
  });

  await setVisibility(page, "hidden");
  await db
    .update(certWinners)
    .set({ failedAttempts: 0, lockedUntil: null, cumulativeFailedAttempts: 0, hardLockedAt: null, submittedAt: new Date() })
    .where(eq(certWinners.id, id));
  await setVisibility(page, "visible");

  await expect(lockGroup(page)).toHaveCount(0);
  await expect(last4Field(page)).toBeEnabled();
  await expect(last4Field(page)).toBeFocused();
  await expect(page.getByText(BLOCKED_FIRST, { exact: true })).toBeVisible();
  await expect(page.getByText(/이미 제출/)).toHaveCount(0);
  expect(verifyRequests).toHaveLength(0);
  const after = await seatOf(id);
  expect(after.failedAttempts).toBe(0);
  expect(after.cumulativeFailedAttempts).toBe(0);

  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false })));
  const again = await seatOf(id);
  expect(again.failedAttempts).toBe(0);
  expect(again.cumulativeFailedAttempts).toBe(0);
  expect(verifyRequests).toHaveLength(0);
});

test("누적 → 풀림 → 새 짧은 잠김: 같은 묶음 안에 짧은 잠김 줄 · 포커스 묶음 · 1차 설명 = 그 두 줄 · 풀리면 칸", async ({ page }) => {
  const ev = await oneWinnerEvent("E2E누적짧은");
  const id = await winnerIdOf(ev.eventId, "김하늘");
  await hardLockSeat(id);
  await page.goto(ev.link);
  await expect(page.getByRole("button", { name: "김*늘" })).toBeVisible();
  await page.clock.install();
  await page.getByRole("button", { name: "김*늘" }).click();
  await expect(lockGroup(page)).toHaveCount(1);

  await db
    .update(certWinners)
    .set({
      cumulativeFailedAttempts: 0,
      hardLockedAt: null,
      failedAttempts: 5,
      lockedUntil: new Date(Date.now() + 3 * 60 * 1000),
    })
    .where(eq(certWinners.id, id));
  await recheckButton(page).click();

  const shortLine = page.getByText(/^틀린 번호가 5번 들어와 확인이 잠겼습니다 · \d{2}:\d{2}부터 다시 해 주세요$/);
  await expect(shortLine).toBeVisible();
  const group = page.locator('div[tabindex="-1"]').filter({ has: shortLine });
  await expect(group).toHaveCount(1);
  await expect(last4Field(page)).toBeDisabled();
  await expect(confirmButton(page)).toBeDisabled();
  await expect.poll(() => activeIsLockGroup(page)).toBe(true);
  const ids = await primaryDescribedBy(page);
  expect(ids).toHaveLength(2);
  expect(await page.locator(`[id="${ids[0]}"]`).textContent()).toMatch(/^틀린 번호가 5번 들어와/);
  // 1차 아래 disabledReason 요소가 없다 — 같은 글이 두 번 서지 않는다.
  await expect(shortLine).toHaveCount(1);

  await page.clock.fastForward("03:01");
  await expect(last4Field(page)).toBeEnabled();
  await expect(last4Field(page)).toBeFocused();
});

test("「잠금 확인」 실패 → 묶음 안 실패 줄 · 포커스 묶음 · 연결, 다시 누르면 응답 전에 지워진다 · 보임 이벤트 실패는 조용하다", async ({
  page,
}) => {
  const ev = await oneWinnerEvent("E2E재확인실패");
  const id = await winnerIdOf(ev.eventId, "김하늘");
  await hardLockSeat(id);
  await page.goto(ev.link);
  await page.getByRole("button", { name: "김*늘" }).click();
  await expect(lockGroup(page)).toHaveCount(1);

  let mode: "abort" | "hold" | "pass" = "abort";
  let release: () => void = () => undefined;
  await page.route(ev.link, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    if (mode === "abort") {
      mode = "pass";
      return route.abort();
    }
    if (mode === "hold") {
      mode = "pass";
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
    return route.continue();
  });

  await recheckButton(page).click();
  const failLine = page.getByText(RECHECK_FAIL, { exact: true });
  await expect(failLine).toBeVisible();
  await expect(lockGroup(page).getByText(RECHECK_FAIL)).toHaveCount(1);
  await expect.poll(() => activeIsLockGroup(page)).toBe(true);
  const failId = await failLine.getAttribute("id");
  expect(failId).toBeTruthy();
  await expect(recheckButton(page)).toHaveAttribute("aria-describedby", failId ?? "");
  expect(await primaryDescribedBy(page)).not.toContain(failId);
  expect(await primaryDescribedBy(page)).toHaveLength(2);
  await expect(recheckButton(page)).toBeEnabled();

  mode = "hold";
  await recheckButton(page).click();
  await expect(failLine).toHaveCount(0);
  expect((await recheckButton(page).getAttribute("aria-describedby")) ?? "").not.toContain(failId ?? "∅");
  release();
  await expect(recheckButton(page)).toBeEnabled();
  await expect(failLine).toHaveCount(0);
  await expect.poll(() => activeIsLockGroup(page)).toBe(true);

  mode = "abort";
  await recheckButton(page).focus();
  await setVisibility(page, "hidden");
  await setVisibility(page, "visible");
  await expect.poll(() => mode).toBe("pass");
  await expect(failLine).toHaveCount(0);
  await expect(recheckButton(page)).toBeFocused();
});

test("누적 잠긴 채 담당자가 닫으면 「잠금 확인」 → E6-b, 보임 이벤트로도 E6-b · E6-a 없음", async ({ page }) => {
  const ev = await oneWinnerEvent("E2E누적닫힘");
  const id = await winnerIdOf(ev.eventId, "김하늘");
  await hardLockSeat(id);
  await page.goto(ev.link);
  await page.getByRole("button", { name: "김*늘" }).click();
  await expect(lockGroup(page)).toHaveCount(1);
  await db.update(certEvents).set({ closedAt: new Date(), closedReason: "manual" }).where(eq(certEvents.id, ev.eventId));
  await recheckButton(page).click();
  await expect(page.getByText("이 링크는 닫혔습니다")).toBeVisible();
  await expect(page.getByText(/^담당자가 접수를 마쳤습니다/)).toBeVisible();
  await expect(page.getByText("이 링크는 닫혔습니다")).toBeFocused();
  await expect(page.getByText(/이미 제출/)).toHaveCount(0);

  const ev2 = await oneWinnerEvent("E2E누적닫힘보임");
  const id2 = await winnerIdOf(ev2.eventId, "김하늘");
  await hardLockSeat(id2);
  await page.goto(ev2.link);
  await page.getByRole("button", { name: "김*늘" }).click();
  await expect(lockGroup(page)).toHaveCount(1);
  await db.update(certEvents).set({ closedAt: new Date(), closedReason: "manual" }).where(eq(certEvents.id, ev2.eventId));
  await setVisibility(page, "hidden");
  await setVisibility(page, "visible");
  await expect(page.getByText("이 링크는 닫혔습니다")).toBeVisible();
  await expect(page.getByText(/이미 제출/)).toHaveCount(0);
});
