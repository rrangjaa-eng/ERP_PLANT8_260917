import { test, expect, type Page, type Request } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { certPrizes } from "@/db/schema";
import { createCertEvent, setCertPrizeValueForTest } from "./helpers/cert";
import { drawSignature, fillIntakeForm, submitButton } from "./helpers/cert-form";
import { collectCertResponses, leakPatternsFor, scanForLeaks, scannerSelfTest } from "./helpers/cert-leak";

test.use({ viewport: { width: 375, height: 800 } });
test.describe.configure({ mode: "serial" });

// 04.3-16 — 수령자 흐름의 갈래 화면(경품 빠짐 · 경품 없음 E6-d · 안내 바뀜 · 속도 제한 · 닫힘 · 열리기 전 E6-e · 뒤로 가기).
// 갈래 응답은 서버가 실제로 돌려준 것을 본다(테스트가 꾸민 본문은 늘 녹색이다 — eng-review newflow E16). 가액 누수는
// 04.3-15 공용 검사(helpers/cert-leak)로 양성 · 차등 대조군과 함께 잰다.

// UI-SPEC은 「고른 경품을 받을 수 없게 되었습니다」였으나 prizeGone이 「같은 경품 · 전달 방식 바뀜」도 뜻해서
// 사용자 결정(PR #88 5928674957, V3 a)으로 두 경우를 덮는 이 문장을 쓴다.
const PRIZE_GONE_NOTICE = "고른 경품의 내용이 바뀌었습니다 · 다시 골라 주세요";
const NO_PRIZE_LEAD = "받을 수 있는 경품이 없습니다";

const A = { name: "빠짐대조-A", unitValueKrw: 73_519, delivery: "onsite" as const };
const B = { name: "빠짐대조-B", unitValueKrw: 581_247, delivery: "parcel" as const };
const C = { name: "빠짐대조-C", unitValueKrw: 91_237, delivery: "onsite" as const };
const GONE_VALUE = 49_000;

function prizeRow(page: Page, name: string) {
  return page.getByRole("listitem").getByRole("button", { name: new RegExp(`^${name}`) });
}

// 제출 POST의 멱등 키(요청 본문 — 서버 액션 본문은 JSON 문자열).
function trackSubmitKeys(page: Page): string[] {
  const keys: string[] = [];
  page.on("request", (request: Request) => {
    if (request.method() !== "POST") return;
    const body = request.postData() ?? "";
    if (!body.includes("signaturePngBase64")) return;
    const key = /"idempotencyKey":"([^"]+)"/.exec(body)?.[1];
    if (key) keys.push(key);
  });
  return keys;
}

// 경품 빠짐 한 바퀴 — 세 경품 중 둘째(택배)를 골라 다 적고 서명한 뒤, 제출 전에 그 경품 가액을 50,000 이하로 내린다.
async function submitWhilePrizeGoes(page: Page, link: string, prizeIds: string[]) {
  await page.goto(link);
  await prizeRow(page, B.name).click();
  await fillIntakeForm(page, { phone: "010-4821-7730", address: "서울시 마포구 월드컵로 1" });
  await drawSignature(page);
  const gone = prizeIds[1];
  if (!gone) throw new Error("둘째 경품 id 없음");
  await setCertPrizeValueForTest(gone, GONE_VALUE);
  await submitButton(page).click();
}

test("경품 빠짐 — 제출하는 사이 고른 경품이 빠지면 E′2에 새 목록 + 알림 줄(포커스) · 주소만 버림 → 다른 경품 → E5 · 새 멱등 키 · 응답 가액 0건", async ({
  page,
}) => {
  expect(scannerSelfTest()).toBe(true);
  const { link, prizeIds } = await createCertEvent({ name: "빠짐E2E", prizes: [A, B, C] });
  if (!link) throw new Error("링크 없음");

  await submitWhilePrizeGoes(page, link, prizeIds);

  // E′2 — 새 목록(A · C만) · 목록 위 알림 줄. 포커스 이동이 곧 낭독이라 role 속성이 없다(DR-10).
  const notice = page.getByText(PRIZE_GONE_NOTICE, { exact: true });
  await expect(notice).toBeVisible();
  await expect(notice).toHaveAttribute("tabindex", "-1");
  expect(await notice.getAttribute("role")).toBeNull();
  await expect(notice).toBeFocused();
  await expect(page.getByRole("listitem")).toHaveCount(2);
  await expect(prizeRow(page, A.name)).toBeVisible();
  await expect(prizeRow(page, C.name)).toBeVisible();
  await expect(prizeRow(page, B.name)).toHaveCount(0);
  await expect(page).toHaveTitle("경품 고르기 · 기타소득 지급 확인");
  // 기존 E′ 오류 줄 규칙 — --fs-md --danger.
  const danger = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--danger)";
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  await expect(notice).toHaveCSS("color", danger);
  await expect(notice).toHaveCSS("font-size", "15px");
  // 알림 줄은 목록 위에 선다.
  const noticeBox = await notice.boundingBox();
  const firstRow = await page.getByRole("listitem").first().boundingBox();
  expect(noticeBox!.y).toBeLessThan(firstRow!.y);
});

