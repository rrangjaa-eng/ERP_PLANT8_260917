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
  // 폰 375×800에서는 sticky 제출 줄이 뷰포트 바닥에 붙어 캔버스 아래쪽과
  // 겹칠 수 있다(문서 높이가 뷰포트보다 크다) — 맨 아래로 스크롤해 캔버스를
  // sticky 줄 위 정상 위치로 옮긴 뒤 그린다(실제 사용자도 이렇게 본다).
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
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
  // T10 — next.config.ts가 /c/:path*에 붙이는 헤더 셋(T-04.3-11).
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  expect(response?.headers()["cache-control"]).toBe("no-store");

  await expect(page.getByRole("heading", { name: "기타소득 지급 확인" })).toBeVisible();
  await expect(page.getByText(`${eventName} · 2026-01-05 당첨`)).toBeVisible();
  await expect(page.getByText("이름을 골라 주세요 · 2명")).toBeVisible();
  await expect(page.getByText("김*늘")).toBeVisible();
  await expect(page.getByText("이*윤")).toBeVisible();
  // U12 — E2 문의 줄의 번호는 tel: 링크다.
  await expect(page.locator('a[href="tel:021234567"]').first()).toBeVisible();

  await page.getByText("김*늘").click();
  await expect(page.getByLabel("전화번호 뒤 4자리")).toBeVisible();
  // U15 — E3의 정적 「이름」 이름표가 orphan <label>이 아니다(대응하는
  // 입력이 없다 — 실제로 이 이름표가 있는 단계에서 확인한다).
  await expect(page.locator("label", { hasText: /^이름$/ })).toHaveCount(0);
  // U14 — 이름 고르기를 지나도 제목(h1)이 그대로 있다.
  await expect(page.getByRole("heading", { name: "기타소득 지급 확인" })).toBeVisible();
  // U8 — 「다른 이름 고르기」는 ui/button Button(variant="tertiary")다.
  await expect(page.getByRole("button", { name: "다른 이름 고르기" })).toHaveClass(/tertiary/);
  await page.getByLabel("전화번호 뒤 4자리").fill("7730");
  // U1 — 「전화번호 확인」은 1차(primary) 버튼이다.
  await expect(page.getByRole("button", { name: "전화번호 확인" })).toHaveClass(/primary/);
  await page.getByRole("button", { name: "전화번호 확인" }).click();

  await expect(page.getByText("갤럭시 탭 S10 1개")).toBeVisible();
  await expect(page.getByRole("heading", { name: "기타소득 지급 확인" })).toBeVisible();
  // U12 — E4 경품 아래 문의 줄도 tel: 링크다.
  await expect(page.locator('a[href="tel:021234567"]').first()).toBeVisible();
  await page.locator("#name").fill("김하늘");
  await page.locator("#rrn-front").fill("930412");
  await page.locator("#rrn-back").fill("2123458");
  await page.locator("#phone").fill("010-4821-7730");
  await page.getByRole("checkbox").check();
  // U8 — 「전문 보기」도 Button(variant="tertiary")다.
  await expect(page.getByRole("button", { name: "전문 보기" })).toHaveClass(/tertiary/);
  await signAt(page);
  // U8 — 서명이 있으면 뜨는 「다시 쓰기」도 마찬가지다.
  await expect(page.getByRole("button", { name: "다시 쓰기" })).toHaveClass(/tertiary/);
  // U1 — 「확인증 제출」도 1차 버튼이다.
  await expect(page.getByRole("button", { name: "확인증 제출" })).toHaveClass(/primary/);
  await page.getByRole("button", { name: "확인증 제출" }).click();

  await expect(page.getByText("제출되었습니다 · 다시 제출할 수 없습니다")).toBeVisible();
  // U14 — 제출 뒤에도 제목이 그대로다.
  await expect(page.getByRole("heading", { name: "기타소득 지급 확인" })).toBeVisible();
  // U12 — E5 결과 블록의 연락 줄도 tel: 링크다.
  await expect(page.locator('a[href="tel:021234567"]').first()).toBeVisible();

  // 새로 고침 → E2부터(메모리만) → 김*늘 → 7730 → 이미 제출하셨습니다
  await page.reload();
  await expect(page.getByText("이름을 골라 주세요 · 2명")).toBeVisible();
  await page.getByText("김*늘").click();
  await page.getByLabel("전화번호 뒤 4자리").fill("7730");
  await page.getByRole("button", { name: "전화번호 확인" }).click();
  await expect(page.getByText("이미 제출하셨습니다")).toBeVisible();
  // U14 — E6-a에서도 제목이 그대로다.
  await expect(page.getByRole("heading", { name: "기타소득 지급 확인" })).toBeVisible();
});

