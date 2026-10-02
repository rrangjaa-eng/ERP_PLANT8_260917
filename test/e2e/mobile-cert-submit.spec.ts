import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, type Locator, type Page, type Request } from "@playwright/test";
import { eq, like } from "drizzle-orm";
import { db } from "@/db/client";
import { certSignatureUploads, certSubmissions } from "@/db/schema";
import { createCertEvent, withCertFeatureOff } from "./helpers/cert";
import { CONSENT_BLOCKED_WORD, CONSENT_CHECKBOX_LABEL, drawSignature, fillIntakeForm, submitButton } from "./helpers/cert-form";

test.use({ viewport: { width: 375, height: 800 } });
test.describe.configure({ mode: "serial" });

// 04.3-06 Task 3 · 04.3-15 — 375px 제출 흐름 · 서명 칸 계약(개정 ①-i) · 결과 불명 재전송 · 택배 주소 ·
// C1 직접 POST. 진입은 E′2 경품 고르기 → E′4(명단 · 확인 단계 없음 — 5909578685). 폼 채우기 · 서명은
// 공용 도우미 helpers/cert-form.ts(eng-review newflow E14). 자기 행사만 단언한다(전역 목록 · 전역 행 수 없음).

const LOGICAL_WIDTH = 520;
const KEY_GUIDE = "Space로 펜을 대고 떼고 방향키로 그립니다 · Shift를 함께 누르면 크게 움직이고 Backspace는 마지막 획을 지웁니다";

function canvasOf(page: Page) {
  return page.getByRole("application", { name: /^서명/ });
}

async function canvasBox(page: Page) {
  // 폰 폭에서 sticky 제출 줄이 캔버스 아래쪽과 겹치지 않게 맨 아래로 스크롤한다.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const box = await canvasOf(page).boundingBox();
  if (!box) throw new Error("서명 캔버스를 찾지 못했다");
  return box;
}

// 논리 좌표(520×200)로 마우스 획을 긋는다.
async function drawLogical(page: Page, points: { x: number; y: number }[]) {
  const box = await canvasBox(page);
  const s = box.width / LOGICAL_WIDTH;
  const [first, ...rest] = points;
  if (!first) return;
  await page.mouse.move(box.x + first.x * s, box.y + first.y * s);
  await page.mouse.down();
  for (const p of rest) await page.mouse.move(box.x + p.x * s, box.y + p.y * s, { steps: 4 });
  await page.mouse.up();
}

// E′2에서 경품 행을 눌러 E′4로 간다(서버 왕복 없음).
async function openForm(page: Page, link: string, prizeName: string) {
  if (!page.url().startsWith(link)) await page.goto(link);
  await page.getByRole("listitem").getByRole("button", { name: new RegExp(`^${prizeName}`) }).click();
  await expect(page.getByText("경품", { exact: true })).toBeVisible();
}

