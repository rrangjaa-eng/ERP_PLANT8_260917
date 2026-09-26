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
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
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
  for (let i = 0; i < 40; i++) map[`fill-${i}`] = { o: "wrong", r: { kind: "wrong", remaining: 4 }, ip: "x", at };
  await db.update(certWinners).set({ verifyIdemOutcome: map }).where(eq(certWinners.id, id));
  await page.goto(ev.link);
  await page.getByRole("button", { name: "김*늘" }).click();
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
