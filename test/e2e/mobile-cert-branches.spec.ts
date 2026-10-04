import { test, expect, type Page, type Request } from "@playwright/test";
import { eq } from "drizzle-orm";
import { Client } from "pg";
import { db } from "@/db/client";
import { certEvents, certPrizes } from "@/db/schema";
import { env } from "@/lib/env";
import { addDays, kstToday } from "@/lib/kst-date";
import { CERT_RETENTION_YEARS } from "@/domain/settings/keys";
import { getSettingValue, setSettingValue } from "@/domain/settings/registry";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import {
  ageSubmissionsForTest,
  closeCertEventForTest,
  createCertEvent,
  seedIpSubmissionsForTest,
  setCertPrizeValueForTest,
} from "./helpers/cert";
import { CONSENT_BLOCKED_WORD, CONSENT_CHECKBOX_LABEL, drawSignature, fillIntakeForm, submitButton } from "./helpers/cert-form";
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
  // 기존 E′ 오류 줄 규칙 — --text-prose --status-danger.
  const danger = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--status-danger)";
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

// 제출이 행사 행 잠금을 기다리는 동안 전달 방식을 바꾼다 — 서버가 잠근 뒤 다시 판정해 prizeGone을 돌려주는 진짜 경합
// (04.3-15 R1). 별도 연결이 행사 행을 쥐고, 서버 연결이 그 잠금을 기다리는 것을 pg_stat_activity로 확인한 뒤 바꾸고 커밋한다.
async function changeDeliveryWhileSubmitWaits(page: Page, eventId: string, prizeId: string, to: "onsite" | "parcel") {
  const holder = new Client({ connectionString: env.DATABASE_URL });
  await holder.connect();
  try {
    await holder.query("BEGIN");
    await holder.query("SELECT id FROM cert_events WHERE id = $1 FOR UPDATE", [eventId]);
    await submitButton(page).click();
    // 서버 연결이 우리 행 잠금(트랜잭션 id)을 기다리는 것 = 아직 잠그기 전에 읽은 값(현장)으로 칸 검사를 마쳤다는 뜻이다.
    await expect
      .poll(
        async () =>
          (await holder.query<{ n: number }>("SELECT count(*)::int AS n FROM pg_locks WHERE NOT granted AND locktype IN ('transactionid', 'tuple')"))
            .rows[0]?.n ?? 0,
        { timeout: 4000 },
      )
      .toBeGreaterThan(0);
    await holder.query("UPDATE cert_prizes SET delivery = $2, updated_at = now() WHERE id = $1", [prizeId, to]);
    await holder.query("COMMIT");
  } finally {
    await holder.end();
  }
}