async function pasteInto(page: Page, selector: string, text: string) {
  await page.locator(selector).focus();
  await page.locator(selector).evaluate((el, value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}

async function submissionCount(eventId: string): Promise<number> {
  return (await db.select().from(certSubmissions).where(eq(certSubmissions.eventId, eventId))).length;
}

function localObjects(eventId: string, prizeId: string): string[] {
  const dir = join(tmpdir(), "plant8-cert-signatures", "signatures", eventId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.startsWith(`${prizeId}-`));
}

function isSubmitPost(link: string, request: Request): boolean {
  return request.url() === link && request.method() === "POST" && (request.postData() ?? "").includes("signaturePngBase64");
}

test("375px — 붙여넣기 · 점 · 왕복 낙서는 서명이 아니다 · 키보드로 두 획 · 지우고 다시 · 제출 → E5", async ({ page }) => {
  const { link } = await createCertEvent({ name: "제출E2E키보드" });
  if (!link) throw new Error("링크 없음");
  await openForm(page, link, "갤럭시 탭 S10");

  // 이름 · 연락처는 비어 있다(A3).
  await expect(page.locator("#name")).toHaveValue("");
  await expect(page.locator("#phone")).toHaveValue("");
  await expect(page.getByRole("group", { name: "주민등록번호" })).toBeVisible();

  // 앞 칸에 13자리(하이픈 포함) 붙여넣기 → 6 · 7로 나뉘고 포커스는 뒤 칸.
  await pasteInto(page, "#rrn-front", "930412-2123458");
  await expect(page.getByLabel("주민등록번호 앞 6자리")).toHaveValue("930412");
  await expect(page.getByLabel("주민등록번호 뒤 7자리")).toHaveValue("2123458");
  await expect(page.getByLabel("주민등록번호 뒤 7자리")).toBeFocused();

  await fillIntakeForm(page, { phone: "010-4821-7730" });

  // 짧은 점 하나 — 서명이 아니다.
  await drawLogical(page, [{ x: 260, y: 100 }]);
  await expect(page.getByText("서명을 해 주세요")).toBeVisible();

  // 같은 자리를 짧게 네 번 왕복한 낙서(획 길이는 논리 24를 넘지만 잉크가 모자람) — 서버와 같은 잉크 판정.
  await page.getByRole("button", { name: "다시 쓰기" }).click();
  const scribble = [{ x: 200, y: 100 }];
  for (let i = 0; i < 4; i++) scribble.push({ x: 216, y: 100 }, { x: 200, y: 100 });
  await drawLogical(page, scribble);
  await expect(page.getByText("서명을 해 주세요")).toBeVisible();

  // 「다시 쓰기」 → 포커스 캔버스. 키보드로 캔버스에 오면 키 안내 줄이 보인다.
  await page.getByRole("button", { name: "다시 쓰기" }).click();
  await expect(page.getByText("서명을 모두 지웠습니다", { exact: true })).toBeAttached();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(canvasOf(page)).toBeFocused();
  await expect(page.getByText(KEY_GUIDE)).toBeVisible();

  // 첫 획 — Space · 오른쪽 여섯 번 · Space.
  await page.keyboard.press("Space");
  await expect(page.getByText("펜을 댔습니다 · 왼쪽 아래", { exact: true })).toBeAttached();
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await expect(page.getByText("서명이 들어갔습니다", { exact: true })).toBeAttached();
  await expect(page.getByRole("application", { name: "서명 칸 · 서명함" })).toBeVisible();

  // 둘째 획 — 펜을 뗀 채 위로 옮긴 뒤 긋는다.
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Space");
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await expect(page.getByText("펜을 뗐습니다 · 획 2개", { exact: true })).toBeAttached();

  // Backspace = 마지막 획 지우기 → 다시 긋기.
  await page.keyboard.press("Backspace");
  await expect(page.getByText("마지막 획을 지웠습니다 · 획 1개", { exact: true })).toBeAttached();
  await page.keyboard.press("Space");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Space");
  await expect(page.getByText("펜을 뗐습니다 · 획 2개", { exact: true })).toBeAttached();

  await expect(page.getByText("서명을 해 주세요")).toHaveCount(0);
  await submitButton(page).click();

  await expect(page.getByText("제출되었습니다", { exact: true })).toBeFocused();
  await expect(page.getByText(/김하늘 · .* 제출 · 갤럭시 탭 S10 1개 현장 수령/)).toBeVisible();
  await expect(page.getByText(/^확인이 필요하면 담당자/)).toBeVisible();
  await expect(page).toHaveTitle("제출됨 · 기타소득 지급 확인");
});

test("결과 불명 — 서버는 처리했지만 응답을 잃으면 결과 불명 줄 · 값 유지 → 다시 누르면 E5 · 제출 줄 하나", async ({ page }) => {
  const { link, eventId } = await createCertEvent({ name: "제출E2E결과불명" });
  if (!link) throw new Error("링크 없음");
  await openForm(page, link, "갤럭시 탭 S10");
  await fillIntakeForm(page, { phone: "010-4821-7730" });
  await drawSignature(page);

  let dropped = false;
  await page.route(link, async (route, request) => {
    if (!dropped && isSubmitPost(link, request)) {
      dropped = true;
      await route.fetch(); // 서버는 처리한다
      await route.abort(); // 응답만 버린다
      return;
    }
    await route.continue();
  });

  await submitButton(page).click();
  await expect(page.getByText("제출됐는지 확인하지 못했습니다 · 다시 눌러 주세요 · 적은 내용은 남아 있습니다")).toBeVisible();
  await expect(page.locator("#name")).toHaveValue("김하늘");
  await expect(page.getByLabel("주민등록번호 뒤 7자리")).toHaveValue("2123458");

  await submitButton(page).click();
  await expect(page.getByText("제출되었습니다", { exact: true })).toBeVisible();
  expect(await submissionCount(eventId)).toBe(1);
});

test("되물음 뒤 결과 불명 — 같은 제출 키 · rrnRecheckConfirmed true 유지 · 다시 되묻지 않고 E5", async ({ page }) => {
  const { link, eventId } = await createCertEvent({ name: "제출E2E되물음" });
  if (!link) throw new Error("링크 없음");
  await openForm(page, link, "갤럭시 탭 S10");
  await fillIntakeForm(page, { rrnBack: "2123459", phone: "010-4821-7730" });
  await drawSignature(page);

  await submitButton(page).click();
  const rrnError = page.getByText("주민등록번호가 맞지 않습니다 · 앞 6자리(생년월일)와 뒤 7자리를 다시 확인해 주세요");
  await expect(rrnError).toBeVisible();

  let aborted: Request | undefined;
  await page.route(link, async (route, request) => {
    if (!aborted && isSubmitPost(link, request)) {
      aborted = request;
      await route.abort(); // 서버에 닿지 않는다
      return;
    }
    await route.continue();
  });
  await submitButton(page).click();
  await expect(page.getByText("제출됐는지 확인하지 못했습니다 · 다시 눌러 주세요 · 적은 내용은 남아 있습니다")).toBeVisible();

  const retryPromise = page.waitForRequest((r) => isSubmitPost(link, r));
  await submitButton(page).click();
  const retry = await retryPromise;
  await expect(page.getByText("제출되었습니다", { exact: true })).toBeVisible();

  if (!aborted) throw new Error("끊은 요청을 잡지 못했다");
  const keyOf = (body: string) => /"idempotencyKey":"([^"]+)"/.exec(body)?.[1];
  const abortedBody = aborted.postData() ?? "";
  const retryBody = retry.postData() ?? "";
  expect(keyOf(abortedBody)).toBeDefined();
  expect(keyOf(retryBody)).toBe(keyOf(abortedBody));
  expect(abortedBody).toContain('"rrnRecheckConfirmed":true');
  expect(retryBody).toContain('"rrnRecheckConfirmed":true');
  expect(await submissionCount(eventId)).toBe(1);
});