test("U6 — 이름을 고르는 동안 목록 전체가 비활성이고 누른 행에 …가 뜬다", async ({ page }) => {
  const { link } = await createCertEvent({
    name: "모바일E2E U6",
    winners: [
      { name: "강하준", phone: "010-1234-5678", prizeName: "무선 마우스", quantity: 1, delivery: "onsite" },
      { name: "윤서아", phone: "010-8765-4321", prizeName: "무선 마우스", quantity: 1, delivery: "onsite" },
    ],
  });

  await page.goto(link);
  await expect(page.getByText("강*준")).toBeVisible();

  await page.route(link, async (route, request) => {
    if (request.method() === "POST") {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await route.continue();
  });

  await page.getByRole("button", { name: "강*준" }).click();

  await expect(page.getByRole("button", { name: "강*준" }).getByText("…")).toBeVisible();
  await expect(page.getByRole("button", { name: "윤*아" })).toBeDisabled();

  await page.unroute(link);
  await expect(page.getByLabel("전화번호 뒤 4자리")).toBeVisible();
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
  // T11 — 응답 본문에 가린 이름이 실제로 실려 있다(빈 ok 응답이 아니다).
  expect(await onSelectResp.text()).toContain("박*준");
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

test("S7 — rowId가 uuid 형식이 아니면 스키마가 거부한다(22P02 대신)", async ({ page }) => {
  const { link, eventId } = await createCertEvent({
    name: "모바일E2E S7",
    winners: [{ name: "정민준", phone: "010-3321-8890", prizeName: "무선 키보드", quantity: 1, delivery: "onsite" }],
  });
  const [winner] = await db.select().from(certWinners).where(eq(certWinners.eventId, eventId));
  if (!winner) throw new Error("당첨자를 찾지 못했다");

  await page.goto(link);
  const selectRequestPromise = page.waitForRequest((req) => req.url() === link && req.method() === "POST");
  await page.getByText("정*준").click();
  const selectRequest = await selectRequestPromise;

  const body = selectRequest.postDataBuffer();
  if (!body) throw new Error("본문을 잡지 못했다");
  const bodyText = body.toString("utf8");
  expect(bodyText).toContain(winner.id);
  // 같은 길이 · 형식만 깨뜨린 값(z.uuid()가 거부, Postgres uuid 칸도 22P02로 거부할 값)
  const mutatedId = `${winner.id.slice(0, -1)}z`;
  const mutatedBody = bodyText.replaceAll(winner.id, mutatedId);

  const resp = await page.request.post(link, { headers: selectRequest.headers(), data: mutatedBody });
  expect(resp.ok()).toBe(true);
  const text = await resp.text();
  // 스키마 거부(validationErrors) — DB까지 가지 않아 22P02도 가린 이름도 없다.
  expect(text).toContain('"validationErrors"');
  expect(text).toContain('"rowId"');
  expect(text).not.toContain("처리 중 오류 · 잠시 후 다시 시도");
  expect(text).not.toContain("정*준");
});

test("존재하지 않는 토큰도 같은 링크를 찾을 수 없습니다 · 404", async ({ page }) => {
  const response = await page.goto("/c/this-token-does-not-exist-anywhere-00000000");
  expect(response?.status()).toBe(404);
  await expect(page.getByText("링크를 찾을 수 없습니다")).toBeVisible();
});