test("V3 — 제출 중 전달 방식이 현장 → 택배로 바뀌면 같은 경품이 목록에 그대로 있어도 같은 알림 · 주소 칸이 새로 선다(비어 있음)", async ({
  page,
}) => {
  const { link, eventId, prizeIds } = await createCertEvent({
    name: "빠짐E2E전달",
    prizes: [
      { name: "전달-가", unitValueKrw: 73_519, delivery: "onsite" },
      { name: "전달-나", unitValueKrw: 91_237, delivery: "onsite" },
    ],
  });
  if (!link) throw new Error("링크 없음");
  const keys = trackSubmitKeys(page);
  await page.goto(link);
  await prizeRow(page, "전달-나").click();
  await fillIntakeForm(page, { phone: "010-4821-7730" });
  await drawSignature(page);
  await expect(page.locator("#address")).toHaveCount(0);

  const changing = prizeIds[1];
  if (!changing) throw new Error("둘째 경품 id 없음");
  await changeDeliveryWhileSubmitWaits(page, eventId, changing, "parcel");

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
  expect(keys).toHaveLength(2);
  expect(keys[0]).not.toBe(keys[1]);
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

// ── Task 2 — 나머지 갈래 ────────────────────────────────────────────────────

const THROTTLED_LINE = "제출이 잠시 멈췄습니다 · 잠시 뒤 다시 눌러 주세요";

function tomorrowKst(): string {
  return addDays(kstToday(new Date()), 1);
}

test("안내 바뀜 — 보존 연수가 바뀐 채 제출하면 안내 블록이 새 판으로 · 체크만 풀림(포커스) · 다른 값 · 서명 남음 → 체크 → E5 · 새 멱등 키 · 응답 가액 0건", async ({
  page,
}) => {
  const patterns = leakPatternsFor([A.unitValueKrw, B.unitValueKrw, C.unitValueKrw]);
  const { link } = await createCertEvent({ name: "안내바뀜E2E", prizes: [A, B, C] });
  if (!link) throw new Error("링크 없음");
  const keys = trackSubmitKeys(page);
  const collector = await collectCertResponses(page);
  const before = await getSettingValue(CERT_RETENTION_YEARS);
  const after = before + 1;
  try {
    await page.goto(link);
    await prizeRow(page, A.name).click();
    await fillIntakeForm(page, { phone: "010-4821-7730" });
    await drawSignature(page);
    await expect(page.getByText(new RegExp(`${before}년 동안 보관`)).first()).toBeVisible();
    await expect(submitButton(page)).toBeEnabled();

    await setSettingValue(SYSTEM_VIEWER, CERT_RETENTION_YEARS, after);
    await submitButton(page).click();

    // 안내 블록이 새 연수로 다시 그려지고 체크만 풀린다 — 포커스 = 그 체크박스(DR-10), 새 문장 없음.
    const consent = page.getByRole("checkbox", { name: CONSENT_CHECKBOX_LABEL });
    await expect(page.getByText(new RegExp(`${after}년 동안 보관`)).first()).toBeVisible();
    await expect(consent).not.toBeChecked();
    await expect(consent).toBeFocused();
    await expect(page.locator("#name")).toHaveValue("김하늘");
    await expect(page.getByLabel("주민등록번호 앞 6자리")).toHaveValue("930412");
    await expect(page.getByLabel("주민등록번호 뒤 7자리")).toHaveValue("2123458");
    await expect(page.locator("#phone")).toHaveValue("010-4821-7730");
    // 서명이 남아 막힘 이유는 안내 확인 낱말 하나뿐이다(빈 칸 목록 규칙 — 새 문장 없음).
    await expect(submitButton(page)).toBeDisabled();
    await expect(page.getByText(new RegExp(`^${CONSENT_BLOCKED_WORD}[을를] 채우면 제출할 수 있습니다$`))).toBeVisible();

    await consent.check();
    await expect(submitButton(page)).toBeEnabled();
    await submitButton(page).click();
    await expect(page.getByText("제출되었습니다", { exact: true })).toBeVisible();

    // 확정 판정(안내 바뀜)이 키를 끝낸다 — 다음 제출은 새 키(E39).
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
    const { corpus, actionBodies } = await collector.finish();
    const changed = actionBodies.find((body) => body.includes("termsChanged"));
    expect(changed, "서버가 돌려준 termsChanged 응답").toBeDefined();
    expect(changed).toContain(`"retentionYears":${after}`);
    expect(scanForLeaks(corpus, patterns)).toEqual([]);
  } finally {
    await setSettingValue(SYSTEM_VIEWER, CERT_RETENTION_YEARS, before);
  }
});

test("속도 제한 — 같은 IP 30건 뒤 제출하면 제출 줄 문장 · 1차 살아 있음 · 값 유지 → 창 밖으로 밀고 다시 누르면 같은 멱등 키로 E5", async ({
  page,
}) => {
  const ip = "203.0.113.50";
  const patterns = leakPatternsFor([A.unitValueKrw, B.unitValueKrw, C.unitValueKrw]);
  const { link, eventId } = await createCertEvent({ name: "속도제한E2E", prizes: [A, B, C] });
  if (!link) throw new Error("링크 없음");
  await seedIpSubmissionsForTest(eventId, { ip, count: 30 });
  await page.setExtraHTTPHeaders({ "x-forwarded-for": ip });
  const keys = trackSubmitKeys(page);
  const collector = await collectCertResponses(page);

  await page.goto(link);
  await prizeRow(page, A.name).click();
  await fillIntakeForm(page, { phone: "010-4821-7730" });
  await drawSignature(page);
  await submitButton(page).click();

  await expect(page.getByText(THROTTLED_LINE, { exact: true })).toBeVisible();
  await expect(submitButton(page)).toBeEnabled();
  await expect(page.locator("#name")).toHaveValue("김하늘");
  await expect(page.getByLabel("주민등록번호 뒤 7자리")).toHaveValue("2123458");
  await expect(page.getByText("제출됐는지 확인하지 못했습니다")).toHaveCount(0);

  // 창 15분 밖으로 밀면 다시 받는다 — 같은 키로 보낸다(결과 불명과 같은 처리).
  await ageSubmissionsForTest(eventId, { count: 5, minutes: 16 });
  await submitButton(page).click();
  await expect(page.getByText("제출되었습니다", { exact: true })).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);

  const { corpus, actionBodies } = await collector.finish();
  expect(scannerSelfTest()).toBe(true);
  expect(actionBodies.some((body) => body.includes("throttled")), "서버가 돌려준 throttled 응답").toBe(true);
  expect(scanForLeaks(corpus, patterns)).toEqual([]);
  expect(scanForLeaks(corpus, leakPatternsFor([88_888, 612_345]))).toEqual([]);
});

test("닫힘 — 제출 중 링크가 닫히면 E6-b(담당자가 닫음) · 브라우저 뒤로 가도 적은 값이 없다 · 응답 가액 0건", async ({ page }) => {
  const patterns = leakPatternsFor([A.unitValueKrw, B.unitValueKrw, C.unitValueKrw]);
  const { link, eventId } = await createCertEvent({ name: "닫힘E2E", prizes: [A, B, C] });
  if (!link) throw new Error("링크 없음");
  const collector = await collectCertResponses(page);
  await page.goto(link);
  await prizeRow(page, A.name).click();
  await fillIntakeForm(page, { phone: "010-4821-7730" });
  await drawSignature(page);
  await closeCertEventForTest(eventId);
  await submitButton(page).click();

  const lead = page.getByText("이 링크는 닫혔습니다", { exact: true });
  await expect(lead).toBeFocused();
  await expect(page.getByText(/담당자가 접수를 마쳤습니다/)).toBeVisible();
  await expect(page).toHaveTitle("링크 닫힘 · 기타소득 지급 확인");
  await expect(submitButton(page)).toHaveCount(0);

  await page.goBack();
  await expect(page.getByText("받은 경품을 골라 주세요", { exact: true })).toBeVisible();
  await prizeRow(page, A.name).click();
  await expect(page.locator("#name")).toHaveValue("");
  await expect(page.locator("#phone")).toHaveValue("");
  await expect(page.getByLabel("주민등록번호 뒤 7자리")).toHaveValue("");

  const { corpus, actionBodies } = await collector.finish();
  expect(actionBodies.some((body) => body.includes('"closed"')), "서버가 돌려준 closed 응답").toBe(true);
  expect(scanForLeaks(corpus, patterns)).toEqual([]);
});

test("열리기 전(E8 b · E6-e) 첫 진입 — 부제 · 두 줄 · tel: · 제목 · 포커스, 경품 이름 · 입력 · 1차 없음, 문서에 가액 0건", async ({ page }) => {
  const patterns = leakPatternsFor([A.unitValueKrw, B.unitValueKrw, C.unitValueKrw]);
  const wonOn = tomorrowKst();
  const { link, eventName } = await createCertEvent({ name: "열림전E2E", wonOn, prizes: [A, B, C] });
  if (!link) throw new Error("링크 없음");
  const collector = await collectCertResponses(page);
  await page.goto(link);

  await expect(page.getByRole("heading", { name: "기타소득 지급 확인" })).toBeVisible();
  await expect(page.getByText(`${eventName} · ${wonOn} 당첨`, { exact: true })).toBeVisible();
  const lead = page.getByText("아직 열리지 않았습니다", { exact: true });
  await expect(lead).toBeVisible();
  await expect(lead).toHaveAttribute("tabindex", "-1");
  await expect(lead).toBeFocused();
  await expect(lead).toHaveCSS("font-weight", "700");
  await expect(
    page.getByText(
      new RegExp(`^${wonOn} 00:00부터 제출할 수 있습니다 · 확인이 필요하면 담당자 .* · PLANT8 경영관리 02-123-4567에 전화해 주세요$`),
    ),
  ).toBeVisible();
  await expect(page.locator('a[href="tel:021234567"]')).toHaveCount(1);
  await expect(page).toHaveTitle("열리기 전 · 기타소득 지급 확인");
  await expect(submitButton(page)).toHaveCount(0);
  await expect(page.locator("input")).toHaveCount(0);
  await expect(page.getByRole("listitem")).toHaveCount(0);
  await expect(page.getByText(A.name)).toHaveCount(0);

  const { corpus } = await collector.finish();
  expect(corpus).not.toContain(A.name);
  expect(corpus).not.toContain(B.name);
  expect(scanForLeaks(corpus, patterns)).toEqual([]);
});

test("열리기 전 — 제출 결과로 notYetOpen이 오면 같은 화면 · 적은 값은 버림(뒤로 가도 없음) · 새 멱등 키 · 응답 가액 0건", async ({ page }) => {
  const patterns = leakPatternsFor([A.unitValueKrw, B.unitValueKrw, C.unitValueKrw]);
  const { link, eventId, eventName } = await createCertEvent({ name: "열림전E2E제출", prizes: [A, B, C] });
  if (!link) throw new Error("링크 없음");
  const collector = await collectCertResponses(page);
  await page.goto(link);
  await prizeRow(page, A.name).click();
  await fillIntakeForm(page, { phone: "010-4821-7730" });
  await drawSignature(page);

  const wonOn = tomorrowKst();
  await db.update(certEvents).set({ wonOn }).where(eq(certEvents.id, eventId));
  await submitButton(page).click();

  const lead = page.getByText("아직 열리지 않았습니다", { exact: true });
  await expect(lead).toBeFocused();
  await expect(page.getByText(`${eventName} · ${wonOn} 당첨`, { exact: true })).toBeVisible();
  await expect(page.getByText(new RegExp(`^${wonOn} 00:00부터 제출할 수 있습니다`))).toBeVisible();
  await expect(page).toHaveTitle("열리기 전 · 기타소득 지급 확인");
  await expect(submitButton(page)).toHaveCount(0);

  await page.goBack();
  await expect(page.getByText("받은 경품을 골라 주세요", { exact: true })).toBeVisible();
  await prizeRow(page, A.name).click();
  await expect(page.locator("#name")).toHaveValue("");
  await expect(page.locator("#phone")).toHaveValue("");

  const { corpus, actionBodies } = await collector.finish();
  expect(actionBodies.some((body) => body.includes("notYetOpen")), "서버가 돌려준 notYetOpen 응답").toBe(true);
  expect(scanForLeaks(corpus, patterns)).toEqual([]);
});

test("뒤로 가기 — 브라우저 뒤로는 입력값 전부 버림, 「다른 경품 고르기」는 주소만 버림 · 포커스 = 방금 고른 행", async ({ page }) => {
  const { link } = await createCertEvent({ name: "뒤로E2E", prizes: [A, B, C] });
  if (!link) throw new Error("링크 없음");
  await page.goto(link);

  // 표시 없는 뒤로 — E′2, 값 전부 버림.
  await prizeRow(page, A.name).click();
  await expect(page).toHaveTitle("확인증 입력 · 기타소득 지급 확인");
  await expect(page.locator("#cert-prize")).toBeFocused();
  await page.locator("#name").fill("홍길동");
  await page.goBack();
  await expect(page.getByText("받은 경품을 골라 주세요", { exact: true })).toBeVisible();
  await expect(page).toHaveTitle("경품 고르기 · 기타소득 지급 확인");
  await expect(prizeRow(page, A.name)).toBeFocused();
  await prizeRow(page, A.name).click();
  await expect(page.locator("#name")).toHaveValue("");

  // 「다른 경품 고르기」 — 주소만 버린다.
  await page.getByRole("button", { name: "다른 경품 고르기" }).click();
  await expect(prizeRow(page, A.name)).toBeFocused();
  await prizeRow(page, B.name).click();
  await fillIntakeForm(page, { phone: "010-4821-7730", address: "서울시 마포구 월드컵로 1" });
  await drawSignature(page);
  await page.getByRole("button", { name: "다른 경품 고르기" }).click();
  await expect(prizeRow(page, B.name)).toBeFocused();
  await expect(page.getByText(PRIZE_GONE_NOTICE, { exact: true })).toHaveCount(0);
  await prizeRow(page, C.name).click();
  await expect(page.locator("#name")).toHaveValue("김하늘");
  await expect(page.locator("#phone")).toHaveValue("010-4821-7730");
  await expect(page.locator("#address")).toHaveCount(0);
  await expect(submitButton(page)).toBeEnabled();
  await page.getByRole("button", { name: "다른 경품 고르기" }).click();
  await prizeRow(page, B.name).click();
  await expect(page.locator("#address")).toHaveValue("");
});

test("뒤로 가기 — 경품이 하나인 행사도 E′2 · 행 하나, 브라우저 뒤로는 값 전부 버림(UD-5 a)", async ({ page }) => {
  const { link } = await createCertEvent({ name: "뒤로E2E한경품" });
  if (!link) throw new Error("링크 없음");
  await page.goto(link);
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await prizeRow(page, "갤럭시 탭 S10").click();
  await page.locator("#name").fill("홍길동");
  await page.goBack();
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await prizeRow(page, "갤럭시 탭 S10").click();
  await expect(page.locator("#name")).toHaveValue("");
});

test("320×568 — E′4 문서 scroll-padding-bottom이 sticky 제출 줄 높이 이상(DR-16) · 서명 캔버스 좌우 --s-4 여백 · 가로 넘침 없음(DR-21)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const { link } = await createCertEvent({ name: "폭320E2E", prizes: [A, B, C] });
  if (!link) throw new Error("링크 없음");
  await page.goto(link);
  await prizeRow(page, B.name).click();

  async function measure() {
    return page.evaluate(() => {
      const root = document.documentElement;
      const bar = document.querySelector<HTMLElement>("[class*=stickySubmit]");
      const wrap = document.querySelector<HTMLElement>("[class*=signatureWrap]");
      const probe = document.createElement("span");
      probe.style.cssText = "display: block; width: var(--s-4);";
      document.body.appendChild(probe);
      const s4 = probe.getBoundingClientRect().width;
      probe.remove();
      const wrapStyle = wrap ? getComputedStyle(wrap) : null;
      const wrapBox = wrap?.getBoundingClientRect();
      return {
        padding: parseFloat(getComputedStyle(root).scrollPaddingBottom),
        bar: bar?.getBoundingClientRect().height ?? 0,
        s4,
        marginLeft: wrapStyle ? parseFloat(wrapStyle.marginLeft) : -1,
        marginRight: wrapStyle ? parseFloat(wrapStyle.marginRight) : -1,
        wrapLeft: wrapBox?.left ?? -1,
        wrapRight: wrapBox?.right ?? -1,
        clientWidth: root.clientWidth,
        overflow: root.scrollWidth - root.clientWidth,
      };
    });
  }

  // 막힘 이유가 여러 줄로 접히는 처음 상태.
  const blocked = await measure();
  expect(blocked.bar).toBeGreaterThan(0);
  expect(blocked.padding).toBeGreaterThanOrEqual(blocked.bar);
  expect(blocked.marginLeft).toBe(blocked.s4);
  expect(blocked.marginRight).toBe(blocked.s4);
  expect(blocked.wrapLeft).toBeGreaterThanOrEqual(blocked.s4);
  expect(blocked.wrapRight).toBeLessThanOrEqual(blocked.clientWidth - blocked.s4);
  expect(blocked.overflow).toBeLessThanOrEqual(0);

  // 오류 줄이 선 상태(칸 오류 문장)까지 덮는다.
  await fillIntakeForm(page, { phone: "010-4821-7730", address: "서울시 마포구 월드컵로 1" });
  await drawSignature(page);
  const ready = await measure();
  expect(ready.padding).toBeGreaterThanOrEqual(ready.bar);
});

