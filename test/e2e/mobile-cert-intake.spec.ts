import { test, expect, type Page, type Request } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { certEvents, certSubmissions } from "@/db/schema";
import { closeCertEventForTest, createCertEvent, withCertFeatureOff } from "./helpers/cert";
import { drawSignature, fillIntakeForm, submitButton } from "./helpers/cert-form";

test.use({ viewport: { width: 375, height: 800 } });
test.describe.configure({ mode: "serial" });

// 04.3-15 Task 1 tracer — 수령자 QR 진입 → E′2 경품 고르기(서버 왕복 없음) → E′4 입력 · 서명 → E5
// (명단 · 이름 고르기 · 전화번호 확인 없음 — 5909578685). 규약 C1 직접 POST · 404 · 제목 · 외부 크기 회귀 포함.

const INQUIRY = /^받은 경품이 목록에 없으면 제출하지 않아도 됩니다 · 확인이 필요하면 담당자 .* · PLANT8 경영관리 02-123-4567에 전화해 주세요$/;

function prizeRow(page: Page, name: string) {
  return page.getByRole("listitem").getByRole("button", { name: new RegExp(`^${name}`) });
}

async function css(page: Page, selector: string, prop: string): Promise<string> {
  return page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
}

test("QR 진입 → E′2 → 택배 경품(서버 요청 없음) → E′4 → 입력 · 서명 → 제출되었습니다", async ({ page }) => {
  const { eventName, link } = await createCertEvent({
    name: "모바일E2E행사",
    wonOn: "2026-01-05",
    prizes: [
      { name: "갤럭시 탭 S10", unitValueKrw: 1_290_000, delivery: "onsite" },
      { name: "다이슨 에어랩", unitValueKrw: 599_000, delivery: "parcel" },
    ],
  });
  if (!link) throw new Error("링크 없음");

  const response = await page.goto(link);
  expect(response?.status()).toBe(200);
  // T10 — next.config.ts가 /c/:path*에 붙이는 헤더 셋(T-04.3-11).
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  expect(response?.headers()["cache-control"]).toBe("no-store");

  await expect(page).toHaveTitle("경품 고르기 · 기타소득 지급 확인");
  await expect(page.getByRole("heading", { name: "기타소득 지급 확인" })).toBeVisible();
  await expect(page.getByText(`${eventName} · 2026-01-05 당첨`)).toBeVisible();
  await expect(page.getByText("받은 경품을 골라 주세요", { exact: true })).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(2);
  // 택배 경품 행에만 2행 「택배」.
  await expect(prizeRow(page, "갤럭시 탭 S10")).toHaveText("갤럭시 탭 S10");
  await expect(prizeRow(page, "다이슨 에어랩")).toHaveText("다이슨 에어랩택배");
  await expect(page.getByText(INQUIRY)).toBeVisible();
  await expect(page.locator('a[href="tel:021234567"]').first()).toBeVisible();

  // 행 누름은 서버를 부르지 않는다.
  const posts: Request[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST") posts.push(req);
  });
  await prizeRow(page, "다이슨 에어랩").click();
  await expect(page.getByText("다이슨 에어랩 1개", { exact: true })).toBeVisible();
  expect(posts).toHaveLength(0);
  await expect(page).toHaveTitle("확인증 입력 · 기타소득 지급 확인");
  await expect(page.locator("#cert-prize")).toBeFocused();
  await expect(page.getByRole("button", { name: "다른 경품 고르기" })).toHaveClass(/tertiary/);
  await expect(page.getByText(INQUIRY)).toBeVisible();
  await expect(page.locator("#address")).toBeVisible();
  await expect(page.getByRole("group", { name: /^주민등록번호/ }).getByText("세무 신고용")).toBeVisible();

  await fillIntakeForm(page, { phone: "010-4821-7730", address: "서울시 마포구 월드컵로 1" });
  await drawSignature(page);
  await expect(submitButton(page)).toHaveClass(/primary/);
  await submitButton(page).click();

  await expect(page.getByText("제출되었습니다", { exact: true })).toBeVisible();
  await expect(page.getByText(/다이슨 에어랩 1개 적은 주소로 보내 드립니다/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "기타소득 지급 확인" })).toBeVisible();
  await expect(page.locator('a[href="tel:021234567"]').first()).toBeVisible();

  // 새로 고침 → E′2부터(사람 단위 잠금 없음).
  await page.reload();
  await expect(page.getByText("받은 경품을 골라 주세요", { exact: true })).toBeVisible();
});