test("경품 빠짐 뒤 다른 경품 — 이름 · 주민등록번호 · 연락처 · 서명이 남고 주소 칸은 없다 → 제출 → E5", async ({ page }) => {
  const { link, prizeIds } = await createCertEvent({ name: "빠짐E2E이어서", prizes: [A, B, C] });
  if (!link) throw new Error("링크 없음");
  const keys = trackSubmitKeys(page);
  await submitWhilePrizeGoes(page, link, prizeIds);
  await expect(page.getByText(PRIZE_GONE_NOTICE, { exact: true })).toBeFocused();

  await prizeRow(page, C.name).click();
  await expect(page.getByText(`${C.name} 1개`, { exact: true })).toBeVisible();
  await expect(page.locator("#name")).toHaveValue("김하늘");
  await expect(page.getByLabel("주민등록번호 앞 6자리")).toHaveValue("930412");
  await expect(page.getByLabel("주민등록번호 뒤 7자리")).toHaveValue("2123458");
  await expect(page.locator("#phone")).toHaveValue("010-4821-7730");
  await expect(page.locator("#address")).toHaveCount(0);
  // 서명이 남았으니 다시 쓰지 않고 제출할 수 있다.
  await expect(submitButton(page)).toBeEnabled();

  await submitButton(page).click();
  await expect(page.getByText("제출되었습니다", { exact: true })).toBeVisible();
  await expect(page.getByText(new RegExp(`${C.name} 1개 현장 수령`))).toBeVisible();

  // 확정 판정(경품 빠짐)이 키를 끝낸다 — 다음 제출은 새 키(E39).
  expect(keys).toHaveLength(2);
  expect(keys[0]).not.toBe(keys[1]);
});

test("경품 빠짐 응답 — 서버가 실제로 돌려준 새 목록(A · C 이름 있음 · B 이름 없음)에 가액 패턴 0건 · 차등 대조군도 0건", async ({
  page,
}) => {
  const patterns = leakPatternsFor([A.unitValueKrw, B.unitValueKrw, C.unitValueKrw, GONE_VALUE]);
  const { link, prizeIds } = await createCertEvent({ name: "빠짐E2E누수", prizes: [A, B, C] });
  if (!link) throw new Error("링크 없음");
  const collector = await collectCertResponses(page);
  await submitWhilePrizeGoes(page, link, prizeIds);
  await expect(page.getByText(PRIZE_GONE_NOTICE, { exact: true })).toBeVisible();
  const { corpus, actionPostCount, actionBodies } = await collector.finish();

  expect(actionPostCount).toBeGreaterThanOrEqual(1);
  const goneBody = actionBodies.find((body) => body.includes("prizeGone"));
  expect(goneBody, "서버가 돌려준 prizeGone 응답").toBeDefined();
  expect(goneBody).toContain(A.name);
  expect(goneBody).toContain(C.name);
  expect(goneBody).not.toContain(B.name);
  expect(scanForLeaks(corpus, patterns)).toEqual([]);

  // 차등 대조군 — 다른 가액만 둔 행사의 같은 흐름도 같은 패턴 0건, 자기 가액 0건.
  const other = await createCertEvent({
    name: "빠짐E2E차등",
    prizes: [
      { name: "차등-가", unitValueKrw: 88_888, delivery: "onsite" },
      { name: "차등-나", unitValueKrw: 612_345, delivery: "parcel" },
      { name: "차등-다", unitValueKrw: 77_777, delivery: "onsite" },
    ],
  });
  if (!other.link) throw new Error("링크 없음");
  const second = await page.context().newPage();
  const otherCollector = await collectCertResponses(second);
  await second.goto(other.link);
  await prizeRow(second, "차등-나").click();
  await fillIntakeForm(second, { phone: "010-4821-7730", address: "서울시 마포구 월드컵로 1" });
  await drawSignature(second);
  const secondGone = other.prizeIds[1];
  if (!secondGone) throw new Error("둘째 경품 id 없음");
  await setCertPrizeValueForTest(secondGone, GONE_VALUE);
  await submitButton(second).click();
  await expect(second.getByText(PRIZE_GONE_NOTICE, { exact: true })).toBeVisible();
  const control = await otherCollector.finish();
  expect(control.actionBodies.find((body) => body.includes("prizeGone"))).toContain("차등-가");
  expect(scanForLeaks(control.corpus, patterns)).toEqual([]);
  expect(scanForLeaks(control.corpus, leakPatternsFor([88_888, 612_345, 77_777]))).toEqual([]);
  await second.close();
});