// PR #88 /review F1 — 멱등 키가 폼 밖(IntakeFlow)에 있어 「다른 경품 고르기」로 나갔다 같은 값으로 돌아와도 같은 키다.
test("결과 불명 뒤 「다른 경품 고르기」로 나갔다 같은 경품 · 같은 값으로 다시 내면 같은 키 · 제출 줄 하나", async ({ page }) => {
  const { link, eventId } = await createCertEvent({ name: "제출E2E결과불명왕복" });
  if (!link) throw new Error("링크 없음");
  await openForm(page, link, "갤럭시 탭 S10");
  await fillIntakeForm(page, { phone: "010-4821-7730" });
  await drawSignature(page);

  let first: Request | undefined;
  await page.route(link, async (route, request) => {
    if (!first && isSubmitPost(link, request)) {
      first = request;
      await route.fetch(); // 서버는 처리한다
      await route.abort(); // 응답만 버린다
      return;
    }
    await route.continue();
  });
  await submitButton(page).click();
  await expect(page.getByText("제출됐는지 확인하지 못했습니다 · 다시 눌러 주세요 · 적은 내용은 남아 있습니다")).toBeVisible();

  await page.getByRole("button", { name: "다른 경품 고르기" }).click();
  await openForm(page, link, "갤럭시 탭 S10");
  await expect(page.locator("#name")).toHaveValue("김하늘");

  const retryPromise = page.waitForRequest((r) => isSubmitPost(link, r));
  await submitButton(page).click();
  const retry = await retryPromise;
  await expect(page.getByText("제출되었습니다", { exact: true })).toBeVisible();

  if (!first) throw new Error("첫 요청을 잡지 못했다");
  const keyOf = (body: string) => /"idempotencyKey":"([^"]+)"/.exec(body)?.[1];
  expect(keyOf(first.postData() ?? "")).toBeDefined();
  expect(keyOf(retry.postData() ?? "")).toBe(keyOf(first.postData() ?? ""));
  expect(await submissionCount(eventId)).toBe(1);
});

test("택배 경품은 주소 칸 · 부제가 있고 현장 경품은 없다 · 경품 아래 문의 줄의 tel:은 숫자만", async ({ page }) => {
  const { link } = await createCertEvent({
    name: "제출E2E택배",
    prizes: [
      { name: "다이슨 에어랩", unitValueKrw: 599_000, delivery: "parcel" },
      { name: "갤럭시 탭 S10", delivery: "onsite" },
    ],
  });
  if (!link) throw new Error("링크 없음");
  await openForm(page, link, "다이슨 에어랩");
  await expect(page.getByLabel(/^주소/)).toBeVisible();
  await expect(page.getByText("택배로 보내 드립니다")).toBeVisible();
  const inquiry = page.getByText(/^받은 경품이 목록에 없으면 제출하지 않아도 됩니다/);
  await expect(inquiry).toBeVisible();
  await expect(inquiry.locator("a")).toHaveAttribute("href", /^tel:\d+$/);

  await page.getByRole("button", { name: "다른 경품 고르기" }).click();
  await openForm(page, link, "갤럭시 탭 S10");
  await expect(page.getByLabel(/^주소/)).toHaveCount(0);
  await expect(page.getByText("택배로 보내 드립니다")).toHaveCount(0);
});