test("경품이 하나여도 E′2(행 하나 · 문의 줄) → 행 → E′4에 「다른 경품 고르기」(UD-5 a)", async ({ page }) => {
  const { link } = await createCertEvent({ name: "모바일E2E한경품" });
  if (!link) throw new Error("링크 없음");
  await page.goto(link);
  await expect(page).toHaveTitle("경품 고르기 · 기타소득 지급 확인");
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByText(INQUIRY)).toBeVisible();
  await prizeRow(page, "갤럭시 탭 S10").click();
  await expect(page.getByText("갤럭시 탭 S10 1개", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "다른 경품 고르기" })).toBeVisible();
  await expect(page.locator("#address")).toHaveCount(0);

  // 외부 1차 · 이유 줄 크기(옛 확인 단계 회귀에서 옮김 — §6-5 ①-k): 높이 48 · 글자 15px · 이유 줄 15px.
  expect(await css(page, "button[type=submit]", "height")).toBe("48px");
  expect(await css(page, "button[type=submit]", "font-size")).toBe("15px");
  await expect(page.getByText(/채우면 제출할 수 있습니다$/)).toHaveCSS("font-size", "15px");
});

test("규약 C1 직접 POST — 기능이 꺼진 동안 진짜 제출 요청을 다시 보내도 아무것도 쓰지 않는다", async ({ page }) => {
  const { link, eventId } = await createCertEvent({ name: "모바일E2E직접POST" });
  if (!link) throw new Error("링크 없음");
  await page.goto(link);
  await prizeRow(page, "갤럭시 탭 S10").click();
  await fillIntakeForm(page, { phone: "010-5561-2210" });
  await drawSignature(page);

  let submitRequest: Request | undefined;
  await page.route(link, async (route, request) => {
    if (request.method() === "POST") {
      submitRequest = request;
      await route.abort();
    } else {
      await route.continue();
    }
  });
  await submitButton(page).click();
  await expect.poll(() => submitRequest !== undefined, { timeout: 5000 }).toBe(true);
  await page.unroute(link);
  if (!submitRequest) throw new Error("제출 요청을 가로채지 못했다");
  const headers = submitRequest.headers();
  const body = submitRequest.postDataBuffer();

  await withCertFeatureOff(async () => {
    const off = await page.request.post(link, { headers, data: body ?? undefined });
    expect(await off.text()).not.toContain('"saved"');
    expect(await db.select().from(certSubmissions).where(eq(certSubmissions.eventId, eventId))).toHaveLength(0);
  });

  // 범위를 나와 같은 요청을 다시 보내면 정상 저장이다(요청 모양이 맞았음을 증명).
  const on = await page.request.post(link, { headers, data: body ?? undefined });
  expect(on.ok()).toBe(true);
  expect(await on.text()).toContain('"saved"');
  expect(await db.select().from(certSubmissions).where(eq(certSubmissions.eventId, eventId))).toHaveLength(1);
});

