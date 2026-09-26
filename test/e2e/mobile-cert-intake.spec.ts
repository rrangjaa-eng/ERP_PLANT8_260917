import { test, expect, type Page, type Request } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { certWinners } from "@/db/schema";
import { createCertEvent, withCertFeatureOff } from "./helpers/cert";

test.use({ viewport: { width: 375, height: 800 } });
test.describe.configure({ mode: "serial" });

// 04.3-02 Task 2 ⓪(c) — 수령자 QR 진입 → 이름 고르기 → 뒤 4자리 확인 →
// 입력·서명 제출 → 자리 닫힘 흐름(규약 C1 직접 POST 포함).

async function signAt(page: Page) {
  const canvas = page.getByRole("application", { name: "서명" });
  const box = await canvas.boundingBox();
  if (!box) throw new Error("서명 캔버스를 찾지 못했다");
  const startX = box.x + box.width * 0.2;
  const startY = box.y + box.height * 0.5;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + box.width * 0.2, startY - box.height * 0.2, { steps: 5 });
  await page.mouse.move(startX + box.width * 0.4, startY + box.height * 0.2, { steps: 5 });
  await page.mouse.move(startX + box.width * 0.6, startY, { steps: 5 });
  await page.mouse.up();
}

test("QR 진입 → 이름 고르기 → 전화번호 확인 → 입력·서명 제출 → 자리 닫힘", async ({ page }) => {
  const { eventName, link } = await createCertEvent({
    name: "모바일E2E행사",
    wonOn: "2026-01-05",
    winners: [
      { name: "김하늘", phone: "010-4821-7730", prizeName: "갤럭시 탭 S10", quantity: 1, delivery: "onsite" },
      { name: "이도윤", phone: "010-2231-0045", prizeName: "무선 이어폰", quantity: 1, delivery: "parcel" },
    ],
  });

  const response = await page.goto(link);
  expect(response?.status()).toBe(200);

  await expect(page.getByRole("heading", { name: "기타소득 지급 확인" })).toBeVisible();
  await expect(page.getByText(`${eventName} · 2026-01-05 당첨`)).toBeVisible();
  await expect(page.getByText("이름을 골라 주세요 · 2명")).toBeVisible();
  await expect(page.getByText("김*늘")).toBeVisible();
  await expect(page.getByText("이*윤")).toBeVisible();

  await page.getByText("김*늘").click();
  await expect(page.getByLabel("전화번호 뒤 4자리")).toBeVisible();
  await page.getByLabel("전화번호 뒤 4자리").fill("7730");
  await page.getByRole("button", { name: "전화번호 확인" }).click();

  await expect(page.getByText("갤럭시 탭 S10 1개")).toBeVisible();
  await page.locator("#name").fill("김하늘");
  await page.locator("#rrn-front").fill("930412");
  await page.locator("#rrn-back").fill("2123458");
  await page.locator("#phone").fill("010-4821-7730");
  await page.getByRole("checkbox").check();
  await signAt(page);
  await page.getByRole("button", { name: "확인증 제출" }).click();

  await expect(page.getByText("제출되었습니다 · 다시 제출할 수 없습니다")).toBeVisible();

  // 새로 고침 → E2부터(메모리만) → 김*늘 → 7730 → 이미 제출하셨습니다
  await page.reload();
  await expect(page.getByText("이름을 골라 주세요 · 2명")).toBeVisible();
  await page.getByText("김*늘").click();
  await page.getByLabel("전화번호 뒤 4자리").fill("7730");
  await page.getByRole("button", { name: "전화번호 확인" }).click();
  await expect(page.getByText("이미 제출하셨습니다")).toBeVisible();
});

test("규약 C1 직접 POST — 기능이 꺼진 동안 진짜 요청을 다시 보내도 아무것도 읽거나 쓰지 않는다", async ({ page }) => {
  const { link, eventId } = await createCertEvent({
    name: "모바일E2E직접POST",
    winners: [{ name: "박서준", phone: "010-5561-2210", prizeName: "블루투스 스피커", quantity: 1, delivery: "onsite" }],
  });
  const [winnerBefore] = await db.select().from(certWinners).where(eq(certWinners.eventId, eventId));
  if (!winnerBefore) throw new Error("당첨자를 찾지 못했다");

  await page.goto(link);

  const selectRequestPromise = page.waitForRequest(
    (req) => req.url() === link && req.method() === "POST",
  );
  await page.getByText("박*준").click();
  const selectRequest: Request = await selectRequestPromise;

  await expect(page.getByLabel("전화번호 뒤 4자리")).toBeVisible();
  await page.getByLabel("전화번호 뒤 4자리").fill("2210");

  let verifyRequest: Request | undefined;
  await page.route(link, async (route, request) => {
    if (request.method() === "POST") {
      verifyRequest = request;
      await route.abort();
    } else {
      await route.continue();
    }
  });
  await page.getByRole("button", { name: "전화번호 확인" }).click();
  await expect.poll(() => verifyRequest !== undefined, { timeout: 5000 }).toBe(true);
  await page.unroute(link);
  if (!verifyRequest) throw new Error("verifyLast4 요청을 가로채지 못했다");

  const selectHeaders = selectRequest.headers();
  const selectBody = selectRequest.postDataBuffer();
  const verifyHeaders = verifyRequest.headers();
  const verifyBody = verifyRequest.postDataBuffer();

  await withCertFeatureOff(async () => {
    const offSelectResp = await page.request.post(link, { headers: selectHeaders, data: selectBody ?? undefined });
    const offSelectText = await offSelectResp.text();
    expect(offSelectText).not.toContain("박*준");

    const offVerifyResp = await page.request.post(link, { headers: verifyHeaders, data: verifyBody ?? undefined });
    const offVerifyText = await offVerifyResp.text();
    expect(offVerifyText).not.toMatch(/proof/);

    const [winnerDuringOff] = await db.select().from(certWinners).where(eq(certWinners.eventId, eventId));
    expect(winnerDuringOff?.verifyProofHash).toBeNull();
    expect(winnerDuringOff?.verifiedUntil).toBeNull();
  });

  // 범위를 나와 같은 두 요청을 다시 보내면 정상 응답이다(요청 모양이 맞았음을 증명).
  const onSelectResp = await page.request.post(link, { headers: selectHeaders, data: selectBody ?? undefined });
  expect(onSelectResp.ok()).toBe(true);
  const onVerifyResp = await page.request.post(link, { headers: verifyHeaders, data: verifyBody ?? undefined });
  expect(onVerifyResp.ok()).toBe(true);

  const [winnerAfterOn] = await db.select().from(certWinners).where(eq(certWinners.eventId, eventId));
  expect(winnerAfterOn?.verifyProofHash).not.toBeNull();
});

test("기능을 끄면 링크를 찾을 수 없습니다 · 404", async ({ page }) => {
  const { link } = await createCertEvent({
    name: "모바일E2E플래그꺼짐",
    winners: [{ name: "최유진", phone: "010-7712-3345" }],
  });

  await withCertFeatureOff(async () => {
    const response = await page.goto(link);
    expect(response?.status()).toBe(404);
    await expect(page.getByText("링크를 찾을 수 없습니다")).toBeVisible();
  });
});

test("존재하지 않는 토큰도 같은 링크를 찾을 수 없습니다 · 404", async ({ page }) => {
  const response = await page.goto("/c/this-token-does-not-exist-anywhere-00000000");
  expect(response?.status()).toBe(404);
  await expect(page.getByText("링크를 찾을 수 없습니다")).toBeVisible();
});