test("V3 — 제출 중 전달 방식이 현장 → 택배로 바뀌면 같은 경품이 목록에 그대로 있어도 같은 알림 · 주소 칸이 새로 선다(비어 있음)", async ({
  page,
}) => {
  const { link, prizeIds } = await createCertEvent({
    name: "빠짐E2E전달",
    prizes: [
      { name: "전달-가", unitValueKrw: 73_519, delivery: "onsite" },
      { name: "전달-나", unitValueKrw: 91_237, delivery: "onsite" },
    ],
  });
  if (!link) throw new Error("링크 없음");
  await page.goto(link);
  await prizeRow(page, "전달-나").click();
  await fillIntakeForm(page, { phone: "010-4821-7730" });
  await drawSignature(page);
  await expect(page.locator("#address")).toHaveCount(0);

  const changing = prizeIds[1];
  if (!changing) throw new Error("둘째 경품 id 없음");
  await db.update(certPrizes).set({ delivery: "parcel", updatedAt: new Date() }).where(eq(certPrizes.id, changing));
  await submitButton(page).click();

  const notice = page.getByText(PRIZE_GONE_NOTICE, { exact: true });
  await expect(notice).toBeFocused();
  await expect(page.getByRole("listitem")).toHaveCount(2);
  // 같은 경품이 그대로 있고, 이제 택배(2행)다.
  await expect(prizeRow(page, "전달-나")).toHaveText("전달-나택배");

  await prizeRow(page, "전달-나").click();
  await expect(page.locator("#address")).toBeVisible();
  await expect(page.locator("#address")).toHaveValue("");
  await expect(page.locator("#name")).toHaveValue("김하늘");
  await expect(submitButton(page)).toBeDisabled(); // 주소가 비어 있어 막힘(서명 · 다른 값은 남음)
  await page.locator("#address").fill("서울시 마포구 월드컵로 1");
  await expect(submitButton(page)).toBeEnabled();
  await submitButton(page).click();
  await expect(page.getByText("제출되었습니다", { exact: true })).toBeVisible();
  await expect(page.getByText(/전달-나 1개 적은 주소로 보내 드립니다/)).toBeVisible();
});

test("E6-d — 제출 중 마지막 경품이 빠지면 경품 없음 화면(1차 · 입력 없음 · 문의 줄 · 제목 · 포커스)", async ({ page }) => {
  const { link, prizeIds } = await createCertEvent({
    name: "빠짐E2E마지막",
    prizes: [{ name: "마지막-가", unitValueKrw: 73_519, delivery: "onsite" }],
  });
  if (!link) throw new Error("링크 없음");
  await page.goto(link);
  await prizeRow(page, "마지막-가").click();
  await fillIntakeForm(page, { phone: "010-4821-7730" });
  await drawSignature(page);
  const only = prizeIds[0];
  if (!only) throw new Error("경품 id 없음");
  await setCertPrizeValueForTest(only, GONE_VALUE);
  await submitButton(page).click();

  const lead = page.getByText(NO_PRIZE_LEAD, { exact: true });
  await expect(lead).toBeVisible();
  await expect(lead).toBeFocused();
  await expect(page).toHaveTitle("경품 없음 · 기타소득 지급 확인");
  await expect(page.getByText(/^확인이 필요하면 담당자 .* · PLANT8 경영관리 02-123-4567에 전화해 주세요$/)).toBeVisible();
  await expect(page.locator('a[href="tel:021234567"]')).toHaveCount(1);
  await expect(submitButton(page)).toHaveCount(0);
  await expect(page.locator("input")).toHaveCount(0);
  await expect(page.getByRole("listitem")).toHaveCount(0);
});

test("E6-d — 링크는 열렸는데 5만원 넘는 경품이 하나도 없으면 첫 진입부터 경품 없음(제목 포함)", async ({ page }) => {
  const { link } = await createCertEvent({
    name: "빠짐E2E경품없음",
    prizes: [{ name: "작은-가", unitValueKrw: 30_000, delivery: "onsite" }],
  });
  if (!link) throw new Error("링크 없음");
  const collector = await collectCertResponses(page);
  await page.goto(link);
  await expect(page.getByText(NO_PRIZE_LEAD, { exact: true })).toBeVisible();
  await expect(page).toHaveTitle("경품 없음 · 기타소득 지급 확인");
  await expect(page.getByText(/^확인이 필요하면 담당자/)).toBeVisible();
  await expect(submitButton(page)).toHaveCount(0);
  await expect(page.getByRole("listitem")).toHaveCount(0);
  await expect(page.getByText("작은-가")).toHaveCount(0);
  const { corpus } = await collector.finish();
  expect(scanForLeaks(corpus, leakPatternsFor([30_000]))).toEqual([]);
});