test("prizeId가 uuid 형식이 아니면 스키마가 거부한다(22P02 대신)", async ({ page }) => {
  const { link, prizeIds } = await createCertEvent({ name: "모바일E2E S7" });
  const prizeId = prizeIds[0];
  if (!link || !prizeId) throw new Error("링크 없음");
  await page.goto(link);
  await prizeRow(page, "갤럭시 탭 S10").click();
  await fillIntakeForm(page, { phone: "010-3321-8890" });
  await drawSignature(page);
  const requestPromise = page.waitForRequest((req) => req.url() === link && req.method() === "POST");
  await page.route(link, (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
  await submitButton(page).click();
  const request = await requestPromise;
  await page.unroute(link);

  const bodyText = request.postDataBuffer()?.toString("utf8") ?? "";
  expect(bodyText).toContain(prizeId);
  const mutated = bodyText.replaceAll(prizeId, `${prizeId.slice(0, -1)}z`);
  const resp = await page.request.post(link, { headers: request.headers(), data: mutated });
  expect(resp.ok()).toBe(true);
  const text = await resp.text();
  expect(text).toContain('"validationErrors"');
  expect(text).toContain('"prizeId"');
  expect(text).not.toContain("처리 중 오류 · 잠시 후 다시 시도");
});

test("기능을 끄면 링크를 찾을 수 없습니다 · 404", async ({ page }) => {
  const { link } = await createCertEvent({ name: "모바일E2E플래그꺼짐" });
  if (!link) throw new Error("링크 없음");
  await withCertFeatureOff(async () => {
    const response = await page.goto(link);
    expect(response?.status()).toBe(404);
    await expect(page.getByText("링크를 찾을 수 없습니다")).toBeVisible();
  });
});

test("없는 토큰 · 신청됨 행사(토큰 없음)는 링크를 찾을 수 없습니다 · 404 · 탭 제목 「링크 없음」", async ({ page }) => {
  const requested = await createCertEvent({ name: "모바일E2E신청됨", status: "requested" });
  expect(requested.link).toBeUndefined();
  const response = await page.goto("/c/this-token-does-not-exist-anywhere-00000000");
  expect(response?.status()).toBe(404);
  await expect(page.getByText("링크를 찾을 수 없습니다")).toBeVisible();
  await expect(page).toHaveTitle("링크 없음 · 기타소득 지급 확인");
});

test("닫힌 링크 첫 진입 — 이 링크는 닫혔습니다 · 제목 「링크 닫힘」", async ({ page }) => {
  const { link, eventId } = await createCertEvent({ name: "모바일E2E닫힘" });
  if (!link) throw new Error("링크 없음");
  await db.update(certEvents).set({ closedAt: new Date(), closedReason: "manual" }).where(eq(certEvents.id, eventId));
  await page.goto(link);
  await expect(page.getByText("이 링크는 닫혔습니다")).toBeVisible();
  await expect(page.getByText(/담당자가 접수를 마쳤습니다/)).toBeVisible();
  await expect(page).toHaveTitle("링크 닫힘 · 기타소득 지급 확인");
});

// DOM 감사 M1 — 문의 전화 tel: 링크는 3차(§6-5 E′2)라 §3 터치 목표 44×44. 문장 속 링크라 히트 영역만 키우고
// 줄 상자는 그대로여야 한다(375에서 링크를 보통 인라인으로 되돌린 높이와 같음), 상자 위 · 아래 끝도 링크가 받는다.
async function expectTelLinkTouch(page: Page, scope: string, state: string) {
  const link = page.locator(`${scope} a[href^="tel:"]`);
  await expect(link).toHaveCount(1);
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const detail = `${state} @${width}`;
    const box = await link.boundingBox();
    expect(box, detail).not.toBeNull();
    expect.soft(box!.width, detail).toBeGreaterThanOrEqual(44);
    expect.soft(box!.height, detail).toBeGreaterThanOrEqual(44);
    if (width === 320) {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect.soft(overflow, `${detail} 가로 넘침`).toBeLessThanOrEqual(0);
      continue;
    }
    const lineBox = await link.evaluate((el) => {
      const p = el.closest("p");
      if (!p) return null;
      const asIs = p.getBoundingClientRect().height;
      el.setAttribute("style", "display: inline; min-height: 0; margin-block: 0");
      const plain = p.getBoundingClientRect().height;
      el.removeAttribute("style");
      return { asIs, plain };
    });
    expect(lineBox, detail).not.toBeNull();
    expect.soft(Math.abs(lineBox!.asIs - lineBox!.plain), `${detail} ${JSON.stringify(lineBox)}`).toBeLessThanOrEqual(0.5);
    const edges = await link.evaluate((el) => {
      el.scrollIntoView({ block: "center" });
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const hits = (y: number) => {
        const hit = document.elementFromPoint(x, y);
        return hit !== null && (hit === el || el.contains(hit));
      };
      return { top: hits(rect.top + 2), bottom: hits(rect.bottom - 2) };
    });
    expect.soft(edges, detail).toEqual({ top: true, bottom: true });
  }
  await page.setViewportSize({ width: 375, height: 800 });
}

test("DOM 감사 M1 — 문의 전화 tel: 링크는 E′2 · E′4 · E5 · E6-b(담당자 · 기한) 모두 375 · 320에서 44×44, 줄 상자 그대로(§3 터치 목표)", async ({
  page,
}) => {
  const { link, eventId } = await createCertEvent({ name: "모바일E2E문의44" });
  if (!link) throw new Error("링크 없음");

  await page.goto(link);
  await expectTelLinkTouch(page, "p[class*=inquiryLine]", "E′2");

  await prizeRow(page, "갤럭시 탭 S10").click();
  await expectTelLinkTouch(page, "p[class*=prizeInquiry]", "E′4");

  await fillIntakeForm(page, { phone: "010-4821-7730" });
  await drawSignature(page);
  await submitButton(page).click();
  await expect(page.getByText("제출되었습니다", { exact: true })).toBeVisible();
  await expectTelLinkTouch(page, "section[class*=resultBlock]", "E5");

  await closeCertEventForTest(eventId);
  await page.goto(link);
  await expect(page.getByText(/담당자가 접수를 마쳤습니다/)).toBeVisible();
  await expectTelLinkTouch(page, "section[class*=resultBlock]", "E6-b 담당자");

  await db
    .update(certEvents)
    .set({ closedAt: null, closedReason: null, expiresAt: new Date(Date.now() - 60 * 60 * 1000) })
    .where(eq(certEvents.id, eventId));
  await page.goto(link);
  await expect(page.getByText(/이 지났습니다/)).toBeVisible();
  await expectTelLinkTouch(page, "section[class*=resultBlock]", "E6-b 기한");
});