test("C1 직접 POST — 기능이 꺼진 동안 진짜 제출 요청을 보내도 저장 · 업로드 · 의도 줄이 없고, 켜면 저장된다", async ({ page }) => {
  const { link, eventId, prizeIds } = await createCertEvent({ name: "제출E2E직접POST" });
  const prizeId = prizeIds[0];
  if (!link || !prizeId) throw new Error("링크 없음");
  await openForm(page, link, "갤럭시 탭 S10");
  await fillIntakeForm(page, { phone: "010-4821-7730" });
  await drawSignature(page);

  let captured: Request | undefined;
  await page.route(link, async (route, request) => {
    if (!captured && isSubmitPost(link, request)) {
      captured = request;
      await route.abort(); // 서버에 닿지 않는다
      return;
    }
    await route.continue();
  });
  await submitButton(page).click();
  await expect.poll(() => captured !== undefined, { timeout: 5000 }).toBe(true);
  await page.unroute(link);
  if (!captured) throw new Error("제출 요청을 잡지 못했다");
  const headers = captured.headers();
  const body = captured.postDataBuffer() ?? undefined;
  const intentsFor = async () =>
    (await db.select().from(certSignatureUploads).where(like(certSignatureUploads.objectKey, `signatures/${eventId}/%`)))
      .length;

  await withCertFeatureOff(async () => {
    await page.request.post(link, { headers, data: body });
    expect(await submissionCount(eventId)).toBe(0);
    expect(await intentsFor()).toBe(0);
    expect(localObjects(eventId, prizeId)).toHaveLength(0);
  });

  const on = await page.request.post(link, { headers, data: body });
  expect(on.ok()).toBe(true);
  expect(await submissionCount(eventId)).toBe(1);
  expect(localObjects(eventId, prizeId)).toHaveLength(1);
});

// DOM 감사 F1 — 외부 수령자 화면은 480 한 열이라 PC 폭에서도 라벨이 칸 위다(SYSTEM §6-5).
async function expectLabelAbove(label: Locator, input: Locator) {
  const l = await label.boundingBox();
  const i = await input.boundingBox();
  if (!l || !i) throw new Error("라벨이나 칸을 찾지 못했다");
  expect(l.y + l.height).toBeLessThanOrEqual(i.y);
}

test("1280 — E′4 모든 라벨은 칸 위(F1) · 이름 · 주민등록번호 자동 완성 끔(M2)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { link } = await createCertEvent({ name: "제출E2E1280", prizes: [{ delivery: "parcel" }] });
  if (!link) throw new Error("링크 없음");
  await openForm(page, link, "갤럭시 탭 S10");

  await expectLabelAbove(page.locator('label[for="name"]'), page.locator("#name"));
  await expectLabelAbove(page.locator('[role="group"] > span').first(), page.locator("#rrn-front"));
  await expectLabelAbove(page.locator('label[for="address"]'), page.locator("#address"));
  await expectLabelAbove(page.locator('label[for="phone"]'), page.locator("#phone"));
  await expectLabelAbove(page.getByText("서명", { exact: true }), canvasOf(page));

  // 검토 M2 — 브라우저가 이름 · 주민등록번호를 기억하거나 비밀번호로 저장하자고 하지 않는다.
  await expect(page.locator("#name")).toHaveAttribute("autocomplete", "off");
  await expect(page.locator("#rrn-front")).toHaveAttribute("autocomplete", "off");
  await expect(page.locator("#rrn-back")).toHaveAttribute("autocomplete", "new-password");
});