// 사용자 결정 2026-10-01(PR #88 5931337199) — 낡은 목록 막다른 길. 현장일 때 연 페이지에서 담당자가 전달 방식을 택배로 바꾸면
// (제출 중 경합이 아니다) 주소 칸 없이 낸 제출이 서버 칸 검사에서 invalid(address)가 되어 고칠 칸이 없었다.
// 서버가 prizeGone으로 새 목록을 돌려주고, 클라이언트는 V3와 같은 알림 · 같은 경품(이제 택배)이 목록에 선다.
test("낡은 목록 — 현장일 때 연 페이지에서 택배로 바뀐 뒤 제출하면 같은 알림 · 같은 경품이 택배로 · 다시 고르면 빈 주소 칸", async ({
  page,
}) => {
  const { link, prizeIds } = await createCertEvent({
    name: "낡은목록E2E",
    prizes: [
      { name: "낡은-가", unitValueKrw: 73_519, delivery: "onsite" },
      { name: "낡은-나", unitValueKrw: 91_237, delivery: "onsite" },
    ],
  });
  if (!link) throw new Error("링크 없음");
  const keys = trackSubmitKeys(page);
  const collector = await collectCertResponses(page);
  await page.goto(link);
  await prizeRow(page, "낡은-나").click();
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
  await expect(prizeRow(page, "낡은-나")).toHaveText("낡은-나택배");

  await prizeRow(page, "낡은-나").click();
  await expect(page.locator("#address")).toBeVisible();
  await expect(page.locator("#address")).toHaveValue("");
  await expect(page.locator("#name")).toHaveValue("김하늘");
  await page.locator("#address").fill("서울시 마포구 월드컵로 1");
  await expect(submitButton(page)).toBeEnabled();
  await submitButton(page).click();
  await expect(page.getByText("제출되었습니다", { exact: true })).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).not.toBe(keys[1]);

  const { actionBodies } = await collector.finish();
  expect(actionBodies.some((body) => body.includes("prizeGone")), "서버가 돌려준 prizeGone 응답").toBe(true);
  expect(actionBodies.some((body) => body.includes('"invalid"')), "invalid 응답 없음").toBe(false);
});

// B-M1(독립 DOM 감사) — E6-b 링크 닫힘 첫 진입에서도 결과 블록 첫 줄에 포커스(E6-d · E6-e와 같다).
test("닫힘 E6-b 첫 진입 — 담당자가 닫은 링크 · 기한 지난 링크 모두 결과 블록 첫 줄에 포커스", async ({ page }) => {
  const manual = await createCertEvent({ name: "닫힘첫진입수동", prizes: [A, B, C] });
  if (!manual.link) throw new Error("링크 없음");
  await closeCertEventForTest(manual.eventId);
  await page.goto(manual.link);
  await expect(page.getByText("이 링크는 닫혔습니다", { exact: true })).toBeVisible();
  await expect(page.getByText("담당자가 접수를 마쳤습니다", { exact: false })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("cert-result-lead");

  const expired = await createCertEvent({ name: "닫힘첫진입기한", prizes: [A, B, C] });
  if (!expired.link) throw new Error("링크 없음");
  await db
    .update(certEvents)
    .set({ expiresAt: new Date(Date.now() - 60 * 60 * 1000) })
    .where(eq(certEvents.id, expired.eventId));
  await page.goto(expired.link);
  await expect(page.getByText("이 링크는 닫혔습니다", { exact: true })).toBeVisible();
  await expect(page.getByText(/제출 기한 .* 지났습니다/)).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("cert-result-lead");
});