// DOM 감사 N2 — 서버가 이름 · 주소 · 동의를 invalid로 돌려주면 그 칸이 aria-invalid이고,
// 제출 줄이 그 칸을 부르면 칸의 aria-describedby가 그 줄을 가리킨다(새 문구 없음).
// 화면 검사가 막는 값이라 제출 본문을 가로채 바꿔 진짜 서버 판정을 받는다. 빈 주소는 낡은 목록이라 서버가 prizeGone으로
// 돌려주므로(5931337199) 주소는 200자 초과로 액션 스키마가 거절하게 한다.
test("서버 칸 오류 — 이름 invalid · 주소 거절 → aria-invalid + 제출 줄 연결 · 동의 거절 → 동의 칸 aria-invalid", async ({ page }) => {
  const { link } = await createCertEvent({ name: "제출E2E칸오류", prizes: [{ delivery: "parcel" }] });
  if (!link) throw new Error("링크 없음");
  await openForm(page, link, "갤럭시 탭 S10");
  await fillIntakeForm(page, { phone: "010-4821-7730", address: "서울시 중구 세종대로 110" });
  await drawSignature(page);

  let posts = 0;
  await page.route(link, async (route, request) => {
    if (!isSubmitPost(link, request)) return route.continue();
    posts++;
    const args = JSON.parse(request.postData() ?? "[]") as Record<string, unknown>[];
    const body = args[0];
    if (!body) throw new Error("제출 본문을 읽지 못했다");
    if (posts === 1) Object.assign(body, { name: "   " }); // 서버 domain이 invalid
    else if (posts === 2) Object.assign(body, { address: "가".repeat(201) }); // 액션 스키마가 거절
    else Object.assign(body, { consent: false }); // 액션 스키마가 거절
    await route.continue({ postData: JSON.stringify(args) });
  });

  await submitButton(page).click();
  const nameLine = page.getByText("이름을 고쳐 주세요 · 나머지는 채워졌습니다");
  await expect(nameLine).toBeVisible();
  const nameLineId = await nameLine.getAttribute("id");
  expect(nameLineId).toBeTruthy();
  await expect(page.locator("#name")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#name")).toHaveAttribute("aria-describedby", nameLineId ?? "");
  await expect(page.locator("#name")).toBeFocused();

  await submitButton(page).click();
  const addressLine = page.getByText("주소를 고쳐 주세요 · 나머지는 채워졌습니다");
  await expect(addressLine).toBeVisible();
  const addressLineId = await addressLine.getAttribute("id");
  expect(addressLineId).toBeTruthy();
  await expect(page.locator("#address")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#address")).toHaveAttribute("aria-describedby", addressLineId ?? "");
  await expect(page.locator("#address")).toBeFocused();
  await expect(page.locator("#name")).not.toHaveAttribute("aria-invalid", "true");

  await submitButton(page).click();
  const consent = page.getByRole("checkbox");
  await expect(consent).toHaveAttribute("aria-invalid", "true");
  await expect(consent).toBeFocused();
  await expect(page.locator("#address")).not.toHaveAttribute("aria-invalid", "true");
  expect(posts).toBe(3);
});

// 04.3-14 사용자 결정 ① · G0 DR-7 · F11 · G9 a — 동의 대신 법령에 따른 수집 안내(v4). 전문은 제목 · 본문이 갈린 목록이고
// 1절의 문의 전화는 바로 걸린다.
test("수집 안내 v4 — 체크 이름 · 빈 폼 막힘 이유의 안내 확인 체크 · 전문 dl(dt 8 · dd 8) · 문의 전화 tel: · 체크 후 제출 → E5", async ({
  page,
}) => {
  const { link } = await createCertEvent({ name: "제출E2E수집안내" });
  if (!link) throw new Error("링크 없음");
  await openForm(page, link, "갤럭시 탭 S10");

  await expect(
    page.getByText(`이름 · 주민등록번호 · 연락처 · ${CONSENT_BLOCKED_WORD} · 서명을 채우면 제출할 수 있습니다`, { exact: true }),
  ).toBeVisible();
  const checkbox = page.getByRole("checkbox", { name: CONSENT_CHECKBOX_LABEL });
  await expect(checkbox).toBeVisible();
  await expect(checkbox).not.toBeChecked();

  const toggle = page.getByRole("button", { name: "전문 보기" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(page.getByRole("button", { name: "전문 접기" })).toHaveAttribute("aria-expanded", "true");
  const fullId = await page.getByRole("button", { name: "전문 접기" }).getAttribute("aria-controls");
  const list = page.locator(`[id="${fullId}"] dl`);
  await expect(list).toBeVisible();
  await expect(list.locator("dt")).toHaveCount(8);
  await expect(list.locator("dd")).toHaveCount(8);
  await expect(list.locator("dt").first()).toHaveText("처리자 · 문의");
  const tel = list.locator("dd").first().getByRole("link");
  await expect(tel).toHaveAttribute("href", /^tel:\d+$/);
  await expect(list.locator("dd").first()).toHaveText(/^PLANT8 · 경영관리 \d{2,4}-\d{3,4}-\d{4}$/);

  await fillIntakeForm(page, { phone: "010-4821-7730" });
  await expect(checkbox).toBeChecked();
  await drawSignature(page);
  await submitButton(page).click();
  await expect(page.getByText("제출되었습니다", { exact: true })).toBeVisible();
});
